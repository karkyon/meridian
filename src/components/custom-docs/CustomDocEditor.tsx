"use client";

import { useState, useRef, useCallback } from "react";

type FileRecord = {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  isEditable: boolean;
  createdAt: string;
};

type VersionRecord = {
  version: number;
  createdAt: string;
  aiGenerated: boolean;
};

const FILE_ICONS: Record<string, string> = {
  word: "📄",
  pdf: "📕",
  markdown: "📝",
  other: "📎",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function CustomDocEditor({
  projectId, typeKey, typeLabel,
  initialContent, initialCompleteness, version,
  initialFiles, versions, role,
}: {
  projectId: string;
  typeKey: string;
  typeLabel: string;
  initialContent: string;
  initialCompleteness: number;
  version: number;
  initialFiles: FileRecord[];
  versions: VersionRecord[];
  role: string;
}) {
  const isAdmin = role === "admin";
  const [content, setContent] = useState(initialContent);
  const [completeness, setCompleteness] = useState(initialCompleteness);
  const [files, setFiles] = useState(initialFiles);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "files">("editor");
  const [savedMsg, setSavedMsg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/custom-docs/${typeKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, completeness }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    }
  };

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/custom-docs/${typeKey}/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (res.ok) {
      setFiles((prev) => [data.file, ...prev]);
      // MarkdownはエディタにもINPUT
      if (data.file.isEditable && data.file.fileType === "markdown") {
        const textRes = await fetch(`/api/projects/${projectId}/custom-docs/${typeKey}/files/${data.file.id}?action=text`);
        const textData = await textRes.json();
        if (textData.text) setContent(textData.text);
      }
    } else {
      const msg = data.error === "FILE_TOO_LARGE" ? "ファイルは5MB以下にしてください"
        : data.error === "INVALID_FILE_TYPE" ? "対応: Word / PDF / Markdown"
        : "アップロード失敗";
      setUploadError(msg);
    }
    setUploading(false);
  }, [projectId, typeKey]);

  const handleDelete = async (fileId: string) => {
    if (!confirm("このファイルを削除しますか？")) return;
    const res = await fetch(`/api/projects/${projectId}/custom-docs/${typeKey}/files/${fileId}`, { method: "DELETE" });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleLoadText = async (fileId: string) => {
    const res = await fetch(`/api/projects/${projectId}/custom-docs/${typeKey}/files/${fileId}?action=text`);
    const data = await res.json();
    if (data.text) {
      setContent(data.text);
      setActiveTab("editor");
    }
  };

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{typeLabel}</h1>
          <p className="text-xs text-slate-400 mt-0.5">v{version} — 完成度 {completeness}%</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">完成度</span>
              <input
                type="range" min="0" max="100" value={completeness}
                onChange={(e) => setCompleteness(Number(e.target.value))}
                className="w-24 accent-[#1D6FA4]"
              />
              <span className="text-xs font-mono w-8 text-slate-600">{completeness}%</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#1D6FA4] text-white text-sm rounded-lg hover:bg-[#1a5f8e] disabled:opacity-50 transition-colors"
            >
              {saving ? "保存中..." : savedMsg ? "✅ 保存済" : "保存"}
            </button>
          </div>
        )}
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["editor", "files"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-[#1D6FA4] text-[#1D6FA4]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "editor" ? `✏️ エディタ` : `📁 ファイル (${files.length})`}
          </button>
        ))}
      </div>

      {/* エディタタブ */}
      {activeTab === "editor" && (
        <div className="space-y-3">
          {!isAdmin && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              閲覧専用です（編集はAdminのみ）
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={!isAdmin}
            placeholder={`${typeLabel}の内容をMarkdown形式で記述してください...`}
            className="w-full h-[60vh] font-mono text-sm border border-slate-200 rounded-xl p-4 resize-none focus:border-[#1D6FA4] focus:outline-none bg-white disabled:bg-slate-50"
          />
          <p className="text-xs text-slate-400 text-right">{content.length.toLocaleString()} 文字</p>
        </div>
      )}

      {/* ファイルタブ */}
      {activeTab === "files" && (
        <div className="space-y-4">
          {/* アップロードエリア */}
          {isAdmin && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragOver ? "border-[#1D6FA4] bg-[#1D6FA4]/5" : "border-slate-200 hover:border-[#1D6FA4]"
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm">アップロード中...</span>
                </div>
              ) : (
                <>
                  <div className="text-3xl mb-2">📁</div>
                  <p className="text-sm font-medium text-slate-600">クリックまたはドラッグ&ドロップ</p>
                  <p className="text-xs text-slate-400 mt-1">Word (.docx) / PDF / Markdown (.md) — 最大5MB</p>
                  <p className="text-xs text-slate-400">複数ファイル登録可（順次追加）</p>
                </>
              )}
            </div>
          )}

          {uploadError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{uploadError}</div>
          )}

          {/* ファイル一覧 */}
          {files.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm">ファイルがありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <span className="text-xl">{FILE_ICONS[f.fileType] ?? "📎"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{f.originalName}</p>
                    <p className="text-xs text-slate-400">
                      {formatSize(f.fileSize)} ·{" "}
                      {new Date(f.createdAt).toLocaleDateString("ja-JP")} ·{" "}
                      {f.fileType === "pdf" ? "閲覧のみ" : f.isEditable ? "編集可" : "テキスト抽出済"}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {/* ダウンロード */}
                    <a
                      href={`/api/projects/${projectId}/custom-docs/${typeKey}/files/${f.id}`}
                      download={f.originalName}
                      className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      ↓ DL
                    </a>
                    {/* MDやWordはエディタに読み込み可能 */}
                    {f.isEditable && isAdmin && (
                      <button
                        onClick={() => handleLoadText(f.id)}
                        className="text-xs px-3 py-1.5 border border-[#1D6FA4] text-[#1D6FA4] rounded-lg hover:bg-[#1D6FA4]/5 transition-colors"
                      >
                        エディタで開く
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* バージョン履歴 */}
          {versions.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">バージョン履歴</h3>
              <div className="space-y-1">
                {versions.map((v) => (
                  <div key={v.version} className="flex items-center gap-3 text-xs text-slate-500 py-1 border-b border-slate-100">
                    <span className="font-mono">v{v.version}</span>
                    <span>{new Date(v.createdAt).toLocaleString("ja-JP")}</span>
                    {v.aiGenerated && <span className="text-violet-500">AI生成</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
