import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const setupSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(8)
    .regex(
      /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/,
      "パスワードは英字・数字・記号をそれぞれ1文字以上含めてください"
    ),
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    // usersテーブルが空かチェック
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "SETUP_ALREADY_DONE" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "admin",
        isActive: true,
      },
    });

    // settings初期レコードがなければ作成
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      await prisma.settings.create({
        data: {
          weeklySummaryDay: "monday",
          focusModeCount: 3,
          sessionTimeoutHours: 8,
        },
      });
    }

    return NextResponse.json(
      { message: "Admin account created", user_id: user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[setup] error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
