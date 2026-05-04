import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import {
  MAX_FILE_SIZE, ALLOWED_MIME_TYPES,
  generateFilename, saveFile, detectFileType, extractTextFromBuffer,
} from "@/lib/file-upload";

type Params = { params: { id: string; key: string } };

// POST /api/projects/[id]/custom-docs/[key]/upload — ファイルをカスタムドキュメントに追加
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

    const fileType = detectFileType(file.type, file.name);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (fileType === "other" && !["docx","doc","pdf","md","markdown"].includes(ext)) {
      return NextResponse.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });
    }

    // タイプ名を取得
    const globalType = await prisma.customDocType.findUnique({ where: { key: params.key } });
    const projectType = !globalType
      ? await prisma.projectCustomDocType.findUnique({
          where: { projectId_key: { projectId: params.id, key: params.key } },
        })
      : null;
    const typeLabel = globalType?.label ?? projectType?.label ?? params.key;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extractedText = await extractTextFromBuffer(buffer, fileType, file.name);

    const filename = generateFilename(file.name);
    const storagePath = await saveFile(buffer, params.id, filename);

    // ドキュメントレコードをupsert
    const doc = await prisma.customDocument.upsert({
      where: { projectId_customTypeKey: { projectId: params.id, customTypeKey: params.key } },
      create: {
        projectId: params.id,
        customTypeKey: params.key,
        customTypeLabel: typeLabel,
        createdBy: user.id,
      },
      update: {},
    });

    // ファイルレコード追加
    const isEditable = ["markdown", "word"].includes(fileType);
    const fileRecord = await prisma.customDocumentFile.create({
      data: {
        customDocId: doc.id,
        filename,
        originalName: file.name,
        fileType,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        extractedText,
        isEditable,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ file: fileRecord, doc }, { status: 201 });
  });
}
