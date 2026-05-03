#!/usr/bin/env bash
# Phase 2 デプロイスクリプト
# 実行: bash deploy_phase2.sh
# 前提: ~/projects/meridian が存在すること

set -euo pipefail

MERIDIAN_DIR="$HOME/projects/meridian"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Phase 2 デプロイ開始 ==="
echo "デプロイ先: $MERIDIAN_DIR"

# ディレクトリ存在確認
if [ ! -d "$MERIDIAN_DIR" ]; then
  echo "❌ $MERIDIAN_DIR が存在しません"
  exit 1
fi

# ファイルを配置
echo "📁 ディレクトリ作成..."
mkdir -p "$MERIDIAN_DIR/src/lib"
mkdir -p "$MERIDIAN_DIR/src/app/api/auth/[...nextauth]"
mkdir -p "$MERIDIAN_DIR/src/app/api/auth/setup"
mkdir -p "$MERIDIAN_DIR/src/app/(auth)/login"
mkdir -p "$MERIDIAN_DIR/src/app/(auth)/setup"
mkdir -p "$MERIDIAN_DIR/src/app/dashboard"
mkdir -p "$MERIDIAN_DIR/src/components/auth"

echo "📄 ファイルをコピー..."

# 各ファイルをコピー
cp "$SCRIPT_DIR/src/lib/auth.ts"                                         "$MERIDIAN_DIR/src/lib/auth.ts"
cp "$SCRIPT_DIR/src/lib/auth.config.ts"                                  "$MERIDIAN_DIR/src/lib/auth.config.ts"
cp "$SCRIPT_DIR/src/app/api/auth/[...nextauth]/route.ts"                 "$MERIDIAN_DIR/src/app/api/auth/[...nextauth]/route.ts"
cp "$SCRIPT_DIR/src/app/api/auth/setup/route.ts"                         "$MERIDIAN_DIR/src/app/api/auth/setup/route.ts"
cp "$SCRIPT_DIR/src/app/(auth)/login/page.tsx"                           "$MERIDIAN_DIR/src/app/(auth)/login/page.tsx"
cp "$SCRIPT_DIR/src/app/(auth)/login/actions.ts"                         "$MERIDIAN_DIR/src/app/(auth)/login/actions.ts"
cp "$SCRIPT_DIR/src/app/(auth)/setup/page.tsx"                           "$MERIDIAN_DIR/src/app/(auth)/setup/page.tsx"
cp "$SCRIPT_DIR/src/app/(auth)/layout.tsx"                               "$MERIDIAN_DIR/src/app/(auth)/layout.tsx"
cp "$SCRIPT_DIR/src/app/page.tsx"                                        "$MERIDIAN_DIR/src/app/page.tsx"
cp "$SCRIPT_DIR/src/app/dashboard/page.tsx"                              "$MERIDIAN_DIR/src/app/dashboard/page.tsx"
cp "$SCRIPT_DIR/src/components/auth/LoginForm.tsx"                       "$MERIDIAN_DIR/src/components/auth/LoginForm.tsx"
cp "$SCRIPT_DIR/src/components/auth/SetupForm.tsx"                       "$MERIDIAN_DIR/src/components/auth/SetupForm.tsx"
cp "$SCRIPT_DIR/middleware.ts"                                            "$MERIDIAN_DIR/middleware.ts"

echo ""
echo "✅ 全ファイルコピー完了"
echo ""
echo "=== 次のステップ ==="
echo "1. cd $MERIDIAN_DIR"
echo "2. npm install  # next-auth 追加インストール確認"
echo "3. npm run dev"
echo "4. ブラウザで http://localhost:3000/setup を開く"
echo ""
echo "=== ファイル一覧 ==="
find "$MERIDIAN_DIR/src" -name "*.ts" -o -name "*.tsx" | grep -v node_modules | sort
echo ""
ls "$MERIDIAN_DIR/middleware.ts" && echo "✅ middleware.ts"
