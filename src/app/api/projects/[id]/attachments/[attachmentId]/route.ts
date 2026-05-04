import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { deleteFile } from "@/lib/file-upload";
import { readFile } from "fs/promises";

type Params = { params: { id: string; attachmentId: string } };

// ダウンロード
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: params.attachmentId, projectId: params.id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const { searchParams } = req.nextUrl;
    if (searchParams.get("action") === "text") {
      // 抽出テキストのみ返す（AI生成で使用）
      return NextResponse.json({
        extracted_text: attachment.extractedText ?? "",
        original_name: attachment.originalName,
        file_type: attachment.fileType,
      });
    }

    // ファイルダウンロード
    try {
      const buffer = await readFile(attachment.storagePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": attachment.mimeType,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
          "Content-Length": buffer.length.toString(),
        },
      });
    } catch {
      return NextResponse.json({ error: "FILE_NOT_FOUND_ON_DISK" }, { status: 404 });
    }
  });
}

// 説明文更新 or 生成使用フラグ切替
export async function PATCH(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: params.attachmentId, projectId: params.id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (typeof body.description === "string") updateData.description = body.description;
    if (typeof body.used_for_generation === "boolean") {
      updateData.usedForGeneration = body.used_for_generation;
    }

    const updated = await prisma.projectAttachment.update({
      where: { id: params.attachmentId },
      data: updateData,
    });

    return NextResponse.json({ attachment: updated });
  });
}

// 削除
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: params.attachmentId, projectId: params.id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // ファイル削除 → DB削除
    await deleteFile(attachment.storagePath);
    await prisma.projectAttachment.delete({ where: { id: params.attachmentId } });

    return new NextResponse(null, { status: 204 });
  });
}
