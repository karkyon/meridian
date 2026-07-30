import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateImportApiKey } from "@/lib/crypto";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().min(1).max(100).trim(),
});

// GET — 発行済みキー一覧（生の値は含まない）
export async function GET(req: NextRequest) {
  return withAdmin(req, async () => {
    const keys = await prisma.importApiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, label: true, keyPrefix: true,
        lastUsedAt: true, revokedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  });
}

// POST — 新規発行（生の値はこのレスポンス限りでのみ返却）
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

    const { rawKey, keyHash, keyPrefix } = generateImportApiKey();

    const created = await prisma.importApiKey.create({
      data: { label: parsed.data.label, keyHash, keyPrefix, createdBy: user.id },
    });

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "IMPORT_KEY_CREATE",
      resourceType: "import_api_key", resourceId: created.id, resourceName: created.label,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json(
      {
        key: { id: created.id, label: created.label, keyPrefix: created.keyPrefix, createdAt: created.createdAt },
        raw_key: rawKey,
      },
      { status: 201 }
    );
  });
}
