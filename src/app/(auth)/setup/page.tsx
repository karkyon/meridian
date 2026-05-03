import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SetupForm from "@/components/auth/SetupForm";

export default async function SetupPage() {
  // usersテーブルにレコードがあれば / へリダイレクト
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    redirect("/");
  }

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
              初回セットアップ — 管理者アカウントを作成
            </p>
          </div>

          {/* ステップインジケーター */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#1A3A5C] text-white text-[10px] font-bold shrink-0">
              1
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-400 text-[10px] font-bold shrink-0">
              2
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-400 text-[10px] font-bold shrink-0">
              3
            </div>
          </div>

          {/* 区切り線 */}
          <div className="border-t border-slate-100" />

          {/* フォーム */}
          <SetupForm />
        </div>

        {/* フッター */}
        <p className="text-center text-xs text-slate-300 mt-5">
          このページは初回起動時のみ表示されます
        </p>
      </div>
    </main>
  );
}
