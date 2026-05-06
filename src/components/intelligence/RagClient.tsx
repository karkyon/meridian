"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ project_name: string; doc_type: string; snippet: string; similarity_score: number }>;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  planning: "企画書",
  requirements: "要件定義書",
  external_spec: "外部仕様",
  db_spec: "DB仕様",
  api_spec: "API設計",
};

export default function RagClient({
  projects,
  hasApiKey,
  role,
}: {
  projects: Array<{ id: string; name: string }>;
  hasApiKey: boolean;
  role: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/intelligence/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMsg.content,
          project_ids: selectedProjects.length > 0 ? selectedProjects : undefined,
          top_k: 5,
        }),
      });

      const data = await res.json();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.ok ? data.answer : (data.error ?? "エラーが発生しました"),
        sources: res.ok ? data.sources : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "通信エラーが発生しました",
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-48px)]">
      {!hasApiKey && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-2.5">
          <span className="text-amber-500">⚠️</span>
          <span className="text-xs text-amber-700">Claude APIキーが未設定です。</span>
          <Link href="/settings" className="text-xs text-amber-600 underline">設定画面へ</Link>
        </div>
      )}

      {/* プロジェクトフィルター */}
      <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">検索対象：</span>
        <button
          onClick={() => setSelectedProjects([])}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            selectedProjects.length === 0
              ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
              : "border-slate-200 text-slate-500 hover:border-[#1D6FA4]"
          }`}
        >
          全プロジェクト ({projects.length}件)
        </button>
        {projects.slice(0, 8).map((p: any) => (
          <button
            key={p.id}
            onClick={() =>
              setSelectedProjects((prev) =>
                prev.includes(p.id) ? prev.filter((id: any) => id !== p.id) : [...prev, p.id]
              )
            }
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selectedProjects.includes(p.id)
                ? "bg-[#1D6FA4] text-white border-[#1D6FA4]"
                : "border-slate-200 text-slate-500 hover:border-[#1D6FA4]"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="text-4xl">💬</div>
            <p className="text-sm font-medium text-slate-600">全ドキュメント横断Q&A</p>
            <p className="text-xs text-slate-400 max-w-sm">
              登録済みプロジェクトのドキュメントに自然言語で質問できます
            </p>
            <div className="flex flex-col gap-1.5 mt-2">
              {[
                "PostgreSQLを使っているプロジェクトは？",
                "認証方式を比較して",
                "最も進捗が遅れているプロジェクトは？",
              ].map((q: any) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-[#1D6FA4] hover:text-[#1D6FA4] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg: any) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-lg ${msg.role === "user" ? "" : "space-y-2"}`}>
              {msg.role === "assistant" && (
                <div className="text-[10px] font-semibold text-[#1D6FA4] mb-1">Meridian Intelligence</div>
              )}
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#D6EAF8] text-[#1A3A5C] rounded-br-sm"
                    : "bg-slate-50 text-slate-800 border border-slate-100 rounded-bl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>

              {/* ソース引用 */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {msg.sources.map((s: any, i: number) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 border border-slate-100 rounded bg-white text-slate-400"
                    >
                      {s.project_name} / {DOC_TYPE_LABELS[s.doc_type] ?? s.doc_type}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i: any) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-[#1D6FA4] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="border-t border-slate-100 bg-white p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="全ドキュメントに質問する..."
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-[#1A3A5C] text-white rounded-xl text-sm font-semibold hover:bg-[#2A527A] transition-colors disabled:opacity-40"
          >
            送信
          </button>
        </div>
      </div>
    </main>
  );
}
