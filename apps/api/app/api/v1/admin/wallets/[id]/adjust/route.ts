import { z } from "zod";
import { TransactionType } from "@society-ev/db";
import { requireAuth } from "@/src/lib/auth";
import { apiRoute, ok } from "@/src/lib/http";
import { adjustWalletBalance } from "@/src/modules/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const adjustSchema = z.object({
  amount: z.number().int().positive(),
  type: z.nativeEnum(TransactionType),
  description: z.string().min(1).max(255),
});

export const POST = apiRoute(async (req, { params }) => {
  const user = await requireAuth(req);
  const body = adjustSchema.parse(await req.json());
  const { id } = await params;
  
  const result = await adjustWalletBalance(
    user,
    id,
    body.amount,
    body.type,
    body.description
  );
  
  return ok(result);
});
