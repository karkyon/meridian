-- prisma/migrations/20260508000001_add_project_tech_stacks/migration.sql

-- CreateEnum
CREATE TYPE "tech_category" AS ENUM (
  'language',
  'frontend',
  'backend',
  'database',
  'orm',
  'auth',
  'infra',
  'ai_ml',
  'testing',
  'tooling',
  'other'
);

-- CreateTable
CREATE TABLE "project_tech_stacks" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID         NOT NULL,
  "name"       VARCHAR(100) NOT NULL,
  "category"   "tech_category" NOT NULL DEFAULT 'other',
  "version"    VARCHAR(50),
  "notes"      TEXT,
  "sort_order" INTEGER      NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_tech_stacks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "project_tech_stacks"
  ADD CONSTRAINT "project_tech_stacks_project_id_fkey"
  FOREIGN KEY ("project_id")
  REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_tech_stacks_project_name"
  ON "project_tech_stacks"("project_id", "name");

CREATE INDEX "idx_project_tech_stacks_project_id"
  ON "project_tech_stacks"("project_id");

CREATE INDEX "idx_project_tech_stacks_name"
  ON "project_tech_stacks"("name");

CREATE INDEX "idx_project_tech_stacks_category"
  ON "project_tech_stacks"("category");

-- -------------------------------------------------------
-- 既存 tech_stack JSONB データを新テーブルへ移行
-- （既存プロジェクトの string[] を other カテゴリとして移行）
-- -------------------------------------------------------
INSERT INTO "project_tech_stacks" ("project_id", "name", "category", "sort_order")
SELECT
  p.id                          AS project_id,
  elem.value::text              AS name,
  'other'::"tech_category"      AS category,
  (elem.ordinality - 1)::int    AS sort_order
FROM
  "projects" p,
  jsonb_array_elements_text(p.tech_stack) WITH ORDINALITY AS elem(value, ordinality)
WHERE
  jsonb_typeof(p.tech_stack) = 'array'
  AND jsonb_array_length(p.tech_stack) > 0
ON CONFLICT ("project_id", "name") DO NOTHING;
