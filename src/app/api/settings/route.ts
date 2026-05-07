import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptApiKey } from "@/lib/crypto";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const putSchema = z.object({
  claude_api_key: z.string().min(1).optional(),
  github_pat: z.string().min(1).optional(),
  github_auto_sync: z.boolean().optional(),
  github_cache_hours: z.number().int().min(1).max(168).optional(),
  weekly_summary_day: z.enum(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]).optional(),
  focus_mode_count: z.number().int().min(1).max(5).optional(),
  session_timeout_hours: z.number().int().min(1).max(720).optional(),
});

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      claude_api_key_masked: settings.claudeApiKeyEncrypted ? "sk-ant-****...****" : null,
      has_api_key: !!settings.claudeApiKeyEncrypted,
      has_github_pat: !!settings.githubPatEncrypted,
      github_auto_sync: settings.githubAutoSync,
      github_cache_hours: settings.githubCacheHours,
      weekly_summary_day: settings.weeklySummaryDay,
      focus_mode_count: settings.focusModeCount,
      session_timeout_hours: settings.sessionTimeoutHours,
    });
  });
}

export async function PUT(req: NextRequest) {
  return withAdmin(req, async (req, user) => {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.claude_api_key) {
      const { claudeApiKeyEncrypted, keyIv } = encryptApiKey(data.claude_api_key);
      updateData.claudeApiKeyEncrypted = claudeApiKeyEncrypted;
      updateData.keyIv = keyIv;
    }
    if (data.github_pat) {
      const { claudeApiKeyEncrypted: enc, keyIv: iv } = encryptApiKey(data.github_pat);
      updateData.githubPatEncrypted = enc;
      updateData.githubPatIv = iv;
    }
    if (data.github_auto_sync !== undefined) updateData.githubAutoSync = data.github_auto_sync;
    if (data.github_cache_hours !== undefined) updateData.githubCacheHours = data.github_cache_hours;
    if (data.weekly_summary_day !== undefined) updateData.weeklySummaryDay = data.weekly_summary_day;
    if (data.focus_mode_count !== undefined) updateData.focusModeCount = data.focus_mode_count;
    if (data.session_timeout_hours !== undefined) updateData.sessionTimeoutHours = data.session_timeout_hours;

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      await prisma.settings.create({ data: updateData as any });
    } else {
      await prisma.settings.update({ where: { id: settings.id }, data: updateData });
    }

    const action = data.claude_api_key
      ? "API_KEY_UPDATE"
      : data.github_pat
        ? "SETTINGS_UPDATE"
        : "SETTINGS_UPDATE";

    writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: action as "API_KEY_UPDATE" | "SETTINGS_UPDATE",
      resourceType: "settings",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return NextResponse.json({ message: "Settings updated" });
  });
}