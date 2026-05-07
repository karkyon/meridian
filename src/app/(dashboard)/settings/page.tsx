import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import SettingsClient from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/dashboard");

  const settings = await prisma.settings.findFirst();

  return (
    <>
      <TopBar title="設定" />
      <main className="flex-1 p-6 max-w-3xl">
        <SettingsClient
          hasApiKey={!!settings?.claudeApiKeyEncrypted}
          hasGithubPat={!!settings?.githubPatEncrypted}
          initial={{
            weekly_summary_day: settings?.weeklySummaryDay ?? "monday",
            focus_mode_count: settings?.focusModeCount ?? 3,
            session_timeout_hours: settings?.sessionTimeoutHours ?? 8,
            github_auto_sync: settings?.githubAutoSync ?? false,
            github_cache_hours: settings?.githubCacheHours ?? 6,
          }}
        />
      </main>
    </>
  );
}
