import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const taskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
  priority: z.enum(["high", "mid", "low"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estimated_hours: z.number().min(0).max(9999).optional().nullable(),
});

type Params = { params: { id: string; phaseId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    // フェーズが当該プロジェクトに属することを確認
    const phase = await prisma.wbsPhase.findFirst({
      where: { id: params.phaseId, projectId: params.id },
    });
    if (!phase) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = taskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.wbsTask.aggregate({
      where: { phaseId: params.phaseId },
      _max: { sortOrder: true },
    });

    const task = await prisma.wbsTask.create({
      data: {
        phaseId: params.phaseId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status: parsed.data.status ?? "todo",
        priority: parsed.data.priority ?? "mid",
        dueDate: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
        estimatedHours: parsed.data.estimated_hours ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    await recalcProgress(params.id);

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "WBS_TASK_CREATE",
      resourceType: "wbs_task",
      resourceId: task.id,
      resourceName: task.title,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ task }, { status: 201 });
  });
}

async function recalcProgress(projectId: string) {
  const phases = await prisma.wbsPhase.findMany({
    where: { projectId },
    include: { tasks: { select: { status: true } } },
  });
  const allTasks = phases.flatMap((p: any) => p.tasks);
  const total = allTasks.length;
  const done = allTasks.filter((t: any) => t.status === "done").length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  await prisma.project.update({
    where: { id: projectId },
    data: { progressCache: progress },
  });
}
