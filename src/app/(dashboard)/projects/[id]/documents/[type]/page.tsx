import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import DocumentEditor from "@/components/documents/DocumentEditor";

// ============================================================
// DocTypeキーはDB enum値に完全統一
// DB: planning / requirements / external_spec / db_spec / api_spec / wireframe
// ============================================================
const DOC_TYPES = [
  "planning", "requirements", "external_spec", "db_spec", "api_spec", "wireframe"
] as const;
type DocType = (typeof DOC_TYPES)[number];

const DOC_LABELS: Record<DocType, string> = {
  planning:      "企画書",
  requirements:  "要件定義書",
  external_spec: "外部仕様設計書",
  db_spec:       "DB仕様設計書",
  api_spec:      "API詳細設計書",
  wireframe:     "ワイヤーフレーム",
};

type Params = { params: { id: string; type: string } };

export default async function DocumentPage({ params }: Params) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string })?.role ?? "viewer";

  // DocTypeバリデーション
  if (!DOC_TYPES.includes(params.type as DocType)) notFound();
  const docType = params.type as DocType;

  // プロジェクト取得
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  // ドキュメント取得（存在しない場合はnull = 新規作成モード）
  const doc = await prisma.document.findUnique({
    where: {
      projectId_docType: { projectId: params.id, docType },
    },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          originalName: true,
          fileType: true,
          fileSize: true,
          isEditable: true,
          createdAt: true,
          completeness: true,
          version: true,
        },
      },
      versions: {
        orderBy: { version: "desc" },
        take: 5,
        select: { version: true, createdAt: true, aiGenerated: true },
      },
    },
  });

  return (
    <>
      <TopBar
        title={`${project.name} — ${DOC_LABELS[docType]}`}
        backHref={`/projects/${params.id}`}
        backLabel={project.name}
      />
      <DocumentEditor
        projectId={params.id}
        projectName={project.name}
        docType={docType}
        initialContent={doc?.content ?? ""}
        initialCompleteness={doc?.completeness ?? 0}
        version={doc?.version ?? 1}
        initialFiles={(doc?.files ?? []).map((f: any) => ({
          id: f.id,
          originalName: f.originalName,
          fileType: f.fileType,
          fileSize: f.fileSize,
          isEditable: f.isEditable,
          createdAt: f.createdAt.toISOString(),
          completeness: f.completeness ?? 0,
          version: f.version ?? 1,
        }))}
        versions={(doc?.versions ?? []).map((v: any) => ({
          version: v.version,
          createdAt: v.createdAt.toISOString(),
          aiGenerated: v.aiGenerated,
        }))}
        role={role}
      />
    </>
  );
}

export async function generateMetadata({ params }: Params) {
  const label = DOC_LABELS[params.type as DocType] ?? "ドキュメント";
  return { title: `${label} — Meridian` };
}
