import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["planning", "active", "paused", "completed"]).optional(),
  category: z.string().max(100).optional().nullable(),
  tech_stack: z.array(z.string().max(100)).max(50).optional(),
  repository_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  priority_score: z.number().int().min(0).max(100).optional(),
});

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async (req, user) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        documents: {
          select: {
            id: true,
            docType: true,
            completeness: true,
            aiGenerated: true,
            version: true,
            updatedAt: true,
            content: false, // リスト表示では本文は返さない
          },
        },
        wbsPhases: {
          include: {
            tasks: {
              select: { id: true, status: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        healthScores: { orderBy: { evaluatedAt: "desc" }, take: 1 },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // WBS進捗サマリー計算
    const allTasks = project.wbsPhases.flatMap((p: any) => p.tasks);
    const totalTasks = allTasks.length;
    const doneTasks = allTasks.filter((t: any) => t.status === "done").length;
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return NextResponse.json({
      project,
      wbs_summary: { total_tasks: totalTasks, done_tasks: doneTasks, progress },
      health_score: project.healthScores[0] ?? null,
    });
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.project.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.tech_stack !== undefined) updateData.techStack = data.tech_stack;
    if (data.repository_url !== undefined) updateData.repositoryUrl = data.repository_url || null;
    if (Array.isArray(body.tech_stack_items)) {
      await prisma.projectTechStack.deleteMany({ where: { projectId: params.id } });
      if (body.tech_stack_items.length > 0) {
        await prisma.projectTechStack.createMany({
          data: body.tech_stack_items.map(
            (t: { name: string; category: string; version?: string; notes?: string }, i: number) => ({
              projectId: params.id,
              name:      t.name,
              category:  t.category ?? "other",
              version:   t.version ?? null,
              notes:     t.notes ?? null,
              sortOrder: i,
            })
          ),
          skipDuplicates: true,
        });
      }
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.priority_score !== undefined) updateData.priorityScore = data.priority_score;

    const project = await prisma.project.update({
      where: { id: params.id },
      data: updateData,
    });

    // doc_completeness を再計算
    const docs = await prisma.document.findMany({
      where: { projectId: params.id },
      select: { completeness: true },
    });
    if (docs.length > 0) {
      const avg = docs.reduce((s: any, d: any) => s + d.completeness, 0) / docs.length;
      await prisma.project.update({
        where: { id: params.id },
        data: { docCompleteness: avg },
      });
    }

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PROJECT_UPDATE",
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
      oldValues: { name: existing.name, status: existing.status },
      newValues: updateData,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ project });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.project.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.project.delete({ where: { id: params.id } });

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PROJECT_DELETE",
      resourceType: "project",
      resourceId: params.id,
      resourceName: existing.name,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return new NextResponse(null, { status: 204 });
  });
}
