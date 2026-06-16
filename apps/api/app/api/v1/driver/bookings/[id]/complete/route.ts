import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { completeBooking } from "@/src/modules/drivers/service";
import { UserRole } from "@society-ev/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (req, { params }) => {
  const user = await requireAuth(req, UserRole.DRIVER);
  const { id } = await params;
  
  const booking = await completeBooking(user, id);
  return ok({ booking });
});
