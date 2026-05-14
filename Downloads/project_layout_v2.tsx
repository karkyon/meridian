// src/app/(dashboard)/projects/[id]/layout.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import ProjectTabNav from "@/components/projects/ProjectTabNav";
import DocSubNav from "@/components/projects/DocSubNav";

type Props = {
  children: React.ReactNode;
  params: { id: string };
};

export default async function ProjectLayout({ children, params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, repositoryUrl: true },
  });
  if (!project) redirect("/");

  return (
    <>
      <TopBar
        title={project.name}
        backHref="/dashboard"
        backLabel="ダッシュボードに戻る"
      />
      {/* タブ or ドキュメントサブナビ（クライアントコンポーネントで切り替え） */}
      <DocSubNav projectId={params.id} />
      <ProjectTabNav
        projectId={params.id}
        hasRepo={!!project.repositoryUrl}
        role={user.role}
      />
      <main className="flex-1 flex flex-col min-h-0">
        {children}
      </main>
    </>
  );
}
