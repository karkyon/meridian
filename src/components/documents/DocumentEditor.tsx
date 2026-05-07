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
type FileType = "md" | "markdown" | "docx" | "doc" | "word" | "pdf" | "html" | "htm";

type DocFile = {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  isEditable: boolean;
  createdAt: string;
  completeness: number;
  version: number;
};

interface DocumentEditorProps {
  projectId: string;
  projectName: string;
  docType: string;
  initialContent: string;
  initialVersion?: number;
  version?: number;
  initialCompleteness: number;
  initialFiles?: DocFile[];
  role?: string;
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
function formatSize(bytes: number) {
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
  const ft = (fileType ?? "").toLowerCase().replace(/^\./, "");
  const labels: Record<string, string> = {
    md: "MARKDOWN", docx: "WORD", doc: "WORD", pdf: "PDF", html: "HTML", htm: "HTML",
  };
  return labels[ft] ?? ft.toUpperCase();
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

// ============================================================
// ファイル個別 完成度・バージョン編集
// ============================================================
function FileMetaEditor({
  file, projectId, docKey, isCustom, onUpdate,
}: {
  file: DocFile;
  projectId: string;
  docKey: string;
  isCustom: boolean;
  onUpdate: (updated: Partial<DocFile> & { id: string }) => void;
}) {
  const [completeness, setCompleteness] = useState(file.completeness);
  const [version, setVersion] = useState(file.version);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const patchUrl = isCustom
    ? `/api/projects/${projectId}/custom-docs/${docKey}/files/${file.id}`
    : `/api/projects/${projectId}/documents/${docKey}/files/${file.id}`;

  async function handleSave() {
    setSaving(true);
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completeness, version }),
    });
    onUpdate({ id: file.id, completeness, version });
    setDirty(false);
    setSaving(false);
  }

  const barColor =
    completeness >= 80 ? "bg-emerald-500" :
    completeness >= 50 ? "bg-[#1D6FA4]" :
    completeness >= 20 ? "bg-amber-400" : "bg-slate-200";

  return (
    <div className="flex items-center gap-3 px-1 pb-0.5">
      {/* 完成度スライダー */}
      <div className="flex items-center gap-2 flex-1">
        <span className="text-[11px] text-slate-400 whitespace-nowrap">完成度</span>
        <input
          type="range" min={0} max={100} step={5}
          value={completeness}
          onChange={(e) => { setCompleteness(Number(e.target.value)); setDirty(true); }}
          className="flex-1 h-1"
        />
        <span className={`text-[11px] font-medium w-8 text-right ${
          completeness >= 80 ? "text-emerald-500" :
          completeness >= 50 ? "text-[#1D6FA4]" :
          completeness >= 20 ? "text-amber-400" : "text-slate-400"
        }`}>{completeness}%</span>
      </div>
      {/* バージョン */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-slate-400">v</span>
        <input
          type="number" min={1} max={99}
          value={version}
          onChange={(e) => { setVersion(Number(e.target.value)); setDirty(true); }}
          className="w-10 text-[11px] border border-slate-200 rounded px-1 py-0.5 text-center focus:border-[#1D6FA4] focus:outline-none"
        />
      </div>
      {/* 保存ボタン */}
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] px-2 py-0.5 bg-[#1D6FA4] text-white rounded hover:bg-[#1a5f8e] disabled:opacity-50"
        >
          {saving ? "…" : "保存"}
        </button>
      )}
    </div>
  );
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

    // ── blockquote（> テキスト）連続行をまとめる ──
    if (/^>/.test(trimmed)) {
      closeLists();
      const bqLines: string[] = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        bqLines.push(inlineMd(lines[i].trim().replace(/^>{1,}\s*/, "")));
        i++;
      }
      i--; // ループのi++と合わせる
      out.push(`<blockquote>${bqLines.join("<br>")}</blockquote>`);
      continue;
    }

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
  const [floatMenu, setFloatMenu] = useState<{ x: number; y: number } | null>(null);

  const handleSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (s === e) { setFloatMenu(null); return; }
    // テキストエリア内の選択位置をDOMのselectionから取得
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setFloatMenu(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = ta.closest(".flex-col")?.getBoundingClientRect() ?? ta.getBoundingClientRect();
    setFloatMenu({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 44,
    });
  };

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
    <div className="flex flex-col h-full relative">
      {/* フローティングツールバー */}
      {floatMenu && language === "markdown" && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-[#1A3A5C] rounded-lg shadow-xl px-1.5 py-1 pointer-events-auto"
          style={{ left: floatMenu.x, top: floatMenu.y, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {[
            { label: "B", action: () => insertWrap("**"), title: "太字" },
            { label: "I", action: () => insertWrap("*"), title: "斜体" },
            { label: "H1", action: () => insertLine("# "), title: "見出し1" },
            { label: "H2", action: () => insertLine("## "), title: "見出し2" },
            { label: "—", action: () => insertLine("> "), title: "引用" },
            { label: "</>", action: () => insertWrap("`"), title: "コード" },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              title={btn.title}
              className="px-2 py-0.5 text-xs text-white hover:bg-white/20 rounded transition-colors font-medium"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
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
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => setTimeout(() => setFloatMenu(null), 150)}
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
      {/* トップバー */}
      <div className="word-preview-topbar">
        <span className="word-preview-topbar-title">{fileName ?? "Word Document"}</span>
        <span className="word-preview-topbar-badge">DOCX</span>
        <span className="ml-auto text-[10px] text-slate-400 bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded">
          Word文書（読み取り専用）
        </span>
      </div>
      {/* A4ページ風 */}
      <div className="word-preview-page-wrap">
        <div className="word-preview-page">
          {isHtml ? (
            <div className="word-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
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
  const router = useRouter();
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editContent, setEditContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"preview" | "edit" | "split">("preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // 既存ファイル編集の未保存離脱確認
  const [showFileDirtyDialog, setShowFileDirtyDialog] = useState(false);
  const [filePendingHref, setFilePendingHref] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState(false);

  // ブラウザ閉じ・リロード離脱確認
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "編集中のファイルが保存されていません。ページを離れますか？";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // サイドバー・ヘッダーリンクの離脱確認
  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      setFilePendingHref(href);
      setShowFileDirtyDialog(true);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

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

  const ft = (file.fileType ?? "").toLowerCase().replace(/^\./, "") as FileType;
  const isMd = ft === "md" || ft === "markdown";
  const isDocx = ft === "docx" || ft === "doc" || ft === "word";
  const isPdf = ft === "pdf";
  const isHtmlFile = ft === "html" || ft === "htm";
  const canEdit = isMd || isHtmlFile;
  const editorLang: "markdown" | "html" = isMd ? "markdown" : "html";

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ヘッダー */}
      <div className="file-preview-header">
        <button
          onClick={() => {
            if (isDirty) {
              setPendingClose(true);
              setShowFileDirtyDialog(true);
            } else {
              onClose();
            }
          }}
          className="file-preview-back-btn"
        >
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
{isDocx && (
            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 font-medium mr-2">
              📄 Word文書（読み取り専用）
            </span>
          )}
          {isPdf && (
            <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-medium mr-2">
              🔴 PDF（読み取り専用）
            </span>
          )}
          {canEdit && (
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
          />
        ) : isDocx ? (
          // mammoth変換済みHTMLをWordViewerで表示
          <WordViewer content={previewContent ?? ""} fileName={file.originalName} />
        ) : isPdf ? (
          // PDFはiframeで表示（CSP問題のためobjectタグを使用）
          <div className="flex flex-col h-full bg-white">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs text-slate-500">🔴 PDFプレビュー</span>
              <a href={baseUrl} download={file.originalName} className="ml-auto text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 flex items-center gap-1">
                <Download size={12} /> PDFをダウンロード
              </a>
            </div>
            <div className="flex-1 overflow-y-auto p-6 text-center">
              <p className="text-sm text-slate-500 mb-4">PDFのインライン表示はブラウザのセキュリティ制限により表示できない場合があります。</p>
              <a href={baseUrl} download={file.originalName} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 text-sm">
                <Download size={14} /> PDFをダウンロードして確認
              </a>
            </div>
          </div>
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

      {/* 既存ファイル編集：未保存離脱確認ダイアログ */}
      {showFileDirtyDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-navy mb-2">
              ⚠️ 未保存の変更があります
            </h3>
            <p className="text-sm text-slate-600 mb-5">
              編集中の内容は保存されていません。<br />
              このまま離れると変更内容が失われます。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowFileDirtyDialog(false);
                  setFilePendingHref(null);
                  setPendingClose(false);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                編集を続ける
              </button>
              <button
                onClick={() => {
                  setShowFileDirtyDialog(false);
                  setFilePendingHref(null);
                  setPendingClose(false);
                  setShowSaveDialog(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                保存する
              </button>
              <button
                onClick={() => {
                  setShowFileDirtyDialog(false);
                  setIsDirty(false);
                  if (filePendingHref) {
                    router.push(filePendingHref);
                    setFilePendingHref(null);
                  } else if (pendingClose) {
                    setPendingClose(false);
                    onClose();
                  }
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                破棄して離れる
              </button>
            </div>
          </div>
        </div>
      )}

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
  role?: string;
}

function FileTab({ projectId, docKey, isCustom, files, onFilesChange, role }: FileTabProps) {
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
    // 複数ファイル対応：1ファイルずつPOST（APIが単数返しのため）
    const newFiles: DocFile[] = [];
    try {
      for (const f of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", f);
        const res = await fetch(uploadUrl, { method: "POST", body: formData });
        const data = await res.json();
        // APIレスポンスは { file: {...} } 単数形
        if (data.file) {
          newFiles.push({
            id: data.file.id,
            originalName: data.file.originalName,
            fileType: data.file.fileType,
            fileSize: data.file.fileSize,
            isEditable: data.file.isEditable,
            createdAt: data.file.createdAt,
            completeness: data.file.completeness ?? 0,
            version: data.file.version ?? 1,
          });
        } else if (data.files) {
          // 複数返しにも対応（後方互換）
          newFiles.push(...data.files);
        }
      }
      if (newFiles.length > 0) onFilesChange([...files, ...newFiles]);
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
            <div key={file.id} className="file-list-row flex-col items-stretch gap-2 cursor-default">
              {/* 上段：ファイル名・バッジ・削除 */}
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveFile(file)}>
                <span className="file-type-badge">{getFileLabel(file.fileType)}</span>
                <span className="flex-1 text-sm text-slate-700 truncate">{file.originalName}</span>
                <span className="text-xs text-slate-400">{formatSize(file.fileSize)}</span>
                <span className="text-xs text-slate-400">{new Date(file.createdAt).toLocaleDateString("ja-JP")}</span>
                <button onClick={(e) => handleDelete(file.id, e)} className="text-slate-300 hover:text-red-400 transition-colors ml-1">✕</button>
              </div>
              {/* 下段：完成度・バージョン編集（Admin のみ） */}
              {role === "admin" && (
                <FileMetaEditor
                  file={file}
                  projectId={projectId}
                  docKey={docKey}
                  isCustom={isCustom}
                  onUpdate={(updated) => onFilesChange(files.map((f: any) => f.id === updated.id ? { ...f, ...updated } : f))}
                />
              )}
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
  // 常にファイルタブをデフォルトに（0件でもエディタに飛ばない）
  const [activeTab, setActiveTab] = useState<"editor" | "files">("files");
  
  // 新規ドキュメント作成モード（true = 初回保存時にファイル名入力要求）
  const [isNewDoc, setIsNewDoc] = useState(false);
  const [newDocFileName, setNewDocFileName] = useState("");
  const [savedNewDocName, setSavedNewDocName] = useState<string | null>(null);
  const [showNewDocSaveDialog, setShowNewDocSaveDialog] = useState(false);
  const [content, setContent] = useState(props.initialContent || "");
  // 新規作成時の未保存フラグ（1文字でも入力したらtrue）
  const [isNewDocDirty, setIsNewDocDirty] = useState(false);
  // 未保存離脱確認ダイアログ
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // 離脱先URLを一時保存（確認後に遷移するため）
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // ブラウザ閉じ・リロード・URLバー直接入力の離脱確認
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isNewDoc && isNewDocDirty) {
        e.preventDefault();
        e.returnValue = "編集中のドキュメントが保存されていません。ページを離れますか？";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isNewDoc, isNewDocDirty]);

  // Next.js クライアントサイドナビゲーション（リンク・サイドバー等）の離脱確認
  useEffect(() => {
    if (!isNewDoc || !isNewDocDirty) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      // 同一ページ内アンカーは除外
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
      setShowUnsavedDialog(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isNewDoc, isNewDocDirty]);

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
      {/* ─── ヘッダー（新規ドキュメント作成モード時のみ表示）─── */}
      {activeTab === "editor" && isNewDoc && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {isNewDoc ? (
              <h1 className="text-base font-semibold text-slate-400 italic">新規ドキュメント（未保存）</h1>
            ) : savedNewDocName ? (
              <>
                <h1 className="text-base font-semibold text-navy truncate">{savedNewDocName}</h1>
                <p className="text-xs text-slate-400">保存済み</p>
              </>
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
        {/* エディタタブ：新規作成モード時のみ表示 */}
        {activeTab === "editor" && (
          <button
            onClick={() => setActiveTab("editor")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 border-blue-600 text-blue-600 font-medium"
          >
            <FileText size={14} />
            ✏️ 新規ドキュメント
          </button>
        )}
        <button
          onClick={() => {
            if (isNewDoc && isNewDocDirty) {
              setShowUnsavedDialog(true);
            } else {
              setActiveTab("files");
            }
          }}
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
        {activeTab === "editor" && isNewDoc ? (
          <TextEditor
            value={content}
            onChange={(v) => { setContent(v); if (v.trim().length > 0) setIsNewDocDirty(true); }}
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
          role={props.role}
        />
        )}
      </div>
      {/* 未保存離脱確認ダイアログ */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-[400px]">
            <h3 className="text-sm font-semibold text-navy mb-2 flex items-center gap-2">
              ⚠️ 未保存のドキュメントがあります
            </h3>
            <p className="text-sm text-slate-600 mb-5">
              編集中のドキュメントは保存されていません。<br />
              このまま離れると内容が失われます。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowUnsavedDialog(false);
                  setPendingHref(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                編集を続ける
              </button>
              <button
                onClick={() => {
                  setShowUnsavedDialog(false);
                  setPendingHref(null);
                  setShowNewDocSaveDialog(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                保存する
              </button>
              <button
                onClick={() => {
                  setShowUnsavedDialog(false);
                  setIsNewDoc(false);
                  setIsNewDocDirty(false);
                  setContent("");
                  if (pendingHref) {
                    // 外部リンク（サイドバー等）への遷移
                    router.push(pendingHref);
                    setPendingHref(null);
                  } else {
                    // ファイルタブへの切り替え
                    setActiveTab("files");
                  }
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                破棄して離れる
              </button>
            </div>
          </div>
        </div>
      )}

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
                    // APIは { file: {...} } 単数形で返す
                    const newFile = data.file ?? (data.files?.[0]);
                    if (newFile) {
                      setFiles((prev) => [...prev, {
                        id: newFile.id,
                        originalName: newFile.originalName,
                        fileType: newFile.fileType,
                        fileSize: newFile.fileSize,
                        isEditable: newFile.isEditable,
                        createdAt: newFile.createdAt,
                        completeness: newFile.completeness ?? 0,
                        version: newFile.version ?? 1,
                      }]);
                      setIsNewDoc(false);
                      setIsNewDocDirty(false);
                      const savedName = newDocFileName.trim().endsWith(".md") ? newDocFileName.trim() : newDocFileName.trim() + ".md";
                      setSavedNewDocName(savedName);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2500);
                      setShowNewDocSaveDialog(false);
                      // ファイルタブに戻らずエディタタブのままヘッダーを更新
                      // setActiveTab("files") を削除
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