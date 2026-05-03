"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white/70 transition-colors"
    >
      ログアウト
    </button>
  );
}
