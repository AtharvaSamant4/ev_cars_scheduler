import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { getNotifications, markNotificationsRead } from "@/src/modules/residents/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request);
  return ok(await getNotifications(user));
});

export const POST = apiRoute(async (request) => {
  const user = await requireAuth(request);
  await markNotificationsRead(user);
  return ok({ success: true });
});
