import Link from "next/link";

const statusConfig = {
  planning: { label: "企画中", class: "bg-violet-100 text-violet-700" },
  active: { label: "開発中", class: "bg-blue-100 text-blue-700" },
  paused: { label: "停止中", class: "bg-amber-100 text-amber-700" },
  completed: { label: "完了", class: "bg-emerald-100 text-emerald-700" },
};

const delayConfig = {
  none: null,
  low: { label: "低リスク", class: "text-amber-600" },
  medium: { label: "中リスク", class: "text-orange-600" },
  high: { label: "⚠️ 遅延リスク", class: "text-red-600" },
};

type Project = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  techStack: unknown;
  priorityScore: number;
  progressCache: unknown;
  docCompleteness: unknown;
  delayRisk: string | null;
  updatedAt: Date;
};

export default function ProjectCard({ project }: { project: Project }) {
  const status = statusConfig[project.status as keyof typeof statusConfig] ?? statusConfig.planning;
  const delay = project.delayRisk ? delayConfig[project.delayRisk as keyof typeof delayConfig] : null;
  const progress = Number(project.progressCache);
  const docRate = Number(project.docCompleteness);
  const techStack = Array.isArray(project.techStack) ? project.techStack as string[] : [];

  const progressColor =
    progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500";

  const updatedAgo = (() => {
    const diff = Date.now() - new Date(project.updatedAt).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "今日";
    if (days === 1) return "昨日";
    if (days < 7) return `${days}日前`;
    return `${Math.floor(days / 7)}週間前`;
  })();

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="bg-white rounded-xl border border-slate-100 p-4 hover:border-[#1D6FA4]/40 hover:shadow-sm transition-all cursor-pointer group">
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-800 group-hover:text-[#1A3A5C] line-clamp-1">
            {project.name}
          </h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${status.class}`}>
            {status.label}
          </span>
        </div>

        {/* 遅延警告 */}
        {delay && (
          <div className={`text-[11px] font-medium mb-2 ${delay.class}`}>
            {delay.label}
          </div>
        )}

        {/* 進捗バー */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>進捗</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* テックスタック */}
        {techStack.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {techStack.slice(0, 4).map((tech: any) => (
              <span
                key={tech}
                className="text-[10px] bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded"
              >
                {tech}
              </span>
            ))}
            {techStack.length > 4 && (
              <span className="text-[10px] text-slate-400">+{techStack.length - 4}</span>
            )}
          </div>
        )}

        {/* フッター */}
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>ドキュメント {Math.round(docRate)}%</span>
          <div className="flex items-center gap-2">
            <span className="bg-[#1A3A5C]/10 text-[#1A3A5C] font-semibold px-1.5 py-0.5 rounded text-[10px]">
              P{project.priorityScore}
            </span>
            <span>{updatedAgo}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
