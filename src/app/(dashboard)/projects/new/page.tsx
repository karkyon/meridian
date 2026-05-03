import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import ProjectForm from "@/components/projects/ProjectForm";

export default async function NewProjectPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/dashboard");

  return (
    <>
      <TopBar title="新規プロジェクト作成" />
      <main className="flex-1 p-6 max-w-2xl">
        <ProjectForm />
      </main>
    </>
  );
}
