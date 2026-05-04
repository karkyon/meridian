"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Version = { version: number; createdAt: string; aiGenerated: boolean };

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
  const [saved, setSaved] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: `${docTypeLabel}の内容をここに入力してください...` }),
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent
      ? mdToHtml(initialContent)
      : "",
    editable: isAdmin,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-1",
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaving(true);

    // HTMLをマークダウン風テキストとして保存（シンプル実装）
    const html = editor.getHTML();
    const content = htmlToMd(html);

    const res = await fetch(`/api/projects/${projectId}/documents/${docType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, completeness }),
    });

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
    setSaving(false);
  }, [editor, projectId, docType, completeness, router]);

  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-48px)]">
      {/* パンくずナビ */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
        <a href="/dashboard" className="hover:text-[#1D6FA4]">ダッシュボード</a>
        <span>›</span>
        <a href={`/projects/${projectId}`} className="hover:text-[#1D6FA4]">{projectName ?? "プロジェクト"}</a>
        <span>›</span>
        <span className="text-slate-700 font-medium">{docTypeLabel}</span>
      </div>
      {/* ツールバー */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-1 flex-wrap">
        {isAdmin && (
          <>
            {/* テキスト書式ボタン群 */}
            {[
              { label: "B", action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") },
              { label: "I", action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") },
              { label: "S", action: () => editor?.chain().focus().toggleStrike().run(), active: editor?.isActive("strike") },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.action}
                className={`w-7 h-7 text-xs font-bold rounded transition-colors ${btn.active ? "bg-[#1D6FA4] text-white" : "hover:bg-slate-100 text-slate-600"}`}>
                {btn.label}
              </button>
            ))}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            {/* 見出し */}
            {[1, 2, 3].map((level) => (
              <button key={level}
                onClick={() => editor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
                className={`px-2 h-7 text-xs rounded transition-colors ${editor?.isActive("heading", { level }) ? "bg-[#1D6FA4] text-white" : "hover:bg-slate-100 text-slate-600"}`}>
                H{level}
              </button>
            ))}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`px-2 h-7 text-xs rounded transition-colors ${editor?.isActive("bulletList") ? "bg-[#1D6FA4] text-white" : "hover:bg-slate-100 text-slate-600"}`}>
              • リスト
            </button>
            <button onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`px-2 h-7 text-xs rounded transition-colors ${editor?.isActive("orderedList") ? "bg-[#1D6FA4] text-white" : "hover:bg-slate-100 text-slate-600"}`}>
              1. リスト
            </button>
            <button onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              className={`px-2 h-7 text-xs rounded transition-colors font-mono ${editor?.isActive("codeBlock") ? "bg-[#1D6FA4] text-white" : "hover:bg-slate-100 text-slate-600"}`}>
              {"</>"}
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* バージョン表示 */}
        <button onClick={() => setShowVersions(!showVersions)}
          className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-50">
          v{version} {aiGenerated && "🤖"}
          {versions.length > 0 && ` (${versions.length}件の履歴)`}
        </button>

        {/* 完成度スライダー */}
        {isAdmin && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-slate-400">完成度</span>
            <input type="range" min="0" max="100" step="10" value={completeness}
              onChange={(e) => setCompleteness(parseInt(e.target.value))}
              className="w-20 h-1.5 accent-[#1D6FA4]" />
            <span className="text-xs font-medium text-[#1D6FA4] w-8">{completeness}%</span>
          </div>
        )}

        {/* 保存ボタン */}
        {isAdmin && (
          <button onClick={handleSave} disabled={saving}
            className={`text-xs px-4 py-1.5 rounded-lg font-semibold transition-colors ml-2 ${
              saved ? "bg-emerald-500 text-white" : "bg-[#1A3A5C] text-white hover:bg-[#2A527A]"
            } disabled:opacity-60`}>
            {saved ? "✓ 保存済み" : saving ? "保存中..." : "保存"}
          </button>
        )}
      </div>

      {/* バージョン履歴 */}
      {showVersions && versions.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex gap-2 flex-wrap">
          {versions.map((v) => (
            <span key={v.version} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-500">
              v{v.version} — {new Date(v.createdAt).toLocaleDateString("ja-JP")}
              {v.aiGenerated && " 🤖"}
            </span>
          ))}
        </div>
      )}

      {/* エディタ本体 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {!isAdmin && (
            <div className="mb-4 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-xs text-violet-600">
              閲覧モード — 編集はAdminのみ可能です
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* フッター */}
      <div className="border-t border-slate-100 bg-white px-4 py-2 flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {editor?.storage.characterCount?.characters?.() ?? 0} 文字
        </span>
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#1D6FA4] rounded-full transition-all" style={{ width: `${completeness}%` }} />
        </div>
        <span className="text-xs text-slate-400">{completeness}%</span>
      </div>
    </main>
  );
}

// 簡易HTML→Markdown変換
function htmlToMd(html: string): string {
  return html
    .replace(/<h1>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<p>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

// 簡易Markdown→HTML変換
function mdToHtml(md: string): string {
  if (!md.trim()) return "";
  const lines = md.split("\n");
  const htmlLines = lines.map((line) => {
    if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
    if (line.trim() === "") return "<p></p>";
    let l = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>");
    return `<p>${l}</p>`;
  });
  return htmlLines.join("\n");
}
