"use client";

import { useState, useEffect, useCallback } from "react";

type ImportKey = {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export default function ImportKeysPanel() {
  const [keys, setKeys] = useState<ImportKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/import-keys");
      if (res.ok) setKeys((await res.json()).keys);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    if (!label.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/import-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "発行に失敗しました"); return; }
      setNewRawKey(data.raw_key);
      setLabel("");
      fetchKeys();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("このキーを失効させますか？連携中のパイプラインは即座にアクセスできなくなります。")) return;
    const res = await fetch(`/api/settings/import-keys/${id}`, { method: "DELETE" });
    if (res.ok) fetchKeys();
  }

  const field = "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 bg-white";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <span>🔑</span> インポート専用APIキー
      </h2>
      <p className="text-xs text-slate-400">
        外部スキャンパイプラインからドキュメント一括投入APIを呼び出す際の認証に使用します。管理者セッションとは独立した鍵です。
      </p>

      {newRawKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-800">このキーは今だけ表示されます。控えたら閉じてください。</p>
          <code className="block text-xs bg-white border border-amber-200 rounded px-2 py-1.5 break-all">{newRawKey}</code>
          <button onClick={() => setNewRawKey(null)} className="text-xs text-amber-700 hover:underline">閉じる</button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: local-scan-pipeline"
          className={field}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !label.trim()}
          className="px-4 py-2 bg-[#1A3A5C] text-white text-xs font-medium rounded-lg hover:bg-[#2A527A] disabled:opacity-50 whitespace-nowrap"
        >
          {creating ? "発行中..." : "＋ 新規発行"}
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-slate-400">読み込み中...</p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-slate-400">発行済みキーはありません</p>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-slate-700">{k.label}</p>
                <p className="text-[10px] text-slate-400 font-mono">{k.keyPrefix}...</p>
                <p className="text-[10px] text-slate-400">
                  最終使用: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ja-JP") : "未使用"}
                </p>
              </div>
              {k.revokedAt ? (
                <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-400 rounded-full">失効済み</span>
              ) : (
                <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-500 hover:underline">失効</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
