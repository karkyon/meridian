"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

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

type CategoryKey = (typeof CATEGORY_DEFS)[number]["key"];

type CategoryRow = {
  category: string;
  score: number;
  rationale: string | null;
  advice: string | null;
  aiSuggestedScore: number | null;
  manuallyOverridden: boolean;
};

type Analysis = {
  id: string;
  overallScore: number;
  summary: string | null;
  aiSuggested: boolean;
  createdAt: string;
  categories: CategoryRow[];
};

type Props = {
  projectId: string;
  projectName: string;
  initialHistory: Analysis[];
  role: string;
  hasApiKey: boolean;
};

type CategoryState = Record<CategoryKey, { score: number; rationale: string; advice: string; aiScore: number | null }>;

function emptyState(): CategoryState {
  return Object.fromEntries(
    CATEGORY_DEFS.map((c) => [c.key, { score: 50, rationale: "", advice: "", aiScore: null }])
  ) as CategoryState;
}

function stateFromAnalysis(a: Analysis | null): CategoryState {
  const base = emptyState();
  if (a) {
    for (const c of a.categories) {
      if (base[c.category as CategoryKey]) {
        base[c.category as CategoryKey] = {
          score: c.score,
          rationale: c.rationale ?? "",
          advice: c.advice ?? "",
          aiScore: c.aiSuggestedScore,
        };
      }
    }
  }
  return base;
}

export default function BusinessAnalysisClient({ projectId, projectName, initialHistory, role, hasApiKey }: Props) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [history, setHistory] = useState(initialHistory);
  const latest = history[0] ?? null;

  const [state, setState] = useState<CategoryState>(() => stateFromAnalysis(latest));
  const [summary, setSummary] = useState(latest?.summary ?? "");

  const [suggesting, setSuggesting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const overallPreview = useMemo(() => {
    const scores = CATEGORY_DEFS.map((c) => state[c.key].score);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [state]);

  const trend = latest ? overallPreview - latest.overallScore : null;
  const radarData = CATEGORY_DEFS.map((c) => ({ label: c.label, score: state[c.key].score }));

  // 現在の入力がAI提案（最新履歴）から手動で変わっているか
  const hasManualChanges = latest
    ? CATEGORY_DEFS.some((c) => state[c.key].score !== (latest.categories.find((x) => x.category === c.key)?.score ?? 50))
    : true;

  // ── AI提案生成（SSE。完了時点でサーバー側が自動保存済み） ──
  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    setProgressMsg("開始しています...");
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/projects/${projectId}/business-analysis/suggest`, {
        method: "POST",
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? "AI提案の生成に失敗しました");
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
              setProgressMsg(payload.message);
            } else if (currentEvent === "complete") {
              const analysis: Analysis = payload.analysis;
              setHistory((prev) => [analysis, ...prev].slice(0, 10));
              setState(stateFromAnalysis(analysis));
              setSummary(analysis.summary ?? "");
              setProgressMsg(null);
              setSavedFlash(true);
              setTimeout(() => setSavedFlash(false), 2500);
              router.refresh();
            } else if (currentEvent === "error") {
              throw new Error(payload.message);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "通信エラーが発生しました");
      }
      setProgressMsg(null);
    } finally {
      setSuggesting(false);
    }
  }

  // ── 手動調整を新しいスナップショットとして保存 ──
  async function handleSaveManual() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/business-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          ai_suggested: false,
          categories: CATEGORY_DEFS.map((c) => ({
            category: c.key,
            score: state[c.key].score,
            rationale: state[c.key].rationale || undefined,
            advice: state[c.key].advice || undefined,
            ai_suggested_score: state[c.key].aiScore ?? undefined,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.message ?? d.error ?? "保存に失敗しました");
        return;
      }
      setHistory((prev) => [d.analysis, ...prev].slice(0, 10));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-700">事業性分析</h2>
          <p className="text-xs text-slate-400 mt-0.5">{projectName}</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleSuggest}
            disabled={suggesting || !hasApiKey}
            title={!hasApiKey ? "設定画面でClaude APIキーを登録してください" : undefined}
            className="text-xs px-3 py-1.5 border border-[#1D6FA4]/30 bg-[#1D6FA4]/5 rounded-lg text-[#1D6FA4] hover:bg-[#1D6FA4]/10 transition-colors disabled:opacity-50"
          >
            {suggesting ? "🤖 分析中..." : "🤖 AIで提案を生成"}
          </button>
        )}
      </div>

      {/* 進捗表示（SSE） */}
      {suggesting && progressMsg && (
        <div className="flex items-center gap-2 text-xs text-[#1D6FA4] bg-[#1D6FA4]/5 border border-[#1D6FA4]/20 px-3 py-2 rounded-lg">
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progressMsg}
        </div>
      )}

      {savedFlash && (
        <p className="text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">✅ 保存しました（履歴に追加されました）</p>
      )}
      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg whitespace-pre-wrap">{error}</p>}

      {/* 総合スコア + レーダーチャート */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-slate-400">総合スコア</p>
            <p className="text-3xl font-bold text-slate-800">
              {overallPreview}
              <span className="text-sm text-slate-400 font-normal"> / 100</span>
              {trend !== null && trend !== 0 && (
                <span className={`text-sm font-medium ml-2 ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {trend > 0 ? "▲" : "▼"}{Math.abs(trend)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#cbd5e1" }} tickCount={5} />
              <Radar dataKey="score" stroke="#1D6FA4" fill="#1D6FA4" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {summary && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">総評</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* カテゴリ別カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATEGORY_DEFS.map((c) => {
          const v = state[c.key];
          const overridden = v.aiScore !== null && v.aiScore !== v.score;
          return (
            <div key={c.key} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{c.label}</p>
                <span className="text-sm font-bold text-[#1D6FA4]">{v.score}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={v.score}
                disabled={!isAdmin}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, [c.key]: { ...prev[c.key], score: Number(e.target.value) } }))
                }
                className="w-full accent-[#1D6FA4]"
              />
              {v.rationale && <p className="text-xs text-slate-500">{v.rationale}</p>}
              {v.advice && (
                <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">💡 {v.advice}</p>
              )}
              {overridden && (
                <p className="text-[10px] text-amber-600">AI提案({v.aiScore})から手動で変更済み</p>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && hasManualChanges && (
        <button
          onClick={handleSaveManual}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] disabled:opacity-60 transition-colors"
        >
          {saving ? "保存中..." : "手動調整を新しいスナップショットとして保存"}
        </button>
      )}
      {isAdmin && !hasManualChanges && latest && (
        <p className="text-xs text-slate-400 text-center">
          このスコアは既に保存済みです（最終保存: {new Date(latest.createdAt).toLocaleString("ja-JP")}）
        </p>
      )}

      {/* 履歴 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">履歴（推移）</p>
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs text-slate-500 py-1">
                <span>{new Date(h.createdAt).toLocaleString("ja-JP")}</span>
                <span className="flex items-center gap-2">
                  {h.aiSuggested && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">AI</span>}
                  <span className="font-semibold text-slate-700">{h.overallScore}点</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
