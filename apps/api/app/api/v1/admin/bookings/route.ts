import { adminBookingListQuerySchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseQuery } from "@/src/lib/http";
import { listAdminBookings } from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const query = parseQuery(request, adminBookingListQuerySchema);
  return ok(await listAdminBookings(user, query));
});
