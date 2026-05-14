import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import ProjectOverviewClient from "@/components/projects/ProjectOverviewClient";

type Params = { params: { id: string } };

export default async function ProjectOverviewPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, description: true, status: true,
      category: true, repositoryUrl: true, notes: true,
      createdAt: true, updatedAt: true,
      progressCache: true, docCompleteness: true,
      iconUrl: true,
    },
  });
  if (!project) notFound();

  return (
    <ProjectOverviewClient
      project={project}
      role={user.role}
    />
  );
}