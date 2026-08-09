import { hash } from "bcryptjs";
import { prisma, TransactionType, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { loginResident } from "@/src/modules/auth/service";
import {
  adjustWalletBalance,
  listAllWallets,
} from "@/src/modules/wallet/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const PASSWORD = "Boundary@123";

describe("Multi-society authentication and wallet isolation", () => {
  let societyAId: string;
  let societyBId: string;
  let adminA: AuthUser;
  let residentA: AuthUser;
  let residentB: AuthUser;

  beforeAll(async () => {
    const passwordHash = await hash(PASSWORD, 4);
    const [societyA, societyB] = await Promise.all([
      prisma.society.create({ data: { name: "Boundary Society A", timezone: "Asia/Kolkata" } }),
      prisma.society.create({ data: { name: "Boundary Society B", timezone: "Asia/Kolkata" } }),
    ]);
    societyAId = societyA.id;
    societyBId = societyB.id;
    const [flatA, flatB] = await Promise.all([
      prisma.flat.create({ data: { societyId: societyAId, number: "BOUND101" } }),
      prisma.flat.create({ data: { societyId: societyBId, number: "BOUND101" } }),
    ]);
    adminA = await prisma.user.create({
      data: {
        societyId: societyAId,
        role: UserRole.ADMIN,
        name: "Boundary Admin A",
        phone: "9100000211",
        passwordHash,
      },
    });
    residentA = await prisma.user.create({
      data: {
        societyId: societyAId,
        flatId: flatA.id,
        role: UserRole.RESIDENT,
        name: "Boundary Resident A",
        phone: "9100000212",
        passwordHash,
      },
    });
    residentB = await prisma.user.create({
      data: {
        societyId: societyBId,
        flatId: flatB.id,
        role: UserRole.RESIDENT,
        name: "Boundary Resident B",
        phone: "9100000213",
        passwordHash,
      },
    });
    await Promise.all([
      prisma.wallet.create({ data: { userId: residentA.id, balance: 1_000 } }),
      prisma.wallet.create({ data: { userId: residentB.id, balance: 2_000 } }),
    ]);
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyAId);
    await cleanupSocietyFixture(societyBId);
  });

  it("requires a society boundary for an ambiguous flat and resolves the requested society", async () => {
    await expect(loginResident("BOUND101", PASSWORD)).rejects.toThrow("Society ID is required");
    const sessionA = await loginResident("BOUND101", PASSWORD, societyAId);
    const sessionB = await loginResident("BOUND101", PASSWORD, societyBId);
    expect(sessionA.user.id).toBe(residentA.id);
    expect(sessionA.user.society.id).toBe(societyAId);
    expect(sessionB.user.id).toBe(residentB.id);
    expect(sessionB.user.society.id).toBe(societyBId);
  });

  it("lists only residents from the authenticated admin's society", async () => {
    const wallets = await listAllWallets(adminA);
    expect(wallets.map((wallet) => wallet.userId)).toEqual([residentA.id]);
  });

  it("rejects a cross-society wallet mutation by resident ID", async () => {
    await expect(adjustWalletBalance(
      adminA,
      residentB.id,
      500,
      TransactionType.CREDIT,
      "Cross-society attempt",
    )).rejects.toThrow("Resident not found");
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: residentB.id } })).balance).toBe(2_000);

    await adjustWalletBalance(
      adminA,
      residentA.id,
      500,
      TransactionType.CREDIT,
      "Authorized adjustment",
    );
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: residentA.id } })).balance).toBe(1_500);
  });
});
