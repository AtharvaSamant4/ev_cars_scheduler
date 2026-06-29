import {
  adminEntityListQuerySchema,
  driverCreateSchema,
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
  createDriver,
  listDrivers,
} from "@/src/modules/drivers/service";

export const runtime = "nodejs";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  return ok(await listDrivers(user, includeInactive));
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, driverCreateSchema);

  return ok(await createDriver(user, input));
});
