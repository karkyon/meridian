#!/usr/bin/env python3
"""
patch_import_api_key_20260730.py

Meridian に「インポート専用APIキー」機能を一括適用するワンショットパッチ。
- prisma/schema.prisma : AuditAction enum 追加 / ImportApiKey model 追加 / User relation 追加
- prisma/migrations/20260730000000_add_import_api_keys/migration.sql : 新規
- src/lib/crypto.ts : createHash import 追加 / generateImportApiKey・hashImportApiKey 追加
- src/lib/api-helpers.ts : withImportKey 追加
- src/lib/audit.ts : AuditAction union 拡張
- src/app/api/settings/import-keys/route.ts : 新規（GET一覧・POST発行）
- src/app/api/settings/import-keys/[keyId]/route.ts : 新規（DELETE失効）
- src/components/settings/ImportKeysPanel.tsx : 新規
- src/components/settings/SettingsClient.tsx : タブ追加

実行はリポジトリルート（~/projects/meridian）から行うこと。
すべての置換は「現在の実ファイル内容と完全一致する文字列」に対してのみ行う。
一致しない場合は例外を送出して中断する（想像・推測での上書きを防止するため）。
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHANGED_FILES: list[str] = []
CREATED_FILES: list[str] = []


def replace_exact(path: Path, before: str, after: str, *, required: bool = True) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(before)
    if count == 0:
        msg = f"[SKIP-OR-FAIL] 置換対象の文字列が見つかりません: {path}"
        if required:
            raise RuntimeError(msg + "\n--- 期待した文字列 ---\n" + before)
        print(msg)
        return
    if count > 1:
        raise RuntimeError(f"[ABORT] 置換対象の文字列が複数箇所に一致しました（一意性なし）: {path}")
    text = text.replace(before, after)
    path.write_text(text, encoding="utf-8")
    CHANGED_FILES.append(str(path.relative_to(ROOT)))
    print(f"[OK] modified: {path.relative_to(ROOT)}")


def create_new(path: Path, content: str) -> None:
    if path.exists():
        print(f"[SKIP] 既に存在するため作成しません: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    CREATED_FILES.append(str(path.relative_to(ROOT)))
    print(f"[OK] created: {path.relative_to(ROOT)}")


# ============================================================
# 1. prisma/schema.prisma
# ============================================================
schema_path = ROOT / "prisma" / "schema.prisma"

replace_exact(
    schema_path,
    'enum AuditAction {\n'
    '  LOGIN_SUCCESS\n'
    '  LOGIN_FAILED\n'
    '  LOGIN_LOCKED\n'
    '  LOGOUT\n'
    '  PROJECT_CREATE\n'
    '  PROJECT_UPDATE\n'
    '  PROJECT_DELETE\n'
    '  DOCUMENT_SAVE\n'
    '  DOCUMENT_AI_GENERATE\n'
    '  WBS_TASK_CREATE\n'
    '  WBS_TASK_UPDATE\n'
    '  WBS_TASK_DELETE\n'
    '  PRIORITY_UPDATE\n'
    '  USER_CREATE\n'
    '  USER_DELETE\n'
    '  USER_ROLE_CHANGE\n'
    '  USER_UNLOCK\n'
    '  SESSION_REVOKE\n'
    '  SETTINGS_UPDATE\n'
    '  API_KEY_UPDATE\n'
    '  ANALYSIS_RUN\n'
    '  @@map("audit_action")\n'
    '}',
    'enum AuditAction {\n'
    '  LOGIN_SUCCESS\n'
    '  LOGIN_FAILED\n'
    '  LOGIN_LOCKED\n'
    '  LOGOUT\n'
    '  PROJECT_CREATE\n'
    '  PROJECT_UPDATE\n'
    '  PROJECT_DELETE\n'
    '  DOCUMENT_SAVE\n'
    '  DOCUMENT_AI_GENERATE\n'
    '  WBS_TASK_CREATE\n'
    '  WBS_TASK_UPDATE\n'
    '  WBS_TASK_DELETE\n'
    '  PRIORITY_UPDATE\n'
    '  USER_CREATE\n'
    '  USER_DELETE\n'
    '  USER_ROLE_CHANGE\n'
    '  USER_UNLOCK\n'
    '  SESSION_REVOKE\n'
    '  SETTINGS_UPDATE\n'
    '  API_KEY_UPDATE\n'
    '  ANALYSIS_RUN\n'
    '  IMPORT_KEY_CREATE\n'
    '  IMPORT_KEY_REVOKE\n'
    '  @@map("audit_action")\n'
    '}',
)

replace_exact(
    schema_path,
    '  createdAnalyses         ProjectAnalysis[]    @relation("AnalysisCreatedBy")\n',
    '  createdAnalyses         ProjectAnalysis[]    @relation("AnalysisCreatedBy")\n'
    '  createdImportApiKeys    ImportApiKey[]       @relation("ImportApiKeyCreatedBy")\n',
)

replace_exact(
    schema_path,
    'model ImportApiKey',
    'model ImportApiKey',
    required=False,  # 既にモデルがあれば追加しない（二重適用防止のプレフライトチェック）
)
if "model ImportApiKey" not in schema_path.read_text(encoding="utf-8"):
    with schema_path.open("a", encoding="utf-8") as f:
        f.write(
            "\n"
            "model ImportApiKey {\n"
            '  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid\n'
            '  label      String    @db.VarChar(100)\n'
            '  keyHash    String    @unique @map("key_hash") @db.VarChar(64)\n'
            '  keyPrefix  String    @map("key_prefix") @db.VarChar(12)\n'
            '  createdBy  String?   @map("created_by") @db.Uuid\n'
            '  lastUsedAt DateTime? @map("last_used_at") @db.Timestamptz\n'
            '  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz\n'
            '  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz\n'
            "\n"
            '  creator User? @relation("ImportApiKeyCreatedBy", fields: [createdBy], references: [id])\n'
            "\n"
            '  @@index([createdBy], map: "idx_import_api_keys_created_by")\n'
            '  @@map("import_api_keys")\n'
            "}\n"
        )
    CHANGED_FILES.append(str(schema_path.relative_to(ROOT)))
    print(f"[OK] appended ImportApiKey model: {schema_path.relative_to(ROOT)}")


# ============================================================
# 2. prisma/migrations/20260730000000_add_import_api_keys/migration.sql
# ============================================================
migration_sql = '''-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'IMPORT_KEY_CREATE';
ALTER TYPE "audit_action" ADD VALUE 'IMPORT_KEY_REVOKE';

-- CreateTable
CREATE TABLE "import_api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "created_by" UUID,
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_api_keys_key_hash_key" ON "import_api_keys"("key_hash");
CREATE INDEX "idx_import_api_keys_created_by" ON "import_api_keys"("created_by");

-- AddForeignKey
ALTER TABLE "import_api_keys"
  ADD CONSTRAINT "import_api_keys_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
'''
create_new(ROOT / "prisma" / "migrations" / "20260730000000_add_import_api_keys" / "migration.sql", migration_sql)


# ============================================================
# 3. src/lib/crypto.ts
# ============================================================
crypto_path = ROOT / "src" / "lib" / "crypto.ts"

replace_exact(
    crypto_path,
    'import { createCipheriv, createDecipheriv, randomBytes } from "crypto";',
    'import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";',
)

if "generateImportApiKey" not in crypto_path.read_text(encoding="utf-8"):
    with crypto_path.open("a", encoding="utf-8") as f:
        f.write(
            "\n"
            "// インポート専用APIキー生成（生値はDBに残さずハッシュのみ保存）\n"
            "export function generateImportApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {\n"
            '  const token = randomBytes(32).toString("hex");\n'
            "  const rawKey = `mrd_imp_${token}`;\n"
            '  const keyHash = createHash("sha256").update(rawKey).digest("hex");\n'
            "  const keyPrefix = rawKey.slice(0, 12);\n"
            "  return { rawKey, keyHash, keyPrefix };\n"
            "}\n"
            "\n"
            "export function hashImportApiKey(rawKey: string): string {\n"
            '  return createHash("sha256").update(rawKey).digest("hex");\n'
            "}\n"
        )
    CHANGED_FILES.append(str(crypto_path.relative_to(ROOT)))
    print(f"[OK] appended import-key helpers: {crypto_path.relative_to(ROOT)}")


# ============================================================
# 4. src/lib/api-helpers.ts
# ============================================================
api_helpers_path = ROOT / "src" / "lib" / "api-helpers.ts"

replace_exact(
    api_helpers_path,
    'import { auth } from "@/lib/auth";\nimport { NextRequest, NextResponse } from "next/server";',
    'import { auth } from "@/lib/auth";\n'
    'import { prisma } from "@/lib/prisma";\n'
    'import { hashImportApiKey } from "@/lib/crypto";\n'
    'import { NextRequest, NextResponse } from "next/server";',
)

if "withImportKey" not in api_helpers_path.read_text(encoding="utf-8"):
    with api_helpers_path.open("a", encoding="utf-8") as f:
        f.write(
            "\n"
            "export type ImportKeyInfo = { id: string; label: string };\n"
            "type ImportKeyHandler = (req: NextRequest, keyInfo: ImportKeyInfo) => Promise<NextResponse>;\n"
            "\n"
            "// 外部スキャンパイプライン等からのインポートAPI呼び出し専用認証\n"
            "// セッションCookieではなく Authorization: Bearer mrd_imp_... を検証する\n"
            "export async function withImportKey(\n"
            "  req: NextRequest,\n"
            "  handler: ImportKeyHandler\n"
            "): Promise<NextResponse> {\n"
            '  const authHeader = req.headers.get("authorization") ?? "";\n'
            '  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";\n'
            "\n"
            '  if (!rawKey.startsWith("mrd_imp_")) {\n'
            '    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });\n'
            "  }\n"
            "\n"
            "  const keyHash = hashImportApiKey(rawKey);\n"
            "  const record = await prisma.importApiKey.findUnique({ where: { keyHash } });\n"
            "\n"
            "  if (!record || record.revokedAt) {\n"
            '    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });\n'
            "  }\n"
            "\n"
            "  await prisma.importApiKey.update({\n"
            "    where: { id: record.id },\n"
            "    data: { lastUsedAt: new Date() },\n"
            "  });\n"
            "\n"
            "  return handler(req, { id: record.id, label: record.label });\n"
            "}\n"
        )
    CHANGED_FILES.append(str(api_helpers_path.relative_to(ROOT)))
    print(f"[OK] appended withImportKey: {api_helpers_path.relative_to(ROOT)}")


# ============================================================
# 5. src/lib/audit.ts
# ============================================================
audit_path = ROOT / "src" / "lib" / "audit.ts"

replace_exact(
    audit_path,
    '  "SETTINGS_UPDATE" | "API_KEY_UPDATE";',
    '  "SETTINGS_UPDATE" | "API_KEY_UPDATE" |\n'
    '  "IMPORT_KEY_CREATE" | "IMPORT_KEY_REVOKE";',
)


# ============================================================
# 6. src/app/api/settings/import-keys/route.ts (新規)
# ============================================================
import_keys_route = '''import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateImportApiKey } from "@/lib/crypto";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().min(1).max(100).trim(),
});

// GET — 発行済みキー一覧（生の値は含まない）
export async function GET(req: NextRequest) {
  return withAdmin(req, async () => {
    const keys = await prisma.importApiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, label: true, keyPrefix: true,
        lastUsedAt: true, revokedAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  });
}

// POST — 新規発行（生の値はこのレスポンス限りでのみ返却）
export async function POST(req: NextRequest) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rawKey, keyHash, keyPrefix } = generateImportApiKey();

    const created = await prisma.importApiKey.create({
      data: { label: parsed.data.label, keyHash, keyPrefix, createdBy: user.id },
    });

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "IMPORT_KEY_CREATE",
      resourceType: "import_api_key", resourceId: created.id, resourceName: created.label,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json(
      {
        key: { id: created.id, label: created.label, keyPrefix: created.keyPrefix, createdAt: created.createdAt },
        raw_key: rawKey,
      },
      { status: 201 }
    );
  });
}
'''
create_new(ROOT / "src" / "app" / "api" / "settings" / "import-keys" / "route.ts", import_keys_route)


# ============================================================
# 7. src/app/api/settings/import-keys/[keyId]/route.ts (新規)
# ============================================================
import_key_revoke_route = '''import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAdmin } from "@/lib/api-helpers";

type Params = { params: { keyId: string } };

// DELETE — 失効（物理削除ではなく revokedAt を立てる。監査証跡を残すため）
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, user) => {
    const existing = await prisma.importApiKey.findUnique({ where: { id: params.keyId } });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (existing.revokedAt) {
      return NextResponse.json({ error: "ALREADY_REVOKED" }, { status: 409 });
    }

    const revoked = await prisma.importApiKey.update({
      where: { id: params.keyId },
      data: { revokedAt: new Date() },
    });

    writeAuditLog({
      userId: user.id, userEmail: user.email, action: "IMPORT_KEY_REVOKE",
      resourceType: "import_api_key", resourceId: revoked.id, resourceName: revoked.label,
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    });

    return NextResponse.json({ ok: true });
  });
}
'''
create_new(ROOT / "src" / "app" / "api" / "settings" / "import-keys" / "[keyId]" / "route.ts", import_key_revoke_route)


# ============================================================
# 8. src/components/settings/ImportKeysPanel.tsx (新規)
# ============================================================
import_keys_panel = '''"use client";

import { useState, useEffect, useCallback } from "react";

type ImportKey = {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export default function ImportKeysPanel() {
  const [keys, setKeys] = useState<ImportKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/import-keys");
      if (res.ok) setKeys((await res.json()).keys);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    if (!label.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/import-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "発行に失敗しました"); return; }
      setNewRawKey(data.raw_key);
      setLabel("");
      fetchKeys();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("このキーを失効させますか？連携中のパイプラインは即座にアクセスできなくなります。")) return;
    const res = await fetch(`/api/settings/import-keys/${id}`, { method: "DELETE" });
    if (res.ok) fetchKeys();
  }

  const field = "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 bg-white";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <span>\U0001f511</span> インポート専用APIキー
      </h2>
      <p className="text-xs text-slate-400">
        外部スキャンパイプラインからドキュメント一括投入APIを呼び出す際の認証に使用します。管理者セッションとは独立した鍵です。
      </p>

      {newRawKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-800">このキーは今だけ表示されます。控えたら閉じてください。</p>
          <code className="block text-xs bg-white border border-amber-200 rounded px-2 py-1.5 break-all">{newRawKey}</code>
          <button onClick={() => setNewRawKey(null)} className="text-xs text-amber-700 hover:underline">閉じる</button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: local-scan-pipeline"
          className={field}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !label.trim()}
          className="px-4 py-2 bg-[#1A3A5C] text-white text-xs font-medium rounded-lg hover:bg-[#2A527A] disabled:opacity-50 whitespace-nowrap"
        >
          {creating ? "発行中..." : "＋ 新規発行"}
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-slate-400">読み込み中...</p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-slate-400">発行済みキーはありません</p>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-slate-700">{k.label}</p>
                <p className="text-[10px] text-slate-400 font-mono">{k.keyPrefix}...</p>
                <p className="text-[10px] text-slate-400">
                  最終使用: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ja-JP") : "未使用"}
                </p>
              </div>
              {k.revokedAt ? (
                <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-400 rounded-full">失効済み</span>
              ) : (
                <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-500 hover:underline">失効</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
'''
create_new(ROOT / "src" / "components" / "settings" / "ImportKeysPanel.tsx", import_keys_panel)


# ============================================================
# 9. src/components/settings/SettingsClient.tsx
# ============================================================
settings_client_path = ROOT / "src" / "components" / "settings" / "SettingsClient.tsx"

replace_exact(
    settings_client_path,
    'import { useState, useEffect, useCallback } from "react";',
    'import { useState, useEffect, useCallback } from "react";\n'
    'import ImportKeysPanel from "@/components/settings/ImportKeysPanel";',
)

replace_exact(
    settings_client_path,
    '  type Tab = "general" | "usage";',
    '  type Tab = "general" | "usage" | "import";',
)

replace_exact(
    settings_client_path,
    '        <button\n'
    '          onClick={() => setActiveTab("usage")}\n'
    '          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${\n'
    '            activeTab === "usage"\n'
    '              ? "bg-white text-slate-800 shadow-sm"\n'
    '              : "text-slate-500 hover:text-slate-700"\n'
    '          }`}\n'
    '        >\n'
    '          \U0001f4b0 APIコスト\n'
    '        </button>\n'
    '      </div>',
    '        <button\n'
    '          onClick={() => setActiveTab("usage")}\n'
    '          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${\n'
    '            activeTab === "usage"\n'
    '              ? "bg-white text-slate-800 shadow-sm"\n'
    '              : "text-slate-500 hover:text-slate-700"\n'
    '          }`}\n'
    '        >\n'
    '          \U0001f4b0 APIコスト\n'
    '        </button>\n'
    '        <button\n'
    '          onClick={() => setActiveTab("import")}\n'
    '          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${\n'
    '            activeTab === "import"\n'
    '              ? "bg-white text-slate-800 shadow-sm"\n'
    '              : "text-slate-500 hover:text-slate-700"\n'
    '          }`}\n'
    '        >\n'
    '          \U0001f511 インポート連携\n'
    '        </button>\n'
    '      </div>',
)

replace_exact(
    settings_client_path,
    '      {/* ── APIコストタブ ── */}\n'
    '      {activeTab === "usage" && <ApiCostDashboard />}\n',
    '      {/* ── APIコストタブ ── */}\n'
    '      {activeTab === "usage" && <ApiCostDashboard />}\n'
    '\n'
    '      {/* ── インポート連携タブ ── */}\n'
    '      {activeTab === "import" && (\n'
    '        <div className="space-y-4">\n'
    '          <ImportKeysPanel />\n'
    '        </div>\n'
    '      )}\n',
)


# ============================================================
# 結果サマリ
# ============================================================
print("\n=== 適用結果 ===")
print(f"変更ファイル ({len(CHANGED_FILES)}):")
for p in CHANGED_FILES:
    print(f"  - {p}")
print(f"新規ファイル ({len(CREATED_FILES)}):")
for p in CREATED_FILES:
    print(f"  - {p}")

if not CHANGED_FILES and not CREATED_FILES:
    print("\n[WARN] 何も適用されませんでした（既に適用済みの可能性があります）")
    sys.exit(0)

print("\n[DONE] パッチ適用完了。次は prisma generate / tsc --noEmit / next build を実行してください。")
