import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import * as fs from "fs/promises";
import * as path from "path";

type Params = { params: { id: string; key: string; fileId: string } };

// GET /api/projects/[id]/custom-docs/[key]/files/[fileId] — ダウンロード or テキスト取得
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.customDocumentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    if (searchParams.get("action") === "text") {
      return NextResponse.json({ text: file.extractedText ?? "" });
    }

    // ファイルダウンロード
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

// DELETE /api/projects/[id]/custom-docs/[key]/files/[fileId] — ファイル削除
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const file = await prisma.customDocumentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await prisma.customDocumentFile.delete({ where: { id: params.fileId } });
    try { await fs.unlink(file.storagePath); } catch { /* ignore */ }

    return NextResponse.json({ ok: true });
  });
}
