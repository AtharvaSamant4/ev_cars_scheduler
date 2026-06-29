import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { rechargeRequestCreateSchema } from "@society-ev/contracts";
import { createRechargeRequest, getResidentRechargeRequests } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const requests = await getResidentRechargeRequests(user);
  return ok(requests);
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const data = await parseBody(request, rechargeRequestCreateSchema);
  const result = await createRechargeRequest(user, data.amount, data.notes);
  return ok(result, 201);
});
