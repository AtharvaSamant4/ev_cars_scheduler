import { prisma } from "@society-ev/db";

import { apiRoute, ok } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return ok({ status: "ok", timestamp: new Date().toISOString() });
});
