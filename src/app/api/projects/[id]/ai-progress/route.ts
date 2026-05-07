// src/app/api/projects/[id]/ai-progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { getGitHubPat, parseRepoFromUrl, fetchGitHubRepoInfo } from "@/lib/github-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

export type TaskInference = {
  taskId: string;
  taskTitle: string;
  confidence: number;         // 0-100
  inferredStatus: "done" | "in_progress" | "todo";
  evidence: string;
  suggestUpdate: boolean;
  currentStatus: string;
};

export type AiProgressResult = {
  projectId: string;
  analyzedAt: string;
  totalTasks: number;
  estimatedDoneCount: number;
  estimatedInProgressCount: number;
  estimatedCompletionRate: number;
  inferenceAccuracyNote: string;
  tasks: TaskInference[];
};

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        wbsPhases: {
          include: { tasks: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const allTasks = project.wbsPhases.flatMap((p: any) =>
      p.tasks.map((t: any) => ({ ...t, phaseName: p.name }))
    );
    if (allTasks.length === 0) {
      return NextResponse.json({ error: "NO_TASKS" }, { status: 400 });
    }

    // GitHub情報取得
    let githubContext = "";
    if (project.repositoryUrl) {
      try {
        const pat = await getGitHubPat();
        const parsed = parseRepoFromUrl(project.repositoryUrl);
        if (parsed) {
          const info = await fetchGitHubRepoInfo(parsed.owner, parsed.repo, pat);

          // ファイルツリー取得（最大300件）
          const treeRes = await fetch(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${info.defaultBranch}?recursive=1`,
            {
              headers: {
                Authorization: `Bearer ${pat}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            }
          );
          let fileTree = "";
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            const files = (treeData.tree ?? [])
              .filter((f: any) => f.type === "blob")
              .map((f: any) => f.path)
              .slice(0, 300);
            fileTree = files.join("\n");
          }

          const commitMsgs = info.recentCommits
            .map((c) => `- ${c.sha} (${c.date.substring(0, 10)}): ${c.message}`)
            .join("\n");

          githubContext = `
## GitHubリポジトリ情報
- リポジトリ: ${info.fullName}
- 最終push: ${info.lastPushedAt} (${info.daysSinceLastPush}日前)
- 総コミット数: ${info.commitCount}
- Open PR: ${info.openPrCount}件

## 直近コミットメッセージ
${commitMsgs}

## ファイルツリー（抜粋）
${fileTree}
`;
        }
      } catch {
        githubContext = "（GitHub情報取得失敗 — WBSのみで判断）";
      }
    }

    let apiKey: string;
    try {
      apiKey = await getClaudeApiKey();
    } catch {
      return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
    }

    const taskListStr = allTasks
      .map((t: any) => `[${t.id}] (${t.phaseName}) ${t.title} — 現在: ${t.status}`)
      .join("\n");

    const prompt = `あなたはソフトウェア開発の進捗分析専門家です。
以下のプロジェクト情報とWBSタスク一覧をもとに、各タスクの実装状況をGitHubの証拠から推定してください。

## プロジェクト名
${project.name}

${githubContext}

## WBSタスク一覧
${taskListStr}

## 判定ルール
- ファイルが存在し、コミットメッセージに関連する記述があれば「done」と推定
- ファイルは存在するが未完成の兆候（TODO/WIP/fix等）があれば「in_progress」
- 証拠なしは「todo」（現状維持）
- 確信度(confidence)は0〜100で表現

## 出力形式
JSON配列のみ出力（前置き不要）:
[
  {
    "taskId": "タスクのUUID",
    "confidence": 数値,
    "inferredStatus": "done"|"in_progress"|"todo",
    "evidence": "判断根拠（50文字以内）",
    "suggestUpdate": true|false
  }
]

suggestUpdateは現在のステータスと推定が異なりかつconfidence >= 70の場合のみtrue。`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    const clean = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();

    let inferences: Array<{
      taskId: string;
      confidence: number;
      inferredStatus: string;
      evidence: string;
      suggestUpdate: boolean;
    }> = [];

    try {
      inferences = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "AI_PARSE_ERROR" }, { status: 500 });
    }

    const taskMap = new Map(allTasks.map((t: any) => [t.id, t]));
    const tasks: TaskInference[] = inferences
      .map((inf) => {
        const task = taskMap.get(inf.taskId);
        if (!task) return null;
        return {
          taskId: inf.taskId,
          taskTitle: task.title,
          confidence: inf.confidence,
          inferredStatus: inf.inferredStatus as TaskInference["inferredStatus"],
          evidence: inf.evidence,
          suggestUpdate: inf.suggestUpdate,
          currentStatus: task.status,
        };
      })
      .filter(Boolean) as TaskInference[];

    const estimatedDone = tasks.filter((t) => t.inferredStatus === "done").length;
    const estimatedInProgress = tasks.filter((t) => t.inferredStatus === "in_progress").length;

    const result: AiProgressResult = {
      projectId: params.id,
      analyzedAt: new Date().toISOString(),
      totalTasks: allTasks.length,
      estimatedDoneCount: estimatedDone,
      estimatedInProgressCount: estimatedInProgress,
      estimatedCompletionRate: allTasks.length > 0
        ? Math.round((estimatedDone / allTasks.length) * 100)
        : 0,
      inferenceAccuracyNote: project.repositoryUrl
        ? "GitHubコード＋コミット履歴から推定"
        : "WBSのみ（GitHub未連携）で推定",
      tasks,
    };

    return NextResponse.json(result);
  });
}