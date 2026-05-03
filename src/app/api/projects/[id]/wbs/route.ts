import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const phaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const phases = await prisma.wbsPhase.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
      include: {
        tasks: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            estimatedHours: true,
            sortOrder: true,
            aiGenerated: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // 各フェーズの進捗を計算
    const phasesWithProgress = phases.map((phase) => {
      const total = phase.tasks.length;
      const done = phase.tasks.filter((t) => t.status === "done").length;
      return {
        ...phase,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        total_tasks: total,
        done_tasks: done,
      };
    });

    return NextResponse.json({ phases: phasesWithProgress });
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = phaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 最大sortOrderを取得
    const maxOrder = await prisma.wbsPhase.aggregate({
      where: { projectId: params.id },
      _max: { sortOrder: true },
    });

    const phase = await prisma.wbsPhase.create({
      data: {
        projectId: params.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        color: parsed.data.color ?? "#1D6FA4",
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "WBS_TASK_CREATE",
      resourceType: "wbs_phase",
      resourceId: phase.id,
      resourceName: phase.name,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ phase }, { status: 201 });
  });
}
