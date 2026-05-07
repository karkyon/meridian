// src/app/(dashboard)/projects/[id]/ai-progress/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AiProgressClient from "@/components/projects/AiProgressClient";
import TopBar from "@/components/layout/TopBar";

type Props = { params: { id: string } };

export default async function AiProgressPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };
  if (user.role !== "admin") redirect(`/projects/${params.id}`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, repositoryUrl: true },
  });
  if (!project) redirect("/");

  const settings = await prisma.settings.findFirst({
    select: { githubPatEncrypted: true },
  });

  return (
    <>
      <TopBar title={`${project.name} — AI進捗推定`} />
      <main className="flex-1 p-6">
        <AiProgressClient
          projectId={params.id}
          projectName={project.name}
          repositoryUrl={project.repositoryUrl ?? ""}
          hasGithubPat={!!settings?.githubPatEncrypted}
        />
      </main>
    </>
  );
}