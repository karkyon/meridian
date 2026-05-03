import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/crypto";

export async function getClaudeApiKey(): Promise<string> {
  const settings = await prisma.settings.findFirst();
  if (!settings?.claudeApiKeyEncrypted || !settings.keyIv) {
    throw new Error("CLAUDE_API_KEY_NOT_SET");
  }
  return decryptApiKey(settings.claudeApiKeyEncrypted, settings.keyIv);
}

export const DOC_TYPE_PROMPTS: Record<string, string> = {
  planning: "企画書",
  requirements: "要件定義書",
  external_spec: "外部仕様設計書",
  db_spec: "DB仕様設計書",
  api_spec: "API詳細設計書",
};

export function buildDocPrompt(
  docType: string,
  projectName: string,
  description: string,
  techStack: string[],
  category: string,
  promptHint: string,
  existingContent?: string
): string {
  const docLabel = DOC_TYPE_PROMPTS[docType] ?? docType;
  const techStr = techStack.length > 0 ? techStack.join(", ") : "未指定";

  let base = `あなたは優秀なソフトウェアエンジニアです。以下のプロジェクト情報をもとに、${docLabel}を日本語で作成してください。

## プロジェクト情報
- プロジェクト名: ${projectName}
- 概要: ${description || "（未入力）"}
- カテゴリ: ${category || "未指定"}
- 技術スタック: ${techStr}
${promptHint ? `\n## 追加指示\n${promptHint}` : ""}

## 要件
- マークダウン形式で記述してください
- 具体的かつ実践的な内容にしてください
- 見出し・表・箇条書きを適切に使用してください`;

  if (existingContent) {
    base += `\n\n## 既存の内容（これを参考に改善・拡充してください）\n${existingContent.slice(0, 2000)}`;
  }

  base += `\n\n## 出力形式\n${docLabel}の内容のみをマークダウンで出力してください。前置き・後書きは不要です。`;

  return base;
}

export function buildWbsPrompt(
  projectName: string,
  description: string,
  techStack: string[],
  category: string
): string {
  const techStr = techStack.length > 0 ? techStack.join(", ") : "未指定";

  return `以下のプロジェクトのWBS（作業分解構造）を生成してください。

## プロジェクト情報
- プロジェクト名: ${projectName}
- 概要: ${description || "（未入力）"}
- カテゴリ: ${category || "未指定"}
- 技術スタック: ${techStr}

## 出力形式
以下のJSON形式で出力してください。フェーズは5〜8個、各フェーズに3〜6タスクを設定してください。
前置き・後書き・コードブロック記号は不要です。JSONのみ出力してください。

{
  "phases": [
    {
      "name": "フェーズ名",
      "color": "#1D6FA4",
      "tasks": [
        {
          "title": "タスク名",
          "priority": "high|mid|low",
          "estimated_hours": 数値
        }
      ]
    }
  ]
}`;
}
