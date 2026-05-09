-- Migration: 20260509000005_add_analysis_debug_fields
-- 分析実行モード・プロンプトログ・トークン数・コスト・モデル名・ループ数追加

CREATE TYPE "public"."execution_mode" AS ENUM (
  'ai',
  'manual'
);

ALTER TABLE "public"."project_analyses"
  ADD COLUMN IF NOT EXISTS "execution_mode"      "public"."execution_mode" NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS "prompt_log"           JSONB,
  ADD COLUMN IF NOT EXISTS "input_tokens"         INTEGER,
  ADD COLUMN IF NOT EXISTS "output_tokens"        INTEGER,
  ADD COLUMN IF NOT EXISTS "estimated_cost_usd"   DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "model_used"           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "loop_count"           INTEGER,
  ADD COLUMN IF NOT EXISTS "github_files_scanned" INTEGER,
  ADD COLUMN IF NOT EXISTS "created_by"           UUID REFERENCES "public"."users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_project_analyses_execution_mode"
  ON "public"."project_analyses"("execution_mode");
