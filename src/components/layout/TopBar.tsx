"use client";

import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import Link from "next/link";

interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, actions }: TopBarProps) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  return (
    <header className="h-12 bg-white border-b border-slate-100 flex items-center px-5 gap-3 sticky top-0 z-10">
      <h1 className="text-sm font-semibold text-[#1A3A5C]">{title}</h1>

      {/* ロールバッジ */}
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        role === "admin"
          ? "bg-blue-100 text-blue-700"
          : "bg-violet-100 text-violet-700"
      }`}>
        {role === "admin" ? "Admin" : "Viewer"}
      </span>

      <div className="flex-1" />

      {/* Viewerバナー */}
      {role === "viewer" && (
        <span className="text-xs bg-violet-50 border border-violet-200 text-violet-600 px-2.5 py-1 rounded-lg">
          閲覧モードで表示中
        </span>
      )}

      {actions}

      {/* 新規PJボタン（Admin） */}
      {role === "admin" && (
        <Link
          href="/projects/new"
          className="text-xs bg-[#1A3A5C] text-white px-3 py-1.5 rounded-lg hover:bg-[#2A527A] transition-colors"
        >
          + 新規プロジェクト
        </Link>
      )}

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
      >
        ログアウト
      </button>
    </header>
  );
}
