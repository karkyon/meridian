import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptApiKey } from "@/lib/crypto";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";
import { z } from "zod";

const putSchema = z.object({
  claude_api_key: z.string().min(1).optional(),
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

    // APIキーはマスク表示
    let maskedKey: string | null = null;
    if (settings.claudeApiKeyEncrypted) {
      maskedKey = "sk-ant-****...****";
    }

    return NextResponse.json({
      claude_api_key_masked: maskedKey,
      has_api_key: !!settings.claudeApiKeyEncrypted,
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
    if (data.weekly_summary_day !== undefined) updateData.weeklySummaryDay = data.weekly_summary_day;
    if (data.focus_mode_count !== undefined) updateData.focusModeCount = data.focus_mode_count;
    if (data.session_timeout_hours !== undefined) updateData.sessionTimeoutHours = data.session_timeout_hours;

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      await prisma.settings.create({ data: updateData as any });
    } else {
      await prisma.settings.update({ where: { id: settings.id }, data: updateData });
    }

    const action = data.claude_api_key ? "API_KEY_UPDATE" : "SETTINGS_UPDATE";
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
