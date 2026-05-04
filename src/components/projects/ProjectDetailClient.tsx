"use client";

import DocumentUploadButton from "@/components/documents/DocumentUploadButton";
import CustomDocsTab from "@/components/custom-docs/CustomDocsTab";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DOC_TYPE_LABELS: Record<string, string> = {
  planning: "企画書",
  requirements: "要件定義書",
  external_spec: "外部仕様設計書",
  db_spec: "DB仕様設計書",
  api_spec: "API詳細設計書",
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  planning: { label: "企画中", class: "bg-violet-100 text-violet-700" },
  active: { label: "開発中", class: "bg-blue-100 text-blue-700" },
  paused: { label: "停止中", class: "bg-amber-100 text-amber-700" },
  completed: { label: "完了", class: "bg-emerald-100 text-emerald-700" },
};

const TASK_STATUS: Record<string, { label: string; class: string }> = {
  todo: { label: "未着手", class: "bg-slate-100 text-slate-600" },
  in_progress: { label: "進行中", class: "bg-blue-100 text-blue-700" },
  done: { label: "完了", class: "bg-emerald-100 text-emerald-700" },
  blocked: { label: "ブロック", class: "bg-red-100 text-red-700" },
};

type Task = {
  id: string; title: string; status: string; priority: string;
  dueDate: Date | null; estimatedHours: unknown; sortOrder: number;
  aiGenerated: boolean; completedAt: Date | null; createdAt: Date; updatedAt: Date;
};

type Phase = {
  id: string; name: string; sortOrder: number; color: string | null;
  tasks: Task[];
};

type Document = {
  id: string; docType: string; content: string | null;
  completeness: number; aiGenerated: boolean; version: number; updatedAt: Date;
};

type Project = {
  id: string; name: string; description: string | null;
  status: string; category: string | null; techStack: unknown;
  repositoryUrl: string | null; notes: string | null;
  priorityScore: number; progressCache: unknown; docCompleteness: unknown;
  documents: Document[]; wbsPhases: Phase[];
};

const TABS = ["概要", "ドキュメント", "WBS", "添付資料"] as const;

export default function ProjectDetailClient({
  project,
  role,
}: {
  project: Project;
  role: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("概要");
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(
    Object.fromEntries(
      project.wbsPhases.flatMap((p) => p.tasks.map((t) => [t.id, t.status]))
    )
  );

  const isAdmin = role === "admin";
  const techStack = Array.isArray(project.techStack) ? (project.techStack as string[]) : [];
  const status = STATUS_LABELS[project.status] ?? STATUS_LABELS.planning;
  const progress = Math.round(Number(project.progressCache));
  const docRate = Math.round(Number(project.docCompleteness));

  async function toggleTaskStatus(taskId: string, current: string) {
    if (!isAdmin) return;
    const next =
      current === "todo" ? "in_progress"
      : current === "in_progress" ? "done"
      : current === "done" ? "todo"
      : "todo";

    setTaskStatuses((prev) => ({ ...prev, [taskId]: next }));

    await fetch(`/api/wbs/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    router.refresh();
  }

  async function deleteProject() {
    if (!confirm(`「${project.name}」を削除しますか？この操作は取り消せません。`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex-1 p-6">
      {/* ヘッダー */}
      <div className="flex items-start gap-3 mb-5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-800">{project.name}</h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.class}`}>
              {status.label}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 line-clamp-2">{project.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/projects/${project.id}/edit`}
              className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              編集
            </Link>
            <button
              onClick={deleteProject}
              className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
            >
              削除
            </button>
          </div>
        )}
      </div>

      {/* タブ */}
      <div className="flex border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[#1D6FA4] text-[#1D6FA4] bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 概要タブ */}
      {tab === "概要" && (
        <div className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-1">WBS進捗</div>
              <div className="text-2xl font-bold text-slate-800">{progress}%</div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-1">ドキュメント整備率</div>
              <div className="text-2xl font-bold text-slate-800">{docRate}%</div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${docRate}%` }} />
              </div>
            </div>
          </div>

          {project.category && (
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-1">カテゴリ</div>
              <div className="text-sm text-slate-700">{project.category}</div>
            </div>
          )}

          {techStack.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-2">技術スタック</div>
              <div className="flex flex-wrap gap-1.5">
                {techStack.map((tech) => (
                  <span key={tech} className="text-xs bg-[#1A3A5C]/10 text-[#1A3A5C] px-2 py-1 rounded-full">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.repositoryUrl && (
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-1">リポジトリ</div>
              <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#1D6FA4] hover:underline break-all">
                {project.repositoryUrl}
              </a>
            </div>
          )}

          {project.notes && (
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-400 mb-1">メモ</div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{project.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* ドキュメントタブ */}
      {tab === "ドキュメント" && (
        <div className="space-y-3 max-w-2xl">
          {isAdmin && (
            <Link href={`/projects/${project.id}/generate`}
              className="flex items-center gap-2 w-full bg-[#1A3A5C] text-white rounded-xl p-4 hover:bg-[#2A527A] transition-colors">
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-sm font-semibold">AI一括生成</div>
                <div className="text-xs opacity-70">Claude APIで5種ドキュメントを自動生成</div>
              </div>
            </Link>
          )}
          {project.documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="text-xs text-slate-400">完成度 {doc.completeness}%</div>
                    {doc.aiGenerated && (
                      <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">AI生成</span>
                    )}
                    <span className="text-[10px] text-slate-300">v{doc.version}</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {isAdmin && (
                    <DocumentUploadButton
                      projectId={project.id}
                      docType={doc.docType}
                      docTypeLabel={DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                    />
                  )}
                  <Link href={`/projects/${project.id}/documents/${doc.docType}`}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                    {isAdmin ? "編集" : "閲覧"}
                  </Link>
                </div>
              </div>
              <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1D6FA4] rounded-full" style={{ width: `${doc.completeness}%` }} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 mt-4 mb-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-400 font-medium">技術・設計ドキュメント</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <CustomDocsTab projectId={project.id} role={role} />
        </div>
      )}

      {/* WBSタブ */}
      {tab === "WBS" && (
        <div className="space-y-4 max-w-3xl">
          {isAdmin && (
            <div className="flex gap-2">
              <Link href={`/projects/${project.id}/wbs`}
                className="text-xs px-3 py-1.5 border border-[#1D6FA4] text-[#1D6FA4] rounded-lg hover:bg-[#1D6FA4]/5">
                WBS全画面表示
              </Link>
            </div>
          )}
          {project.wbsPhases.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              WBSが設定されていません
              {isAdmin && (
                <div className="mt-2">
                  <Link href={`/projects/${project.id}/wbs`} className="text-[#1D6FA4] hover:underline text-xs">
                    WBS管理画面へ →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            project.wbsPhases.map((phase) => {
              const total = phase.tasks.length;
              const done = phase.tasks.filter((t) => taskStatuses[t.id] === "done").length;
              return (
                <div key={phase.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: phase.color ?? "#1D6FA4" }} />
                    <span className="text-sm font-semibold text-slate-700">{phase.name}</span>
                    <span className="ml-auto text-xs text-slate-400">{total > 0 ? `${done}/${total}` : "0件"}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {phase.tasks.map((task) => {
                      const st = taskStatuses[task.id] ?? task.status;
                      const stConfig = TASK_STATUS[st] ?? TASK_STATUS.todo;
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                          <button
                            onClick={() => toggleTaskStatus(task.id, st)}
                            disabled={!isAdmin}
                            className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                              st === "done"
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-slate-300 hover:border-[#1D6FA4]"
                            } ${!isAdmin ? "cursor-default" : "cursor-pointer"}`}
                          >
                            {st === "done" && <span className="text-white text-[10px]">✓</span>}
                          </button>
                          <span className={`flex-1 text-sm ${st === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>
                            {task.title}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stConfig.class}`}>
                            {stConfig.label}
                          </span>
                          {task.dueDate && (
                            <span className={`text-[10px] ${new Date(task.dueDate) < new Date() && st !== "done" ? "text-red-500 font-medium" : "text-slate-400"}`}>
                              {new Date(task.dueDate).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}


      {/* 添付資料タブ */}
      {tab === "添付資料" && (
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Word / PDF / Markdownを保管し、AI生成の参照資料として活用できます</p>
            <a href={`/projects/${project.id}/attachments`} className="text-xs text-[#1D6FA4] hover:underline">参考資料を管理 →</a>
          </div>
        </div>
      )}

    </main>
  );
}
