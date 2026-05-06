"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const AXES = [
  { key: "impact", label: "Impact（影響）", weight: 3, desc: "ビジネス・技術的影響度" },
  { key: "urgency", label: "Urgency（緊急）", weight: 2, desc: "締め切り・緊急性" },
  { key: "learning", label: "Learning（学習）", weight: 2, desc: "学習・スキルアップ価値" },
  { key: "cost", label: "Cost（コスト）", weight: 1, desc: "実装コスト（高=コスト大）" },
  { key: "motivation", label: "Motivation", weight: 2, desc: "モチベーション・楽しさ" },
] as const;

type Axes = { impact: number; urgency: number; learning: number; cost: number; motivation: number };

function calcScore(a: Axes): number {
  return Math.round(Math.min(100, Math.max(0,
    (a.impact * 3 + a.urgency * 2 + a.learning * 2 + (11 - a.cost) * 1 + a.motivation * 2) / 10
  )));
}

type Project = {
  id: string; name: string; status: string;
  priorityScore: number; priorityOrder: number;
  progressCache: unknown; delayRisk: string | null;
  priorityScores: Array<{ impact: number; urgency: number; learning: number; cost: number; motivation: number; totalScore: number }>;
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-violet-100 text-violet-700",
  active: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABELS: Record<string, string> = {
  planning: "企画中", active: "開発中", paused: "停止中", completed: "完了",
};

export default function PriorityClient({
  initialProjects, role, hasApiKey,
}: {
  initialProjects: Project[];
  role: string;
  hasApiKey: boolean;
}) {
  const isAdmin = role === "admin";
  const [projects, setProjects] = useState(initialProjects);
  const [selectedId, setSelectedId] = useState<string | null>(initialProjects[0]?.id ?? null);
  const [axes, setAxes] = useState<Record<string, Axes>>(() =>
    Object.fromEntries(
      initialProjects.map((p: any) => {
        const latest = p.priorityScores[0];
        return [p.id, latest ? { impact: latest.impact, urgency: latest.urgency, learning: latest.learning, cost: latest.cost, motivation: latest.motivation } : { impact: 5, urgency: 5, learning: 5, cost: 5, motivation: 5 }];
      })
    )
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{ id: string; idx: number } | null>(null);

  const selectedProject = projects.find((p: any) => p.id === selectedId);
  const currentAxes = selectedId ? (axes[selectedId] ?? { impact: 5, urgency: 5, learning: 5, cost: 5, motivation: 5 }) : null;
  const previewScore = currentAxes ? calcScore(currentAxes) : 0;

  function setAxis(key: keyof Axes, value: number) {
    if (!selectedId) return;
    setAxes((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], [key]: value } }));
  }

  async function handleSave() {
    if (!selectedId || !currentAxes) return;
    setSaving(true);
    const res = await fetch(`/api/priority/scores/${selectedId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentAxes }),
    });
    if (res.ok) {
      setProjects((prev) => prev.map((p: any) => p.id === selectedId ? { ...p, priorityScore: previewScore } : p));
      setSaved((prev) => ({ ...prev, [selectedId]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [selectedId]: false })), 2000);
    }
    setSaving(false);
  }

  async function handleAiSuggest() {
    if (!selectedId) return;
    setSuggesting(true);
    setAiReasoning(null);
    const res = await fetch(`/api/priority/suggest/${selectedId}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setAxes((prev) => ({ ...prev, [selectedId]: data.suggested_scores }));
      setAiReasoning(data.reasoning ?? null);
    }
    setSuggesting(false);
  }

  async function handleSaveOrder() {
    await fetch("/api/priority", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: projects.map((p: any, i: number) => ({ project_id: p.id, priority_order: i + 1 })) }),
    });
  }

  // Drag and drop
  function onDragStart(id: string, idx: number) { dragRef.current = { id, idx }; }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (!dragRef.current || dragRef.current.idx === idx) return;
    setProjects((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragRef.current!.idx, 1);
      next.splice(idx, 0, item);
      dragRef.current!.idx = idx;
      return next;
    });
  }
  function onDrop() { handleSaveOrder(); dragRef.current = null; }

  return (
    <main className="flex-1 p-6">
      <div className="flex gap-5 h-full">
        {/* 左列：ランキングリスト */}
        <div className="w-72 shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">優先度ランキング</h2>
            {isAdmin && (
              <span className="text-[10px] text-slate-400">ドラッグで並べ替え</span>
            )}
          </div>
          {projects.map((p: any, idx: number) => (
            <div
              key={p.id}
              draggable={isAdmin}
              onDragStart={() => onDragStart(p.id, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={onDrop}
              onClick={() => { setSelectedId(p.id); setAiReasoning(null); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                selectedId === p.id
                  ? "border-[#1D6FA4] bg-[#1D6FA4]/5 shadow-sm"
                  : "border-slate-100 bg-white hover:border-slate-200"
              } ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <span className="text-xs font-bold text-slate-300 w-5 shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">{p.name}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[p.status] ?? ""}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-[#1A3A5C]">{p.priorityScore}</div>
                <div className="text-[10px] text-slate-400">/ 100</div>
              </div>
            </div>
          ))}
        </div>

        {/* 右列：スコアリングパネル */}
        {selectedProject && currentAxes ? (
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{selectedProject.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">5軸スコアリング</p>
                </div>
                <div className="flex gap-2">
                  {isAdmin && hasApiKey && (
                    <button
                      onClick={handleAiSuggest}
                      disabled={suggesting}
                      className="text-xs px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                    >
                      {suggesting ? "AI提案中..." : "🤖 AI提案"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors ${
                        saved[selectedId!]
                          ? "bg-emerald-500 text-white"
                          : "bg-[#1A3A5C] text-white hover:bg-[#2A527A]"
                      } disabled:opacity-50`}
                    >
                      {saved[selectedId!] ? "✓ 保存済み" : saving ? "保存中..." : "保存"}
                    </button>
                  )}
                </div>
              </div>

              {aiReasoning && (
                <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
                  🤖 {aiReasoning}
                </div>
              )}

              <div className="space-y-4">
                {AXES.map((axis: any) => {
                  const val = currentAxes[axis.key as keyof typeof currentAxes];
                  return (
                    <div key={axis.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <span className="text-xs font-medium text-slate-700">{axis.label}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">×{axis.weight}</span>
                        </div>
                        <span className="text-sm font-bold text-[#1D6FA4] w-6 text-right">{val}</span>
                      </div>
                      <input
                        type="range" min="1" max="10" value={val}
                        onChange={(e) => isAdmin && setAxis(axis.key, parseInt(e.target.value))}
                        disabled={!isAdmin}
                        className="w-full h-1.5 rounded-full accent-[#1D6FA4] disabled:opacity-50"
                      />
                      <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                        <span>1</span>
                        <span className="text-slate-400">{axis.desc}</span>
                        <span>10</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* スコア表示 */}
              <div className="flex items-baseline gap-2 mt-5 pt-4 border-t border-slate-100">
                <span className={`text-5xl font-bold ${previewScore >= 80 ? "text-emerald-600" : previewScore >= 60 ? "text-[#1D6FA4]" : previewScore >= 40 ? "text-amber-500" : "text-red-500"}`}>
                  {previewScore}
                </span>
                <span className="text-sm text-slate-400">/ 100 — 優先度スコア</span>
              </div>
            </div>

            {/* 進捗サマリー */}
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">WBS進捗</span>
                <span className="text-sm font-bold text-slate-700">
                  {Math.round(Number(selectedProject.progressCache))}%
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1D6FA4] rounded-full"
                  style={{ width: `${Math.round(Number(selectedProject.progressCache))}%` }}
                />
              </div>
              <Link href={`/projects/${selectedProject.id}`}
                className="mt-2 inline-block text-xs text-[#1D6FA4] hover:underline">
                プロジェクト詳細 →
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            プロジェクトを選択してください
          </div>
        )}
      </div>
    </main>
  );
}
