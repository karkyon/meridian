#!/usr/bin/env bash
# Phase 8 デプロイスクリプト
set -euo pipefail

MERIDIAN="$HOME/projects/meridian"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Phase 8 デプロイ ==="

# 1. アップロードディレクトリ作成
mkdir -p "$MERIDIAN/uploads"
echo "✅ uploads/ ディレクトリ作成"

# 2. mammoth インストール（Word テキスト抽出）
cd "$MERIDIAN"
npm install mammoth 2>/dev/null || true
echo "✅ mammoth インストール"

# 3. ファイルコピー
mkdir -p "$MERIDIAN/src/lib"
mkdir -p "$MERIDIAN/src/app/api/projects/[id]/attachments/[attachmentId]"
mkdir -p "$MERIDIAN/src/app/(dashboard)/projects/[id]/attachments"
mkdir -p "$MERIDIAN/src/components/attachments"

cp "$SCRIPT_DIR/src/lib/file-upload.ts"                                           "$MERIDIAN/src/lib/file-upload.ts"
cp "$SCRIPT_DIR/src/app/api/projects/[id]/attachments/route.ts"                   "$MERIDIAN/src/app/api/projects/[id]/attachments/route.ts"
cp "$SCRIPT_DIR/src/app/api/projects/[id]/attachments/[attachmentId]/route.ts"    "$MERIDIAN/src/app/api/projects/[id]/attachments/[attachmentId]/route.ts"
cp "$SCRIPT_DIR/src/app/api/projects/[id]/generate/route.ts"                      "$MERIDIAN/src/app/api/projects/[id]/generate/route.ts"
cp "$SCRIPT_DIR/src/app/(dashboard)/projects/[id]/attachments/page.tsx"           "$MERIDIAN/src/app/(dashboard)/projects/[id]/attachments/page.tsx"
cp "$SCRIPT_DIR/src/components/attachments/AttachmentsManager.tsx"                "$MERIDIAN/src/components/attachments/AttachmentsManager.tsx"

echo "✅ ファイルコピー完了"

# 4. DBマイグレーション（手動SQL適用）
echo ""
echo "=== DBマイグレーション ==="
docker exec meridian_postgres psql -U meridian -d meridian_db \
  -f /dev/stdin < "$SCRIPT_DIR/prisma/migrations/20260504_add_attachments/migration.sql" \
  && echo "✅ migration適用完了"

# 5. prisma/schema.prisma に追記
echo ""
echo "=== Prismaスキーマ更新 ==="
python3 << 'PYEOF'
import os
schema_path = os.path.expanduser("~/projects/meridian/prisma/schema.prisma")
addition_path = os.path.join(os.path.dirname(os.path.abspath("__file__")), "prisma/schema_addition.prisma")

with open(schema_path, "r") as f:
    current = f.read()

if "ProjectAttachment" in current:
    print("⚠️  ProjectAttachment already exists in schema.prisma - skipping")
else:
    with open(addition_path, "r") as f:
        addition = f.read()
    with open(schema_path, "a") as f:
        f.write("\n" + addition)
    print("✅ schema.prisma に ProjectAttachment モデルを追記")
PYEOF

# 6. Prisma generate
cd "$MERIDIAN" && npx prisma generate && echo "✅ prisma generate完了"

# 7. ProjectDetailClient にタブ追加
python3 << 'PYEOF'
import re
path = os.path.expanduser("~/projects/meridian/src/components/projects/ProjectDetailClient.tsx")
with open(path, "r") as f:
    content = f.read()

# TABSにAttachmentsタブを追加
old_tabs = 'const TABS = ["概要", "ドキュメント", "WBS"] as const;'
new_tabs = 'const TABS = ["概要", "ドキュメント", "WBS", "添付資料"] as const;'

if "添付資料" in content:
    print("⚠️  添付資料タブは既に存在します")
else:
    content = content.replace(old_tabs, new_tabs)
    # 末尾の </main> の前に添付資料タブコンテンツを追加
    attachment_tab = """
      {/* 添付資料タブ */}
      {tab === "添付資料" && (
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Word / PDF / Markdownを保管し、AI生成の参照資料として活用できます
            </p>
            <a href={`/projects/${project.id}/attachments`}
              className="text-xs text-[#1D6FA4] hover:underline">
              全画面で管理 →
            </a>
          </div>
        </div>
      )}

    </main>"""
    content = content.replace("\n    </main>", attachment_tab, 1)
    with open(path, "w") as f:
        f.write(content)
    print("✅ ProjectDetailClient.tsx に添付資料タブを追加")
PYEOF

echo ""
echo "=== 完了 ==="
echo "npm run dev で起動後、プロジェクト詳細 → 添付資料タブ で確認してください"
