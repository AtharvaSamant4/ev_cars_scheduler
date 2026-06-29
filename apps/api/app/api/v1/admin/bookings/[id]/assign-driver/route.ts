import { bookingAssignDriverSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { assignDriver } from "@/src/modules/bookings/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const bookingId = await routeId(context);
  const input = await parseBody(request, bookingAssignDriverSchema);

  return ok(await assignDriver(user, bookingId, input.driverId));
});
