import { Prisma, TransactionType, prisma } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { isSafeLocalDemoDatabase } from "@/src/lib/demo-database";
import { AppError } from "@/src/lib/errors";

const OPENING_BALANCE = 5_000;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_DEMO_RECHARGE = 10_000;

type ManualAdjustmentType =
  | typeof TransactionType.CREDIT
  | typeof TransactionType.DEBIT;

function requireResident(user: AuthUser) {
  if (user.role !== "RESIDENT") {
    throw new AppError(403, "FORBIDDEN", "Only residents can access this wallet");
  }
}

function requirePositiveIntegerAmount(amount: number, message: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_DATABASE_INTEGER) {
    throw new AppError(400, "INVALID_AMOUNT", message);
  }
}

async function findOrCreateWallet(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  // The unique userId constraint prevents duplicate wallets. The advisory lock
  // additionally keeps the opening balance and its ledger row inseparable when
  // two first-use requests arrive concurrently.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${userId}`}))`;

  const existingWallet = await tx.wallet.findUnique({ where: { userId } });
  if (existingWallet) return existingWallet;

  return tx.wallet.create({
    data: {
      userId,
      balance: OPENING_BALANCE,
      transactions: {
        create: {
          amount: OPENING_BALANCE,
          type: TransactionType.CREDIT,
          description: "Initial Promotional Balance",
        },
      },
    },
  });
}

export async function creditWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  type:
    | typeof TransactionType.CREDIT
    | typeof TransactionType.REFUND
    | typeof TransactionType.RECHARGE,
  description: string,
) {
  requirePositiveIntegerAmount(
    amount,
    "Wallet credit must be a strictly positive whole number",
  );

  const normalizedDescription = description.trim();
  if (!normalizedDescription || normalizedDescription.length > 255) {
    throw new AppError(
      400,
      "INVALID_DESCRIPTION",
      "Description must contain between 1 and 255 characters",
    );
  }

  const wallet = await findOrCreateWallet(tx, userId);
  const balanceMutation = await tx.wallet.updateMany({
    where: {
      id: wallet.id,
      balance: { lte: MAX_DATABASE_INTEGER - amount },
    },
    data: { balance: { increment: amount } },
  });

  if (balanceMutation.count !== 1) {
    throw new AppError(
      400,
      "BALANCE_LIMIT",
      "Wallet balance would exceed the supported limit",
    );
  }

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type,
      description: normalizedDescription,
    },
  });

  return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
}

export async function getResidentWallet(user: AuthUser) {
  requireResident(user);

  return prisma.$transaction(async (tx) => {
    await findOrCreateWallet(tx, user.id);
    return tx.wallet.findUniqueOrThrow({
      where: { userId: user.id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
}

export async function listAllWallets(user: AuthUser) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view all wallets");
  }

  const users = await prisma.user.findMany({
    where: { societyId: user.societyId, role: "RESIDENT" },
    include: {
      flat: { select: { number: true } },
      wallet: true,
    },
    orderBy: { name: "asc" },
  });

  return users.map((resident) => ({
    userId: resident.id,
    name: resident.name,
    phone: resident.phone,
    flat: resident.flat?.number,
    walletId: resident.wallet?.id ?? null,
    // This is the same opening balance that will be atomically persisted with
    // its ledger row on first access or adjustment.
    balance: resident.wallet?.balance ?? OPENING_BALANCE,
  }));
}

export async function adjustWalletBalance(
  adminUser: AuthUser,
  residentUserId: string,
  amount: number,
  type: ManualAdjustmentType,
  description: string,
) {
  if (adminUser.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can adjust wallet balances");
  }

  requirePositiveIntegerAmount(amount, "Amount must be a strictly positive whole number");

  if (type !== TransactionType.CREDIT && type !== TransactionType.DEBIT) {
    throw new AppError(
      400,
      "INVALID_TRANSACTION_TYPE",
      "Manual adjustments must be CREDIT or DEBIT",
    );
  }

  const normalizedDescription = description.trim();
  if (!normalizedDescription || normalizedDescription.length > 255) {
    throw new AppError(
      400,
      "INVALID_DESCRIPTION",
      "Description must contain between 1 and 255 characters",
    );
  }

  return prisma.$transaction(async (tx) => {
    const resident = await tx.user.findFirst({
      where: {
        id: residentUserId,
        societyId: adminUser.societyId,
        role: "RESIDENT",
        isActive: true,
      },
      select: { id: true },
    });

    if (!resident) {
      throw new AppError(404, "NOT_FOUND", "Resident not found");
    }

    const wallet = await findOrCreateWallet(tx, resident.id);
    const balanceMutation =
      type === TransactionType.DEBIT
        ? await tx.wallet.updateMany({
            where: { id: wallet.id, balance: { gte: amount } },
            data: { balance: { decrement: amount } },
          })
        : await tx.wallet.updateMany({
            where: {
              id: wallet.id,
              balance: { lte: MAX_DATABASE_INTEGER - amount },
            },
            data: { balance: { increment: amount } },
          });

    if (balanceMutation.count !== 1) {
      if (type === TransactionType.DEBIT) {
        throw new AppError(400, "INSUFFICIENT_FUNDS", "Insufficient wallet balance");
      }
      throw new AppError(400, "BALANCE_LIMIT", "Wallet balance would exceed the supported limit");
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type,
        description: normalizedDescription,
      },
    });

    return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  });
}

export async function createRechargeRequest(user: AuthUser, amount: number, notes?: string) {
  requireResident(user);
  requirePositiveIntegerAmount(
    amount,
    "Recharge amount must be a strictly positive whole number",
  );

  const request = await prisma.rechargeRequest.create({
    data: {
      userId: user.id,
      amount,
      notes,
    },
  });

  return request;
}

export async function getResidentRechargeRequests(user: AuthUser) {
  requireResident(user);
  return prisma.rechargeRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

function requireDemoRechargeAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_DEMO_RECHARGE) {
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "Recharge amount must be a whole number between 1 and 10000",
    );
  }
}

function requireSafeDemoDatabase() {
  if (!isSafeLocalDemoDatabase()) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }
}

export async function mockRechargeWallet(user: AuthUser, amount: number) {
  requireSafeDemoDatabase();
  requireResident(user);
  requireDemoRechargeAmount(amount);

  return prisma.$transaction(async (tx) => {
    const resident = await tx.user.findFirst({
      where: { id: user.id, role: "RESIDENT", isActive: true },
      select: { id: true },
    });
    if (!resident) {
      throw new AppError(404, "NOT_FOUND", "Resident not found");
    }

    await tx.rechargeRequest.create({
      data: {
        userId: resident.id,
        amount,
        status: "APPROVED",
        notes: "Mock Payment via QR",
        approvedAt: new Date(),
      },
    });

    const wallet = await creditWallet(
      tx,
      resident.id,
      amount,
      TransactionType.RECHARGE,
      "Wallet Recharge (Demo)",
    );
    return tx.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  });
}

export async function publicDemoRechargeWallet(userId: string, amount: number) {
  requireSafeDemoDatabase();
  requireDemoRechargeAmount(amount);

  return prisma.$transaction(async (tx) => {
    const resident = await tx.user.findFirst({
      where: {
        id: userId,
        role: "RESIDENT",
        isActive: true,
      },
      select: { id: true },
    });
    if (!resident) {
      throw new AppError(404, "NOT_FOUND", "No resident found to recharge");
    }

    const wallet = await creditWallet(
      tx,
      resident.id,
      amount,
      TransactionType.RECHARGE,
      "Mock QR Demo Recharge",
    );
    return tx.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  });
}
