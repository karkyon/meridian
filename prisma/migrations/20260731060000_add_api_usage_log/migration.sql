-- Migration: 20260731060000_add_api_usage_log
-- AI機能横断のAPI使用量・コストトラッキング用テーブル。
-- これまで「APIコスト」画面は ProjectAnalysis（総合分析機能）のトークン数のみを
-- 集計しており、事業性分析・概要自動入力など他のAI機能の使用量が一切
-- 反映されていなかった（$0.000000のまま）。これを解消するための土台。
-- 安全のため prisma migrate dev は使わず、手動SQLで適用する。

CREATE TABLE IF NOT EXISTS "public"."api_usage_logs" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature"            VARCHAR(50) NOT NULL,
    "project_id"         UUID,
    "model"              VARCHAR(50) NOT NULL,
    "input_tokens"       INTEGER NOT NULL,
    "output_tokens"      INTEGER NOT NULL,
    "estimated_cost_usd" DECIMAL(10, 6) NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_api_usage_logs_created_at" ON "public"."api_usage_logs"("created_at");
CREATE INDEX IF NOT EXISTS "idx_api_usage_logs_feature" ON "public"."api_usage_logs"("feature");

ALTER TABLE "public"."api_usage_logs"
  ADD CONSTRAINT "api_usage_logs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
