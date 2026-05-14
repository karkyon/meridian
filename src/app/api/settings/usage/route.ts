// src/app/api/settings/usage/route.ts
// APIコスト・使用量集計エンドポイント（Admin専用）

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {

    // ── 全分析レコード取得 ──────────────────────────────────────
    const analyses = await prisma.projectAnalysis.findMany({
      where: { status: "completed" },
      select: {
        id: true,
        projectId: true,
        createdAt: true,
        completedAt: true,
        // @ts-ignore
        inputTokens: true,
        // @ts-ignore
        outputTokens: true,
        // @ts-ignore
        estimatedCostUsd: true,
        // @ts-ignore
        modelUsed: true,
        // @ts-ignore
        executionMode: true,
        // @ts-ignore
        loopCount: true,
        overallScore: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // プロジェクト名マップ（Array.from で Set を展開 — downlevelIteration 不要）
    const projectIds = Array.from(new Set(analyses.map((a) => a.projectId)));
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const projectMap: Record<string, string> = {};
    for (const p of projects) {
      projectMap[p.id] = p.name;
    }

    // ── 集計処理 ───────────────────────────────────────────────
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // AIモードの課金対象のみ
    const billable = analyses.filter(
      (a) => (a as unknown as { executionMode?: string }).executionMode !== "manual"
    );

    const toCost = (v: unknown): number => {
      if (v == null) return 0;
      return Number(v);
    };

    const totalCostUsd = billable.reduce((s, a) => s + toCost((a as any).estimatedCostUsd), 0);
    const monthlyCostUsd = billable
      .filter((a) => new Date(a.createdAt) >= startOfMonth)
      .reduce((s, a) => s + toCost((a as any).estimatedCostUsd), 0);
    const last30DaysCostUsd = billable
      .filter((a) => new Date(a.createdAt) >= startOf30Days)
      .reduce((s, a) => s + toCost((a as any).estimatedCostUsd), 0);
    const avgCostUsd = billable.length > 0 ? totalCostUsd / billable.length : 0;
    const totalInputTokens = billable.reduce((s, a) => s + ((a as any).inputTokens ?? 0), 0);
    const totalOutputTokens = billable.reduce((s, a) => s + ((a as any).outputTokens ?? 0), 0);

    // モデル別集計
    const byModel: Record<string, { count: number; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    for (const a of billable) {
      const model = (a as any).modelUsed ?? "unknown";
      if (!byModel[model]) byModel[model] = { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      byModel[model].count++;
      byModel[model].inputTokens += (a as any).inputTokens ?? 0;
      byModel[model].outputTokens += (a as any).outputTokens ?? 0;
      byModel[model].costUsd += toCost((a as any).estimatedCostUsd);
    }

    // 月別集計（直近6ヶ月）
    const monthlyBreakdown: Array<{
      month: string;
      count: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
    }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = billable.filter((a) => {
        const t = new Date(a.createdAt);
        return t >= d && t < end;
      });
      monthlyBreakdown.push({
        month: label,
        count: bucket.length,
        costUsd: bucket.reduce((s, a) => s + toCost((a as any).estimatedCostUsd), 0),
        inputTokens: bucket.reduce((s, a) => s + ((a as any).inputTokens ?? 0), 0),
        outputTokens: bucket.reduce((s, a) => s + ((a as any).outputTokens ?? 0), 0),
      });
    }

    // 直近20件
    const recentList = analyses.slice(0, 20).map((a) => ({
      id: a.id,
      projectId: a.projectId,
      projectName: projectMap[a.projectId] ?? "不明",
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      executionMode: (a as any).executionMode ?? "ai",
      modelUsed: (a as any).modelUsed ?? null,
      inputTokens: (a as any).inputTokens ?? null,
      outputTokens: (a as any).outputTokens ?? null,
      estimatedCostUsd: toCost((a as any).estimatedCostUsd),
      overallScore: a.overallScore,
      loopCount: (a as any).loopCount ?? null,
    }));

    return NextResponse.json({
      summary: {
        totalAnalyses: analyses.length,
        billableAnalyses: billable.length,
        manualAnalyses: analyses.length - billable.length,
        totalCostUsd,
        monthlyCostUsd,
        last30DaysCostUsd,
        avgCostUsd,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      byModel,
      monthlyBreakdown,
      recentList,
      generatedAt: new Date().toISOString(),
      note: "クレジット残高の取得にはAnthropicのAdmin APIキーが必要です。console.anthropic.comでご確認ください。",
    });
  });
}