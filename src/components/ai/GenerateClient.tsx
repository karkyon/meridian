"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DOC_TYPES = [
  { key: "planning", label: "企画書" },
  { key: "requirements", label: "要件定義書" },
  { key: "external_spec", label: "外部仕様設計書" },
  { key: "db_spec", label: "DB仕様設計書" },
  { key: "api_spec", label: "API詳細設計書" },
] as const;

type DocState = {
  status: "idle" | "generating" | "done" | "error";
  content: string;
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  techStack: unknown;
  documents: Array<{ docType: string; content: string | null; version: number }>;
};

export default function GenerateClient({
  project,
  hasApiKey,
}: {
  project: Project;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [promptHint, setPromptHint] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>(DOC_TYPES.map((d: any) => d.key));
  const [includeWbs, setIncludeWbs] = useState(false);
  const [referenceExisting, setReferenceExisting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [docStates, setDocStates] = useState<Record<string, DocState>>(
    Object.fromEntries(DOC_TYPES.map((d: any) => [d.key, { status: "idle", content: "" }]))
  );
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function toggleDoc(key: string) {
    setSelectedDocs((prev) =>
      prev.includes(key) ? prev.filter((k: any) => k !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelectedDocs(DOC_TYPES.map((d: any) => d.key));
  }
  function selectNone() {
    setSelectedDocs([]);
  }

  async function handleGenerate() {
    if (selectedDocs.length === 0 && !includeWbs) return;
    setGenerating(true);
    setDone(false);

    // stateリセット
    setDocStates(
      Object.fromEntries(
        DOC_TYPES.map((d: any) => [d.key, { status: "idle" as const, content: "" }])
      )
    );

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_hint: promptHint,
          doc_types: selectedDocs,
          include_wbs: includeWbs,
          reference_existing: referenceExisting,
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch {}
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Stream error:", error);
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    const docType = event.doc_type as string | undefined;

    if (event.event === "start" && docType) {
      setCurrentDoc(docType);
      setDocStates((prev) => ({
        ...prev,
        [docType]: { status: "generating", content: "" },
      }));
    } else if (event.event === "chunk" && docType) {
      setDocStates((prev) => ({
        ...prev,
        [docType]: {
          status: "generating",
          content: (prev[docType]?.content ?? "") + (event.text as string),
        },
      }));
    } else if (event.event === "doc_done" && docType) {
      setDocStates((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], status: "done" },
      }));
    } else if (event.event === "all_done") {
      setCurrentDoc(null);
      setDone(true);
    } else if (event.event === "error") {
      if (docType) {
        setDocStates((prev) => ({
          ...prev,
          [docType]: { ...prev[docType], status: "error" },
        }));
      }
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setGenerating(false);
  }

  return (
    <main className="flex-1 p-6 flex flex-col gap-5 max-w-4xl">
      {/* APIキー未設定警告 */}
      {!hasApiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-amber-500 text-xl">⚠️</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-800">Claude APIキーが未設定です</div>
            <div className="text-xs text-amber-600 mt-0.5">
              AI生成機能を使用するには先にAPIキーを登録してください
            </div>
          </div>
          <Link
            href="/settings"
            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
          >
            設定画面へ
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 設定パネル */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">生成設定</h2>

          {/* 追加指示 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              追加指示（任意）
            </label>
            <textarea
              value={promptHint}
              onChange={(e) => setPromptHint(e.target.value)}
              placeholder="例: ユーザー認証機能を重点的に記載してください..."
              rows={3}
              maxLength={500}
              disabled={generating}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm resize-none focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 disabled:opacity-50"
            />
            <div className="text-right text-[10px] text-slate-400">{promptHint.length}/500</div>
          </div>

          {/* 生成対象 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                生成対象ドキュメント
              </label>
              <div className="flex gap-1.5">
                <button onClick={selectAll} className="text-[10px] text-[#1D6FA4] hover:underline">全選択</button>
                <span className="text-[10px] text-slate-300">|</span>
                <button onClick={selectNone} className="text-[10px] text-[#1D6FA4] hover:underline">解除</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {DOC_TYPES.map((doc: any) => (
                <label key={doc.key} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(doc.key)}
                    onChange={() => toggleDoc(doc.key)}
                    disabled={generating}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1D6FA4]"
                  />
                  <span className="text-sm text-slate-700">{doc.label}</span>
                  {project.documents.find((d: any) => d.docType === doc.key)?.content && (
                    <span className="text-[10px] text-slate-400">（既存あり v{project.documents.find((d: any) => d.docType === doc.key)?.version}）</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* WBS展開 */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeWbs}
              onChange={(e) => setIncludeWbs(e.target.checked)}
              disabled={generating}
              className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
            />
            <span className="text-sm text-slate-700">WBS自動展開も含める</span>
          </label>

          {/* 既存コンテンツ参照 */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={referenceExisting}
              onChange={(e) => setReferenceExisting(e.target.checked)}
              disabled={generating}
              className="w-3.5 h-3.5 rounded border-slate-300 text-[#1D6FA4]"
            />
            <span className="text-sm text-slate-700">既存コンテンツを参照して改善</span>
          </label>

          {/* 生成ボタン */}
          {!generating ? (
            <button
              onClick={handleGenerate}
              disabled={!hasApiKey || (selectedDocs.length === 0 && !includeWbs)}
              className="w-full py-3 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>🤖</span>
              Meridianで生成する
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              生成中... (停止)
            </button>
          )}

          {done && (
            <Link
              href={`/projects/${project.id}`}
              className="w-full py-2.5 rounded-xl border border-emerald-500 text-emerald-600 text-sm font-semibold hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
            >
              ✅ 保存完了 — プロジェクト詳細へ
            </Link>
          )}
        </div>

        {/* プレビューパネル */}
        <div className="space-y-3">
          {DOC_TYPES.filter((d: any) => selectedDocs.includes(d.key)).map((doc: any) => {
            const state = docStates[doc.key];
            return (
              <div
                key={doc.key}
                className={`bg-white rounded-xl border overflow-hidden transition-all ${
                  state.status === "generating"
                    ? "border-[#1D6FA4] shadow-sm"
                    : state.status === "done"
                    ? "border-emerald-200"
                    : state.status === "error"
                    ? "border-red-200"
                    : "border-slate-100"
                }`}
              >
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${
                  state.status === "generating" ? "border-[#1D6FA4]/20 bg-[#1D6FA4]/5"
                  : state.status === "done" ? "border-emerald-100 bg-emerald-50"
                  : "border-slate-100 bg-slate-50"
                }`}>
                  <span className="text-sm font-semibold text-slate-800">{doc.label}</span>
                  <span className="ml-auto">
                    {state.status === "generating" && (
                      <span className="text-[11px] text-[#1D6FA4] font-medium animate-pulse">生成中...</span>
                    )}
                    {state.status === "done" && (
                      <span className="text-[11px] text-emerald-600 font-medium">✓ 完了</span>
                    )}
                    {state.status === "error" && (
                      <span className="text-[11px] text-red-500 font-medium">エラー</span>
                    )}
                  </span>
                </div>
                {state.content && (
                  <div className="px-4 py-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap leading-relaxed">
                      {state.content.slice(0, 800)}
                      {state.content.length > 800 && "..."}
                    </pre>
                  </div>
                )}
                {state.status === "idle" && (
                  <div className="px-4 py-6 text-center text-xs text-slate-300">待機中</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
