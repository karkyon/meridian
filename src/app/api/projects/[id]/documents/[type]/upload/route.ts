import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { MAX_FILE_SIZE, generateFilename, saveFile, detectFileType, extractTextFromBuffer } from "@/lib/file-upload";

type Params = { params: { id: string; type: string } };

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

    const fileType = detectFileType(file.type, file.name);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (fileType === "other" && !["docx","doc","pdf","md","markdown","html","htm"].includes(ext)) {
      return NextResponse.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({
      where: { projectId_docType: { projectId: params.id, docType: params.type as never } },
    });
    if (!doc) return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extractedText = await extractTextFromBuffer(buffer, fileType, file.name);
    const filename = generateFilename(file.name);
    const storagePath = await saveFile(buffer, params.id, filename);
    const isEditable = ["markdown", "word", "html", "md"].includes(fileType);

    const fileRecord = await prisma.documentFile.create({
      data: {
        documentId: doc.id,
        filename,
        originalName: file.name,
        fileType: fileType === "other" ? "other" : fileType,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        extractedText: extractedText || null,
        isEditable,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ file: { ...fileRecord, createdAt: fileRecord.createdAt.toISOString() } }, { status: 201 });
  });
}
