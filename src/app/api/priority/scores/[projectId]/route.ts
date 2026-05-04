import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const scoreSchema = z.object({
  impact: z.number().int().min(1).max(10),
  urgency: z.number().int().min(1).max(10),
  learning: z.number().int().min(1).max(10),
  cost: z.number().int().min(1).max(10),
  motivation: z.number().int().min(1).max(10),
  ai_suggested: z.boolean().optional(),
});

type Params = { params: { projectId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = scoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }

    const { impact, urgency, learning, cost, motivation, ai_suggested } = parsed.data;
    const totalScore = Math.round(
      Math.min(100, Math.max(0, (impact * 3 + urgency * 2 + learning * 2 + (11 - cost) * 1 + motivation * 2) / 10))
    );

    await prisma.priorityScore.create({
      data: {
        projectId: params.projectId,
        impact, urgency, learning, cost, motivation, totalScore,
        aiSuggested: ai_suggested ?? false,
        createdBy: user.id,
      },
    });

    await prisma.project.update({
      where: { id: params.projectId },
      data: { priorityScore: totalScore },
    });

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "PRIORITY_UPDATE",
      resourceType: "project", resourceId: params.projectId,
      newValues: { totalScore, impact, urgency, learning, cost, motivation },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json({ total_score: totalScore });
  });
}
