import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const existing = await prisma.settings.findFirst();
  if (!existing) {
    await prisma.settings.create({
      data: { weeklySummaryDay: "monday", focusModeCount: 3, sessionTimeoutHours: 8 },
    });
    console.log("✅ Created initial settings");
  }
  await prisma.customDocType.upsert({
    where: { key: "readme" },
    update: {},
    create: {
      key: "readme",
      label: "README（プロジェクト説明書）",
      description: "目的・背景・機能概要・セットアップ手順など、プロジェクト全体を1文書で把握するための説明書",
      sortOrder: 0,
      isActive: true,
    },
  });
  console.log("✅ Ensured README custom doc type");

  console.log("✅ Seed complete");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
