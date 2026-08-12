import { adminLoginSchema } from "@society-ev/contracts";
import { NextResponse } from "next/server";

import { authCookie } from "@/src/lib/auth";
import { apiRoute, parseBody } from "@/src/lib/http";
import { enforceLoginRateLimit } from "@/src/lib/rate-limit";
import { loginAdmin } from "@/src/modules/auth/service";

export const runtime = "nodejs";

export const POST = apiRoute(async (request) => {
  enforceLoginRateLimit(request, "auth:admin");
  const input = await parseBody(request, adminLoginSchema);
  const result = await loginAdmin(input.email, input.password);
  const response = NextResponse.json({ data: result });

  response.cookies.set(authCookie.name, result.token, authCookie.options);
  return response;
});
