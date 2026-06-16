import { z } from "zod";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { verifyBookingOtp } from "@/src/modules/drivers/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyOtpSchema = z.object({
  otp: z.string().length(6),
});

export const POST = apiRoute(async (req, { params }) => {
  const user = await requireAuth(req);
  const body = verifyOtpSchema.parse(await req.json());
  
  const { id } = await params;
  const result = await verifyBookingOtp(user, id, body.otp);
  return ok(result);
});
