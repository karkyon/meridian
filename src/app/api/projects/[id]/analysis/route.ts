// src/app/api/projects/[id]/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import { getGitHubPat, parseRepoFromUrl, fetchGitHubRepoInfo } from "@/lib/github-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

async function requireAdmin(req: NextRequest): Promise<{ error: NextResponse } | { ok: true }> {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  const user = session.user as { role: string };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { ok: true };
}

// ----------------------------------------------------------------
// GET: 最新の分析結果を取得
// ----------------------------------------------------------------
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const latest = await prisma.projectAnalysis.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
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
    // プロジェクト情報を一括取得
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

    // Claude APIキー確認
    let apiKey: string;
    try {
      apiKey = await getClaudeApiKey();
    } catch {
      return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
    }

    // 分析セッションをDB作成（pending）
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

    // SSEストリーミングレスポンス
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          // ── Step 1: GitHub情報収集 ──────────────────────────
          send("progress", { step: 1, total: 4, message: "GitHubリポジトリを調査中..." });

          let githubContext = "";
          let latestCommitSha: string | undefined;

          if (project.repositoryUrl) {
            try {
              const pat = await getGitHubPat();
              const parsed = parseRepoFromUrl(project.repositoryUrl);
              if (parsed) {
                const info = await fetchGitHubRepoInfo(parsed.owner, parsed.repo, pat);
                latestCommitSha = info.recentCommits[0]?.sha;

                // ファイルツリー取得（最大400件）
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

                githubContext = `
## GitHubリポジトリ
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

          // ── Step 2: ドキュメント収集 ───────────────────────
          send("progress", { step: 2, total: 4, message: "ドキュメントを読み込み中..." });

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
            .map((t: { category: string; name: string; version: string | null }) => `- [${t.category}] ${t.name}${t.version ? ` v${t.version}` : ""}`)
            .join("\n");

          const wbsContext = project.wbsPhases.map((phase: { name: string; tasks: Array<{ status: string; title: string }> }) => {
            const tasks = phase.tasks.map(
              (t: { status: string; title: string }) => `  - [${t.status}] ${t.title}`
            ).join("\n");
            return `### ${phase.name}\n${tasks || "  （タスクなし）"}`;
          }).join("\n");

          const attachmentsContext = project.attachments
            .filter((a: { extractedText: string | null }) => a.extractedText)
            .map((a: { originalName: string; extractedText: string | null }) => `### 添付: ${a.originalName}\n${a.extractedText!.slice(0, 800)}`)
            .join("\n\n");

          // ── Step 3: Claude API分析実行 ─────────────────────
          send("progress", { step: 3, total: 4, message: "AIが総合分析を実行中（30〜60秒）..." });

          const prompt = `あなたはシニアソフトウェアアーキテクトです。
以下のプロジェクト情報を総合的に分析し、現状評価・課題抽出・改善提案を行ってください。

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

## 分析指示

上記の情報を総合的に分析し、以下のJSON形式で回答してください。
JSONのみ出力してください（前置き・後書き・コードブロック記号不要）。

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
  ],
  "suggested_tasks": [
    {
      "title": "タスク名（50文字以内）",
      "description": "タスクの詳細",
      "priority": "high|mid|low",
      "phase_name": "配置推奨フェーズ名",
      "estimated_hours": 数値（小数点1桁まで）,
      "issue_ref": "関連する課題タイトル（任意）"
    }
  ]
}

## 評価基準
- overall_score: ドキュメント整備度・コード品質・技術スタック健全性・テスト状況・セキュリティを総合評価
- issuesは重要なもの5〜15件程度
- suggested_tasksはissuesから派生する具体的なタスク5〜20件程度
- GitHubコードがある場合は必ずコードとドキュメントの整合性を検査
- ドキュメントがない項目は「未作成」として課題に挙げる`;

          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });

          const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";

          // ── 生レスポンスをDBに即時保存（金を払って得た情報を完全保持）──
          await prisma.projectAnalysis.update({
            where: { id: analysis.id },
            data: { rawAiResponse: rawText },
          });

          // ```json...``` ブロック優先、なければ{...}を抽出（テスト済み: scripts/test-analysis-parse.js）
          const codeBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/);
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          const cleanText = codeBlockMatch
            ? codeBlockMatch[1].trim()
            : jsonMatch
            ? jsonMatch[0]
            : rawText.trim();

          let parsed: {
            overall_score?: number;
            summary?: string;
            strengths?: string[];
            immediate_actions?: string[];
            issues?: Array<{
              severity: string;
              category: string;
              title: string;
              description: string;
              location?: string;
              suggestion?: string;
            }>;
            suggested_tasks?: Array<{
              title: string;
              description?: string;
              priority: string;
              phase_name: string;
              estimated_hours?: number;
              issue_ref?: string;
            }>;
          };

          try {
            parsed = JSON.parse(cleanText);
          } catch {
            throw new Error(`AI_PARSE_ERROR: JSONパース失敗。raw_ai_responseに生レスポンス保存済み。先頭200字: ${cleanText.slice(0, 200)}`);
          }

          // ── Step 4: DB保存 ─────────────────────────────────
          send("progress", { step: 4, total: 4, message: "分析結果を保存中..." });

          const issueData = (parsed.issues ?? []).map((issue) => ({
            analysisId: analysis.id,
            severity: (issue.severity as "critical" | "high" | "medium" | "low") ?? "medium",
            category: (issue.category as
              | "code_doc_mismatch"
              | "tech_stack_mismatch"
              | "missing_implementation"
              | "db_inconsistency"
              | "security_concern"
              | "tech_debt"
              | "missing_test"
              | "other") ?? "other",
            title: issue.title ?? "（無題）",
            description: issue.description ?? "",
            location: issue.location ?? null,
            suggestion: issue.suggestion ?? null,
          }));

          const taskData = (parsed.suggested_tasks ?? []).map((task) => ({
            analysisId: analysis.id,
            title: task.title ?? "（無題）",
            description: task.description ?? null,
            priority: (task.priority as "high" | "mid" | "low") ?? "mid",
            phaseName: task.phase_name ?? "未分類",
            estimatedHours: task.estimated_hours ?? null,
            issueRef: task.issue_ref ?? null,
          }));

          // トランザクションで一括保存
          await prisma.$transaction([
            prisma.analysisIssue.createMany({ data: issueData }),
            prisma.analysisSuggestedTask.createMany({ data: taskData }),
            prisma.projectAnalysis.update({
              where: { id: analysis.id },
              data: {
                status: "completed",
                overallScore: parsed.overall_score ?? null,
                summary: parsed.summary ?? null,
                strengths: parsed.strengths ?? [],
                immediateActions: parsed.immediate_actions ?? [],
                issueCount: issueData.length,
                criticalCount: issueData.filter((i) => i.severity === "critical").length,
                suggestedTaskCount: taskData.length,
                githubCommitSha: latestCommitSha ?? null,
                completedAt: new Date(),
              },
            }),
          ]);

          // 完了イベント送信（フル結果）
          const finalResult = await prisma.projectAnalysis.findUnique({
            where: { id: analysis.id },
            include: {
              issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
              suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
            },
          });

          send("complete", { analysis: finalResult });

        } catch (err) {
          const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

          // 失敗ステータスに更新
          await prisma.projectAnalysis.update({
            where: { id: analysis.id },
            data: {
              status: "failed",
              errorMessage: message,
              completedAt: new Date(),
            },
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