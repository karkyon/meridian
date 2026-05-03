import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 認証不要の静的ルート
  const publicRoutes = ["/login", "/setup"];
  const isPublicRoute = publicRoutes.some((r) => pathname === r || pathname.startsWith(r + "/"));

  // API認証チェック
  if (pathname.startsWith("/api/")) {
    // NextAuthハンドラは素通し
    if (pathname.startsWith("/api/auth/")) {
      // setupのみ認証不要
      if (pathname === "/api/auth/setup") return NextResponse.next();
      return NextResponse.next();
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const role = (session.user as { role: string }).role;

    // 書き込み系はAdmin専用
    const method = req.method;
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
      role !== "admin"
    ) {
      return NextResponse.json(
        { error: "FORBIDDEN", required_role: "admin" },
        { status: 403 }
      );
    }

    return NextResponse.next();
  }

  const session = await auth();

  // 初回セットアップ: usersテーブルが空かチェック
  // ※ setupページへの直接アクセス時のみDBチェック（パフォーマンス考慮）
  if (pathname === "/setup") {
    if (session?.user) {
      // ログイン済みなら / へ
      return NextResponse.redirect(new URL("/", req.url));
    }
    // 未認証の場合はsetupページを表示（DBチェックはAPIで行う）
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (session?.user) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // 認証必須ルート
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (session.user as { role: string }).role;

  // Viewer はsettings以下にアクセス不可
  if (pathname.startsWith("/settings") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
