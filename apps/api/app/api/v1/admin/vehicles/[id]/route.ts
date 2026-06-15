import { vehicleUpdateSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  routeId,
} from "@/src/lib/http";
import {
  deactivateVehicle,
  getVehicle,
  updateVehicle,
} from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  return ok(await getVehicle(user, await routeId(context)));
});

export const PATCH = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, vehicleUpdateSchema);
  return ok(await updateVehicle(user, await routeId(context), input));
});

export const DELETE = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  return ok(await deactivateVehicle(user, await routeId(context)));
});
