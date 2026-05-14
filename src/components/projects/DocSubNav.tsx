// src/components/projects/DocSubNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DocSubNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  // ドキュメント詳細・カスタムドキュメント詳細のパスのみ表示
  const isDocDetail =
    pathname.startsWith(`${base}/documents/`) ||
    pathname.startsWith(`${base}/custom-docs/`);

  if (!isDocDetail) return null;

  return (
    <div className="bg-white border-b border-slate-100 flex items-center gap-2 px-4 py-1.5">
      <Link
        href={base}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1D6FA4] px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm leading-none">‹</span>
        <span>資料一覧に戻る</span>
      </Link>
    </div>
  );
}
