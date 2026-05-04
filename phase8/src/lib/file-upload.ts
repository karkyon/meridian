import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/home/karkyon/projects/meridian/uploads";
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MIME_TYPES: Record<string, "word" | "pdf" | "markdown"> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/msword": "word",
  "application/pdf": "pdf",
  "text/markdown": "markdown",
  "text/plain": "markdown", // .md ファイルはtext/plainで来ることもある
};

export type FileType = "word" | "pdf" | "markdown" | "other";

export async function ensureUploadDir(projectId: string): Promise<string> {
  const dir = path.join(UPLOAD_DIR, projectId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export function generateFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}_${hash}${ext}`;
}

export async function saveFile(
  buffer: Buffer,
  projectId: string,
  filename: string
): Promise<string> {
  const dir = await ensureUploadDir(projectId);
  const filePath = path.join(dir, filename);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

export function detectFileType(mimeType: string, filename: string): FileType {
  if (ALLOWED_MIME_TYPES[mimeType]) return ALLOWED_MIME_TYPES[mimeType];
  const ext = path.extname(filename).toLowerCase();
  if ([".docx", ".doc"].includes(ext)) return "word";
  if (ext === ".pdf") return "pdf";
  if ([".md", ".markdown"].includes(ext)) return "markdown";
  return "other";
}

// テキスト抽出（Word/Markdown はサーバー側で処理、PDF は基本テキスト取得）
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: FileType,
  filename: string
): Promise<string> {
  try {
    if (fileType === "markdown") {
      // Markdownはそのまま返す
      return buffer.toString("utf-8");
    }

    if (fileType === "word") {
      // mammoth を使用してWordからテキスト抽出
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    if (fileType === "pdf") {
      // PDFはテキスト抽出が複雑なため、ファイル名とサイズのみ記録
      // 本格的にはpdf-parse等を使用
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse");
        const data = await pdfParse(buffer);
        return data.text;
      } catch {
        return `[PDF: ${filename} - テキスト抽出には pdf-parse パッケージが必要です]`;
      }
    }

    return "";
  } catch (err) {
    console.error("[extractText] error:", err);
    return "";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
