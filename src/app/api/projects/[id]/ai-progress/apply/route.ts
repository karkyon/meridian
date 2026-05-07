// src/app/api/projects/[id]/ai-progress/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { auth } from "@/lib/auth";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const session = await auth();
    const user = session?.user as { id: string; email: string } | undefined;

    const { updates } = await req.json() as {
      updates: Array<{ taskId: string; status: "todo" | "in_progress" | "done" | "blocked" }>;
    };

    if (!updates?.length) {
      return NextResponse.json({ error: "NO_UPDATES" }, { status: 400 });
    }

    const results: Array<{ taskId: string; success: boolean }> = [];

    for (const { taskId, status } of updates) {
      try {
        const task = await prisma.wbsTask.update({
          where: { id: taskId },
          data: {
            status,
            completedAt: status === "done" ? new Date() : null,
          },
        });
        results.push({ taskId: task.id, success: true });
      } catch {
        results.push({ taskId, success: false });
      }
    }

    // 進捗キャッシュ更新
    const allTasks = await prisma.wbsTask.findMany({
      where: { phase: { projectId: params.id } },
    });
    const done = allTasks.filter((t: any) => t.status === "done").length;
    const progress = allTasks.length > 0 ? Math.round((done / allTasks.length) * 100) : 0;
    await prisma.project.update({
      where: { id: params.id },
      data: { progressCache: progress },
    });

    if (user) {
      await writeAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: "WBS_TASK_UPDATE",
        resourceType: "project",
        resourceId: params.id,
        newValues: { ai_progress_apply: true, updated_count: results.filter((r) => r.success).length },
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }

    return NextResponse.json({ results, newProgress: progress });
  });
}