import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import PriorityClient from "@/components/priority/PriorityClient";

export default async function PriorityPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    orderBy: { priorityOrder: "asc" },
    select: {
      id: true, name: true, status: true, priorityScore: true, priorityOrder: true,
      progressCache: true, delayRisk: true,
      priorityScores: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { impact: true, urgency: true, learning: true, cost: true, motivation: true, totalScore: true },
      },
    },
  });

  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });

  return (
    <>
      <TopBar title="優先度管理" />
      <PriorityClient
        initialProjects={projects}
        role={role}
        hasApiKey={!!settings?.claudeApiKeyEncrypted}
      />
    </>
  );
}
