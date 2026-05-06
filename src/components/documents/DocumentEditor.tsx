"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Heading1, Heading2, Heading3, List,
  Eye, Code, FileText, Folder, Clock, Save, ChevronDown,
  Download, Trash2, Upload, X, Check, Monitor, Maximize2,
  AlignLeft, Columns, RefreshCw, ChevronLeft
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
  isEditable?: boolean;
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

function getFileIcon(fileType: string) {
  const icons: Record<string, string> = {
    md: "📝", docx: "📄", doc: "📄", pdf: "🔴", html: "🌐",
  };
  return icons[fileType] ?? "📎";
}

function getFileLabel(fileType: string) {
  const labels: Record<string, string> = {
    md: "Markdown", docx: "Word", doc: "Word", pdf: "PDF", html: "HTML",
  };
  return labels[fileType] ?? fileType.toUpperCase();
}

// ============================================================
// Markdown → HTML 変換
// ============================================================
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];

  // state
  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];
  let inTable = false;
  let inOl = false;
  let inUl = false;

  const isSep = (line: string) =>
    /^\|( *:?-+:? *\|)+ *$/.test(line.trim());

  // テーブル行判定：最低3セル（| で2分割以上）必要
  const isTableRow = (t: string) =>
    t.startsWith("|") && t.endsWith("|") && t.split("|").length >= 2;

  const closeLists = () => {
    if (inOl) { out.push("</ol>"); inOl = false; }
    if (inUl) { out.push("</ul>"); inUl = false; }
  };
  const closeTable = () => {
    if (inTable) { out.push("</tbody></table></div>"); inTable = false; }
  };
  const closeFence = () => {
    if (inFence) {
      const code = escapeHtml(fenceLines.join("\n").trimEnd());
      out.push(`<pre class="code-block" data-lang="${fenceLang}"><code>${code}</code></pre>`);
      inFence = false; fenceLang = ""; fenceLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── コードフェンス ──
    if (/^```/.test(trimmed)) {
      if (!inFence) {
        closeLists(); closeTable();
        inFence = true;
        fenceLang = trimmed.replace(/^```/, "").trim();
        fenceLines = [];
      } else {
        closeFence();
      }
      continue;
    }
    if (inFence) { fenceLines.push(line); continue; }

    // ── セパレーター行は完全スキップ ──
    if (isSep(line)) { continue; }

    // ── テーブル行 ──
    if (isTableRow(trimmed)) {
      closeLists();
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (!inTable) {
        const next = lines[i + 1] ?? "";
        if (isSep(next)) {
          // thead あり：1行目はヘッダー、セパレーターをスキップ
          out.push('<div class="table-wrapper"><table>');
          out.push(`<thead><tr>${cells.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead>`);
          out.push("<tbody>");
          i++; // セパレーター行スキップ
          inTable = true;
          continue;
        } else {
          // thead なし：1行目もtbodyへ確実に出力
          out.push('<div class="table-wrapper"><table><tbody>');
          inTable = true;
          // continueしない → このままtr出力へ落ちる
        }
      }
      out.push(`<tr>${cells.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`);
      continue;
    }

    // テーブル以外の行でテーブルを閉じる
    closeTable();

    // ── 空行 → リストを閉じる ──
    if (trimmed === "") { closeLists(); out.push(""); continue; }

    // ── 水平線 ──
    if (/^-{3,}$/.test(trimmed)) { closeLists(); out.push("<hr>"); continue; }

    // ── 見出し ──
    const hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      closeLists();
      const tag = `h${hm[1].length}`;
      out.push(`<${tag}>${inlineMd(hm[2])}</${tag}>`);
      continue;
    }

    // ── 番号付きリスト ──
    const olm = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olm) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inlineMd(olm[2])}</li>`);
      continue;
    }

    // ── チェックボックス ──
    const ckx = trimmed.match(/^[-*]\s+\[x\]\s+(.+)$/i);
    const cko = trimmed.match(/^[-*]\s+\[\s\]\s+(.+)$/);
    if (ckx) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li class="ck checked"><span class="cb checked">✓</span>${inlineMd(ckx[1])}</li>`);
      continue;
    }
    if (cko) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li class="ck"><span class="cb">○</span>${inlineMd(cko[1])}</li>`);
      continue;
    }

    // ── 箇条書き ──
    const ulm = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulm) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineMd(ulm[1])}</li>`);
      continue;
    }

    // ── 通常段落 ──
    closeLists();
    out.push(`<p>${inlineMd(trimmed)}</p>`);
  }

  closeLists();
  closeTable();
  closeFence();

  return out.join("\n");
}

// HTML特殊文字エスケープ
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// インライン要素変換（escapeHtml後に処理）
function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  // bold を先に処理してから italic（順序が重要）
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // bold処理済みなので ** は消えている → * 単独のみ残る
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
  return t;
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
// Markdownプレビュー（スクショ準拠：A4ページ風カードデザイン）
// ============================================================
function MarkdownPreview({ content }: { content: string }) {
  const html = mdToHtml(content);
  return (
    <div className="md-preview-wrap h-full overflow-y-auto">
      <div className="md-preview-page">
        <div
          className="md-preview"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
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
// WORDビューア（スクショ2準拠：A4ページ風デザイン）
// ============================================================
function WordViewer({ content, fileName }: { content: string; fileName?: string }) {
  const isHtml = /<[a-z]/i.test(content);
  return (
    <div className="word-preview-wrap h-full">
      {/* トップバー */}
      <div className="word-preview-topbar">
        <span className="word-preview-topbar-title">{fileName ?? "Word Document"}</span>
        <span className="word-preview-topbar-badge">DOCX</span>
      </div>
      {/* A4ページ */}
      <div className="word-preview-page-wrap">
        <div className="word-preview-page">
          {isHtml ? (
            <div
              className="word-preview"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <pre className="word-preview-plain">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ファイルプレビューモーダル（NEW：ファイル名クリックで開く）
// ============================================================
interface FilePreviewProps {
  file: DocFile;
  projectId: string;
  docKey: string;
  isCustom: boolean;
  onClose: () => void;
}

function FilePreviewModal({ file, projectId, docKey, isCustom, onClose }: FilePreviewProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editContent, setEditContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const baseUrl = isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/files/${file.id}`
    : `/api/projects/${projectId}/documents/${docKey}/files/${file.id}`;

  const fetchUrl = `${baseUrl}?action=preview`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const text = await res.text();
          setPreviewContent(text);
          setEditContent(text);
        } else {
          setPreviewContent(null);
        }
      } catch {
        setPreviewContent(null);
      }
      setLoading(false);
    })();
  }, [fetchUrl]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(baseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      setPreviewContent(editContent);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const ft = file.fileType as FileType;
  const isMd = ft === "md";
  const isDocx = ft === "docx" || ft === "doc";
  const isHtmlFile = ft === "html";
  const canEdit = isMd || isHtmlFile;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F0F4F8]">
      {/* モーダルヘッダー */}
      <div className="file-preview-header">
        <button onClick={onClose} className="file-preview-back-btn">
          <ChevronLeft size={16} />
          <span>戻る</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0 mx-3">
          <span className="text-base">{getFileIcon(file.fileType)}</span>
          <span className="text-sm font-semibold text-[#1A3A5C] truncate">{file.originalName}</span>
          <span className="file-type-badge">{getFileLabel(file.fileType)}</span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="file-preview-edit-btn">
              ✏️ 編集
            </button>
          )}
          {isEditing && (
            <>
              <button
                onClick={() => { setIsEditing(false); setEditContent(previewContent ?? ""); }}
                className="file-preview-cancel-btn"
              >
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving} className="file-preview-save-btn">
                {saved ? <><Check size={13} /> 保存済み</> : saving ? "保存中..." : <><Save size={13} /> 保存</>}
              </button>
            </>
          )}
          <a href={baseUrl} download={file.originalName} className="file-preview-download-btn">
            <Download size={14} />
            ダウンロード
          </a>
        </div>
      </div>

      {/* プレビュー本体 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={20} className="animate-spin text-azure" />
            <span className="ml-2 text-sm text-slate-400">読み込み中...</span>
          </div>
        ) : previewContent === null ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl">📄</span>
            <p className="text-sm text-slate-400">プレビューを表示できません</p>
            <a href={baseUrl} download={file.originalName} className="file-preview-download-btn">
              <Download size={14} /> ダウンロード
            </a>
          </div>
        ) : isEditing ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <TextEditor
                value={editContent}
                onChange={setEditContent}
                language={isMd ? "markdown" : "html"}
                viewMode="split"
              />
            </div>
          </div>
        ) : isMd ? (
          <MarkdownPreview content={previewContent} />
        ) : isDocx ? (
          <WordViewer content={previewContent} fileName={file.originalName} />
        ) : isHtmlFile ? (
          <HtmlPreview code={previewContent} />
        ) : (
          <div className="p-6 h-full overflow-y-auto bg-white">
            <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 leading-relaxed">
              {previewContent}
            </pre>
          </div>
        )}
      </div>
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
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
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

  const handleDelete = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このファイルを削除しますか？")) return;
    await fetch(deleteUrl(fileId), { method: "DELETE" });
    onFilesChange(files.filter((f: any) => f.id !== fileId));
  };

  const downloadUrl = (fileId: string) => isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/files/${fileId}`
    : `/api/projects/${projectId}/documents/${docKey}/files/${fileId}`;

  return (
    <>
      {/* ファイルプレビューモーダル */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          projectId={projectId}
          docKey={docKey}
          isCustom={isCustom}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <div className="h-full flex flex-col bg-white">
        {/* ドロップゾーン */}
        <div
          className={`m-4 border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
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
                <div
                  key={file.id}
                  className="file-list-row group"
                  onClick={() => setPreviewFile(file)}
                >
                  <span className="text-xl flex-shrink-0">{getFileIcon(file.fileType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{file.originalName}</p>
                    <p className="text-xs text-slate-400">
                      {formatBytes(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <span className="file-type-badge flex-shrink-0">{getFileLabel(file.fileType)}</span>
                  <a
                    href={downloadUrl(file.id)}
                    download={file.originalName}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-navy opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    onClick={(e) => handleDelete(file.id, e)}
                    className="p-1.5 rounded hover:bg-risk-light text-slate-400 hover:text-risk opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
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