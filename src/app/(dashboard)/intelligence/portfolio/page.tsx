// src/app/(dashboard)/intelligence/portfolio/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import PortfolioClient from "@/components/intelligence/PortfolioClient";
import { BUSINESS_CATEGORIES } from "@/lib/business-analysis-helpers";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    select: {
      id: true, name: true, status: true, progressCache: true,
      priorityScore: true, businessScore: true,
      businessAnalyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { categories: true },
      },
    },
  });

  const rows = projects.map((p: {
    id: string; name: string; status: string; progressCache: unknown;
    priorityScore: number; businessScore: number | null;
    businessAnalyses: Array<{ createdAt: Date; categories: Array<{ category: string; score: number }> }>;
  }) => {
    const latest = p.businessAnalyses[0] ?? null;
    const categoryScores = Object.fromEntries(
      BUSINESS_CATEGORIES.map((def) => {
        const c = latest?.categories.find((cat: { category: string; score: number }) => cat.category === def.key);
        return [def.key, c?.score ?? null];
      })
    );
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      progress: Number(p.progressCache),
      priority_score: p.priorityScore,
      overall_score: p.businessScore,
      analyzed_at: latest?.createdAt.toISOString() ?? null,
      categories: categoryScores,
    };
  });

  rows.sort((a: { overall_score: number | null }, b: { overall_score: number | null }) => {
    if (a.overall_score === null && b.overall_score === null) return 0;
    if (a.overall_score === null) return 1;
    if (b.overall_score === null) return -1;
    return b.overall_score - a.overall_score;
  });

  return (
    <>
      <TopBar title="ポートフォリオ分析" />
      <PortfolioClient initialProjects={rows} role={role} />
    </>
  );
}
