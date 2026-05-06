"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string; email: string; name: string; role: string;
  isActive: boolean; failedLoginCount: number;
  lockedUntil: Date | null; lastLoginAt: Date | null; createdAt: Date;
};

export default function UsersClient({ initialUsers, currentUserId }: { initialUsers: User[]; currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function createUser() {
    setSaving(true); setFormError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: "viewer" }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers((prev) => [...prev, data.user]);
      setShowModal(false);
      setForm({ email: "", name: "", password: "" });
    } else {
      setFormError(data.error === "EMAIL_ALREADY_EXISTS" ? "このメールアドレスは既に使用されています" : data.error ?? "エラー");
    }
    setSaving(false);
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`「${email}」を削除しますか？`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) setUsers((prev) => prev.filter((u: any) => u.id !== id));
  }

  async function unlockUser(id: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked_until: null }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u: any) => u.id === id ? { ...u, lockedUntil: null, failedLoginCount: 0 } : u));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">{users.length}件のユーザー</p>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs bg-[#1A3A5C] text-white px-3 py-1.5 rounded-lg hover:bg-[#2A527A] transition-colors"
        >
          + Viewerを追加
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">名前 / メール</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">ロール</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">ステータス</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">最終ログイン</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u: any) => {
              const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                      {u.role === "admin" ? "Admin" : "Viewer"}
                    </span>
                    {isSelf && <span className="ml-1 text-[10px] text-slate-400">(自分)</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isLocked ? (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                        ロック中
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        アクティブ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("ja-JP") : "未ログイン"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {isLocked && (
                        <button onClick={() => unlockUser(u.id)}
                          className="text-xs px-2 py-1 border border-emerald-400 text-emerald-600 rounded hover:bg-emerald-50">
                          解除
                        </button>
                      )}
                      {!isSelf && u.role !== "admin" && (
                        <button onClick={() => deleteUser(u.id, u.email)}
                          className="text-xs px-2 py-1 border border-red-300 text-red-500 rounded hover:bg-red-50">
                          削除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 追加モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Viewerアカウントを追加</h2>
            {formError && <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>}
            <div className="space-y-3">
              {[
                { key: "name", label: "表示名", type: "text", placeholder: "山田太郎" },
                { key: "email", label: "メールアドレス", type: "email", placeholder: "user@example.com" },
                { key: "password", label: "パスワード", type: "password", placeholder: "8文字以上・英数字+記号" },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">{label}</label>
                  <input type={type} value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                キャンセル
              </button>
              <button onClick={createUser} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] disabled:opacity-60">
                {saving ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
