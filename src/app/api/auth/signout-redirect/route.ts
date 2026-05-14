import { signOut } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  await signOut({ redirect: false });
  return Response.redirect(new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3025"));
}