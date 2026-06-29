import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { cancellationPenaltyUpdateSchema } from "@society-ev/contracts";
import { getCancellationPenaltyAmount, updateCancellationPenaltyAmount } from "@/src/modules/penalties/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const data = await getCancellationPenaltyAmount(user);
  return ok(data);
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const data = await parseBody(request, cancellationPenaltyUpdateSchema);
  const rule = await updateCancellationPenaltyAmount(user, data.amount);
  return ok(rule);
});
