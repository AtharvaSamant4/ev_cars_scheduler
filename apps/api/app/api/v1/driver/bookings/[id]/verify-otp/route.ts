import { UserRole } from "@society-ev/db";
import { z } from "zod";

import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { verifyOtp } from "@/src/modules/bookings/service";

const schema = z.object({
  otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d+$/, "OTP must contain only numbers"),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request, context: any) => {
  const user = await requireAuth(request, UserRole.DRIVER);
  const data = await parseBody(request, schema);
  const id = await routeId(context);
  const result = await verifyOtp(user, id, data.otp);
  return ok(result);
});
