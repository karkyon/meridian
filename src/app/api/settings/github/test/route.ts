// src/app/api/settings/github/test/route.ts
//
// GitHub PAT接続テスト。2つの用途に対応する:
//   GET  : 既にDBに保存済みのPAT（暗号化済み）を復号してテストする
//          → 設定画面で「登録済み」の状態のまま接続テストする場合
//   POST : まだ保存していない、入力欄に入力中の値をテストする
//          → 新しいトークンを保存前に確認したい場合（body: { pat }）
import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-helpers";
import { getGitHubPat } from "@/lib/github-helpers";

async function testPat(pat: string): Promise<NextResponse> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "INVALID_PAT", message: "PATが無効か、権限が不足しています" },
      { status: 401 }
    );
  }

  const data = await res.json();

  // リポジトリ数確認
  const reposRes = await fetch("https://api.github.com/user/repos?per_page=1", {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const repoLink = reposRes.headers.get("link") ?? "";
  const repoLast = repoLink.match(/page=(\d+)>; rel="last"/);
  const repoCount = repoLast ? parseInt(repoLast[1], 10) : 1;

  return NextResponse.json({
    ok: true,
    login: data.login,
    name: data.name,
    repo_count: repoCount,
    message: `接続成功（${data.login} / アクセス可能なリポジトリ ${repoCount}件）`,
  });
}

// GET: 保存済みPATをテスト
export async function GET(req: NextRequest) {
  return withAdmin(req, async () => {
    let pat: string;
    try {
      pat = await getGitHubPat();
    } catch {
      return NextResponse.json(
        { ok: false, error: "GITHUB_PAT_NOT_SET", message: "GitHub PATが保存されていません" },
        { status: 400 }
      );
    }
    return testPat(pat);
  });
}

// POST: 未保存の入力値をテスト（body: { pat }）
export async function POST(req: NextRequest) {
  return withAdmin(req, async () => {
    const { pat } = await req.json();
    if (!pat?.trim()) {
      return NextResponse.json(
        { ok: false, error: "PAT_REQUIRED", message: "PATを入力してください" },
        { status: 400 }
      );
    }
    return testPat(pat.trim());
  });
}
