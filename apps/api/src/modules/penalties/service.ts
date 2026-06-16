import { prisma } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

export async function listPenaltyRules(user: AuthUser) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view penalty rules");
  }

  return await prisma.penaltyRule.findMany({
    where: { societyId: user.societyId },
    orderBy: { hoursBefore: "asc" },
  });
}

export async function createPenaltyRule(
  user: AuthUser,
  hoursBefore: number,
  penaltyAmount: number
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can create penalty rules");
  }

  if (hoursBefore < 0) {
    throw new AppError(400, "INVALID_HOURS", "Hours before must be positive");
  }

  if (penaltyAmount < 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Penalty amount must be positive");
  }

  return await prisma.penaltyRule.create({
    data: {
      societyId: user.societyId,
      hoursBefore,
      penaltyAmount,
    },
  });
}

export async function deletePenaltyRule(user: AuthUser, ruleId: string) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can delete penalty rules");
  }

  const rule = await prisma.penaltyRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule || rule.societyId !== user.societyId) {
    throw new AppError(404, "NOT_FOUND", "Penalty rule not found");
  }

  await prisma.penaltyRule.delete({
    where: { id: ruleId },
  });
}
