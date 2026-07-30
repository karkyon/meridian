// src/app/api/projects/[id]/overview/autofill/route.ts
//
// 概要タブ（README強化フィールド）と技術スタックを、
// GitHubリポジトリの実コード + プロジェクト内の全資料（標準ドキュメント・
// カスタムドキュメント・添付資料）から突き合わせてAIが自動で埋めるエンドポイント。
//
// 認証: 管理者セッション or インポート専用APIキー（一括バッチ実行用）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminOrImportKey } from "@/lib/api-helpers";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { getClaudeApiKey } from "@/lib/claude-helpers";
import { getGitHubPat, parseRepoFromUrl, fetchGitHubRepoInfo } from "@/lib/github-helpers";
import { scanFieldsForSecrets, scanEnvVarsForSecrets } from "@/lib/secret-scan";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: { id: string } };

const MODEL = "claude-sonnet-4-5";

// GitHub上で内容を読みたい代表的なマニフェスト/設定ファイル
const KEY_FILE_CANDIDATES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
  "README.md",
  "README",
  ".env.example",
  "prisma/schema.prisma",
];

// { } の深さ追跡による正確なJSON抽出（既存 analysis/route.ts と同じ方式）
function extractJson(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("JSON開始位置({)が見つかりません");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`JSONが不完全です（閉じ括弧不足。取得文字数: ${text.length}）`);
}

async function fetchGithubFileContent(
  owner: string,
  repo: string,
  path: string,
  pat: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.encoding === "base64" && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 4000);
    }
    return null;
  } catch {
    return null;
  }
}

const VALID_TECH_CATEGORIES = [
  "language", "frontend", "backend", "database", "orm",
  "auth", "infra", "ai_ml", "testing", "tooling", "other",
] as const;

type AiTechStackItem = { name: string; category: string; version?: string; notes?: string };
type AiKeyFeature = { title: string; description?: string };
type AiEnvVar = { key: string; description?: string; required?: boolean; isSecret?: boolean };
type AiExternalDep = { name: string; purpose?: string; url?: string };

type AiOverviewResult = {
  tagline?: string;
  description?: string;
  purpose?: string;
  target_users?: string;
  scope?: string;
  key_features?: AiKeyFeature[];
  setup_instructions?: string;
  env_vars?: AiEnvVar[];
  external_dependencies?: AiExternalDep[];
  license?: string;
  roadmap?: string;
  known_issues?: string;
  security_notes?: string;
  tech_stack?: AiTechStackItem[];
  consistency_notes?: string; // 資料とコードの間で見つかった不整合の指摘（保存はせずレスポンスのみ）
};

export async function POST(req: NextRequest, { params }: Params) {
  return withAdminOrImportKey(req, async (req, ctx) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        documents: { select: { docType: true, content: true, completeness: true } },
        customDocuments: { select: { customTypeKey: true, customTypeLabel: true, content: true } },
        attachments: { select: { originalName: true, fileType: true, extractedText: true } },
        techStacks: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    let apiKey: string;
    try {
      apiKey = await getClaudeApiKey();
    } catch {
      return NextResponse.json({ error: "CLAUDE_API_KEY_NOT_SET" }, { status: 400 });
    }

    // ── GitHub情報収集（リポジトリ未設定・PAT未設定の場合はスキップ） ──
    let githubContext = "※ GitHubリポジトリ未設定のため、資料のみから推定します";
    let githubFilesScanned = 0;
    let latestCommitSha: string | undefined;

    if (project.repositoryUrl) {
      const parsedRepo = parseRepoFromUrl(project.repositoryUrl);
      if (parsedRepo) {
        try {
          const pat = await getGitHubPat();
          const info = await fetchGitHubRepoInfo(parsedRepo.owner, parsedRepo.repo, pat);
          latestCommitSha = info.recentCommits[0]?.sha;

          const treeRes = await fetch(
            `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/git/trees/${info.defaultBranch}?recursive=1`,
            {
              headers: {
                Authorization: `Bearer ${pat}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            }
          );

          let fileTree = "（取得失敗）";
          let filePaths: string[] = [];
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            filePaths = (treeData.tree ?? [])
              .filter((f: { type: string }) => f.type === "blob")
              .map((f: { path: string }) => f.path);
            fileTree = filePaths.slice(0, 400).join("\n");
            githubFilesScanned = filePaths.length;
          }

          // 代表的なマニフェストファイルの中身を取得（存在するもののみ、最大8件）
          const candidatePaths = KEY_FILE_CANDIDATES.filter((c) => filePaths.includes(c)).slice(0, 8);
          const fileContents = await Promise.all(
            candidatePaths.map(async (p) => {
              const content = await fetchGithubFileContent(parsedRepo.owner, parsedRepo.repo, p, pat);
              return content ? `#### ${p}\n\`\`\`\n${content}\n\`\`\`` : null;
            })
          );
          const fileContentsText = fileContents.filter(Boolean).join("\n\n");

          const commitMsgs = info.recentCommits
            .slice(0, 10)
            .map((c) => `- ${c.sha.slice(0, 7)} (${c.date.slice(0, 10)}): ${c.message}`)
            .join("\n");

          githubContext = `## GitHubリポジトリ
- URL: ${project.repositoryUrl}
- 最終push: ${info.lastPushedAt}（${info.daysSinceLastPush}日前）
- 総コミット数: ${info.commitCount}

## 直近コミット
${commitMsgs}

## ファイルツリー（最大400件）
\`\`\`
${fileTree}
\`\`\`

## 主要マニフェスト/設定ファイルの内容
${fileContentsText || "（該当ファイルなし）"}`;
        } catch {
          githubContext = "※ GitHub情報取得失敗（PAT未設定または権限不足の可能性）";
        }
      }
    }

    // ── 資料（標準ドキュメント・カスタムドキュメント・添付資料）収集 ──
    const DOC_LABELS: Record<string, string> = {
      planning: "企画書", requirements: "要件定義書", external_spec: "外部仕様設計書",
      db_spec: "DB仕様設計書", api_spec: "API詳細設計書", wireframe: "ワイヤーフレーム",
    };
    const docsContext = project.documents
      .filter((d: { content: string | null }) => d.content && d.content.length > 0)
      .map((d: { docType: string; content: string | null; completeness: number }) =>
        `### ${DOC_LABELS[d.docType] ?? d.docType}（完成度${d.completeness}%）\n${d.content!.slice(0, 2000)}`)
      .join("\n\n");

    const customDocsContext = project.customDocuments
      .filter((d: { content: string | null }) => d.content && d.content.length > 0)
      .map((d: { customTypeLabel: string; content: string | null }) =>
        `### ${d.customTypeLabel}\n${d.content!.slice(0, 2000)}`)
      .join("\n\n");

    const attachmentsContext = project.attachments
      .filter((a: { extractedText: string | null }) => a.extractedText)
      .map((a: { originalName: string; fileType: string; extractedText: string | null }) =>
        `### ${a.originalName} (${a.fileType})\n${a.extractedText!.slice(0, 800)}`)
      .join("\n\n");

    const existingTechStack = project.techStacks
      .map((t: { category: string; name: string; version: string | null }) =>
        `- [${t.category}] ${t.name}${t.version ? ` v${t.version}` : ""}`)
      .join("\n");

    const existingOverview = `- タグライン: ${project.tagline || "（未入力）"}
- 概要: ${project.description || "（未入力）"}
- 目的: ${project.purpose || "（未入力）"}
- 対象ユーザー: ${project.targetUsers || "（未入力）"}`;

    const client = new Anthropic({ apiKey });

    const prompt = `あなたはシニアソフトウェアアーキテクトです。
以下の「GitHubの実コード」と「プロジェクト内の資料（企画書・要件定義書・README等）」を
突き合わせて、プロジェクトの概要情報と技術スタックを正確に埋めてください。

# プロジェクト名
${project.name}

# 既存の概要情報（参考。空なら新規に埋める）
${existingOverview}

# 既存の技術スタック登録
${existingTechStack || "（未登録）"}

# ${githubContext}

# 標準ドキュメント
${docsContext || "（未作成）"}

# カスタムドキュメント（README等）
${customDocsContext || "（未作成）"}

# 添付資料
${attachmentsContext || "（なし）"}

---

## 重要な制約
- **env_vars には実際の値（トークン・パスワード等）を絶対に含めないこと**。コード中の \`process.env.XXX\` 等から推測できる「キー名」と「用途の説明」のみを記載する。値が読み取れてしまった場合でも記載しない。
- 資料（企画書・仕様書）とGitHubの実コードの内容に食い違いがある場合は、コードの方を正とし、\`consistency_notes\` にその食い違いを具体的に記述する。
- 情報が不足していて確信が持てない項目は、無理に埋めず空文字列のままにする（ハルシネーション厳禁）。
- tech_stack の category は必ず次のいずれか: language, frontend, backend, database, orm, auth, infra, ai_ml, testing, tooling, other
- 日本語で記述する（tech_stack の name/version、コード識別子は除く）。

以下のJSON形式のみ出力してください（前置き・後書き・コードブロック記号は一切不要）。

{
  "tagline": "一言サマリー（60文字以内）",
  "description": "概要（200〜400文字）",
  "purpose": "目的・背景（200〜400文字）",
  "target_users": "対象ユーザー（100〜200文字）",
  "scope": "スコープ・対象範囲（100〜300文字）",
  "key_features": [{"title": "機能名", "description": "説明"}],
  "setup_instructions": "起動手順（コマンド列。改行区切り）",
  "env_vars": [{"key": "ENV_KEY_NAME", "description": "用途", "required": true, "isSecret": true}],
  "external_dependencies": [{"name": "サービス名", "purpose": "用途", "url": ""}],
  "license": "判明すれば記載、不明なら空文字列",
  "roadmap": "今後の予定（コミット履歴やTODOから読み取れる範囲で）",
  "known_issues": "既知の課題（コードコメントやドキュメントから読み取れる範囲で）",
  "security_notes": "認証方式・暗号化方針など（実装から読み取れる範囲で。値は書かない）",
  "tech_stack": [{"name": "Next.js", "category": "frontend", "version": "14.2.18", "notes": ""}],
  "consistency_notes": "資料とコードの食い違いがあれば具体的に記述。なければ空文字列"
}`;

    let raw: string;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      });
      raw = res.content[0].type === "text" ? res.content[0].text : "{}";
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
    } catch (e) {
      return NextResponse.json(
        { error: "CLAUDE_API_ERROR", message: e instanceof Error ? e.message : "unknown" },
        { status: 502 }
      );
    }

    let result: AiOverviewResult;
    try {
      result = JSON.parse(extractJson(raw));
    } catch (e) {
      return NextResponse.json(
        { error: "AI_PARSE_ERROR", message: e instanceof Error ? e.message : "unknown", raw: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    // ── セキュリティ: 秘密情報混入チェック（保存前の最終防波堤） ──
    const secretHits = [
      ...scanFieldsForSecrets({
        security_notes: result.security_notes,
        setup_instructions: result.setup_instructions,
        description: result.description,
        purpose: result.purpose,
      }),
      ...(result.env_vars ? scanEnvVarsForSecrets(result.env_vars).map((h) => ({
        field: `env_vars[${h.index}].${h.field}`,
        matches: h.matches,
      })) : []),
    ];
    if (secretHits.length > 0) {
      return NextResponse.json(
        {
          error: "SECRET_VALUE_DETECTED",
          message: "AI出力に秘密情報らしき値が含まれていたため保存を中止しました。",
          details: secretHits,
        },
        { status: 400 }
      );
    }

    // ── 概要フィールドを保存 ──
    const validKeyFeatures = (result.key_features ?? []).filter((f) => f.title?.trim());
    const validEnvVars = (result.env_vars ?? []).filter((v) => v.key?.trim());
    const validExternalDeps = (result.external_dependencies ?? []).filter((d) => d.name?.trim());

    // Json型フィールドはPrismaの厳密な入力型を避けるため Record<string, unknown> 経由で代入する
    // （既存 PATCH /api/projects/[id]/route.ts と同じパターン）
    const overviewUpdateData: Record<string, unknown> = {
      tagline: result.tagline || project.tagline,
      description: result.description || project.description,
      purpose: result.purpose || project.purpose,
      targetUsers: result.target_users || project.targetUsers,
      scope: result.scope || project.scope,
      setupInstructions: result.setup_instructions || project.setupInstructions,
      license: result.license || project.license,
      roadmap: result.roadmap || project.roadmap,
      knownIssues: result.known_issues || project.knownIssues,
      securityNotes: result.security_notes || project.securityNotes,
    };
    if (validKeyFeatures.length > 0) overviewUpdateData.keyFeatures = validKeyFeatures;
    if (validEnvVars.length > 0) overviewUpdateData.envVars = validEnvVars;
    if (validExternalDeps.length > 0) overviewUpdateData.externalDependencies = validExternalDeps;

    await prisma.project.update({
      where: { id: params.id },
      data: overviewUpdateData,
    });

    // ── 技術スタックを upsert（既存項目は保持しつつ名前一致で更新、新規は追加） ──
    const aiTechItems = (result.tech_stack ?? []).filter(
      (t): t is AiTechStackItem & { category: (typeof VALID_TECH_CATEGORIES)[number] } =>
        !!t.name?.trim() && (VALID_TECH_CATEGORIES as readonly string[]).includes(t.category)
    );
    const maxOrder = await prisma.projectTechStack.aggregate({
      where: { projectId: params.id },
      _max: { sortOrder: true },
    });
    let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    for (const item of aiTechItems) {
      await prisma.projectTechStack.upsert({
        where: { projectId_name: { projectId: params.id, name: item.name } },
        update: {
          category: item.category,
          version: item.version || null,
          notes: item.notes || null,
        },
        create: {
          projectId: params.id,
          name: item.name,
          category: item.category,
          version: item.version || null,
          notes: item.notes || null,
          sortOrder: nextOrder++,
        },
      });
    }
    // 旧カラム(techStack JSON)を新テーブルに同期（既存のsyncLegacyTechStackと同等の処理）
    const allTechItems = await prisma.projectTechStack.findMany({
      where: { projectId: params.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { name: true, version: true },
    });
    await prisma.project.update({
      where: { id: params.id },
      data: { techStack: allTechItems.map((t: { name: string; version: string | null }) => (t.version ? `${t.name} ${t.version}` : t.name)) },
    });

    if (ctx.via === "session") {
      writeAuditLog({
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        action: "PROJECT_UPDATE",
        resourceType: "project",
        resourceId: params.id,
        resourceName: project.name,
        newValues: { ai_overview_autofill: true, tech_stack_count: aiTechItems.length },
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }

    return NextResponse.json({
      ok: true,
      applied: {
        tagline: result.tagline || null,
        key_features_count: validKeyFeatures.length,
        env_vars_count: validEnvVars.length,
        external_dependencies_count: validExternalDeps.length,
        tech_stack_count: aiTechItems.length,
      },
      consistency_notes: result.consistency_notes || null,
      github_files_scanned: githubFilesScanned,
      github_commit_sha: latestCommitSha || null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  });
}
