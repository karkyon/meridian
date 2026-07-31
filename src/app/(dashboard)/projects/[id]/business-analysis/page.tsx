// src/app/(dashboard)/projects/[id]/business-analysis/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import BusinessAnalysisClient from "@/components/projects/BusinessAnalysisClient";

type Params = { params: { id: string } };

export default async function BusinessAnalysisPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { role: string };

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const historyRaw = await prisma.businessAnalysis.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { categories: true },
  });

  // Date型はクライアントコンポーネントのprops型(string)に合わせてISO文字列化する
  const history = historyRaw.map((h) => ({
    id: h.id,
    overallScore: h.overallScore,
    summary: h.summary,
    aiSuggested: h.aiSuggested,
    createdAt: h.createdAt.toISOString(),
    categories: h.categories.map((c) => ({
      category: c.category as string,
      score: c.score,
      rationale: c.rationale,
      advice: c.advice,
      aiSuggestedScore: c.aiSuggestedScore,
      manuallyOverridden: c.manuallyOverridden,
    })),
  }));

  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });
  const hasApiKey = !!settings?.claudeApiKeyEncrypted;

  return (
    <BusinessAnalysisClient
      projectId={project.id}
      projectName={project.name}
      initialHistory={history}
      role={user.role}
      hasApiKey={hasApiKey}
    />
  );
}
