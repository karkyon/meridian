import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(["planning", "active", "paused", "completed"]).optional(),
  category: z.string().max(100).optional(),
  tech_stack: z.array(z.string().max(100)).max(50).optional(),
  repository_url: z.string().url().max(500).optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (req, user) => {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const sort = searchParams.get("sort") ?? "priority_order";
    const q = searchParams.get("q");
    const archived = searchParams.get("archived") === "true";

    const where: Record<string, unknown> = {};
    if (status) {
      const statuses = status.split(",");
      where.status = { in: statuses };
    }
    if (!archived) {
      where.archivedAt = null;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: Record<string, string> =
      sort === "updated_at"
        ? { updatedAt: "desc" }
        : sort === "progress_cache"
        ? { progressCache: "desc" }
        : { priorityOrder: "asc" };

    const projects = await prisma.project.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
        status: true,
        category: true,
        techStack: true,
        priorityScore: true,
        priorityOrder: true,
        progressCache: true,
        docCompleteness: true,
        healthScore: true,
        delayRisk: true,
        repositoryUrl: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { wbsPhases: true } },
      },
    });

    return NextResponse.json({ projects, total: projects.length });
  });
}

export async function POST(req: NextRequest) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, status, category, tech_stack, repository_url, notes } =
      parsed.data;

    // priority_order は既存の最大値+1
    const maxOrder = await prisma.project.aggregate({ _max: { priorityOrder: true } });
    const nextOrder = (maxOrder._max.priorityOrder ?? 0) + 1;
    
    // （1）project 作成
    const project = await prisma.project.create({
      data: {
        name,
        description: description ?? null,
        status: (status as "planning" | "active" | "paused" | "completed") ?? "planning",
        category: category ?? null,
        techStack: tech_stack ?? [],
        repositoryUrl: repository_url || null,
        notes: notes ?? null,
        priorityOrder: nextOrder,
        createdBy: user.id,
      },
    });

    // （2）tech_stack_items が存在する場合は新テーブルへ一括 upsert
    if (Array.isArray(body.tech_stack_items) && body.tech_stack_items.length > 0) {
      await prisma.projectTechStack.createMany({
        data: body.tech_stack_items.map(
          (t: { name: string; category: string; version?: string; notes?: string }, i: number) => ({
            projectId: project.id,
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
    
    // 5種類のドキュメントを空で初期作成
    await prisma.document.createMany({
      data: [
        "planning",
        "requirements",
        "external_spec",
        "db_spec",
        "api_spec",
      ].map((docType: any) => ({
        projectId: project.id,
        docType: docType as "planning" | "requirements" | "external_spec" | "db_spec" | "api_spec",
        content: null,
        completeness: 0,
      })),
    });

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PROJECT_CREATE",
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
      newValues: { name, status, category },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ project }, { status: 201 });
  });
}
