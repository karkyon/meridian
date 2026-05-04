import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { extractTextFromBuffer, detectFileType } from "@/lib/file-upload";

const DOC_TYPES = ["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const;
type DocType = (typeof DOC_TYPES)[number];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type Params = { params: { id: string; type: string } };

// ファイルアップロードでドキュメント内容を上書き
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    if (!DOC_TYPES.includes(params.type as DocType)) {
      return NextResponse.json({ error: "INVALID_DOC_TYPE" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const completeness = parseInt(formData.get("completeness") as string ?? "100");

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "FILE_TOO_LARGE", max_size: "5MB" }, { status: 400 });
    }

    // ファイルタイプ確認
    const fileType = detectFileType(file.type, file.name);
    if (fileType === "other") {
      const ext = file.name.toLowerCase().split(".").pop();
      if (!["docx", "doc", "pdf", "md", "markdown"].includes(ext ?? "")) {
        return NextResponse.json(
          { error: "INVALID_FILE_TYPE", allowed: ["docx", "doc", "pdf", "md", "markdown"] },
          { status: 400 }
        );
      }
    }

    // ドキュメント存在確認
    const existing = await prisma.document.findUnique({
      where: { projectId_docType: { projectId: params.id, docType: params.type as DocType } },
    });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // テキスト抽出
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extractedText = await extractTextFromBuffer(buffer, fileType, file.name);

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json(
        { error: "TEXT_EXTRACTION_FAILED", message: "ファイルからテキストを抽出できませんでした" },
        { status: 400 }
      );
    }

    // 現在のバージョンをスナップショット保存
    if (existing.content) {
      await prisma.documentVersion.create({
        data: {
          documentId: existing.id,
          version: existing.version,
          content: existing.content,
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
          where: { id: { in: oldVersions.map((v) => v.id) } },
        });
      }
    }

    // ドキュメント更新（抽出テキストで上書き）
    const document = await prisma.document.update({
      where: { id: existing.id },
      data: {
        content: extractedText,
        completeness: isNaN(completeness) ? 100 : Math.min(100, Math.max(0, completeness)),
        aiGenerated: false, // 手動アップロードなのでfalse
        version: existing.version + 1,
        updatedBy: user.id,
      },
    });

    // doc_completeness キャッシュ更新
    const allDocs = await prisma.document.findMany({
      where: { projectId: params.id },
      select: { completeness: true },
    });
    const avg = allDocs.reduce((s, d) => s + d.completeness, 0) / allDocs.length;
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
      resourceName: `${params.id}/${params.type} (uploaded: ${file.name})`,
      newValues: { version: document.version, source: "file_upload", filename: file.name },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({
      document: {
        id: document.id,
        version: document.version,
        completeness: document.completeness,
        content_length: extractedText.length,
        source_file: file.name,
      },
    });
  });
}
