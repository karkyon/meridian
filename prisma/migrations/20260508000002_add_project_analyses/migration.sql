-- ============================================================
-- Migration: 20260508000002_add_project_analyses
-- システム総合分析テーブル群の追加
-- ============================================================

-- Enum: analysis_status
CREATE TYPE "public"."analysis_status" AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

-- Enum: issue_severity
CREATE TYPE "public"."issue_severity" AS ENUM (
  'critical',
  'high',
  'medium',
  'low'
);

-- Enum: issue_category
CREATE TYPE "public"."issue_category" AS ENUM (
  'code_doc_mismatch',
  'tech_stack_mismatch',
  'missing_implementation',
  'db_inconsistency',
  'security_concern',
  'tech_debt',
  'missing_test',
  'other'
);

-- Table: project_analyses（分析セッション）
CREATE TABLE "public"."project_analyses" (
  "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
  "project_id"            UUID          NOT NULL,
  "status"                "public"."analysis_status" NOT NULL DEFAULT 'pending',
  "github_commit_sha"     VARCHAR(40),
  "doc_versions"          JSONB,
  "tech_stack_count"      INTEGER       NOT NULL DEFAULT 0,
  "overall_score"         INTEGER,
  "summary"               TEXT,
  "strengths"             JSONB,
  "immediate_actions"     JSONB,
  "issue_count"           INTEGER       NOT NULL DEFAULT 0,
  "critical_count"        INTEGER       NOT NULL DEFAULT 0,
  "suggested_task_count"  INTEGER       NOT NULL DEFAULT 0,
  "error_message"         TEXT,
  "started_at"            TIMESTAMPTZ,
  "completed_at"          TIMESTAMPTZ,
  "created_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "project_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_analyses_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_project_analyses_project_date"
  ON "public"."project_analyses"("project_id", "created_at" DESC);

CREATE INDEX "idx_project_analyses_status"
  ON "public"."project_analyses"("status");

-- Table: analysis_issues（検出された課題）
CREATE TABLE "public"."analysis_issues" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
  "analysis_id"  UUID          NOT NULL,
  "severity"     "public"."issue_severity" NOT NULL,
  "category"     "public"."issue_category" NOT NULL,
  "title"        VARCHAR(300)  NOT NULL,
  "description"  TEXT          NOT NULL,
  "location"     VARCHAR(500),
  "suggestion"   TEXT,
  "resolved"     BOOLEAN       NOT NULL DEFAULT FALSE,
  "resolved_at"  TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "analysis_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analysis_issues_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "public"."project_analyses"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_analysis_issues_analysis_severity"
  ON "public"."analysis_issues"("analysis_id", "severity");

CREATE INDEX "idx_analysis_issues_resolved"
  ON "public"."analysis_issues"("resolved");

-- Table: analysis_suggested_tasks（提案WBSタスク候補）
CREATE TABLE "public"."analysis_suggested_tasks" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "analysis_id"      UUID          NOT NULL,
  "title"            VARCHAR(500)  NOT NULL,
  "description"      TEXT,
  "priority"         "public"."task_priority" NOT NULL DEFAULT 'mid',
  "phase_name"       VARCHAR(255)  NOT NULL,
  "estimated_hours"  DECIMAL(5,1),
  "issue_ref"        TEXT,
  "imported"         BOOLEAN       NOT NULL DEFAULT FALSE,
  "imported_task_id" UUID,
  "imported_at"      TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "analysis_suggested_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analysis_suggested_tasks_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "public"."project_analyses"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_analysis_suggested_tasks_analysis"
  ON "public"."analysis_suggested_tasks"("analysis_id");

CREATE INDEX "idx_analysis_suggested_tasks_imported"
  ON "public"."analysis_suggested_tasks"("imported");

-- AuditActionにANALYSIS_RUN追加
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'ANALYSIS_RUN';
