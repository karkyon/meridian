import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { readFile, writeFile } from "fs/promises";

type Params = { params: { id: string; type: string; fileId: string } };

// GET — ダウンロード or テキストプレビュー
export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.documentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    // プレビュー用テキスト取得
    if (action === "preview") {
      // WORD/PDFはバイナリなので extractedText を返す
      const ext = (file.originalName ?? "").split(".").pop()?.toLowerCase() ?? "";
      const isBinary = ["docx", "doc", "pdf"].includes(ext) || ["word", "pdf"].includes(file.fileType ?? "");
      if (isBinary) {
        // extractedText があればそれを返す、なければ「表示不可」メッセージ
        const text = file.extractedText ?? "このファイルのテキストプレビューは利用できません。ダウンロードして確認してください。";
        return new NextResponse(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      try {
        const buf = await readFile(file.storagePath);
        const text = buf.toString("utf-8");
        return new NextResponse(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch {
        return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
      }
    }

    // ダウンロード
    const buf = await readFile(file.storagePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      },
    });
  });
}

// PUT — ファイル内容の上書き保存（編集可能ファイルのみ）
export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.documentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { content, fileName, overwrite } = body as {
      content?: string;
      fileName?: string;
      overwrite?: boolean;
    };

    if (typeof content !== "string") {
      return NextResponse.json({ error: "INVALID_CONTENT" }, { status: 400 });
    }

    // ファイル内容をストレージに書き込み
    try {
      await writeFile(file.storagePath, content, "utf-8");
    } catch {
      return NextResponse.json({ error: "WRITE_FAILED" }, { status: 500 });
    }

    // ファイル名変更がある場合はDBも更新
    let newName = file.originalName;
    if (fileName && fileName !== file.originalName) {
      newName = fileName;
    }

    const updated = await prisma.documentFile.update({
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
    const file = await prisma.documentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    try { const { unlink } = await import("fs/promises"); await unlink(file.storagePath); } catch {}
    await prisma.documentFile.delete({ where: { id: params.fileId } });
    return NextResponse.json({ ok: true });
  });
}