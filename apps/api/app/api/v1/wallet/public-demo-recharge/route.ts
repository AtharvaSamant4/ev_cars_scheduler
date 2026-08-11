import { z } from "zod";

import { isSafeLocalDemoDatabase } from "@/src/lib/demo-database";
import { AppError } from "@/src/lib/errors";
import { apiRoute, ok, parseBody } from "@/src/lib/http";
import { publicDemoRechargeWallet } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicDemoRechargeSchema = z
  .object({
    userId: z.string().uuid(),
    amount: z.number().int().min(1).max(10_000),
  })
  .strict();

export const POST = apiRoute(async (request) => {
  if (!isSafeLocalDemoDatabase()) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  const { amount, userId } = await parseBody(request, publicDemoRechargeSchema);
  const result = await publicDemoRechargeWallet(userId, amount);
  return ok(result);
});
