import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

type Params = { params: { id: string } };

// POST — アイコン画像アップロード
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });

    // 2MB制限
    if (file.size > 2 * 1024 * 1024)
      return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

    // PNG / JPG / SVG / WebP のみ
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext))
      return NextResponse.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });

    // 既存アイコンを削除
    const existing = await prisma.project.findUnique({
      where: { id: params.id },
      select: { iconUrl: true },
    });
    if (existing?.iconUrl) {
      try { await unlink(existing.iconUrl); } catch {}
    }

    // 保存先: uploads/icons/{projectId}/
    const dir = path.join(
      process.env.UPLOAD_DIR ?? "/home/karkyon/projects/meridian/uploads",
      "icons",
      params.id
    );
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const filename = `icon_${randomUUID().slice(0, 8)}.${ext}`;
    const storagePath = path.join(dir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    // DBにストレージパスを保存
    await prisma.project.update({
      where: { id: params.id },
      data: { iconUrl: storagePath },
    });

    return NextResponse.json({ ok: true });
  });
}

// DELETE — アイコン削除
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { iconUrl: true },
    });
    if (project?.iconUrl) {
      try { await unlink(project.iconUrl); } catch {}
    }
    await prisma.project.update({
      where: { id: params.id },
      data: { iconUrl: null },
    });
    return NextResponse.json({ ok: true });
  });
}