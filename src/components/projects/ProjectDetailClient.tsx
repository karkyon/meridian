"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText, Folder, Plus, ChevronRight, Zap, Paperclip,
} from "lucide-react";

// ============================================================
// 標準ドキュメント種別 — DB enum値に完全統一
// DB: planning / requirements / external_spec / db_spec / api_spec / wireframe
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
}

interface CustomDocType {
  key: string;
  label: string;
  completeness: number;
  version: number;
  fileCount: number;
}

interface Project {
  id: string;
  name: string;
  status: string;
  progressCache: number;
  docCompleteness: number;
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
  icon, label, completeness, version, fileCount, href, exists, aiGenerated,
}: {
  icon: string; label: string; completeness: number; version: number;
  fileCount: number; href: string; exists: boolean; aiGenerated?: boolean;
}) {
  const barColor =
    completeness >= 80 ? "bg-emerald-500" :
    completeness >= 50 ? "bg-[#1D6FA4]" :
    completeness >= 20 ? "bg-amber-400" : "bg-slate-200";

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-xl border border-slate-100 hover:border-[#1D6FA4]/40 hover:shadow-sm transition-all p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5 shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
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
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
              <span>v{version}</span>
              <span>📁 {fileCount}件</span>
              <span className="ml-auto font-medium text-slate-500">{completeness}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${completeness}%` }}
              />
            </div>
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
      exists: !!data,
      aiGenerated: data?.aiGenerated ?? false,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {/* タブ */}
      <div className="flex items-center gap-0 border-b border-slate-200">
        {[
          { id: "docs", label: "ドキュメント", icon: <FileText size={14} /> },
          { id: "attachments", label: "添付資料", icon: <Paperclip size={14} />, count: attachmentCount },
        ].map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "docs" | "attachments")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#1D6FA4] text-[#1D6FA4] font-medium"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

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
