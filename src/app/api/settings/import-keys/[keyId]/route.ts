import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";

type Params = { params: { keyId: string } };

// DELETE — 失効（物理削除ではなく revokedAt を立てる。監査証跡を残すため）
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.importApiKey.findUnique({ where: { id: params.keyId } });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (existing.revokedAt) {
      return NextResponse.json({ error: "ALREADY_REVOKED" }, { status: 409 });
    }

    const revoked = await prisma.importApiKey.update({
      where: { id: params.keyId },
      data: { revokedAt: new Date() },
    });

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "IMPORT_KEY_REVOKE",
      resourceType: "import_api_key", resourceId: revoked.id, resourceName: revoked.label,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json({ ok: true });
  });
}
