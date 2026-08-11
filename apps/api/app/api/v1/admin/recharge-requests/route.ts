import { UserRole } from "@society-ev/db";
import { z } from "zod";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseQuery } from "@/src/lib/http";
import { getAllRechargeRequests } from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).default("ALL"),
});

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const { page, status } = parseQuery(request, querySchema);

  const result = await getAllRechargeRequests(user, page, status);
  return ok(result);
});
