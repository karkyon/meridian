import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, getClientIp, getUserAgent } from "@/lib/audit";
import { withAuth, withAdmin } from "@/lib/api-helpers";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async () => {
    const documents = await prisma.document.findMany({
      where: { projectId: params.id },
      select: {
        id: true,
        docType: true,
        completeness: true,
        aiGenerated: true,
        version: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ documents });
  });
}
