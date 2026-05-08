"use client";

// src/components/projects/AnalysisPageClient.tsx
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── 型定義 ────────────────────────────────────────────────────
type IssueSeverity = "critical" | "high" | "medium" | "low";
type IssueCategory =
  | "code_doc_mismatch"
  | "tech_stack_mismatch"
  | "missing_implementation"
  | "db_inconsistency"
  | "security_concern"
  | "tech_debt"
  | "missing_test"
  | "other";
type TaskPriority = "high" | "mid" | "low";

type AnalysisIssue = {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  location: string | null;
  suggestion: string | null;
  resolved: boolean;
};

type SuggestedTask = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  phaseName: string;
  estimatedHours: number | null;
  issueRef: string | null;
  imported: boolean;
};

type Analysis = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  overallScore: number | null;
  summary: string | null;
  strengths: string[] | null;
  immediateActions: string[] | null;
  issueCount: number;
  criticalCount: number;
  suggestedTaskCount: number;
  githubCommitSha: string | null;
  completedAt: string | null;
  createdAt: string;
  issues: AnalysisIssue[];
  suggestedTasks: SuggestedTask[];
};

type Props = {
  project: { id: string; name: string; repositoryUrl: string | null; status: string };
  initialAnalysis: Analysis | null;
  hasApiKey: boolean;
  hasGithubPat: boolean;
};

// ── 定数 ──────────────────────────────────────────────────────
const SEVERITY_META: Record<IssueSeverity, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: "重大",  color: "text-red-700",    bg: "bg-red-50 border-red-200",      dot: "bg-red-500" },
  high:     { label: "高",    color: "text-orange-700", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  medium:   { label: "中",    color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   dot: "bg-amber-400" },
  low:      { label: "低",    color: "text-slate-600",  bg: "bg-slate-50 border-slate-200",   dot: "bg-slate-400" },
};

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  code_doc_mismatch:      "コード↔ドキュメント乖離",
  tech_stack_mismatch:    "技術スタック不整合",
  missing_implementation: "未実装機能",
  db_inconsistency:       "DB設計不整合",
  security_concern:       "セキュリティ",
  tech_debt:              "技術的負債",
  missing_test:           "テスト不足",
  other:                  "その他",
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "高", color: "text-red-600 bg-red-50" },
  mid:  { label: "中", color: "text-amber-600 bg-amber-50" },
  low:  { label: "低", color: "text-slate-500 bg-slate-100" },
};

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color =
    score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : score >= 25 ? "#f97316" : "#ef4444";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-800">{score}</span>
        <span className="text-[10px] text-slate-400 leading-none">/ 100</span>
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────
export default function AnalysisPageClient({
  project,
  initialAnalysis,
  hasApiKey,
  hasGithubPat,
}: Props) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: number; total: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"issues" | "tasks">("issues");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | "all">("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── 分析実行 ──────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!hasApiKey) { setError("CLAUDE_API_KEY_NOT_SET"); return; }
    setRunning(true);
    setError(null);
    setProgress({ step: 0, total: 4, message: "分析を準備中..." });
    setAnalysis(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/projects/${project.id}/analysis`, {
        method: "POST",
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "UNKNOWN_ERROR");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const payload = JSON.parse(line.slice(6));
            if (currentEvent === "progress") {
              setProgress(payload);
            } else if (currentEvent === "complete") {
              setAnalysis(payload.analysis);
              setProgress(null);
            } else if (currentEvent === "error") {
              throw new Error(payload.message);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "UNKNOWN_ERROR");
        setProgress(null);
      }
    } finally {
      setRunning(false);
    }
  }, [project.id, hasApiKey]);

  // ── 課題を解決済みに ──────────────────────────────────────
  const resolveIssue = async (issueId: string) => {
    const res = await fetch(`/api/projects/${project.id}/analysis`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    if (res.ok && analysis) {
      setAnalysis({
        ...analysis,
        issues: analysis.issues.map((i) =>
          i.id === issueId ? { ...i, resolved: true } : i
        ),
      });
    }
  };

  // ── WBSに取り込み ─────────────────────────────────────────
  const importTasks = async () => {
    if (selectedTaskIds.size === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/analysis/import-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: Array.from(selectedTaskIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(`✓ ${data.imported}件のタスクをWBSに追加しました`);
      setSelectedTaskIds(new Set());
      if (analysis) {
        setAnalysis({
          ...analysis,
          suggestedTasks: analysis.suggestedTasks.map((t) =>
            selectedTaskIds.has(t.id) ? { ...t, imported: true } : t
          ),
        });
      }
      router.refresh();
    } catch (err) {
      setImportResult(`エラー: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  // ── フィルタ済み課題 ──────────────────────────────────────
  const filteredIssues = analysis?.issues.filter(
    (i) => severityFilter === "all" || i.severity === severityFilter
  ) ?? [];

  const unresolvedCount = analysis?.issues.filter((i) => !i.resolved).length ?? 0;
  const notImportedTasks = analysis?.suggestedTasks.filter((t) => !t.imported) ?? [];

  // ── ステップ表示 ──────────────────────────────────────────
  const steps = ["GitHubコード調査", "ドキュメント解析", "AI総合分析", "結果保存"];

  // ================================================================
  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <span className="text-xl">🔬</span>
            システム総合分析
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            GitHub・ドキュメント・技術スタックを横断分析し、課題とタスクを自動抽出します
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={running || !hasApiKey}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1D6FA4] text-white text-sm font-medium rounded-lg hover:bg-[#1a5f8e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {running ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              分析中...
            </>
          ) : (
            <>🔬 総合分析を実行</>
          )}
        </button>
      </div>

      {/* 前提条件バナー */}
      {(!hasApiKey || !hasGithubPat) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex gap-2">
          <span>⚠</span>
          <div>
            {!hasApiKey && <p>Claude APIキーが未設定です。設定画面から登録してください。</p>}
            {!hasGithubPat && <p>GitHub PATが未設定です。設定画面から登録するとコード分析の精度が向上します。</p>}
          </div>
        </div>
      )}

      {/* 進捗表示 */}
      {running && progress && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <svg className="animate-spin w-5 h-5 text-[#1D6FA4]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm font-medium text-slate-700">{progress.message}</span>
          </div>
          {/* ステップインジケーター */}
          <div className="flex gap-2">
            {steps.map((s, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${
                  i < progress.step ? "bg-[#1D6FA4]" :
                  i === progress.step - 1 ? "bg-[#1D6FA4] animate-pulse" :
                  "bg-slate-100"
                }`} />
                <p className={`text-[10px] mt-1 text-center truncate ${
                  i < progress.step ? "text-[#1D6FA4] font-medium" : "text-slate-400"
                }`}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error === "CLAUDE_API_KEY_NOT_SET"
            ? "Claude APIキーが設定されていません。設定画面から登録してください。"
            : `エラー: ${error}`}
        </div>
      )}

      {/* 分析結果 */}
      {analysis && analysis.status === "completed" && (
        <div className="space-y-5">

          {/* サマリーカード */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-6">
              {/* スコアリング */}
              {analysis.overallScore !== null && (
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <ScoreRing score={analysis.overallScore} />
                  <span className="text-xs text-slate-500">総合スコア</span>
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-3">
                {/* 統計バッジ行 */}
                <div className="flex flex-wrap gap-2">
                  {analysis.criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
                      🔴 重大 {analysis.criticalCount}件
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full">
                    課題 {analysis.issueCount}件
                  </span>
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">
                    提案タスク {analysis.suggestedTaskCount}件
                  </span>
                  <span className="text-xs text-slate-400 ml-auto self-center">
                    {new Date(analysis.createdAt).toLocaleString("ja-JP")}
                    {analysis.githubCommitSha && (
                      <span className="ml-2 font-mono">#{analysis.githubCommitSha.slice(0, 7)}</span>
                    )}
                  </span>
                </div>

                {/* 総評 */}
                {analysis.summary && (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {analysis.summary}
                  </p>
                )}

                {/* 強み */}
                {analysis.strengths && analysis.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">✨ 強み</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.strengths.map((s, i) => (
                        <span key={i} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full border border-emerald-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 今すぐやること */}
                {analysis.immediateActions && analysis.immediateActions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">⚡ 今すぐやること</p>
                    <ol className="space-y-1">
                      {analysis.immediateActions.map((a, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-2">
                          <span className="text-[#1D6FA4] font-bold shrink-0">{i + 1}.</span>
                          {a}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* タブ切り替え */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("issues")}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "issues"
                  ? "border-[#1D6FA4] text-[#1D6FA4]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              🔍 課題一覧
              {unresolvedCount > 0 && (
                <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">
                  {unresolvedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("tasks")}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "tasks"
                  ? "border-[#1D6FA4] text-[#1D6FA4]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              📋 提案タスク
              {notImportedTasks.length > 0 && (
                <span className="ml-1.5 bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 rounded-full">
                  {notImportedTasks.length}
                </span>
              )}
            </button>
          </div>

          {/* 課題一覧タブ */}
          {activeTab === "issues" && (
            <div className="space-y-3">
              {/* 重要度フィルター */}
              <div className="flex gap-2">
                {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      severityFilter === s
                        ? "bg-[#1D6FA4] text-white border-[#1D6FA4]"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {s === "all" ? `すべて (${analysis.issues.length})` : `${SEVERITY_META[s].label} (${analysis.issues.filter(i => i.severity === s).length})`}
                  </button>
                ))}
              </div>

              {filteredIssues.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">該当する課題はありません</p>
              ) : (
                <div className="space-y-2">
                  {filteredIssues.map((issue) => {
                    const meta = SEVERITY_META[issue.severity];
                    return (
                      <div
                        key={issue.id}
                        className={`rounded-lg border p-4 transition-opacity ${meta.bg} ${
                          issue.resolved ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium ${meta.color}`}>
                                  {meta.label}
                                </span>
                                <span className="text-xs text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                  {CATEGORY_LABEL[issue.category]}
                                </span>
                                {issue.location && (
                                  <code className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                    {issue.location}
                                  </code>
                                )}
                              </div>
                              <p className="text-sm font-medium text-slate-800 mt-1">{issue.title}</p>
                              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{issue.description}</p>
                              {issue.suggestion && (
                                <p className="text-xs text-emerald-700 mt-1.5 bg-emerald-50 px-2 py-1 rounded">
                                  💡 {issue.suggestion}
                                </p>
                              )}
                            </div>
                          </div>
                          {!issue.resolved && (
                            <button
                              onClick={() => resolveIssue(issue.id)}
                              className="shrink-0 text-xs text-slate-400 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-2 py-1 rounded-md transition-colors bg-white"
                            >
                              解決済み
                            </button>
                          )}
                          {issue.resolved && (
                            <span className="shrink-0 text-xs text-emerald-600 flex items-center gap-1">
                              ✓ 解決済み
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 提案タスクタブ */}
          {activeTab === "tasks" && (
            <div className="space-y-3">
              {/* 取り込みアクション行 */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <button
                    onClick={() => {
                      const unimported = notImportedTasks.map((t) => t.id);
                      setSelectedTaskIds(new Set(unimported));
                    }}
                    className="text-xs text-[#1D6FA4] hover:underline"
                  >
                    すべて選択
                  </button>
                  <span>/</span>
                  <button
                    onClick={() => setSelectedTaskIds(new Set())}
                    className="text-xs text-slate-400 hover:underline"
                  >
                    解除
                  </button>
                  {selectedTaskIds.size > 0 && (
                    <span className="text-[#1D6FA4] font-medium">{selectedTaskIds.size}件選択中</span>
                  )}
                </div>
                <button
                  onClick={importTasks}
                  disabled={selectedTaskIds.size === 0 || importing}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? "取り込み中..." : `📥 WBSに取り込む (${selectedTaskIds.size}件)`}
                </button>
              </div>

              {importResult && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  importResult.startsWith("✓")
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}>
                  {importResult}
                </div>
              )}

              {/* フェーズ別グルーピング */}
              {(() => {
                const phaseGroups = new Map<string, SuggestedTask[]>();
                for (const task of analysis.suggestedTasks) {
                  if (!phaseGroups.has(task.phaseName)) phaseGroups.set(task.phaseName, []);
                  phaseGroups.get(task.phaseName)!.push(task);
                }
                return Array.from(phaseGroups.entries()).map(([phase, tasks]) => (
                  <div key={phase} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        {phase}
                      </span>
                      <span className="text-xs text-slate-400">({tasks.length}件)</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {tasks.map((task) => {
                        const pMeta = PRIORITY_META[task.priority];
                        const isSelected = selectedTaskIds.has(task.id);
                        return (
                          <div
                            key={task.id}
                            className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                              task.imported
                                ? "bg-emerald-50/50 opacity-60"
                                : isSelected
                                ? "bg-blue-50/60"
                                : "hover:bg-slate-50/60"
                            }`}
                          >
                            {!task.imported ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedTaskIds);
                                  e.target.checked ? next.add(task.id) : next.delete(task.id);
                                  setSelectedTaskIds(next);
                                }}
                                className="mt-0.5 rounded border-slate-300 text-[#1D6FA4] focus:ring-[#1D6FA4]"
                              />
                            ) : (
                              <span className="mt-0.5 text-emerald-500 text-sm">✓</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pMeta.color}`}>
                                  {pMeta.label}
                                </span>
                                {task.estimatedHours && (
                                  <span className="text-[10px] text-slate-400">
                                    ⏱ {task.estimatedHours}h
                                  </span>
                                )}
                                {task.imported && (
                                  <span className="text-[10px] text-emerald-600">WBS追加済み</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-800 mt-0.5">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{task.description}</p>
                              )}
                              {task.issueRef && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  関連課題: {task.issueRef}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* 分析失敗時 */}
      {analysis && analysis.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          前回の分析が失敗しました: {analysis.errorMessage ?? "原因不明"}
          <button onClick={runAnalysis} className="ml-3 underline text-red-600 hover:text-red-800">
            再実行
          </button>
        </div>
      )}

      {/* 初回未分析 */}
      {!analysis && !running && !error && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">🔬</div>
          <p className="text-slate-600 font-medium mb-1">まだ分析が実行されていません</p>
          <p className="text-sm text-slate-400 mb-4">
            「総合分析を実行」ボタンを押すと、GitHub・ドキュメント・技術スタックを一括分析します
          </p>
          <div className="flex justify-center gap-4 text-xs text-slate-400">
            <span className={hasApiKey ? "text-emerald-600" : "text-red-400"}>
              {hasApiKey ? "✓" : "✗"} Claude API
            </span>
            <span className={hasGithubPat ? "text-emerald-600" : "text-amber-500"}>
              {hasGithubPat ? "✓" : "△"} GitHub PAT
            </span>
            {project.repositoryUrl ? (
              <span className="text-emerald-600">✓ リポジトリ設定済み</span>
            ) : (
              <span className="text-amber-500">△ リポジトリ未設定</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}