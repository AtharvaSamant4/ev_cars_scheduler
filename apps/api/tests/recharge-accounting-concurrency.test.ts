import { randomUUID } from "node:crypto";

import { prisma, TransactionType, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { processRechargeRequest } from "@/src/modules/admin/service";
import {
  adjustWalletBalance,
  createRechargeRequest,
  getResidentWallet,
  mockRechargeWallet,
} from "@/src/modules/wallet/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const MAX_DATABASE_INTEGER = 2_147_483_647;
const CREDIT_TYPES = new Set<TransactionType>([
  TransactionType.CREDIT,
  TransactionType.REFUND,
  TransactionType.RECHARGE,
]);

describe("Recharge accounting concurrency", () => {
  let societyId: string;
  let admin: AuthUser;
  let secondAdmin: AuthUser;
  let residentSequence = 0;

  beforeAll(async () => {
    const suffix = randomUUID();
    const society = await prisma.society.create({
      data: {
        name: `Recharge Accounting ${suffix}`,
        timezone: "Asia/Kolkata",
      },
    });
    societyId = society.id;
    admin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Recharge Accounting Admin",
        email: `recharge-admin-${suffix}@example.test`,
        passwordHash: "hash",
      },
    });
    secondAdmin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Second Recharge Accounting Admin",
        email: `recharge-admin-two-${suffix}@example.test`,
        passwordHash: "hash",
      },
    });
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyId);
  });

  async function createResident(label: string): Promise<AuthUser> {
    residentSequence += 1;
    const suffix = randomUUID();
    const flat = await prisma.flat.create({
      data: {
        societyId,
        number: `RA-${residentSequence}-${suffix.slice(0, 6)}`,
      },
    });
    return prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: label,
        email: `recharge-resident-${suffix}@example.test`,
        passwordHash: "hash",
      },
    });
  }

  async function expectLedgerInvariant(residentId: string) {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: residentId },
      include: { transactions: true },
    });
    const signedTotal = wallet.transactions.reduce(
      (total, transaction) =>
        total + (CREDIT_TYPES.has(transaction.type) ? transaction.amount : -transaction.amount),
      0,
    );
    expect(wallet.balance).toBe(signedTotal);
    return wallet;
  }

  it("credits exactly once when two admins concurrently approve the same request", async () => {
    const resident = await createResident("Same Request Resident");
    await getResidentWallet(resident);
    const request = await createRechargeRequest(resident, 325, "Concurrent approval");

    const outcomes = await Promise.allSettled([
      processRechargeRequest(admin, request.id, "APPROVE"),
      processRechargeRequest(secondAdmin, request.id, "APPROVE"),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const storedRequest = await prisma.rechargeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(storedRequest.status).toBe("APPROVED");
    expect([admin.id, secondAdmin.id]).toContain(storedRequest.approvedBy);

    const wallet = await expectLedgerInvariant(resident.id);
    expect(wallet.balance).toBe(5_325);
    expect(wallet.transactions.filter((transaction) =>
      transaction.type === TransactionType.RECHARGE
      && transaction.description.includes(request.id.slice(0, 8)),
    )).toHaveLength(1);
  });

  it("preserves concurrent approval, manual credit, and mock credit without a lost update", async () => {
    const resident = await createResident("Mixed Credit Resident");
    const request = await createRechargeRequest(resident, 300, "Mixed concurrent credits");

    await Promise.all([
      processRechargeRequest(admin, request.id, "APPROVE"),
      adjustWalletBalance(
        admin,
        resident.id,
        40,
        TransactionType.CREDIT,
        "Concurrent manual credit",
      ),
      mockRechargeWallet(resident, 60),
    ]);

    const wallet = await expectLedgerInvariant(resident.id);
    expect(wallet.balance).toBe(5_400);
    expect(wallet.transactions.filter(({ type, amount }) =>
      type === TransactionType.CREDIT && amount === 5_000,
    )).toHaveLength(1);
    expect(wallet.transactions.filter(({ description }) =>
      description === "Concurrent manual credit",
    )).toHaveLength(1);
    expect(wallet.transactions.filter(({ type }) => type === TransactionType.RECHARGE))
      .toHaveLength(2);
  });

  it("creates an inseparable opening balance and ledger row when approving without a wallet", async () => {
    const resident = await createResident("Missing Wallet Resident");
    const request = await createRechargeRequest(resident, 250, "First wallet operation");
    expect(await prisma.wallet.findUnique({ where: { userId: resident.id } })).toBeNull();

    await processRechargeRequest(admin, request.id, "APPROVE");

    const wallet = await expectLedgerInvariant(resident.id);
    expect(wallet.balance).toBe(5_250);
    expect(wallet.transactions).toHaveLength(2);
    expect(wallet.transactions.filter(({ type, amount }) =>
      type === TransactionType.CREDIT && amount === 5_000,
    )).toHaveLength(1);
    expect(wallet.transactions.filter(({ type, amount }) =>
      type === TransactionType.RECHARGE && amount === 250,
    )).toHaveLength(1);
  });

  it("rolls approval back completely when the credit would overflow PostgreSQL integer", async () => {
    const resident = await createResident("Overflow Approval Resident");
    const wallet = await prisma.wallet.create({
      data: {
        userId: resident.id,
        balance: MAX_DATABASE_INTEGER - 5,
        transactions: {
          create: {
            amount: MAX_DATABASE_INTEGER - 5,
            type: TransactionType.CREDIT,
            description: "Large opening balance",
          },
        },
      },
    });
    const request = await createRechargeRequest(resident, 10, "Overflow attempt");

    await expect(processRechargeRequest(admin, request.id, "APPROVE"))
      .rejects.toThrow("would exceed the supported limit");

    const storedRequest = await prisma.rechargeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(storedRequest).toMatchObject({
      status: "PENDING",
      approvedAt: null,
      approvedBy: null,
    });
    expect((await expectLedgerInvariant(resident.id)).balance).toBe(MAX_DATABASE_INTEGER - 5);
    expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(1);
  });

  it("rolls the mock request and ledger back when its credit would overflow", async () => {
    const resident = await createResident("Overflow Mock Resident");
    await prisma.wallet.create({
      data: {
        userId: resident.id,
        balance: MAX_DATABASE_INTEGER - 5,
        transactions: {
          create: {
            amount: MAX_DATABASE_INTEGER - 5,
            type: TransactionType.CREDIT,
            description: "Large opening balance",
          },
        },
      },
    });
    const requestCountBefore = await prisma.rechargeRequest.count({
      where: { userId: resident.id },
    });

    await expect(mockRechargeWallet(resident, 10))
      .rejects.toThrow("would exceed the supported limit");

    expect(await prisma.rechargeRequest.count({ where: { userId: resident.id } }))
      .toBe(requestCountBefore);
    expect((await expectLedgerInvariant(resident.id)).balance).toBe(MAX_DATABASE_INTEGER - 5);
  });
});
