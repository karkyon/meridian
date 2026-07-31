// src/app/api/projects/[id]/business-analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { BUSINESS_CATEGORIES, isValidBusinessCategory, calcOverallScore } from "@/lib/business-analysis-helpers";
import { z } from "zod";

type Params = { params: { id: string } };

const categoryInputSchema = z.object({
  category: z.string().refine(isValidBusinessCategory, { message: "invalid category" }),
  score: z.number().int().min(0).max(100),
  rationale: z.string().max(1000).optional(),
  advice: z.string().max(1000).optional(),
  ai_suggested_score: z.number().int().min(0).max(100).optional(),
});

const postSchema = z.object({
  categories: z.array(categoryInputSchema).min(1).max(BUSINESS_CATEGORIES.length),
  summary: z.string().max(2000).optional(),
  ai_suggested: z.boolean().optional(),
});

// ------------------------------------------------------------------
// GET: 最新の事業性分析 + 履歴（直近10件）を返す
// ------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const history = await prisma.businessAnalysis.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { categories: true },
    });

    return NextResponse.json({
      latest: history[0] ?? null,
      history,
    });
  });
}

// ------------------------------------------------------------------
// POST: 新規スナップショットを保存（AI提案をそのまま、または手動編集後に保存）
// ------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    });
    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { categories, summary, ai_suggested } = parsed.data;

    const overallScore = calcOverallScore(categories);

    const analysis = await prisma.businessAnalysis.create({
      data: {
        projectId: params.id,
        overallScore,
        summary: summary ?? null,
        aiSuggested: ai_suggested ?? false,
        createdBy: user.id,
        categories: {
          create: categories.map((c) => ({
            category: c.category as any,
            score: c.score,
            rationale: c.rationale ?? null,
            advice: c.advice ?? null,
            aiSuggestedScore: c.ai_suggested_score ?? null,
            manuallyOverridden:
              c.ai_suggested_score !== undefined && c.ai_suggested_score !== c.score,
          })),
        },
      },
      include: { categories: true },
    });

    await prisma.project.update({
      where: { id: params.id },
      data: { businessScore: overallScore },
    });

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "PROJECT_UPDATE",
      resourceType: "project",
      resourceId: params.id,
      resourceName: project.name,
      newValues: { business_analysis_overall_score: overallScore, ai_suggested: ai_suggested ?? false },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ ok: true, analysis });
  });
}
