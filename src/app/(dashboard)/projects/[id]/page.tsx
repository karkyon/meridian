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
          files: { select: { originalName: true }, orderBy: { createdAt: "desc" } },
        },
      },
      wbsPhases: {
        orderBy: { sortOrder: "asc" },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      },
      attachments: { select: { id: true } },
      customDocuments: {
        include: {
          customDocType: { select: { key: true, label: true } },
          _count: { select: { files: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const serializedProject = {
    ...project,
    progressCache: Number(project.progressCache),
    docCompleteness: Number(project.docCompleteness),
    wbsPhases: project.wbsPhases.map((p: any) => ({
      ...p,
      tasks: p.tasks.map((t: any) => ({
        ...t,
        estimatedHours: t.estimatedHours ? Number(t.estimatedHours) : null,
      })),
    })),
  };

  const documents = project.documents.map((d: any) => ({
    docType: d.docType as string,
    completeness: d.completeness,
    version: d.version,
    fileCount: d._count?.files ?? 0,
    aiGenerated: d.aiGenerated,
    files: (d.files ?? []).map((f: any) => ({ originalName: f.originalName })),
  }));

  const globalCustomTypes = await prisma.customDocType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const projectCustomTypes = await prisma.projectCustomDocType.findMany({
    where: { projectId: params.id },
    orderBy: { sortOrder: "asc" },
  });

  type CustomDocEntry = {
    completeness: number;
    version: number;
    _count: { files: number } | null;
  };
  const customDocMap = new Map<string, CustomDocEntry>(
    project.customDocuments.map((d: any) => [d.customTypeKey, {
      completeness: d.completeness,
      version: d.version,
      _count: d._count,
    }])
  );

  const customDocTypes = [
    ...globalCustomTypes.map((t: any) => ({ key: t.key, label: t.label })),
    ...projectCustomTypes.map((t: any) => ({ key: t.key, label: t.label })),
  ].map((t: any) => {
    const doc = customDocMap.get(t.key);
    return {
      key: t.key,
      label: t.label,
      completeness: doc?.completeness ?? 0,
      version: doc?.version ?? 0,
      fileCount: doc?._count?.files ?? 0,
    };
  });

  return (
    <>
      <TopBar title={project.name} />
      <ProjectDetailClient
        project={serializedProject}
        documents={documents}
        customDocTypes={customDocTypes}
        attachmentCount={project.attachments.length}
        role={role}
      />
    </>
  );
}
