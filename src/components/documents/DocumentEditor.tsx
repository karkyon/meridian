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
// Markdown → HTML 変換（完全実装・state管理方式）
// ============================================================
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
  return t;
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];

  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];
  let inTable = false;
  let inOl = false;
  let inUl = false;

  // セパレーター行判定（|---|, |:---|, |---:|, |:---:| スペース混在全対応）
  const isSep = (line: string) =>
    /^\|( *:?-+:? *\|)+ *$/.test(line.trim());

  // テーブル行判定：| で囲まれており最低1セル
  const isTableRow = (t: string) =>
    t.startsWith("|") && t.endsWith("|") && t.split("|").length >= 3;

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
    if (isSep(trimmed)) { continue; }

    // ── テーブル行 ──
    if (isTableRow(trimmed)) {
      closeLists();
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (!inTable) {
        const next = (lines[i + 1] ?? "").trim();
        if (isSep(next)) {
          // thead あり
          out.push('<div class="table-wrapper"><table>');
          out.push(`<thead><tr>${cells.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead>`);
          out.push("<tbody>");
          i++; // セパレーター行スキップ
          inTable = true;
          continue;
        } else {
          // thead なし：1行目もtbodyへ出力
          out.push('<div class="table-wrapper"><table><tbody>');
          inTable = true;
          // continueしない → そのまま下のtr出力へ落ちる
        }
      }
      out.push(`<tr>${cells.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`);
      continue;
    }

    // テーブル内の空行は無視（行間空行でテーブルが分断されるのを防ぐ）
    if (trimmed === "") {
      if (!inTable) { closeLists(); out.push(""); }
      continue;
    }

    // テーブル以外の行でテーブルを閉じる
    closeTable();

    // ── 空行 → リストを閉じる ──
    // if (trimmed === "") { closeLists(); out.push(""); continue; }

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
      if (!inOl) { out.push(`<ol start="${olm[1]}">`); inOl = true; }
      out.push(`<li value="${olm[1]}">${inlineMd(olm[2])}</li>`);
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

    // ── 通常段落（空文字は出力しない）──
    closeLists();
    const paragraph = inlineMd(trimmed);
    if (paragraph.trim() !== "") {
      out.push(`<p>${paragraph}</p>`);
    }
  }

  closeLists();
  closeTable();
  closeFence();

  return out.join("\n");
}

// ============================================================
// HTMLプレビュー（iframe）
// ============================================================
function HtmlPreview({ code, fullscreen }: { code: string; fullscreen?: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    const isFullDoc = /<!DOCTYPE|<html/i.test(code);
    const content = isFullDoc ? code : `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>body { font-family: sans-serif; }</style>
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
  const html = sanitizeHtml(mdToHtml(content));
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
  onViewModeChange?: (mode: "edit" | "preview" | "split") => void;
  onSave?: () => void;
  showSaveButton?: boolean;
}

function TextEditor({ value, onChange, language, viewMode, onViewModeChange, onSave, showSaveButton }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const viewModeButtons: Array<{ mode: "edit" | "preview" | "split"; icon: React.ReactNode; label: string }> = [
    { mode: "edit", icon: <AlignLeft size={13} />, label: "編集" },
    { mode: "split", icon: <Columns size={13} />, label: "分割" },
    { mode: "preview", icon: <Eye size={13} />, label: "プレビュー" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 bg-slate-50/80 flex-wrap">
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
        <div className="h-4 w-px bg-slate-200 mx-1" />
        {/* ビューモード切替 */}
        {onViewModeChange && viewModeButtons.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
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
        <div className="flex-1" />
        <span className="text-xs text-slate-400 font-mono">
          {language === "markdown" ? "Markdown" : "HTML"}
        </span>
        {showSaveButton && onSave && (
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors ml-2"
          >
            <Save size={12} />
            保存
          </button>
        )}
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
          <div className={`flex-1 overflow-auto`}>
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
// WORDビューア
// ============================================================
function WordViewer({ content, fileName }: { content: string; fileName?: string }) {
  const isHtml = /<[a-z]/i.test(content);
  return (
    <div className="word-preview-wrap h-full">
      <div className="word-preview-topbar">
        <span className="word-preview-topbar-title">{fileName ?? "Word Document"}</span>
        <span className="word-preview-topbar-badge">DOCX</span>
      </div>
      <div className="word-preview-page-wrap">
        <div className="word-preview-page">
          {isHtml ? (
            <div className="word-preview" dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            <pre className="word-preview-plain">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 保存ダイアログ
// ============================================================
interface SaveDialogProps {
  currentName: string;
  hasConflict: boolean;
  onSave: (fileName: string, overwrite: boolean) => void;
  onCancel: () => void;
}

function SaveDialog({ currentName, hasConflict, onSave, onCancel }: SaveDialogProps) {
  const [fileName, setFileName] = useState(currentName);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-[420px]">
        <h3 className="text-sm font-semibold text-navy mb-1 flex items-center gap-2">
          <Save size={15} /> ファイルを保存
        </h3>
        <p className="text-xs text-slate-500 mb-4">保存先のファイル名を確認・変更してください。</p>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-azure"
        />
        {hasConflict && (
          <p className="text-xs text-amber-600 mb-4 flex items-center gap-1">
            ⚠ 同名ファイルが存在します。上書き保存しますか？
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            キャンセル
          </button>
          {hasConflict && fileName === currentName ? (
            <>
              <button
                onClick={() => onSave(fileName + "_copy", false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-navy hover:bg-slate-50"
              >
                別名で保存
              </button>
              <button
                onClick={() => onSave(fileName, true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                上書き保存
              </button>
            </>
          ) : (
            <button
              onClick={() => onSave(fileName, fileName === currentName)}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              保存する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ファイルプレビュー・編集画面（フルスクリーン）
// ============================================================
interface FilePreviewProps {
  file: DocFile;
  projectId: string;
  docKey: string;
  isCustom: boolean;
  allFiles: DocFile[];
  onClose: () => void;
  onFilesChange: (files: DocFile[]) => void;
}

function FilePreviewScreen({ file, projectId, docKey, isCustom, allFiles, onClose, onFilesChange }: FilePreviewProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editContent, setEditContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"preview" | "edit" | "split">("preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

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

  const handleEditChange = (val: string) => {
    setEditContent(val);
    setIsDirty(true);
  };

  // 保存ダイアログ表示
  const handleSaveClick = () => {
    setShowSaveDialog(true);
  };

  // 実際の保存処理
  const handleSaveConfirm = async (fileName: string, overwrite: boolean) => {
    setSaving(true);
    setShowSaveDialog(false);
    try {
      const res = await fetch(baseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, fileName, overwrite }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(editContent);
        setSaved(true);
        setIsDirty(false);
        setViewMode("preview");
        // ファイル名が変わった場合はファイルリストを更新
        if (data.file) {
          const updated = allFiles.map(f => f.id === file.id ? { ...f, originalName: data.file.originalName } : f);
          onFilesChange(updated);
        }
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const ft = file.fileType as FileType;
  const isMd = ft === "md";
  const isDocx = ft === "docx" || ft === "doc";
  const isHtmlFile = ft === "html";
  const canEdit = isMd || isHtmlFile;
  const editorLang: "markdown" | "html" = isMd ? "markdown" : "html";

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ヘッダー */}
      <div className="file-preview-header">
        <button onClick={onClose} className="file-preview-back-btn">
          <ChevronLeft size={16} />
          <span>戻る</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0 mx-3">
          <span className="text-base">{getFileIcon(file.fileType)}</span>
          <span className="text-sm font-semibold text-[#1A3A5C] truncate">{file.originalName}</span>
          <span className="file-type-badge">{getFileLabel(file.fileType)}</span>
          {isDirty && <span className="text-xs text-amber-500 font-medium">● 未保存</span>}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !loading && previewContent !== null && (
            <>
              <div className="flex items-center gap-1 mr-1">
                <button className="text-xs px-2 py-1 rounded bg-slate-200 text-navy font-medium">
                  {editorLang === "markdown" ? "MD" : "HTML"}
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                {(["edit", "split", "preview"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={mode === "edit" ? "編集" : mode === "split" ? "分割" : "プレビュー"}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === mode
                        ? "bg-navy text-white"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {mode === "edit" && <><AlignLeft size={12} /> 編集</>}
                    {mode === "split" && <><Columns size={12} /> 分割</>}
                    {mode === "preview" && <><Eye size={12} /> プレビュー</>}
                  </button>
                ))}
              </div>
            </>
          )}
          {canEdit && (viewMode === "edit" || viewMode === "split") && (
            <button onClick={handleSaveClick} disabled={saving} className="file-preview-save-btn">
              {saved ? <><Check size={13} /> 保存済み</> : saving ? "保存中..." : <><Save size={13} /> 保存</>}
            </button>
          )}
          <a href={baseUrl} download={file.originalName} className="file-preview-download-btn">
            <Download size={14} />
            DL
          </a>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={20} className="animate-spin text-blue-500" />
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
        ) : canEdit ? (
          <TextEditor
            value={editContent}
            onChange={handleEditChange}
            language={editorLang}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
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

      {/* 保存ダイアログ */}
      {showSaveDialog && (
        <SaveDialog
          currentName={file.originalName}
          hasConflict={allFiles.some(f => f.id !== file.id && f.originalName === file.originalName)}
          onSave={handleSaveConfirm}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// ファイルタブ
// ============================================================
interface FileTabProps {
  projectId: string;
  docKey: string;
  isCustom: boolean;
  files: DocFile[];
  onFilesChange: (files: DocFile[]) => void;
}

function FileTab({ projectId, docKey, isCustom, files, onFilesChange }: FileTabProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeFile, setActiveFile] = useState<DocFile | null>(null);
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

  // ファイルプレビュー画面表示中
  return (
    <div className="h-full flex flex-col bg-white relative">
      {/* ファイルプレビュー画面：ファイルリストの上にオーバーレイ */}
      {activeFile && (
        <div className="absolute inset-0 z-10 bg-slate-50 flex flex-col">
          <FilePreviewScreen
            file={activeFile}
            projectId={projectId}
            docKey={docKey}
            isCustom={isCustom}
            allFiles={files}
            onClose={() => setActiveFile(null)}
            onFilesChange={onFilesChange}
          />
        </div>
      )}
      {/* ドロップゾーン */}
      <div
        className={`m-4 border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={20} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-500">クリックまたはドラッグでアップロード</p>
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
        <div className="mx-4 mb-3 flex items-center gap-2 text-sm text-blue-600">
          <RefreshCw size={14} className="animate-spin" /> アップロード中...
        </div>
      )}

      {/* ファイルリスト */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {files.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">ファイルはまだありません</p>
        ) : (
          <div className="space-y-2">
            {files.map((file: any) => (
              <div
                key={file.id}
                className="file-list-row group cursor-pointer"
                onClick={() => setActiveFile(file)}
              >
                <span className="text-xl flex-shrink-0">{getFileIcon(file.fileType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy truncate">{file.originalName}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <span className="file-type-badge flex-shrink-0">{getFileLabel(file.fileType)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveFile(file); }}
                  className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                >
                  開く
                </button>
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
                  className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
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
    <div className="absolute right-0 top-10 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50">
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
              className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
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

  const projectId = props.projectId;
  const isCustom = props.isCustom === true;
  const docKey = isCustom
    ? ((props as CustomDocEditorProps).docKey ?? (props as CustomDocEditorProps).typeKey ?? "")
    : (props as DocumentEditorProps).docType;

  const initialFiles = props.initialFiles || [];

  // ファイルがあればデフォルトをファイルタブに
  const [activeTab, setActiveTab] = useState<"editor" | "files">(
    initialFiles.length > 0 ? "files" : "editor"
  );
  // 新規ドキュメント作成モード（true = 初回保存時にファイル名入力要求）
  const [isNewDoc, setIsNewDoc] = useState(false);
  const [newDocFileName, setNewDocFileName] = useState("");
  const [showNewDocSaveDialog, setShowNewDocSaveDialog] = useState(false);
  const [content, setContent] = useState(props.initialContent || "");

  const [completeness, setCompleteness] = useState(props.initialCompleteness || 0);
  const [files, setFiles] = useState<DocFile[]>(initialFiles);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("edit");
  const [editorLanguage, setEditorLanguage] = useState<"markdown" | "html">("markdown");

  useEffect(() => {
    if (content.trim().startsWith("<!DOCTYPE") || content.trim().startsWith("<html")) {
      setEditorLanguage("html");
    }
  }, []);

  const fetchVersions = async () => {
    const url = isCustom
      ? `/api/projects/${projectId}/custom-docs/${docKey}/versions`
      : `/api/projects/${projectId}/documents/${docKey}/versions`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {}
  };

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

  const viewModeButtons: Array<{ mode: "edit" | "preview" | "split"; icon: React.ReactNode; label: string }> = [
    { mode: "edit", icon: <AlignLeft size={13} />, label: "編集" },
    { mode: "split", icon: <Columns size={13} />, label: "分割" },
    { mode: "preview", icon: <Eye size={13} />, label: "プレビュー" },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ─── ヘッダー（エディタタブのみ表示）─── */}
      {activeTab === "editor" && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {isNewDoc ? (
              <h1 className="text-base font-semibold text-slate-400 italic">新規ドキュメント（未保存）</h1>
            ) : (
              <>
                <h1 className="text-base font-semibold text-navy truncate">{title}</h1>
                <p className="text-xs text-slate-400">v{version}</p>
              </>
            )}
          </div>
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
          <button
            onClick={isNewDoc ? () => setShowNewDocSaveDialog(true) : handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "保存済み" : saving ? "保存中..." : "保存"}
          </button>
        </div>
      )}

      {/* ─── タブ ─── */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-0">
        {/* エディタタブ：ファイルがない場合 or 既にエディタ表示中のみ表示 */}
        {(files.length === 0 || activeTab === "editor") && (
          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === "editor"
                ? "border-blue-600 text-blue-600 font-medium"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <FileText size={14} />
            ✏️ エディタ
          </button>
        )}
        <button
          onClick={() => setActiveTab("files")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
            activeTab === "files"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Folder size={14} />
          📁 ファイル
          {files.length > 0 && (
            <span className="ml-1 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
              {files.length}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {/* ファイルタブ表示中：新規ドキュメント作成ボタン */}
        {activeTab === "files" && (
          <button
            onClick={() => { setContent(""); setIsNewDoc(true); setNewDocFileName(""); setActiveTab("editor"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors mr-1"
          >
            <FileText size={13} />
            新規ドキュメント作成
          </button>
        )}

        {activeTab === "editor" && (
          <div className="flex items-center gap-1">
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
{/* 新規ドキュメント保存ダイアログ */}
      {showNewDocSaveDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-[420px]">
            <h3 className="text-sm font-semibold text-navy mb-1 flex items-center gap-2">
              <Save size={15} /> 新規ドキュメントを保存
            </h3>
            <p className="text-xs text-slate-500 mb-4">保存するファイル名を入力してください（拡張子 .md を付けてください）。</p>
            <input
              type="text"
              value={newDocFileName}
              onChange={(e) => setNewDocFileName(e.target.value)}
              placeholder="例: new_document.md"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-blue-400"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewDocSaveDialog(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                disabled={!newDocFileName.trim() || saving}
                onClick={async () => {
                  setShowNewDocSaveDialog(false);
                  setSaving(true);
                  // ファイルとしてアップロード
                  const uploadUrl = isCustom
                    ? `/api/projects/${projectId}/custom-docs/${docKey}/upload`
                    : `/api/projects/${projectId}/documents/${docKey}/upload`;
                  try {
                    const blob = new Blob([content], { type: "text/markdown" });
                    const formData = new FormData();
                    formData.append("file", blob, newDocFileName.trim().endsWith(".md") ? newDocFileName.trim() : newDocFileName.trim() + ".md");
                    const res = await fetch(uploadUrl, { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.files) {
                      setFiles((prev) => [...prev, ...data.files]);
                      setIsNewDoc(false);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2500);
                      setActiveTab("files");
                    }
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentEditor;