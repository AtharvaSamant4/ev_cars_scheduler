import { UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { getAllRechargeRequests } from "@/src/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const user = await requireAuth(request, UserRole.ADMIN);
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const status = searchParams.get("status") ?? "ALL";

  const result = await getAllRechargeRequests(user, page, status);
  return ok(result);
});
