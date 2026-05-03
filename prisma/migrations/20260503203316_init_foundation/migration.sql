-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'viewer');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('planning', 'active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "doc_type" AS ENUM ('planning', 'requirements', 'external_spec', 'db_spec', 'api_spec');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('todo', 'in_progress', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('high', 'mid', 'low');

-- CreateEnum
CREATE TYPE "delay_risk" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "health_status" AS ENUM ('latest', 'minor_behind', 'major_behind', 'deprecated', 'eol');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "dependency_relation" AS ENUM ('depends_on', 'shares_code', 'similar_domain');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGOUT', 'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE', 'DOCUMENT_SAVE', 'DOCUMENT_AI_GENERATE', 'WBS_TASK_CREATE', 'WBS_TASK_UPDATE', 'WBS_TASK_DELETE', 'PRIORITY_UPDATE', 'USER_CREATE', 'USER_DELETE', 'USER_ROLE_CHANGE', 'USER_UNLOCK', 'SESSION_REVOKE', 'SETTINGS_UPDATE', 'API_KEY_UPDATE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'viewer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "last_login_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_token" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "expires" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "action" "audit_action" NOT NULL,
    "resource_type" VARCHAR(50),
    "resource_id" UUID,
    "resource_name" VARCHAR(255),
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claude_api_key_encrypted" TEXT,
    "key_iv" VARCHAR(32),
    "weekly_summary_day" VARCHAR(10) NOT NULL DEFAULT 'monday',
    "focus_mode_count" INTEGER NOT NULL DEFAULT 3,
    "session_timeout_hours" INTEGER NOT NULL DEFAULT 8,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'planning',
    "category" VARCHAR(100),
    "tech_stack" JSONB NOT NULL DEFAULT '[]',
    "repository_url" VARCHAR(500),
    "notes" TEXT,
    "priority_score" INTEGER NOT NULL DEFAULT 50,
    "priority_order" INTEGER NOT NULL DEFAULT 0,
    "progress_cache" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "doc_completeness" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "health_score" INTEGER,
    "delay_risk" "delay_risk",
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "doc_type" "doc_type" NOT NULL,
    "content" TEXT,
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_prompt_hint" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "embedding_updated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_phases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(7) DEFAULT '#1D6FA4',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phase_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'todo',
    "priority" "task_priority" NOT NULL DEFAULT 'mid',
    "due_date" DATE,
    "estimated_hours" DECIMAL(5,1),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wbs_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "impact" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "learning" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "motivation" INTEGER NOT NULL,
    "total_score" INTEGER NOT NULL,
    "ai_suggested" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "tech_name" VARCHAR(100) NOT NULL,
    "current_version" VARCHAR(50),
    "latest_version" VARCHAR(50),
    "status" "health_status" NOT NULL DEFAULT 'latest',
    "risk_level" "risk_level" NOT NULL DEFAULT 'low',
    "notes" TEXT,
    "evaluated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "week_start" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "focus_task_ids" JSONB,
    "generated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "depends_on_id" UUID NOT NULL,
    "relation_type" "dependency_relation" NOT NULL DEFAULT 'depends_on',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_locked_until" ON "users"("locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_sessions_token" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_expires" ON "sessions"("expires");

-- CreateIndex
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_projects_status" ON "projects"("status");

-- CreateIndex
CREATE INDEX "idx_projects_priority_order" ON "projects"("priority_order");

-- CreateIndex
CREATE INDEX "idx_projects_updated_at" ON "projects"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_documents_project_doc_type" ON "documents"("project_id", "doc_type");

-- CreateIndex
CREATE UNIQUE INDEX "uq_documents_project_doc_type" ON "documents"("project_id", "doc_type");

-- CreateIndex
CREATE INDEX "idx_document_versions_document_id" ON "document_versions"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_versions_doc_ver" ON "document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "idx_wbs_phases_project_sort" ON "wbs_phases"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_wbs_tasks_phase_id" ON "wbs_tasks"("phase_id");

-- CreateIndex
CREATE INDEX "idx_wbs_tasks_status" ON "wbs_tasks"("status");

-- CreateIndex
CREATE INDEX "idx_wbs_tasks_due_date" ON "wbs_tasks"("due_date");

-- CreateIndex
CREATE INDEX "idx_rag_embeddings_document_id" ON "rag_embeddings"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_rag_embeddings_doc_chunk" ON "rag_embeddings"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "idx_priority_scores_project_date" ON "priority_scores"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_health_scores_project_id" ON "health_scores"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_summaries_week_start_key" ON "weekly_summaries"("week_start");

-- CreateIndex
CREATE INDEX "idx_weekly_summaries_week_start" ON "weekly_summaries"("week_start" DESC);

-- CreateIndex
CREATE INDEX "idx_project_deps_project_id" ON "project_dependencies"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_deps_depends_on_id" ON "project_dependencies"("depends_on_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_dependencies" ON "project_dependencies"("project_id", "depends_on_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_phases" ADD CONSTRAINT "wbs_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_tasks" ADD CONSTRAINT "wbs_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "wbs_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_embeddings" ADD CONSTRAINT "rag_embeddings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_scores" ADD CONSTRAINT "priority_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_scores" ADD CONSTRAINT "priority_scores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_scores" ADD CONSTRAINT "health_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
