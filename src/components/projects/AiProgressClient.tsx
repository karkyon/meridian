// src/components/projects/AiProgressClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { AiProgressResult, TaskInference } from "@/app/api/projects/[id]/ai-progress/route";

type Props = {
  projectId: string;
  projectName: string;
  repositoryUrl: string;
  hasGithubPat: boolean;
};

const confidenceColor = (c: number) =>
  c >= 80 ? "text-emerald-600 bg-emerald-50" :
  c >= 60 ? "text-[#1D6FA4] bg-[#D6EAF8]" :
  c >= 40 ? "text-amber-600 bg-amber-50" :
  "text-slate-400 bg-slate-50";

const statusLabel: Record<string, string> = {
  done: "実装済み",
  in_progress: "実装中",
  todo: "未着手",
};
const statusColor: Record<string, string> = {
  done: "text-emerald-600 bg-emerald-50",
  in_progress: "text-[#1D6FA4] bg-[#D6EAF8]",
  todo: "text-slate-400 bg-slate-50",
};
const borderColor: Record<string, string> = {
  done: "border-l-emerald-500",
  in_progress: "border-l-[#1D6FA4]",
  todo: "border-l-slate-200",
};

export default function AiProgressClient({ projectId, projectName, repositoryUrl, hasGithubPat }: Props) {
  const [result, setResult] = useState<AiProgressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    setApplyDone(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-progress`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "UNKNOWN_ERROR"); return; }
      setResult(data);
      // suggestUpdate=true のタスクをデフォルト選択
      const defaultSelected = new Set(
        (data.tasks as TaskInference[])
          .filter((t) => t.suggestUpdate)
          .map((t) => t.taskId)
      );
      setSelected(defaultSelected);
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (selected.size === 0 || !result) return;
    setApplying(true);
    const updates = result.tasks
      .filter((t) => selected.has(t.taskId))
      .map((t) => ({ taskId: t.taskId, status: t.inferredStatus }));
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-progress/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) setApplyDone(true);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:text-slate-600">
          ← {projectName}
        </Link>
        <h1 className="text-sm font-semibold text-[#1A3A5C] flex-1">AI進捗推定</h1>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="text-xs px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>分析中（30秒程度）...</>
          ) : "🤖 AI推定を実行"}
        </button>
      </div>

      {/* 注意書き */}
      {!result && !loading && (
        <div className="border border-slate-100 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">🤖</div>
          <p className="text-sm font-medium text-[#1A3A5C] mb-1">GitHubコードからWBSの実装状況を推定します</p>
          <p className="text-xs text-slate-400 mb-1">
            {repositoryUrl ? `対象: ${repositoryUrl}` : "⚠ リポジトリURLが未設定 — WBSのみで推定します"}
          </p>
          {!hasGithubPat && (
            <p className="text-xs text-amber-600">GitHub PAT未設定。<Link href="/settings" className="underline">設定</Link>から登録すると精度が上がります。</p>
          )}
          <p className="text-xs text-slate-400 mt-3">Claude Haiku モデルを使用（低コスト）</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          エラー: {error}
        </div>
      )}

      {result && (
        <>
          {/* サマリー */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2.5 text-xs text-slate-500">
            <span className="text-emerald-600 font-medium">✓ 推定完了</span>
            <span>{new Date(result.analyzedAt).toLocaleString("ja-JP")}</span>
            <span className="ml-auto">{result.inferenceAccuracyNote}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-100 rounded-lg p-3.5 text-center">
              <div className="text-3xl font-semibold text-[#1A3A5C]">{result.estimatedCompletionRate}%</div>
              <div className="text-xs text-slate-400 mt-1">AI推定完了率</div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-2">
                <div className="h-1.5 bg-[#1D6FA4] rounded-full" style={{ width: `${result.estimatedCompletionRate}%` }} />
              </div>
            </div>
            <div className="border border-slate-100 rounded-lg p-3.5 text-center">
              <div className="text-3xl font-semibold text-emerald-600">{result.estimatedDoneCount}</div>
              <div className="text-xs text-slate-400 mt-1">実装済み推定 / {result.totalTasks}タスク</div>
            </div>
            <div className="border border-slate-100 rounded-lg p-3.5 text-center">
              <div className="text-3xl font-semibold text-amber-600">
                {result.tasks.filter((t) => t.suggestUpdate).length}
              </div>
              <div className="text-xs text-slate-400 mt-1">WBS更新提案あり</div>
            </div>
          </div>

          {/* タスク一覧 */}
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-semibold text-[#1A3A5C]">タスク別推定結果</span>
              <button
                onClick={() => {
                  const suggestIds = new Set(result.tasks.filter(t => t.suggestUpdate).map(t => t.taskId));
                  setSelected(prev => prev.size === suggestIds.size ? new Set() : suggestIds);
                }}
                className="text-xs text-[#1D6FA4] hover:underline"
              >
                提案をすべて選択/解除
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {result.tasks.map((task) => (
                <div
                  key={task.taskId}
                  className={`px-3.5 py-2.5 border-l-4 ${borderColor[task.inferredStatus]} ${task.suggestUpdate ? "bg-white" : "bg-slate-50/50"}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {task.suggestUpdate && (
                      <input
                        type="checkbox"
                        checked={selected.has(task.taskId)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(task.taskId);
                          else next.delete(task.taskId);
                          setSelected(next);
                        }}
                        className="rounded"
                      />
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.inferredStatus]}`}>
                      {statusLabel[task.inferredStatus]} {task.confidence}%
                    </span>
                    <span className="text-xs font-medium text-[#1A3A5C] flex-1">{task.taskTitle}</span>
                    {task.suggestUpdate && (
                      <span className="text-xs text-slate-400">
                        {task.currentStatus} → {task.inferredStatus}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 ml-6">根拠: {task.evidence}</div>
                </div>
              ))}
            </div>
          </div>

          {/* WBS反映 */}
          {result.tasks.some((t) => t.suggestUpdate) && (
            <div className={`border ${applyDone ? "border-emerald-200 bg-emerald-50" : "border-[#1D6FA4]/30 bg-[#D6EAF8]/20"} rounded-lg p-3.5`}>
              {applyDone ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  ✓ WBSに反映しました
                  <Link href={`/projects/${projectId}/wbs`} className="ml-auto text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg">
                    WBSを確認 →
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#1A3A5C]">
                      WBSに反映（{selected.size}件選択中）
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">チェックしたタスクのステータスを更新します</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={applySelected}
                      disabled={selected.size === 0 || applying}
                      className="text-xs px-4 py-2 bg-[#1A3A5C] text-white rounded-lg font-medium disabled:opacity-50"
                    >
                      {applying ? "反映中..." : "選択した変更を適用"}
                    </button>
                    <Link
                      href={`/projects/${projectId}/wbs`}
                      className="text-xs px-4 py-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                    >
                      WBSを見る
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}