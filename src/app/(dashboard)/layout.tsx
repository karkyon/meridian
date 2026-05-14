import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/layout/Sidebar";
import SessionProvider from "@/components/layout/SessionProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // ★ JWTに入っているuser.idがDBに実在するか確認
  // DBリセット後などに古いCookieが残っていてもここで弾く
  const userId = (session.user as { id: string }).id;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!dbUser || !dbUser.isActive) {
    // セッションを破棄してログインへ
    // signOut はServer Componentから直接呼べないのでリダイレクト先で処理
    redirect("/api/auth/signout-redirect");
  }

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </SessionProvider>
  );
}