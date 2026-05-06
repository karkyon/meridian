"use client";

import { useState, useRef, useCallback } from "react";

const FILE_TYPE_CONFIG = {
  word: { label: "Word", icon: "📄", class: "bg-blue-50 text-blue-700 border-blue-200" },
  pdf: { label: "PDF", icon: "📕", class: "bg-red-50 text-red-700 border-red-200" },
  markdown: { label: "Markdown", icon: "📝", class: "bg-slate-50 text-slate-700 border-slate-200" },
  other: { label: "その他", icon: "📎", class: "bg-slate-50 text-slate-600 border-slate-200" },
};

type Attachment = {
  id: string; filename: string; originalName: string;
  fileType: string; mimeType: string; fileSize: number;
  description: string | null; usedForGeneration: boolean;
  createdAt: string; uploader: { name: string } | null;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function AttachmentsManager({
  projectId, initialAttachments, role, docType,
}: {
  projectId: string; initialAttachments: Attachment[]; role: string;
  docType?: string;
}) {
  const isAdmin = role === "admin";
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    if (description.trim()) formData.append("description", description.trim());
    if (docType) formData.append("doc_type", docType);

    const res = await fetch(`/api/projects/${projectId}/attachments`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      setAttachments((prev) => [data.attachment, ...prev]);
      setDescription("");
    } else {
      const msg = data.error === "FILE_TOO_LARGE" ? "ファイルサイズは5MB以下にしてください"
        : data.error === "INVALID_FILE_TYPE" ? "対応ファイル形式: Word / PDF / Markdown"
        : "アップロードに失敗しました";
      setUploadError(msg);
    }
    setUploading(false);
  }, [projectId, description]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  async function toggleGeneration(id: string, current: boolean) {
    const res = await fetch(`/api/projects/${projectId}/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ used_for_generation: !current }),
    });
    if (res.ok) {
      setAttachments((prev) =>
        prev.map((a: any) => a.id === id ? { ...a, usedForGeneration: !current } : a)
      );
    }
  }

  async function deleteAttachment(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const res = await fetch(`/api/projects/${projectId}/attachments/${id}`, { method: "DELETE" });
    if (res.ok) setAttachments((prev) => prev.filter((a: any) => a.id !== id));
  }

  const generationCount = attachments.filter((a: any) => a.usedForGeneration).length;

  return (
    <div className="space-y-4">
      {/* 統計バナー */}
      {generationCount > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-violet-500">🤖</span>
          <span className="text-sm text-violet-700">
            <span className="font-semibold">{generationCount}件</span>の資料がAI生成に使用されます
          </span>
          <span className="text-xs text-violet-400 ml-1">（AI生成パネルで「添付資料を参照」をオンに）</span>
        </div>
      )}

      {/* アップロードエリア */}
      {isAdmin && (
        <div className="space-y-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-[#1D6FA4] bg-[#1D6FA4]/5"
                : "border-slate-200 hover:border-[#1D6FA4] hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.md,.markdown"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-[#1D6FA4]">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">アップロード中...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl mb-2">📁</div>
                <p className="text-sm font-medium text-slate-600">クリックまたはドラッグ&ドロップ</p>
                <p className="text-xs text-slate-400 mt-1">Word / PDF / Markdown — 最大5MB</p>
              </>
            )}
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="説明を追加（任意）"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-[#1D6FA4] focus:outline-none"
          />

          {uploadError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {uploadError}
            </div>
          )}
        </div>
      )}

      {/* 添付ファイル一覧 */}
      {attachments.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm">添付資料がありません</p>
          {isAdmin && <p className="text-xs mt-1">Word / PDF / Markdownをアップロードしてください</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att: any) => {
            const typeCfg = FILE_TYPE_CONFIG[att.fileType as keyof typeof FILE_TYPE_CONFIG] ?? FILE_TYPE_CONFIG.other;
            return (
              <div key={att.id} className="bg-white border border-slate-100 rounded-xl p-4 flex items-start gap-3">
                <span className="text-2xl shrink-0 mt-0.5">{typeCfg.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 truncate max-w-xs">
                      {att.originalName}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeCfg.class}`}>
                      {typeCfg.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatSize(att.fileSize)}</span>
                  </div>

                  {att.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{att.description}</p>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">
                      {att.uploader?.name ?? "不明"} — {new Date(att.createdAt).toLocaleDateString("ja-JP")}
                    </span>

                    {/* AI生成に使用トグル */}
                    {isAdmin && (
                      <button
                        onClick={() => toggleGeneration(att.id, att.usedForGeneration)}
                        className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          att.usedForGeneration
                            ? "bg-violet-100 border-violet-300 text-violet-700"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:border-violet-300"
                        }`}
                      >
                        <span>{att.usedForGeneration ? "🤖 AI生成に使用" : "AI生成に使用しない"}</span>
                      </button>
                    )}
                    {!isAdmin && att.usedForGeneration && (
                      <span className="text-[10px] text-violet-600">🤖 AI生成で参照</span>
                    )}
                  </div>
                </div>

                {/* アクション */}
                <div className="flex gap-1.5 shrink-0">
                  <a
                    href={`/api/projects/${att.id.split("-")[0]}/attachments/${att.id}`}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
                    download={att.originalName}
                  >
                    ↓
                  </a>
                  {isAdmin && (
                    <button
                      onClick={() => deleteAttachment(att.id, att.originalName)}
                      className="text-xs px-2.5 py-1.5 border border-red-200 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
