import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/auth/LogoutButton";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as { id: string; name?: string | null; email?: string | null; role: string };

  return (
    <main className="min-h-screen bg-[#0F1B2D] text-white flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Meridian</h1>
        <p className="text-[#1D6FA4] text-lg">Project Intelligence System</p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 max-w-sm w-full">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          ログイン中のユーザー
        </h2>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">名前</span>
            <span className="text-white">{user.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">メール</span>
            <span className="text-white">{user.email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">ロール</span>
            <span className={`font-semibold ${user.role === "admin" ? "text-[#1D6FA4]" : "text-violet-400"}`}>
              {user.role === "admin" ? "Admin" : "Viewer"}
            </span>
          </div>
        </div>
      </div>
      <p className="text-white/30 text-sm">Phase 2 完了 ✅ — Phase 3 (Core CRUD) 実装中...</p>
      <LogoutButton />
    </main>
  );
}