"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Download, Trash2, ChevronLeft, RefreshCw,
  Save, Check, AlignLeft, Columns, Eye, X,
} from "lucide-react";

// ============================================================
// 定数
// ============================================================
const FILE_TYPE_CONFIG = {
  word:     { label: "Word",     icon: "📄", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  pdf:      { label: "PDF",      icon: "📕", cls: "bg-red-50 text-red-700 border-red-200" },
  markdown: { label: "Markdown", icon: "📝", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  html:     { label: "HTML",     icon: "🌐", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  other:    { label: "その他",   icon: "📎", cls: "bg-slate-50 text-slate-600 border-slate-200" },
} as const;

// ============================================================
// 型定義
// ============================================================
type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  description: string | null;
  usedForGeneration: boolean;
  createdAt: string;
  uploader: { name: string } | null;
};

// ============================================================
// ユーティリティ
// ============================================================
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getExt(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function classifyFile(att: Attachment) {
  const ext = getExt(att.originalName);
  const isMd    = ext === "md" || ext === "markdown";
  const isHtml  = ext === "html" || ext === "htm";
  const isDocx  = ext === "docx" || ext === "doc" || att.fileType === "word";
  const isPdf   = ext === "pdf"  || att.fileType === "pdf";
  const canEdit = isMd || isHtml;
  const editorLang: "markdown" | "html" = isHtml ? "html" : "markdown";
  return { isMd, isHtml, isDocx, isPdf, canEdit, editorLang };
}

// ============================================================
// Markdown → HTML 変換（DocumentEditor と同一実装）
// ============================================================
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/~~(.+?)~~/g, "<s>$1</s>");
  t = t.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t;
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false, fenceLang = "", fenceLines: string[] = [];
  let inTable = false, inOl = false, inUl = false;

  const isSep       = (l: string) => /^\|( *:?-+:? *\|)+ *$/.test(l.trim());
  const isTableRow  = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|") && l.split("|").length >= 3;
  const closeLists  = () => { if (inOl) { out.push("</ol>"); inOl = false; } if (inUl) { out.push("</ul>"); inUl = false; } };
  const closeTable  = () => { if (inTable) { out.push("</tbody></table></div>"); inTable = false; } };
  const closeFence  = () => {
    if (inFence) {
      out.push(`<pre class="code-block" data-lang="${fenceLang}"><code>${escapeHtml(fenceLines.join("\n").trimEnd())}</code></pre>`);
      inFence = false; fenceLang = ""; fenceLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      if (!inFence) { closeLists(); closeTable(); inFence = true; fenceLang = trimmed.replace(/^```/, "").trim(); fenceLines = []; }
      else closeFence();
      continue;
    }
    if (inFence) { fenceLines.push(line); continue; }
    if (isSep(trimmed)) continue;

    if (isTableRow(trimmed)) {
      closeLists();
      const cells = trimmed.slice(1, -1).split("|").map(c => c.trim());
      if (!inTable) {
        const next = (lines[i + 1] ?? "").trim();
        if (isSep(next)) {
          out.push('<div class="table-wrapper"><table>');
          out.push(`<thead><tr>${cells.map(c => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead><tbody>`);
          i++; inTable = true; continue;
        } else {
          out.push('<div class="table-wrapper"><table><tbody>');
          inTable = true;
        }
      }
      out.push(`<tr>${cells.map(c => `<td>${inlineMd(c)}</td>`).join("")}</tr>`);
      continue;
    }

    if (trimmed === "") { if (!inTable) { closeLists(); out.push(""); } continue; }
    closeTable();

    if (/^>/.test(trimmed)) {
      closeLists();
      const bqLines: string[] = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        bqLines.push(inlineMd(lines[i].trim().replace(/^>{1,}\s*/, ""))); i++;
      }
      i--;
      out.push(`<blockquote>${bqLines.join("<br>")}</blockquote>`);
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) { closeLists(); out.push("<hr>"); continue; }

    const hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hm) { closeLists(); out.push(`<h${hm[1].length}>${inlineMd(hm[2])}</h${hm[1].length}>`); continue; }

    const olm = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olm) { if (inUl) { out.push("</ul>"); inUl = false; } if (!inOl) { out.push(`<ol start="${olm[1]}">`); inOl = true; } out.push(`<li value="${olm[1]}">${inlineMd(olm[2])}</li>`); continue; }

    const ckx = trimmed.match(/^[-*]\s+\[x\]\s+(.+)$/i);
    const cko = trimmed.match(/^[-*]\s+\[\s\]\s+(.+)$/);
    if (ckx) { if (inOl) { out.push("</ol>"); inOl = false; } if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li class="ck checked"><span class="cb checked">✓</span>${inlineMd(ckx[1])}</li>`); continue; }
    if (cko) { if (inOl) { out.push("</ol>"); inOl = false; } if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li class="ck"><span class="cb">○</span>${inlineMd(cko[1])}</li>`); continue; }

    const ulm = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulm) { if (inOl) { out.push("</ol>"); inOl = false; } if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li>${inlineMd(ulm[1])}</li>`); continue; }

    closeLists();
    const p = inlineMd(trimmed);
    if (p.trim() !== "") out.push(`<p>${p}</p>`);
  }
  closeLists(); closeTable(); closeFence();
  return out.join("\n");
}

// ============================================================
// MarkdownPreview
// ============================================================
function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="md-preview-wrap h-full flex flex-col">
      <div className="md-preview-page overflow-y-auto flex-1 min-h-0">
        <div className="md-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(mdToHtml(content)) }} />
      </div>
    </div>
  );
}

// ============================================================
// HtmlPreview（iframe）
// ============================================================
function HtmlPreview({ code }: { code: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    const isFullDoc = /<!DOCTYPE|<html/i.test(code);
    const content = isFullDoc ? code : `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:1.5rem;}</style></head><body>${code}</body></html>`;
    doc.open(); doc.write(content); doc.close();
  }, [code]);
  return <iframe ref={iframeRef} className="w-full flex-1 min-h-0 border-0 bg-white" style={{height:"100%"}} sandbox="allow-scripts allow-same-origin" title="HTML Preview" />;
}

// ============================================================
// enhanceWordHtml（mammoth の td-only テーブルにヘッダークラスを付与）
// ============================================================
function enhanceWordHtml(html: string): string {
  return html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (_, attrs, body) => {
    const firstTrMatch = body.match(/(<tr(?:\s[^>]*)?>)([\s\S]*?)(<\/tr>)/i);
    if (!firstTrMatch) return `<table${attrs}>${body}</table>`;
    const [fullFirstTr, trOpen, trContent, trClose] = firstTrMatch;
    const tdMatches = trContent.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tdMatches.length === 0) return `<table${attrs}>${body}</table>`;
    const allHaveBold = tdMatches.every((td: string) => /<strong[\s>]/i.test(td) || /<b[\s>]/i.test(td));
    if (!allHaveBold) return `<table${attrs}>${body}</table>`;
    const headerTrOpen = trOpen.replace(/^<tr/i, '<tr class="word-header-row"');
    return `<table${attrs}>${body.replace(fullFirstTr, `${headerTrOpen}${trContent}${trClose}`)}</table>`;
  });
}

// ============================================================
// WordViewer
// ============================================================
function WordViewer({ content, fileName }: { content: string; fileName?: string }) {
  const processed = enhanceWordHtml(sanitizeHtml(content));
  return (
    <div className="word-preview-wrap h-full">
      <div className="word-preview-topbar">
        <span className="word-preview-topbar-title">{fileName ?? "Word Document"}</span>
        <span className="word-preview-topbar-badge">DOCX</span>
        <span className="ml-auto text-[10px] bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded">
          読み取り専用
        </span>
      </div>
      <div className="word-preview-page-wrap">
        <div className="word-preview-page">
          <div className="word-preview" dangerouslySetInnerHTML={{ __html: processed }} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TextEditor（MD / HTML 編集・分割・プレビュー）
// ============================================================
function TextEditor({
  value, onChange, language, viewMode,
}: {
  value: string;
  onChange: (v: string) => void;
  language: "markdown" | "html";
  viewMode: "edit" | "preview" | "split";
}) {
  const showEditor  = viewMode === "edit"    || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";
  return (
    <div className={`flex flex-1 min-h-0 ${viewMode === "split" ? "divide-x divide-slate-200" : ""}`}>
      {showEditor && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-h-0 resize-none p-4 font-mono text-sm text-slate-700 bg-white outline-none leading-relaxed"
          spellCheck={false}
          placeholder={language === "markdown" ? "# タイトル\n\n本文を入力..." : "<!-- HTML を入力 -->"}
        />
      )}
      {showPreview && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {language === "markdown" ? <MarkdownPreview content={value} /> : <HtmlPreview code={value} />}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AttachmentViewer — ファイル閲覧・編集ビューア（フルスクリーン）
// ============================================================
function AttachmentViewer({
  projectId, attachment, isAdmin, onClose,
}: {
  projectId: string;
  attachment: Attachment;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const baseUrl = `/api/projects/${projectId}/attachments/${attachment.id}`;
  const { isMd, isHtml, isDocx, isPdf, canEdit, editorLang } = classifyFile(attachment);

  const [loading, setLoading]       = useState(true);
  const [rawContent, setRawContent] = useState<string | null>(null);   // 編集用（MD/HTML）
  const [wordHtml, setWordHtml]     = useState<string | null>(null);   // Word 変換済みHTML
  const [pdfText, setPdfText]       = useState<string | null>(null);   // PDF 抽出テキスト
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [viewMode, setViewMode]     = useState<"edit" | "preview" | "split">("edit");

  // コンテンツ取得
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${baseUrl}?action=preview`);
        if (!res.ok) { setLoading(false); return; }
        const ct = res.headers.get("content-type") ?? "";
        const text = await res.text();
        if (isDocx) {
          setWordHtml(text);
        } else if (isPdf) {
          setPdfText(text);
        } else {
          // MD / HTML
          setRawContent(text);
          setEditContent(text);
        }
      } catch {
        // フォールバック：何も表示しない
      } finally {
        setLoading(false);
      }
    })();
  }, [baseUrl, isDocx, isPdf]);

  // 保存（MD/HTML のみ）— ファイルを上書き再アップロード
  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const blob = new Blob(
        [editContent],
        { type: isMd ? "text/markdown" : "text/html" }
      );
      const form = new FormData();
      form.append("file", blob, attachment.originalName);

      // 既存削除 → 再アップロード
      await fetch(baseUrl, { method: "DELETE" });
      const res = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: form });
      if (res.ok) {
        setRawContent(editContent);
        setIsDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  // キーボードショートカット（Cmd/Ctrl+S）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canEdit && isAdmin && isDirty) handleSave();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, canEdit, isAdmin]);

  const typeCfg = FILE_TYPE_CONFIG[attachment.fileType as keyof typeof FILE_TYPE_CONFIG] ?? FILE_TYPE_CONFIG.other;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-50">

      {/* ─── ヘッダー ─── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">

        {/* 戻るボタン */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <ChevronLeft size={15} />
          戻る
        </button>

        {/* ファイルアイコン + 名前 */}
        <span className="text-lg ml-1">{typeCfg.icon}</span>
        <span className="text-sm font-semibold text-[#1A3A5C] truncate flex-1 min-w-0">
          {attachment.originalName}
        </span>
        {isDirty && <span className="text-xs text-amber-500 font-medium shrink-0">● 未保存</span>}

        {/* 右側コントロール */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Word / PDF 注記バッジ */}
          {isDocx && (
            <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-medium">
              📄 Word（読み取り専用）
            </span>
          )}
          {isPdf && (
            <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 font-medium">
              🔴 PDF（読み取り専用）
            </span>
          )}

          {/* MD/HTML 編集コントロール（Adminのみ） */}
          {canEdit && isAdmin && (
            <>
              {/* 言語バッジ */}
              <span className="text-xs px-2 py-1 rounded bg-slate-200 text-[#1A3A5C] font-medium">
                {editorLang === "markdown" ? "MD" : "HTML"}
              </span>

              {/* ビューモード切替 */}
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {(["edit", "split", "preview"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                      viewMode === mode
                        ? "bg-white text-[#1A3A5C] font-medium shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    title={mode === "edit" ? "編集" : mode === "split" ? "分割" : "プレビュー"}
                  >
                    {mode === "edit"    && <><AlignLeft size={12} /><span className="hidden sm:inline"> 編集</span></>}
                    {mode === "split"   && <><Columns   size={12} /><span className="hidden sm:inline"> 分割</span></>}
                    {mode === "preview" && <><Eye       size={12} /><span className="hidden sm:inline"> プレビュー</span></>}
                  </button>
                ))}
              </div>

              {/* 保存ボタン */}
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  saved
                    ? "bg-emerald-500 text-white"
                    : isDirty
                    ? "bg-[#1D6FA4] text-white hover:bg-[#1A5E8A]"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
                title="保存 (Cmd/Ctrl+S)"
              >
                {saved
                  ? <><Check size={12} /> 保存済み</>
                  : saving
                  ? "保存中..."
                  : <><Save size={12} /> 保存</>
                }
              </button>
            </>
          )}

          {/* MD/HTML Viewer（Viewerロール）*/}
          {canEdit && !isAdmin && (
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {(["preview"] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white text-[#1A3A5C] font-medium shadow-sm">
                  <Eye size={12} /> プレビュー
                </button>
              ))}
            </div>
          )}

          {/* ダウンロードボタン（常時表示）*/}
          <a
            href={baseUrl}
            download={attachment.originalName}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors"
            title="ダウンロード"
          >
            <Download size={14} />
            <span className="hidden sm:inline">ダウンロード</span>
          </a>
        </div>
      </div>

      {/* ─── コンテンツエリア ─── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* ローディング */}
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-slate-400">
            <RefreshCw size={20} className="animate-spin text-[#1D6FA4]" />
            <span className="text-sm">読み込み中...</span>
          </div>
        )}

        {/* MD / HTML — 編集/プレビュー/分割 */}
        {!loading && canEdit && rawContent !== null && (
          isAdmin ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <TextEditor
                value={editContent}
                onChange={v => { setEditContent(v); setIsDirty(v !== rawContent); }}
                language={editorLang}
                viewMode={viewMode}
              />
            </div>
          ) : (
            // Viewer：プレビューのみ
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {editorLang === "markdown"
                ? <MarkdownPreview content={rawContent} />
                : <HtmlPreview code={rawContent} />}
            </div>
          )
        )}

        {/* Word — WordViewer */}
        {!loading && isDocx && wordHtml !== null && (
          <WordViewer content={wordHtml} fileName={attachment.originalName} />
        )}

        {/* PDF — 抽出テキスト表示 + ダウンロード */}
        {!loading && isPdf && (
          <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
            <span className="text-5xl">📕</span>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed">
              PDFのインライン表示はブラウザのセキュリティ制限により直接表示できません。<br />
              下のボタンからダウンロードしてご確認ください。
            </p>
            {pdfText && pdfText.trim() !== "" && pdfText !== "（テキスト抽出データがありません）" && (
              <details className="w-full max-w-2xl text-left">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                  抽出テキストを表示（AI参照用）
                </summary>
                <pre className="mt-2 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 overflow-y-auto max-h-72 whitespace-pre-wrap leading-relaxed">
                  {pdfText}
                </pre>
              </details>
            )}
            <a
              href={baseUrl}
              download={attachment.originalName}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <Download size={15} /> PDFをダウンロード
            </a>
          </div>
        )}

        {/* フォールバック：読み込み失敗 */}
        {!loading && !canEdit && !isDocx && !isPdf && rawContent === null && wordHtml === null && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span className="text-5xl">📎</span>
            <p className="text-sm text-slate-400">プレビューを表示できません</p>
            <a
              href={baseUrl}
              download={attachment.originalName}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D6FA4] text-white text-sm hover:bg-[#1A5E8A]"
            >
              <Download size={14} /> ダウンロード
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AttachmentsManager — メインコンポーネント
// ============================================================
export default function AttachmentsManager({
  projectId,
  initialAttachments,
  role,
  docType,
}: {
  projectId: string;
  initialAttachments: Attachment[];
  role: string;
  docType?: string;
}) {
  const isAdmin = role === "admin";
  const [attachments, setAttachments]   = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState(false);
  const [description, setDescription]   = useState("");
  const [viewing, setViewing]           = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── アップロード ──
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    if (description.trim()) form.append("description", description.trim());
    if (docType) form.append("doc_type", docType);

    const res  = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      setAttachments(prev => [data.attachment, ...prev]);
      setDescription("");
    } else {
      setUploadError(
        data.error === "FILE_TOO_LARGE"    ? "ファイルサイズは5MB以下にしてください"
        : data.error === "INVALID_FILE_TYPE" ? "対応ファイル形式: Word / PDF / Markdown / HTML"
        : "アップロードに失敗しました"
      );
    }
    setUploading(false);
  }, [projectId, description, docType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  // ── AI生成フラグ切替 ──
  async function toggleGeneration(id: string, current: boolean) {
    const res = await fetch(`/api/projects/${projectId}/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ used_for_generation: !current }),
    });
    if (res.ok) setAttachments(prev => prev.map(a => a.id === id ? { ...a, usedForGeneration: !current } : a));
  }

  // ── 削除 ──
  async function deleteAttachment(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const res = await fetch(`/api/projects/${projectId}/attachments/${id}`, { method: "DELETE" });
    if (res.ok) setAttachments(prev => prev.filter(a => a.id !== id));
  }

  const generationCount = attachments.filter(a => a.usedForGeneration).length;

  // ── ビューア表示中 ──
  if (viewing) {
    return (
      <AttachmentViewer
        projectId={projectId}
        attachment={viewing}
        isAdmin={isAdmin}
        onClose={() => setViewing(null)}
      />
    );
  }

  // ── 一覧表示 ──
  return (
    <div className="space-y-4">

      {/* AI生成使用バナー */}
      {generationCount > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-violet-500">🤖</span>
          <span className="text-sm text-violet-700">
            <span className="font-semibold">{generationCount}件</span>の資料がAI生成に使用されます
          </span>
          <span className="text-xs text-violet-400 ml-1 hidden sm:inline">
            （AI生成パネルで「添付資料を参照」をオンに）
          </span>
        </div>
      )}

      {/* アップロードエリア（Admin のみ）*/}
      {isAdmin && (
        <div className="space-y-2">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
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
              accept=".docx,.doc,.pdf,.md,.markdown,.html,.htm"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
            />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-[#1D6FA4]">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-sm">アップロード中...</span>
              </div>
            ) : (
              <>
                <div className="text-2xl mb-2">📁</div>
                <p className="text-sm font-medium text-slate-600">クリックまたはドラッグ&ドロップ</p>
                <p className="text-xs text-slate-400 mt-1">Word / PDF / Markdown / HTML — 最大5MB</p>
              </>
            )}
          </div>

          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="説明を追加（任意）"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
          />

          {uploadError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <span>⚠️</span> {uploadError}
            </div>
          )}
        </div>
      )}

      {/* ファイル一覧 */}
      {attachments.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm">添付資料がありません</p>
          {isAdmin && <p className="text-xs mt-1">Word / PDF / Markdown / HTMLをアップロードしてください</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map(att => {
            const typeCfg = FILE_TYPE_CONFIG[att.fileType as keyof typeof FILE_TYPE_CONFIG] ?? FILE_TYPE_CONFIG.other;
            const { canEdit, isDocx, isPdf } = classifyFile(att);
            const actionLabel = canEdit ? (isAdmin ? "編集" : "プレビュー") : (isDocx || isPdf ? "プレビュー" : "ダウンロード");

            return (
              <div
                key={att.id}
                onClick={() => setViewing(att)}
                className="bg-white border border-slate-100 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:border-[#1D6FA4]/40 hover:shadow-sm transition-all group"
              >
                {/* アイコン */}
                <span className="text-2xl shrink-0 mt-0.5">{typeCfg.icon}</span>

                {/* メイン情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#1D6FA4] group-hover:underline truncate max-w-xs">
                      {att.originalName}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeCfg.cls}`}>
                      {typeCfg.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatSize(att.fileSize)}</span>
                  </div>

                  {att.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{att.description}</p>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">
                      {att.uploader?.name ?? "不明"} — {new Date(att.createdAt).toLocaleDateString("ja-JP")}
                    </span>

                    {/* AI生成フラグ（Adminのみクリック可）*/}
                    {isAdmin ? (
                      <button
                        onClick={e => { e.stopPropagation(); toggleGeneration(att.id, att.usedForGeneration); }}
                        className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          att.usedForGeneration
                            ? "bg-violet-100 border-violet-300 text-violet-700"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500"
                        }`}
                      >
                        {att.usedForGeneration ? "🤖 AI生成に使用" : "AI生成に使用しない"}
                      </button>
                    ) : att.usedForGeneration ? (
                      <span className="text-[10px] text-violet-600">🤖 AI生成で参照</span>
                    ) : null}
                  </div>
                </div>

                {/* アクションボタン群 */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  {/* 開く（編集 or プレビュー）*/}
                  <button
                    onClick={() => setViewing(att)}
                    className="text-xs px-2.5 py-1.5 border border-[#1D6FA4]/40 rounded-lg text-[#1D6FA4] hover:bg-[#1D6FA4]/5 transition-colors font-medium"
                  >
                    {actionLabel}
                  </button>

                  {/* ダウンロード */}
                  <a
                    href={`/api/projects/${projectId}/attachments/${att.id}`}
                    download={att.originalName}
                    className="flex items-center justify-center w-8 h-8 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
                    title="ダウンロード"
                  >
                    <Download size={13} />
                  </a>

                  {/* 削除（Admin のみ）*/}
                  {isAdmin && (
                    <button
                      onClick={e => deleteAttachment(att.id, att.originalName, e)}
                      className="flex items-center justify-center w-8 h-8 border border-red-200 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                      title="削除"
                    >
                      <Trash2 size={13} />
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