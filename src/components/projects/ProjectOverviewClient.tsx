// ✅ 新規作成
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "planning",  label: "企画中" },
  { value: "active",    label: "開発中" },
  { value: "paused",    label: "停止中" },
  { value: "completed", label: "完了" },
];

type Props = {
  project: {
    id: string; name: string; description: string | null;
    status: string; category: string | null;
    repositoryUrl: string | null; notes: string | null;
    createdAt: Date; updatedAt: Date;
    progressCache: unknown; docCompleteness: unknown;
  };
  role: string;
};

export default function ProjectOverviewClient({ project, role }: Props) {
  const router = useRouter();
  const isAdmin = role === "admin";

  const [editing, setEditing]         = useState(false);
  const [name, setName]               = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus]           = useState(project.status);
  const [category, setCategory]       = useState(project.category ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl ?? "");
  const [notes, setNotes]             = useState(project.notes ?? "");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, status, category, repository_url: repositoryUrl, notes }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "保存失敗"); return; }
      setEditing(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20";

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">プロジェクト概要</h2>
        {isAdmin && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            ✏️ 編集
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
        {/* プロジェクト名 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">プロジェクト名</label>
          {editing
            ? <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            : <p className="text-sm font-semibold text-slate-800">{project.name}</p>}
        </div>

        {/* 概要 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">概要</label>
          {editing
            ? <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.description || <span className="text-slate-300">未入力</span>}</p>}
        </div>

        {/* ステータス & カテゴリ */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">ステータス</label>
            {editing
              ? <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} bg-white`}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              : <p className="text-sm text-slate-600">{STATUS_OPTIONS.find((o) => o.value === project.status)?.label ?? project.status}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">カテゴリ</label>
            {editing
              ? <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="web / cli / api / mobile" className={field} />
              : <p className="text-sm text-slate-600">{project.category || <span className="text-slate-300">未設定</span>}</p>}
          </div>
        </div>

        {/* リポジトリURL */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">リポジトリURL</label>
          {editing
            ? <input type="url" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} className={field} />
            : project.repositoryUrl
              ? <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#1D6FA4] hover:underline">{project.repositoryUrl}</a>
              : <p className="text-sm text-slate-300">未設定</p>}
        </div>

        {/* メモ */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">メモ</label>
          {editing
            ? <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.notes || <span className="text-slate-300">なし</span>}</p>}
        </div>

        {/* 編集ボタン */}
        {editing && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">キャンセル</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] disabled:opacity-60">
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        )}
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "WBS進捗", value: `${Number(project.progressCache).toFixed(0)}%` },
          { label: "ドキュメント整備率", value: `${Number(project.docCompleteness).toFixed(0)}%` },
          { label: "作成日", value: new Date(project.createdAt).toLocaleDateString("ja-JP") },
          { label: "最終更新", value: new Date(project.updatedAt).toLocaleDateString("ja-JP") },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="text-lg font-semibold text-slate-700 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}