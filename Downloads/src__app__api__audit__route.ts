import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  return withAdmin(req, async () => {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = 50;
    const userId = searchParams.get("user_id");
    const action = searchParams.get("action");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const format = searchParams.get("format");

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo + "T23:59:59Z") } : {}),
      };
    }

    if (format === "csv") {
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10000,
        select: { createdAt: true, userEmail: true, action: true, resourceType: true, resourceName: true, ipAddress: true },
      });

      const csv = [
        "日時,ユーザー,アクション,対象種別,対象名,IPアドレス",
        ...logs.map((l: any) =>
          [
            new Date(l.createdAt).toLocaleString("ja-JP"),
            l.userEmail, l.action,
            l.resourceType ?? "",
            l.resourceName ?? "",
            l.ipAddress,
          ].map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, createdAt: true, userEmail: true, action: true,
          resourceType: true, resourceName: true, ipAddress: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });

    return NextResponse.json({ logs, total, page, limit, users });
  });
}
