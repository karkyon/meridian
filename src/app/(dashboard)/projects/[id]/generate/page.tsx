import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import GenerateClient from "@/components/ai/GenerateClient";

type Params = { params: { id: string } };

export default async function GeneratePage({ params }: Params) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect(`/projects/${params.id}`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, description: true,
      category: true, techStack: true,
      documents: { select: { docType: true, content: true, version: true } },
    },
  });
  if (!project) notFound();

  // APIキー設定済みか確認
  const settings = await prisma.settings.findFirst({ select: { claudeApiKeyEncrypted: true } });
  const hasApiKey = !!settings?.claudeApiKeyEncrypted;

  return (
    <>
      <TopBar title={`${project.name} — AI生成`}
        backHref={`/projects/${params.id}`} backLabel="プロジェクトに戻る" />
      <GenerateClient project={project} hasApiKey={hasApiKey} />
    </>
  );
}
