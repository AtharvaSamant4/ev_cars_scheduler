import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, routeId } from "@/src/lib/http";
import { completeTrip } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const id = await routeId(context);
  
  let actualEndTimeValue: string | undefined;
  try {
    const body: unknown = await request.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "actualEndTime" in body &&
      typeof body.actualEndTime === "string"
    ) {
      actualEndTimeValue = body.actualEndTime;
    }
  } catch {
    // ignore parsing error
  }

  const result = await completeTrip(user, id, actualEndTimeValue);
  return ok(result);
});
