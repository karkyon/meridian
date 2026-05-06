import { prisma } from "@/lib/prisma";
type AuditAction = 
  "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGIN_LOCKED" | "LOGOUT" |
  "PROJECT_CREATE" | "PROJECT_UPDATE" | "PROJECT_DELETE" |
  "DOCUMENT_SAVE" | "DOCUMENT_AI_GENERATE" |
  "WBS_TASK_CREATE" | "WBS_TASK_UPDATE" | "WBS_TASK_DELETE" |
  "PRIORITY_UPDATE" | "USER_CREATE" | "USER_DELETE" |
  "USER_ROLE_CHANGE" | "USER_UNLOCK" | "SESSION_REVOKE" |
  "SETTINGS_UPDATE" | "API_KEY_UPDATE";
import type { NextRequest } from "next/server";
export interface AuditLogParams {
  userId: string; userEmail: string; action: AuditAction;
  resourceType?: string; resourceId?: string; resourceName?: string;
  oldValues?: Record<string, unknown>; newValues?: Record<string, unknown>;
  ipAddress: string; userAgent?: string;
}
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { ...params, resourceType: params.resourceType ?? null, resourceId: params.resourceId ?? null, resourceName: params.resourceName ?? null, oldValues: params.oldValues ? (params.oldValues as object) : undefined, newValues: params.newValues ? (params.newValues as object) : undefined, userAgent: params.userAgent ?? null } });
  } catch (e) { console.error("[AuditLog] Failed:", e); }
}
export const getClientIp = (req: NextRequest): string =>
  req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
export const getUserAgent = (req: NextRequest): string => req.headers.get("user-agent") ?? "unknown";
