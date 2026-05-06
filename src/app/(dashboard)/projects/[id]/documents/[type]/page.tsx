/**
 * /src/app/(dashboard)/projects/[id]/documents/[type]/page.tsx
 *
 * 標準ドキュメント編集ページ
 * 対応ドキュメント種別: plan / req / spec / db / api / wireframe
 */

import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/layout/TopBar";
import { DocumentEditor } from "@/components/documents/DocumentEditor";

// ============================================================
// 標準ドキュメント種別の定義
// ============================================================
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  plan:      "企画書",
  req:       "要件定義",
  spec:      "外部仕様設計",
  db:        "DB仕様",
  api:       "API詳細",
  wireframe: "ワイヤーフレーム",  // ← Phase 12追加
};

// ============================================================
// ページコンポーネント
// ============================================================
export default async function DocumentPage({
  params,
}: {
  params: { id: string; type: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();

  const { id: projectId, type: docType } = params;

  // docTypeバリデーション
  if (!DOCUMENT_TYPE_LABELS[docType]) {
    notFound();
  }

  // プロジェクト取得
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  // ドキュメント取得（存在しない場合はnull）
  const doc = await prisma.document.findFirst({
    where: { projectId, type: docType },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          fileType: true,
          fileSize: true,
          createdAt: true,
        },
      },
    },
  });

  // データをシリアライズ（Decimal型をNumber変換）
  const initialContent = doc?.content ?? "";
  const initialVersion = doc ? Number(doc.version) : 0;
  const initialCompleteness = doc ? Number(doc.completeness) : 0;
  const initialFiles = (doc?.files ?? []).map(f => ({
    id: f.id,
    filename: f.filename,
    fileType: f.fileType as "md" | "docx" | "doc" | "pdf" | "html",
    fileSize: Number(f.fileSize),
    createdAt: f.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* TopBar - ‹ プロジェクト名 戻るボタン */}
      <TopBar
        title={`${DOCUMENT_TYPE_LABELS[docType]}`}
        backHref={`/projects/${projectId}`}
        backLabel={project.name}
      />

      {/* エディタ（残り全高さを使用） */}
      <div className="flex-1 min-h-0">
        <DocumentEditor
          projectId={projectId}
          projectName={project.name}
          docType={docType}
          initialContent={initialContent}
          initialVersion={initialVersion}
          initialCompleteness={initialCompleteness}
          initialFiles={initialFiles}
          isCustom={false}
        />
      </div>
    </div>
  );
}

// ============================================================
// メタデータ
// ============================================================
export async function generateMetadata({
  params,
}: {
  params: { id: string; type: string };
}) {
  const label = DOCUMENT_TYPE_LABELS[params.type] ?? "ドキュメント";
  return { title: `${label} — Meridian` };
}