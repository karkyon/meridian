import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");

  const session = await auth();
  if (!session?.user) redirect("/login");

  // ★ DBユーザー実在確認
  const userId = (session.user as { id: string }).id;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!dbUser) redirect("/api/auth/signout-redirect");

  redirect("/dashboard");
}