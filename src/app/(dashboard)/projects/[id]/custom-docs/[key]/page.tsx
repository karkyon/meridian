import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import CustomDocEditor from "@/components/custom-docs/CustomDocEditor";

type Params = { params: { id: string; key: string } };

export default async function CustomDocPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  // タイプ名取得
  const globalType = await prisma.customDocType.findUnique({ where: { key: params.key } });
  const projectType = !globalType
    ? await prisma.projectCustomDocType.findUnique({
        where: { projectId_key: { projectId: params.id, key: params.key } },
      })
    : null;
  const typeInfo = globalType ?? projectType;
  if (!typeInfo) notFound();

  // ドキュメントと添付ファイル
  const doc = await prisma.customDocument.findUnique({
    where: { projectId_customTypeKey: { projectId: params.id, customTypeKey: params.key } },
    include: {
      files: { orderBy: { createdAt: "desc" } },
      versions: { orderBy: { version: "desc" }, take: 5, select: { version: true, createdAt: true, aiGenerated: true } },
    },
  });

  return (
    <>
      <TopBar title={`${project.name} — ${typeInfo.label}`}
        backHref={`/projects/${params.id}`} backLabel={project.name} />
      <CustomDocEditor
        projectId={params.id}
        projectName={project.name}
        typeKey={params.key}
        typeLabel={typeInfo.label}
        initialContent={doc?.content ?? ""}
        initialCompleteness={doc?.completeness ?? 0}
        version={doc?.version ?? 1}
        initialFiles={(doc?.files ?? []).map((f) => ({
          id: f.id,
          originalName: f.originalName,
          fileType: f.fileType,
          fileSize: f.fileSize,
          isEditable: f.isEditable,
          createdAt: f.createdAt.toISOString(),
        }))}
        versions={(doc?.versions ?? []).map((v) => ({
          version: v.version,
          createdAt: v.createdAt.toISOString(),
          aiGenerated: v.aiGenerated,
        }))}
        role={role}
      />
    </>
  );
}
