// src/app/api/projects/[id]/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import { getGitHubPat, parseRepoFromUrl, fetchGitHubRepoInfo } from "@/lib/github-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

type FeatureItem = {
  name: string;
  description: string;
  status: string;
  source: string;
  source_note?: string;
  progress_pct?: number;
  location?: string;
  spec_ref?: string;
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
  const start = text.indexOf("{");
  if (start === -1) throw new Error("JSON開始位置({)が見つかりません");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`JSONが不完全です（閉じ括弧不足。取得文字数: ${text.length}）`);
}

// ----------------------------------------------------------------
// GET: 最新の分析結果を取得
// ----------------------------------------------------------------
export async function GET(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const latest = await prisma.projectAnalysis.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
      features: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
    },
  });
  return NextResponse.json(latest ?? null);
}

// ----------------------------------------------------------------
// POST: システム総合分析を実行（SSEストリーミング）
// ----------------------------------------------------------------
export async function POST(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const project = await prisma.project.findUnique({
    where: { id: params.id, archivedAt: null },
    include: {
      documents: {
        select: { docType: true, content: true, completeness: true, version: true },
      },
      techStacks: { orderBy: { sortOrder: "asc" } },
      wbsPhases: {
        include: { tasks: true },
        orderBy: { sortOrder: "asc" },
      },
      attachments: {
        select: { originalName: true, fileType: true, extractedText: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = await getClaudeApiKey();
  } catch {
    return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
  }

  const analysis = await prisma.projectAnalysis.create({
    data: {
      projectId: params.id,
      status: "running",
      startedAt: new Date(),
      techStackCount: project.techStacks.length,
      docVersions: Object.fromEntries(
        project.documents.map((d) => [d.docType, d.version])
      ),
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
        // ── Step 1: GitHub情報収集 ─────────────────────────────
        send("progress", { step: 1, total: 5, message: "GitHubリポジトリを調査中..." });

        let githubContext = "";
        let latestCommitSha: string | undefined;

        if (project.repositoryUrl) {
          try {
            const pat = await getGitHubPat();
            const parsed = parseRepoFromUrl(project.repositoryUrl);
            if (parsed) {
              const info = await fetchGitHubRepoInfo(parsed.owner, parsed.repo, pat);
              latestCommitSha = info.recentCommits[0]?.sha;

              const treeRes = await fetch(
                `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${info.defaultBranch}?recursive=1`,
                {
                  headers: {
                    Authorization: `Bearer ${pat}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                  },
                }
              );

              let fileTree = "（取得失敗）";
              if (treeRes.ok) {
                const treeData = await treeRes.json();
                const files = (treeData.tree ?? [])
                  .filter((f: { type: string }) => f.type === "blob")
                  .map((f: { path: string }) => f.path)
                  .slice(0, 400);
                fileTree = files.join("\n");
              }

              const commitMsgs = info.recentCommits
                .slice(0, 20)
                .map((c) => `- ${c.sha.slice(0, 7)} (${c.date.slice(0, 10)}): ${c.message}`)
                .join("\n");

              githubContext = `## GitHubリポジトリ
- URL: ${project.repositoryUrl}
- 最終push: ${info.lastPushedAt}（${info.daysSinceLastPush}日前）
- 総コミット数: ${info.commitCount}
- アクティビティ: ${info.activityStatus}

## 直近20コミット
${commitMsgs}

## ファイルツリー（最大400件）
\`\`\`
${fileTree}
\`\`\``;
            }
          } catch {
            githubContext = "※ GitHub情報取得失敗（PATを確認してください）";
          }
        } else {
          githubContext = "※ GitHubリポジトリ未設定";
        }

        // ── Step 2: ドキュメント収集 ──────────────────────────
        send("progress", { step: 2, total: 5, message: "ドキュメントを読み込み中..." });

        const DOC_LABELS: Record<string, string> = {
          planning: "企画書",
          requirements: "要件定義書",
          external_spec: "外部仕様設計書",
          db_spec: "DB仕様設計書",
          api_spec: "API詳細設計書",
        };

        const docsContext = project.documents
          .filter((d) => d.content && d.content.length > 0)
          .map((d: { docType: string; content: string | null; completeness: number; version: number }) => {
            const label = DOC_LABELS[d.docType] ?? d.docType;
            const excerpt = d.content!.slice(0, 1500);
            return `### ${label}（完成度: ${d.completeness}%）\n${excerpt}${d.content!.length > 1500 ? "\n...（以下省略）" : ""}`;
          })
          .join("\n\n");

        const techStackContext = project.techStacks
          .map((t: { category: string; name: string; version: string | null }) =>
            `- [${t.category}] ${t.name}${t.version ? ` v${t.version}` : ""}`
          )
          .join("\n");

        const wbsContext = project.wbsPhases
          .map((phase: { name: string; tasks: Array<{ status: string; title: string }> }) => {
            const tasks = phase.tasks
              .map((t: { status: string; title: string }) => `  - [${t.status}] ${t.title}`)
              .join("\n");
            return `### ${phase.name}\n${tasks || "  （タスクなし）"}`;
          })
          .join("\n");

        const attachmentsContext = project.attachments
          .filter((a: { extractedText: string | null }) => a.extractedText)
          .map(
            (a: { originalName: string; extractedText: string | null }) =>
              `### 添付: ${a.originalName}\n${a.extractedText!.slice(0, 800)}`
          )
          .join("\n\n");

        const client = new Anthropic({ apiKey });

        // ── Step 3: 第1回API - 総評・課題 ─────────────────────
        send("progress", { step: 3, total: 5, message: "AI分析 (1/3): 総評・課題を生成中..." });

        const prompt1 = `あなたはシニアソフトウェアアーキテクトです。
以下のプロジェクト情報を総合的に分析し、現状評価・課題抽出を行ってください。

# プロジェクト基本情報
- 名称: ${project.name}
- 説明: ${project.description ?? "（未設定）"}
- ステータス: ${project.status}
- カテゴリ: ${project.category ?? "（未設定）"}

# 技術スタック
${techStackContext || "（未登録）"}

# GitHubコード情報
${githubContext}

# ドキュメント
${docsContext || "（ドキュメント未作成）"}

# WBS・タスク状況
${wbsContext || "（WBS未作成）"}

${attachmentsContext ? `# 添付資料\n${attachmentsContext}` : ""}

---

以下のJSON形式のみ出力してください（前置き・後書き・コードブロック記号は一切不要）。

{
  "overall_score": 0〜100の整数（プロジェクトの総合健全性スコア）,
  "summary": "プロジェクトの総評（Markdown形式・300〜500文字）",
  "strengths": ["強み1", "強み2", "強み3"],
  "immediate_actions": ["今すぐやるべきこと1", "今すぐやるべきこと2", "今すぐやるべきこと3"],
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "code_doc_mismatch|tech_stack_mismatch|missing_implementation|db_inconsistency|security_concern|tech_debt|missing_test|other",
      "title": "課題タイトル（50文字以内）",
      "description": "課題の詳細説明（100〜200文字）",
      "location": "該当箇所（ファイル名・ドキュメント名・機能名など）",
      "suggestion": "推奨対処法（100文字以内）"
    }
  ]
}

評価基準:
- overall_score: ドキュメント整備度・コード品質・技術スタック健全性・テスト状況・セキュリティを総合評価
- issuesは重要なもの5〜10件
- GitHubコードがある場合は必ずコードとドキュメントの整合性を検査`;

        const res1 = await client.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt1 }],
        });
        const raw1 = res1.content[0].type === "text" ? res1.content[0].text : "{}";

        await prisma.projectAnalysis.update({
          where: { id: analysis.id },
          data: { rawAiResponse: raw1 },
        });

        let parsed1: {
          overall_score?: number;
          summary?: string;
          strengths?: string[];
          immediate_actions?: string[];
          issues?: Array<{
            severity: string; category: string; title: string;
            description: string; location?: string; suggestion?: string;
          }>;
        };
        try {
          parsed1 = JSON.parse(extractJson(raw1));
        } catch (e) {
          throw new Error(`AI_PARSE_ERROR(1回目): ${e instanceof Error ? e.message : ""} | raw先頭200字: ${raw1.slice(0, 200)}`);
        }

        // ── Step 4: 第2回API - 提案タスク ─────────────────────
        send("progress", { step: 4, total: 5, message: "AI分析 (2/3): 改善タスクを生成中..." });

        const issuesSummary = (parsed1.issues ?? [])
          .map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.title}`)
          .join("\n");

        const prompt2 = `プロジェクト「${project.name}」に対して以下の課題が特定されました。
各課題を解決するための具体的なWBSタスクを生成してください。

# 特定された課題
${issuesSummary || "（課題なし）"}

# プロジェクト技術スタック
${techStackContext || "（未登録）"}

以下のJSON形式のみ出力してください（前置き・後書き・コードブロック記号は一切不要）。

{
  "suggested_tasks": [
    {
      "title": "タスク名（50文字以内）",
      "description": "タスクの詳細",
      "priority": "high|mid|low",
      "phase_name": "配置推奨フェーズ名",
      "estimated_hours": 数値（小数点1桁まで）,
      "issue_ref": "関連する課題タイトル"
    }
  ]
}

- suggested_tasksは5〜10件`;

        const res2 = await client.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt2 }],
        });
        const raw2 = res2.content[0].type === "text" ? res2.content[0].text : "{}";

        await prisma.projectAnalysis.update({
          where: { id: analysis.id },
          data: { rawAiResponse: raw1 + "\n\n---RAW2---\n\n" + raw2 },
        });

        let parsed2: {
          suggested_tasks?: Array<{
            title: string; description?: string; priority: string;
            phase_name: string; estimated_hours?: number; issue_ref?: string;
          }>;
        };
        try {
          parsed2 = JSON.parse(extractJson(raw2));
        } catch (e) {
          throw new Error(`AI_PARSE_ERROR(2回目): ${e instanceof Error ? e.message : ""} | raw先頭200字: ${raw2.slice(0, 200)}`);
        }

        // ── Step 5: 機能実装状況（8件×動的ループ・件数無制限） ─
        // has_more=falseまたは新規取得0件になるまでループ継続
        // MAX_FEATURE_LOOPS=5で最大40件まで対応（拡張は定数変更のみ）
        const MAX_FEATURE_LOOPS = 5;
        const allFeatures: FeatureItem[] = [];
        const rawFeatureParts: string[] = [];

        for (let loop = 1; loop <= MAX_FEATURE_LOOPS; loop++) {
          const alreadyFetched = allFeatures.map((f) => f.name);

          send("progress", {
            step: 5,
            total: 5,
            message: `AI分析 (3/3): 機能実装状況を分析中（${loop}回目 / 取得済み${allFeatures.length}件）...`,
          });

          const isFirst = loop === 1;
          const featurePrompt = `あなたはシニアソフトウェアアーキテクトです。
以下のプロジェクト情報から「機能仕様一覧」を抽出し、各機能の実装状況を評価してください。

# プロジェクト: ${project.name}

# 仕様書・ドキュメント
${docsContext || "（ドキュメント未作成）"}

# GitHubコード情報
${githubContext}

# WBS・タスク状況
${wbsContext || "（WBS未作成）"}

---

## 判定基準
- **source**: "spec"=仕様書のみ / "code"=コードのみ / "both"=両方に存在
- **status**: "completed"=完全実装済み / "partial"=一部実装済み / "not_started"=未実装 / "unknown"=判定不能
- **source_note**: 仕様書とコードで乖離がある場合、どちらが最新・正しいかを根拠とともに記述

以下のJSON形式のみ出力してください（前置き・後書き・コードブロック記号は一切不要）。

{
  "features": [
    {
      "name": "機能名（40文字以内）",
      "description": "機能の概要説明（80〜150文字）",
      "status": "completed|partial|not_started|unknown",
      "source": "spec|code|both",
      "source_note": "判定根拠・どちらが正かの説明（100文字以内）",
      "progress_pct": 0〜100の整数（実装進捗率）,
      "location": "実装ファイル・APIルート・コンポーネント名など",
      "spec_ref": "仕様書の参照箇所（ドキュメント名・セクション名など）"
    }
  ],
  "has_more": true または false
}

${isFirst
  ? `- 重要度が高い機能から順に8件を出力してください
- 仕様書とコードが一致している機能も含める
- 乖離がある機能は必ず含め、source_noteに根拠を明記
- まだ出力していない機能が残っている場合は "has_more": true、全て出力完了なら "has_more": false`
  : `- 以下の出力済み機能は絶対に含めないこと:
${alreadyFetched.map((n) => `  - ${n}`).join("\n")}
- 上記以外の未出力機能を8件出力してください
- 仕様書にあるがコード未実装の機能・コードにあるが仕様書未記載の機能を優先
- まだ未出力の機能が残っていれば "has_more": true、全て出力完了なら "has_more": false`
}`;

          const resF = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            messages: [{ role: "user", content: featurePrompt }],
          });
          const rawF = resF.content[0].type === "text" ? resF.content[0].text : "{}";
          rawFeatureParts.push(rawF);

          // 各ループの生レスポンスをDBに中間保存
          await prisma.projectAnalysis.update({
            where: { id: analysis.id },
            data: {
              rawAiResponse:
                raw1 + "\n\n---RAW2---\n\n" + raw2 +
                rawFeatureParts.map((r, i) => `\n\n---RAW_FEAT${i + 1}---\n\n${r}`).join(""),
            },
          });

          let parsedF: { features?: FeatureItem[]; has_more?: boolean };
          try {
            parsedF = JSON.parse(extractJson(rawF));
          } catch (e) {
            throw new Error(`AI_PARSE_ERROR(機能${loop}回目): ${e instanceof Error ? e.message : ""} | raw先頭200字: ${rawF.slice(0, 200)}`);
          }

          // 重複除去して追加
          const newFeatures = (parsedF.features ?? []).filter(
            (f) => !allFeatures.some((existing) => existing.name === f.name)
          );
          allFeatures.push(...newFeatures);

          // has_more=false または新規取得0件でループ終了
          if (!parsedF.has_more || newFeatures.length === 0) break;
        }

        // ── DB保存 ────────────────────────────────────────────
        send("progress", { step: 5, total: 5, message: "分析結果を保存中..." });

        const issueData = (parsed1.issues ?? []).map((issue) => ({
          analysisId: analysis.id,
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
          analysisId: analysis.id,
          title: task.title ?? "（無題）",
          description: task.description ?? null,
          priority: (task.priority as "high" | "mid" | "low") ?? "mid",
          phaseName: task.phase_name ?? "未分類",
          estimatedHours: task.estimated_hours ?? null,
          issueRef: task.issue_ref ?? null,
        }));

        const featureData = allFeatures.map((f) => ({
          analysisId: analysis.id,
          name: f.name ?? "（無題）",
          description: f.description ?? "",
          status: (f.status as "completed" | "partial" | "not_started" | "unknown") ?? "unknown",
          source: (f.source as "spec" | "code" | "both") ?? "both",
          sourceNote: f.source_note ?? null,
          progressPct: Math.min(100, Math.max(0, f.progress_pct ?? 0)),
          location: f.location ?? null,
          specRef: f.spec_ref ?? null,
        }));

        await prisma.$transaction([
          prisma.analysisIssue.createMany({ data: issueData }),
          prisma.analysisSuggestedTask.createMany({ data: taskData }),
          prisma.analysisFeature.createMany({ data: featureData }),
          prisma.projectAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: "completed",
              overallScore: parsed1.overall_score ?? null,
              summary: parsed1.summary ?? null,
              strengths: parsed1.strengths ?? [],
              immediateActions: parsed1.immediate_actions ?? [],
              issueCount: issueData.length,
              criticalCount: issueData.filter((i) => i.severity === "critical").length,
              suggestedTaskCount: taskData.length,
              featureCount: featureData.length,
              githubCommitSha: latestCommitSha ?? null,
              completedAt: new Date(),
            },
          }),
        ]);

        const finalResult = await prisma.projectAnalysis.findUnique({
          where: { id: analysis.id },
          include: {
            issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
            suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
            features: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
          },
        });

        send("complete", { analysis: finalResult });

      } catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        await prisma.projectAnalysis.update({
          where: { id: analysis.id },
          data: { status: "failed", errorMessage: message, completedAt: new Date() },
        }).catch(() => {});
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ----------------------------------------------------------------
// PATCH: 課題を解決済みにマーク
// ----------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const { issueId, resolved } = body;

  if (!issueId) {
    return NextResponse.json({ error: "issueId required" }, { status: 400 });
  }

  const issue = await prisma.analysisIssue.update({
    where: { id: issueId },
    data: {
      resolved: resolved ?? true,
      resolvedAt: resolved !== false ? new Date() : null,
    },
  });

  return NextResponse.json(issue);
}
