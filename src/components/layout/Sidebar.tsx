"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const navItems = [
  {
    section: "メイン",
    items: [
      { label: "ダッシュボード", href: "/dashboard", icon: "⬛" },
      { label: "優先度管理", href: "/priority", icon: "⭐" },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "RAG Q&A", href: "/intelligence/qa", icon: "💬" },
      { label: "相乗効果マップ", href: "/intelligence/synergy", icon: "🔗" },
      { label: "技術ヘルス", href: "/intelligence/health", icon: "❤️" },
    ],
  },
];

const adminItems = [
  { label: "ユーザー管理", href: "/settings/users", icon: "👥" },
  { label: "監査ログ", href: "/settings/audit", icon: "📋" },
  { label: "設定", href: "/settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 bg-[#1A3A5C] flex flex-col">
      {/* ロゴ */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="text-lg font-bold text-white tracking-tight">Meridian</div>
        <div className="text-[10px] text-white/40 mt-0.5">Project Intelligence</div>
      </div>

      {/* ナビ */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-4">
        {navItems.map((section) => (
          <div key={section.section}>
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 mb-1">
              {section.section}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-white text-[#1A3A5C] font-semibold border-r-2 border-[#1D6FA4]"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        {/* 管理セクション */}
        <div>
          <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 mb-1">
            管理
          </div>
          {adminItems.map((item) => {
            const isAdmin = role === "admin";
            const active = pathname === item.href;
            if (!isAdmin) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/20 cursor-not-allowed"
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                  <span className="ml-auto text-xs">🔒</span>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ユーザー情報 */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#1D6FA4] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{session?.user?.name}</div>
            <div className={`text-[10px] font-semibold ${role === "admin" ? "text-[#85B7EB]" : "text-violet-300"}`}>
              {role === "admin" ? "Admin" : "Viewer"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
