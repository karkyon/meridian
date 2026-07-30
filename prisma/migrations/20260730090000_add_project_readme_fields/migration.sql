-- Migration: 20260730090000_add_project_readme_fields
-- 概要タブ強化: Project構造化フィールド追加 + README的CustomDocTypeの追加
-- 安全のため prisma migrate dev は使わず、手動SQLで ADD COLUMN IF NOT EXISTS を使用する
-- （2026-07-30 の DB全リセット事故の再発防止のため）

-- 1) projects テーブルへ構造化フィールドを追加
ALTER TABLE "public"."projects"
  ADD COLUMN IF NOT EXISTS "tagline"               VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "purpose"                TEXT,
  ADD COLUMN IF NOT EXISTS "target_users"           TEXT,
  ADD COLUMN IF NOT EXISTS "scope"                  TEXT,
  ADD COLUMN IF NOT EXISTS "key_features"           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "setup_instructions"     TEXT,
  ADD COLUMN IF NOT EXISTS "env_vars"               JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "external_dependencies"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "license"                VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "roadmap"                TEXT,
  ADD COLUMN IF NOT EXISTS "known_issues"           TEXT,
  ADD COLUMN IF NOT EXISTS "security_notes"         TEXT;

-- 2) グローバル CustomDocType に README を追加（既に存在すれば何もしない）
INSERT INTO "public"."custom_doc_types" (id, key, label, description, sort_order, is_active, created_at)
VALUES (
  gen_random_uuid(),
  'readme',
  'README（プロジェクト説明書）',
  '目的・背景・機能概要・セットアップ手順など、プロジェクト全体を1文書で把握するための説明書',
  0,
  true,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 3) 既存の全プロジェクトに README ドキュメントの空レコードをバックフィル
--    （custom_documents は「実データが存在するグローバルカテゴリのみ一覧表示する」仕様のため、
--     ここで作成しておかないと既存プロジェクトの概要タブに README が出現しない）
INSERT INTO "public"."custom_documents"
  (id, project_id, custom_type_key, custom_type_label, content, completeness, version, ai_generated, created_by, created_at, updated_at)
SELECT
  gen_random_uuid(),
  p.id,
  'readme',
  'README（プロジェクト説明書）',
  '# ' || p.name || E'\n\n## 概要\n（このプロジェクトの一言概要をここに記載してください）\n\n## 背景・目的\n\n\n## 対象ユーザー\n\n\n## 主要機能\n- \n\n## アーキテクチャ概要\n\n\n## ディレクトリ構成\n```\n\n```\n\n## 外部サービス・API依存\n\n\n## 既知の課題・制限事項\n\n\n## ロードマップ\n',
  0,
  1,
  false,
  p.created_by,
  now(),
  now()
FROM "public"."projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."custom_documents" cd
  WHERE cd.project_id = p.id AND cd.custom_type_key = 'readme'
);
