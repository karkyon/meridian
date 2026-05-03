import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
  priority: z.enum(["high", "mid", "low"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estimated_hours: z.number().min(0).max(9999).optional().nullable(),
  sort_order: z.number().int().optional(),
});

type Params = { params: { taskId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.wbsTask.findUnique({
      where: { id: params.taskId },
      include: { phase: { select: { projectId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) {
      updateData.status = data.status;
      // done に変わった場合は completedAt をセット
      if (data.status === "done" && existing.status !== "done") {
        updateData.completedAt = new Date();
      }
      // done から別ステータスに戻した場合はクリア
      if (data.status !== "done" && existing.status === "done") {
        updateData.completedAt = null;
      }
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.due_date !== undefined) updateData.dueDate = data.due_date ? new Date(data.due_date) : null;
    if (data.estimated_hours !== undefined) updateData.estimatedHours = data.estimated_hours;
    if (data.sort_order !== undefined) updateData.sortOrder = data.sort_order;

    const task = await prisma.wbsTask.update({
      where: { id: params.taskId },
      data: updateData,
    });

    // 進捗率再計算
    await recalcProgress(existing.phase.projectId);

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "WBS_TASK_UPDATE",
      resourceType: "wbs_task",
      resourceId: task.id,
      resourceName: task.title,
      oldValues: { status: existing.status },
      newValues: { status: task.status },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ task });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.wbsTask.findUnique({
      where: { id: params.taskId },
      include: { phase: { select: { projectId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.wbsTask.delete({ where: { id: params.taskId } });
    await recalcProgress(existing.phase.projectId);

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "WBS_TASK_DELETE",
      resourceType: "wbs_task",
      resourceId: params.taskId,
      resourceName: existing.title,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return new NextResponse(null, { status: 204 });
  });
}

async function recalcProgress(projectId: string) {
  const phases = await prisma.wbsPhase.findMany({
    where: { projectId },
    include: { tasks: { select: { status: true } } },
  });
  const allTasks = phases.flatMap((p) => p.tasks);
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.status === "done").length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  await prisma.project.update({
    where: { id: projectId },
    data: { progressCache: progress },
  });
}
