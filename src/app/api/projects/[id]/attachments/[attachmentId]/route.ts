import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { deleteFile } from "@/lib/file-upload";
import { readFile } from "fs/promises";

type Params = { params: { id: string; attachmentId: string } };

// ────────────────────────────────────────────────────────────
// GET  /api/projects/[id]/attachments/[attachmentId]
//
//  ?action=text     → extractedText を JSON で返す（AI生成用）
//  ?action=preview  → ファイル種別に応じてコンテンツを返す
//                     MD/HTML → テキスト (text/plain)
//                     DOCX    → mammoth で変換した HTML (text/html)
//                     PDF     → extractedText (text/plain)
//                     画像    → バイナリ (image/*)  ← 追加
//  （なし）         → ファイルダウンロード (Content-Disposition: attachment)
// ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: params.attachmentId, projectId: params.id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── action=text（AI生成用・既存）──
    if (action === "text") {
      return NextResponse.json({
        extracted_text: attachment.extractedText ?? "",
        original_name: attachment.originalName,
        file_type: attachment.fileType,
      });
    }

    // ── action=preview（ビューア用）──
    if (action === "preview") {
      const ext = attachment.originalName.split(".").pop()?.toLowerCase() ?? "";
      const isWord  = ["docx", "doc"].includes(ext) || attachment.fileType === "word";
      const isPdf   = ext === "pdf" || attachment.fileType === "pdf";
      const isMd    = ext === "md" || ext === "markdown";
      const isHtml  = ext === "html" || ext === "htm";
      const isImage = ["png", "jpg", "jpeg", "svg", "webp", "ico"].includes(ext);

      // 画像 → バイナリをそのまま返す
      if (isImage) {
        try {
          const buf = await readFile(attachment.storagePath);
          const mimeMap: Record<string, string> = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            svg: "image/svg+xml", webp: "image/webp",
            ico: "image/x-icon",
          };
          return new NextResponse(buf, {
            headers: {
              "Content-Type": mimeMap[ext] ?? "image/png",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          return NextResponse.json({ error: "FILE_NOT_FOUND_ON_DISK" }, { status: 404 });
        }
      }

      // DOCX → mammoth で HTML 変換
      if (isWord) {
        try {
          const buf = await readFile(attachment.storagePath);
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mammoth = require("mammoth");
          const result  = await mammoth.convertToHtml({ buffer: buf });
          return new NextResponse(result.value, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } catch {
          const fallback = attachment.extractedText ?? "Word文書のプレビューに失敗しました。ダウンロードして確認してください。";
          return new NextResponse(fallback, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      }

      // PDF → 抽出テキスト返却
      if (isPdf) {
        const text = attachment.extractedText ?? "（テキスト抽出データがありません）";
        return new NextResponse(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      // MD / HTML → ファイル本文をそのまま返却
      if (isMd || isHtml) {
        try {
          const buf = await readFile(attachment.storagePath);
          return new NextResponse(buf.toString("utf-8"), {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        } catch {
          return NextResponse.json({ error: "FILE_NOT_FOUND_ON_DISK" }, { status: 404 });
        }
      }

      // その他 → ダウンロードにフォールバック
    }

    // ── ファイルダウンロード（デフォルト）──
    try {
      const buffer = await readFile(attachment.storagePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": attachment.mimeType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
          "Content-Length": buffer.length.toString(),
        },
      });
    } catch {
      return NextResponse.json({ error: "FILE_NOT_FOUND_ON_DISK" }, { status: 404 });
    }
  });
}

// ── PATCH  説明 or AI生成フラグ更新 ──
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

    if (typeof body.description         === "string")  updateData.description       = body.description;
    if (typeof body.used_for_generation === "boolean") updateData.usedForGeneration = body.used_for_generation;

    const updated = await prisma.projectAttachment.update({
      where: { id: params.attachmentId },
      data: updateData,
    });

    return NextResponse.json({ attachment: updated });
  });
}

// ── DELETE  ファイル削除 ──
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: params.attachmentId, projectId: params.id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    await deleteFile(attachment.storagePath);
    await prisma.projectAttachment.delete({ where: { id: params.attachmentId } });

    return new NextResponse(null, { status: 204 });
  });
}