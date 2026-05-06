import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  return withAdmin(req, async () => {
    let apiKey: string;
    try {
      apiKey = await getClaudeApiKey();
    } catch {
      return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
    }

    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      include: {
        wbsPhases: {
          include: { tasks: { select: { status: true, updatedAt: true, title: true, dueDate: true } } },
        },
      },
      orderBy: { priorityOrder: "asc" },
    });

    // 今週の活動サマリー
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const projectSummaries = projects.map((p: any) => {
      const allTasks = p.wbsPhases.flatMap((ph: any) => ph.tasks);
      const weeklyDone = allTasks.filter(
        (t: any) => t.status === "done" && t.updatedAt >= weekStart
      ).length;
      const overdue = allTasks.filter(
        (t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done"
      ).length;
      return `- ${p.name} [${p.status}]: 進捗${Number(p.progressCache).toFixed(0)}%, 今週完了${weeklyDone}件${overdue > 0 ? `, 期限超過${overdue}件` : ""}`;
    }).join("\n");

    const client = new Anthropic({ apiKey });

    const prompt = `プロジェクト管理AIとして、今週のプロジェクト全体サマリーを生成してください。

## 今週の状況
${projectSummaries}

## 要件
- 日本語で300〜500文字
- 今週の主な進捗・課題・来週への提案を含める
- 箇条書きと段落を組み合わせて読みやすく
- ポジティブかつ実践的なトーンで`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";

    // 今週の月曜日
    const weekStartDate = new Date(weekStart);

    // 既存レコードがあれば更新、なければ作成
    const existing = await prisma.weeklySummary.findUnique({
      where: { weekStart: weekStartDate },
    });

    let summary;
    if (existing) {
      summary = await prisma.weeklySummary.update({
        where: { weekStart: weekStartDate },
        data: { content, generatedAt: new Date() },
      });
    } else {
      summary = await prisma.weeklySummary.create({
        data: {
          weekStart: weekStartDate,
          content,
          generatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ content, focus_tasks: [], generated_at: summary.generatedAt });
  });
}
