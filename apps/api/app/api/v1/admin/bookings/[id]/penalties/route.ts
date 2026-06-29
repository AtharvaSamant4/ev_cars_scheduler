import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { penaltyApplySchema } from "@society-ev/contracts";
import { applyPenalty } from "@/src/modules/penalties/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth(request);
  const { id } = await params;
  const body = await request.json();
  const data = penaltyApplySchema.parse(body);

  const penalty = await applyPenalty(user, id, data.penaltyRuleId, data.notes);
  return NextResponse.json({ data: penalty }, { status: 201 });
}
