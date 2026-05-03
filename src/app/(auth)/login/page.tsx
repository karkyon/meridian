import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {/* 背景 subtle grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#1A3A5C 1px, transparent 1px), linear-gradient(90deg, #1A3A5C 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* カード */}
        <div
          className="bg-white rounded-2xl p-8 flex flex-col gap-5"
          style={{
            boxShadow:
              "0 12px 40px rgba(26,58,92,0.14), 0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          {/* ロゴ */}
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-[#1A3A5C] tracking-tight">
              Meridian
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Project Intelligence System
            </p>
          </div>

          {/* 区切り線 */}
          <div className="border-t border-slate-100" />

          {/* フォーム */}
          <Suspense fallback={<div className="h-40 animate-pulse bg-slate-100 rounded-lg" />}>
            <LoginForm />
          </Suspense>
        </div>

        {/* フッター */}
        <p className="text-center text-xs text-slate-300 mt-5">
          Meridian — Personal Project Intelligence
        </p>
      </div>
    </main>
  );
}
