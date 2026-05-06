/**
 * file-upload.ts
 * ファイルアップロード・テキスト抽出ユーティリティ
 * 対応形式: .md .markdown .docx .doc .pdf .html .htm
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ============================================================
// 型定義
// ============================================================
export type SupportedFileType = "md" | "docx" | "doc" | "pdf" | "html";

export interface UploadedFile {
  id: string;
  filename: string;
  fileType: SupportedFileType;
  fileSize: number;
  storagePath: string;
  extractedText?: string;
}

// ============================================================
// 設定
// ============================================================
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/home/karkyon/projects/meridian/uploads";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_EXTENSIONS: Record<string, SupportedFileType> = {
  ".md": "md",
  ".markdown": "md",
  ".docx": "docx",
  ".doc": "doc",
  ".pdf": "pdf",
  ".html": "html",
  ".htm": "html",
};

// ============================================================
// ファイル種別判定
// ============================================================
export function getFileType(filename: string): SupportedFileType | null {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

// ============================================================
// テキスト抽出
// ============================================================
export async function extractText(
  buffer: Buffer,
  fileType: SupportedFileType,
  filename: string
): Promise<string> {
  switch (fileType) {
    case "md":
      return buffer.toString("utf-8");

    case "html": {
      // HTMLはそのままテキストとして返す（プレビューはクライアント側でレンダリング）
      return buffer.toString("utf-8");
    }

    case "docx":
    case "doc": {
      try {
        // mammothはrequire形式で使用
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
        // pdf-parseはrequire形式で使用
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require("pdf-parse");
        const result = await pdfParse(buffer);
        return result.text || "";
      } catch {
        return "[PDFの内容を抽出できませんでした]";
      }
    }

    default:
      return "";
  }
}

// ============================================================
// HTMLからテキスト抽出（RAG用）
// ============================================================
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// ファイル保存
// ============================================================
export async function saveFile(
  buffer: Buffer,
  originalFilename: string,
  subDir: string
): Promise<{ storagePath: string; filename: string }> {
  const dir = path.join(UPLOAD_DIR, subDir);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const ext = path.extname(originalFilename).toLowerCase();
  const safeName = `${randomUUID()}${ext}`;
  const storagePath = path.join(dir, safeName);
  await writeFile(storagePath, buffer);

  return { storagePath, filename: safeName };
}

// ============================================================
// アップロードハンドラ（Next.js API Route用）
// ============================================================
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
    const { storagePath } = await saveFile(buffer, file.name, subDir);
    const extractedText = await extractText(buffer, fileType, file.name);

    uploaded.push({
      id: randomUUID(),
      filename: file.name,
      fileType,
      fileSize: file.size,
      storagePath,
      extractedText,
    });
  }

  return uploaded;
}