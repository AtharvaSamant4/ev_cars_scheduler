import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, routeId } from "@/src/lib/http";
import { driverArrive } from "@/src/modules/bookings/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context: any) => {
  const user = await requireAuth(request, UserRole.DRIVER);
  const id = await routeId(context);
  const result = await driverArrive(user, id);
  return ok(result);
});
