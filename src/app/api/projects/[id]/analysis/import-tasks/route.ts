// src/app/api/projects/[id]/analysis/import-tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

type Params = { params: { id: string } };

// POST: 選択した提案タスクをWBSに一括取り込み
export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const body = await req.json();
    const { taskIds }: { taskIds: string[] } = body;

    if (!taskIds || taskIds.length === 0) {
      return NextResponse.json({ error: "taskIds required" }, { status: 400 });
    }

    // 取り込み対象タスクを取得
    const suggestedTasks = await prisma.analysisSuggestedTask.findMany({
      where: {
        id: { in: taskIds },
        imported: false,
        analysis: { projectId: params.id },
      },
    });

    if (suggestedTasks.length === 0) {
      return NextResponse.json({ error: "NO_VALID_TASKS" }, { status: 400 });
    }

    // フェーズ名でグルーピング
    const phaseMap = new Map<string, typeof suggestedTasks>();
    for (const task of suggestedTasks) {
      if (!phaseMap.has(task.phaseName)) phaseMap.set(task.phaseName, []);
      phaseMap.get(task.phaseName)!.push(task);
    }

    const importedTaskIds: { suggestedId: string; wbsTaskId: string }[] = [];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const [phaseName, tasks] of Array.from(phaseMap.entries())) {
        // 同名フェーズが既存か確認、なければ作成
        let phase = await tx.wbsPhase.findFirst({
          where: { projectId: params.id, name: phaseName },
        });

        if (!phase) {
          const maxOrder = await tx.wbsPhase.findFirst({
            where: { projectId: params.id },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
          });
          phase = await tx.wbsPhase.create({
            data: {
              projectId: params.id,
              name: phaseName,
              sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
            },
          });
        }

        // 既存タスクの最大sortOrderを取得
        const maxTaskOrder = await tx.wbsTask.findFirst({
          where: { phaseId: phase.id },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        let sortOrder = (maxTaskOrder?.sortOrder ?? 0) + 1;

        // タスクを一件ずつ作成
        for (const task of tasks) {
          const wbsTask = await tx.wbsTask.create({
            data: {
              phaseId: phase.id,
              title: task.title,
              description: task.description ?? null,
              priority: task.priority as "high" | "mid" | "low",
              estimatedHours: task.estimatedHours ?? null,
              sortOrder: sortOrder++,
              aiGenerated: true,
            },
          });

          importedTaskIds.push({ suggestedId: task.id, wbsTaskId: wbsTask.id });
        }
      }

      // 取り込み済みフラグを更新
      for (const { suggestedId, wbsTaskId } of importedTaskIds) {
        await tx.analysisSuggestedTask.update({
          where: { id: suggestedId },
          data: {
            imported: true,
            importedTaskId: wbsTaskId,
            importedAt: new Date(),
          },
        });
      }

      // プロジェクトのupdatedAtを更新
      await tx.project.update({
        where: { id: params.id },
        data: { updatedAt: new Date() },
      });
    });

    return NextResponse.json({
      imported: importedTaskIds.length,
      tasks: importedTaskIds,
    });
  });
}