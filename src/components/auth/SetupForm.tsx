"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "8文字以上")
  .regex(/[a-zA-Z]/, "英字を含む")
  .regex(/[0-9]/, "数字を含む")
  .regex(/[^a-zA-Z0-9]/, "記号を含む");

function getStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-zA-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "弱い", color: "bg-red-400" };
  if (score <= 3) return { score, label: "普通", color: "bg-amber-400" };
  return { score, label: "強い", color: "bg-emerald-500" };
}

export default function SetupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = getStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }

    const pwResult = passwordSchema.safeParse(password);
    if (!pwResult.success) {
      setError(pwResult.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "SETUP_ALREADY_DONE") {
          setError("セットアップはすでに完了しています");
        } else if (data.error === "VALIDATION_ERROR") {
          const msgs = Object.values(data.details?.fieldErrors ?? {}).flat();
          setError((msgs[0] as string) ?? "入力内容を確認してください");
        } else {
          setError("エラーが発生しました");
        }
        return;
      }

      // 自動ログイン
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/");
        router.refresh();
      } else {
        router.push("/login");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 表示名 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-500 tracking-wide uppercase">表示名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Admin"
          required
          maxLength={100}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-[#1D6FA4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 transition-all"
        />
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-500 tracking-wide uppercase">メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
          maxLength={255}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-[#1D6FA4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 transition-all"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-500 tracking-wide uppercase">パスワード</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8文字以上・英数字+記号"
            required
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:border-[#1D6FA4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 transition-all pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {showPassword ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* 強度バー */}
        {password && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((i: any) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    i <= strength.score ? strength.color : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-medium ${
              strength.score <= 2 ? "text-red-500" :
              strength.score <= 3 ? "text-amber-500" : "text-emerald-600"
            }`}>
              {strength.label}
            </span>
          </div>
        )}

        <p className="text-xs text-slate-400">8文字以上・英字・数字・記号をそれぞれ1文字以上</p>
      </div>

      {/* Confirm Password */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-slate-500 tracking-wide uppercase">パスワード（確認）</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          className={`w-full rounded-lg border px-3.5 py-2.5 text-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 transition-all ${
            confirm && confirm !== password
              ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200"
              : "border-slate-200 bg-slate-50 focus:border-[#1D6FA4] focus:bg-white focus:ring-[#1D6FA4]/20"
          } text-slate-800`}
        />
        {confirm && confirm !== password && (
          <p className="text-xs text-red-500">パスワードが一致しません</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || (confirm.length > 0 && confirm !== password)}
        className="w-full rounded-lg bg-[#1A3A5C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2A527A] focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            作成中...
          </>
        ) : (
          "管理者アカウントを作成"
        )}
      </button>
    </form>
  );
}
