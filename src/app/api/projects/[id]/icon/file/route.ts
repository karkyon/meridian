import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { readFile } from "fs/promises";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { iconUrl: true },
    });

    if (!project?.iconUrl) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    try {
      const buf = await readFile(project.iconUrl);
      const ext = project.iconUrl.split(".").pop()?.toLowerCase() ?? "png";
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        webp: "image/webp",
        ico: "image/x-icon",
      };
      return new NextResponse(buf, {
        headers: {
          "Content-Type": mimeMap[ext] ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
    }
  });
}