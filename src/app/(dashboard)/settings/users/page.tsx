import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import UsersClient from "@/components/users/UsersClient";

export default async function UsersPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/dashboard");

  const currentUserId = (session!.user as { id: string }).id;

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, failedLoginCount: true,
      lockedUntil: true, lastLoginAt: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <TopBar title="ユーザー管理" />
      <main className="flex-1 p-6 max-w-4xl">
        <UsersClient initialUsers={users} currentUserId={currentUserId} />
      </main>
    </>
  );
}
