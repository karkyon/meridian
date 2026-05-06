"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_CONFIG = {
  todo: { label: "未着手", class: "bg-slate-100 text-slate-600" },
  in_progress: { label: "進行中", class: "bg-blue-100 text-blue-700" },
  done: { label: "完了", class: "bg-emerald-100 text-emerald-700" },
  blocked: { label: "ブロック", class: "bg-red-100 text-red-700" },
};
const PRIORITY_CONFIG = {
  high: { label: "高", class: "text-red-500" },
  mid: { label: "中", class: "text-amber-500" },
  low: { label: "低", class: "text-slate-400" },
};

type Task = {
  id: string; title: string; status: string; priority: string;
  dueDate: Date | null; estimatedHours: unknown; sortOrder: number; aiGenerated: boolean;
};
type Phase = { id: string; name: string; color: string | null; sortOrder: number; tasks: Task[] };

export default function WbsManager({
  projectId, projectName, initialPhases, role, hasApiKey,
}: {
  projectId: string; projectName: string;
  initialPhases: Phase[]; role: string; hasApiKey: boolean;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [phases, setPhases] = useState(initialPhases);
  const [newPhaseInput, setNewPhaseInput] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({});
  const [generatingWbs, setGeneratingWbs] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>(
    Object.fromEntries(initialPhases.map((p: any) => [p.id, true]))
  );
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");

  const allTasks = phases.flatMap((p: any) => p.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t: any) => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  async function addPhase() {
    if (!newPhaseInput.trim()) return;
    setAddingPhase(true);
    const res = await fetch(`/api/projects/${projectId}/wbs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPhaseInput.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setPhases((prev) => [...prev, { ...data.phase, tasks: [] }]);
      setExpandedPhases((prev) => ({ ...prev, [data.phase.id]: true }));
      setNewPhaseInput("");
    }
    setAddingPhase(false);
  }

  async function addTask(phaseId: string) {
    const title = newTaskInputs[phaseId]?.trim();
    if (!title) return;
    const res = await fetch(`/api/projects/${projectId}/wbs/phases/${phaseId}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const data = await res.json();
      setPhases((prev) => prev.map((p: any) =>
        p.id === phaseId ? { ...p, tasks: [...p.tasks, data.task] } : p
      ));
      setNewTaskInputs((prev) => ({ ...prev, [phaseId]: "" }));
    }
  }

  async function updateTaskStatus(taskId: string, phaseId: string, currentStatus: string) {
    if (!isAdmin) return;
    const next = currentStatus === "todo" ? "in_progress"
      : currentStatus === "in_progress" ? "done" : "todo";
    setPhases((prev) => prev.map((p: any) =>
      p.id === phaseId ? { ...p, tasks: p.tasks.map((t: any) => t.id === taskId ? { ...t, status: next } : t) } : p
    ));
    await fetch(`/api/wbs/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function deleteTask(taskId: string, phaseId: string) {
    if (!confirm("このタスクを削除しますか？")) return;
    const res = await fetch(`/api/wbs/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) setPhases((prev) => prev.map((p: any) =>
      p.id === phaseId ? { ...p, tasks: p.tasks.filter((t: any) => t.id !== taskId) } : p
    ));
  }

  async function generateWbs() {
    setGeneratingWbs(true);
    const res = await fetch(`/api/projects/${projectId}/wbs/generate`, { method: "POST" });
    if (res.ok) {
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.event === "done") { router.refresh(); window.location.reload(); }
              } catch { /* ignore */ }
            }
          }
        }
      }
    }
    setGeneratingWbs(false);
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImporting(true);
    let body: object;
    try { body = { ...JSON.parse(importText), mode: importMode }; }
    catch { body = { md: importText, mode: importMode }; }
    const res = await fetch(`/api/projects/${projectId}/wbs/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { window.location.reload(); }
    else { alert("インポートに失敗しました。フォーマットを確認してください。"); }
    setImporting(false);
  }

  return (
    <main className="flex-1 p-6 space-y-4">
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 mb-1">WBSインポート</h3>
            <p className="text-xs text-slate-400 mb-3">JSON形式またはMarkdown形式で貼り付け</p>
            <div className="flex gap-2 mb-3">
              {(["replace", "merge"] as const).map((m: any) => (
                <button key={m} onClick={() => setImportMode(m)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    importMode === m ? "bg-[#1D6FA4] text-white border-[#1D6FA4]" : "border-slate-200 text-slate-500"
                  }`}>
                  {m === "replace" ? "既存を置き換え" : "追加（マージ）"}
                </button>
              ))}
            </div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
              className="w-full h-64 font-mono text-xs border border-slate-200 rounded-xl p-3 resize-none focus:border-[#1D6FA4] focus:outline-none"
              placeholder="JSON: {phases:[{name:...,tasks:[{title:...,status:todo,priority:high}]}]}\n\nMD:\n## Phase 1: 設計\n- [ ] DB設計 [high] [2025-12-01] [8h]\n- [x] 要件確認 [mid]"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowImport(false)}
                className="text-xs px-4 py-2 border border-slate-200 rounded-lg text-slate-500">キャンセル</button>
              <button onClick={handleImport} disabled={importing || !importText.trim()}
                className="text-xs px-4 py-2 bg-[#1D6FA4] text-white rounded-lg hover:bg-[#1a5f8e] disabled:opacity-50">
                {importing ? "インポート中..." : "インポート実行"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:text-slate-600">
          ← {projectName}
        </Link>
        <div className="flex-1" />
        <div className="text-xs text-slate-400">{doneTasks}/{totalTasks} 完了</div>
        <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#1D6FA4] rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-xs font-semibold text-[#1D6FA4]">{progress}%</div>
        {isAdmin && (
          <button onClick={() => setShowImport(true)}
            className="text-xs px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            📥 インポート
          </button>
        )}
        {isAdmin && hasApiKey && (
          <button onClick={generateWbs} disabled={generatingWbs}
            className="text-xs px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors">
            {generatingWbs ? "🤖 生成中..." : "🤖 AI WBS展開"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {phases.map((phase: any) => {
          const total = phase.tasks.length;
          const done = phase.tasks.filter((t: any) => t.status === "done").length;
          const phaseProgress = total > 0 ? Math.round((done / total) * 100) : 0;
          const expanded = expandedPhases[phase.id] !== false;
          return (
            <div key={phase.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedPhases((prev) => ({ ...prev, [phase.id]: !expanded }))}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: phase.color ?? "#1D6FA4" }} />
                <span className="text-sm font-semibold text-slate-800 flex-1">{phase.name}</span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{done}/{total}</span>
                  <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1D6FA4] rounded-full" style={{ width: `${phaseProgress}%` }} />
                  </div>
                  <span>{phaseProgress}%</span>
                </div>
                <span className="text-slate-300 text-xs ml-1">{expanded ? "▲" : "▼"}</span>
              </div>
              {expanded && (
                <>
                  <div className="divide-y divide-slate-50">
                    {phase.tasks.map((task: any) => {
                      const statusCfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.todo;
                      const priCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.mid;
                      const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-slate-50/50">
                          <button onClick={() => updateTaskStatus(task.id, phase.id, task.status)} disabled={!isAdmin}
                            className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                              task.status === "done" ? "border-emerald-500 bg-emerald-500"
                              : task.status === "in_progress" ? "border-blue-400 bg-blue-50"
                              : "border-slate-300 hover:border-[#1D6FA4]"
                            } ${isAdmin ? "cursor-pointer" : "cursor-default"}`}>
                            {task.status === "done" && <span className="text-white text-[10px] font-bold">✓</span>}
                            {task.status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
                          </button>
                          <span className={`flex-1 text-sm ${task.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>
                            {task.title}
                            {task.aiGenerated && <span className="ml-1 text-[10px] text-violet-400">🤖</span>}
                          </span>
                          <span className={`text-[10px] font-semibold ${priCfg.class}`}>{priCfg.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusCfg.class}`}>{statusCfg.label}</span>
                          {task.dueDate && (
                            <span className={`text-[10px] ${overdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                              {new Date(task.dueDate).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {isAdmin && (
                            <button onClick={() => deleteTask(task.id, phase.id)}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-600 transition-opacity">✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 px-4 py-2 border-t border-slate-50">
                      <input type="text" value={newTaskInputs[phase.id] ?? ""}
                        onChange={(e) => setNewTaskInputs((prev) => ({ ...prev, [phase.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") addTask(phase.id); }}
                        placeholder="タスクを追加..."
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:border-[#1D6FA4] focus:outline-none" />
                      <button onClick={() => addTask(phase.id)}
                        className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">追加</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <input type="text" value={newPhaseInput} onChange={(e) => setNewPhaseInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addPhase(); }}
            placeholder="+ 新しいフェーズを追加..."
            className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20" />
          <button onClick={addPhase} disabled={addingPhase}
            className="px-4 py-2.5 bg-[#1A3A5C] text-white text-sm rounded-xl hover:bg-[#2A527A] transition-colors disabled:opacity-60">追加</button>
        </div>
      )}

      {phases.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">WBSがまだありません</p>
          {isAdmin && <p className="text-xs mt-1">フェーズを追加するか、AI WBS展開・インポートを使用してください</p>}
        </div>
      )}
    </main>
  );
}
