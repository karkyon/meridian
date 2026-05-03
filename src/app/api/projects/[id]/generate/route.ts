import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey, buildDocPrompt } from "@/lib/claude-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import Anthropic from "@anthropic-ai/sdk";

const DOC_TYPES = ["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const;

type Params = { params: { id: string } };

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: Params) {
  // 認証チェック
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
      documents: {
        select: { docType: true, content: true },
      },
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
      sseEvent({ event: "error", message: "Claude APIキーが設定されていません。設定画面でAPIキーを登録してください。" }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const promptHint: string = body.prompt_hint ?? "";
  const docTypes: string[] = body.doc_types ?? [...DOC_TYPES];
  const includeWbs: boolean = body.include_wbs ?? false;
  const referenceExisting: boolean = body.reference_existing ?? false;

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
        for (const docType of docTypes) {
          if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) continue;

          send({ event: "start", doc_type: docType });

          // 既存コンテンツを取得
          const existingDoc = project.documents.find((d) => d.docType === docType);
          const existingContent = referenceExisting ? (existingDoc?.content ?? undefined) : undefined;

          const prompt = buildDocPrompt(
            docType,
            project.name,
            project.description ?? "",
            techStack,
            project.category ?? "",
            promptHint,
            existingContent
          );

          let fullText = "";

          const aiStream = await client.messages.stream({
            model: "claude-sonnet-4-5",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }],
          });

          for await (const chunk of aiStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const text = chunk.delta.text;
              fullText += text;
              send({ event: "chunk", doc_type: docType, text });
            }
          }

          // DBに保存
          const existing = await prisma.document.findUnique({
            where: { projectId_docType: { projectId: params.id, docType: docType as "planning" | "requirements" | "external_spec" | "db_spec" | "api_spec" } },
          });

          if (existing) {
            // バージョン保存
            await prisma.documentVersion.create({
              data: {
                documentId: existing.id,
                version: existing.version,
                content: existing.content ?? "",
                aiGenerated: existing.aiGenerated,
              },
            });

            await prisma.document.update({
              where: { id: existing.id },
              data: {
                content: fullText,
                aiGenerated: true,
                aiPromptHint: promptHint || null,
                version: existing.version + 1,
                updatedBy: user.id,
              },
            });
          }

          generated.push(docType);
          send({ event: "doc_done", doc_type: docType, saved: true });
        }

        // ドキュメント完成度・キャッシュ更新
        const allDocs = await prisma.document.findMany({
          where: { projectId: params.id },
          select: { completeness: true },
        });
        const avg = allDocs.reduce((s, d) => s + d.completeness, 0) / allDocs.length;
        await prisma.project.update({
          where: { id: params.id },
          data: { docCompleteness: avg },
        });

        send({ event: "all_done", generated });

        writeAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: "DOCUMENT_AI_GENERATE",
          resourceType: "project",
          resourceId: params.id,
          resourceName: project.name,
          newValues: { doc_types: generated },
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        });
      } catch (error) {
        console.error("[generate] error:", error);
        send({
          event: "error",
          message: error instanceof Error ? error.message : "生成中にエラーが発生しました",
          retry_after: 30,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
