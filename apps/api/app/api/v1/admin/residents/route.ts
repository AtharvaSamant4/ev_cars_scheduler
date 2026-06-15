import {
  adminEntityListQuerySchema,
  residentCreateSchema,
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
  createResident,
  listResidents,
} from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const query = parseQuery(request, adminEntityListQuerySchema);
  return ok(
    await listResidents(user, query.page, query.pageSize, query.isActive),
  );
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, residentCreateSchema);
  return ok(await createResident(user, input), 201);
});
