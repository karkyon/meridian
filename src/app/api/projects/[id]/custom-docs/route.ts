import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

type Params = { params: { id: string } };

// GET /api/projects/[id]/custom-docs — プロジェクトのカスタムドキュメント一覧
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    // 共通タイプ
    const globalTypes = await prisma.customDocType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // プロジェクト固有タイプ
    const projectTypes = await prisma.projectCustomDocType.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });

    // 既存ドキュメント
    const docs = await prisma.customDocument.findMany({
      where: { projectId: params.id },
      include: {
        files: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, originalName: true, fileType: true,
            fileSize: true, isEditable: true, createdAt: true,
          },
        },
      },
    });

    const docMap = new Map(docs.map((d: any) => [d.customTypeKey, d]));

    // 全タイプをマージして返す
    const allTypes = [
      ...globalTypes.map((t: any) => ({ key: t.key, label: t.label, sortOrder: t.sortOrder, scope: "global" as const })),
      ...projectTypes.map((t: any) => ({ key: t.key, label: t.label, sortOrder: t.sortOrder, scope: "project" as const })),
    ];

    const result = allTypes.map((t: any) => ({
      ...t,
      doc: docMap.get(t.key) ?? null,
    }));

    return NextResponse.json({ customDocs: result });
  });
}

// POST /api/projects/[id]/custom-docs — プロジェクト固有タイプを追加
const postSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    // キー重複チェック（共通タイプと）
    const globalExists = await prisma.customDocType.findUnique({ where: { key: parsed.data.key } });
    if (globalExists) {
      return NextResponse.json({ error: "KEY_CONFLICT", message: "共通タイプと同じキーは使用できません" }, { status: 409 });
    }

    const maxOrder = await prisma.projectCustomDocType.aggregate({
      where: { projectId: params.id },
      _max: { sortOrder: true },
    });

    const type = await prisma.projectCustomDocType.create({
      data: {
        projectId: params.id,
        key: parsed.data.key,
        label: parsed.data.label,
        sortOrder: (maxOrder._max.sortOrder ?? 80) + 10,
      },
    });
    return NextResponse.json({ type }, { status: 201 });
  });
}
