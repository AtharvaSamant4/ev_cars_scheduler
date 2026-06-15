import { residentLoginSchema } from "@society-ev/contracts";

import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { loginResident } from "@/src/modules/auth/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request) => {
  const input = await parseBody(request, residentLoginSchema);
  return ok(await loginResident(input.flatNumber, input.password));
});
