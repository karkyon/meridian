import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { readFile } from "fs/promises";

type Params = { params: { id: string; type: string; fileId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const file = await prisma.documentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const buf = await readFile(file.storagePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      },
    });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const file = await prisma.documentFile.findUnique({ where: { id: params.fileId } });
    if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    try { const { unlink } = await import("fs/promises"); await unlink(file.storagePath); } catch {}
    await prisma.documentFile.delete({ where: { id: params.fileId } });
    return NextResponse.json({ ok: true });
  });
}
