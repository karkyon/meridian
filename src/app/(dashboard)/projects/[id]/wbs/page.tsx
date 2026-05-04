import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import WbsManager from "@/components/wbs/WbsManager";

type Params = { params: { id: string } };

export default async function WbsPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const phases = await prisma.wbsPhase.findMany({
    where: { projectId: params.id },
    orderBy: { sortOrder: "asc" },
    include: {
      tasks: { orderBy: { sortOrder: "asc" } },
    },
  });

  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });

  return (
    <>
      <TopBar title={`${project.name} — WBS管理`} />
      <WbsManager
        projectId={params.id}
        projectName={project.name}
        initialPhases={phases}
        role={role}
        hasApiKey={!!settings?.claudeApiKeyEncrypted}
      />
    </>
  );
}
