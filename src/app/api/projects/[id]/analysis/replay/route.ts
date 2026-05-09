// src/app/api/projects/[id]/analysis/replay/route.ts
// RAWリプレイAPI: 保存済みprompt_logのRAWデータを使ってAPI不使用で再テスト
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type Params = { params: { id: string } };

type PromptLogEntry = {
  step: string;
  prompt: string;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
};

async function requireAdmin(req: NextRequest): Promise<{ error: NextResponse } | { ok: true }> {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  const user = session.user as { role: string };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { ok: true };
}

// { } の深さ追跡による正確なJSON抽出
function extractJson(text: string): string {
  // ```json ... ``` ブロック除去
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("JSON開始位置({)が見つかりません");
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  throw new Error(`JSONが不完全です（閉じ括弧不足。取得文字数: ${cleaned.length}）`);
}

// ----------------------------------------------------------------
// GET: 指定analysisIdのprompt_logを取得（リプレイ用データ確認）
// ----------------------------------------------------------------
export async function GET(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  const analysisId = url.searchParams.get("analysisId");
  if (!analysisId) return NextResponse.json({ error: "analysisId required" }, { status: 400 });

  const analysis = await prisma.projectAnalysis.findFirst({
    where: { id: analysisId, projectId: params.id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      executionMode: true,
      promptLog: true,
      rawAiResponse: true,
      overallScore: true,
      issueCount: true,
      suggestedTaskCount: true,
      featureCount: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
    },
  } as Parameters<typeof prisma.projectAnalysis.findFirst>[0]);

  if (!analysis) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // prompt_logがない場合はraw_ai_responseから復元を試みる
  let promptLog = analysis.promptLog as PromptLogEntry[] | null;
  if (!promptLog || (Array.isArray(promptLog) && promptLog.length === 0)) {
    // raw_ai_responseからRAWブロックを分解して疑似prompt_logを生成
    const rawAll = (analysis as { rawAiResponse?: string | null }).rawAiResponse;
    if (rawAll) {
      const blocks = rawAll.split(/\n---(?:RAW2|RAW_FEAT\d+)---\n/);
      const stepNames = ["1_issues", "2_tasks", ...blocks.slice(2).map((_, i) => `3_features_loop${i + 1}`)];
      promptLog = blocks.map((raw, i) => ({
        step: stepNames[i] ?? `step_${i + 1}`,
        prompt: "（保存なし：このレコードはprompt_log未保存の旧データです）",
        rawResponse: raw,
        inputTokens: 0,
        outputTokens: 0,
      }));
    }
  }

  return NextResponse.json({
    analysisId: analysis.id,
    status: analysis.status,
    createdAt: analysis.createdAt,
    executionMode: (analysis as { executionMode?: string }).executionMode,
    overallScore: analysis.overallScore,
    issueCount: analysis.issueCount,
    suggestedTaskCount: analysis.suggestedTaskCount,
    featureCount: analysis.featureCount,
    inputTokens: (analysis as { inputTokens?: number | null }).inputTokens,
    outputTokens: (analysis as { outputTokens?: number | null }).outputTokens,
    estimatedCostUsd: (analysis as { estimatedCostUsd?: unknown }).estimatedCostUsd,
    promptLog,
    hasPromptLog: !!promptLog && promptLog.length > 0,
  });
}

// ----------------------------------------------------------------
// POST: RAWリプレイ実行（Claude API不使用・SSEストリーミング）
// body: { analysisId: string, fromStep?: number }
//   fromStep: 1=全STEP, 2=STEP2以降（tasksから）, 3=STEP3以降（featuresから）
// ----------------------------------------------------------------
export async function POST(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  let body: { analysisId: string; fromStep?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const { analysisId, fromStep = 1 } = body;
  if (!analysisId) return NextResponse.json({ error: "analysisId required" }, { status: 400 });

  // 元の分析レコード取得
  const sourceAnalysis = await prisma.projectAnalysis.findFirst({
    where: { id: analysisId, projectId: params.id },
  } as Parameters<typeof prisma.projectAnalysis.findFirst>[0]);

  if (!sourceAnalysis) return NextResponse.json({ error: "SOURCE_ANALYSIS_NOT_FOUND" }, { status: 404 });

  // prompt_log取得
  let promptLog = sourceAnalysis.promptLog as PromptLogEntry[] | null;

  // prompt_logがない場合はraw_ai_responseから復元
  if (!promptLog || (Array.isArray(promptLog) && promptLog.length === 0)) {
    const rawAll = (sourceAnalysis as { rawAiResponse?: string | null }).rawAiResponse;
    if (!rawAll) return NextResponse.json({ error: "NO_RAW_DATA: prompt_logもraw_ai_responseも存在しません" }, { status: 400 });

    const blocks = rawAll.split(/\n---(?:RAW2|RAW_FEAT\d+)---\n/);
    const stepNames = ["1_issues", "2_tasks", ...blocks.slice(2).map((_, i) => `3_features_loop${i + 1}`)];
    promptLog = blocks.map((raw, i) => ({
      step: stepNames[i] ?? `step_${i + 1}`,
      prompt: "（旧データのため未保存）",
      rawResponse: raw,
      inputTokens: 0,
      outputTokens: 0,
    }));
  }

  if (!promptLog || promptLog.length === 0) {
    return NextResponse.json({ error: "NO_PROMPT_LOG" }, { status: 400 });
  }

  // リプレイ用の新規分析レコード作成
  const replayAnalysis = await prisma.projectAnalysis.create({
    data: {
      projectId: params.id,
      status: "running",
      startedAt: new Date(),
      techStackCount: sourceAnalysis.techStackCount,
      docVersions: sourceAnalysis.docVersions,
      githubCommitSha: sourceAnalysis.githubCommitSha,
      // @ts-ignore
      executionMode: "manual",
      // @ts-ignore
      modelUsed: `replay_of_${analysisId.slice(0, 8)}`,
      // @ts-ignore
      createdBy: userId,
      // @ts-ignore
      promptLog: promptLog,
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("progress", {
          step: 0,
          total: promptLog!.length + 1,
          message: `RAWリプレイ開始（元分析ID: ${analysisId.slice(0, 8)}... / ${promptLog!.length}STEPを再処理）`,
        });

        // ── 各STEPのRAWを順番にパース ────────────────────────
        let parsed1: {
          overall_score?: number;
          summary?: string;
          strengths?: string[];
          immediate_actions?: string[];
          issues?: Array<{
            severity: string; category: string; title: string;
            description: string; location?: string; suggestion?: string;
          }>;
        } = {};

        let parsed2: {
          suggested_tasks?: Array<{
            title: string; description?: string; priority: string;
            phase_name: string; estimated_hours?: number; issue_ref?: string;
          }>;
        } = {};

        const allFeatures: Array<{
          name: string; description: string; status: string; source: string;
          source_note?: string; progress_pct?: number; location?: string; spec_ref?: string;
        }> = [];

        const stepErrors: Array<{ step: string; error: string; raw: string }> = [];

        for (let i = 0; i < promptLog!.length; i++) {
          const entry = promptLog![i];
          const stepNum = i + 1;

          // fromStep指定より前のSTEPはスキップ（ただしパースは必要）
          const isSkipped = stepNum < fromStep;

          send("progress", {
            step: stepNum,
            total: promptLog!.length + 1,
            message: `STEP ${stepNum}/${promptLog!.length}: ${entry.step} を${isSkipped ? "スキップ（元データ使用）" : "パース中"}...`,
            prompt: entry.prompt,
            rawResponse: entry.rawResponse,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
          });

          // パース処理
          try {
            const jsonStr = extractJson(entry.rawResponse);
            const parsed = JSON.parse(jsonStr);

            if (entry.step.includes("issues") || entry.step === "1_issues") {
              parsed1 = parsed;
              console.log(`[REPLAY] STEP${stepNum}(issues) パース成功: issues=${parsed.issues?.length ?? 0}件`);
            } else if (entry.step.includes("tasks") || entry.step === "2_tasks") {
              parsed2 = parsed;
              console.log(`[REPLAY] STEP${stepNum}(tasks) パース成功: tasks=${parsed.suggested_tasks?.length ?? 0}件`);
            } else if (entry.step.includes("features")) {
              const features = parsed.features ?? [];
              const newFeatures = features.filter(
                (f: { name: string }) => !allFeatures.some(e => e.name === f.name)
              );
              allFeatures.push(...newFeatures);
              console.log(`[REPLAY] STEP${stepNum}(features) パース成功: 今回${newFeatures.length}件 / 累計${allFeatures.length}件 / has_more:${parsed.has_more}`);
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[REPLAY] STEP${stepNum}(${entry.step}) パース失敗: ${errMsg}`);
            stepErrors.push({ step: entry.step, error: errMsg, raw: entry.rawResponse.slice(0, 200) });
            send("progress", {
              step: stepNum,
              total: promptLog!.length + 1,
              message: `⚠ STEP ${stepNum}: パースエラー（${errMsg.slice(0, 80)}）`,
              rawResponse: entry.rawResponse,
            });
          }
        }

        // ── DB保存 ────────────────────────────────────────────
        send("progress", {
          step: promptLog!.length + 1,
          total: promptLog!.length + 1,
          message: "リプレイ結果をDBに保存中...",
        });

        const issueData = (parsed1.issues ?? []).map((issue) => ({
          analysisId: replayAnalysis.id,
          severity: (issue.severity as "critical" | "high" | "medium" | "low") ?? "medium",
          category: (issue.category as
            | "code_doc_mismatch" | "tech_stack_mismatch" | "missing_implementation"
            | "db_inconsistency" | "security_concern" | "tech_debt" | "missing_test" | "other") ?? "other",
          title: issue.title ?? "（無題）",
          description: issue.description ?? "",
          location: issue.location ?? null,
          suggestion: issue.suggestion ?? null,
        }));

        const taskData = (parsed2.suggested_tasks ?? []).map((task) => ({
          analysisId: replayAnalysis.id,
          title: task.title ?? "（無題）",
          description: task.description ?? null,
          priority: (task.priority as "high" | "mid" | "low") ?? "mid",
          phaseName: task.phase_name ?? "未分類",
          estimatedHours: task.estimated_hours ?? null,
          issueRef: task.issue_ref ?? null,
        }));

        const featureData = allFeatures.map((f) => ({
          analysisId: replayAnalysis.id,
          name: f.name ?? "（無題）",
          description: f.description ?? "",
          status: (f.status as "completed" | "partial" | "not_started" | "unknown") ?? "unknown",
          source: (f.source as "spec" | "code" | "both") ?? "both",
          sourceNote: f.source_note ?? null,
          progressPct: Math.min(100, Math.max(0, f.progress_pct ?? 0)),
          location: f.location ?? null,
          specRef: f.spec_ref ?? null,
        }));

        // リプレイ元のRAWをそのまま保存
        const replayRawResponse = (sourceAnalysis as { rawAiResponse?: string | null }).rawAiResponse ?? "";

        const updateData: Record<string, unknown> = {
          status: stepErrors.length === 0 ? "completed" : "failed",
          overallScore: parsed1.overall_score ?? null,
          summary: parsed1.summary ?? null,
          strengths: parsed1.strengths ?? [],
          immediateActions: parsed1.immediate_actions ?? [],
          issueCount: issueData.length,
          criticalCount: issueData.filter(i => i.severity === "critical").length,
          suggestedTaskCount: taskData.length,
          featureCount: featureData.length,
          rawAiResponse: replayRawResponse,
          completedAt: new Date(),
          errorMessage: stepErrors.length > 0
            ? `リプレイ中に${stepErrors.length}件のパースエラー: ${stepErrors.map(e => e.step).join(", ")}`
            : null,
        };

        await prisma.$transaction([
          prisma.analysisIssue.createMany({ data: issueData }),
          prisma.analysisSuggestedTask.createMany({ data: taskData }),
          prisma.analysisFeature.createMany({ data: featureData }),
          // @ts-ignore
          prisma.projectAnalysis.update({
            where: { id: replayAnalysis.id },
            data: updateData,
          }),
        ]);

        console.log(`[REPLAY] 完了 | issues:${issueData.length} tasks:${taskData.length} features:${featureData.length} errors:${stepErrors.length}`);

        const finalResult = await prisma.projectAnalysis.findUnique({
          where: { id: replayAnalysis.id },
          include: {
            issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
            suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
            features: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
          },
        });

        send("complete", {
          analysis: finalResult,
          replayMeta: {
            sourceAnalysisId: analysisId,
            totalSteps: promptLog!.length,
            stepErrors,
            fromStep,
          },
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        console.error("[REPLAY] エラー:", message);
        await prisma.projectAnalysis.update({
          where: { id: replayAnalysis.id },
          data: { status: "failed", errorMessage: message },
        }).catch(() => null);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}