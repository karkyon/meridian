// src/app/api/projects/import-ensure/route.ts
//
// パイプライン用: プロジェクト名で検索し、無ければ作成する（find-or-create）
// 認証: 管理者セッション or インポート専用APIキー（withAdminOrImportKey）
//
// 通常の POST /api/projects は名前の重複を許容する単純作成のみのため、
// パイプラインの再実行時に重複作成しないよう、この専用エンドポイントを新設する。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminOrImportKey } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const techItemSchema = z.object({
  name: z.string().min(1).max(100),
  category: z
    .enum([
      "language", "frontend", "backend", "database", "orm",
      "auth", "infra", "ai_ml", "testing", "tooling", "other",
    ])
    .default("other"),
  version: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const bodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  repository_url: z.string().url().max(500).optional().or(z.literal("")),
  tech_stack_items: z.array(techItemSchema).max(50).optional(),
});

export async function POST(req: NextRequest) {
  return withAdminOrImportKey(req, async (req, ctx) => {
    // createdBy解決。importKey経由の場合、発行者アカウント削除済み(createdBy=null)なら処理不可
    let createdBy: string;
    let auditUserEmail: string;
    if (ctx.via === "session") {
      createdBy = ctx.user.id;
      auditUserEmail = ctx.user.email;
    } else {
      if (!ctx.keyInfo.createdBy) {
        return NextResponse.json(
          { error: "IMPORT_KEY_ORPHANED", detail: "このインポートキーの発行者アカウントが削除されているため使用できません" },
          { status: 500 }
        );
      }
      createdBy = ctx.keyInfo.createdBy;
      auditUserEmail = `import-key:${ctx.keyInfo.label}`;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name, description, category, repository_url, tech_stack_items } = parsed.data;

    const existing = await prisma.project.findFirst({ where: { name } });
    if (existing) {
      if (tech_stack_items && tech_stack_items.length > 0) {
        await prisma.$transaction(
          tech_stack_items.map((item, i) =>
            prisma.projectTechStack.upsert({
              where: { projectId_name: { projectId: existing.id, name: item.name } },
              update: { category: item.category, version: item.version ?? null, notes: item.notes ?? null, sortOrder: i },
              create: {
                projectId: existing.id, name: item.name, category: item.category,
                version: item.version ?? null, notes: item.notes ?? null, sortOrder: i,
              },
            })
          )
        );
      }
      return NextResponse.json({ project: existing, created: false });
    }

    const maxOrder = await prisma.project.aggregate({ _max: { priorityOrder: true } });
    const nextOrder = (maxOrder._max.priorityOrder ?? 0) + 1;

    const project = await prisma.project.create({
      data: {
        name,
        description: description ?? null,
        status: "planning",
        category: category ?? null,
        techStack: tech_stack_items?.map((t) => (t.version ? `${t.name} ${t.version}` : t.name)) ?? [],
        repositoryUrl: repository_url || null,
        priorityOrder: nextOrder,
        createdBy,
      },
    });

    if (tech_stack_items && tech_stack_items.length > 0) {
      await prisma.projectTechStack.createMany({
        data: tech_stack_items.map((t, i) => ({
          projectId: project.id, name: t.name, category: t.category,
          version: t.version ?? null, notes: t.notes ?? null, sortOrder: i,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.document.createMany({
      data: (["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const).map((docType) => ({
        projectId: project.id,
        docType,
        content: null,
        completeness: 0,
      })),
    });

    writeAuditLog({
      userId: createdBy,
      userEmail: auditUserEmail,
      action: "PROJECT_CREATE",
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
      newValues: { name, category },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ project, created: true }, { status: 201 });
  });
}
