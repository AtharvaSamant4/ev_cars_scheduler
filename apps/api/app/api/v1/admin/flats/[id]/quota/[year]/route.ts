import { quotaUpdateSchema } from "@society-ev/contracts";
import { UserRole } from "@society-ev/db";

import { requireAuth } from "@/src/lib/auth";
import {
  apiRoute,
  ok,
  parseBody,
  routeId,
} from "@/src/lib/http";
import { updateQuota } from "@/src/modules/admin/service";
import { AppError } from "@/src/lib/errors";

export const runtime = "nodejs";

export const PUT = apiRoute(async (request, context) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const flatId = await routeId(context);
  const yearValue = await routeId(context, "year");
  const year = Number(yearValue);

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new AppError(422, "VALIDATION_ERROR", "Year must be 2020-2100");
  }

  const input = await parseBody(request, quotaUpdateSchema);
  return ok(await updateQuota(user, flatId, year, input.allocatedMinutes));
});
