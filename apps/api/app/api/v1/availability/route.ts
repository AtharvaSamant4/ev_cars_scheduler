import { bookingRangeSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseQuery } from "@/src/lib/http";
import { checkAvailability } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const query = parseQuery(request, bookingRangeSchema);
  return ok(await checkAvailability(user, query.startTime, query.endTime));
});
