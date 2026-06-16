import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { driverDashboard } from "@/src/modules/drivers/service";

export const runtime = "nodejs";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.DRIVER);

  return ok(await driverDashboard(user));
});
