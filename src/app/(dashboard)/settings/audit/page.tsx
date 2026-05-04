import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import AuditClient from "@/components/users/AuditClient";

export default async function AuditPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/dashboard");
  return (
    <>
      <TopBar title="監査ログ" />
      <main className="flex-1 p-6">
        <AuditClient />
      </main>
    </>
  );
}
