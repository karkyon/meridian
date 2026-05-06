import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const DOC_TYPES = ["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const;
type DocType = (typeof DOC_TYPES)[number];

const putSchema = z.object({
  content: z.string().max(500000),
  completeness: z.number().int().min(0).max(100).optional(),
  trigger_reembedding: z.boolean().optional(),
});

type Params = { params: { id: string; type: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    if (!DOC_TYPES.includes(params.type as DocType)) {
      return NextResponse.json({ error: "INVALID_DOC_TYPE" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: {
        projectId_docType: {
          projectId: params.id,
          docType: params.type as DocType,
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      select: { version: true, createdAt: true, aiGenerated: true },
      orderBy: { version: "desc" },
      take: 5,
    });

    return NextResponse.json({ document, versions });
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    if (!DOC_TYPES.includes(params.type as DocType)) {
      return NextResponse.json({ error: "INVALID_DOC_TYPE" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { content, completeness, trigger_reembedding } = parsed.data;

    const existing = await prisma.document.findUnique({
      where: {
        projectId_docType: { projectId: params.id, docType: params.type as DocType },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // バージョンスナップショットを保存
    await prisma.documentVersion.create({
      data: {
        documentId: existing.id,
        version: existing.version,
        content: existing.content ?? "",
        aiGenerated: existing.aiGenerated,
      },
    });

    // 古いバージョンを削除（最新5件のみ保持）
    const oldVersions = await prisma.documentVersion.findMany({
      where: { documentId: existing.id },
      orderBy: { version: "desc" },
      skip: 5,
      select: { id: true },
    });
    if (oldVersions.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { id: { in: oldVersions.map((v: any) => v.id) } },
      });
    }

    const document = await prisma.document.update({
      where: { id: existing.id },
      data: {
        content,
        completeness: completeness ?? existing.completeness,
        version: existing.version + 1,
        updatedBy: user.id,
        ...(trigger_reembedding ? {} : {}),
      },
    });

    // doc_completeness キャッシュ更新
    const allDocs = await prisma.document.findMany({
      where: { projectId: params.id },
      select: { completeness: true },
    });
    const avg = allDocs.reduce((s: any, d: any) => s + d.completeness, 0) / allDocs.length;
    await prisma.project.update({
      where: { id: params.id },
      data: { docCompleteness: avg },
    });

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: "DOCUMENT_SAVE",
      resourceType: "document",
      resourceId: document.id,
      resourceName: `${params.id}/${params.type}`,
      newValues: { version: document.version, completeness },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ document });
  });
}
