import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { getResidentWallet } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req) => {
  const user = await requireAuth(req);
  const wallet = await getResidentWallet(user);
  return ok(wallet);
});
