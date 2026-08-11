import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { penaltyApplySchema } from "@society-ev/contracts";
import { applyPenalty } from "@/src/modules/penalties/service";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const id = await routeId(context);
  const data = await parseBody(request, penaltyApplySchema);

  const penalty = await applyPenalty(user, id, data.penaltyRuleId, data.notes);
  return ok(penalty, 201);
});
