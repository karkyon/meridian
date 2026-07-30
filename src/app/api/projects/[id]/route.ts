import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { scanFieldsForSecrets, scanEnvVarsForSecrets } from "@/lib/secret-scan";
import { z } from "zod";

const keyFeatureSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

const envVarSchema = z.object({
  key: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
  isSecret: z.boolean().optional(),
});

const externalDependencySchema = z.object({
  name: z.string().min(1).max(200),
  purpose: z.string().max(500).optional(),
  url: z.string().url().max(500).optional().or(z.literal("")),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["planning", "active", "paused", "completed"]).optional(),
  category: z.string().max(100).optional().nullable(),
  tech_stack: z.array(z.string().max(100)).max(50).optional(),
  repository_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  priority_score: z.number().int().min(0).max(100).optional(),

  // ── README強化フィールド ──────────────────────────────────
  tagline: z.string().max(300).optional().nullable(),
  purpose: z.string().max(4000).optional().nullable(),
  target_users: z.string().max(2000).optional().nullable(),
  scope: z.string().max(2000).optional().nullable(),
  key_features: z.array(keyFeatureSchema).max(50).optional(),
  setup_instructions: z.string().max(10000).optional().nullable(),
  env_vars: z.array(envVarSchema).max(100).optional(),
  external_dependencies: z.array(externalDependencySchema).max(50).optional(),
  license: z.string().max(100).optional().nullable(),
  roadmap: z.string().max(4000).optional().nullable(),
  known_issues: z.string().max(4000).optional().nullable(),
  security_notes: z.string().max(4000).optional().nullable(),
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
      const flat = parsed.error.flatten();
      const fieldMsgs = Object.entries(flat.fieldErrors)
        .filter(([, msgs]) => msgs && msgs.length > 0)
        .map(([field, msgs]) => `${field}: ${msgs![0]}`)
        .join(" / ");
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: fieldMsgs || "入力内容に誤りがあります",
          details: flat,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // ── セキュリティ: 秘密情報らしき値の混入チェック ──────────────
    // env_vars / security_notes / setup_instructions は「値そのもの」を
    // 保存する欄ではないため、APIキー等が誤って貼り付けられていないか検査する。
    const secretHits = [
      ...scanFieldsForSecrets({
        security_notes: data.security_notes ?? undefined,
        setup_instructions: data.setup_instructions ?? undefined,
        roadmap: data.roadmap ?? undefined,
        purpose: data.purpose ?? undefined,
      }),
      ...(data.env_vars ? scanEnvVarsForSecrets(data.env_vars).map((h) => ({
        field: `env_vars[${h.index}].${h.field}`,
        matches: h.matches,
      })) : []),
    ];
    if (secretHits.length > 0) {
      return NextResponse.json(
        {
          error: "SECRET_VALUE_DETECTED",
          message: "APIキーやトークンらしき値が検出されたため保存を中止しました。値そのものは env_vars 等に保存せず、キー名と説明のみを記載してください。",
          details: secretHits,
        },
        { status: 400 }
      );
    }

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

    // ── README強化フィールドの反映 ──────────────────────────────
    if (data.tagline !== undefined) updateData.tagline = data.tagline;
    if (data.purpose !== undefined) updateData.purpose = data.purpose;
    if (data.target_users !== undefined) updateData.targetUsers = data.target_users;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.key_features !== undefined) updateData.keyFeatures = data.key_features;
    if (data.setup_instructions !== undefined) updateData.setupInstructions = data.setup_instructions;
    if (data.env_vars !== undefined) updateData.envVars = data.env_vars;
    if (data.external_dependencies !== undefined) updateData.externalDependencies = data.external_dependencies;
    if (data.license !== undefined) updateData.license = data.license;
    if (data.roadmap !== undefined) updateData.roadmap = data.roadmap;
    if (data.known_issues !== undefined) updateData.knownIssues = data.known_issues;
    if (data.security_notes !== undefined) updateData.securityNotes = data.security_notes;

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
