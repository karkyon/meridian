"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${collapsed ? "w-14" : "w-56"} shrink-0 h-screen sticky top-0 bg-[#1A3A5C] flex flex-col transition-all duration-200`}>
      {/* ロゴ + 折りたたみボタン */}
      <div className="px-3 py-4 border-b border-white/10 flex items-center justify-between">
        {!collapsed && (
          <div>
            <div className="text-lg font-bold text-white tracking-tight">Meridian</div>
            <div className="text-[10px] text-white/40 mt-0.5">Project Intelligence</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1.5 rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          title={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* ナビ */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-4">
        {navItems.map((section: any) => (
          <div key={section.section}>
            {!collapsed && (
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 mb-1">
                {section.section}
              </div>
            )}
            {section.items.map((item: any) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-white text-[#1A3A5C] font-semibold border-r-2 border-[#1D6FA4]"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        ))}

        {/* 管理セクション */}
        <div>
          {!collapsed && (
            <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 mb-1">
              管理
            </div>
          )}
          {adminItems.map((item: any) => {
            const isAdmin = role === "admin";
            const active = pathname === item.href;
            if (!isAdmin) {
              return (
                <div
                  key={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/20 cursor-not-allowed ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {!collapsed && item.label}
                  {!collapsed && <span className="ml-auto text-xs">🔒</span>}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ユーザー情報 */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-[#1D6FA4] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{session?.user?.name}</div>
              <div className={`text-[10px] font-semibold ${role === "admin" ? "text-[#85B7EB]" : "text-violet-300"}`}>
                {role === "admin" ? "Admin" : "Viewer"}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
