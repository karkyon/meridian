import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

type Params = { params: { id: string; key: string } };

// GET /api/projects/[id]/custom-docs/[key]
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    let doc = await prisma.customDocument.findUnique({
      where: { projectId_customTypeKey: { projectId: params.id, customTypeKey: params.key } },
      include: {
        files: { orderBy: { createdAt: "desc" } },
        versions: { orderBy: { version: "desc" }, take: 5, select: { version: true, createdAt: true, aiGenerated: true } },
      },
    });

    // ドキュメントが存在しない場合、タイプ情報だけ返す
    if (!doc) {
      const globalType = await prisma.customDocType.findUnique({ where: { key: params.key } });
      const projectType = await prisma.projectCustomDocType.findUnique({
        where: { projectId_key: { projectId: params.id, key: params.key } },
      });
      const typeInfo = globalType ?? projectType;
      if (!typeInfo) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ doc: null, typeInfo, files: [], versions: [] });
    }

    return NextResponse.json({ doc, files: doc.files, versions: doc.versions });
  });
}

// PUT /api/projects/[id]/custom-docs/[key] — テキストコンテンツ保存
const putSchema = z.object({
  content: z.string().max(500000),
  completeness: z.number().int().min(0).max(100).optional(),
  label: z.string().min(1).max(200).optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

    const { content, completeness, label } = parsed.data;

    // タイプ名を取得
    const globalType = await prisma.customDocType.findUnique({ where: { key: params.key } });
    const projectType = !globalType
      ? await prisma.projectCustomDocType.findUnique({
          where: { projectId_key: { projectId: params.id, key: params.key } },
        })
      : null;
    const typeLabel = label ?? globalType?.label ?? projectType?.label ?? params.key;

    const existing = await prisma.customDocument.findUnique({
      where: { projectId_customTypeKey: { projectId: params.id, customTypeKey: params.key } },
    });

    if (existing) {
      // バージョンスナップショット
      await prisma.customDocumentVersion.create({
        data: { customDocId: existing.id, version: existing.version, content: existing.content },
      });
      const doc = await prisma.customDocument.update({
        where: { id: existing.id },
        data: {
          content,
          completeness: completeness ?? existing.completeness,
          version: existing.version + 1,
          customTypeLabel: typeLabel,
        },
      });
      return NextResponse.json({ doc });
    } else {
      const doc = await prisma.customDocument.create({
        data: {
          projectId: params.id,
          customTypeKey: params.key,
          customTypeLabel: typeLabel,
          content,
          completeness: completeness ?? 0,
          createdBy: user.id,
        },
      });
      return NextResponse.json({ doc }, { status: 201 });
    }
  });
}

// DELETE /api/projects/[id]/custom-docs/[key] — プロジェクト固有タイプごと削除
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    await prisma.customDocument.deleteMany({
      where: { projectId: params.id, customTypeKey: params.key },
    });
    // プロジェクト固有タイプなら定義も削除
    await prisma.projectCustomDocType.deleteMany({
      where: { projectId: params.id, key: params.key },
    });
    return NextResponse.json({ ok: true });
  });
}
