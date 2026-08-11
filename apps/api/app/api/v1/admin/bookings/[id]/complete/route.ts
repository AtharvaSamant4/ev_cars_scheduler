import { UserRole } from "@society-ev/db";
import { tripCompletionSchema } from "@society-ev/contracts";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseOptionalBody, routeId } from "@/src/lib/http";
import { completeTrip } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const id = await routeId(context);
  
  const body = await parseOptionalBody(request, tripCompletionSchema);

  const result = await completeTrip(user, id, body.actualEndTime);
  return ok(result);
});
