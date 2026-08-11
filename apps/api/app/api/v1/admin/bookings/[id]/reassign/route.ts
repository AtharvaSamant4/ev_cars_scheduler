import { ReassignReason, UserRole } from "@society-ev/db";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { reassignBooking } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reassignSchema = z.object({
  reserveVehicleId: z.string().uuid(),
  reason: z.nativeEnum(ReassignReason),
});

export const POST = apiRoute(async (req, context) => {
  const user = await requireAuth(req, UserRole.ADMIN);
  const body = await parseBody(req, reassignSchema);
  const id = await routeId(context);

  const result = await reassignBooking(
    user,
    id,
    body.reserveVehicleId,
    body.reason,
  );

  return ok(result);
});
