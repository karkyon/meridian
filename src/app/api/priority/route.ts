import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { priorityOrder: "asc" },
      select: {
        id: true, name: true, status: true, priorityScore: true, priorityOrder: true,
        progressCache: true, docCompleteness: true, delayRisk: true,
        priorityScores: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { impact: true, urgency: true, learning: true, cost: true, motivation: true, totalScore: true, aiSuggested: true },
        },
      },
    });
    return NextResponse.json({ projects });
  });
}

const reorderSchema = z.object({
  order: z.array(z.object({ project_id: z.string().uuid(), priority_order: z.number().int() })),
});

export async function PATCH(req: NextRequest) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    await Promise.all(
      parsed.data.order.map(({ project_id, priority_order }) =>
        prisma.project.update({ where: { id: project_id }, data: { priorityOrder: priority_order } })
      )
    );

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "PRIORITY_UPDATE",
      resourceType: "priority", ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json({ message: "Reordered" });
  });
}
