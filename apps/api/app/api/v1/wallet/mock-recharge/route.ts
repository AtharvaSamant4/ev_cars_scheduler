import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { mockRechargeSchema } from "@society-ev/contracts";
import { mockRechargeWallet } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const data = await parseBody(request, mockRechargeSchema);
  const result = await mockRechargeWallet(user, data.amount);
  return ok(result, 201);
});
