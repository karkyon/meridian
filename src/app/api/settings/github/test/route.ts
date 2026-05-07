// src/app/api/settings/github/test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  return withAdmin(req, async () => {
    const { pat } = await req.json();
    if (!pat?.trim()) {
      return NextResponse.json({ error: "PAT_REQUIRED" }, { status: 400 });
    }

    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${pat.trim()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "INVALID_PAT" }, { status: 401 });
    }

    const data = await res.json();

    // リポジトリ数確認
    const reposRes = await fetch("https://api.github.com/user/repos?per_page=1", {
      headers: {
        Authorization: `Bearer ${pat.trim()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const repoLink = reposRes.headers.get("link") ?? "";
    const repoLast = repoLink.match(/page=(\d+)>; rel="last"/);
    const repoCount = repoLast ? parseInt(repoLast[1], 10) : 1;

    return NextResponse.json({
      login: data.login,
      name: data.name,
      repo_count: repoCount,
    });
  });
}