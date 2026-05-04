import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// シンプルなIn-Memoryレートリミット（エッジ対応版）
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const apiRequests = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  store: Map<string, { count: number; resetAt: number }>,
  key: string, limit: number, windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "127.0.0.1";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getIp(req);

  // ===== Rate Limiting =====
  // ログインAPI: 10回/分/IP
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    if (!checkRateLimit(loginAttempts, ip, 10, 60_000)) {
      return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    }
  }

  // API全体: 200req/分/IP（開発環境は緩め）
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    if (!checkRateLimit(apiRequests, ip, 200, 60_000)) {
      return NextResponse.json({ error: "TOO_MANY_REQUESTS", retry_after: 60 }, { status: 429 });
    }
  }

  // ===== 静的アセット素通し =====
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // ===== NextAuthハンドラ素通し =====
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // ===== API認証チェック =====
  if (pathname.startsWith("/api/")) {
    // setupは認証不要
    if (pathname === "/api/auth/setup") return NextResponse.next();

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const role = (session.user as { role: string }).role;
    const method = req.method;
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.next();
  }

  // ===== ページ認証チェック =====
  const session = await auth();

  if (pathname === "/setup") {
    if (session?.user) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (session?.user) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (session.user as { role: string }).role;

  // settings/*はAdmin専用
  if (pathname.startsWith("/settings") && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // /projects/*/generate はAdmin専用
  if (pathname.match(/\/projects\/[^/]+\/generate/) && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
