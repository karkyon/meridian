-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."attachment_type" AS ENUM ('word', 'pdf', 'markdown', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."project_attachments" (
  "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
  "project_id"    UUID          NOT NULL,
  "filename"      VARCHAR(255)  NOT NULL,
  "original_name" VARCHAR(255)  NOT NULL,
  "file_type"     "public"."attachment_type" NOT NULL DEFAULT 'other',
  "mime_type"     VARCHAR(100)  NOT NULL,
  "file_size"     INTEGER       NOT NULL,
  "storage_path"  VARCHAR(500)  NOT NULL,
  "description"   TEXT,
  "extracted_text" TEXT,
  "used_for_generation" BOOLEAN NOT NULL DEFAULT false,
  "created_by"    UUID,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "project_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."project_attachments"
  ADD CONSTRAINT "project_attachments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE "public"."project_attachments"
  ADD CONSTRAINT "project_attachments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_project_attachments_project_id"
  ON "public"."project_attachments" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_project_attachments_created_at"
  ON "public"."project_attachments" ("created_at" DESC);
