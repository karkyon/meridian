import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

// GET /api/custom-doc-types — 共通カスタムドキュメントタイプ一覧
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const types = await prisma.customDocType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ types });
  });
}

// POST /api/custom-doc-types — 新規共通タイプ追加（Admin専用）
const postSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(200),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  return withAdmin(req, async () => {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const maxOrder = await prisma.customDocType.aggregate({ _max: { sortOrder: true } });
    const type = await prisma.customDocType.create({
      data: {
        ...parsed.data,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
      },
    });
    return NextResponse.json({ type }, { status: 201 });
  });
}
