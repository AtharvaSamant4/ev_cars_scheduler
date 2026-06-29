import { NextResponse } from "next/server";
import { prisma, TransactionType } from "@society-ev/db";

export async function POST(req: Request) {
  try {
    const { amount, userId } = await req.json();

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_AMOUNT", message: "Valid amount is required" } },
        { status: 400 },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: { code: "MISSING_USER_ID", message: "User ID is required" } },
        { status: 400 },
      );
    }

    // Find the exact resident
    const resident = await prisma.user.findFirst({
      where: { id: userId, role: "RESIDENT" },
      include: { wallet: true },
    });

    if (!resident || !resident.wallet) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No resident found to recharge." } },
        { status: 404 },
      );
    }

    // Add transaction and update wallet
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: resident.wallet!.id,
          amount,
          type: TransactionType.CREDIT,
          description: "Mock QR Demo Recharge",
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: resident.wallet!.id },
        data: {
          balance: { increment: amount },
        },
      });

      return { transaction, wallet: updatedWallet };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Mock public recharge error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process recharge" } },
      { status: 500 },
    );
  }
}
