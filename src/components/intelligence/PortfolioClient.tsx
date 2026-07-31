"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const CATEGORY_DEFS = [
  { key: "profitability", label: "収益性" },
  { key: "competitive_moat", label: "競合優位性" },
  { key: "risk", label: "リスク低さ" },
  { key: "durability", label: "永続性" },
  { key: "scalability", label: "展開性" },
  { key: "feasibility", label: "実現可能性" },
  { key: "time_to_revenue", label: "収益化速度" },
  { key: "market_fit", label: "市場適合性" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  planning: "企画中", active: "開発中", paused: "停止中", completed: "完了",
};
const STATUS_COLORS: Record<string, string> = {
  planning: "bg-violet-100 text-violet-700",
  active: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

type Row = {
  id: string;
  name: string;
  status: string;
  progress: number;
  priority_score: number;
  overall_score: number | null;
  analyzed_at: string | null;
  categories: Record<string, number | null>;
};

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] text-slate-500 w-6 text-right">{score}</span>
    </div>
  );
}

export default function PortfolioClient({ initialProjects, role }: { initialProjects: Row[]; role: string }) {
  const [sortKey, setSortKey] = useState<string>("overall_score");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo(() => {
    const copy = [...initialProjects];
    copy.sort((a, b) => {
      const av = sortKey === "overall_score" ? a.overall_score
        : sortKey === "progress" ? a.progress
        : sortKey === "priority_score" ? a.priority_score
        : a.categories[sortKey];
      const bv = sortKey === "overall_score" ? b.overall_score
        : sortKey === "progress" ? b.progress
        : sortKey === "priority_score" ? b.priority_score
        : b.categories[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return copy;
  }, [initialProjects, sortKey, sortDesc]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const analyzedCount = initialProjects.filter((p) => p.overall_score !== null).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-700">ポートフォリオ分析</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            全{initialProjects.length}プロジェクト中 {analyzedCount}件が事業性分析済み。各プロジェクトの「事業性分析」タブから分析を実行してください。
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-xs min-w-[1100px]">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">プロジェクト</th>
              <th className="text-left px-3 py-2 font-medium">ステータス</th>
              <th className="text-left px-3 py-2 font-medium cursor-pointer hover:text-slate-600" onClick={() => toggleSort("progress")}>
                進捗 {sortKey === "progress" && (sortDesc ? "▼" : "▲")}
              </th>
              <th className="text-left px-3 py-2 font-medium cursor-pointer hover:text-slate-600" onClick={() => toggleSort("overall_score")}>
                総合スコア {sortKey === "overall_score" && (sortDesc ? "▼" : "▲")}
              </th>
              {CATEGORY_DEFS.map((c) => (
                <th key={c.key} className="text-left px-3 py-2 font-medium cursor-pointer hover:text-slate-600 whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                  {c.label} {sortKey === c.key && (sortDesc ? "▼" : "▲")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <Link href={`/projects/${p.id}/business-analysis`} className="font-medium text-slate-700 hover:text-[#1D6FA4] hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-500">{p.progress.toFixed(0)}%</td>
                <td className="px-3 py-2.5 w-28">
                  {p.overall_score !== null
                    ? <span className="font-bold text-slate-800">{p.overall_score}</span>
                    : <span className="text-slate-300">未分析</span>}
                </td>
                {CATEGORY_DEFS.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 w-24">
                    <ScoreBar score={p.categories[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
