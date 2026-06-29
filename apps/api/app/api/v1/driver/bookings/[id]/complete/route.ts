import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, routeId } from "@/src/lib/http";
import { completeTrip } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context: any) => {
  const user = await requireAuth(request, UserRole.DRIVER);
  const id = await routeId(context);
  
  let actualEndTimeValue: string | undefined;
  try {
    const body = await request.json();
    actualEndTimeValue = body?.actualEndTime;
  } catch {
    // ignore parsing error
  }

  const result = await completeTrip(user, id, actualEndTimeValue);
  return ok(result);
});
