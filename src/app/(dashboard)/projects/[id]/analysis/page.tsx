// src/app/(dashboard)/projects/[id]/analysis/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import AnalysisPageClient from "@/components/projects/AnalysisPageClient";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };
  if (user.role !== "admin") redirect(`/projects/${params.id}`);

  const project = await prisma.project.findUnique({
    where: { id: params.id, archivedAt: null },
    select: {
      id: true,
      name: true,
      repositoryUrl: true,
      status: true,
    },
  });
  if (!project) notFound();

  const latestAnalysis = await prisma.projectAnalysis.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      suggestedTasks: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
    },
  });

  const settings = await prisma.settings.findFirst({
    select: { claudeApiKeyEncrypted: true, githubPatEncrypted: true },
  });
  const hasApiKey = !!settings?.claudeApiKeyEncrypted;
  const hasGithubPat = !!settings?.githubPatEncrypted;

  return (
    <AnalysisPageClient
      project={project}
      initialAnalysis={latestAnalysis ? JSON.parse(JSON.stringify(latestAnalysis)) : null}
      hasApiKey={hasApiKey}
      hasGithubPat={hasGithubPat}
    />
  );
}