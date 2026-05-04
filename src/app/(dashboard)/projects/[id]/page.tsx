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
          _count: { select: { files: true } },
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

  // _countをシリアライズ可能な形に変換
  const serializedProject = {
    ...project,
    progressCache: Number(project.progressCache),
    docCompleteness: Number(project.docCompleteness),
    documents: project.documents.map((d) => ({
      ...d,
      fileCount: d._count?.files ?? 0,
    })),
    wbsPhases: project.wbsPhases.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => ({
        ...t,
        estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      })),
    })),
  };

  return (
    <>
      <TopBar title={project.name} />
      <ProjectDetailClient project={serializedProject} role={role} />
    </>
  );
}
