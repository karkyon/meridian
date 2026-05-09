"use client";

// src/components/projects/AnalysisPageClient.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── 型定義 ────────────────────────────────────────────────────
type IssueSeverity = "critical" | "high" | "medium" | "low";
type IssueCategory =
  | "code_doc_mismatch" | "tech_stack_mismatch" | "missing_implementation"
  | "db_inconsistency" | "security_concern" | "tech_debt" | "missing_test" | "other";
type TaskPriority = "high" | "mid" | "low";
type FeatureStatus = "completed" | "partial" | "not_started" | "unknown";
type FeatureSource = "spec" | "code" | "both";

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

type AnalysisFeature = {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  source: FeatureSource;
  sourceNote: string | null;
  progressPct: number;
  location: string | null;
  specRef: string | null;
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
  featureCount: number;
  githubCommitSha: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  rawAiResponse: string | null;
  // migration後フィールド（optional）
  executionMode?: "ai" | "manual";
  promptLog?: Array<{ step: string; prompt: string; rawResponse: string; inputTokens: number; outputTokens: number }>;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  modelUsed?: string | null;
  loopCount?: number | null;
  issues: AnalysisIssue[];
  suggestedTasks: SuggestedTask[];
  features: AnalysisFeature[];
};

type ProgressEvent = {
  step: number;
  total: number;
  message: string;
  prompt?: string;
  rawResponse?: string;
  inputTokens?: number;
  outputTokens?: number;
};

type Props = {
  project: { id: string; name: string; repositoryUrl: string | null; status: string };
  initialAnalysis: Analysis | null;
  hasApiKey: boolean;
  hasGithubPat: boolean;
};

// ── 定数 ──────────────────────────────────────────────────────
const SEVERITY_META: Record<IssueSeverity, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: "重大",  color: "text-red-700",    bg: "bg-red-50 border-red-200",       dot: "bg-red-500" },
  high:     { label: "高",    color: "text-orange-700", bg: "bg-orange-50 border-orange-200",  dot: "bg-orange-500" },
  medium:   { label: "中",    color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200",  dot: "bg-yellow-400" },
  low:      { label: "低",    color: "text-slate-600",  bg: "bg-slate-50 border-slate-200",    dot: "bg-slate-400" },
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "高",  color: "bg-red-100 text-red-700" },
  mid:  { label: "中",  color: "bg-yellow-100 text-yellow-700" },
  low:  { label: "低",  color: "bg-slate-100 text-slate-600" },
};

const FEATURE_STATUS_META: Record<FeatureStatus, { label: string; color: string; bg: string; bar: string }> = {
  completed:   { label: "実装完了",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",  bar: "bg-emerald-500" },
  partial:     { label: "部分実装",  color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",        bar: "bg-blue-500" },
  not_started: { label: "未着手",    color: "text-slate-500",   bg: "bg-slate-50 border-slate-200",      bar: "bg-slate-300" },
  unknown:     { label: "判定不能",  color: "text-purple-600",  bg: "bg-purple-50 border-purple-200",    bar: "bg-purple-400" },
};

const FEATURE_SOURCE_META: Record<FeatureSource, { label: string; color: string }> = {
  both: { label: "仕様書＋コード", color: "text-slate-500" },
  spec: { label: "仕様書のみ",     color: "text-amber-600" },
  code: { label: "コードのみ",     color: "text-purple-600" },
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  code_doc_mismatch: "コード↔仕様乖離", tech_stack_mismatch: "技術スタック不整合",
  missing_implementation: "未実装機能", db_inconsistency: "DB設計不整合",
  security_concern: "セキュリティ", tech_debt: "技術的負債",
  missing_test: "テスト不足", other: "その他",
};

// ── スコアリング ───────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#1D6FA4" : score >= 40 ? "#f59e0b" : score >= 20 ? "#f97316" : "#ef4444";
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-800">{score}</span>
        <span className="text-[10px] text-slate-400 leading-none">/ 100</span>
      </div>
    </div>
  );
}

// ── 機能実装状況セクション ────────────────────────────────────
function FeaturesSection({ features }: { features: AnalysisFeature[] }) {
  const [statusFilter, setStatusFilter] = useState<FeatureStatus | "all">("all");
  const filtered = statusFilter === "all" ? features : features.filter(f => f.status === statusFilter);
  const stats = {
    completed: features.filter(f => f.status === "completed").length,
    partial: features.filter(f => f.status === "partial").length,
    not_started: features.filter(f => f.status === "not_started").length,
    unknown: features.filter(f => f.status === "unknown").length,
  };
  const overallPct = features.length > 0
    ? Math.round(features.reduce((sum, f) => sum + f.progressPct, 0) / features.length)
    : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            📐 機能実装状況
            <span className="text-xs font-normal text-slate-400">({features.length}件)</span>
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">平均進捗 {overallPct}%</span>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#1D6FA4] rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(["all", "completed", "partial", "not_started", "unknown"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-[#1D6FA4] text-white border-[#1D6FA4]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}>
              {s === "all" ? `すべて (${features.length})` : `${FEATURE_STATUS_META[s].label} (${stats[s as FeatureStatus]})`}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">該当する機能がありません</div>
        ) : filtered.map((f) => {
          const sMeta = FEATURE_STATUS_META[f.status];
          const srcMeta = FEATURE_SOURCE_META[f.source];
          return (
            <div key={f.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${sMeta.bg} ${sMeta.color}`}>{sMeta.label}</span>
                    <span className={`text-xs ${srcMeta.color}`}>{srcMeta.label}</span>
                    <span className="text-sm font-medium text-slate-800">{f.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.description}</p>
                  {f.location && (
                    <p className="text-xs font-mono text-slate-400 mt-1 truncate">📁 {f.location}</p>
                  )}
                  {f.sourceNote && (
                    <p className={`text-xs mt-1.5 px-2 py-1 rounded border ${
                      f.source !== "both" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-500"
                    }`}>💬 {f.sourceNote}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-semibold text-slate-700">{f.progressPct}%</span>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${sMeta.bar}`} style={{ width: `${f.progressPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── プロンプト・RAW表示パネル ─────────────────────────────────
function PromptRawPanel({ logs }: { logs: ProgressEvent[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const logsWithData = logs.filter(l => l.prompt || l.rawResponse);
  if (logsWithData.length === 0) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-300">🔍 分析ログ（プロンプト・RAW）</span>
        <span className="text-xs text-slate-500">{logsWithData.length}ステップ</span>
      </div>
      <div className="divide-y divide-slate-800">
        {logsWithData.map((log, i) => (
          <div key={i} className="px-4 py-3">
            <button onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center justify-between text-left gap-2">
              <span className="text-xs text-slate-300 font-medium">{log.message}</span>
              <div className="flex items-center gap-3 shrink-0">
                {log.inputTokens && (
                  <span className="text-xs text-slate-500">in:{log.inputTokens} / out:{log.outputTokens}</span>
                )}
                <span className="text-slate-500 text-xs">{expanded === i ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded === i && (
              <div className="mt-3 space-y-3">
                {log.prompt && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1 font-medium">▶ プロンプト</p>
                    <pre className="text-xs text-green-300 bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">{log.prompt}</pre>
                  </div>
                )}
                {log.rawResponse && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1 font-medium">◀ RAWレスポンス</p>
                    <pre className="text-xs text-amber-200 bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">{log.rawResponse}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── デバッグパネル ────────────────────────────────────────────
function DebugPanel({ analysis }: { analysis: Analysis | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full shadow-lg hover:bg-slate-700 opacity-60 hover:opacity-100 transition-all">
        🐛 DEBUG
      </button>
    );
  }
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[480px] max-h-[60vh] bg-slate-900 text-slate-200 rounded-xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">🐛 Debug Panel</span>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-xs">✕ 閉じる</button>
      </div>
      <div className="overflow-y-auto p-3">
        <pre className="text-xs text-green-300 whitespace-pre-wrap break-all">
          {analysis
            ? JSON.stringify({
                id: analysis.id,
                status: analysis.status,
                overallScore: analysis.overallScore,
                issueCount: analysis.issueCount,
                criticalCount: analysis.criticalCount,
                suggestedTaskCount: analysis.suggestedTaskCount,
                featureCount: analysis.featureCount,
                issues_length: analysis.issues?.length,
                tasks_length: analysis.suggestedTasks?.length,
                features_length: analysis.features?.length,
                executionMode: analysis.executionMode,
                inputTokens: analysis.inputTokens,
                outputTokens: analysis.outputTokens,
                estimatedCostUsd: analysis.estimatedCostUsd,
                modelUsed: analysis.modelUsed,
                loopCount: analysis.loopCount,
                createdAt: analysis.createdAt,
                completedAt: analysis.completedAt,
              }, null, 2)
            : "analysis: null"
          }
        </pre>
      </div>
    </div>
  );
}

// ── 履歴タブ ──────────────────────────────────────────────────
function HistoryTab({ projectId }: { projectId: string }) {
  const [histories, setHistories] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/analysis?history=10`)
      .then(r => r.json())
      .then((data) => { setHistories(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="px-5 py-8 text-center text-slate-400 text-sm">読み込み中...</div>;

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs text-[#1D6FA4] hover:underline">
          ← 履歴一覧に戻る
        </button>
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">
              スコア: {selected.overallScore ?? "―"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              selected.executionMode === "manual"
                ? "bg-purple-100 text-purple-700"
                : "bg-blue-100 text-blue-700"
            }`}>{selected.executionMode === "manual" ? "🖊 手動テスト" : "🤖 AI分析"}</span>
            <span className="text-xs text-slate-400">
              {new Date(selected.createdAt).toLocaleString("ja-JP")}
            </span>
            {selected.estimatedCostUsd && (
              <span className="text-xs text-emerald-600">💰 ${Number(selected.estimatedCostUsd).toFixed(4)}</span>
            )}
          </div>
          {selected.summary && (
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{selected.summary}</p>
          )}
          <div className="flex gap-3 text-xs text-slate-500">
            <span>課題 {selected.issueCount}件</span>
            <span>タスク {selected.suggestedTaskCount}件</span>
            <span>機能 {selected.featureCount}件</span>
            {selected.inputTokens && <span>tokens in:{selected.inputTokens}/out:{selected.outputTokens}</span>}
          </div>
        </div>

        {/* プロンプトログ */}
        {selected.promptLog && selected.promptLog.length > 0 && (
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <span className="text-xs font-semibold text-slate-300">🔍 プロンプトログ ({selected.promptLog.length}ステップ)</span>
            </div>
            {selected.promptLog.map((log, i) => (
              <div key={i} className="border-b border-slate-800 last:border-0">
                <button onClick={() => setPromptExpanded(promptExpanded === i ? null : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left">
                  <span className="text-xs text-slate-300 font-mono">{log.step}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">in:{log.inputTokens}/out:{log.outputTokens}</span>
                    <span className="text-slate-500 text-xs">{promptExpanded === i ? "▲" : "▼"}</span>
                  </div>
                </button>
                {promptExpanded === i && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">▶ プロンプト</p>
                      <pre className="text-xs text-green-300 bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{log.prompt}</pre>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">◀ RAWレスポンス</p>
                      <pre className="text-xs text-amber-200 bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{log.rawResponse}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RAWデータ */}
        {selected.rawAiResponse && (
          <div className="bg-slate-900 rounded-xl overflow-hidden">
            <button onClick={() => setRawExpanded(!rawExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-left border-b border-slate-700">
              <span className="text-xs font-semibold text-slate-300">📄 RAW AI Response ({selected.rawAiResponse.length}文字)</span>
              <span className="text-slate-500 text-xs">{rawExpanded ? "▲" : "▼"}</span>
            </button>
            {rawExpanded && (
              <pre className="text-xs text-amber-200 p-4 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">{selected.rawAiResponse}</pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {histories.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">分析履歴がありません</div>
      ) : histories.map((h) => (
        <button key={h.id} onClick={() => setSelected(h)}
          className="w-full text-left px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                h.status === "completed" ? "bg-emerald-100 text-emerald-700"
                  : h.status === "failed" ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
              }`}>{h.status}</span>
              {h.executionMode === "manual" && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">手動</span>
              )}
              <span className="text-sm font-medium text-slate-700">
                スコア: {h.overallScore ?? "―"}
              </span>
              <span className="text-xs text-slate-400">
                課題{h.issueCount} / タスク{h.suggestedTaskCount} / 機能{h.featureCount}
              </span>
            </div>
            <span className="text-xs text-slate-400 shrink-0">
              {new Date(h.createdAt).toLocaleString("ja-JP")}
            </span>
          </div>
          {h.estimatedCostUsd && (
            <p className="text-xs text-emerald-600 mt-1">💰 ${Number(h.estimatedCostUsd).toFixed(4)}</p>
          )}
        </button>
      ))}
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────
export default function AnalysisPageClient({
  project, initialAnalysis, hasApiKey, hasGithubPat,
}: Props) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis);
  const [running, setRunning] = useState(false);
  const [progressLogs, setProgressLogs] = useState<ProgressEvent[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"issues" | "tasks" | "history">("issues");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | "all">("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showPromptLogs, setShowPromptLogs] = useState(false);
  // FEAT-01: JSONペースト手動テスト
  const [showManualTest, setShowManualTest] = useState(false);
  const [manualJson, setManualJson] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // BUG-01修正: 分析完了後にページデータを再取得してinitialAnalysisを更新
  const refreshAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/analysis`);
      if (res.ok) {
        const data = await res.json();
        if (data) setAnalysis(data);
      }
    } catch {
      // 無視
    }
  }, [project.id]);

  const runAnalysis = useCallback(async () => {
    if (!hasApiKey) { setError("CLAUDE_API_KEY_NOT_SET"); return; }
    setRunning(true);
    setError(null);
    setCurrentProgress({ step: 0, total: 5, message: "分析を準備中..." });
    setProgressLogs([]);
    setAnalysis(null);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/projects/${project.id}/analysis`, {
        method: "POST", signal: abortRef.current.signal,
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
          if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); }
          else if (line.startsWith("data: ")) {
            const payload = JSON.parse(line.slice(6));
            if (currentEvent === "progress") {
              setCurrentProgress(payload);
              // promptまたはrawResponseがある場合はログに追加
              if (payload.prompt || payload.rawResponse) {
                setProgressLogs(prev => [...prev, payload]);
              }
            } else if (currentEvent === "complete") {
              setAnalysis(payload.analysis);
              setCurrentProgress(null);
              // BUG-01修正: completeイベント後にサーバーから再取得（SSEとSSRの同期を確実に）
              setTimeout(() => refreshAnalysis(), 500);
            } else if (currentEvent === "error") {
              throw new Error(payload.message);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "UNKNOWN_ERROR");
        setCurrentProgress(null);
        // エラー時も最新状態を取得
        setTimeout(() => refreshAnalysis(), 1000);
      }
    } finally { setRunning(false); }
  }, [project.id, hasApiKey, refreshAnalysis]);

  // FEAT-01: 手動JSON解析
  const runManualAnalysis = useCallback(async () => {
    setManualError(null);
    let jsonData: Record<string, unknown>;
    try {
      jsonData = JSON.parse(manualJson);
    } catch (e) {
      setManualError(`JSONパースエラー: ${(e as Error).message}`);
      return;
    }
    setManualLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/analysis`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "UNKNOWN_ERROR");
      setAnalysis(data.analysis);
      setShowManualTest(false);
      setManualJson("");
    } catch (err) {
      setManualError(`エラー: ${(err as Error).message}`);
    } finally {
      setManualLoading(false);
    }
  }, [project.id, manualJson]);

  const resolveIssue = async (issueId: string) => {
    const res = await fetch(`/api/projects/${project.id}/analysis`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    if (res.ok && analysis) {
      setAnalysis({ ...analysis, issues: analysis.issues.map(i => i.id === issueId ? { ...i, resolved: true } : i) });
    }
  };

  const importTasks = async () => {
    if (selectedTaskIds.size === 0) return;
    setImporting(true); setImportResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/analysis/import-tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: Array.from(selectedTaskIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(`✓ ${data.imported}件のタスクをWBSに追加しました`);
      setSelectedTaskIds(new Set());
      if (analysis) {
        setAnalysis({ ...analysis, suggestedTasks: analysis.suggestedTasks.map(t => selectedTaskIds.has(t.id) ? { ...t, imported: true } : t) });
      }
      router.refresh();
    } catch (err) { setImportResult(`エラー: ${(err as Error).message}`); }
    finally { setImporting(false); }
  };

  const filteredIssues = analysis?.issues.filter(i => severityFilter === "all" || i.severity === severityFilter) ?? [];
  const unresolvedCount = analysis?.issues.filter(i => !i.resolved).length ?? 0;
  const notImportedTasks = analysis?.suggestedTasks.filter(t => !t.imported) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>🔬</span> システム総合分析
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            GitHub・ドキュメント・技術スタックを横断分析し、課題とタスクを自動抽出します
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* FEAT-01: 手動テストボタン */}
          <button onClick={() => setShowManualTest(!showManualTest)}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            🖊 手動テスト
          </button>
          <button onClick={runAnalysis} disabled={running || !hasApiKey}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1D6FA4] text-white rounded-xl text-sm font-medium hover:bg-[#1a5f8e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
            {running ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                分析中...
              </>
            ) : (
              <><span>📊</span> 総合分析を実行</>
            )}
          </button>
        </div>
      </div>

      {/* ── FEAT-01: 手動JSONテストパネル ── */}
      {showManualTest && (
        <div className="bg-white border border-purple-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-purple-800">🖊 手動JSONテスト（Claude API不使用）</h3>
              <p className="text-xs text-purple-600 mt-0.5">
                分析結果JSONを直接貼り付けてDBに保存・画面表示を確認できます
              </p>
            </div>
            <button onClick={() => setShowManualTest(false)} className="text-purple-400 hover:text-purple-600 text-lg">✕</button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-500">
              以下のフィールドを含むJSONを貼り付けてください：
              <code className="ml-1 bg-slate-100 px-1 rounded">overall_score, summary, strengths, immediate_actions, issues, suggested_tasks, features</code>
            </p>
            <textarea
              value={manualJson}
              onChange={e => setManualJson(e.target.value)}
              placeholder={`{
  "overall_score": 75,
  "summary": "プロジェクトの総評...",
  "strengths": ["強み1", "強み2"],
  "immediate_actions": ["今すぐやること1"],
  "issues": [...],
  "suggested_tasks": [...],
  "features": [...]
}`}
              className="w-full h-64 text-xs font-mono border border-slate-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 bg-slate-50"
            />
            {manualError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                ❌ {manualError}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setManualJson(""); setManualError(null); }}
                className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                クリア
              </button>
              <button onClick={runManualAnalysis} disabled={!manualJson.trim() || manualLoading}
                className="text-xs px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {manualLoading ? "保存中..." : "手動解析を実行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── API KEY 警告 ── */}
      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          ⚠️ Claude APIキーが設定されていません。
          <a href="/settings" className="underline ml-1 hover:text-amber-900">設定画面で登録してください。</a>
        </div>
      )}

      {/* ── エラー表示 ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          ❌ エラー: {error}
        </div>
      )}

      {/* ── FEAT-02: 分析中 プログレス + プロンプト・RAWリアルタイム ── */}
      {running && currentProgress && (
        <div className="bg-white border border-[#1D6FA4]/20 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 animate-spin text-[#1D6FA4] shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-slate-700 font-medium">{currentProgress.message}</span>
              <span className="text-xs text-slate-400 ml-auto">
                Step {currentProgress.step} / {currentProgress.total}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#1D6FA4] rounded-full transition-all duration-500"
                style={{ width: `${currentProgress.total > 0 ? (currentProgress.step / currentProgress.total) * 100 : 0}%` }} />
            </div>

            {/* プロンプト・RAWリアルタイム表示トグル */}
            {progressLogs.length > 0 && (
              <div>
                <button onClick={() => setShowPromptLogs(!showPromptLogs)}
                  className="text-xs text-[#1D6FA4] hover:underline flex items-center gap-1">
                  {showPromptLogs ? "▲" : "▼"} プロンプト・RAWログを{showPromptLogs ? "隠す" : "表示"} ({progressLogs.length}件)
                </button>
                {showPromptLogs && <div className="mt-2"><PromptRawPanel logs={progressLogs} /></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 完了後 プロンプト・RAWログ表示（FEAT-02） ── */}
      {!running && progressLogs.length > 0 && analysis?.status === "completed" && (
        <div>
          <button onClick={() => setShowPromptLogs(!showPromptLogs)}
            className="text-xs text-[#1D6FA4] hover:underline flex items-center gap-1 mb-2">
            {showPromptLogs ? "▲" : "▼"} 今回の分析プロンプト・RAWログ ({progressLogs.length}件)
          </button>
          {showPromptLogs && <PromptRawPanel logs={progressLogs} />}
        </div>
      )}

      {/* ── 分析結果 ── */}
      {analysis?.status === "completed" && (
        <>
          {/* サマリーカード */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex gap-5 items-start">
                {analysis.overallScore != null && <ScoreRing score={analysis.overallScore} />}
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {analysis.criticalCount > 0 && (
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full border border-red-100">
                        ⚠ 重大課題 {analysis.criticalCount}件
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs px-2.5 py-1 rounded-full border border-slate-100">
                      課題 {analysis.issueCount}件
                    </span>
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full border border-blue-100">
                      提案タスク {analysis.suggestedTaskCount}件
                    </span>
                    {analysis.featureCount > 0 && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs px-2.5 py-1 rounded-full border border-emerald-100">
                        機能 {analysis.featureCount}件
                      </span>
                    )}
                    {analysis.executionMode === "manual" && (
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 text-xs px-2.5 py-1 rounded-full border border-purple-100">
                        🖊 手動テスト
                      </span>
                    )}
                    {analysis.estimatedCostUsd && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs px-2.5 py-1 rounded-full border border-emerald-100">
                        💰 ${Number(analysis.estimatedCostUsd).toFixed(4)}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto self-center">
                      {new Date(analysis.createdAt).toLocaleString("ja-JP")}
                      {analysis.githubCommitSha && (
                        <span className="ml-2 font-mono">#{analysis.githubCommitSha.slice(0, 7)}</span>
                      )}
                    </span>
                  </div>
                  {analysis.summary && (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{analysis.summary}</p>
                  )}
                  {analysis.strengths && analysis.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">✨ 強み</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.strengths.map((s, i) => (
                          <span key={i} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full border border-emerald-100">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.immediateActions && analysis.immediateActions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">⚡ 今すぐやること</p>
                      <ol className="space-y-1">
                        {analysis.immediateActions.map((a, i) => (
                          <li key={i} className="text-sm text-slate-700 flex gap-2">
                            <span className="text-[#1D6FA4] font-bold shrink-0">{i + 1}.</span>{a}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 機能実装状況セクション */}
          {analysis.features && analysis.features.length > 0 && (
            <FeaturesSection features={analysis.features} />
          )}

          {/* 課題・タスク・履歴タブ */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200">
              {(["issues", "tasks", "history"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-[#1D6FA4] text-[#1D6FA4]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}>
                  {tab === "issues" ? `課題 (${unresolvedCount}/${analysis.issueCount})`
                    : tab === "tasks" ? `提案タスク (${analysis.suggestedTaskCount})`
                    : "📋 分析履歴"}
                </button>
              ))}
            </div>
            <div className="p-5">
              {/* 課題タブ */}
              {activeTab === "issues" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
                      <button key={s} onClick={() => setSeverityFilter(s)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          severityFilter === s
                            ? "bg-[#1D6FA4] text-white border-[#1D6FA4]"
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}>
                        {s === "all" ? "すべて" : SEVERITY_META[s].label}
                        {s !== "all" && ` (${analysis.issues.filter(i => i.severity === s).length})`}
                      </button>
                    ))}
                  </div>
                  {filteredIssues.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">該当する課題がありません</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredIssues.map((issue) => {
                        const meta = SEVERITY_META[issue.severity];
                        return (
                          <div key={issue.id} className={`rounded-lg border p-4 ${issue.resolved ? "opacity-50" : ""} ${meta.bg}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${meta.dot}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
                                  <span className="text-xs text-slate-400 bg-white/60 px-1.5 py-0.5 rounded">{CATEGORY_LABELS[issue.category]}</span>
                                  <span className="text-sm font-medium text-slate-800">{issue.title}</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{issue.description}</p>
                                {issue.location && (
                                  <p className="text-xs text-slate-400 mt-0.5 font-mono">📁 {issue.location}</p>
                                )}
                                {issue.suggestion && (
                                  <p className="text-xs text-slate-500 mt-1 bg-white/60 px-2 py-1 rounded">💡 {issue.suggestion}</p>
                                )}
                              </div>
                              {!issue.resolved ? (
                                <button onClick={() => resolveIssue(issue.id)}
                                  className="shrink-0 text-xs text-slate-400 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-2 py-1 rounded-md transition-colors bg-white">
                                  解決済み
                                </button>
                              ) : (
                                <span className="shrink-0 text-xs text-emerald-600 flex items-center gap-1">✓ 解決済み</span>
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <button onClick={() => setSelectedTaskIds(new Set(notImportedTasks.map(t => t.id)))}
                        className="text-xs text-[#1D6FA4] hover:underline">すべて選択</button>
                      <span>/</span>
                      <button onClick={() => setSelectedTaskIds(new Set())}
                        className="text-xs text-slate-400 hover:underline">解除</button>
                      {selectedTaskIds.size > 0 && (
                        <span className="text-[#1D6FA4] font-medium">{selectedTaskIds.size}件選択中</span>
                      )}
                    </div>
                    <button onClick={importTasks} disabled={selectedTaskIds.size === 0 || importing}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {importing ? "取り込み中..." : `⬆ WBSに取り込む (${selectedTaskIds.size}件)`}
                    </button>
                  </div>
                  {importResult && (
                    <p className={`text-xs px-3 py-2 rounded-lg ${importResult.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {importResult}
                    </p>
                  )}
                  {(() => {
                    const phaseGroups = new Map<string, SuggestedTask[]>();
                    for (const t of (analysis.suggestedTasks ?? [])) {
                      if (!phaseGroups.has(t.phaseName)) phaseGroups.set(t.phaseName, []);
                      phaseGroups.get(t.phaseName)!.push(t);
                    }
                    return Array.from(phaseGroups.entries()).map(([phase, tasks]) => (
                      <div key={phase}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{phase} ({tasks.length}件)</p>
                        <div className="space-y-2">
                          {tasks.map((task) => {
                            const isSelected = selectedTaskIds.has(task.id);
                            const pMeta = PRIORITY_META[task.priority];
                            return (
                              <div key={task.id} className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                                task.imported ? "bg-emerald-50/40 border-emerald-100" : isSelected ? "bg-blue-50/60 border-blue-200" : "bg-white border-slate-200 hover:bg-slate-50/60"
                              }`}>
                                {!task.imported ? (
                                  <input type="checkbox" checked={isSelected}
                                    onChange={(e) => {
                                      const next = new Set(selectedTaskIds);
                                      e.target.checked ? next.add(task.id) : next.delete(task.id);
                                      setSelectedTaskIds(next);
                                    }}
                                    className="mt-0.5 rounded border-slate-300 text-[#1D6FA4]" />
                                ) : (
                                  <span className="mt-0.5 text-emerald-600 text-sm shrink-0">✓</span>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pMeta.color}`}>{pMeta.label}</span>
                                    <span className="text-sm font-medium text-slate-800">{task.title}</span>
                                    {task.estimatedHours && (
                                      <span className="text-xs text-slate-400">{task.estimatedHours}h</span>
                                    )}
                                  </div>
                                  {task.description && <p className="text-xs text-slate-500 mt-1">{task.description}</p>}
                                  {task.issueRef && <p className="text-xs text-slate-400 mt-0.5">関連課題: {task.issueRef}</p>}
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

              {/* FEAT-03: 履歴タブ */}
              {activeTab === "history" && (
                <HistoryTab projectId={project.id} />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 分析失敗表示 ── */}
      {analysis?.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-red-700">分析に失敗しました</p>
          {analysis.errorMessage && (
            <p className="text-xs text-red-600 mt-1 font-mono">{analysis.errorMessage}</p>
          )}
        </div>
      )}

      {/* ── 未分析状態 ── */}
      {!analysis && !running && !error && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-12 text-center">
          <div className="text-4xl mb-3">🔬</div>
          <p className="text-slate-600 font-medium">まだ分析が実行されていません</p>
          <p className="text-sm text-slate-400 mt-1">「総合分析を実行」ボタンで分析を開始してください</p>
        </div>
      )}

      {/* DBG-01: デバッグパネル */}
      <DebugPanel analysis={analysis} />
    </div>
  );
}
