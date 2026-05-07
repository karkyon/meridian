// src/components/projects/GitHubTabClient.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { GitHubRepoInfo } from "@/lib/github-helpers";

type Props = {
  projectId: string;
  projectName: string;
  repositoryUrl: string;
  hasGithubPat: boolean;
};

function HeatCell({ value, max }: { value: number; max: number }) {
  const ratio = max === 0 ? 0 : value / max;
  const bg =
    value === 0 ? "bg-slate-100"
    : ratio < 0.25 ? "bg-[#B5D4F4]"
    : ratio < 0.5  ? "bg-[#378ADD]"
    : ratio < 0.75 ? "bg-[#185FA5]"
    : "bg-[#0C447C]";
  return <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bg}`} title={`${value}件`} />;
}

export default function GitHubTabClient({ projectId, projectName, repositoryUrl, hasGithubPat }: Props) {
  const [data, setData] = useState<GitHubRepoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repositoryUrl || !hasGithubPat) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/github`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("FETCH_FAILED"))
      .finally(() => setLoading(false));
  }, [projectId, repositoryUrl, hasGithubPat]);

  if (!hasGithubPat) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">🔑</div>
        <p className="text-sm font-medium text-slate-600 mb-1">GitHub PATが未設定です</p>
        <p className="text-xs text-slate-400 mb-4">設定画面からPersonal Access Tokenを登録してください</p>
        <Link href="/settings" className="text-xs px-4 py-2 bg-[#1A3A5C] text-white rounded-lg">
          設定を開く →
        </Link>
      </div>
    );
  }

  if (!repositoryUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">📂</div>
        <p className="text-sm font-medium text-slate-600 mb-1">リポジトリURLが未設定です</p>
        <p className="text-xs text-slate-400 mb-4">プロジェクト編集からGitHubのURLを設定してください</p>
        <Link href={`/projects/${projectId}/edit`} className="text-xs px-4 py-2 bg-[#1A3A5C] text-white rounded-lg">
          プロジェクトを編集 →
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-sm text-slate-400">
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        GitHubからデータを取得中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm font-medium text-slate-600 mb-1">取得に失敗しました</p>
        <p className="text-xs text-slate-400">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetch(`/api/projects/${projectId}/github`).then(r=>r.json()).then(d => { if(d.error) setError(d.error); else setData(d); }).finally(()=>setLoading(false)); }}
          className="mt-4 text-xs px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
        >
          再試行
        </button>
      </div>
    );
  }

  if (!data) return null;

  const maxWeek = Math.max(...data.weeklyActivity, 1);
  const statusColor = {
    active: "text-emerald-600 bg-emerald-50",
    slow: "text-amber-600 bg-amber-50",
    stale: "text-orange-600 bg-orange-50",
    inactive: "text-red-600 bg-red-50",
  }[data.activityStatus];
  const statusLabel = {
    active: "活発",
    slow: "低調",
    stale: "停滞中",
    inactive: "非アクティブ",
  }[data.activityStatus];

  return (
    <div className="p-4 space-y-4">
      {/* リポジトリ基本情報 */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3">
        <svg className="w-5 h-5 text-[#1A3A5C] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#1A3A5C]">{data.fullName}</div>
          <div className="text-xs text-slate-400 font-mono truncate">{repositoryUrl}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{statusLabel}</span>
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-white transition-colors">
          GitHubで開く →
        </a>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { label: "総コミット", value: data.commitCount.toLocaleString() },
          { label: "最終push", value: data.daysSinceLastPush === 0 ? "今日" : `${data.daysSinceLastPush}日前` },
          { label: "Open PR", value: data.openPrCount },
          { label: "ブランチ", value: data.branchCount },
        ].map(({ label, value }) => (
          <div key={label} className="border border-slate-100 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold text-[#1A3A5C]">{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* コミットヒートマップ */}
      <div className="border border-slate-100 rounded-lg p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-[#1A3A5C]">コミットアクティビティ（過去12週）</span>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>少</span>
            {[0, 0.2, 0.5, 0.75, 1].map((r, i) => (
              <span key={i} className={`inline-block w-2.5 h-2.5 rounded-sm ${r === 0 ? "bg-slate-100" : r < 0.25 ? "bg-[#B5D4F4]" : r < 0.5 ? "bg-[#378ADD]" : r < 0.75 ? "bg-[#185FA5]" : "bg-[#0C447C]"}`} />
            ))}
            <span>多</span>
          </div>
        </div>
        <div className="flex gap-1">
          {data.weeklyActivity.map((count, i) => (
            <HeatCell key={i} value={count} max={maxWeek} />
          ))}
        </div>
      </div>

      {/* 直近コミット */}
      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
          <span className="text-xs font-semibold text-[#1A3A5C]">直近のコミット</span>
        </div>
        <div className="divide-y divide-slate-50">
          {data.recentCommits.map((c) => (
            <div key={c.sha} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 flex-1 truncate">{c.message}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {c.date ? new Date(c.date).toLocaleDateString("ja-JP") : ""}
              </span>
              <span className="text-xs font-mono text-slate-300">{c.sha}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI進捗推定へのリンク */}
      <div className="border border-[#1D6FA4]/30 bg-[#D6EAF8]/30 rounded-lg p-3.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#1A3A5C]">AI進捗推定</p>
          <p className="text-xs text-slate-400 mt-0.5">このコード実態からWBSタスクの実装状況をAIが推定します</p>
        </div>
        <Link
          href={`/projects/${projectId}/ai-progress`}
          className="text-xs px-4 py-2 bg-[#1A3A5C] text-white rounded-lg font-medium whitespace-nowrap"
        >
          AI進捗推定を実行 →
        </Link>
      </div>
    </div>
  );
}