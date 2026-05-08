// src/app/api/tech-stacks/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";

/**
 * GET /api/tech-stacks/search
 *
 * クエリパラメータ（すべて任意・複数組み合わせ可）:
 *   name      - 技術名の部分一致（例: ?name=Next）
 *   category  - カテゴリ完全一致（例: ?category=database）
 *   exact     - "true" で name を完全一致に切り替え
 *
 * レスポンス:
 * {
 *   techs: [
 *     {
 *       name: "PostgreSQL",
 *       category: "database",
 *       projects: [
 *         { id, name, status, version }
 *       ]
 *     }
 *   ],
 *   total_projects: number   // 対象 techStack を持つプロジェクト総数（重複除く）
 * }
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const { searchParams } = req.nextUrl;
    const nameQuery  = searchParams.get("name")?.trim();
    const category   = searchParams.get("category")?.trim();
    const exactMatch = searchParams.get("exact") === "true";

    // 少なくともどちらか1つは必要
    if (!nameQuery && !category) {
      return NextResponse.json(
        { error: "name または category のいずれかを指定してください" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};
    if (nameQuery) {
      where.name = exactMatch
        ? nameQuery
        : { contains: nameQuery, mode: "insensitive" };
    }
    if (category) {
      where.category = category;
    }

    const rows = await prisma.projectTechStack.findMany({
      where,
      orderBy: [{ name: "asc" }, { sortOrder: "asc" }],
      select: {
        id:       true,
        name:     true,
        category: true,
        version:  true,
        project: {
          select: {
            id:         true,
            name:       true,
            status:     true,
            category:   true,
            archivedAt: true,
          },
        },
      },
    });

    // 技術名でグループ化（大文字小文字を正規化して統合）
    const grouped = new Map<
      string,
      {
        name: string;
        category: string;
        projects: Array<{
          id: string;
          name: string;
          status: string;
          projectCategory: string | null;
          version: string | null;
          archived: boolean;
        }>;
      }
    >();

    for (const row of rows) {
      const key = row.name.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          name:     row.name,
          category: row.category,
          projects: [],
        });
      }
      grouped.get(key)!.projects.push({
        id:              row.project.id,
        name:            row.project.name,
        status:          row.project.status,
        projectCategory: row.project.category,
        version:         row.version,
        archived:        !!row.project.archivedAt,
      });
    }

    const techs = Array.from(grouped.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // ユニークプロジェクト数
    const uniqueProjectIds = new Set(rows.map((r) => r.project.id));

    return NextResponse.json({
      techs,
      total_projects: uniqueProjectIds.size,
    });
  });
}

/**
 * GET /api/tech-stacks/summary
 * 全プロジェクトの技術スタックを集計（ダッシュボード用）
 *
 * レスポンス:
 * {
 *   by_category: { frontend: ["Next.js","React",...], ... },
 *   top_techs: [{ name, count, category }]   // 使用頻度上位20
 * }
 */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const all = await prisma.projectTechStack.findMany({
      where: {
        project: { archivedAt: null },
      },
      select: { name: true, category: true },
    });

    // カテゴリ別一覧
    const byCategory: Record<string, string[]> = {};
    const countMap = new Map<string, { count: number; category: string }>();

    for (const item of all) {
      // カテゴリ別
      if (!byCategory[item.category]) byCategory[item.category] = [];
      if (!byCategory[item.category].includes(item.name)) {
        byCategory[item.category].push(item.name);
      }
      // 使用頻度
      const key = item.name.toLowerCase();
      if (!countMap.has(key)) {
        countMap.set(key, { count: 0, category: item.category });
      }
      countMap.get(key)!.count++;
    }

    const topTechs = Array.from(countMap.entries())
      .map(([, v]) => v)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return NextResponse.json({ by_category: byCategory, top_techs: topTechs });
  });
}