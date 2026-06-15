import {
  bookingListQuerySchema,
  bookingRangeSchema,
  bookingCreateSchema,
} from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  parseQuery,
} from "@/src/lib/http";
import {
  createBooking,
  listResidentBookings,
} from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const query = parseQuery(request, bookingListQuerySchema);
  return ok(
    await listResidentBookings(
      user,
      query.view,
      query.page,
      query.pageSize,
    ),
  );
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const input = await parseBody(request, bookingCreateSchema);
  return ok(await createBooking(user, input.startTime, input.endTime, input.vehicleId), 201);
});
