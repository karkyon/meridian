import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const settings = await prisma.settings.findFirst({ select: { focusModeCount: true } });
    const count = settings?.focusModeCount ?? 3;

    // 未完了タスク（期限あり・期限近い順）を取得
    const tasks = await prisma.wbsTask.findMany({
      where: { status: { in: ["todo", "in_progress"] } },
      include: {
        phase: {
          include: { project: { select: { id: true, name: true, priorityScore: true } } },
        },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 50,
    });

    if (tasks.length === 0) {
      return NextResponse.json({ focus_tasks: [] });
    }

    // AI選出を試みる
    try {
      const apiKey = await getClaudeApiKey();
      const client = new Anthropic({ apiKey });

      const taskList = tasks.slice(0, 20).map((t, i) =>
        `${i + 1}. [${t.phase.project.name}] ${t.title} (優先度:${t.priority}, 期限:${t.dueDate ? new Date(t.dueDate).toLocaleDateString("ja-JP") : "なし"}, PJスコア:${t.phase.project.priorityScore})`
      ).join("\n");

      const prompt = `今日取り組むべきタスクTop ${count}件を選んでください。

## タスク一覧
${taskList}

## 選定基準
1. プロジェクトの優先度スコアが高い
2. 期限が近い・過ぎている
3. タスクの優先度がhigh
4. 進行中(in_progress)のタスクを優先

## 出力形式
JSON配列で返してください（配列のみ）:
[{"index":番号,"reason":"選択理由（30文字以内）"}]`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const clean = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      const selected: Array<{ index: number; reason: string }> = JSON.parse(clean);

      const focusTasks = selected.slice(0, count).map(({ index, reason }) => {
        const task = tasks[index - 1];
        if (!task) return null;
        return {
          task_id: task.id,
          title: task.title,
          project_name: task.phase.project.name,
          project_id: task.phase.project.id,
          reason,
          priority: task.priority,
          due_date: task.dueDate,
        };
      }).filter(Boolean);

      return NextResponse.json({ focus_tasks: focusTasks });
    } catch {
      // フォールバック: シンプルな優先度順
      const focusTasks = tasks.slice(0, count).map((t) => ({
        task_id: t.id,
        title: t.title,
        project_name: t.phase.project.name,
        project_id: t.phase.project.id,
        reason: t.priority === "high" ? "高優先度タスク" : t.dueDate ? "期限あり" : "進行中",
        priority: t.priority,
        due_date: t.dueDate,
      }));

      return NextResponse.json({ focus_tasks: focusTasks });
    }
  });
}
