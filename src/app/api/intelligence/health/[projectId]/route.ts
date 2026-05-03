import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/api-helpers";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { projectId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  return withAdmin(req, async () => {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, name: true, techStack: true },
    });

    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const techStack = Array.isArray(project.techStack) ? (project.techStack as string[]) : [];
    if (techStack.length === 0) {
      return NextResponse.json({
        overall_score: 100,
        techs: [],
        message: "技術スタックが設定されていません",
      });
    }

    let techs: Array<{
      name: string;
      current_version: string | null;
      latest_version: string | null;
      status: string;
      risk: string;
      notes: string;
    }> = [];

    try {
      const apiKey = await getClaudeApiKey();
      const client = new Anthropic({ apiKey });

      const prompt = `以下の技術スタックについて、2026年5月時点での健全性を評価してください。

技術スタック: ${techStack.join(", ")}

各技術について以下の情報をJSON配列で返してください：
- name: 技術名
- current_version: 一般的に使われているバージョン（不明なら"unknown"）
- latest_version: 最新安定版（不明なら"unknown"）
- status: "latest" | "minor_behind" | "major_behind" | "deprecated" | "eol"
- risk: "low" | "medium" | "high" | "critical"
- notes: 1〜2文の日本語説明（LTS情報・サポート期限・移行推奨など）

JSONのみ出力してください（配列形式）。`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const clean = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      techs = JSON.parse(clean);
    } catch {
      // フォールバック: 基本情報のみ
      techs = techStack.map((tech) => ({
        name: tech,
        current_version: null,
        latest_version: null,
        status: "latest",
        risk: "low",
        notes: "評価できませんでした（Claude APIエラー）",
      }));
    }

    // DBに保存
    await prisma.healthScore.deleteMany({ where: { projectId: params.projectId } });
    await prisma.healthScore.createMany({
      data: techs.map((t) => ({
        projectId: params.projectId,
        techName: t.name,
        currentVersion: t.current_version,
        latestVersion: t.latest_version,
        status: (t.status as "latest" | "minor_behind" | "major_behind" | "deprecated" | "eol") ?? "latest",
        riskLevel: (t.risk as "low" | "medium" | "high" | "critical") ?? "low",
        notes: t.notes,
        evaluatedAt: new Date(),
      })),
    });

    // 総合スコア計算
    const riskScores: Record<string, number> = { low: 100, medium: 70, high: 40, critical: 10 };
    const overallScore = techs.length > 0
      ? Math.round(techs.reduce((s, t) => s + (riskScores[t.risk] ?? 80), 0) / techs.length)
      : 100;

    // healthScore をプロジェクトにキャッシュ
    await prisma.project.update({
      where: { id: params.projectId },
      data: { healthScore: overallScore },
    });

    return NextResponse.json({ overall_score: overallScore, techs });
  });
}
