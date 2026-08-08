import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { rechargeRequestProcessSchema } from "@society-ev/contracts";
import { processRechargeRequest } from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const data = await parseBody(request, rechargeRequestProcessSchema);
  const result = await processRechargeRequest(user, await routeId(context), data.action);
  return ok(result);
});
