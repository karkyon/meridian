-- Migration: 20260508000004_add_analysis_features
-- 機能実装状況テーブル追加

CREATE TYPE "public"."feature_status" AS ENUM (
  'not_started',
  'partial',
  'completed',
  'unknown'
);

CREATE TYPE "public"."feature_source" AS ENUM (
  'spec',
  'code',
  'both'
);

CREATE TABLE "public"."analysis_features" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "analysis_id"      UUID          NOT NULL,
  "name"             VARCHAR(200)  NOT NULL,
  "description"      TEXT          NOT NULL,
  "status"           "public"."feature_status" NOT NULL DEFAULT 'unknown',
  "source"           "public"."feature_source" NOT NULL DEFAULT 'both',
  "source_note"      TEXT,
  "progress_pct"     INTEGER       NOT NULL DEFAULT 0,
  "location"         VARCHAR(500),
  "spec_ref"         VARCHAR(200),
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "analysis_features_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analysis_features_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "public"."project_analyses"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_analysis_features_analysis"
  ON "public"."analysis_features"("analysis_id");

CREATE INDEX "idx_analysis_features_status"
  ON "public"."analysis_features"("analysis_id", "status");

-- project_analysesにfeature_count追加
ALTER TABLE "public"."project_analyses"
  ADD COLUMN IF NOT EXISTS "feature_count" INTEGER NOT NULL DEFAULT 0;
