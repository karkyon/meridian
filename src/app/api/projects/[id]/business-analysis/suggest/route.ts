// src/app/api/projects/[id]/business-analysis/suggest/route.ts
//
// 事業性分析のAI提案。以下の理由でSSEストリーミング＋自動保存に変更している:
//   1. 進捗が見えないと「固まっているのか分からない」問題があった
//   2. 生成結果をクライアント側の状態にしか保持していなかったため、
//      生成完了前にタブ移動すると結果が失われる問題があった
//      → Claude応答を受け取った時点でサーバー側が即座にDBへ保存するよう変更
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { logApiUsage } from "@/lib/usage-log";
import { BUSINESS_CATEGORIES, calcOverallScore } from "@/lib/business-analysis-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

const MODEL = "claude-sonnet-4-5";

// SSEで生のReadableStream Responseを返す都合上、NextResponseを要求する
// withAdminヘルパーは使わず、analysis/route.tsと同じ手動認証パターンを使う。
async function requireAdmin(): Promise<
  { error: NextResponse } | { ok: true; userId: string; userEmail: string }
> {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  const user = session.user as { id: string; email: string; role: string };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { ok: true, userId: user.id, userEmail: user.email };
}

// { } の深さ追跡による正確なJSON抽出（既存 analysis/route.ts と同じ方式）
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

export async function POST(req: NextRequest, { params }: Params) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;
  const { userId, userEmail } = authResult;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      techStacks: { orderBy: { sortOrder: "asc" } },
      documents: { select: { docType: true, content: true } },
      customDocuments: { select: { customTypeLabel: true, content: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let apiKey: string;
  try {
    apiKey = await getClaudeApiKey();
  } catch {
    return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send("progress", { step: 1, total: 3, message: "プロジェクト情報・資料を収集中..." });

          const techStackText = project.techStacks
            .map((t: { category: string; name: string; version: string | null }) =>
              `- [${t.category}] ${t.name}${t.version ? ` v${t.version}` : ""}`)
            .join("\n");

          const DOC_LABELS: Record<string, string> = {
            planning: "企画書", requirements: "要件定義書", external_spec: "外部仕様設計書",
            db_spec: "DB仕様設計書", api_spec: "API詳細設計書",
          };
          const docsText = project.documents
            .filter((d: { content: string | null }) => d.content && d.content.length > 0)
            .map((d: { docType: string; content: string | null }) =>
              `### ${DOC_LABELS[d.docType] ?? d.docType}\n${d.content!.slice(0, 1200)}`)
            .join("\n\n");
          const customDocsText = project.customDocuments
            .filter((d: { content: string | null }) => d.content && d.content.length > 0)
            .map((d: { customTypeLabel: string; content: string | null }) =>
              `### ${d.customTypeLabel}\n${d.content!.slice(0, 1200)}`)
            .join("\n\n");

          const latestSystemAnalysis = project.analyses[0];
          const systemAnalysisText = latestSystemAnalysis
            ? `既存の総合分析結果（総評: ${latestSystemAnalysis.summary ?? "なし"}）`
            : "（総合分析未実施）";

          const categoryList = BUSINESS_CATEGORIES
            .map((c) => `  - ${c.key}: ${c.label}（${c.description}）`)
            .join("\n");

          const prompt = `あなたは新規事業評価に精通したシニアビジネスアナリストです。
以下のプロジェクト情報をもとに、8つの観点で事業性を評価してください。

# プロジェクト名
${project.name}

# タグライン
${project.tagline || "（未入力）"}

# 概要
${project.description || "（未入力）"}

# 目的・背景
${project.purpose || "（未入力）"}

# 対象ユーザー
${project.targetUsers || "（未入力）"}

# スコープ
${project.scope || "（未入力）"}

# ステータス・進捗
${project.status} / 進捗 ${Number(project.progressCache).toFixed(0)}%

# 技術スタック
${techStackText || "（未登録）"}

# ドキュメント
${docsText || "（未作成）"}

# カスタムドキュメント（README等）
${customDocsText || "（未作成）"}

# ${systemAnalysisText}

---

## 評価カテゴリ（全て「スコアが高いほど良い」方向で統一。0〜100点）
${categoryList}

各カテゴリについて、score（0-100）・rationale（評価根拠、80〜150文字）・advice（スコアを上げるための具体的な改善アドバイス、80〜150文字）を出してください。
情報が著しく不足している場合は無理に高得点/低得点にせず、50点前後の中立的なスコアにしてrationaleにその旨を明記してください。

以下のJSON形式のみ出力してください（前置き・後書き・コードブロック記号は一切不要）。

{
  "summary": "総評（200〜300文字）",
  "categories": {
    "profitability": {"score": 数値, "rationale": "...", "advice": "..."},
    "competitive_moat": {"score": 数値, "rationale": "...", "advice": "..."},
    "risk": {"score": 数値, "rationale": "...", "advice": "..."},
    "durability": {"score": 数値, "rationale": "...", "advice": "..."},
    "scalability": {"score": 数値, "rationale": "...", "advice": "..."},
    "feasibility": {"score": 数値, "rationale": "...", "advice": "..."},
    "time_to_revenue": {"score": 数値, "rationale": "...", "advice": "..."},
    "market_fit": {"score": 数値, "rationale": "...", "advice": "..."}
  }
}`;

          send("progress", { step: 2, total: 3, message: "Claude AIが8カテゴリを分析中...（数十秒かかります）" });

          const client = new Anthropic({ apiKey });
          const res = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });
          const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
          const inputTokens = res.usage.input_tokens;
          const outputTokens = res.usage.output_tokens;

          // API使用量を記録（コスト画面に反映させるため。失敗してもメイン処理は継続）
          await logApiUsage({
            feature: "business_analysis",
            projectId: params.id,
            model: MODEL,
            inputTokens,
            outputTokens,
          });

          let parsed: {
            summary?: string;
            categories?: Record<string, { score?: number; rationale?: string; advice?: string }>;
          };
          try {
            parsed = JSON.parse(extractJson(raw));
          } catch (e) {
            throw new Error(`AI_PARSE_ERROR: ${e instanceof Error ? e.message : ""} | raw先頭200字: ${raw.slice(0, 200)}`);
          }

          const categories = BUSINESS_CATEGORIES.map((def) => {
            const c = parsed.categories?.[def.key];
            const score = Math.min(100, Math.max(0, Math.round(c?.score ?? 50)));
            return {
              category: def.key,
              score,
              rationale: c?.rationale ?? "",
              advice: c?.advice ?? "",
            };
          });
          const overallScore = calcOverallScore(categories);

          send("progress", { step: 3, total: 3, message: "結果を保存中..." });

          // ── 生成結果を即座にDBへ保存する（タブを閉じても結果が失われないように） ──
          const analysis = await prisma.businessAnalysis.create({
            data: {
              projectId: params.id,
              overallScore,
              summary: parsed.summary ?? "",
              aiSuggested: true,
              createdBy: userId,
              categories: {
                create: categories.map((c) => ({
                  category: c.category as any,
                  score: c.score,
                  rationale: c.rationale,
                  advice: c.advice,
                  aiSuggestedScore: c.score,
                  manuallyOverridden: false,
                })),
              },
            },
            include: { categories: true },
          });

          await prisma.project.update({
            where: { id: params.id },
            data: { businessScore: overallScore },
          });

          writeAuditLog({
            userId: userId,
            userEmail: userEmail,
            action: "PROJECT_UPDATE",
            resourceType: "project",
            resourceId: params.id,
            resourceName: project.name,
            newValues: { business_analysis_ai_generated: true, overall_score: overallScore },
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
          });

          send("complete", {
            analysis: {
              ...analysis,
              createdAt: analysis.createdAt.toISOString(),
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
          console.error("[BUSINESS_ANALYSIS_SUGGEST] エラー:", message);
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
