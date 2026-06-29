import { TransactionType, prisma } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

export async function getResidentWallet(user: AuthUser) {
  let wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Lazy Initialization: If wallet doesn't exist, create it with 5000 INR
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        balance: 5000,
        transactions: {
          create: {
            amount: 5000,
            type: TransactionType.CREDIT,
            description: "Initial Promotional Balance",
          },
        },
      },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  return wallet;
}

export async function listAllWallets(user: AuthUser) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view all wallets");
  }

  const wallets = await prisma.wallet.findMany({
    include: {
      user: {
        select: {
          name: true,
          phone: true,
          flat: {
            select: { number: true },
          },
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  // We only return actual created wallets. If an admin wants to adjust someone who hasn't opened their wallet yet, 
  // they won't see them here unless we fetch Users and left join wallets. Let's do that instead to be safe.
  const users = await prisma.user.findMany({
    where: { role: "RESIDENT" },
    include: {
      flat: { select: { number: true } },
      wallet: true,
    },
    orderBy: { name: "asc" },
  });

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    phone: u.phone,
    flat: u.flat?.number,
    walletId: u.wallet?.id ?? null,
    balance: u.wallet?.balance ?? 5000, // Assume 5000 initial promotional balance if not yet lazily initialized
  }));
}

export async function adjustWalletBalance(
  adminUser: AuthUser,
  residentUserId: string,
  amount: number,
  type: TransactionType,
  description: string
) {
  if (adminUser.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can adjust wallet balances");
  }

  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Amount must be strictly positive");
  }

  return await prisma.$transaction(async (tx) => {
    let wallet = await tx.wallet.findUnique({
      where: { userId: residentUserId },
    });

    if (!wallet) {
      // Lazy initialization on adjustment
      wallet = await tx.wallet.create({
        data: {
          userId: residentUserId,
          balance: 5000,
          transactions: {
            create: {
              amount: 5000,
              type: TransactionType.CREDIT,
              description: "Initial Promotional Balance",
            },
          },
        },
      });
    }

    if (type === TransactionType.DEBIT && wallet.balance < amount) {
      throw new AppError(400, "INSUFFICIENT_FUNDS", "Insufficient wallet balance");
    }

    const newBalance =
      type === TransactionType.DEBIT
        ? wallet.balance - amount
        : wallet.balance + amount;

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        transactions: {
          create: {
            amount,
            type,
            description,
          },
        },
      },
    });

    return updatedWallet;
  });
}

export async function createRechargeRequest(user: AuthUser, amount: number, notes?: string) {
  if (user.role !== "RESIDENT") {
    throw new AppError(403, "FORBIDDEN", "Only residents can request recharge");
  }

  if (amount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Recharge amount must be strictly positive");
  }

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
  return await prisma.rechargeRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function mockRechargeWallet(user: AuthUser, amount: number) {
  if (user.role !== "RESIDENT") {
    throw new AppError(403, "FORBIDDEN", "Only residents can perform mock recharges");
  }

  if (amount <= 0 || amount > 10000) {
    throw new AppError(400, "INVALID_AMOUNT", "Recharge amount must be strictly between 1 and 10000");
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create auto-approved request for history
    await tx.rechargeRequest.create({
      data: {
        userId: user.id,
        amount,
        status: "APPROVED",
        notes: "Mock Payment via QR",
        approvedAt: new Date(),
        // mock system approval by not setting approvedBy
      },
    });

    // 2. Load or create wallet
    let wallet = await tx.wallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          balance: 5000,
          transactions: {
            create: {
              amount: 5000,
              type: "CREDIT",
              description: "Initial Promotional Balance",
            },
          },
        },
      });
    }

    // 3. Credit wallet and log transaction
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance + amount,
        transactions: {
          create: {
            amount,
            type: "RECHARGE",
            description: "Wallet Recharge (Demo)",
          },
        },
      },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return updatedWallet;
  });
}
