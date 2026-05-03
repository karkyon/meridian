import { auth } from "@/lib/auth";
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
