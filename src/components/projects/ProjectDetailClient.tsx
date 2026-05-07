"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText, Folder, Plus, ChevronRight, Zap, Paperclip,
} from "lucide-react";

// ============================================================
// 標準ドキュメント種別 — DB enum値に完全統一
// ============================================================
const STANDARD_DOC_TYPES = [
  { type: "planning",      label: "企画書",           icon: "📋" },
  { type: "requirements",  label: "要件定義書",        icon: "📌" },
  { type: "external_spec", label: "外部仕様設計書",    icon: "📐" },
  { type: "db_spec",       label: "DB仕様設計書",      icon: "🗄️" },
  { type: "api_spec",      label: "API詳細設計書",     icon: "🔌" },
  { type: "wireframe",     label: "ワイヤーフレーム",  icon: "🖼️" },
];

// ============================================================
// 型定義
// ============================================================
interface StandardDoc {
  docType: string;
  completeness: number;
  version: number;
  fileCount: number;
  aiGenerated: boolean;
  files?: { originalName: string; completeness: number; version: number }[];
}

interface CustomDocType {
  key: string;
  label: string;
  completeness: number;
  version: number;
  fileCount: number;
  files?: { originalName: string }[];
}

interface Project {
  id: string;
  name: string;
  status: string;
  progressCache: number;
  docCompleteness: number;
  repositoryUrl?: string | null;
}

interface Props {
  project: Project;
  documents: StandardDoc[];
  customDocTypes: CustomDocType[];
  attachmentCount: number;
  role: string;
}

// ============================================================
// ドキュメントカード
// ============================================================
function DocCard({
  icon, label, completeness, version, fileCount, files, href, exists, aiGenerated,
}: {
  icon: string; label: string; completeness: number; version: number;
  fileCount: number; files?: { originalName: string; completeness: number; version: number }[];
  href: string; exists: boolean; aiGenerated?: boolean;
}) {
  const hasFiles = fileCount > 0;
  const barColor =
    completeness >= 80 ? "bg-emerald-500" :
    completeness >= 50 ? "bg-[#1D6FA4]" :
    completeness >= 20 ? "bg-amber-400" : "bg-slate-200";

  const displayFiles = files?.slice(0, 3) ?? [];
  const extraCount = fileCount > 3 ? fileCount - 3 : 0;

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-xl border border-slate-100 hover:border-[#1D6FA4]/40 hover:shadow-sm transition-all p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5 shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            {/* タイトル行 */}
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-[#1A3A5C] group-hover:text-[#1D6FA4] transition-colors truncate">
                {label}
              </p>
              {aiGenerated && (
                <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                  AI生成
                </span>
              )}
            </div>

            {/* バージョン・件数・完成度 */}
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
              <span className={hasFiles ? "text-slate-500" : "text-slate-300"}>
                {hasFiles ? `v${version}` : "—"}
              </span>
              <span>📁 {fileCount}件</span>
              <span className={`ml-auto font-medium ${hasFiles ? "text-slate-500" : "text-slate-300"}`}>
                {hasFiles ? `${completeness}%` : "—"}
              </span>
            </div>

            {/* 完成度バー */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
              {hasFiles ? (
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${completeness}%` }}
                />
              ) : (
                <div className="h-full w-full bg-slate-100 rounded-full" />
              )}
            </div>

            {/* ファイル名リスト */}
            {hasFiles && displayFiles.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {displayFiles.map((f, i) => {
                  const fBarColor =
                    f.completeness >= 80 ? "text-emerald-500" :
                    f.completeness >= 50 ? "text-[#1D6FA4]" :
                    f.completeness >= 20 ? "text-amber-400" : "text-slate-300";
                  return (
                    <div key={i} className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[11px] text-slate-400 truncate leading-tight flex-1">
                        📄 {f.originalName}
                      </p>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                        v{f.version}
                      </span>
                      <span className={`text-[10px] font-medium whitespace-nowrap shrink-0 ${fBarColor}`}>
                        {f.completeness}%
                      </span>
                    </div>
                  );
                })}
                {extraCount > 0 && (
                  <p className="text-[11px] text-slate-300 leading-tight">
                    + {extraCount}件
                  </p>
                )}
              </div>
            )}
          </div>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-[#1D6FA4] mt-1 shrink-0 transition-colors" />
        </div>
        <div className="mt-3">
          <span className={`text-xs font-medium ${exists ? "text-[#1D6FA4]" : "text-slate-400"}`}>
            {exists ? "編集 →" : "作成 →"}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// GitHubアイコン（SVG）
// ============================================================
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function ProjectDetailClient({
  project, documents, customDocTypes, attachmentCount, role,
}: Props) {
  const [activeTab, setActiveTab] = useState<"docs" | "attachments">("docs");

  // 標準ドキュメントをdocType→データのmapに変換
  const docMap = new Map(documents.map((d: any) => [d.docType, d]));

  // STANDARD_DOC_TYPES と実データをマージ
  const mergedDocs = STANDARD_DOC_TYPES.map((def: any) => {
    const data = docMap.get(def.type);
    return {
      ...def,
      completeness: data?.completeness ?? 0,
      version: data?.version ?? 0,
      fileCount: data?.fileCount ?? 0,
      files: data?.files ?? [],
      exists: !!data,
      aiGenerated: data?.aiGenerated ?? false,
    };
  });

  const hasRepo = !!project.repositoryUrl;

  return (
    <div className="flex flex-col gap-4">
      {/* タブ */}
      <div className="flex items-center gap-0 border-b border-slate-200 overflow-x-auto">
        {/* ドキュメントタブ */}
        <button
          onClick={() => setActiveTab("docs")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "docs"
              ? "border-[#1D6FA4] text-[#1D6FA4] font-medium"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <FileText size={14} />
          ドキュメント
        </button>

        {/* 添付資料タブ */}
        <button
          onClick={() => setActiveTab("attachments")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "attachments"
              ? "border-[#1D6FA4] text-[#1D6FA4] font-medium"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Paperclip size={14} />
          添付資料
          {attachmentCount > 0 && (
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {attachmentCount}
            </span>
          )}
        </button>

        {/* GitHub タブ（NEW） */}
        <Link
          href={`/projects/${project.id}/github`}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
            hasRepo
              ? "border-transparent text-slate-400 hover:text-[#1D6FA4] hover:border-[#1D6FA4]/40"
              : "border-transparent text-slate-300 cursor-default pointer-events-none"
          }`}
          title={hasRepo ? undefined : "プロジェクト編集でリポジトリURLを設定してください"}
        >
          <GitHubIcon className="w-3.5 h-3.5" />
          GitHub
          {!hasRepo && (
            <span className="text-[10px] text-slate-300 ml-0.5">未設定</span>
          )}
        </Link>

        {/* AI進捗推定タブ（Admin・NEW） */}
        {role === "admin" && (
          <Link
            href={`/projects/${project.id}/ai-progress`}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 border-transparent text-slate-400 hover:text-emerald-600 hover:border-emerald-500/40 transition-colors whitespace-nowrap"
          >
            🤖 AI進捗推定
          </Link>
        )}
      </div>

      {/* ドキュメントタブ コンテンツ */}
      {activeTab === "docs" && (
        <div className="space-y-4">
          {/* AI一括生成バナー（Adminのみ） */}
          {role === "admin" && (
            <Link
              href={`/projects/${project.id}/generate`}
              className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-xl hover:shadow-sm transition-all group"
            >
              <Zap size={18} className="text-violet-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-violet-700">AI一括生成</p>
                <p className="text-xs text-violet-500/70">プロジェクト情報からドキュメントを自動生成</p>
              </div>
              <ChevronRight size={14} className="text-violet-400 group-hover:text-violet-600 transition-colors" />
            </Link>
          )}

          {/* 標準6種ドキュメント */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mergedDocs.map((doc: any) => (
              <DocCard
                key={doc.type}
                icon={doc.icon}
                label={doc.label}
                completeness={doc.completeness}
                version={doc.version}
                fileCount={doc.fileCount}
                files={doc.files}
                href={`/projects/${project.id}/documents/${doc.type}`}
                exists={doc.exists}
                aiGenerated={doc.aiGenerated}
              />
            ))}
          </div>

          {/* 区切り */}
          {customDocTypes.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 whitespace-nowrap">技術・設計ドキュメント</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}

          {/* カスタムドキュメント */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customDocTypes.map((doc: any) => (
              <DocCard
                key={doc.key}
                icon="📝"
                label={doc.label}
                completeness={doc.completeness}
                version={doc.version}
                fileCount={doc.fileCount}
                files={doc.files as any}
                href={`/projects/${project.id}/custom-docs/${doc.key}`}
                exists={doc.completeness > 0 || doc.version > 1}
              />
            ))}
          </div>

          {/* カテゴリ追加（Admin） */}
          {role === "admin" && (
            <button className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-[#1D6FA4] hover:text-[#1D6FA4] transition-colors">
              <Plus size={14} />
              カテゴリ追加
            </button>
          )}
        </div>
      )}

      {/* 添付資料タブ コンテンツ */}
      {activeTab === "attachments" && (
        <div className="text-center py-12">
          <Paperclip size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400 mb-3">参考資料ライブラリ</p>
          <Link
            href={`/projects/${project.id}/attachments`}
            className="inline-flex items-center gap-2 text-sm text-[#1D6FA4] hover:underline"
          >
            全画面で管理 <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}