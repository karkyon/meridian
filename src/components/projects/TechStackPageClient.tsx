"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TechStackEditor from "@/components/projects/TechStackEditor";
import type { TechStackInput, TechStackItem } from "@/types/tech-stack";

type Props = {
  projectId: string;
  initialItems: TechStackItem[];
  role: string;
};

export default function TechStackPageClient({ projectId, initialItems, role }: Props) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [items, setItems] = useState<TechStackInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tech_stack: items.map((t) => t.version ? `${t.name} ${t.version}` : t.name),
          tech_stack_items: items,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "保存失敗"); return; }
      setSaved(true);
      router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">技術スタック</h2>
        {isAdmin && (
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-[#1A3A5C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A527A] disabled:opacity-60 transition-colors">
            {saving ? "保存中..." : "💾 保存"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {saved && <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">✅ 保存しました</p>}

      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <TechStackEditor
          initialItems={initialItems}
          onChange={setItems}
          readOnly={!isAdmin}
        />
      </div>
    </div>
  );
}