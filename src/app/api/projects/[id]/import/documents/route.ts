// src/app/api/projects/[id]/import/documents/route.ts
//
// 外部スキャンパイプライン専用 一括インポートAPI
// 認証: Authorization: Bearer mrd_imp_...（withImportKey）セッションCookie不要
//
// 設計方針（HANDOFF_20260730_import_api_key.md §6-1 準拠）:
// - target.kind（standard/custom）で Document / CustomDocument に振り分け
// - Promise.allSettled で1件ずつ処理し、imported / failed を返す
// - Base64エンコードされたファイル本体 + パイプライン側で抽出済みの extractedText を受け取る
//   （サーバー側でのテキスト再抽出は行わない）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withImportKey } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { MAX_FILE_SIZE, generateFilename, saveFile, detectFileType } from "@/lib/file-upload";
import { z } from "zod";

type Params = { params: { id: string } };

// 固定6種の標準ドキュメント種別（prisma/schema.prisma DocType enum と一致させる）
const STANDARD_DOC_TYPES = [
  "planning",
  "requirements",
  "external_spec",
  "db_spec",
  "api_spec",
  "wireframe",
] as const;

// 通常アップロードAPI（documents/[type]/upload, custom-docs/[key]/upload）と同一の許可拡張子
const ALLOWED_EXTENSIONS = ["docx", "doc", "pdf", "md", "markdown", "html", "htm"];

const fileSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  base64: z.string().min(1),
  // パイプライン側で抽出済みのテキスト。サーバー側では再抽出しない。
  extractedText: z.string().max(2_000_000).optional().nullable(),
});

const targetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("standard"),
    docType: z.enum(STANDARD_DOC_TYPES),
  }),
  z.object({
    kind: z.literal("custom"),
    customTypeKey: z.string().min(1).max(100),
    customTypeLabel: z.string().min(1).max(200).optional(),
  }),
]);

const itemSchema = z.object({
  target: targetSchema,
  file: fileSchema,
  completeness: z.number().int().min(0).max(100).optional(),
});

// 1リクエストあたりの最大件数。Base64は元サイズの約1.33倍に膨れるため、
// 5MB(MAX_FILE_SIZE)×10件で最大 約66MB のリクエストボディを想定。
// リバースプロキシ側（nginx等）の client_max_body_size 設定にも注意すること。
const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(10),
});

type TargetInput = z.infer<typeof targetSchema>;

type ImportedResult = {
  index: number;
  target: TargetInput;
  fileId: string;
  documentId?: string;
  customDocId?: string;
};

type FailedResult = {
  index: number;
  target: TargetInput | null;
  error: string;
  code?: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  return withImportKey(req, async (req, keyInfo) => {
    // ImportApiKey.createdBy は ON DELETE SET NULL のため、発行者アカウントが
    // 削除済みの場合は null になり得る。Document/CustomDocumentFile の createdBy は
    // 必須(NOT NULL)のため、その場合は処理を開始できない。
    if (!keyInfo.createdBy) {
      return NextResponse.json(
        { error: "IMPORT_KEY_ORPHANED", detail: "このインポートキーの発行者アカウントが削除されているため使用できません" },
        { status: 500 }
      );
    }
    const createdBy = keyInfo.createdBy;

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const imported: ImportedResult[] = [];
    const failed: FailedResult[] = [];

    const results = await Promise.allSettled(
      parsed.data.items.map((item, index) => processItem(item, index, params.id, createdBy))
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        imported.push(result.value);
      } else {
        const reason = result.reason;
        failed.push({
          index,
          target: parsed.data.items[index]?.target ?? null,
          error: reason instanceof Error ? reason.message : String(reason),
          code: reason instanceof ImportItemError ? reason.code : undefined,
        });
      }
    });

    writeAuditLog({
      userId: createdBy,
      userEmail: `import-key:${keyInfo.label}`,
      action: "IMPORT_DOCUMENTS_RUN",
      resourceType: "import_batch",
      resourceId: params.id,
      resourceName: `imported=${imported.length} failed=${failed.length}`,
      newValues: { imported: imported.length, failed: failed.length },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ imported, failed }, { status: 207 });
  });
}

class ImportItemError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function processItem(
  item: z.infer<typeof itemSchema>,
  index: number,
  projectId: string,
  createdBy: string
): Promise<ImportedResult> {
  const { target, file } = item;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(file.base64, "base64");
  } catch {
    throw new ImportItemError("Base64デコードに失敗しました", "INVALID_BASE64");
  }
  if (buffer.length === 0) {
    throw new ImportItemError("ファイル内容が空です", "EMPTY_FILE");
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ImportItemError(`ファイルサイズが上限(5MB)を超えています: ${file.originalName}`, "FILE_TOO_LARGE");
  }

  const fileType = detectFileType(file.mimeType, file.originalName);
  const ext = file.originalName.toLowerCase().split(".").pop() ?? "";
  if (fileType === "other" && !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new ImportItemError(`非対応のファイル形式です: ${file.originalName}`, "INVALID_FILE_TYPE");
  }

  const filename = generateFilename(file.originalName);
  const storagePath = await saveFile(buffer, projectId, filename);
  const isEditable = ["markdown", "word", "html", "md"].includes(fileType);
  const extractedText = file.extractedText ?? null;

  if (target.kind === "standard") {
    let doc = await prisma.document.findUnique({
      where: { projectId_docType: { projectId, docType: target.docType as never } },
    });
    if (!doc) {
      doc = await prisma.document.create({
        data: { projectId, docType: target.docType as never, content: "", completeness: 0, version: 1 },
      });
    }

    const fileRecord = await prisma.documentFile.create({
      data: {
        documentId: doc.id,
        filename,
        originalName: file.originalName,
        fileType: fileType === "other" ? "other" : fileType,
        mimeType: file.mimeType || "application/octet-stream",
        fileSize: buffer.length,
        storagePath,
        extractedText,
        isEditable,
        completeness: item.completeness ?? 0,
        version: 1,
        createdBy,
      },
    });

    return { index, target, fileId: fileRecord.id, documentId: doc.id };
  }

  // target.kind === "custom"
  const globalType = await prisma.customDocType.findUnique({ where: { key: target.customTypeKey } });
  const projectType = !globalType
    ? await prisma.projectCustomDocType.findUnique({
        where: { projectId_key: { projectId, key: target.customTypeKey } },
      })
    : null;
  const typeLabel = target.customTypeLabel ?? globalType?.label ?? projectType?.label ?? target.customTypeKey;

  let customDoc = await prisma.customDocument.findUnique({
    where: { projectId_customTypeKey: { projectId, customTypeKey: target.customTypeKey } },
  });
  if (!customDoc) {
    customDoc = await prisma.customDocument.create({
      data: {
        projectId,
        customTypeKey: target.customTypeKey,
        customTypeLabel: typeLabel,
        content: "",
        version: 1,
        completeness: 0,
        createdBy,
      },
    });
  }

  const fileRecord = await prisma.customDocumentFile.create({
    data: {
      customDocId: customDoc.id,
      filename,
      originalName: file.originalName,
      fileType: fileType === "other" ? "other" : fileType,
      mimeType: file.mimeType || "application/octet-stream",
      fileSize: buffer.length,
      storagePath,
      extractedText,
      isEditable,
      completeness: item.completeness ?? 0,
      version: 1,
      createdBy,
    },
  });

  return { index, target, fileId: fileRecord.id, customDocId: customDoc.id };
}
