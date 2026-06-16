import { driverUpdateSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  routeId,
} from "@/src/lib/http";
import { updateDriver } from "@/src/modules/admin/service";

export const runtime = "nodejs";

export const PUT = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const driverId = await routeId(context);
  const input = await parseBody(request, driverUpdateSchema);

  return ok(await updateDriver(user, driverId, input));
});
