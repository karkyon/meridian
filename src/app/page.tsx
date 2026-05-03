import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");

  const session = await auth();
  if (!session?.user) redirect("/login");

  redirect("/dashboard");
}
