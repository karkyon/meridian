"use client";
// src/components/settings/SettingsClient.tsx
// SettingsClient に「💰 APIコスト」タブを追加した完全版

import { useState, useEffect, useCallback } from "react";

// ── 型定義 ──────────────────────────────────────────────────────
type UsageSummary = {
  totalAnalyses: number;
  billableAnalyses: number;
  manualAnalyses: number;
  totalCostUsd: number;
  monthlyCostUsd: number;
  last30DaysCostUsd: number;
  avgCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

type MonthlyBucket = {
  month: string;
  count: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

type ModelStat = {
  count: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type RecentItem = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  executionMode: string;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number;
  overallScore: number | null;
  loopCount: number | null;
};

type UsageData = {
  summary: UsageSummary;
  byModel: Record<string, ModelStat>;
  monthlyBreakdown: MonthlyBucket[];
  recentList: RecentItem[];
  generatedAt: string;
  note: string;
};

// ── APIコストダッシュボードコンポーネント ───────────────────────
function ApiCostDashboard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── 予算設定（localStorageで保持） ────────────────────────────
  const [budget, setBudget] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("api_budget_usd") ?? "10");
    }
    return 10;
  });
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budget));

  const saveBudget = () => {
    const v = Number(budgetInput);
    if (!isNaN(v) && v > 0) {
      setBudget(v);
      localStorage.setItem("api_budget_usd", String(v));
    }
    setEditingBudget(false);
  };

  // ── データ取得 ─────────────────────────────────────────────────
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/usage");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    // 5分ごとに自動更新
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // ── ローディング ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#1D6FA4] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">使用量を集計中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-500">{error ?? "データなし"}</p>
        <button
          onClick={fetchUsage}
          className="mt-3 text-xs text-[#1D6FA4] hover:underline"
        >
          再試行
        </button>
      </div>
    );
  }

  const s = data.summary;

  // ── 月次バーグラフ（最大値比） ─────────────────────────────────
  const maxCost = Math.max(...data.monthlyBreakdown.map((m) => m.costUsd), 0.001);
  const maxCount = Math.max(...data.monthlyBreakdown.map((m) => m.count), 1);

  // 当月予算消費率
  const budgetPct = Math.min(100, (s.monthlyCostUsd / budget) * 100);
  const budgetColor =
    budgetPct >= 90 ? "bg-red-500" :
    budgetPct >= 70 ? "bg-amber-400" :
    "bg-emerald-500";

  // ── フォーマット ────────────────────────────────────────────────
  const fmtUsd = (v: number) =>
    v < 0.001 ? `$${v.toFixed(6)}` :
    v < 0.01  ? `$${v.toFixed(4)}` :
    v < 1     ? `$${v.toFixed(3)}` :
    `$${v.toFixed(2)}`;

  const fmtTokens = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` :
    v >= 1_000     ? `${(v / 1_000).toFixed(1)}K` :
    String(v);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("ja-JP", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="space-y-6">

      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Claude API 使用量・コスト</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Meridian内のAI分析の実績データ（DBから集計）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-slate-400">
              更新: {lastUpdated.toLocaleTimeString("ja-JP")}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); fetchUsage(); }}
            className="text-xs text-[#1D6FA4] hover:underline flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            更新
          </button>
        </div>
      </div>

      {/* ── KPIカード群 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 合計コスト */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">合計コスト</p>
          <p className="text-2xl font-bold text-slate-800">{fmtUsd(s.totalCostUsd)}</p>
          <p className="text-[10px] text-slate-400">{s.billableAnalyses}回分</p>
        </div>
        {/* 当月コスト */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">当月コスト</p>
          <p className="text-2xl font-bold text-[#1D6FA4]">{fmtUsd(s.monthlyCostUsd)}</p>
          <p className="text-[10px] text-slate-400">直近30日: {fmtUsd(s.last30DaysCostUsd)}</p>
        </div>
        {/* 平均コスト/回 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">平均コスト/回</p>
          <p className="text-2xl font-bold text-slate-800">{fmtUsd(s.avgCostUsd)}</p>
          <p className="text-[10px] text-slate-400">手動テスト除く</p>
        </div>
        {/* 合計トークン */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">合計トークン</p>
          <p className="text-2xl font-bold text-slate-800">{fmtTokens(s.totalTokens)}</p>
          <p className="text-[10px] text-slate-400">in {fmtTokens(s.totalInputTokens)} / out {fmtTokens(s.totalOutputTokens)}</p>
        </div>
      </div>

      {/* ── 予算モニター ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">💰 当月予算モニター</span>
            {budgetPct >= 90 && (
              <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">予算超過警告</span>
            )}
            {budgetPct >= 70 && budgetPct < 90 && (
              <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">70%超過</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editingBudget ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">$</span>
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="w-16 text-xs border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:border-[#1D6FA4]"
                  min="0.01" step="0.01"
                />
                <button onClick={saveBudget} className="text-xs bg-[#1D6FA4] text-white px-2 py-0.5 rounded hover:bg-[#2A527A]">保存</button>
                <button onClick={() => setEditingBudget(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setBudgetInput(String(budget)); setEditingBudget(true); }}
                className="text-xs text-slate-400 hover:text-[#1D6FA4] flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                予算: ${budget}
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{fmtUsd(s.monthlyCostUsd)} 消費</span>
            <span>{fmtUsd(budget - s.monthlyCostUsd > 0 ? budget - s.monthlyCostUsd : 0)} 残</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${budgetColor}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>0</span>
            <span className="font-medium text-slate-600">{budgetPct.toFixed(1)}%</span>
            <span>${budget}</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
          ⚠ Anthropicクレジット残高はこの画面では取得できません（Admin APIキーが必要）。
          残高は <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[#1D6FA4] underline">console.anthropic.com</a> でご確認ください。
          上記の「残」はMeridianの消費実績から計算した推定値です。
        </p>
      </div>

      {/* ── 月別推移グラフ ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">📈 月別分析回数・コスト推移</h3>
        <div className="space-y-2.5">
          {data.monthlyBreakdown.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-500 w-14 shrink-0">{m.month}</span>
              <div className="flex-1 flex flex-col gap-1">
                {/* コストバー */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-2.5 bg-[#1D6FA4] rounded-full transition-all duration-500"
                      style={{ width: `${maxCost > 0 ? (m.costUsd / maxCost) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 w-14 text-right shrink-0">{fmtUsd(m.costUsd)}</span>
                </div>
                {/* 件数バー */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 bg-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${(m.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 w-14 text-right shrink-0">{m.count}回</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-2 bg-[#1D6FA4] rounded-sm inline-block" />コスト
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-1.5 bg-emerald-400 rounded-sm inline-block" />実行回数
          </span>
        </div>
      </div>

      {/* ── モデル別統計 ── */}
      {Object.keys(data.byModel).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🤖 モデル別使用量</h3>
          <div className="space-y-3">
            {Object.entries(data.byModel).map(([model, stat]) => (
              <div key={model} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-700 font-medium">{model}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400">{stat.count}回</span>
                    <span className="text-xs font-bold text-emerald-600">{fmtUsd(stat.costUsd)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-slate-400">Input</p>
                    <p className="text-xs font-bold text-slate-700">{fmtTokens(stat.inputTokens)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-slate-400">Output</p>
                    <p className="text-xs font-bold text-slate-700">{fmtTokens(stat.outputTokens)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-slate-400">平均コスト/回</p>
                    <p className="text-xs font-bold text-slate-700">{fmtUsd(stat.costUsd / (stat.count || 1))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 直近分析一覧 ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">🕐 直近の分析履歴</h3>
          <span className="text-[10px] text-slate-400">最新20件</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">日時</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">プロジェクト</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">モード</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">Input</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">Output</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">コスト</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500 text-[10px] uppercase tracking-wide">スコア</th>
              </tr>
            </thead>
            <tbody>
              {data.recentList.map((item, i) => (
                <tr key={item.id} className={`border-t border-slate-50 hover:bg-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {fmtDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium max-w-[160px] truncate">
                    {item.projectName}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      item.executionMode === "manual"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {item.executionMode === "manual" ? "手動" : "AI"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {item.inputTokens != null ? fmtTokens(item.inputTokens) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {item.outputTokens != null ? fmtTokens(item.outputTokens) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                    {item.estimatedCostUsd > 0 ? fmtUsd(item.estimatedCostUsd) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {item.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.overallScore >= 75 ? "bg-emerald-100 text-emerald-700" :
                        item.overallScore >= 50 ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {item.overallScore}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {data.recentList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                    分析履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 注意事項 ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-amber-800">⚠ このダッシュボードについて</p>
        <ul className="text-[11px] text-amber-700 space-y-0.5 list-disc list-inside">
          <li>表示コストはMeridian内の分析実績から算出した推定値です（Anthropicの請求と差異が出る場合があります）</li>
          <li>手動テスト・RAWリプレイはAPI不使用のためコスト集計から除外されています</li>
          <li>実際のAnthropicクレジット残高・請求額は <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">console.anthropic.com</a> でご確認ください</li>
          <li>5分ごとに自動更新されます</li>
        </ul>
      </div>

    </div>
  );
}

// ── メインの SettingsClient コンポーネント ───────────────────────
// ※ 以下は既存の SettingsClient の構造を維持しつつ「APIコスト」タブを追加したもの
// 既存の状態変数（apiKey / showApiKey / saving / etc.）はそのまま残す

export default function SettingsClient({
  initialSettings,
}: {
  initialSettings: {
    has_api_key: boolean;
    has_github_pat: boolean;
    github_auto_sync: boolean;
    github_cache_hours: number;
    weekly_summary_day: string;
    focus_mode_count: number;
    session_timeout_hours: number;
  };
}) {
  // ── タブ状態 ────────────────────────────────────────────────────
  type Tab = "general" | "usage";
  const [activeTab, setActiveTab] = useState<Tab>("general");

  // ── 既存の設定フォーム状態（変更なし） ──────────────────────────
  const [hasApiKey, setHasApiKey] = useState(initialSettings.has_api_key);
  const [hasGithubPat, setHasGithubPat] = useState(initialSettings.has_github_pat);
  const [apiKey, setApiKey] = useState("");
  const [githubPat, setGithubPat] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGithubPat, setShowGithubPat] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState(initialSettings.weekly_summary_day);
  const [focusCount, setFocusCount] = useState(initialSettings.focus_mode_count);
  const [sessionTimeout, setSessionTimeout] = useState(initialSettings.session_timeout_hours);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testingGithub, setTestingGithub] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, unknown> = {
        weekly_summary_day: weeklyDay,
        focus_mode_count: focusCount,
        session_timeout_hours: sessionTimeout,
      };
      if (apiKey) body.claude_api_key = apiKey;
      if (githubPat) body.github_pat = githubPat;

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaveMsg("保存しました");
        if (apiKey) { setHasApiKey(true); setApiKey(""); }
        if (githubPat) { setHasGithubPat(true); setGithubPat(""); }
      } else {
        setSaveMsg("保存に失敗しました");
      }
    } catch {
      setSaveMsg("エラーが発生しました");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const testGithub = async () => {
    setTestingGithub(true);
    setGithubTestResult(null);
    try {
      const res = await fetch("/api/settings/github/test");
      const data = await res.json();
      setGithubTestResult({
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "接続成功" : "接続失敗"),
      });
    } catch {
      setGithubTestResult({ ok: false, message: "接続エラー" });
    } finally {
      setTestingGithub(false);
    }
  };

  const field = "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 bg-white";

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── タブナビゲーション ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("general")}
          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
            activeTab === "general"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          ⚙️ 一般設定
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
            activeTab === "usage"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          💰 APIコスト
        </button>
      </div>

      {/* ── 一般設定タブ ── */}
      {activeTab === "general" && (
        <div className="space-y-4">

          {/* Claude API設定 */}
          <div className={`rounded-xl border p-4 space-y-3 ${
            hasApiKey ? "bg-emerald-50/40 border-emerald-200" : "bg-white border-amber-200"
          }`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span>🤖</span> Claude API設定
              </h2>
              {hasApiKey ? (
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-medium">
                  登録済み・有効
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-medium">
                  未設定
                </span>
              )}
            </div>

            {hasApiKey && (
              <div className="flex items-center gap-2 bg-emerald-100/60 rounded-lg px-3 py-2">
                <span className="text-xs text-emerald-700">APIキーは暗号化済みで保存されています。変更する場合のみ入力してください。</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {hasApiKey ? "APIキーを上書き変更" : "APIキー"}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasApiKey ? "新しいキーを入力して上書き..." : "sk-ant-..."}
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d={showApiKey
                        ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      }
                    />
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                AES-256-GCMで暗号化してDBに保存。
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[#1D6FA4] hover:underline ml-1">
                  console.anthropic.comで取得 →
                </a>
              </p>
            </div>
          </div>

          {/* GitHub PAT設定 */}
          <div className={`rounded-xl border p-4 space-y-3 ${
            hasGithubPat ? "bg-emerald-50/40 border-emerald-200" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span>🐙</span> GitHub PAT設定
              </h2>
              <div className="flex items-center gap-2">
                {hasGithubPat && (
                  <button
                    onClick={testGithub}
                    disabled={testingGithub}
                    className="text-xs text-[#1D6FA4] hover:underline disabled:opacity-50"
                  >
                    {testingGithub ? "テスト中..." : "接続テスト"}
                  </button>
                )}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  hasGithubPat ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {hasGithubPat ? "登録済み" : "未設定（任意）"}
                </span>
              </div>
            </div>

            {githubTestResult && (
              <div className={`text-xs px-3 py-2 rounded-lg ${
                githubTestResult.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}>
                {githubTestResult.ok ? "✅ " : "❌ "}{githubTestResult.message}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Personal Access Token
              </label>
              <div className="relative">
                <input
                  type={showGithubPat ? "text" : "password"}
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder={hasGithubPat ? "新しいトークンを入力..." : "ghp_..."}
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowGithubPat(!showGithubPat)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d={showGithubPat
                        ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      }
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* その他設定 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">⚙️ 動作設定</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">週次サマリー生成曜日</label>
              <select
                value={weeklyDay}
                onChange={(e) => setWeeklyDay(e.target.value)}
                className={`${field} bg-white`}
              >
                {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((d) => (
                  <option key={d} value={d}>
                    {{"monday":"月曜","tuesday":"火曜","wednesday":"水曜","thursday":"木曜","friday":"金曜","saturday":"土曜","sunday":"日曜"}[d]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">フォーカスタスク表示件数</label>
              <select
                value={focusCount}
                onChange={(e) => setFocusCount(Number(e.target.value))}
                className={`${field} bg-white`}
              >
                {[1,2,3,4,5].map((n) => (
                  <option key={n} value={n}>{n}件</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">セッションタイムアウト</label>
              <select
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(Number(e.target.value))}
                className={`${field} bg-white`}
              >
                {[1,2,4,8,24,48,168,720].map((h) => (
                  <option key={h} value={h}>
                    {h === 1 ? "1時間" : h < 24 ? `${h}時間` : h < 168 ? `${h/24}日` : h === 168 ? "1週間" : "30日"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 保存ボタン */}
          {saveMsg && (
            <div className={`text-center text-sm py-2 rounded-lg ${
              saveMsg.includes("失敗") || saveMsg.includes("エラー")
                ? "bg-red-50 text-red-600"
                : "bg-emerald-50 text-emerald-600"
            }`}>
              {saveMsg}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] transition-colors disabled:opacity-60"
          >
            {saving ? "保存中..." : "設定を保存する"}
          </button>
        </div>
      )}

      {/* ── APIコストタブ ── */}
      {activeTab === "usage" && <ApiCostDashboard />}

    </div>
  );
}