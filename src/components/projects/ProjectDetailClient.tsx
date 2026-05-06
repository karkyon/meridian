"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText, Folder, Plus, ChevronRight, Zap,
  BarChart2, Clock, CheckCircle2, AlertCircle,
  Paperclip, Globe
} from "lucide-react";

// ============================================================
// 型定義
// ============================================================
type FileType = "md" | "docx" | "doc" | "pdf" | "html";

interface DocFile {
  id: string;
  filename: string;
  fileType: FileType;
  fileSize: number;
}

interface StandardDoc {
  type: string;
  label: string;
  completeness: number;
  version: number;
  fileCount: number;
  exists: boolean;
}

interface CustomDocType {
  key: string;
  label: string;
  icon?: string;
  completeness: number;
  version: number;
  fileCount: number;
  exists: boolean;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  progressCache: number;
  docCompleteness: number;
}

interface Props {
  project: Project;
  standardDocs: StandardDoc[];
  customDocTypes: CustomDocType[];
  attachmentCount: number;
  activeTab?: string;
}

// ============================================================
// 標準5種 + ワイヤーフレームの定義
// ============================================================
const STANDARD_DOC_TYPES = [
  { type: "plan",     label: "企画書",       icon: "📋" },
  { type: "req",      label: "要件定義",     icon: "📌" },
  { type: "spec",     label: "外部仕様設計", icon: "📐" },
  { type: "db",       label: "DB仕様",       icon: "🗄️" },
  { type: "api",      label: "API詳細",      icon: "🔌" },
  { type: "wireframe",label: "ワイヤーフレーム", icon: "🖼️" },  // ← 追加
];

// ============================================================
// ドキュメントカード
// ============================================================
function DocCard({
  icon, label, completeness, version, fileCount, href, exists
}: {
  icon: string;
  label: string;
  completeness: number;
  version: number;
  fileCount: number;
  href: string;
  exists: boolean;
}) {
  const barColor =
    completeness >= 80 ? "bg-success" :
    completeness >= 50 ? "bg-azure" :
    completeness >= 20 ? "bg-warn-border" : "bg-slate-300";

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-xl border border-slate-100 hover:border-azure/40 hover:shadow-panel transition-all p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-navy group-hover:text-azure transition-colors truncate">
                {label}
              </p>
              {exists && (
                <span className="text-[10px] bg-azure-light text-azure px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                  AI生成
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
              <span>v{version}</span>
              <span>📁 {fileCount}件</span>
              <span className="ml-auto">{completeness}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-azure mt-1 transition-colors" />
        </div>
        <div className="mt-3 flex gap-2">
          {exists ? (
            <span className="text-xs text-azure font-medium">編集 →</span>
          ) : (
            <span className="text-xs text-slate-400">作成 →</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export function ProjectDetailClient({
  project,
  standardDocs,
  customDocTypes,
  attachmentCount,
  activeTab: initialTab = "docs",
}: Props) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // 標準ドキュメントをtype→データのmapに変換
  const standardDocMap = new Map(standardDocs.map(d => [d.type, d]));

  // STANDARD_DOC_TYPES と実データをマージ
  const mergedStandardDocs = STANDARD_DOC_TYPES.map(def => {
    const data = standardDocMap.get(def.type);
    return {
      ...def,
      completeness: data?.completeness ?? 0,
      version: data?.version ?? 0,
      fileCount: data?.fileCount ?? 0,
      exists: data?.exists ?? false,
    };
  });

  const tabs = [
    { id: "docs", label: "ドキュメント", icon: <FileText size={14} /> },
    { id: "attachments", label: "添付資料", icon: <Paperclip size={14} />, count: attachmentCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* タブ */}
      <div className="flex items-center gap-0 border-b border-slate-200 bg-white -mx-4 px-4 sm:mx-0 sm:px-0 sm:rounded-t-xl sm:border sm:border-b-0 sm:px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-azure text-azure font-medium"
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
          {/* AI一括生成バナー */}
          <Link
            href={`/projects/${project.id}/generate`}
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-light to-azure-light border border-violet-border rounded-xl hover:shadow-panel transition-all group"
          >
            <Zap size={18} className="text-violet" />
            <div className="flex-1">
              <p className="text-sm font-medium text-violet">AI一括生成</p>
              <p className="text-xs text-violet/70">プロジェクト情報からドキュメントを自動生成</p>
            </div>
            <ChevronRight size={14} className="text-violet/50 group-hover:text-violet transition-colors" />
          </Link>

          {/* 標準6種（企画書〜APIとワイヤーフレーム） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mergedStandardDocs.map(doc => (
              <DocCard
                key={doc.type}
                icon={doc.icon}
                label={doc.label}
                completeness={doc.completeness}
                version={doc.version}
                fileCount={doc.fileCount}
                href={`/projects/${project.id}/documents/${doc.type}`}
                exists={doc.exists}
              />
            ))}
          </div>

          {/* 区切り */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 whitespace-nowrap">技術・設計ドキュメント</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* カスタムドキュメント */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customDocTypes.map(doc => (
              <DocCard
                key={doc.key}
                icon="📝"
                label={doc.label}
                completeness={doc.completeness}
                version={doc.version}
                fileCount={doc.fileCount}
                href={`/projects/${project.id}/custom-docs/${doc.key}`}
                exists={doc.exists}
              />
            ))}
          </div>

          {/* カテゴリ追加ボタン */}
          <button className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-azure hover:text-azure transition-colors">
            <Plus size={14} />
            カテゴリ追加
          </button>
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="text-center py-12">
          <Paperclip size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400 mb-3">参考資料ライブラリ</p>
          <Link
            href={`/projects/${project.id}/attachments`}
            className="inline-flex items-center gap-2 text-sm text-azure hover:underline"
          >
            全画面で管理 <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

export default ProjectDetailClient;