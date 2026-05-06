import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";

type Params = { params: { id: string; type: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const doc = await prisma.document.findUnique({
      where: { projectId_docType: { projectId: params.id, docType: params.type as never } },
      select: { id: true },
    });
    if (!doc) return NextResponse.json({ files: [] });
    const files = await prisma.documentFile.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalName: true, fileType: true, fileSize: true, createdAt: true, isEditable: true },
    });
    return NextResponse.json({ files: files.map((f: any) => ({...f, createdAt: f.createdAt.toISOString()})) });
  });
}
