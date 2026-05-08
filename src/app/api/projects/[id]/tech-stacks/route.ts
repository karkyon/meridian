// src/app/api/projects/[id]/tech-stacks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, withAuth } from "@/lib/api-helpers";
import { z } from "zod";

type Params = { params: { id: string } };

const VALID_CATEGORIES = [
  "language", "frontend", "backend", "database", "orm",
  "auth", "infra", "ai_ml", "testing", "tooling", "other",
] as const;

const createSchema = z.object({
  name:      z.string().min(1).max(100).trim(),
  category:  z.enum(VALID_CATEGORIES).default("other"),
  version:   z.string().max(50).trim().optional().nullable(),
  notes:     z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const bulkSchema = z.object({
  items: z.array(createSchema).min(1).max(50),
});

// ------------------------------------------------------------------
// GET /api/projects/[id]/tech-stacks
// 対象プロジェクトの技術スタック一覧を返す（Admin/Viewer 両方可）
// ------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const items = await prisma.projectTechStack.findMany({
      where: { projectId: params.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ items });
  });
}

// ------------------------------------------------------------------
// POST /api/projects/[id]/tech-stacks
// 1件または一括（bulk）追加（Admin 専用）
//
// 単体: { name, category, version?, notes?, sortOrder? }
// 一括: { items: [...] }
// ------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();

    // 一括登録
    if (Array.isArray(body.items)) {
      const parsed = bulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const created = await prisma.$transaction(
        parsed.data.items.map((item, i) =>
          prisma.projectTechStack.upsert({
            where: {
              projectId_name: {
                projectId: params.id,
                name: item.name,
              },
            },
            update: {
              category: item.category,
              version:  item.version ?? null,
              notes:    item.notes ?? null,
              sortOrder: item.sortOrder ?? i,
            },
            create: {
              projectId: params.id,
              name:      item.name,
              category:  item.category,
              version:   item.version ?? null,
              notes:     item.notes ?? null,
              sortOrder: item.sortOrder ?? i,
            },
          })
        )
      );

      // projects.tech_stack（旧 JSONB）を同期
      await syncLegacyTechStack(params.id);

      return NextResponse.json({ items: created }, { status: 201 });
    }

    // 単体登録
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 現在の最大 sortOrder を取得して末尾に追加
    const maxOrder = await prisma.projectTechStack.aggregate({
      where: { projectId: params.id },
      _max: { sortOrder: true },
    });
    const nextOrder = parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1;

    const item = await prisma.projectTechStack.upsert({
      where: {
        projectId_name: {
          projectId: params.id,
          name: parsed.data.name
        },
      },
      update: {
        category:  parsed.data.category,
        version:   parsed.data.version ?? null,
        notes:     parsed.data.notes ?? null,
        sortOrder: nextOrder,
      },
      create: {
        projectId: params.id,
        name:      parsed.data.name,
        category:  parsed.data.category,
        version:   parsed.data.version ?? null,
        notes:     parsed.data.notes ?? null,
        sortOrder: nextOrder,
      },
    });

    await syncLegacyTechStack(params.id);

    return NextResponse.json({ item }, { status: 201 });
  });
}

// ------------------------------------------------------------------
// DELETE /api/projects/[id]/tech-stacks
// クエリパラメータ ?techId=xxx で1件削除（Admin 専用）
// ------------------------------------------------------------------
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const techId = req.nextUrl.searchParams.get("techId");
    if (!techId) {
      return NextResponse.json({ error: "techId is required" }, { status: 400 });
    }

    const existing = await prisma.projectTechStack.findFirst({
      where: { id: techId, projectId: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.projectTechStack.delete({ where: { id: techId } });
    await syncLegacyTechStack(params.id);

    return new NextResponse(null, { status: 204 });
  });
}

// ------------------------------------------------------------------
// PATCH /api/projects/[id]/tech-stacks
// クエリパラメータ ?techId=xxx で1件更新（Admin 専用）
// ------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const techId = req.nextUrl.searchParams.get("techId");
    if (!techId) {
      return NextResponse.json({ error: "techId is required" }, { status: 400 });
    }

    const existing = await prisma.projectTechStack.findFirst({
      where: { id: techId, projectId: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const patchSchema = createSchema.partial();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const item = await prisma.projectTechStack.update({
      where: { id: techId },
      data: {
        ...(parsed.data.name      !== undefined && { name:      parsed.data.name }),
        ...(parsed.data.category  !== undefined && { category:  parsed.data.category }),
        ...(parsed.data.version   !== undefined && { version:   parsed.data.version ?? null }),
        ...(parsed.data.notes     !== undefined && { notes:     parsed.data.notes ?? null }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });

    await syncLegacyTechStack(params.id);

    return NextResponse.json({ item });
  });
}

// ------------------------------------------------------------------
// ヘルパー：projects.tech_stack（旧 JSONB）を新テーブルに合わせて同期
// 既存の health/wbs/generate 等が旧カラムを参照しているため後方互換維持
// ------------------------------------------------------------------
async function syncLegacyTechStack(projectId: string): Promise<void> {
  const items = await prisma.projectTechStack.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { name: true, version: true },
  });
  const legacy = items.map((t) => (t.version ? `${t.name} ${t.version}` : t.name));

  await prisma.project.update({
    where: { id: projectId },
    data: { techStack: legacy },
  });
}