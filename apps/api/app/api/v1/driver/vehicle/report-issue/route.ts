import { UserRole } from "@society-ev/db";
import { reportVehicleIssueSchema } from "@society-ev/contracts";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { reportAssignedVehicleIssue } from "@/src/modules/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.DRIVER);
  const input = await parseBody(request, reportVehicleIssueSchema);
  return ok(await reportAssignedVehicleIssue(user, input.bookingId));
});
