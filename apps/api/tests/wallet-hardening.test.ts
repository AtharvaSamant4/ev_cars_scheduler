import { prisma, TransactionType, UserRole } from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getWalletRoute } from "@/app/api/v1/wallet/route";
import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";
import {
  adjustWalletBalance,
  getResidentWallet,
} from "@/src/modules/wallet/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const routeContext = { params: Promise.resolve({}) };

describe("Wallet hardening", () => {
  let societyId: string;
  let admin: AuthUser;
  let resident: AuthUser;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Wallet Hardening Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({
      data: { societyId, number: "WH101" },
    });
    admin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Wallet Hardening Admin",
        phone: "9999988892",
        passwordHash: "hash",
      },
    });
    resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Wallet Hardening Resident",
        phone: "9999988893",
        passwordHash: "hash",
      },
    });
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyId);
  });

  it("restricts the wallet route and service to residents", async () => {
    const token = await issueToken(admin);
    const response = await getWalletRoute(
      new NextRequest("http://127.0.0.1/api/v1/wallet", {
        headers: { authorization: `Bearer ${token}` },
      }),
      routeContext,
    );

    expect(response.status).toBe(403);
    await expect(getResidentWallet(admin)).rejects.toThrow("Only residents");
  });

  it("initializes one wallet and one opening ledger row under concurrent first use", async () => {
    const results = await Promise.all([
      getResidentWallet(resident),
      getResidentWallet(resident),
      getResidentWallet(resident),
      getResidentWallet(resident),
    ]);

    expect(new Set(results.map((wallet) => wallet.id)).size).toBe(1);
    expect(await prisma.wallet.count({ where: { userId: resident.id } })).toBe(1);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } });
    expect(wallet.balance).toBe(5_000);
    expect(await prisma.walletTransaction.count({
      where: {
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        description: "Initial Promotional Balance",
      },
    })).toBe(1);
  });

  it("preserves concurrent credits and their ledger entries", async () => {
    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } });
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        adjustWalletBalance(
          admin,
          resident.id,
          10 + index,
          TransactionType.CREDIT,
          `Concurrent credit ${index}`,
        ),
      ),
    );

    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } });
    expect(after.balance).toBe(before.balance + 75);
    expect(await prisma.walletTransaction.count({
      where: {
        walletId: after.id,
        description: { startsWith: "Concurrent credit" },
      },
    })).toBe(6);
  });

  it("allows only one competing debit when funds cover only one", async () => {
    await prisma.wallet.update({
      where: { userId: resident.id },
      data: { balance: 50 },
    });
    const outcomes = await Promise.allSettled([
      adjustWalletBalance(admin, resident.id, 40, TransactionType.DEBIT, "Competing debit A"),
      adjustWalletBalance(admin, resident.id, 40, TransactionType.DEBIT, "Competing debit B"),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } })).balance).toBe(10);
    expect(await prisma.walletTransaction.count({
      where: {
        wallet: { userId: resident.id },
        description: { startsWith: "Competing debit" },
      },
    })).toBe(1);
  });

  it("rejects non-manual transaction types even when the service type is bypassed", async () => {
    await expect(adjustWalletBalance(
      admin,
      resident.id,
      100,
      TransactionType.RECHARGE as unknown as Parameters<typeof adjustWalletBalance>[3],
      "Invalid manual type",
    )).rejects.toThrow("must be CREDIT or DEBIT");
  });
});
