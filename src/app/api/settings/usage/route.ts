// src/app/api/settings/usage/route.ts
// APIコスト・使用量集計エンドポイント（Admin専用）
//
// 従来は ProjectAnalysis（総合分析機能）のトークン数のみを集計しており、
// 事業性分析・概要自動入力など他のAI機能の使用量が反映されていなかった。
// api_usage_logs テーブル（全AI機能共通）と統合して集計するよう変更。

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-helpers";

const FEATURE_LABELS: Record<string, string> = {
  system_analysis: "総合分析",
  business_analysis: "事業性分析",
  overview_autofill: "概要自動入力",
};

type UsageEntry = {
  id: string;
  projectId: string | null;
  createdAt: Date;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  overallScore?: number | null;
};

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const toCost = (v: unknown): number => (v == null ? 0 : Number(v));

    // ── 1) 総合分析（ProjectAnalysis、従来からの集計対象） ──────────
    const analyses = await prisma.projectAnalysis.findMany({
      where: { status: "completed" },
      select: {
        id: true,
        projectId: true,
        createdAt: true,
        overallScore: true,
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
      },
      orderBy: { createdAt: "desc" },
    });
    const analysisEntries: UsageEntry[] = analyses
      .filter((a: { executionMode?: string }) => (a as any).executionMode !== "manual")
      .map((a: any) => ({
        id: a.id,
        projectId: a.projectId,
        createdAt: a.createdAt,
        model: a.modelUsed ?? "unknown",
        feature: "system_analysis",
        inputTokens: a.inputTokens ?? 0,
        outputTokens: a.outputTokens ?? 0,
        costUsd: toCost(a.estimatedCostUsd),
        overallScore: a.overallScore,
      }));

    // ── 2) 全AI機能横断ログ（api_usage_logs。事業性分析・概要自動入力等） ──
    const usageLogs = await prisma.apiUsageLog.findMany({ orderBy: { createdAt: "desc" } });
    const logEntries: UsageEntry[] = usageLogs.map((l: {
      id: string; projectId: string | null; createdAt: Date; model: string;
      feature: string; inputTokens: number; outputTokens: number; estimatedCostUsd: unknown;
    }) => ({
      id: l.id,
      projectId: l.projectId,
      createdAt: l.createdAt,
      model: l.model,
      feature: l.feature,
      inputTokens: l.inputTokens,
      outputTokens: l.outputTokens,
      costUsd: toCost(l.estimatedCostUsd),
    }));

    const billable = [...analysisEntries, ...logEntries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // プロジェクト名マップ
    const projectIds = Array.from(new Set(billable.map((e) => e.projectId).filter((id): id is string => !!id)));
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const projectMap: Record<string, string> = {};
    for (const p of projects) projectMap[p.id] = p.name;

    // ── 集計処理 ───────────────────────────────────────────────
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalCostUsd = billable.reduce((s, e) => s + e.costUsd, 0);
    const monthlyCostUsd = billable.filter((e) => e.createdAt >= startOfMonth).reduce((s, e) => s + e.costUsd, 0);
    const last30DaysCostUsd = billable.filter((e) => e.createdAt >= startOf30Days).reduce((s, e) => s + e.costUsd, 0);
    const avgCostUsd = billable.length > 0 ? totalCostUsd / billable.length : 0;
    const totalInputTokens = billable.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = billable.reduce((s, e) => s + e.outputTokens, 0);

    // モデル別集計
    const byModel: Record<string, { count: number; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    for (const e of billable) {
      if (!byModel[e.model]) byModel[e.model] = { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      byModel[e.model].count++;
      byModel[e.model].inputTokens += e.inputTokens;
      byModel[e.model].outputTokens += e.outputTokens;
      byModel[e.model].costUsd += e.costUsd;
    }

    // 機能別集計（新規）
    const byFeature: Record<string, { label: string; count: number; costUsd: number }> = {};
    for (const e of billable) {
      if (!byFeature[e.feature]) {
        byFeature[e.feature] = { label: FEATURE_LABELS[e.feature] ?? e.feature, count: 0, costUsd: 0 };
      }
      byFeature[e.feature].count++;
      byFeature[e.feature].costUsd += e.costUsd;
    }

    // 月別集計（直近6ヶ月）
    const monthlyBreakdown: Array<{
      month: string; count: number; costUsd: number; inputTokens: number; outputTokens: number;
    }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = billable.filter((e) => e.createdAt >= d && e.createdAt < end);
      monthlyBreakdown.push({
        month: label,
        count: bucket.length,
        costUsd: bucket.reduce((s, e) => s + e.costUsd, 0),
        inputTokens: bucket.reduce((s, e) => s + e.inputTokens, 0),
        outputTokens: bucket.reduce((s, e) => s + e.outputTokens, 0),
      });
    }

    // 直近20件
    const recentList = billable.slice(0, 20).map((e) => ({
      id: e.id,
      projectId: e.projectId,
      projectName: e.projectId ? (projectMap[e.projectId] ?? "不明") : "—",
      createdAt: e.createdAt,
      feature: e.feature,
      featureLabel: FEATURE_LABELS[e.feature] ?? e.feature,
      modelUsed: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      estimatedCostUsd: e.costUsd,
      overallScore: e.overallScore ?? null,
    }));

    return NextResponse.json({
      summary: {
        totalAnalyses: billable.length,
        billableAnalyses: billable.length,
        manualAnalyses: analyses.length - analysisEntries.length,
        totalCostUsd,
        monthlyCostUsd,
        last30DaysCostUsd,
        avgCostUsd,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      byModel,
      byFeature,
      monthlyBreakdown,
      recentList,
      generatedAt: new Date().toISOString(),
      note: "クレジット残高の取得にはAnthropicのAdmin APIキーが必要です。console.anthropic.comでご確認ください。",
    });
  });
}
