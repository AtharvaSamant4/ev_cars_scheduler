import {
  paginationQuerySchema,
  vehicleCreateSchema,
} from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  parseQuery,
} from "@/src/lib/http";
import {
  createVehicle,
  listVehicles,
} from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const query = parseQuery(request, paginationQuerySchema);
  return ok(await listVehicles(user, query.page, query.pageSize));
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, vehicleCreateSchema);
  return ok(await createVehicle(user, input), 201);
});
