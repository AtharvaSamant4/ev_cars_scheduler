import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { rechargeRequestProcessSchema } from "@society-ev/contracts";
import { processRechargeRequest } from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, { params }: { params: { id: string } }) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const data = await parseBody(request, rechargeRequestProcessSchema);
  const result = await processRechargeRequest(user, params.id, data.action);
  return ok(result);
});
