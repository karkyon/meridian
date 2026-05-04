import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import {
  MAX_FILE_SIZE, ALLOWED_MIME_TYPES,
  generateFilename, saveFile, detectFileType, extractTextFromBuffer,
} from "@/lib/file-upload";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const attachments = await prisma.projectAttachment.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, filename: true, originalName: true, fileType: true,
        mimeType: true, fileSize: true, description: true,
        usedForGeneration: true, createdAt: true,
        uploader: { select: { name: true } },
      },
    });
    return NextResponse.json({ attachments });
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string | null;

    if (!file) {
      return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", max_size: "5MB" },
        { status: 400 }
      );
    }

    // MIMEタイプチェック（拡張子でも判定）
    const fileType = detectFileType(file.type, file.name);
    if (fileType === "other" && !ALLOWED_MIME_TYPES[file.type]) {
      // .md は text/plain で来ることがあるので拡張子で再チェック
      const ext = file.name.toLowerCase().split(".").pop();
      if (!["docx", "doc", "pdf", "md", "markdown"].includes(ext ?? "")) {
        return NextResponse.json(
          { error: "INVALID_FILE_TYPE", allowed: ["docx", "doc", "pdf", "md", "markdown"] },
          { status: 400 }
        );
      }
    }

    // プロジェクト存在確認
    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // ファイルを Buffer に変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // テキスト抽出
    const extractedText = await extractTextFromBuffer(buffer, fileType, file.name);

    // ファイル保存
    const filename = generateFilename(file.name);
    const storagePath = await saveFile(buffer, params.id, filename);

    // DB保存
    const attachment = await prisma.projectAttachment.create({
      data: {
        projectId: params.id,
        filename,
        originalName: file.name,
        fileType: fileType === "other" ? "other" : fileType,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        description: description || null,
        extractedText: extractedText || null,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  });
}
