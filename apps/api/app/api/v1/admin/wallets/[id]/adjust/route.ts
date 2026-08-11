import { z } from "zod";
import { TransactionType, UserRole } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok, parseBody, routeId } from "@/src/lib/http";
import { adjustWalletBalance } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const adjustSchema = z.object({
  amount: z.number().int().positive(),
  type: z.enum([TransactionType.CREDIT, TransactionType.DEBIT]),
  description: z.string().trim().min(1).max(255),
});

export const POST = apiRoute(async (req, context) => {
  const user = await requireAuth(req, UserRole.ADMIN);
  const body = await parseBody(req, adjustSchema);
  const id = await routeId(context);
  
  const result = await adjustWalletBalance(
    user,
    id,
    body.amount,
    body.type,
    body.description
  );
  
  return ok(result);
});
