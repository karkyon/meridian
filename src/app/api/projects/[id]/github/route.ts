// src/app/api/projects/[id]/github/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { getGitHubPat, parseRepoFromUrl, fetchGitHubRepoInfo } from "@/lib/github-helpers";

type Params = { params: { id: string } };

// キャッシュ（インメモリ・サーバー再起動でクリア）
const cache = new Map<string, { data: object; expiresAt: number }>();

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { repositoryUrl: true, name: true },
    });

    if (!project?.repositoryUrl) {
      return NextResponse.json({ error: "NO_REPOSITORY_URL" }, { status: 404 });
    }

    const parsed = parseRepoFromUrl(project.repositoryUrl);
    if (!parsed) {
      return NextResponse.json({ error: "INVALID_REPOSITORY_URL" }, { status: 400 });
    }

    // キャッシュ確認
    const cacheKey = `${parsed.owner}/${parsed.repo}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    let pat: string;
    try {
      pat = await getGitHubPat();
    } catch {
      return NextResponse.json({ error: "GITHUB_PAT_NOT_SET" }, { status: 400 });
    }

    try {
      const info = await fetchGitHubRepoInfo(parsed.owner, parsed.repo, pat);

      // キャッシュ設定（設定値に従う）
      const settings = await prisma.settings.findFirst({ select: { githubCacheHours: true } });
      const cacheHours = settings?.githubCacheHours ?? 6;
      cache.set(cacheKey, {
        data: info,
        expiresAt: Date.now() + cacheHours * 3600 * 1000,
      });

      return NextResponse.json({ ...info, cached: false });
    } catch (e: any) {
      return NextResponse.json(
        { error: "GITHUB_FETCH_FAILED", message: e.message },
        { status: 502 }
      );
    }
  });
}