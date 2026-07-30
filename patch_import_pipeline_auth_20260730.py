#!/usr/bin/env python3
"""
patch_import_pipeline_auth_20260730.py

一度きりの適用パッチ（使い切り）。実行後は削除して構いません。

内容:
  1. src/lib/api-helpers.ts — withAdminOrImportKey() 追加
     （管理者セッション or インポート専用APIキーのどちらでも通す統合ヘルパー）
  2. src/app/api/projects/[id]/tech-stacks/route.ts — POST を withAdminOrImportKey に変更
  3. src/app/api/projects/import-ensure/route.ts — 新規作成
     （プロジェクト名でfind-or-create。パイプラインの再実行で重複作成しないための専用API）

実行方法:
    cd ~/projects/meridian
    python3 patch_import_pipeline_auth_20260730.py

実行後:
    npx prisma generate   # スキーマ変更なしのため本来不要だが念のため
    npm run build          # コンパイルエラー0を確認
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

def replace_exact(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count == 0:
        print(f"[FAIL] 置換対象の文字列が見つかりません: {path}")
        sys.exit(1)
    if count > 1:
        print(f"[FAIL] 置換対象の文字列が複数箇所に一致しました（一意でない）: {path} ({count}箇所)")
        sys.exit(1)
    write(path, content.replace(old, new, 1))
    print(f"[OK] 変更: {path}")

def create_new(path: str, content: str) -> None:
    p = ROOT / path
    if p.exists():
        print(f"[FAIL] 既にファイルが存在します（新規作成のはずが重複）: {path}")
        sys.exit(1)
    write(path, content)
    print(f"[OK] 新規作成: {path}")


# ------------------------------------------------------------------
# 1. src/lib/api-helpers.ts — withAdminOrImportKey 追加
# ------------------------------------------------------------------
replace_exact(
    "src/lib/api-helpers.ts",
    '  return handler(req, { id: record.id, label: record.label, createdBy: record.createdBy });\n}',
    '''  return handler(req, { id: record.id, label: record.label, createdBy: record.createdBy });
}

// 管理者セッション or インポート専用APIキー のどちらでも通す統合ヘルパー
// パイプラインからの無人実行と、管理画面からの手動実行の両方に対応するために使用する
export type AuthContext =
  | { via: "session"; user: SessionUser }
  | { via: "importKey"; keyInfo: ImportKeyInfo };

type CombinedHandler = (
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>;

export async function withAdminOrImportKey(
  req: NextRequest,
  handler: CombinedHandler,
  params?: Record<string, string>
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer mrd_imp_")) {
    return withImportKey(req, async (req, keyInfo) => handler(req, { via: "importKey", keyInfo }, params));
  }
  return withAdmin(req, async (req, user) => handler(req, { via: "session", user }, params), params);
}''',
)

# ------------------------------------------------------------------
# 2. tech-stacks route.ts — POST の認証を withAdminOrImportKey に変更
# ------------------------------------------------------------------
replace_exact(
    "src/app/api/projects/[id]/tech-stacks/route.ts",
    'import { withAdmin, withAuth } from "@/lib/api-helpers";',
    'import { withAdmin, withAuth, withAdminOrImportKey } from "@/lib/api-helpers";',
)

replace_exact(
    "src/app/api/projects/[id]/tech-stacks/route.ts",
    '''export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {''',
    '''export async function POST(req: NextRequest, { params }: Params) {
  return withAdminOrImportKey(req, async () => {''',
)

# ------------------------------------------------------------------
# 3. 新規: プロジェクト find-or-create エンドポイント
# ------------------------------------------------------------------
IMPORT_ENSURE_ROUTE = r'''// src/app/api/projects/import-ensure/route.ts
//
// パイプライン用: プロジェクト名で検索し、無ければ作成する（find-or-create）
// 認証: 管理者セッション or インポート専用APIキー（withAdminOrImportKey）
//
// 通常の POST /api/projects は名前の重複を許容する単純作成のみのため、
// パイプラインの再実行時に重複作成しないよう、この専用エンドポイントを新設する。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminOrImportKey } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { z } from "zod";

const techItemSchema = z.object({
  name: z.string().min(1).max(100),
  category: z
    .enum([
      "language", "frontend", "backend", "database", "orm",
      "auth", "infra", "ai_ml", "testing", "tooling", "other",
    ])
    .default("other"),
  version: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const bodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  repository_url: z.string().url().max(500).optional().or(z.literal("")),
  tech_stack_items: z.array(techItemSchema).max(50).optional(),
});

export async function POST(req: NextRequest) {
  return withAdminOrImportKey(req, async (req, ctx) => {
    // createdBy解決。importKey経由の場合、発行者アカウント削除済み(createdBy=null)なら処理不可
    let createdBy: string;
    let auditUserEmail: string;
    if (ctx.via === "session") {
      createdBy = ctx.user.id;
      auditUserEmail = ctx.user.email;
    } else {
      if (!ctx.keyInfo.createdBy) {
        return NextResponse.json(
          { error: "IMPORT_KEY_ORPHANED", detail: "このインポートキーの発行者アカウントが削除されているため使用できません" },
          { status: 500 }
        );
      }
      createdBy = ctx.keyInfo.createdBy;
      auditUserEmail = `import-key:${ctx.keyInfo.label}`;
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
    const { name, description, category, repository_url, tech_stack_items } = parsed.data;

    const existing = await prisma.project.findFirst({ where: { name } });
    if (existing) {
      if (tech_stack_items && tech_stack_items.length > 0) {
        await prisma.$transaction(
          tech_stack_items.map((item, i) =>
            prisma.projectTechStack.upsert({
              where: { projectId_name: { projectId: existing.id, name: item.name } },
              update: { category: item.category, version: item.version ?? null, notes: item.notes ?? null, sortOrder: i },
              create: {
                projectId: existing.id, name: item.name, category: item.category,
                version: item.version ?? null, notes: item.notes ?? null, sortOrder: i,
              },
            })
          )
        );
      }
      return NextResponse.json({ project: existing, created: false });
    }

    const maxOrder = await prisma.project.aggregate({ _max: { priorityOrder: true } });
    const nextOrder = (maxOrder._max.priorityOrder ?? 0) + 1;

    const project = await prisma.project.create({
      data: {
        name,
        description: description ?? null,
        status: "planning",
        category: category ?? null,
        techStack: tech_stack_items?.map((t) => (t.version ? `${t.name} ${t.version}` : t.name)) ?? [],
        repositoryUrl: repository_url || null,
        priorityOrder: nextOrder,
        createdBy,
      },
    });

    if (tech_stack_items && tech_stack_items.length > 0) {
      await prisma.projectTechStack.createMany({
        data: tech_stack_items.map((t, i) => ({
          projectId: project.id, name: t.name, category: t.category,
          version: t.version ?? null, notes: t.notes ?? null, sortOrder: i,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.document.createMany({
      data: (["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const).map((docType) => ({
        projectId: project.id,
        docType,
        content: null,
        completeness: 0,
      })),
    });

    writeAuditLog({
      userId: createdBy,
      userEmail: auditUserEmail,
      action: "PROJECT_CREATE",
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
      newValues: { name, category },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ project, created: true }, { status: 201 });
  });
}
'''

create_new(
    "src/app/api/projects/import-ensure/route.ts",
    IMPORT_ENSURE_ROUTE,
)

print("\n=== すべての変更を適用しました ===")
print("次のコマンドを実行してください:")
print("  npm run build")
