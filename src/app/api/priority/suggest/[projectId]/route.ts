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
      select: { name: true, description: true, status: true, category: true, techStack: true, progressCache: true },
    });
    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    let apiKey: string;
    try { apiKey = await getClaudeApiKey(); }
    catch { return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 }); }

    const client = new Anthropic({ apiKey });
    const prompt = `プロジェクト「${project.name}」の優先度を5軸で1〜10で評価してください。

概要: ${project.description ?? "未設定"}
カテゴリ: ${project.category ?? "未設定"}
技術スタック: ${JSON.stringify(project.techStack)}
ステータス: ${project.status}
進捗: ${Number(project.progressCache).toFixed(0)}%

以下のJSON形式のみ出力してください:
{"impact":数値,"urgency":数値,"learning":数値,"cost":数値,"motivation":数値,"reasoning":"理由を100文字以内で"}

- Impact: ビジネス・技術的影響度
- Urgency: 緊急性・締め切り
- Learning: 学習・スキルアップ価値
- Cost: 実装コスト（高いほどコスト大）
- Motivation: モチベーション・楽しさ`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim());
    const { impact, urgency, learning, cost, motivation, reasoning } = result;
    const total = Math.round(Math.min(100, (impact * 3 + urgency * 2 + learning * 2 + (11 - cost) + motivation * 2) / 10));

    return NextResponse.json({
      suggested_scores: { impact, urgency, learning, cost, motivation },
      total_score: total,
      reasoning,
    });
  });
}
