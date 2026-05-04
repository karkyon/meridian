import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import Anthropic from "@anthropic-ai/sdk";

const DOC_TYPES = ["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const;

type Params = { params: { id: string } };

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function buildDocPromptWithAttachments(
  docType: string,
  projectName: string,
  description: string,
  techStack: string[],
  category: string,
  promptHint: string,
  attachmentTexts: Array<{ name: string; text: string }>,
  existingContent?: string
): string {
  const docLabels: Record<string, string> = {
    planning: "企画書", requirements: "要件定義書",
    external_spec: "外部仕様設計書", db_spec: "DB仕様設計書", api_spec: "API詳細設計書",
  };
  const docLabel = docLabels[docType] ?? docType;
  const techStr = techStack.length > 0 ? techStack.join(", ") : "未指定";

  let prompt = `あなたは優秀なソフトウェアエンジニアです。以下の情報をもとに${docLabel}を日本語で作成してください。

## プロジェクト情報
- プロジェクト名: ${projectName}
- 概要: ${description || "（未入力）"}
- カテゴリ: ${category || "未指定"}
- 技術スタック: ${techStr}
${promptHint ? `\n## 追加指示\n${promptHint}` : ""}`;

  // 添付資料テキストを追加
  if (attachmentTexts.length > 0) {
    prompt += `\n\n## 参考資料（アップロード済みドキュメント）\n`;
    for (const att of attachmentTexts) {
      // 長すぎる場合は先頭部分のみ使用
      const text = att.text.slice(0, 8000);
      prompt += `\n### ${att.name}\n${text}\n`;
    }
  }

  if (existingContent) {
    prompt += `\n\n## 既存の内容（改善・拡充してください）\n${existingContent.slice(0, 2000)}`;
  }

  prompt += `\n\n## 要件
- マークダウン形式で記述してください
- 参考資料の内容を最大限活用してください
- 具体的かつ実践的な内容にしてください
- 見出し・表・箇条書きを適切に使用してください

## 出力形式
${docLabel}の内容のみをマークダウンで出力してください。前置き・後書きは不要です。`;

  return prompt;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 });
  }
  const user = session.user as { id: string; email: string; role: string };
  if (user.role !== "admin") {
    return new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      documents: { select: { docType: true, content: true } },
    },
  });
  if (!project) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = await getClaudeApiKey();
  } catch {
    return new Response(
      sseEvent({ event: "error", message: "Claude APIキーが設定されていません" }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const promptHint: string = body.prompt_hint ?? "";
  const docTypes: string[] = body.doc_types ?? [...DOC_TYPES];
  const referenceExisting: boolean = body.reference_existing ?? false;
  const useAttachments: boolean = body.use_attachments ?? true;

  // 添付資料テキストを取得（use_for_generation=true のもの）
  const attachmentTexts: Array<{ name: string; text: string }> = [];
  if (useAttachments) {
    const attachments = await prisma.projectAttachment.findMany({
      where: { projectId: params.id, usedForGeneration: true },
      select: { originalName: true, extractedText: true },
      orderBy: { createdAt: "asc" },
    });
    for (const att of attachments) {
      if (att.extractedText) {
        attachmentTexts.push({ name: att.originalName, text: att.extractedText });
      }
    }
  }

  const techStack = Array.isArray(project.techStack) ? (project.techStack as string[]) : [];
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      const generated: string[] = [];

      try {
        // 添付資料情報を通知
        if (attachmentTexts.length > 0) {
          send({ event: "info", message: `${attachmentTexts.length}件の添付資料を参照して生成します` });
        }

        for (const docType of docTypes) {
          if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) continue;

          send({ event: "start", doc_type: docType });

          const existingDoc = project.documents.find((d) => d.docType === docType);
          const existingContent = referenceExisting ? (existingDoc?.content ?? undefined) : undefined;

          const prompt = buildDocPromptWithAttachments(
            docType, project.name, project.description ?? "",
            techStack, project.category ?? "", promptHint,
            attachmentTexts, existingContent
          );

          let fullText = "";
          const aiStream = await client.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of aiStream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              fullText += chunk.delta.text;
              send({ event: "chunk", doc_type: docType, text: chunk.delta.text });
            }
          }

          const existing = await prisma.document.findUnique({
            where: { projectId_docType: { projectId: params.id, docType: docType as "planning" | "requirements" | "external_spec" | "db_spec" | "api_spec" } },
          });

          if (existing) {
            if (existing.content) {
              await prisma.documentVersion.create({
                data: { documentId: existing.id, version: existing.version, content: existing.content, aiGenerated: existing.aiGenerated },
              });
            }
            await prisma.document.update({
              where: { id: existing.id },
              data: { content: fullText, aiGenerated: true, aiPromptHint: promptHint || null, version: existing.version + 1, updatedBy: user.id },
            });
          }

          generated.push(docType);
          send({ event: "doc_done", doc_type: docType, saved: true });
        }

        const allDocs = await prisma.document.findMany({ where: { projectId: params.id }, select: { completeness: true } });
        const avg = allDocs.reduce((s, d) => s + d.completeness, 0) / allDocs.length;
        await prisma.project.update({ where: { id: params.id }, data: { docCompleteness: avg } });

        send({ event: "all_done", generated, attachment_count: attachmentTexts.length });

        writeAuditLog({
          userId: user.id, userEmail: user.email, action: "DOCUMENT_AI_GENERATE",
          resourceType: "project", resourceId: params.id, resourceName: project.name,
          newValues: { doc_types: generated, attachment_count: attachmentTexts.length },
          ipAddress: getClientIp(req), userAgent: getUserAgent(req),
        });
      } catch (error) {
        send({ event: "error", message: error instanceof Error ? error.message : "エラーが発生しました" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
  });
}
