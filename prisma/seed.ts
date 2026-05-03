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
  console.log("✅ Seed complete");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
