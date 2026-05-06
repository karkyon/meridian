"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type FocusTask = {
  task_id: string;
  title: string;
  project_name: string;
  project_id: string;
  reason: string;
  priority: string;
  due_date: Date | null;
};

const priorityConfig = {
  high: "🔴",
  mid: "🟡",
  low: "🟢",
};

export default function FocusPanel({ role }: { role: string }) {
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/intelligence/focus")
      .then((r) => r.json())
      .then((d) => setTasks(d.focus_tasks ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🎯</span>
        <h2 className="text-sm font-semibold text-slate-700">今日のフォーカス</h2>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i: any) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-4">
          タスクがありません
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any, i: number) => (
            <Link
              key={task.task_id}
              href={`/projects/${task.project_id}`}
              className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <span className="text-sm shrink-0 mt-0.5">{priorityConfig[task.priority as keyof typeof priorityConfig] ?? "⚪"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 line-clamp-1 group-hover:text-[#1A3A5C]">
                  {task.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <span className="truncate">{task.project_name}</span>
                  {task.reason && (
                    <>
                      <span>·</span>
                      <span className="truncate text-[#1D6FA4]">{task.reason}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-300 shrink-0 mt-0.5">
                {i + 1}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
