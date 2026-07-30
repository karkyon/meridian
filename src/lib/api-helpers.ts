import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashImportApiKey } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

type ApiHandler = (
  req: NextRequest,
  user: SessionUser,
  params?: Record<string, string>
) => Promise<NextResponse>;

export async function withAuth(
  req: NextRequest,
  handler: ApiHandler,
  params?: Record<string, string>
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  return handler(req, user, params);
}

export async function withAdmin(
  req: NextRequest,
  handler: ApiHandler,
  params?: Record<string, string>
): Promise<NextResponse> {
  return withAuth(req, async (req, user, params) => {
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "FORBIDDEN", required_role: "admin" },
        { status: 403 }
      );
    }
    return handler(req, user, params);
  }, params);
}

export function apiError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export type ImportKeyInfo = { id: string; label: string; createdBy: string | null };
type ImportKeyHandler = (req: NextRequest, keyInfo: ImportKeyInfo) => Promise<NextResponse>;

// 外部スキャンパイプライン等からのインポートAPI呼び出し専用認証
// セッションCookieではなく Authorization: Bearer mrd_imp_... を検証する
export async function withImportKey(
  req: NextRequest,
  handler: ImportKeyHandler
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!rawKey.startsWith("mrd_imp_")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const keyHash = hashImportApiKey(rawKey);
  const record = await prisma.importApiKey.findUnique({ where: { keyHash } });

  if (!record || record.revokedAt) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await prisma.importApiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return handler(req, { id: record.id, label: record.label, createdBy: record.createdBy });
}

// 管理者セッション or インポート専用APIキー のどちらでも通す統合ヘルパー
// パイプラインからの無人実行と、管理画面からの手動実行の両方に対応するために使用する
export type AuthContext =
  | { via: "session"; user: SessionUser }
  | { via: "importKey"; keyInfo: ImportKeyInfo };

type CombinedHandler = (
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>;

export async function withAdminOrImportKey(
  req: NextRequest,
  handler: CombinedHandler,
  params?: Record<string, string>
): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer mrd_imp_")) {
    return withImportKey(req, async (req, keyInfo) => handler(req, { via: "importKey", keyInfo }, params));
  }
  return withAdmin(req, async (req, user) => handler(req, { via: "session", user }, params), params);
}
