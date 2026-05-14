"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, ChevronRight, Zap, Paperclip, X,
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
// ドキュメントカード（元の完成度・バージョンインジケータを完全復元）
// ============================================================
function DocCard({
  icon, label, fileCount, files, href, exists, aiGenerated,
}: {
  icon: string; label: string;
  fileCount: number; files?: { originalName: string; completeness: number; version: number }[];
  href: string; exists: boolean; aiGenerated?: boolean;
}) {
  const hasFiles = fileCount > 0;
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

            {/* ファイルなし */}
            {!hasFiles && (
              <p className="text-xs text-slate-400">
                {exists ? "ファイルを追加" : "ファイルを追加"}
              </p>
            )}

            {/* ファイルリスト（完成度バー・バージョン付き） */}
            {hasFiles && displayFiles.length > 0 && (
              <div className="space-y-1.5 mt-1">
                {displayFiles.map((f, i) => {
                  const pct = f.completeness ?? 0;
                  const fTextColor =
                    pct >= 80 ? "text-emerald-500" :
                    pct >= 50 ? "text-[#1D6FA4]" :
                    pct >= 20 ? "text-amber-400" : "text-slate-300";
                  const fBarBg =
                    pct >= 80 ? "bg-emerald-400" :
                    pct >= 50 ? "bg-[#1D6FA4]" :
                    pct >= 20 ? "bg-amber-300" : "bg-slate-200";
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-slate-500 truncate flex-1 mr-2">📄 {f.originalName}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`font-semibold ${fTextColor}`}>{pct}%</span>
                          <span className="text-slate-300">v{f.version ?? 1}</span>
                        </div>
                      </div>
                      {/* 完成度バー */}
                      <div className="h-0.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${fBarBg}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {extraCount > 0 && (
                  <p className="text-[10px] text-slate-400">+{extraCount}件</p>
                )}
              </div>
            )}
          </div>

          {/* 右矢印 */}
          <span className={`text-xs font-medium mt-0.5 shrink-0 transition-colors ${
            exists ? "text-[#1D6FA4]" : "text-slate-400"
          } group-hover:text-[#1D6FA4]`}>
            {exists ? "編集 →" : "作成 →"}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// カテゴリ追加モーダル
// ============================================================
function AddCategoryModal({
  projectId,
  onClose,
  onAdded,
}: {
  projectId: string;
  onClose: () => void;
  onAdded: (newDoc: CustomDocType) => void;
}) {
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!label.trim()) return;
    setAdding(true);
    setError(null);
    const key = `${label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")}_${Date.now().toString(36)}`;
    try {
      const res = await fetch(`/api/projects/${projectId}/custom-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label: label.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message ?? "追加に失敗しました");
        return;
      }
      const data = await res.json();
      onAdded({
        key: data.type.key,
        label: data.type.label,
        completeness: 0,
        version: 1,
        fileCount: 0,
        files: [],
      });
      onClose();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-slate-800">カテゴリ追加</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">カテゴリ名 *</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="例: CI/CD設計書、インフラ構成図..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
              キャンセル
            </button>
            <button onClick={handleAdd} disabled={adding || !label.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] disabled:opacity-50 transition-colors">
              {adding ? "追加中..." : "追加する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function ProjectDetailClient({
  project, documents, customDocTypes: initialCustomDocTypes, attachmentCount, role,
}: Props) {
  const [activeTab, setActiveTab] = useState<"docs" | "attachments">("docs");
  const [customDocTypes, setCustomDocTypes] = useState<CustomDocType[]>(initialCustomDocTypes);
  const [showAddModal, setShowAddModal] = useState(false);

  const handleCategoryAdded = useCallback((newDoc: CustomDocType) => {
    setCustomDocTypes((prev) => [...prev, newDoc]);
  }, []);

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

  return (
    <>
      {/* カテゴリ追加モーダル */}
      {showAddModal && (
        <AddCategoryModal
          projectId={project.id}
          onClose={() => setShowAddModal(false)}
          onAdded={handleCategoryAdded}
        />
      )}

      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
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
                  fileCount={doc.fileCount}
                  files={doc.files}
                  href={`/projects/${project.id}/documents/${doc.type}`}
                  exists={doc.exists}
                  aiGenerated={doc.aiGenerated}
                />
              ))}
            </div>

            {/* 区切り（カスタムドキュメントがある場合） */}
            {customDocTypes.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 whitespace-nowrap">追加カテゴリ</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            )}

            {/* カスタムドキュメント */}
            {customDocTypes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customDocTypes.map((doc: any) => (
                  <DocCard
                    key={doc.key}
                    icon="📝"
                    label={doc.label}
                    fileCount={doc.fileCount}
                    files={doc.files as any}
                    href={`/projects/${project.id}/custom-docs/${doc.key}`}
                    exists={doc.fileCount > 0}
                  />
                ))}
              </div>
            )}

            {/* カテゴリ追加ボタン（Admin・モーダル起動） */}
            {role === "admin" && (
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-[#1D6FA4] hover:text-[#1D6FA4] hover:bg-blue-50/40 transition-all"
              >
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
    </>
  );
}
