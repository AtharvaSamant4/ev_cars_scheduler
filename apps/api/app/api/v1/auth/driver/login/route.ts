import { driverLoginSchema } from "@society-ev/contracts";

import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { enforceLoginRateLimit } from "@/src/lib/rate-limit";
import { driverLogin } from "@/src/modules/auth/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request) => {
  enforceLoginRateLimit(request, "auth:driver");
  const input = await parseBody(request, driverLoginSchema);
  return ok(await driverLogin(input));
});
