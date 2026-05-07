-- AlterEnum
ALTER TYPE "attachment_type" ADD VALUE 'html';

-- AlterEnum
ALTER TYPE "doc_type" ADD VALUE 'wireframe';

-- DropForeignKey
ALTER TABLE "project_attachments" DROP CONSTRAINT "project_attachments_created_by_fkey";

-- DropForeignKey
ALTER TABLE "project_attachments" DROP CONSTRAINT "project_attachments_project_id_fkey";

-- AlterTable
ALTER TABLE "project_attachments" ADD COLUMN     "doc_type" VARCHAR(50);

-- CreateTable
CREATE TABLE "custom_doc_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_doc_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_custom_doc_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_custom_doc_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "custom_type_key" VARCHAR(100) NOT NULL,
    "custom_type_label" VARCHAR(200) NOT NULL,
    "content" TEXT,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "custom_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_document_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "custom_doc_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "extracted_text" TEXT,
    "is_editable" BOOLEAN NOT NULL DEFAULT false,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "custom_doc_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "extracted_text" TEXT,
    "is_editable" BOOLEAN NOT NULL DEFAULT false,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_doc_types_key_key" ON "custom_doc_types"("key");

-- CreateIndex
CREATE INDEX "idx_custom_doc_types_sort" ON "custom_doc_types"("sort_order");

-- CreateIndex
CREATE INDEX "idx_project_custom_doc_types_project" ON "project_custom_doc_types"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_custom_doc_types_project_key_uq" ON "project_custom_doc_types"("project_id", "key");

-- CreateIndex
CREATE INDEX "idx_custom_documents_project" ON "custom_documents"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_documents_project_type_uq" ON "custom_documents"("project_id", "custom_type_key");

-- CreateIndex
CREATE INDEX "idx_custom_document_files_doc" ON "custom_document_files"("custom_doc_id");

-- CreateIndex
CREATE INDEX "idx_custom_document_versions_doc" ON "custom_document_versions"("custom_doc_id", "version");

-- CreateIndex
CREATE INDEX "idx_document_files_doc" ON "document_files"("document_id");

-- AddForeignKey
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_custom_doc_types" ADD CONSTRAINT "project_custom_doc_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_documents" ADD CONSTRAINT "custom_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_documents" ADD CONSTRAINT "custom_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_documents" ADD CONSTRAINT "custom_documents_custom_type_key_fkey" FOREIGN KEY ("custom_type_key") REFERENCES "custom_doc_types"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_document_files" ADD CONSTRAINT "custom_document_files_custom_doc_id_fkey" FOREIGN KEY ("custom_doc_id") REFERENCES "custom_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_document_files" ADD CONSTRAINT "custom_document_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_document_versions" ADD CONSTRAINT "custom_document_versions_custom_doc_id_fkey" FOREIGN KEY ("custom_doc_id") REFERENCES "custom_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
