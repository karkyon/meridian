import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";

type Params = { params: { id: string } };

type ImportTask = {
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  estimated_hours?: number;
  description?: string;
};

type ImportPhase = {
  name: string;
  tasks?: ImportTask[];
};

type ImportData = {
  phases: ImportPhase[];
  mode?: "replace" | "merge";
};

// MD形式のパース（## Phase名 → - [ ] タスク）
function parseMd(text: string): ImportData {
  const phases: ImportPhase[] = [];
  let currentPhase: ImportPhase | null = null;

  for (const line of text.split("\n")) {
    const phaseMatch = line.match(/^##\s+(.+)/);
    if (phaseMatch) {
      if (currentPhase) phases.push(currentPhase);
      currentPhase = { name: phaseMatch[1].trim(), tasks: [] };
      continue;
    }
    if (currentPhase) {
      const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.+)/);
      if (taskMatch) {
        const done = taskMatch[1] === "x";
        let title = taskMatch[2];
        let priority = "mid";
        let due_date: string | undefined;
        let estimated_hours: number | undefined;

        // [high/mid/low] パース
        const priMatch = title.match(/\[(high|mid|low)\]/);
        if (priMatch) { priority = priMatch[1]; title = title.replace(priMatch[0], "").trim(); }

        // [YYYY-MM-DD] パース
        const dateMatch = title.match(/\[(\d{4}-\d{2}-\d{2})\]/);
        if (dateMatch) { due_date = dateMatch[1]; title = title.replace(dateMatch[0], "").trim(); }

        // [数字h] パース
        const hoursMatch = title.match(/\[(\d+(?:\.\d+)?)h\]/);
        if (hoursMatch) { estimated_hours = parseFloat(hoursMatch[1]); title = title.replace(hoursMatch[0], "").trim(); }

        currentPhase.tasks!.push({
          title: title.trim(),
          status: done ? "done" : "todo",
          priority,
          due_date,
          estimated_hours,
        });
      }
    }
  }
  if (currentPhase) phases.push(currentPhase);
  return { phases };
}

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async (req, _user) => {
    const contentType = req.headers.get("content-type") ?? "";
    let data: ImportData;

    if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
      const text = await req.text();
      data = parseMd(text);
    } else {
      const body = await req.json();
      // MDテキストが "md" フィールドで来た場合
      if (body.md) {
        data = parseMd(body.md);
      } else {
        data = body as ImportData;
      }
    }

    const { phases, mode = "replace" } = data;
    if (!phases?.length) {
      return NextResponse.json({ error: "phases配列が空です" }, { status: 400 });
    }

    // replace モード: 既存WBSを全削除
    if (mode === "replace") {
      const existing = await prisma.wbsPhase.findMany({ where: { projectId: params.id }, select: { id: true } });
      for (const p of existing) {
        await prisma.wbsTask.deleteMany({ where: { phaseId: p.id } });
      }
      await prisma.wbsPhase.deleteMany({ where: { projectId: params.id } });
    }

    // フェーズ・タスク作成
    const VALID_STATUS = ["todo","in_progress","done","blocked"];
    const VALID_PRIORITY = ["high","mid","low"];
    let phaseOrder = 0;

    for (const phase of phases) {
      const created = await prisma.wbsPhase.create({
        data: {
          projectId: params.id,
          name: phase.name,
          sortOrder: phaseOrder++,
        },
      });

      let taskOrder = 0;
      for (const task of (phase.tasks ?? [])) {
        await prisma.wbsTask.create({
          data: {
            phaseId: created.id,
            title: task.title,
            status: VALID_STATUS.includes(task.status ?? "") ? (task.status as "todo"|"in_progress"|"done"|"blocked") : "todo",
            priority: VALID_PRIORITY.includes(task.priority ?? "") ? (task.priority as "high"|"mid"|"low") : "mid",
            dueDate: task.due_date ? new Date(task.due_date) : null,
            estimatedHours: task.estimated_hours ?? null,
            description: task.description ?? null,
            sortOrder: taskOrder++,
          },
        });
      }
    }

    // 進捗キャッシュ更新
    const allTasks = await prisma.wbsTask.findMany({
      where: { phase: { projectId: params.id } },
    });
    const done = allTasks.filter(t => t.status === "done").length;
    const progress = allTasks.length > 0 ? (done / allTasks.length) * 100 : 0;
    await prisma.project.update({
      where: { id: params.id },
      data: { progressCache: progress },
    });

    return NextResponse.json({
      ok: true,
      imported: { phases: phases.length, tasks: allTasks.length },
    });
  });
}
