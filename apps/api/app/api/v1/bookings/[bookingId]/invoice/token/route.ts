import { UserRole } from "@society-ev/db";

import { issueInvoiceDownloadToken, requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, routeId } from "@/src/lib/http";
import { getResidentBooking } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.RESIDENT);
  const bookingId = await routeId(context, "bookingId");

  const booking = await getResidentBooking(user, bookingId);
  if (!booking.invoice) {
    return ok({ downloadToken: null, available: false });
  }

  return ok({
    downloadToken: await issueInvoiceDownloadToken(user, bookingId),
    available: true,
  });
});
