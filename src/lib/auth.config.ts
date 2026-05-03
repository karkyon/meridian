import type { NextAuthConfig } from "next-auth";

// Edge Runtimeで動作するauth設定（prismaなし）
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // ミドルウェアでフル制御するため、ここでは全て通過
      return true;
    },
  },
  providers: [],
};
