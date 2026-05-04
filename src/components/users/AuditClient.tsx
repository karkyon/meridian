"use client";

import { useState, useEffect, useCallback } from "react";

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: "bg-emerald-100 text-emerald-700",
  LOGIN_FAILED: "bg-red-100 text-red-700",
  LOGIN_LOCKED: "bg-red-200 text-red-800",
  LOGOUT: "bg-slate-100 text-slate-600",
  PROJECT_CREATE: "bg-blue-100 text-blue-700",
  PROJECT_UPDATE: "bg-blue-50 text-blue-600",
  PROJECT_DELETE: "bg-red-100 text-red-700",
  DOCUMENT_SAVE: "bg-violet-100 text-violet-700",
  DOCUMENT_AI_GENERATE: "bg-violet-200 text-violet-800",
  WBS_TASK_CREATE: "bg-amber-100 text-amber-700",
  WBS_TASK_UPDATE: "bg-amber-50 text-amber-600",
  WBS_TASK_DELETE: "bg-red-50 text-red-600",
  PRIORITY_UPDATE: "bg-orange-100 text-orange-700",
  USER_CREATE: "bg-teal-100 text-teal-700",
  USER_DELETE: "bg-red-100 text-red-700",
  SETTINGS_UPDATE: "bg-slate-100 text-slate-600",
  API_KEY_UPDATE: "bg-slate-200 text-slate-700",
};

type Log = {
  id: string; createdAt: string; userEmail: string;
  action: string; resourceType: string | null;
  resourceName: string | null; ipAddress: string;
};

type User = { id: string; email: string; name: string };

export default function AuditClient() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUser, setFilterUser] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString() });
    if (filterUser) params.set("user_id", filterUser);
    if (filterAction) params.set("action", filterAction);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);

    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setUsers(data.users ?? []);
    }
    setLoading(false);
  }, [page, filterUser, filterAction, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // 30秒自動更新
  useEffect(() => {
    const timer = setInterval(() => { if (page === 1) fetchLogs(); }, 30000);
    return () => clearInterval(timer);
  }, [page, fetchLogs]);

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (filterUser) params.set("user_id", filterUser);
    if (filterAction) params.set("action", filterAction);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    window.open(`/api/audit?${params}`, "_blank");
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      {/* フィルター */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none min-w-[140px]">
            <option value="">全ユーザー</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none min-w-[160px]">
            <option value="">全アクション</option>
            {Object.keys(ACTION_COLORS).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none" />
          <span className="text-xs text-slate-400">〜</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none" />

          <div className="flex-1" />
          <span className="text-xs text-slate-400">{total}件</span>
          <button onClick={exportCsv}
            className="text-xs px-3 py-1.5 border border-[#1D6FA4] text-[#1D6FA4] rounded-lg hover:bg-[#1D6FA4]/5">
            CSV出力
          </button>
        </div>
      </div>

      {/* ログテーブル */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">日時</th>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-500">ユーザー</th>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-500">アクション</th>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-500">対象</th>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-500">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">読み込み中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">ログがありません</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5 text-slate-400 font-mono whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2.5 text-slate-500 max-w-[160px] truncate">{log.userEmail}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-600"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-400 max-w-[200px] truncate">
                  {[log.resourceType, log.resourceName].filter(Boolean).join(" / ")}
                </td>
                <td className="px-3 py-2.5 text-slate-400 font-mono">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
            ← 前
          </button>
          <span className="text-xs text-slate-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
            次 →
          </button>
        </div>
      )}
    </div>
  );
}
