import { prisma, TransactionType } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

export async function getCancellationPenaltyAmount(user: AuthUser) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view penalty settings");
  }

  const rule = await prisma.penaltyRule.findUnique({
    where: {
      societyId_code: {
        societyId: user.societyId,
        code: "CANCELLATION",
      },
    },
  });

  return { amount: rule?.amount ?? 0 };
}

export async function updateCancellationPenaltyAmount(user: AuthUser, amount: number) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can update penalty settings");
  }

  const rule = await prisma.penaltyRule.upsert({
    where: {
      societyId_code: {
        societyId: user.societyId,
        code: "CANCELLATION",
      },
    },
    update: { amount },
    create: {
      societyId: user.societyId,
      code: "CANCELLATION",
      name: "Cancellation Penalty",
      amount,
      isActive: true,
      description: "Penalty automatically deducted upon booking cancellation",
    },
  });

  return { amount: rule.amount };
}

export async function applyPenalty(
  user: AuthUser,
  bookingId: string,
  penaltyRuleId: string,
  notes?: string
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can apply penalties");
  }

  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });

    if (!booking || booking.societyId !== user.societyId) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }

    const rule = await tx.penaltyRule.findUnique({
      where: { id: penaltyRuleId },
    });

    if (!rule || rule.societyId !== user.societyId) {
      throw new AppError(404, "NOT_FOUND", "Penalty rule not found");
    }

    if (!rule.isActive) {
      throw new AppError(400, "INACTIVE_RULE", "Cannot apply an inactive penalty rule");
    }

    // Check for existing penalty of the same rule on this booking
    const existingPenalty = await tx.penalty.findUnique({
      where: {
        bookingId_penaltyRuleId: {
          bookingId,
          penaltyRuleId,
        },
      },
    });

    if (existingPenalty) {
      throw new AppError(409, "DUPLICATE_PENALTY", "This penalty rule has already been applied to this booking");
    }

    // Create Penalty Record
    const penalty = await tx.penalty.create({
      data: {
        bookingId,
        penaltyRuleId,
        amount: rule.amount,
        notes,
        createdByAdminId: user.id,
      },
    });

    // Handle Wallet Deduction
    let wallet = await tx.wallet.findUnique({
      where: { userId: booking.userId },
    });

    if (!wallet) {
      // Create wallet if it doesn't exist (edge case, usually seeded)
      wallet = await tx.wallet.create({
        data: {
          userId: booking.userId,
          balance: 0,
        },
      });
    }

    // Update wallet balance, allowing it to go negative
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { decrement: rule.amount },
        transactions: {
          create: {
            amount: rule.amount,
            type: TransactionType.PENALTY,
            description: `Penalty: ${rule.name}`,
            bookingId: booking.id,
          },
        },
      },
    });

    return penalty;
  });
}
