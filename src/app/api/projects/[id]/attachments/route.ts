import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import {
  MAX_FILE_SIZE, MAX_IMAGE_FILE_SIZE, ALLOWED_MIME_TYPES,
  generateFilename, saveFile, detectFileType, extractTextFromBuffer,
  toAttachmentType, isImageFileType,
} from "@/lib/file-upload";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const { searchParams } = req.nextUrl;
    const docTypeFilter = searchParams.get("doc_type");
    const attachments = await prisma.projectAttachment.findMany({
      where: { projectId: params.id, ...(docTypeFilter ? { docType: docTypeFilter } : {}) },
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

    // ファイル種別を判定
    const fileType = detectFileType(file.type, file.name);

    // 画像ファイルかどうかで上限を切り替え
    const sizeLimit = isImageFileType(fileType) ? MAX_IMAGE_FILE_SIZE : MAX_FILE_SIZE;
    if (file.size > sizeLimit) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", max_size: isImageFileType(fileType) ? "2MB" : "5MB" },
        { status: 400 }
      );
    }

    // 許可する拡張子（ドキュメント + 画像）
    const ALLOWED_EXTS = [
      "docx", "doc", "pdf", "md", "markdown", "html", "htm",
      "png", "jpg", "jpeg", "svg", "webp", "ico",
    ];

    if (fileType === "other" && !ALLOWED_MIME_TYPES[file.type]) {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      if (!ALLOWED_EXTS.includes(ext)) {
        return NextResponse.json(
          { error: "INVALID_FILE_TYPE", allowed: ALLOWED_EXTS },
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

    // テキスト抽出（画像は空文字列）
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
        fileType: toAttachmentType(fileType),
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        description: description || null,
        docType: (formData.get("doc_type") as string | null) || null,
        extractedText: extractedText || null,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  });
}