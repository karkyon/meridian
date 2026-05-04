import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import AttachmentsManager from "@/components/attachments/AttachmentsManager";

type Params = { params: { id: string } };

export default async function AttachmentsPage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? "viewer";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const attachments = await prisma.projectAttachment.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, filename: true, originalName: true, fileType: true,
      mimeType: true, fileSize: true, description: true,
      usedForGeneration: true,
      createdAt: true,
      uploader: { select: { name: true } },
    },
  });

  return (
    <>
      <TopBar title={`${project.name} — 添付資料ライブラリ`} />
      <main className="flex-1 p-6 max-w-3xl">
        <div className="mb-4">
          <p className="text-xs text-slate-500">
            Word / PDF / Markdownファイルを保管し、AI生成の参照資料として活用できます。
          </p>
        </div>
        <AttachmentsManager
          projectId={params.id}
          initialAttachments={attachments.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
          }))}
          role={role}
        />
      </main>
    </>
  );
}
