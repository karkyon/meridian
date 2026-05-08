import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import HealthClient from "@/components/intelligence/HealthClient";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    orderBy: { priorityOrder: "asc" },
    select: {
      id: true,
      name: true,
      techStack: true,
      healthScore: true,
      healthScores: {
        orderBy: { evaluatedAt: "desc" },
        take: 10,
      },
    },
  });

  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });
  const hasApiKey = !!settings?.claudeApiKeyEncrypted;

  return (
    <>
      <TopBar title="技術ヘルスレポート" />
      <HealthClient projects={projects} hasApiKey={hasApiKey} role={role} />
    </>
  );
}