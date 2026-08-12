import { residentLoginSchema } from "@society-ev/contracts";

import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { enforceLoginRateLimit } from "@/src/lib/rate-limit";
import { loginResident } from "@/src/modules/auth/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request) => {
  enforceLoginRateLimit(request, "auth:resident");
  const input = await parseBody(request, residentLoginSchema);
  return ok(await loginResident(input.flatNumber, input.password, input.societyId));
});
