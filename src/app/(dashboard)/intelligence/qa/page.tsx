import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import RagClient from "@/components/intelligence/RagClient";

export default async function RagPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
    orderBy: { priorityOrder: "asc" },
  });

  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });
  const hasApiKey = !!settings?.claudeApiKeyEncrypted;

  return (
    <>
      <TopBar title="RAG Q&A" />
      <RagClient projects={projects} hasApiKey={hasApiKey} role={role} />
    </>
  );
}
