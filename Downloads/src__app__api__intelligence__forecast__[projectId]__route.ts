import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { projectId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        wbsPhases: {
          include: { tasks: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const allTasks = project.wbsPhases.flatMap((p: any) => p.tasks);
    const totalTasks = allTasks.length;
    const doneTasks = allTasks.filter((t: any) => t.status === "done").length;
    const blockedTasks = allTasks.filter((t: any) => t.status === "blocked").length;
    const overdueTasks = allTasks.filter(
      (t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done"
    ).length;

    // タスクがない場合はシンプルに返す
    if (totalTasks === 0) {
      await prisma.project.update({
        where: { id: params.projectId },
        data: { delayRisk: "none" },
      });
      return NextResponse.json({
        risk_level: "none",
        estimated_delay_days: 0,
        bottleneck_phase: null,
        recommendations: ["WBSタスクを追加してプロジェクトを開始してください"],
      });
    }

    // Claude APIが設定されていない場合はロジックベースで計算
    let riskLevel: "none" | "low" | "medium" | "high" = "none";
    let estimatedDelayDays = 0;
    let bottleneckPhase: string | null = null;
    let recommendations: string[] = [];

    // ボトルネックフェーズを特定
    let maxBlockedPhase = { name: "", blocked: 0 };
    for (const phase of project.wbsPhases) {
      const blocked = phase.tasks.filter((t: any) => t.status === "blocked").length;
      if (blocked > maxBlockedPhase.blocked) {
        maxBlockedPhase = { name: phase.name, blocked };
      }
    }
    if (maxBlockedPhase.blocked > 0) bottleneckPhase = maxBlockedPhase.name;

    // リスクスコア計算
    const overdueRate = overdueTasks / totalTasks;
    const blockedRate = blockedTasks / totalTasks;
    const progressRate = doneTasks / totalTasks;

    if (overdueRate > 0.3 || blockedRate > 0.2) {
      riskLevel = "high";
      estimatedDelayDays = Math.round(overdueTasks * 3 + blockedTasks * 2);
      recommendations = [
        "ブロック中タスクを優先的に解決してください",
        "期限超過タスクの担当者と緊急ミーティングを設定してください",
        "スコープの削減を検討してください",
      ];
    } else if (overdueRate > 0.1 || blockedRate > 0.1) {
      riskLevel = "medium";
      estimatedDelayDays = Math.round(overdueTasks * 2);
      recommendations = [
        "期限超過タスクのスケジュールを見直してください",
        "週次レビューを実施して進捗を確認してください",
      ];
    } else if (overdueRate > 0 || progressRate < 0.3) {
      riskLevel = "low";
      estimatedDelayDays = overdueTasks;
      recommendations = ["現在のペースを維持してください"];
    } else {
      riskLevel = "none";
      recommendations = ["順調に進んでいます"];
    }

    // AI分析が利用可能な場合は追加インサイトを取得
    try {
      const apiKey = await getClaudeApiKey();
      const client = new Anthropic({ apiKey });

      const phaseSummary = project.wbsPhases.map((p: any) => {
        const total = p.tasks.length;
        const done = p.tasks.filter((t: any) => t.status === "done").length;
        const blocked = p.tasks.filter((t: any) => t.status === "blocked").length;
        return `${p.name}: ${done}/${total}完了, ${blocked}ブロック`;
      }).join("\n");

      const prompt = `プロジェクト「${project.name}」の進捗を分析してください。

## 現状
- 総タスク: ${totalTasks}件
- 完了: ${doneTasks}件 (${Math.round(progressRate * 100)}%)
- ブロック中: ${blockedTasks}件
- 期限超過: ${overdueTasks}件

## フェーズ別状況
${phaseSummary}

## 依頼
リスクレベル・推定遅延日数・ボトルネックフェーズ・推奨アクション3件を以下のJSON形式で返してください。
{"risk_level":"none|low|medium|high","estimated_delay_days":数値,"bottleneck_phase":"フェーズ名またはnull","recommendations":["...", "...", "..."]}
JSONのみ出力してください。`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const aiResult = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim());

      riskLevel = aiResult.risk_level ?? riskLevel;
      estimatedDelayDays = aiResult.estimated_delay_days ?? estimatedDelayDays;
      bottleneckPhase = aiResult.bottleneck_phase ?? bottleneckPhase;
      recommendations = aiResult.recommendations ?? recommendations;
    } catch {
      // AI分析失敗時はロジックベースの結果をそのまま使用
    }

    // delay_risk をキャッシュ
    await prisma.project.update({
      where: { id: params.projectId },
      data: { delayRisk: riskLevel as "none" | "low" | "medium" | "high" },
    });

    return NextResponse.json({
      risk_level: riskLevel,
      estimated_delay_days: estimatedDelayDays,
      bottleneck_phase: bottleneckPhase,
      recommendations,
    });
  });
}
