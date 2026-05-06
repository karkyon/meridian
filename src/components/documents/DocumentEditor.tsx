"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Heading1, Heading2, Heading3, List,
  Eye, Code, FileText, Folder, Clock, Save, ChevronDown,
  Download, Trash2, Upload, X, Check, Monitor, Maximize2,
  AlignLeft, Columns, RefreshCw
} from "lucide-react";

// ============================================================
// 型定義
// ============================================================
type FileType = "md" | "docx" | "doc" | "pdf" | "html";

interface DocFile {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

interface DocumentEditorProps {
  projectId: string;
  projectName: string;
  docType: string;
  initialContent: string;
  initialVersion?: number;
  version?: number;
  initialCompleteness: number;
  initialFiles?: DocFile[];
  isCustom?: false;
}

interface CustomDocEditorProps {
  projectId: string;
  projectName: string;
  docKey?: string;
  typeKey?: string;
  docTitle?: string;
  typeLabel?: string;
  initialContent: string;
  initialVersion?: number;
  version?: number;
  initialCompleteness: number;
  initialFiles?: DocFile[];
  versions?: { version: number; createdAt: string; aiGenerated: boolean }[];
  role?: string;
  isCustom: true;
}

type Props = DocumentEditorProps | CustomDocEditorProps;

// ============================================================
// ユーティリティ
// ============================================================
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(fileType: FileType) {
  const icons: Record<FileType, string> = {
    md: "📝", docx: "📄", doc: "📄", pdf: "🔴", html: "🌐",
  };
  return icons[fileType] ?? "📎";
}

// ============================================================
// Markdown → HTML 変換（シンプル実装）
// ============================================================
function mdToHtml(md: string): string {
  let html = md
    // コードブロック
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="code-block" data-lang="${lang}"><code>${escapeHtml(code.trimEnd())}</code></pre>`)
    // インラインコード
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // 見出し
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // 太字・斜体
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // チェックボックス
    .replace(/^- \[x\] (.+)$/gm, '<li class="checked"><span class="cb checked">✓</span> $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="unchecked"><span class="cb">○</span> $1</li>')
    // リスト
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li class=\"ol\">$1</li>")
    // 水平線
    .replace(/^---$/gm, "<hr>")
    // 段落
    .replace(/\n\n/g, "</p><p>")
    ;

  // li をまとめてulでラップ
  html = html.replace(/(<li.*>[\s\S]*?<\/li>)+/g, (m) => {
    if (m.includes('class="ol"')) return `<ol>${m}</ol>`;
    return `<ul>${m}</ul>`;
  });

  return `<p>${html}</p>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================================
// HTMLプレビュー（iframe + Tailwind）
// ============================================================
function HtmlPreview({ code, fullscreen }: { code: string; fullscreen?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    // コードがすでに完全なHTMLドキュメントかチェック
    const isFullDoc = /<!DOCTYPE|<html/i.test(code);
    const content = isFullDoc ? code : `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: sans-serif; }
</style>
</head>
<body>
${code}
</body>
</html>`;

    doc.open();
    doc.write(content);
    doc.close();
  }, [code]);

  return (
    <iframe
      ref={iframeRef}
      className={`w-full border-0 bg-white ${fullscreen ? "h-screen" : "h-full"}`}
      sandbox="allow-scripts allow-same-origin"
      title="HTML Preview"
    />
  );
}

// ============================================================
// Markdownプレビュー
// ============================================================
function MarkdownPreview({ content }: { content: string }) {
  const html = mdToHtml(content);
  return (
    <div
      className="md-preview prose max-w-none p-6 h-full overflow-y-auto bg-white"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ============================================================
// テキストエディタ（MD / HTML）
// ============================================================
interface TextEditorProps {
  value: string;
  onChange: (v: string) => void;
  language: "markdown" | "html";
  viewMode: "edit" | "preview" | "split";
}

function TextEditor({ value, onChange, language, viewMode }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ツールバーアクション
  const insertWrap = (before: string, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e) || "テキスト";
    const newVal = v.slice(0, s) + before + sel + after + v.slice(e);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    const newVal = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    onChange(newVal);
    setTimeout(() => ta.focus(), 0);
  };

  const toolbar = language === "markdown" ? [
    { icon: <Bold size={13} />, action: () => insertWrap("**"), title: "太字" },
    { icon: <Italic size={13} />, action: () => insertWrap("*"), title: "斜体" },
    { icon: <Heading1 size={13} />, action: () => insertLine("# "), title: "見出し1" },
    { icon: <Heading2 size={13} />, action: () => insertLine("## "), title: "見出し2" },
    { icon: <Heading3 size={13} />, action: () => insertLine("### "), title: "見出し3" },
    { icon: <List size={13} />, action: () => insertLine("- "), title: "リスト" },
    { icon: <Code size={13} />, action: () => insertWrap("`"), title: "コード" },
  ] : [
    { icon: <Bold size={13} />, action: () => insertWrap("<strong>", "</strong>"), title: "太字" },
    { icon: <Italic size={13} />, action: () => insertWrap("<em>", "</em>"), title: "斜体" },
    { icon: <Heading1 size={13} />, action: () => insertWrap("<h1>", "</h1>"), title: "H1" },
    { icon: <Heading2 size={13} />, action: () => insertWrap("<h2>", "</h2>"), title: "H2" },
    { icon: <Heading3 size={13} />, action: () => insertWrap("<h3>", "</h3>"), title: "H3" },
    { icon: <List size={13} />, action: () => insertWrap("<ul>\n  <li>", "</li>\n</ul>"), title: "リスト" },
    { icon: <Code size={13} />, action: () => insertWrap("<code>", "</code>"), title: "コード" },
  ];

  const showEditor = viewMode === "edit" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
        {toolbar.map((t: any, i: number) => (
          <button
            key={i}
            onClick={t.action}
            title={t.title}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-navy transition-colors"
          >
            {t.icon}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-slate-400 font-mono">
          {language === "markdown" ? "Markdown" : "HTML"}
        </span>
      </div>

      {/* エディタ/プレビュー */}
      <div className={`flex-1 flex min-h-0 ${viewMode === "split" ? "divide-x divide-slate-200" : ""}`}>
        {showEditor && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 resize-none p-4 font-mono text-sm text-slate-700 bg-white outline-none leading-relaxed"
            spellCheck={false}
            placeholder={language === "markdown" ? "# タイトル\n\n本文を入力..." : "<!-- HTML を入力 -->\n<div class=\"...\">"}
          />
        )}
        {showPreview && (
          <div className={`flex-1 overflow-auto ${viewMode === "split" ? "" : ""}`}>
            {language === "markdown" ? (
              <MarkdownPreview content={value} />
            ) : (
              <HtmlPreview code={value} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// WORDビューア（mammothで抽出したテキストを表示）
// ============================================================
function WordViewer({ content }: { content: string }) {
  // contentはサーバー側でmammothが抽出したHTMLまたはプレーンテキスト
  const isHtml = /<[a-z]/.test(content);
  if (isHtml) {
    return (
      <div
        className="prose max-w-none p-6 h-full overflow-y-auto bg-white word-preview"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  return (
    <div className="p-6 h-full overflow-y-auto bg-white">
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

// ============================================================
// ファイルタブ
// ============================================================
interface FileTabProps {
  projectId: string;
  docKey: string;       // docType or docKey
  isCustom: boolean;
  files: DocFile[];
  onFilesChange: (files: DocFile[]) => void;
}

function FileTab({ projectId, docKey, isCustom, files, onFilesChange }: FileTabProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadUrl = isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/upload`
    : `/api/projects/${projectId}/documents/${docKey}/upload`;

  const deleteUrl = (fileId: string) => isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/files/${fileId}`
    : `/api/projects/${projectId}/documents/${docKey}/files/${fileId}`;

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(fileList).forEach((f: any) => formData.append("file", f));
    try {
      const res = await fetch(uploadUrl, { method: "POST", body: formData });
      const data = await res.json();
      if (data.files) onFilesChange([...files, ...data.files]);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("このファイルを削除しますか？")) return;
    await fetch(deleteUrl(fileId), { method: "DELETE" });
    onFilesChange(files.filter((f: any) => f.id !== fileId));
  };

  const downloadUrl = (fileId: string) => isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/files/${fileId}`
    : `/api/projects/${projectId}/documents/${docKey}/files/${fileId}`;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ドロップゾーン */}
      <div
        className={`m-4 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? "border-azure bg-azure-light/50" : "border-slate-200 hover:border-slate-300"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={20} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-500">
          クリックまたはドラッグでアップロード
        </p>
        <p className="text-xs text-slate-400 mt-1">.md .docx .pdf .html — 最大5MB</p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".md,.markdown,.docx,.doc,.pdf,.html,.htm"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {uploading && (
        <div className="mx-4 mb-3 flex items-center gap-2 text-sm text-azure">
          <RefreshCw size={14} className="animate-spin" /> アップロード中...
        </div>
      )}

      {/* ファイルリスト */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {files.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            ファイルはまだありません
          </p>
        ) : (
          <div className="space-y-2">
            {files.map((file: any) => (
              <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 group">
                <span className="text-lg">{getFileIcon(file.fileType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy truncate">{file.originalName}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <a
                  href={downloadUrl(file.id)}
                  download={file.originalName}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-navy opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Download size={14} />
                </a>
                <button
                  onClick={() => handleDelete(file.id)}
                  className="p-1.5 rounded hover:bg-risk-light text-slate-400 hover:text-risk opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// バージョン履歴パネル
// ============================================================
interface Version {
  id: string;
  version: number;
  createdAt: string;
  createdByName?: string;
}

function HistoryPanel({ versions, onRestore, onClose }: {
  versions: Version[];
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-10 w-64 bg-white border border-slate-200 rounded-xl shadow-panel z-50">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <span className="text-sm font-medium text-navy">バージョン履歴</span>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-400">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {versions.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">履歴なし</p>
        )}
        {versions.map((v: any) => (
          <div key={v.id} className="flex items-center justify-between p-3 hover:bg-slate-50 border-b border-slate-50">
            <div>
              <p className="text-xs font-medium text-navy">v{v.version}</p>
              <p className="text-xs text-slate-400">
                {new Date(v.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
              {v.createdByName && <p className="text-xs text-slate-400">{v.createdByName}</p>}
            </div>
            <button
              onClick={() => onRestore(v.id)}
              className="text-xs px-2 py-1 text-azure hover:bg-azure-light rounded"
            >
              復元
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export function DocumentEditor(props: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"editor" | "files">("editor");
  const [content, setContent] = useState(props.initialContent || "");
  const [completeness, setCompleteness] = useState(props.initialCompleteness || 0);
  const [files, setFiles] = useState<DocFile[]>(props.initialFiles || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("edit");

  const projectId = props.projectId;
  const isCustom = props.isCustom === true;
  const docKey = isCustom ? ((props as CustomDocEditorProps).docKey ?? (props as CustomDocEditorProps).typeKey ?? "") : (props as DocumentEditorProps).docType;

  // ファイルタイプを判定（アップロードされたファイルから判断するか、デフォルトMD）
  // ここではエディタのlanguageを決める
  // カスタムドキュメントはMarkdownがデフォルト
  const [editorLanguage, setEditorLanguage] = useState<"markdown" | "html">("markdown");

  // HTMLファイルが読み込まれているかどうかでエディタ言語を切替
  useEffect(() => {
    if (content.trim().startsWith("<!DOCTYPE") || content.trim().startsWith("<html")) {
      setEditorLanguage("html");
    }
  }, []);

  // バージョン履歴取得
  const fetchVersions = async () => {
    const url = isCustom
      ? `/api/projects/${projectId}/custom-docs/${docKey}/versions`
      : `/api/projects/${projectId}/documents/${docKey}/versions`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      // ignore
    }
  };

  // 保存
  const handleSave = async () => {
    setSaving(true);
    const url = isCustom
      ? `/api/projects/${projectId}/custom-docs/${docKey}`
      : `/api/projects/${projectId}/documents/${docKey}`;
    try {
      await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, completeness }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // バージョン復元
  const handleRestore = async (versionId: string) => {
    const url = isCustom
      ? `/api/projects/${projectId}/custom-docs/${docKey}/versions/${versionId}/restore`
      : `/api/projects/${projectId}/documents/${docKey}/versions/${versionId}/restore`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (data.content) setContent(data.content);
    setShowHistory(false);
  };

  const version = isCustom
    ? ((props as CustomDocEditorProps).initialVersion ?? (props as CustomDocEditorProps).version ?? 1)
    : ((props as DocumentEditorProps).initialVersion ?? (props as DocumentEditorProps).version ?? 1);

  const title = isCustom
    ? ((props as CustomDocEditorProps).docTitle ?? (props as CustomDocEditorProps).typeLabel ?? docKey)
    : docKey;

  // ビューモードのボタン
  const viewModeButtons: Array<{ mode: "edit" | "preview" | "split"; icon: React.ReactNode; label: string }> = [
    { mode: "edit", icon: <AlignLeft size={13} />, label: "編集" },
    { mode: "split", icon: <Columns size={13} />, label: "分割" },
    { mode: "preview", icon: <Eye size={13} />, label: "プレビュー" },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ─── ヘッダー ─── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-navy truncate">{title}</h1>
          <p className="text-xs text-slate-400">v{version}</p>
        </div>

        {/* 完成度スライダー */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">完成度</span>
          <input
            type="range" min={0} max={100} step={5}
            value={completeness}
            onChange={(e) => setCompleteness(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-xs font-medium text-navy w-9 text-right">{completeness}%</span>
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? "bg-success text-white"
              : "bg-azure text-white hover:bg-azure-light hover:text-azure"
          }`}
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "保存済み" : saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* ─── タブ ─── */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-0">
        <button
          onClick={() => setActiveTab("editor")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
            activeTab === "editor"
              ? "border-azure text-azure font-medium"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <FileText size={14} />
          ✏️ エディタ
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
            activeTab === "files"
              ? "border-azure text-azure font-medium"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Folder size={14} />
          📁 ファイル
          {files.length > 0 && (
            <span className="ml-1 text-xs bg-azure-light text-azure px-1.5 py-0.5 rounded-full font-medium">
              {files.length}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {activeTab === "editor" && (
          <div className="flex items-center gap-1">
            {/* エディタ言語切替 */}
            <div className="flex items-center gap-1 mr-3">
              <button
                onClick={() => setEditorLanguage("markdown")}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  editorLanguage === "markdown"
                    ? "bg-slate-200 text-navy font-medium"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                MD
              </button>
              <button
                onClick={() => setEditorLanguage("html")}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  editorLanguage === "html"
                    ? "bg-slate-200 text-navy font-medium"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                HTML
              </button>
            </div>

            {/* ビューモード切替 */}
            {viewModeButtons.map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  viewMode === mode
                    ? "bg-navy text-white"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}

            {/* 履歴ボタン */}
            <div className="relative ml-2">
              <button
                onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchVersions(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Clock size={13} />
                <span>履歴</span>
                <ChevronDown size={11} />
              </button>
              {showHistory && (
                <HistoryPanel
                  versions={versions}
                  onRestore={handleRestore}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── コンテンツ ─── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "editor" ? (
          <TextEditor
            value={content}
            onChange={setContent}
            language={editorLanguage}
            viewMode={viewMode}
          />
        ) : (
          <FileTab
            projectId={projectId}
            docKey={docKey}
            isCustom={isCustom}
            files={files}
            onFilesChange={setFiles}
          />
        )}
      </div>
    </div>
  );
}

export default DocumentEditor;