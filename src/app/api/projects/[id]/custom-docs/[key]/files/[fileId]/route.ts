import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import * as fs from "fs/promises";

type Params = { params: { id: string; key: string; fileId: string } };

// GET — ダウンロード or テキストプレビュー
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.customDocumentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "text") {
      return NextResponse.json({ text: file.extractedText ?? "" });
    }

    // プレビュー用テキスト取得
    if (action === "preview") {
      try {
        const buf = await fs.readFile(file.storagePath);
        const text = buf.toString("utf-8");
        return new NextResponse(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch {
        return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
      }
    }

    // ダウンロード
    try {
      const buffer = await fs.readFile(file.storagePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        },
      });
    } catch {
      return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
    }
  });
}

// PUT — ファイル内容の上書き保存
export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.customDocumentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { content, fileName } = body as { content?: string; fileName?: string };

    if (typeof content !== "string") {
      return NextResponse.json({ error: "INVALID_CONTENT" }, { status: 400 });
    }

    try {
      await fs.writeFile(file.storagePath, content, "utf-8");
    } catch {
      return NextResponse.json({ error: "WRITE_FAILED" }, { status: 500 });
    }

    const newName = (fileName && fileName !== file.originalName) ? fileName : file.originalName;
    const updated = await prisma.customDocumentFile.update({
      where: { id: params.fileId },
      data: {
        originalName: newName,
        fileSize: Buffer.byteLength(content, "utf-8"),
      },
    });

    return NextResponse.json({ ok: true, file: updated });
  });
}

// DELETE — ファイル削除
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const file = await prisma.customDocumentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await prisma.customDocumentFile.delete({ where: { id: params.fileId } });
    try { await fs.unlink(file.storagePath); } catch {}

    return NextResponse.json({ ok: true });
  });
}