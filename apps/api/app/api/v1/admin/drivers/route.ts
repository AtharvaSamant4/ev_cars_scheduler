import { driverCreateSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";
import { z } from "zod";

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

const driverListQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const { includeInactive = false } = parseQuery(request, driverListQuerySchema);

  return ok(await listDrivers(user, includeInactive));
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const input = await parseBody(request, driverCreateSchema);

  return ok(await createDriver(user, input));
});
