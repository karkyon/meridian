-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'IMPORT_KEY_CREATE';
ALTER TYPE "audit_action" ADD VALUE 'IMPORT_KEY_REVOKE';

-- CreateTable
CREATE TABLE "import_api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "created_by" UUID,
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_api_keys_key_hash_key" ON "import_api_keys"("key_hash");
CREATE INDEX "idx_import_api_keys_created_by" ON "import_api_keys"("created_by");

-- AddForeignKey
ALTER TABLE "import_api_keys"
  ADD CONSTRAINT "import_api_keys_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
