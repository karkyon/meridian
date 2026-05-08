// src/components/projects/TechStackEditor.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import {
  TechStackItem,
  TechStackInput,
  TechCategory,
  TECH_CATEGORY_META,
  TECH_CATEGORY_ORDER,
  groupByCategory,
} from "@/types/tech-stack";

// ----------------------------------------------------------------
// よく使われる技術のサジェスト候補
// ----------------------------------------------------------------
const SUGGESTIONS: Record<TechCategory, string[]> = {
  language:  ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Kotlin", "Swift", "C#", "PHP"],
  frontend:  ["Next.js", "React", "Vue", "Nuxt", "Svelte", "SvelteKit", "Remix", "Astro", "Tailwind CSS", "shadcn/ui"],
  backend:   ["Express", "Fastify", "NestJS", "Hono", "FastAPI", "Django", "Laravel", "Spring Boot", "Gin"],
  database:  ["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "DynamoDB", "Supabase", "PlanetScale"],
  orm:       ["Prisma", "Drizzle", "TypeORM", "Sequelize", "SQLAlchemy", "ActiveRecord", "Mongoose"],
  auth:      ["NextAuth.js", "Auth.js", "Clerk", "Auth0", "Firebase Auth", "Supabase Auth", "Lucia"],
  infra:     ["Docker", "Vercel", "Cloudflare Workers", "AWS", "GCP", "Railway", "Render", "Nginx", "GitHub Actions"],
  ai_ml:     ["Claude API", "OpenAI API", "Gemini API", "LangChain", "LlamaIndex", "Hugging Face", "Ollama"],
  testing:   ["Jest", "Vitest", "Playwright", "Cypress", "Testing Library", "MSW", "Supertest"],
  tooling:   ["ESLint", "Prettier", "Turborepo", "Vite", "esbuild", "Biome", "Lefthook", "Husky"],
  other:     [],
};

// ----------------------------------------------------------------
// Props
// ----------------------------------------------------------------
type Props = {
  /** 既存の技術スタック（編集モード用） */
  initialItems?: TechStackItem[];
  /** 変更コールバック（フォーム送信前の状態管理用） */
  onChange: (items: TechStackInput[]) => void;
  /** 読み取り専用（Viewer ロール用） */
  readOnly?: boolean;
};

export default function TechStackEditor({
  initialItems = [],
  onChange,
  readOnly = false,
}: Props) {
  // ローカル state（TechStackInput の配列で管理）
  const [items, setItems] = useState<TechStackInput[]>(
    initialItems.map((t) => ({
      name:     t.name,
      category: t.category,
      version:  t.version ?? undefined,
      notes:    t.notes ?? undefined,
    }))
  );

  // 入力フォームの一時 state
  const [inputName, setInputName]       = useState("");
  const [inputCategory, setInputCategory] = useState<TechCategory>("frontend");
  const [inputVersion, setInputVersion] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCategory, setActiveCategory]   = useState<TechCategory | "all">("all");

  const inputRef = useRef<HTMLInputElement>(null);

  // 外部へ変更を通知
  useEffect(() => {
    onChange(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ----------------------------------------------------------------
  // サジェスト絞り込み
  // ----------------------------------------------------------------
  const filteredSuggestions = (() => {
    const candidates = SUGGESTIONS[inputCategory] ?? [];
    const q = inputName.trim().toLowerCase();
    return q
      ? candidates.filter(
          (s) =>
            s.toLowerCase().includes(q) &&
            !items.some((i) => i.name.toLowerCase() === s.toLowerCase())
        )
      : candidates.filter(
          (s) => !items.some((i) => i.name.toLowerCase() === s.toLowerCase())
        );
  })();

  // ----------------------------------------------------------------
  // 追加
  // ----------------------------------------------------------------
  function addItem(name?: string) {
    const n = (name ?? inputName).trim();
    if (!n) return;
    if (items.some((i) => i.name.toLowerCase() === n.toLowerCase())) return;
    if (items.length >= 50) return;

    const next: TechStackInput = {
      name:     n,
      category: inputCategory,
      version:  inputVersion.trim() || undefined,
    };
    setItems((prev) => [...prev, next]);
    setInputName("");
    setInputVersion("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  // ----------------------------------------------------------------
  // 削除
  // ----------------------------------------------------------------
  function removeItem(name: string) {
    setItems((prev) => prev.filter((i) => i.name !== name));
  }

  // ----------------------------------------------------------------
  // カテゴリ変更
  // ----------------------------------------------------------------
  function updateCategory(name: string, category: TechCategory) {
    setItems((prev) =>
      prev.map((i) => (i.name === name ? { ...i, category } : i))
    );
  }

  // ----------------------------------------------------------------
  // 表示フィルタ用
  // ----------------------------------------------------------------
  const displayItems =
    activeCategory === "all"
      ? items
      : items.filter((i) => i.category === activeCategory);

  const grouped = groupByCategory(
    items.map((i, idx) => ({
      id:        String(idx),
      projectId: "",
      name:      i.name,
      category:  i.category,
      version:   i.version ?? null,
      notes:     i.notes ?? null,
      sortOrder: idx,
      createdAt: "",
    }))
  );

  const usedCategories = TECH_CATEGORY_ORDER.filter(
    (cat) => grouped[cat] && grouped[cat]!.length > 0
  );

  // ================================================================
  // Render
  // ================================================================
  return (
    <div className="space-y-3">
      {/* ---- 入力行（Admin のみ） ---- */}
      {!readOnly && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          {/* カテゴリ選択 */}
          <div className="flex flex-wrap gap-1.5">
            {TECH_CATEGORY_ORDER.map((cat) => {
              const meta = TECH_CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setInputCategory(cat)}
                  className={`
                    inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                    border transition-all
                    ${
                      inputCategory === cat
                        ? `${meta.color} shadow-sm scale-105`
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }
                  `}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* 技術名 + バージョン + 追加ボタン */}
          <div className="flex gap-2 relative">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputName}
                onChange={(e) => {
                  setInputName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addItem(); }
                  if (e.key === "Escape") setShowSuggestions(false);
                }}
                placeholder={`${TECH_CATEGORY_META[inputCategory].emoji} 技術名を入力…`}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                           focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
              />

              {/* サジェストドロップダウン */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-50
                               bg-white border border-slate-200 rounded-lg shadow-lg
                               max-h-48 overflow-y-auto">
                  {filteredSuggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onMouseDown={() => addItem(s)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#1A3A5C]/5
                                   flex items-center justify-between"
                      >
                        <span>{s}</span>
                        <span className="text-xs text-slate-400">+ 追加</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input
              type="text"
              value={inputVersion}
              onChange={(e) => setInputVersion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
              placeholder="バージョン"
              className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                         focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
            />

            <button
              type="button"
              onClick={() => addItem()}
              className="px-4 py-2 bg-[#1A3A5C] text-white rounded-lg text-sm font-medium
                         hover:bg-[#2A527A] transition-colors"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {/* ---- 登録済み一覧 ---- */}
      {items.length > 0 && (
        <div className="space-y-2">
          {/* カテゴリ絞り込みタブ */}
          {usedCategories.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                  ${activeCategory === "all"
                    ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
              >
                すべて ({items.length})
              </button>
              {usedCategories.map((cat) => {
                const meta = TECH_CATEGORY_META[cat];
                const count = grouped[cat]?.length ?? 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                      ${activeCategory === cat
                        ? `${meta.color} shadow-sm`
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                  >
                    {meta.emoji} {meta.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* タグ表示（カテゴリ別グループ） */}
          <div className="space-y-2">
            {(activeCategory === "all" ? usedCategories : [activeCategory as TechCategory])
              .filter((cat) => grouped[cat]?.length)
              .map((cat) => {
                const meta = TECH_CATEGORY_META[cat];
                return (
                  <div key={cat} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-400 w-full">
                      {meta.emoji} {meta.label}
                    </span>
                    {grouped[cat]!.map((t) => (
                      <span
                        key={t.name}
                        className={`
                          inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                          text-xs font-medium border
                          ${meta.color}
                        `}
                      >
                        <span>{t.name}</span>
                        {t.version && (
                          <span className="opacity-60 text-[10px]">v{t.version}</span>
                        )}
                        {!readOnly && (
                          <>
                            {/* カテゴリ変更（小さなセレクト） */}
                            <select
                              value={t.category}
                              onChange={(e) =>
                                updateCategory(t.name, e.target.value as TechCategory)
                              }
                              className="opacity-0 w-0 h-0 absolute"
                              aria-label="カテゴリ変更"
                            />
                            <button
                              type="button"
                              onClick={() => removeItem(t.name)}
                              className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-600
                                         transition-colors text-sm leading-none"
                              title="削除"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-xs text-slate-400 py-1">
          技術スタックがまだ登録されていません
        </p>
      )}
    </div>
  );
}