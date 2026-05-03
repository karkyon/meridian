import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import ProjectCard from "@/components/projects/ProjectCard";
import KpiCard from "@/components/projects/KpiCard";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as { id: string; role: string };

  const [projects, totalTasks, doneTasks] = await Promise.all([
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { priorityOrder: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        category: true,
        techStack: true,
        priorityScore: true,
        progressCache: true,
        docCompleteness: true,
        delayRisk: true,
        updatedAt: true,
      },
    }),
    prisma.wbsTask.count(),
    prisma.wbsTask.count({ where: { status: "done" } }),
  ]);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const docRate =
    projects.length > 0
      ? Math.round(
          projects.reduce((s, p) => s + Number(p.docCompleteness), 0) / projects.length
        )
      : 0;

  // 今週完了タスク
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekDone = await prisma.wbsTask.count({
    where: { status: "done", completedAt: { gte: weekStart } },
  });

  return (
    <>
      <TopBar title="ダッシュボード" />
      <main className="flex-1 p-6 space-y-6">
        {/* KPIカード */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="総プロジェクト数" value={projects.length} unit="件" color="blue" />
          <KpiCard label="開発中" value={activeCount} unit="件" color="green" />
          <KpiCard label="今週完了タスク" value={weekDone} unit="件" color="amber" />
          <KpiCard label="ドキュメント整備率" value={docRate} unit="%" color="violet" />
        </div>

        {/* プロジェクト一覧 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">
              プロジェクト一覧
              <span className="ml-2 text-slate-400 font-normal">{projects.length}件</span>
            </h2>
            {user.role === "admin" && (
              <Link
                href="/projects/new"
                className="text-xs bg-[#1A3A5C] text-white px-3 py-1.5 rounded-lg hover:bg-[#2A527A] transition-colors"
              >
                + 新規プロジェクト
              </Link>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📂</div>
              <p className="text-sm">プロジェクトがまだありません</p>
              {user.role === "admin" && (
                <Link
                  href="/projects/new"
                  className="mt-4 inline-block text-sm text-[#1D6FA4] hover:underline"
                >
                  最初のプロジェクトを作成する →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
