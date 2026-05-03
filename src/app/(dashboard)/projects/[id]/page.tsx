import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import ProjectDetailClient from "@/components/projects/ProjectDetailClient";

type Params = { params: { id: string } };

export default async function ProjectDetailPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      documents: {
        select: {
          id: true, docType: true, content: true,
          completeness: true, aiGenerated: true, version: true, updatedAt: true,
        },
      },
      wbsPhases: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!project) notFound();

  return (
    <>
      <TopBar title={project.name} />
      <ProjectDetailClient project={project} role={role} />
    </>
  );
}
