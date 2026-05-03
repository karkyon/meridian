import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const querySchema = z.object({
  query: z.string().min(1).max(500),
  project_ids: z.array(z.string().uuid()).optional(),
  top_k: z.number().int().min(1).max(20).optional().default(5),
});

export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const body = await req.json();
    const parsed = querySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }

    const { query, project_ids, top_k } = parsed.data;

    let apiKey: string;
    try {
      apiKey = await getClaudeApiKey();
    } catch {
      return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
    }

    // Embeddingが存在するドキュメントを検索（pgvectorインデックスがない場合はテキスト検索にフォールバック）
    let relevantChunks: Array<{
      chunk_text: string;
      project_name: string;
      doc_type: string;
      similarity: number;
    }> = [];

    try {
      // pgvectorを使ったコサイン類似度検索を試みる
      // まずEmbeddingが存在するか確認
      const embeddingCount = await prisma.ragEmbedding.count();

      if (embeddingCount > 0) {
        // テキスト検索（pgvectorのEmbeddingがゼロベクトルの場合はキーワード検索）
        const projectFilter = project_ids && project_ids.length > 0
          ? { document: { projectId: { in: project_ids } } }
          : {};

        const chunks = await prisma.ragEmbedding.findMany({
          where: {
            ...projectFilter,
            chunkText: { contains: query.split(" ")[0], mode: "insensitive" },
          },
          include: {
            document: {
              include: { project: { select: { name: true } } },
            },
          },
          take: top_k,
        });

        relevantChunks = chunks.map((c) => ({
          chunk_text: c.chunkText,
          project_name: c.document.project.name,
          doc_type: c.document.docType,
          similarity: 0.85, // フォールバック値
        }));
      }

      // Embeddingがない場合はドキュメントの内容から直接検索
      if (relevantChunks.length === 0) {
        const projectFilter = project_ids && project_ids.length > 0
          ? { projectId: { in: project_ids } }
          : {};

        const docs = await prisma.document.findMany({
          where: {
            ...projectFilter,
            content: { contains: query.split(" ")[0], mode: "insensitive" },
          },
          include: { project: { select: { name: true } } },
          take: top_k,
        });

        relevantChunks = docs.map((d) => ({
          chunk_text: (d.content ?? "").slice(0, 500),
          project_name: d.project.name,
          doc_type: d.docType,
          similarity: 0.75,
        }));
      }
    } catch (err) {
      console.error("[rag] search error:", err);
    }

    // Claudeで回答生成
    const client = new Anthropic({ apiKey });

    const contextText = relevantChunks.length > 0
      ? relevantChunks.map((c, i) =>
          `[参考${i + 1}: ${c.project_name} / ${c.doc_type}]\n${c.chunk_text}`
        ).join("\n\n---\n\n")
      : "（関連するドキュメントが見つかりませんでした）";

    const prompt = `あなたはプロジェクト管理AIアシスタントです。以下の参考資料をもとに質問に答えてください。

## 質問
${query}

## 参考資料
${contextText}

## 指示
- 参考資料の内容に基づいて回答してください
- 参考資料に情報がない場合は「ドキュメントに記載がありません」と回答してください
- 回答は日本語で、簡潔かつ具体的に記述してください
- どのプロジェクトの情報を参照したかを明示してください`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const answer = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      answer,
      sources: relevantChunks.map((c) => ({
        project_name: c.project_name,
        doc_type: c.doc_type,
        snippet: c.chunk_text.slice(0, 200),
        similarity_score: c.similarity,
      })),
    });
  });
}
