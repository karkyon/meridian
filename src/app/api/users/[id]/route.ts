import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["admin", "viewer"]).optional(),
  is_active: z.boolean().optional(),
  locked_until: z.null().optional(),
});

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    if (parsed.data.role !== undefined && params.id === user.id) {
      return NextResponse.json({ error: "CANNOT_CHANGE_OWN_ROLE" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.is_active !== undefined) updateData.isActive = parsed.data.is_active;
    if ("locked_until" in parsed.data && parsed.data.locked_until === null) {
      updateData.lockedUntil = null;
      updateData.failedLoginCount = 0;
    }

    const updated = await prisma.user.update({ where: { id: params.id }, data: updateData, select: { id: true, email: true, name: true, role: true } });

    const action = parsed.data.role !== undefined ? "USER_ROLE_CHANGE" as const
      : "locked_until" in parsed.data ? "USER_UNLOCK" as const
      : "USER_CREATE" as const;
    writeAuditLog({ userId: user.id, userEmail: user.email, action, resourceType: "user", resourceId: params.id, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });

    return NextResponse.json({ user: updated });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    if (params.id === user.id) return NextResponse.json({ error: "CANNOT_DELETE_SELF" }, { status: 403 });

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await prisma.user.delete({ where: { id: params.id } });
    writeAuditLog({ userId: user.id, userEmail: user.email, action: "USER_DELETE", resourceType: "user", resourceId: params.id, resourceName: target.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });

    return new NextResponse(null, { status: 204 });
  });
}
