import { flatUpdateSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  routeId,
} from "@/src/lib/http";
import {
  deactivateFlat,
  getFlat,
  updateFlat,
} from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  return ok(await getFlat(user, await routeId(context)));
});

export const PATCH = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, flatUpdateSchema);
  return ok(await updateFlat(user, await routeId(context), input));
});

export const DELETE = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  return ok(await deactivateFlat(user, await routeId(context)));
});
