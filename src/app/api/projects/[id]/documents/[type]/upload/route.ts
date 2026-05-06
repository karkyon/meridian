/**
 * /src/app/api/projects/[id]/documents/[type]/upload/route.ts
 *
 * 標準ドキュメントのファイルアップロードAPI
 * 対応形式: .md .docx .doc .pdf .html .htm
 */

import { NextRequest, NextResponse } from "next/server";


import { prisma } from "@/lib/prisma";
import { handleFileUpload } from "@/lib/file-upload";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; type: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, type: docType } = params;

  // プロジェクト存在確認
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const subDir = `projects/${projectId}/documents/${docType}`;
    const uploadedFiles = await handleFileUpload(formData, subDir);

    // ドキュメントレコードを取得または作成
    let doc = await prisma.document.findFirst({
      where: { projectId, type: docType },
    });
    if (!doc) {
      doc = await prisma.document.create({
        data: {
          projectId,
          type: docType,
          content: "",
          version: 1,
          completeness: 0,
        },
      });
    }

    // ファイルレコードをDBに保存
    const savedFiles = await Promise.all(
      uploadedFiles.map(f =>
        prisma.documentFile.create({
          data: {
            documentId: doc!.id,
            filename: f.filename,
            fileType: f.fileType,
            fileSize: f.fileSize,
            storagePath: f.storagePath,
            extractedText: f.extractedText,
          },
          select: {
            id: true,
            filename: true,
            fileType: true,
            fileSize: true,
            createdAt: true,
          },
        })
      )
    );

    return NextResponse.json({
      files: savedFiles.map(f => ({
        ...f,
        fileSize: Number(f.fileSize),
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}