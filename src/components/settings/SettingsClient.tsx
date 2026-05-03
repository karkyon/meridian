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
  initial: {
    weekly_summary_day: string;
    focus_mode_count: number;
    session_timeout_hours: number;
  };
};

export default function SettingsClient({ hasApiKey, initial }: SettingsClientProps) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [summaryDay, setSummaryDay] = useState(initial.weekly_summary_day);
  const [focusCount, setFocusCount] = useState(initial.focus_mode_count);
  const [sessionHours, setSessionHours] = useState(initial.session_timeout_hours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
              {DAYS.map((d) => (
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
              {[1, 2, 3, 4, 5].map((n) => (
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
            {[1, 4, 8, 24, 72, 168, 720].map((h) => (
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
