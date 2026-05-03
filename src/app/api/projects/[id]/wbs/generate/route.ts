import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getClaudeApiKey, buildWbsPrompt } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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

  const project = await prisma.project.findUnique({ where: { id: params.id } });
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

  const techStack = Array.isArray(project.techStack) ? (project.techStack as string[]) : [];
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        send({ event: "start" });

        const prompt = buildWbsPrompt(
          project.name,
          project.description ?? "",
          techStack,
          project.category ?? ""
        );

        const response = await client.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";

        // JSONパース
        let wbsData: { phases: Array<{ name: string; color?: string; tasks: Array<{ title: string; priority?: string; estimated_hours?: number }> }> };
        try {
          const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          wbsData = JSON.parse(clean);
        } catch {
          send({ event: "error", message: "WBSデータのパースに失敗しました" });
          controller.close();
          return;
        }

        // 既存フェーズ・タスクを削除してから再作成
        const existingPhases = await prisma.wbsPhase.findMany({
          where: { projectId: params.id },
          select: { id: true },
        });
        if (existingPhases.length > 0) {
          await prisma.wbsPhase.deleteMany({ where: { projectId: params.id } });
        }

        let totalTasks = 0;
        for (let i = 0; i < wbsData.phases.length; i++) {
          const phaseData = wbsData.phases[i];
          send({ event: "phase", name: phaseData.name });

          const phase = await prisma.wbsPhase.create({
            data: {
              projectId: params.id,
              name: phaseData.name,
              color: phaseData.color ?? "#1D6FA4",
              sortOrder: i,
            },
          });

          for (let j = 0; j < phaseData.tasks.length; j++) {
            const taskData = phaseData.tasks[j];
            await prisma.wbsTask.create({
              data: {
                phaseId: phase.id,
                title: taskData.title,
                priority: (taskData.priority as "high" | "mid" | "low") ?? "mid",
                estimatedHours: taskData.estimated_hours ?? null,
                sortOrder: j,
                aiGenerated: true,
              },
            });
            send({ event: "task", phase_id: phase.id, title: taskData.title });
            totalTasks++;
          }
        }

        send({ event: "done", phases: wbsData.phases.length, tasks: totalTasks });
      } catch (error) {
        send({ event: "error", message: error instanceof Error ? error.message : "エラーが発生しました" });
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
