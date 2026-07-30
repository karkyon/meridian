-- DropForeignKey
ALTER TABLE "analysis_features" DROP CONSTRAINT "analysis_features_analysis_id_fkey";

-- DropForeignKey
ALTER TABLE "analysis_issues" DROP CONSTRAINT "analysis_issues_analysis_id_fkey";

-- DropForeignKey
ALTER TABLE "analysis_suggested_tasks" DROP CONSTRAINT "analysis_suggested_tasks_analysis_id_fkey";

-- DropForeignKey
ALTER TABLE "project_analyses" DROP CONSTRAINT "project_analyses_created_by_fkey";

-- DropForeignKey
ALTER TABLE "project_analyses" DROP CONSTRAINT "project_analyses_project_id_fkey";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "icon_url" TEXT;

-- AddForeignKey
ALTER TABLE "project_analyses" ADD CONSTRAINT "project_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_analyses" ADD CONSTRAINT "project_analyses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_issues" ADD CONSTRAINT "analysis_issues_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "project_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_suggested_tasks" ADD CONSTRAINT "analysis_suggested_tasks_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "project_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_features" ADD CONSTRAINT "analysis_features_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "project_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
