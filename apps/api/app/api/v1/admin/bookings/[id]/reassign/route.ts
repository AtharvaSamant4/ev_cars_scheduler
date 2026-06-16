import { ReassignReason } from "@society-ev/db";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { reassignBooking } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reassignSchema = z.object({
  reserveVehicleId: z.string().uuid(),
  reason: z.nativeEnum(ReassignReason),
});

export const POST = apiRoute(async (req, { params }) => {
  const user = await requireAuth(req);
  const body = reassignSchema.parse(await req.json());
  const { id } = await params;

  const result = await reassignBooking(
    user,
    id,
    body.reserveVehicleId,
    body.reason,
  );

  return ok(result);
});
