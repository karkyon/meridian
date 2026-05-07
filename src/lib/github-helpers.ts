// src/lib/github-helpers.ts
import { prisma } from "@/lib/prisma";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";

export async function getGitHubPat(): Promise<string> {
  const settings = await prisma.settings.findFirst({
    select: { githubPatEncrypted: true, githubPatIv: true },
  });
  if (!settings?.githubPatEncrypted || !settings?.githubPatIv) {
    throw new Error("GITHUB_PAT_NOT_SET");
  }
  return decryptApiKey(settings.githubPatEncrypted, settings.githubPatIv);
}

export function parseRepoFromUrl(url: string): { owner: string; repo: string } | null {
  try {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  } catch {
    return null;
  }
}

export type GitHubRepoInfo = {
  owner: string;
  repo: string;
  fullName: string;
  lastPushedAt: string;
  commitCount: number;
  openPrCount: number;
  openIssueCount: number;
  branchCount: number;
  defaultBranch: string;
  recentCommits: Array<{
    sha: string;
    message: string;
    date: string;
    author: string;
  }>;
  weeklyActivity: number[];
  activityStatus: "active" | "slow" | "stale" | "inactive";
  daysSinceLastPush: number;
};

export function calcActivityStatus(daysSince: number): GitHubRepoInfo["activityStatus"] {
  if (daysSince <= 7) return "active";
  if (daysSince <= 30) return "slow";
  if (daysSince <= 90) return "stale";
  return "inactive";
}

export async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
  pat: string
): Promise<GitHubRepoInfo> {
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const base = "https://api.github.com";

  // リポジトリ基本情報
  const repoRes = await fetch(`${base}/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    const err = await repoRes.json().catch(() => ({}));
    throw new Error(`GitHub API error ${repoRes.status}: ${(err as any).message ?? repoRes.statusText}`);
  }
  const repoData = await repoRes.json();

  // コミット数（最大1ページ = 100件で近似）
  const commitsRes = await fetch(
    `${base}/repos/${owner}/${repo}/commits?per_page=1`,
    { headers }
  );
  let commitCount = 0;
  const linkHeader = commitsRes.headers.get("link") ?? "";
  const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
  if (lastMatch) {
    commitCount = parseInt(lastMatch[1], 10);
  } else {
    const commitsData = await commitsRes.json().catch(() => []);
    commitCount = Array.isArray(commitsData) ? commitsData.length : 0;
  }

  // 直近5コミット
  const recentCommitsRes = await fetch(
    `${base}/repos/${owner}/${repo}/commits?per_page=5`,
    { headers }
  );
  const recentCommitsData = await recentCommitsRes.json().catch(() => []);
  const recentCommits = Array.isArray(recentCommitsData)
    ? recentCommitsData.map((c: any) => ({
        sha: (c.sha as string).substring(0, 7),
        message: (c.commit?.message ?? "").split("\n")[0].substring(0, 72),
        date: c.commit?.author?.date ?? "",
        author: c.commit?.author?.name ?? "",
      }))
    : [];

  // オープンPR数
  const prRes = await fetch(
    `${base}/repos/${owner}/${repo}/pulls?state=open&per_page=1`,
    { headers }
  );
  let openPrCount = 0;
  const prLink = prRes.headers.get("link") ?? "";
  const prLast = prLink.match(/page=(\d+)>; rel="last"/);
  if (prLast) {
    openPrCount = parseInt(prLast[1], 10);
  } else {
    const prData = await prRes.json().catch(() => []);
    openPrCount = Array.isArray(prData) ? prData.length : 0;
  }

  // ブランチ数
  const branchRes = await fetch(
    `${base}/repos/${owner}/${repo}/branches?per_page=100`,
    { headers }
  );
  const branchData = await branchRes.json().catch(() => []);
  const branchCount = Array.isArray(branchData) ? branchData.length : 0;

  // 週次アクティビティ（過去12週）
  const statsRes = await fetch(
    `${base}/repos/${owner}/${repo}/stats/commit_activity`,
    { headers }
  );
  let weeklyActivity: number[] = new Array(12).fill(0);
  if (statsRes.ok) {
    const statsData = await statsRes.json().catch(() => []);
    if (Array.isArray(statsData) && statsData.length >= 12) {
      weeklyActivity = statsData.slice(-12).map((w: any) => w.total ?? 0);
    }
  }

  const lastPushedAt = repoData.pushed_at ?? repoData.updated_at;
  const daysSinceLastPush = lastPushedAt
    ? Math.floor((Date.now() - new Date(lastPushedAt).getTime()) / 86400000)
    : 999;

  return {
    owner,
    repo,
    fullName: repoData.full_name,
    lastPushedAt,
    commitCount,
    openPrCount,
    openIssueCount: repoData.open_issues_count ?? 0,
    branchCount,
    defaultBranch: repoData.default_branch ?? "main",
    recentCommits,
    weeklyActivity,
    activityStatus: calcActivityStatus(daysSinceLastPush),
    daysSinceLastPush,
  };
}