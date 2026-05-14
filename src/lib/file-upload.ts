/**
 * file-upload.ts
 * ファイルアップロード・テキスト抽出ユーティリティ
 */

import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export type SupportedFileType = "md" | "docx" | "doc" | "pdf" | "html" | "png" | "jpg" | "jpeg" | "svg" | "webp" | "ico";

// Prisma AttachmentType enum に対応する型
export type AttachmentFileType = "word" | "pdf" | "markdown" | "html" | "other";

export interface UploadedFile {
  id: string;
  filename: string;
  fileType: SupportedFileType;
  fileSize: number;
  storagePath: string;
  extractedText?: string;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/home/karkyon/projects/meridian/uploads";

export const MAX_FILE_SIZE       = 5 * 1024 * 1024; // 5MB（ドキュメント）
export const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024; // 2MB（画像）

export const ALLOWED_MIME_TYPES: Record<string, SupportedFileType> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/plain": "md",
  "text/html": "html",
  // 画像
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const ALLOWED_EXTENSIONS: Record<string, SupportedFileType> = {
  ".md": "md",
  ".markdown": "md",
  ".docx": "docx",
  ".doc": "doc",
  ".pdf": "pdf",
  ".html": "html",
  ".htm": "html",
  // 画像
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpeg",
  ".svg": "svg",
  ".webp": "webp",
  ".ico": "ico",
};

// 画像ファイルタイプのセット
export const IMAGE_FILE_TYPES = new Set<SupportedFileType>([
  "png", "jpg", "jpeg", "svg", "webp", "ico",
]);

export function isImageFileType(fileType: SupportedFileType | "other"): boolean {
  return IMAGE_FILE_TYPES.has(fileType as SupportedFileType);
}

export function getFileType(filename: string): SupportedFileType | null {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

// MIMEタイプ+拡張子でSupportedFileType | "other" を返す
export function detectFileType(mimeType: string, filename: string): SupportedFileType | "other" {
  if (ALLOWED_MIME_TYPES[mimeType]) return ALLOWED_MIME_TYPES[mimeType];
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS[ext] ?? "other";
}

// SupportedFileType | "other" を Prisma AttachmentType enum値に変換
export function toAttachmentType(fileType: SupportedFileType | "other"): AttachmentFileType {
  const map: Record<string, AttachmentFileType> = {
    docx: "word",
    doc: "word",
    pdf: "pdf",
    md: "markdown",
    html: "html",
    // 画像は "other" にマップ（Prisma enum に image がないため）
    png: "other",
    jpg: "other",
    jpeg: "other",
    svg: "other",
    webp: "other",
    ico: "other",
    other: "other",
  };
  return map[fileType] ?? "other";
}

// タイムスタンプ付きファイル名生成
export function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = randomUUID().replace(/-/g, "").slice(0, 16);
  return `${Date.now()}_${uuid}${ext}`;
}

export async function extractText(
  buffer: Buffer,
  fileType: SupportedFileType,
  filename: string
): Promise<string> {
  switch (fileType) {
    case "md":
    case "html":
      return buffer.toString("utf-8");
    case "docx":
    case "doc": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return result.value || "";
      } catch {
        return "[Word文書の内容を抽出できませんでした]";
      }
    }
    case "pdf": {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require("pdf-parse");
        const result = await pdfParse(buffer);
        return result.text || "";
      } catch {
        return "[PDFの内容を抽出できませんでした]";
      }
    }
    // 画像はテキスト抽出なし
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "webp":
    case "ico":
      return "";
    default:
      return "";
  }
}

// attachments/route.ts が使用する別名
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: SupportedFileType | "other",
  filename: string
): Promise<string> {
  if (fileType === "other") return "";
  return extractText(buffer, fileType, filename);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// saveFile: documents用(buffer, originalName, subDir) と attachments用(buffer, projectId, filename) の両形式対応
export async function saveFile(
  buffer: Buffer,
  arg2: string,
  arg3: string
): Promise<string> {
  // arg3が拡張子を持つ = attachments形式: saveFile(buffer, projectId, generatedFilename)
  // arg3が拡張子なし  = documents形式:   saveFile(buffer, originalName, subDir)
  const hasExt = path.extname(arg3).length > 0;

  let dir: string;
  let filename: string;

  if (hasExt) {
    // attachments形式
    dir = path.join(UPLOAD_DIR, arg2);
    filename = arg3;
  } else {
    // documents形式
    dir = path.join(UPLOAD_DIR, arg3);
    const ext = path.extname(arg2).toLowerCase();
    filename = `${randomUUID()}${ext}`;
  }

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const storagePath = path.join(dir, filename);
  await writeFile(storagePath, buffer);
  return storagePath;
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

export async function handleFileUpload(
  formData: FormData,
  subDir: string
): Promise<UploadedFile[]> {
  const uploaded: UploadedFile[] = [];
  const files = formData.getAll("file") as File[];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`ファイルサイズが上限(5MB)を超えています: ${file.name}`);
    }
    const fileType = getFileType(file.name);
    if (!fileType) {
      throw new Error(`非対応のファイル形式です: ${path.extname(file.name)}`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await saveFile(buffer, file.name, subDir);
    const extractedText = await extractText(buffer, fileType, file.name);
    uploaded.push({
      id: randomUUID(),
      filename: path.basename(storagePath),
      fileType,
      fileSize: file.size,
      storagePath,
      extractedText,
    });
  }
  return uploaded;
}