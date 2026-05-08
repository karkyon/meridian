-- raw_ai_response カラム追加（AIの生レスポンスを完全保存）
ALTER TABLE "public"."project_analyses" ADD COLUMN IF NOT EXISTS "raw_ai_response" TEXT;