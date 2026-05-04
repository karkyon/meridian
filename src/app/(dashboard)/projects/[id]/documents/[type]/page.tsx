import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import DocumentEditor from "@/components/documents/DocumentEditor";

const DOC_TYPES = ["planning", "requirements", "external_spec", "db_spec", "api_spec"] as const;
type DocType = (typeof DOC_TYPES)[number];

const DOC_LABELS: Record<DocType, string> = {
  planning: "企画書",
  requirements: "要件定義書",
  external_spec: "外部仕様設計書",
  db_spec: "DB仕様設計書",
  api_spec: "API詳細設計書",
};

type Params = { params: { id: string; type: string } };

export default async function DocumentPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  if (!DOC_TYPES.includes(params.type as DocType)) notFound();

  const document = await prisma.document.findUnique({
    where: { projectId_docType: { projectId: params.id, docType: params.type as DocType } },
    include: { project: { select: { id: true, name: true } } },
  });
  if (!document) notFound();

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: document.id },
    orderBy: { version: "desc" },
    take: 5,
    select: { version: true, createdAt: true, aiGenerated: true },
  });

  return (
    <>
      <TopBar title={`${document.project.name} — ${DOC_LABELS[params.type as DocType]}`} />
      <DocumentEditor
        projectId={params.id}
        docType={params.type}
        docTypeLabel={DOC_LABELS[params.type as DocType]}
        projectName={document.project.name}
        initialContent={document.content ?? ""}
        initialCompleteness={document.completeness}
        version={document.version}
        aiGenerated={document.aiGenerated}
        versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
        role={role}
      />
    </>
  );
}
