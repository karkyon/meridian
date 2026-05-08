"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import TechStackEditor from "@/components/projects/TechStackEditor";
import type { TechStackInput } from "@/types/tech-stack";
import type { TechStackItem } from "@/types/tech-stack";

const schema = z.object({
  name: z.string().min(1, "プロジェクト名は必須です").max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(["planning", "active", "paused", "completed"]),
  category: z.string().max(100).optional(),
  repository_url: z.string().url("有効なURLを入力してください").optional().or(z.literal("")),
  notes: z.string().optional(),
});

const STATUS_OPTIONS = [
  { value: "planning", label: "企画中" },
  { value: "active", label: "開発中" },
  { value: "paused", label: "停止中" },
  { value: "completed", label: "完了" },
];

type ProjectFormProps = {
  initial?: {
    id?: string;
    name?: string;
    description?: string;
    status?: string;
    category?: string;
    techStack?: TechStackItem[];
    repositoryUrl?: string;
    notes?: string;
  };
};

export default function ProjectForm({ initial }: ProjectFormProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planning");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(initial?.repositoryUrl ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [techStackItems, setTechStackItems] = useState<TechStackInput[]>(
    (initial?.techStack ?? []).map((t) => ({
      name:     t.name,
      category: t.category,
      version:  t.version ?? undefined,
      notes:    t.notes ?? undefined,
    }))
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function addTech() {
    const t = techInput.trim();
    if (t && !techStack.includes(t) && techStack.length < 50) {
      setTechStack([...techStack, t]);
      setTechInput("");
    }
  }

  function removeTech(tech: string) {
    setTechStack(techStack.filter((t: any) => t !== tech));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse({
      name, description, status, category,
      repository_url: repositoryUrl, notes,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const url = isEdit ? `/api/projects/${initial!.id}` : "/api/projects";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          // 旧カラム後方互換（サーバー側で syncLegacyTechStack が更新するが念のため送信）
          tech_stack: techStackItems.map((t) => t.version ? `${t.name} ${t.version}` : t.name),
          // 新テーブル向け
          tech_stack_items: techStackItems,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "エラーが発生しました");
        return;
      }

      const data = await res.json();
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* プロジェクト名 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          プロジェクト名 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: RecipeApp"
          required
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
        />
      </div>

      {/* 概要 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">概要</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="プロジェクトの概要を入力..."
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 resize-none"
        />
      </div>

      {/* ステータス & カテゴリ */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">ステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none bg-white"
          >
            {STATUS_OPTIONS.map((o: any) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">カテゴリ</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="web / cli / api / mobile"
            maxLength={100}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
          />
        </div>
      </div>

      {/* 技術スタック */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          技術スタック
        </label>
        <TechStackEditor
          initialItems={initial?.techStack}
          onChange={setTechStackItems}
        />
      </div>

      {/* リポジトリURL */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">リポジトリURL</label>
        <input
          type="url"
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          placeholder="https://github.com/username/repo"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20"
        />
      </div>

      {/* メモ */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">メモ</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="自由メモ..."
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20 resize-none"
        />
      </div>

      {/* ボタン */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "保存中..." : isEdit ? "更新する" : "作成する"}
        </button>
      </div>
    </form>
  );
}
