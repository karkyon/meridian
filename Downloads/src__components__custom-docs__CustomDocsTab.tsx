"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type CustomDocEntry = {
  key: string;
  label: string;
  sortOrder: number;
  scope: "global" | "project";
  doc: {
    id: string;
    completeness: number;
    version: number;
    updatedAt: string;
    files: { id: string }[];
  } | null;
};

export default function CustomDocsTab({ projectId, role }: { projectId: string; role: string }) {
  const isAdmin = role === "admin";
  const [entries, setEntries] = useState<CustomDocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/custom-docs`)
      .then((r) => r.json())
      .then((d) => { setEntries(d.customDocs ?? []); setLoading(false); });
  }, [projectId]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    const key = newLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
    const res = await fetch(`/api/projects/${projectId}/custom-docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${key}_${Date.now().toString(36)}`, label: newLabel.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setEntries((prev) => [...prev, { key: data.type.key, label: data.type.label, sortOrder: data.type.sortOrder, scope: "project", doc: null }]);
      setNewLabel("");
      setShowAddForm(false);
    }
    setAdding(false);
  };

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm">読み込み中...</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">技術スタック・環境設計など追加カテゴリのドキュメント管理</p>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs px-3 py-1.5 border border-[#1D6FA4] text-[#1D6FA4] rounded-lg hover:bg-[#1D6FA4]/5"
          >
            + カテゴリ追加
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="flex gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="カテゴリ名（例: CI/CD設計書）"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:border-[#1D6FA4] focus:outline-none bg-white"
            autoFocus
          />
          <button onClick={handleAdd} disabled={adding || !newLabel.trim()}
            className="text-xs px-4 py-1.5 bg-[#1D6FA4] text-white rounded-lg hover:bg-[#1a5f8e] disabled:opacity-50">
            {adding ? "追加中..." : "追加"}
          </button>
          <button onClick={() => setShowAddForm(false)} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg">
            キャンセル
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">カスタムドキュメントがありません</div>
      ) : (
        entries.map((entry: any) => (
          <div key={entry.key} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{entry.label}</span>
                {entry.scope === "project" && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">プロジェクト固有</span>
                )}
              </div>
              {entry.doc ? (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-400">完成度 {entry.doc.completeness}%</span>
                  <span className="text-xs text-slate-400">v{entry.doc.version}</span>
                  {entry.doc.files.length > 0 && (
                    <span className="text-xs text-slate-400">📁 {entry.doc.files.length}件</span>
                  )}
                  <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1D6FA4] rounded-full transition-all"
                      style={{ width: `${entry.doc.completeness}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-1">未作成</p>
              )}
            </div>
            <Link
              href={`/projects/${projectId}/custom-docs/${entry.key}`}
              className="ml-4 text-xs px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-[#1D6FA4] hover:text-[#1D6FA4] transition-colors shrink-0"
            >
              {entry.doc ? "編集 →" : "作成 →"}
            </Link>
          </div>
        ))
      )}
    </div>
  );
}
