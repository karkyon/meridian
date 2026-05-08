// ✅ 新規作成
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import TechStackPageClient from "@/components/projects/TechStackPageClient";

type Params = { params: { id: string } };

export default async function TechStackPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true,
      techStacks: { orderBy: [{ sortOrder: "asc" }] },
    },
  });
  if (!project) notFound();

  return (
    <TechStackPageClient
      projectId={project.id}
      initialItems={project.techStacks}
      role={user.role}
    />
  );
}