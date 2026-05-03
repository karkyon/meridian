export type UserRole = "admin" | "viewer";
export type ProjectStatus = "planning" | "active" | "paused" | "completed";
export type DocType = "planning" | "requirements" | "external_spec" | "db_spec" | "api_spec";
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type TaskPriority = "high" | "mid" | "low";
export type DelayRisk = "none" | "low" | "medium" | "high";
export interface SessionUser { id: string; email: string; name: string; role: UserRole; }
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  planning: "企画書", requirements: "要件定義書", external_spec: "外部仕様設計書",
  db_spec: "DB仕様設計書", api_spec: "API詳細設計書",
};
export interface PriorityAxes { impact: number; urgency: number; learning: number; cost: number; motivation: number; }
export function calcPriorityScore(a: PriorityAxes): number {
  return Math.round(Math.min(100, Math.max(0, (a.impact*3 + a.urgency*2 + a.learning*2 + (11-a.cost)*1 + a.motivation*2) / 10)));
}
