// src/app/api/intelligence/portfolio/route.ts
//
// 全プロジェクトの最新の事業性分析スコアを横断集計し、
// 総合スコア順にランキング表示するためのデータを返す。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { BUSINESS_CATEGORIES } from "@/lib/business-analysis-helpers";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        progressCache: true,
        businessScore: true,
        priorityScore: true,
        businessAnalyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { categories: true },
        },
      },
    });

    const rows = projects.map((p: any) => {
      const latest = p.businessAnalyses[0] ?? null;
      const categoryScores = Object.fromEntries(
        BUSINESS_CATEGORIES.map((def) => {
          const c = latest?.categories.find((cat: { category: string }) => cat.category === def.key);
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
        analyzed_at: latest?.createdAt ?? null,
        categories: categoryScores,
      };
    });

    // 未分析(overall_score = null)は末尾へ、それ以外は総合スコア降順
    rows.sort((a: { overall_score: number | null }, b: { overall_score: number | null }) => {
      if (a.overall_score === null && b.overall_score === null) return 0;
      if (a.overall_score === null) return 1;
      if (b.overall_score === null) return -1;
      return b.overall_score - a.overall_score;
    });

    return NextResponse.json({
      categories: BUSINESS_CATEGORIES,
      projects: rows,
    });
  });
}
