// src/lib/business-analysis-helpers.ts
//
// 事業性分析（ビジネスviability評価）の8カテゴリ定義。
// 全カテゴリとも「スコアが高いほど良い」方向に統一する
// （リスクは「リスクの低さ」、収益化までの期間は「速さ」として評価する）。

export const BUSINESS_CATEGORIES = [
  {
    key: "profitability",
    label: "収益性",
    description: "マネタイズ可能性・想定市場規模",
  },
  {
    key: "competitive_moat",
    label: "競合優位性・参入障壁",
    description: "競合との差別化のしやすさ・模倣されにくさ",
  },
  {
    key: "risk",
    label: "リスク（低いほど高スコア）",
    description: "技術・市場・法規制リスクの低さ",
  },
  {
    key: "durability",
    label: "永続性",
    description: "長期運用・保守のしやすさ、陳腐化しにくさ",
  },
  {
    key: "scalability",
    label: "展開・拡張性",
    description: "横展開・スケールのしやすさ",
  },
  {
    key: "feasibility",
    label: "実現可能性",
    description: "技術的難易度・工数見合いの現実性",
  },
  {
    key: "time_to_revenue",
    label: "収益化までの期間（速いほど高スコア）",
    description: "ローンチから黒字化までのスピード感",
  },
  {
    key: "market_fit",
    label: "市場適合性",
    description: "想定ユーザーのニーズとの合致度",
  },
] as const;

export type BusinessCategoryKey = (typeof BUSINESS_CATEGORIES)[number]["key"];

export function isValidBusinessCategory(key: string): key is BusinessCategoryKey {
  return BUSINESS_CATEGORIES.some((c) => c.key === key);
}

export function calcOverallScore(categories: Array<{ score: number }>): number {
  if (categories.length === 0) return 0;
  const sum = categories.reduce((acc, c) => acc + c.score, 0);
  return Math.round(Math.min(100, Math.max(0, sum / categories.length)));
}
