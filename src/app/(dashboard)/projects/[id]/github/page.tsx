// src/app/(dashboard)/projects/[id]/github/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import GitHubTabClient from "@/components/projects/GitHubTabClient";
import TopBar from "@/components/layout/TopBar";

type Props = { params: { id: string } };

export default async function ProjectGitHubPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, repositoryUrl: true },
  });
  if (!project) redirect("/");

  const settings = await prisma.settings.findFirst({
    select: { githubPatEncrypted: true },
  });
  const hasGithubPat = !!settings?.githubPatEncrypted;

  return (
      <>
        <TopBar title={`${project.name} — GitHub`} />
        <main className="flex-1 p-6">
          <GitHubTabClient
            projectId={params.id}
            projectName={project.name}
            repositoryUrl={project.repositoryUrl ?? ""}
            hasGithubPat={hasGithubPat}
          />
        </main>
      </>
  );
}