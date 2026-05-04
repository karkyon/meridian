"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type Version = { version: number; createdAt: string; aiGenerated: boolean };
type FileRecord = { id: string; originalName: string; fileType: string; fileSize: number; createdAt: string };

const FILE_ICONS: Record<string, string> = { word: "📄", pdf: "📕", markdown: "📝", other: "📎" };
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hlp])(.+)$/gm, "<p>$1</p>");
}
function htmlToMd(html: string): string {
  return html
    .replace(/<h1>(.*?)<\/h1>/g, "# $1\n")
    .replace(/<h2>(.*?)<\/h2>/g, "## $1\n")
    .replace(/<h3>(.*?)<\/h3>/g, "### $1\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<li>(.*?)<\/li>/g, "- $1\n")
    .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
    .replace(/<[^>]+>/g, "").trim();
}

export default function DocumentEditor({
  projectId, docType, docTypeLabel, projectName,
  initialContent, initialCompleteness,
  version, aiGenerated, versions, role,
}: {
  projectId: string; docType: string; docTypeLabel: string;
  projectName?: string;
  initialContent: string; initialCompleteness: number;
  version: number; aiGenerated: boolean;
  versions: Version[]; role: string;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [completeness, setCompleteness] = useState(initialCompleteness);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "files">("editor");
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: `${docTypeLabel}の内容をここに入力してください...` }),
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent ? mdToHtml(initialContent) : "",
    editable: isAdmin,
    editorProps: { attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-1" } },
  });

  const loadFiles = useCallback(async () => {
    if (filesLoaded) return;
    const res = await fetch(`/api/projects/${projectId}/documents/${docType}/files`);
    if (res.ok) { const data = await res.json(); setFiles(data.files ?? []); }
    setFilesLoaded(true);
  }, [projectId, docType, filesLoaded]);

  const handleTabChange = (tab: "editor" | "files") => {
    setActiveTab(tab);
    if (tab === "files") loadFiles();
  };

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    const content = htmlToMd(editor.getHTML());
    const res = await fetch(`/api/projects/${projectId}/documents/${docType}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, completeness }),
    });
    if (res.ok) { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000); router.refresh(); }
    setSaving(false);
  }, [editor, projectId, docType, completeness, router]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true); setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/documents/${docType}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setFiles((prev) => [data.file, ...prev]);
      if (data.file?.isEditable && data.file?.fileType === "markdown" && data.file?.extractedText) {
        editor?.commands.setContent(mdToHtml(data.file.extractedText));
      }
    } else {
      setUploadError(data.error === "FILE_TOO_LARGE" ? "ファイルは5MB以下にしてください"
        : data.error === "INVALID_FILE_TYPE" ? "対応: Word / PDF / Markdown" : "アップロード失敗");
    }
    setUploading(false);
  }, [projectId, docType, editor]);

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("このファイルを削除しますか？")) return;
    const res = await fetch(`/api/projects/${projectId}/documents/${docType}/files/${fileId}`, { method: "DELETE" });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{docTypeLabel}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-slate-400">v{version}</p>
            {aiGenerated && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">AI生成</span>}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">完成度</span>
              <input type="range" min="0" max="100" value={completeness}
                onChange={(e) => setCompleteness(Number(e.target.value))} className="w-24 accent-[#1D6FA4]" />
              <span className="text-xs font-mono w-8 text-slate-600">{completeness}%</span>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-[#1D6FA4] text-white text-sm rounded-lg hover:bg-[#1a5f8e] disabled:opacity-50 transition-colors">
              {saving ? "保存中..." : savedMsg ? "✅ 保存済" : "保存"}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["editor", "files"] as const).map((tab) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab ? "border-[#1D6FA4] text-[#1D6FA4]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {tab === "editor" ? "✏️ エディタ" : `📁 ファイル${files.length > 0 ? ` (${files.length})` : ""}`}
          </button>
        ))}
        <button onClick={() => setShowVersions(!showVersions)}
          className="ml-auto text-xs text-slate-400 hover:text-slate-600 px-3 py-2">
          🕐 履歴{showVersions ? " ▲" : " ▼"}
        </button>
      </div>

      {showVersions && versions.length > 0 && (
        <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-medium text-slate-600 mb-2">バージョン履歴</p>
          <div className="space-y-1">
            {versions.map((v) => (
              <div key={v.version} className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-mono">v{v.version}</span>
                <span>{new Date(v.createdAt).toLocaleString("ja-JP")}</span>
                {v.aiGenerated && <span className="text-violet-500">AI生成</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "editor" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {isAdmin && (
            <div className="flex flex-wrap gap-1 p-2 border-b border-slate-100 bg-slate-50">
              {[
                { cmd: () => editor?.chain().focus().toggleBold().run(), label: "B" },
                { cmd: () => editor?.chain().focus().toggleItalic().run(), label: "I" },
                { cmd: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), label: "H1" },
                { cmd: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), label: "H2" },
                { cmd: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), label: "H3" },
                { cmd: () => editor?.chain().focus().toggleBulletList().run(), label: "• 箇条書き" },
              ].map((btn) => (
                <button key={btn.label} onMouseDown={(e) => { e.preventDefault(); btn.cmd(); }}
                  className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 transition-colors">
                  {btn.label}
                </button>
              ))}
            </div>
          )}
          <div className="p-4"><EditorContent editor={editor} /></div>
        </div>
      )}

      {activeTab === "files" && (
        <div className="space-y-3">
          {isAdmin && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-[#1D6FA4] bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}>
              <div className="text-2xl mb-2">📁</div>
              <p className="text-sm text-slate-500">{uploading ? "アップロード中..." : "クリックまたはドラッグ&ドロップ"}</p>
              <p className="text-xs text-slate-400 mt-1">Word / PDF / Markdown — 最大5MB</p>
              <input ref={fileInputRef} type="file" className="hidden" accept=".docx,.doc,.pdf,.md,.markdown"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
          )}
          {uploadError && <p className="text-xs text-red-500 px-1">{uploadError}</p>}
          {files.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm">ファイルがありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <span className="text-xl shrink-0">{FILE_ICONS[file.fileType] ?? "📎"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{file.originalName}</p>
                    <p className="text-xs text-slate-400">{formatSize(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("ja-JP")}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a href={`/api/projects/${projectId}/documents/${docType}/files/${file.id}`}
                      className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">DL</a>
                    {isAdmin && (
                      <button onClick={() => handleDeleteFile(file.id)}
                        className="text-xs px-2.5 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50 transition-colors">削除</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
