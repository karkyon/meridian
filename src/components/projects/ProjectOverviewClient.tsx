"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { KeyFeature, EnvVarItem, ExternalDependency } from "@/types/project-overview";
import { parseKeyFeatures, parseEnvVars, parseExternalDependencies } from "@/types/project-overview";

const STATUS_OPTIONS = [
  { value: "planning",  label: "企画中" },
  { value: "active",    label: "開発中" },
  { value: "paused",    label: "停止中" },
  { value: "completed", label: "完了" },
];

type Props = {
  project: {
    id: string; name: string; description: string | null;
    status: string; category: string | null;
    repositoryUrl: string | null; notes: string | null;
    createdAt: Date; updatedAt: Date;
    progressCache: unknown; docCompleteness: unknown;
    iconUrl: string | null;
    tagline: string | null;
    purpose: string | null;
    targetUsers: string | null;
    scope: string | null;
    keyFeatures: unknown;
    setupInstructions: string | null;
    envVars: unknown;
    externalDependencies: unknown;
    license: string | null;
    roadmap: string | null;
    knownIssues: string | null;
    securityNotes: string | null;
  };
  role: string;
};

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#1D6FA4] focus:outline-none focus:ring-2 focus:ring-[#1D6FA4]/20";
const label = "text-xs font-medium text-slate-400 uppercase tracking-wide";
const empty = <span className="text-slate-300">未入力</span>;

// ============================================================
// 主要機能リストエディタ
// ============================================================
function KeyFeatureEditor({
  items, onChange, editing,
}: { items: KeyFeature[]; onChange: (v: KeyFeature[]) => void; editing: boolean }) {
  if (!editing) {
    if (items.length === 0) return <p className="text-sm text-slate-300">未入力</p>;
    return (
      <ul className="space-y-1.5">
        {items.map((f, i) => (
          <li key={i} className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">・{f.title}</span>
            {f.description && <span className="text-slate-400"> — {f.description}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((f, i) => (
        <div key={i} className="flex gap-2 items-start bg-slate-50 rounded-lg p-2">
          <div className="flex-1 space-y-1.5">
            <input
              value={f.title}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, title: e.target.value } : it))}
              placeholder="機能名"
              className={`${field} bg-white`}
            />
            <input
              value={f.description ?? ""}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
              placeholder="説明（任意）"
              className={`${field} bg-white`}
            />
          </div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { title: "", description: "" }])}
        className="text-xs text-[#1D6FA4] hover:underline">＋ 機能を追加</button>
    </div>
  );
}

// ============================================================
// 環境変数リストエディタ（値そのものは扱わない）
// ============================================================
function EnvVarEditor({
  items, onChange, editing,
}: { items: EnvVarItem[]; onChange: (v: EnvVarItem[]) => void; editing: boolean }) {
  if (!editing) {
    if (items.length === 0) return <p className="text-sm text-slate-300">未入力</p>;
    return (
      <div className="space-y-1.5">
        {items.map((v, i) => (
          <div key={i} className="text-sm flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{v.key}</code>
            {v.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">必須</span>}
            {v.isSecret && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">🔒秘匿</span>}
            {v.description && <span className="text-slate-400">— {v.description}</span>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">⚠️ ここには実際のキー値（トークン本体）は入力しないでください。キー名と用途の説明のみ記載します。</p>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2 items-start bg-slate-50 rounded-lg p-2">
          <div className="flex-1 space-y-1.5">
            <input
              value={v.key}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, key: e.target.value } : it))}
              placeholder="例: ANTHROPIC_API_KEY"
              className={`${field} bg-white font-mono`}
            />
            <input
              value={v.description ?? ""}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
              placeholder="用途の説明（値そのものは書かない）"
              className={`${field} bg-white`}
            />
            <div className="flex gap-4 text-xs text-slate-500">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!v.required}
                  onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, required: e.target.checked } : it))} />
                必須
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!v.isSecret}
                  onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, isSecret: e.target.checked } : it))} />
                機密値
              </label>
            </div>
          </div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { key: "", description: "", required: false, isSecret: false }])}
        className="text-xs text-[#1D6FA4] hover:underline">＋ 環境変数を追加</button>
    </div>
  );
}

// ============================================================
// 外部サービス依存リストエディタ
// ============================================================
function ExternalDepEditor({
  items, onChange, editing,
}: { items: ExternalDependency[]; onChange: (v: ExternalDependency[]) => void; editing: boolean }) {
  if (!editing) {
    if (items.length === 0) return <p className="text-sm text-slate-300">未入力</p>;
    return (
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li key={i} className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">・{d.name}</span>
            {d.purpose && <span className="text-slate-400"> — {d.purpose}</span>}
            {d.url && <> (<a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[#1D6FA4] hover:underline">link</a>)</>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={i} className="flex gap-2 items-start bg-slate-50 rounded-lg p-2">
          <div className="flex-1 space-y-1.5">
            <input
              value={d.name}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
              placeholder="サービス名（例: Claude API）"
              className={`${field} bg-white`}
            />
            <input
              value={d.purpose ?? ""}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, purpose: e.target.value } : it))}
              placeholder="用途"
              className={`${field} bg-white`}
            />
            <input
              value={d.url ?? ""}
              onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, url: e.target.value } : it))}
              placeholder="参考URL（任意）"
              className={`${field} bg-white`}
            />
          </div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { name: "", purpose: "", url: "" }])}
        className="text-xs text-[#1D6FA4] hover:underline">＋ 依存先を追加</button>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function ProjectOverviewClient({ project, role }: Props) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing]           = useState(false);
  const [name, setName]                 = useState(project.name);
  const [description, setDescription]   = useState(project.description ?? "");
  const [status, setStatus]             = useState(project.status);
  const [category, setCategory]         = useState(project.category ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl ?? "");
  const [notes, setNotes]               = useState(project.notes ?? "");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // README強化フィールド
  const [tagline, setTagline]           = useState(project.tagline ?? "");
  const [purpose, setPurpose]           = useState(project.purpose ?? "");
  const [targetUsers, setTargetUsers]   = useState(project.targetUsers ?? "");
  const [scope, setScope]               = useState(project.scope ?? "");
  const [keyFeatures, setKeyFeatures]   = useState<KeyFeature[]>(parseKeyFeatures(project.keyFeatures));
  const [setupInstructions, setSetupInstructions] = useState(project.setupInstructions ?? "");
  const [envVars, setEnvVars]           = useState<EnvVarItem[]>(parseEnvVars(project.envVars));
  const [externalDeps, setExternalDeps] = useState<ExternalDependency[]>(parseExternalDependencies(project.externalDependencies));
  const [license, setLicense]           = useState(project.license ?? "");
  const [roadmap, setRoadmap]           = useState(project.roadmap ?? "");
  const [knownIssues, setKnownIssues]   = useState(project.knownIssues ?? "");
  const [securityNotes, setSecurityNotes] = useState(project.securityNotes ?? "");

  // アイコン
  const iconDisplayUrl = project.iconUrl
    ? `/api/projects/${project.id}/icon/file`
    : null;
  const [iconPreview, setIconPreview]       = useState<string | null>(iconDisplayUrl);
  const [iconUploading, setIconUploading]   = useState(false);
  const [iconError, setIconError]           = useState<string | null>(null);
  const [dragOver, setDragOver]             = useState(false);

  // ── アイコンアップロード ──
  async function handleIconUpload(file: File) {
    setIconError(null);
    if (file.size > 2 * 1024 * 1024) {
      setIconError("ファイルサイズは2MB以下にしてください");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "svg", "webp", "ico"].includes(ext)) {
      setIconError("PNG / JPG / SVG / WebP / ICO のみ対応しています");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setIconPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setIconUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/projects/${project.id}/icon`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      setIconPreview(`/api/projects/${project.id}/icon/file?t=${Date.now()}`);
      router.refresh();
    } else {
      const d = await res.json();
      setIconError(
        d.error === "FILE_TOO_LARGE" ? "ファイルサイズは2MB以下にしてください"
        : d.error === "INVALID_FILE_TYPE" ? "PNG / JPG / SVG / WebP のみ対応しています"
        : "アップロードに失敗しました"
      );
      setIconPreview(iconDisplayUrl);
    }
    setIconUploading(false);
  }

  async function handleIconDelete() {
    setIconUploading(true);
    await fetch(`/api/projects/${project.id}/icon`, { method: "DELETE" });
    setIconPreview(null);
    setIconUploading(false);
    router.refresh();
  }

  // ── プロジェクト情報保存 ──
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description, status, category,
          repository_url: repositoryUrl, notes,
          tagline, purpose,
          target_users: targetUsers, scope,
          key_features: keyFeatures.filter((f) => f.title.trim().length > 0),
          setup_instructions: setupInstructions,
          env_vars: envVars.filter((v) => v.key.trim().length > 0),
          external_dependencies: externalDeps.filter((d) => d.name.trim().length > 0),
          license, roadmap,
          known_issues: knownIssues,
          security_notes: securityNotes,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message ?? d.error ?? "保存失敗");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">プロジェクト概要</h2>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ✏️ 編集
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg whitespace-pre-wrap">{error}</p>}

      {/* ═══════════ 基本情報 ═══════════ */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-5">

        {/* プロジェクトアイコン */}
        <div className="space-y-2">
          <label className={label}>プロジェクトアイコン</label>
          <div className="flex items-start gap-5">
            <div
              className={`w-20 h-20 rounded-xl border-2 flex items-center justify-center overflow-hidden shrink-0 transition-all ${
                isAdmin && editing
                  ? dragOver
                    ? "border-[#1D6FA4] bg-[#1D6FA4]/5 scale-105"
                    : "border-dashed border-slate-300 bg-slate-50 hover:border-[#1D6FA4] cursor-pointer"
                  : "border-slate-200 bg-slate-50"
              }`}
              onClick={() => { if (isAdmin && editing) fileInputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); if (isAdmin && editing) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!isAdmin || !editing) return;
                const file = e.dataTransfer.files[0];
                if (file) handleIconUpload(file);
              }}
            >
              {iconUploading ? (
                <div className="flex flex-col items-center gap-1">
                  <svg className="w-5 h-5 animate-spin text-[#1D6FA4]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-[9px] text-slate-400">処理中</span>
                </div>
              ) : iconPreview ? (
                <img src={iconPreview} alt="プロジェクトアイコン" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl text-slate-300">{isAdmin && editing ? "📤" : "📁"}</span>
                  <span className="text-[9px] text-slate-400">{isAdmin && editing ? "クリックまたはD&D" : "未設定"}</span>
                </div>
              )}
            </div>

            {isAdmin && editing && (
              <div className="flex flex-col gap-2 justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleIconUpload(f);
                    e.target.value = "";
                  }}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={iconUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                  📤 画像を選択
                </button>
                {iconPreview && (
                  <button type="button" onClick={handleIconDelete} disabled={iconUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                    🗑 削除
                  </button>
                )}
                <p className="text-[10px] text-slate-400 leading-relaxed">PNG / JPG / SVG / WebP / ICO<br />最大2MB</p>
                {iconError && <p className="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded-lg">{iconError}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* プロジェクト名 */}
        <div className="space-y-1">
          <label className={label}>プロジェクト名</label>
          {editing
            ? <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            : <p className="text-sm font-semibold text-slate-800">{project.name}</p>}
        </div>

        {/* タグライン */}
        <div className="space-y-1">
          <label className={label}>タグライン（一言サマリー）</label>
          {editing
            ? <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={300} placeholder="例: 個人開発案件を一元管理するプロジェクト管理ツール" className={field} />
            : <p className="text-sm text-slate-600">{project.tagline || empty}</p>}
        </div>

        {/* 概要 */}
        <div className="space-y-1">
          <label className={label}>概要</label>
          {editing
            ? <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.description || empty}</p>}
        </div>

        {/* ステータス & カテゴリ */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={label}>ステータス</label>
            {editing
              ? <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} bg-white`}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              : <p className="text-sm text-slate-600">{STATUS_OPTIONS.find((o) => o.value === project.status)?.label ?? project.status}</p>}
          </div>
          <div className="space-y-1">
            <label className={label}>カテゴリ</label>
            {editing
              ? <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="web / cli / api / mobile" className={field} />
              : <p className="text-sm text-slate-600">{project.category || <span className="text-slate-300">未設定</span>}</p>}
          </div>
        </div>

        {/* リポジトリURL */}
        <div className="space-y-1">
          <label className={label}>リポジトリURL</label>
          {editing
            ? <input type="url" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} className={field} />
            : project.repositoryUrl
              ? <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#1D6FA4] hover:underline">{project.repositoryUrl}</a>
              : <p className="text-sm text-slate-300">未設定</p>}
        </div>
      </div>

      {/* ═══════════ 目的・対象範囲 ═══════════ */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-slate-600">目的・対象範囲</h3>

        <div className="space-y-1">
          <label className={label}>目的・背景（なぜ作るのか）</label>
          {editing
            ? <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.purpose || empty}</p>}
        </div>

        <div className="space-y-1">
          <label className={label}>対象ユーザー</label>
          {editing
            ? <textarea value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} rows={2} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.targetUsers || empty}</p>}
        </div>

        <div className="space-y-1">
          <label className={label}>スコープ（対象範囲・対象外の明示）</label>
          {editing
            ? <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.scope || empty}</p>}
        </div>
      </div>

      {/* ═══════════ 主要機能 ═══════════ */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-600">主要機能</h3>
        <KeyFeatureEditor items={keyFeatures} onChange={setKeyFeatures} editing={editing} />
      </div>

      {/* ═══════════ セットアップ・動作環境 ═══════════ */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-slate-600">セットアップ・動作環境</h3>

        <div className="space-y-1">
          <label className={label}>起動・セットアップ手順</label>
          {editing
            ? <textarea value={setupInstructions} onChange={(e) => setSetupInstructions(e.target.value)} rows={5}
                placeholder={"例:\ndocker compose up -d\nnpm install\nnpm run db:migrate\nnpm run dev"}
                className={`${field} resize-none font-mono text-xs`} />
            : <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-slate-50 rounded-lg p-3">{project.setupInstructions || "未入力"}</pre>}
        </div>

        <div className="space-y-1.5">
          <label className={label}>環境変数一覧（キー名・用途のみ。値は記載しない）</label>
          <EnvVarEditor items={envVars} onChange={setEnvVars} editing={editing} />
        </div>

        <div className="space-y-1.5">
          <label className={label}>外部サービス・API依存</label>
          <ExternalDepEditor items={externalDeps} onChange={setExternalDeps} editing={editing} />
        </div>
      </div>

      {/* ═══════════ 運用・プロジェクト管理 ═══════════ */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-slate-600">運用・プロジェクト管理</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={label}>ライセンス</label>
            {editing
              ? <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="例: MIT / Proprietary" className={field} />
              : <p className="text-sm text-slate-600">{project.license || empty}</p>}
          </div>
        </div>

        <div className="space-y-1">
          <label className={label}>ロードマップ・今後の予定</label>
          {editing
            ? <textarea value={roadmap} onChange={(e) => setRoadmap(e.target.value)} rows={3} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.roadmap || empty}</p>}
        </div>

        <div className="space-y-1">
          <label className={label}>既知の課題・制限事項</label>
          {editing
            ? <textarea value={knownIssues} onChange={(e) => setKnownIssues(e.target.value)} rows={3} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.knownIssues || empty}</p>}
        </div>

        <div className="space-y-1">
          <label className={label}>セキュリティ考慮事項</label>
          {editing ? (
            <>
              <p className="text-[11px] text-slate-400 mb-1">⚠️ 認証方式・暗号化方針などの「方針」を記載する欄です。実際の秘密鍵・パスワード等の値は書かないでください。</p>
              <textarea value={securityNotes} onChange={(e) => setSecurityNotes(e.target.value)} rows={3} className={`${field} resize-none`} />
            </>
          ) : (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.securityNotes || empty}</p>
          )}
        </div>

        {/* メモ */}
        <div className="space-y-1">
          <label className={label}>メモ</label>
          {editing
            ? <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${field} resize-none`} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.notes || <span className="text-slate-300">なし</span>}</p>}
        </div>
      </div>

      {/* 編集ボタン */}
      {editing && (
        <div className="flex gap-2 sticky bottom-4 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-2 shadow-lg">
          <button
            onClick={() => { setEditing(false); setError(null); }}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2A527A] disabled:opacity-60 transition-colors"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      )}

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "WBS進捗",          value: `${Number(project.progressCache).toFixed(0)}%` },
          { label: "ドキュメント整備率", value: `${Number(project.docCompleteness).toFixed(0)}%` },
          { label: "作成日",            value: new Date(project.createdAt).toLocaleDateString("ja-JP") },
          { label: "最終更新",          value: new Date(project.updatedAt).toLocaleDateString("ja-JP") },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="text-lg font-semibold text-slate-700 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
