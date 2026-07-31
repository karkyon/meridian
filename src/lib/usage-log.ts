// src/lib/usage-log.ts
//
// 全AI機能（事業性分析・概要自動入力・総合分析など）から呼び出し、
// トークン使用量・推定コストを一元的に記録する。
// 「設定 > APIコスト」画面の集計対象を機能横断で正しく反映させるための共通処理。
import { prisma } from "@/lib/prisma";

// モデル別の価格（USD / token）。2026年5月時点の公開価格を踏襲（既存 analysis/route.ts と同じ単価）。
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-4-5": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] ?? PRICING["claude-sonnet-4-5"];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export async function logApiUsage(params: {
  feature: string;         // 例: "business_analysis" / "overview_autofill"
  projectId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const costUsd = estimateCostUsd(params.model, params.inputTokens, params.outputTokens);
  try {
    await prisma.apiUsageLog.create({
      data: {
        feature: params.feature,
        projectId: params.projectId ?? null,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd: costUsd,
      },
    });
  } catch (e) {
    // 使用量記録の失敗でメイン処理を落とさない（ログのみ）
    console.error("[usage-log] 記録に失敗:", e);
  }
}
