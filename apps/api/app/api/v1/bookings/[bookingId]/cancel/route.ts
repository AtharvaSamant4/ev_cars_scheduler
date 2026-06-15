import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, routeId } from "@/src/lib/http";
import { cancelBooking } from "@/src/modules/bookings/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const bookingId = await routeId(context, "bookingId");
  return ok(await cancelBooking(user, bookingId));
});
