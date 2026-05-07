// src/components/projects/ProjectTabNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function ProjectTabNav({
  projectId,
  hasRepo,
  role,
}: {
  projectId: string;
  hasRepo: boolean;
  role: string;
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  // アクティブ判定
  const isDoc = pathname === base || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/custom-docs`) || pathname.startsWith(`${base}/generate`);
  const isAttachment = pathname.startsWith(`${base}/attachments`);
  const isGithub = pathname.startsWith(`${base}/github`);
  const isAi = pathname.startsWith(`${base}/ai-progress`);

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
      active
        ? "border-[#1D6FA4] text-[#1D6FA4] font-medium"
        : "border-transparent text-slate-400 hover:text-slate-600"
    }`;

  return (
    <div className="bg-white border-b border-slate-200 flex items-center overflow-x-auto px-2">
      <Link href={base} className={tabClass(isDoc)}>
        <FileText size={14} />
        ドキュメント
      </Link>

      <Link href={`${base}/attachments`} className={tabClass(isAttachment)}>
        <Paperclip size={14} />
        添付資料
      </Link>

      <Link
        href={hasRepo ? `${base}/github` : "#"}
        className={`${tabClass(isGithub)} ${!hasRepo ? "text-slate-300 cursor-default pointer-events-none" : ""}`}
        title={!hasRepo ? "プロジェクト編集でリポジトリURLを設定してください" : undefined}
      >
        <GitHubIcon className="w-3.5 h-3.5" />
        GitHub
        {!hasRepo && <span className="text-[10px] text-slate-300 ml-0.5">未設定</span>}
      </Link>

      {role === "admin" && (
        <Link href={`${base}/ai-progress`} className={tabClass(isAi)}>
          🤖 AI進捗推定
        </Link>
      )}
    </div>
  );
}