"use client";

import { useState } from "react";

const DAYS = [
  { value: "monday", label: "月曜日" },
  { value: "tuesday", label: "火曜日" },
  { value: "wednesday", label: "水曜日" },
  { value: "thursday", label: "木曜日" },
  { value: "friday", label: "金曜日" },
  { value: "saturday", label: "土曜日" },
  { value: "sunday", label: "日曜日" },
];

type SettingsClientProps = {
  hasApiKey: boolean;
  hasGithubPat: boolean;
  initial: {
    weekly_summary_day: string;
    focus_mode_count: number;
    session_timeout_hours: number;
    github_auto_sync: boolean;
    github_cache_hours: number;
  };
};

export default function SettingsClient({ hasApiKey, hasGithubPat, initial }: SettingsClientProps) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [summaryDay, setSummaryDay] = useState(initial.weekly_summary_day);
  const [focusCount, setFocusCount] = useState(initial.focus_mode_count);
  const [sessionHours, setSessionHours] = useState(initial.session_timeout_hours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [githubPat, setGithubPat] = useState("");
  const [showGithubPat, setShowGithubPat] = useState(false);
  const [githubAutoSync, setGithubAutoSync] = useState(initial.github_auto_sync);
  const [githubCacheHours, setGithubCacheHours] = useState(initial.github_cache_hours);
  const [githubTestStatus, setGithubTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [githubTestUser, setGithubTestUser] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      weekly_summary_day: summaryDay,
      focus_mode_count: focusCount,
      session_timeout_hours: sessionHours,
    };
    if (apiKey.trim()) {
      body.claude_api_key = apiKey.trim();
    }

    if (githubPat.trim()) body.github_pat = githubPat.trim();
    body.github_auto_sync = githubAutoSync;
    body.github_cache_hours = githubCacheHours;

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "設定を保存しました" });
        setApiKey("");
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setSaving(false);
    }
  }

  // GitHub PATのテスト
  async function handleGithubTest() {
    const pat = githubPat.trim();
    if (!pat) return;
    setGithubTestStatus("testing");
    try {
      const res = await fetch("/api/settings/github/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat }),
      });
      if (res.ok) {
        const data = await res.json();
        setGithubTestUser(`${data.login}（リポジトリ ${data.repo_count}件にアクセス可能）`);
        setGithubTestStatus("ok");
      } else {
        setGithubTestStatus("error");
      }
    } catch {
      setGithubTestStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          message.type === "success"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Claude API キー */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <span>🤖</span> Claude API設定
        </h2>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            APIキー
            {hasApiKey && (
              <span className="ml-2 normal-case text-emerald-600 font-normal">✓ 登録済み</span>
            )}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasApiKey ? "新しいキーを入力して上書き..." : "sk-ant-..."}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 pr-10"
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
                    : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  }
                />
              </svg>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            キーはAES-256-GCMで暗号化してDBに保存されます。
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
              className="text-[#1D6FA4] hover:underline ml-1">
              Anthropic Console →
            </a>
          </p>
        </div>
      </div>

      {/* GitHub連携設定 */}
      <div className="bg-white rounded-xl border-2 border-[#1D6FA4]/30 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub連携設定
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Personal Access Token（PAT）を登録。必要権限: <code className="bg-slate-100 px-1 rounded">repo (read)</code> のみ
            </p>
          </div>
          {hasGithubPat && (
            <span className="text-xs text-emerald-600 font-medium">✓ 登録済み</span>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Personal Access Token (PAT)
          </label>
          <div className="relative flex gap-2">
            <input
              type={showGithubPat ? "text" : "password"}
              value={githubPat}
              onChange={(e) => { setGithubPat(e.target.value); setGithubTestStatus("idle"); }}
              placeholder={hasGithubPat ? "新しいトークンを入力して上書き..." : "ghp_xxxxxxxxxxxxxxxxxxxx"}
              className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
            />
            <button
              type="button"
              onClick={() => setShowGithubPat(!showGithubPat)}
              className="px-3 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 text-xs"
            >
              {showGithubPat ? "隠す" : "表示"}
            </button>
            <button
              type="button"
              onClick={handleGithubTest}
              disabled={!githubPat.trim() || githubTestStatus === "testing"}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {githubTestStatus === "testing" ? "確認中..." : "接続テスト"}
            </button>
          </div>
          {githubTestStatus === "ok" && (
            <p className="text-xs text-emerald-600">✓ 接続成功 — {githubTestUser}</p>
          )}
          {githubTestStatus === "error" && (
            <p className="text-xs text-red-500">✗ 接続失敗。トークンを確認してください。</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              キャッシュ有効期限
            </label>
            <select
              value={githubCacheHours}
              onChange={(e) => setGithubCacheHours(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none bg-white"
            >
              <option value={1}>1時間</option>
              <option value={6}>6時間</option>
              <option value={24}>24時間</option>
              <option value={72}>3日</option>
            </select>
          </div>
          <div className="space-y-1.5 flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={githubAutoSync}
                onChange={(e) => setGithubAutoSync(e.target.checked)}
                className="rounded border-slate-200"
              />
              AI進捗推定を週次自動実行
            </label>
          </div>
        </div>
      </div>

      {/* AI設定 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">AI設定</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              週次サマリー生成曜日
            </label>
            <select
              value={summaryDay}
              onChange={(e) => setSummaryDay(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none bg-white"
            >
              {DAYS.map((d: any) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              フォーカスタスク表示数
            </label>
            <select
              value={focusCount}
              onChange={(e) => setFocusCount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none bg-white"
            >
              {[1, 2, 3, 4, 5].map((n: any) => (
                <option key={n} value={n}>{n}件</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* セッション設定 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">セキュリティ設定</h2>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            セッションタイムアウト
          </label>
          <select
            value={sessionHours}
            onChange={(e) => setSessionHours(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none bg-white"
          >
            {[1, 4, 8, 24, 72, 168, 720].map((h: any) => (
              <option key={h} value={h}>
                {h < 24 ? `${h}時間` : h < 168 ? `${h / 24}日` : h === 168 ? "1週間" : "30日"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] transition-colors disabled:opacity-60"
      >
        {saving ? "保存中..." : "設定を保存する"}
      </button>
    </div>
  );
}
