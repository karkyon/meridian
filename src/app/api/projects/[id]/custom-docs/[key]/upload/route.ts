/**
 * /src/app/api/projects/[id]/custom-docs/[key]/upload/route.ts
 *
 * カスタムドキュメントのファイルアップロードAPI
 * 対応形式: .md .docx .doc .pdf .html .htm
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleFileUpload } from "@/lib/file-upload";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; key: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, key: docKey } = params;

  // プロジェクト存在確認
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const subDir = `projects/${projectId}/custom-docs/${docKey}`;
    const uploadedFiles = await handleFileUpload(formData, subDir);

    // カスタムドキュメントレコードを取得または作成
    let customDoc = await prisma.customDocument.findFirst({
      where: { projectId, key: docKey },
    });
    if (!customDoc) {
      customDoc = await prisma.customDocument.create({
        data: {
          projectId,
          key: docKey,
          content: "",
          version: 1,
          completeness: 0,
        },
      });
    }

    // ファイルレコードをDBに保存
    const savedFiles = await Promise.all(
      uploadedFiles.map(f =>
        prisma.customDocumentFile.create({
          data: {
            customDocumentId: customDoc!.id,
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