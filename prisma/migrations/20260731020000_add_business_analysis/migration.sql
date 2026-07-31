-- Migration: 20260731020000_add_business_analysis
-- 事業性分析（収益性・競合優位性・リスク・永続性・展開・実現可能性・
-- 収益化までの期間・市場適合性の8カテゴリ）を追加。
-- 安全のため prisma migrate dev は使わず、手動SQLで適用する
-- （2026-07-30 の DB全リセット事故の再発防止のため）

-- 1) projects テーブルへキャッシュ用カラムを追加
ALTER TABLE "public"."projects"
  ADD COLUMN IF NOT EXISTS "business_score" INTEGER;

-- 2) BusinessCategory enum
DO $$ BEGIN
  CREATE TYPE "business_category" AS ENUM (
    'profitability', 'competitive_moat', 'risk', 'durability',
    'scalability', 'feasibility', 'time_to_revenue', 'market_fit'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) business_analyses テーブル（スナップショット本体）
CREATE TABLE IF NOT EXISTS "public"."business_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "summary" TEXT,
    "ai_suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_analyses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_business_analyses_project_id"
  ON "public"."business_analyses"("project_id", "created_at");

ALTER TABLE "public"."business_analyses"
  ADD CONSTRAINT "business_analyses_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."business_analyses"
  ADD CONSTRAINT "business_analyses_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) business_analysis_categories テーブル（8カテゴリ分の明細）
CREATE TABLE IF NOT EXISTS "public"."business_analysis_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_id" UUID NOT NULL,
    "category" "business_category" NOT NULL,
    "score" INTEGER NOT NULL,
    "rationale" TEXT,
    "advice" TEXT,
    "ai_suggested_score" INTEGER,
    "manually_overridden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "business_analysis_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_analysis_categories_analysis_id_category_key"
  ON "public"."business_analysis_categories"("analysis_id", "category");

ALTER TABLE "public"."business_analysis_categories"
  ADD CONSTRAINT "business_analysis_categories_analysis_id_fkey"
  FOREIGN KEY ("analysis_id") REFERENCES "public"."business_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
