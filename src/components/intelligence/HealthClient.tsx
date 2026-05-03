"use client";

import { useState } from "react";
import Link from "next/link";

const riskConfig = {
  low: { label: "正常", class: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  medium: { label: "注意", class: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  high: { label: "危険", class: "bg-orange-100 text-orange-700", bar: "bg-orange-500" },
  critical: { label: "重大", class: "bg-red-100 text-red-700", bar: "bg-red-500" },
};

const statusConfig = {
  latest: { label: "最新", class: "text-emerald-600" },
  minor_behind: { label: "マイナー遅れ", class: "text-amber-600" },
  major_behind: { label: "メジャー遅れ", class: "text-orange-600" },
  deprecated: { label: "非推奨", class: "text-red-600" },
  eol: { label: "EOL", class: "text-red-700 font-bold" },
};

type HealthScore = {
  id: string;
  techName: string;
  currentVersion: string | null;
  latestVersion: string | null;
  status: string;
  riskLevel: string;
  notes: string | null;
  evaluatedAt: Date;
};

type Project = {
  id: string;
  name: string;
  techStack: unknown;
  healthScore: number | null;
  healthScores: HealthScore[];
};

export default function HealthClient({
  projects,
  hasApiKey,
  role,
}: {
  projects: Project[];
  hasApiKey: boolean;
  role: string;
}) {
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { overall_score: number; techs: HealthScore[] }>>({});

  async function evaluate(projectId: string) {
    setEvaluating(projectId);
    try {
      const res = await fetch(`/api/intelligence/health/${projectId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResults((prev) => ({ ...prev, [projectId]: data }));
      }
    } finally {
      setEvaluating(null);
    }
  }

  return (
    <main className="flex-1 p-6 space-y-5">
      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2.5">
          <span className="text-amber-500">⚠️</span>
          <span className="text-xs text-amber-700">Claude APIキーが未設定です。</span>
          <Link href="/settings" className="text-xs text-amber-600 underline">設定画面へ</Link>
        </div>
      )}

      <div className="space-y-4">
        {projects.map((project) => {
          const techStack = Array.isArray(project.techStack) ? (project.techStack as string[]) : [];
          const result = results[project.id];
          const scores = result?.techs ?? project.healthScores;
          const overallScore = result?.overall_score ?? project.healthScore;

          return (
            <div key={project.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{project.name}</h3>
                    {overallScore !== null && (
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        overallScore >= 80 ? "bg-emerald-100 text-emerald-700"
                        : overallScore >= 60 ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                      }`}>
                        {overallScore}点
                      </div>
                    )}
                  </div>
                  {techStack.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {techStack.map((t) => (
                        <span key={t} className="text-[10px] bg-slate-50 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {role === "admin" && hasApiKey && (
                  <button
                    onClick={() => evaluate(project.id)}
                    disabled={evaluating === project.id}
                    className="text-xs px-3 py-1.5 border border-[#1D6FA4] text-[#1D6FA4] rounded-lg hover:bg-[#1D6FA4]/5 disabled:opacity-50 transition-colors"
                  >
                    {evaluating === project.id ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        評価中
                      </span>
                    ) : "AI評価"}
                  </button>
                )}
              </div>

              {scores.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {scores.map((tech, i) => {
                    const risk = riskConfig[tech.riskLevel as keyof typeof riskConfig] ?? riskConfig.low;
                    const status = statusConfig[tech.status as keyof typeof statusConfig] ?? statusConfig.latest;
                    return (
                      <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="w-28 shrink-0">
                          <div className="text-xs font-medium text-slate-700">{tech.techName}</div>
                          {tech.currentVersion && (
                            <div className="text-[10px] text-slate-400">v{tech.currentVersion}</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium ${status.class}`}>{status.label}</span>
                            {tech.latestVersion && (
                              <span className="text-[10px] text-slate-400">→ v{tech.latestVersion}</span>
                            )}
                          </div>
                          {tech.notes && (
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{tech.notes}</div>
                          )}
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${risk.class}`}>
                          {risk.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-4 text-xs text-slate-400 text-center">
                  {techStack.length === 0 ? "技術スタックが設定されていません"
                    : role === "admin" ? "「AI評価」ボタンで評価を実行してください"
                    : "評価未実施"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
