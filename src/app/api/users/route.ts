import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { hash } from "bcryptjs";
import { z } from "zod";

const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).regex(/^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/),
  name: z.string().min(1).max(100),
  role: z.enum(["viewer"]).default("viewer"),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async (req, user) => {
    if (user.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, failedLoginCount: true, lockedUntil: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  });
}

export async function POST(req: NextRequest) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });

    const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (exists) return NextResponse.json({ error: "EMAIL_ALREADY_EXISTS" }, { status: 409 });

    const passwordHash = await hash(parsed.data.password, 12);
    const newUser = await prisma.user.create({
      data: { email: parsed.data.email, passwordHash, name: parsed.data.name, role: "viewer" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    writeAuditLog({ userId: user.id, userEmail: user.email, action: "USER_CREATE", resourceType: "user", resourceId: newUser.id, resourceName: newUser.email, ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
    return NextResponse.json({ user: newUser }, { status: 201 });
  });
}
