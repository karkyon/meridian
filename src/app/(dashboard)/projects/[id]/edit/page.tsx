import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import ProjectForm from "@/components/projects/ProjectForm";

type Params = { params: { id: string } };

export default async function EditProjectPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/dashboard");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, description: true, status: true,
      category: true, repositoryUrl: true, notes: true,
      techStacks: {                          // ← 追加
        orderBy: [{ sortOrder: "asc" }],
      },
    },
  });
  
  if (!project) notFound();

  return (
    <>
      <TopBar title={`${project.name} — 編集`} />
      <main className="flex-1 p-6 max-w-2xl">
        <ProjectForm
          initial={{
            id: project.id,
            name: project.name,
            description: project.description ?? "",
            status: project.status,
            category: project.category ?? "",
            techStack: Array.isArray(project.techStack) ? project.techStack as string[] : [],
            repositoryUrl: project.repositoryUrl ?? "",
            notes: project.notes ?? "",
          }}
        />
      </main>
    </>
  );
}
