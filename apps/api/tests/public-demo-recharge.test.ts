import { prisma, UserRole } from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as mockRecharge } from "@/app/api/v1/wallet/mock-recharge/route";
import { POST } from "@/app/api/v1/wallet/public-demo-recharge/route";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const routeContext = { params: Promise.resolve({}) };

function rechargeRequest(body: unknown) {
  return new NextRequest("http://127.0.0.1/api/v1/wallet/public-demo-recharge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockRechargeRequest() {
  return new NextRequest("http://127.0.0.1/api/v1/wallet/mock-recharge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
}

describe("Public demo recharge guard and validation", () => {
  let societyId: string;
  let residentId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Public Demo Recharge Guard", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({
      data: { societyId, number: "PDR101" },
    });
    const resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Public Demo Resident",
        phone: "9999988891",
        passwordHash: "hash",
      },
    });
    residentId = resident.id;
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyId);
  });

  it("is unavailable in production before any recharge is attempted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = await POST(rechargeRequest({ userId: residentId, amount: 100 }), routeContext);
      expect(response.status).toBe(404);
      expect((await mockRecharge(mockRechargeRequest(), routeContext)).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("is unavailable when either configured database URL is not the guarded local database", async () => {
    const safeDatabaseUrl = process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@example.invalid:5432/app");
    try {
      expect((await POST(rechargeRequest({ userId: residentId, amount: 100 }), routeContext)).status).toBe(404);
      expect((await mockRecharge(mockRechargeRequest(), routeContext)).status).toBe(404);

      vi.stubEnv("DATABASE_URL", safeDatabaseUrl);
      vi.stubEnv("DIRECT_URL", "postgresql://user:secret@example.invalid:5432/app");
      expect((await POST(rechargeRequest({ userId: residentId, amount: 100 }), routeContext)).status).toBe(404);
      expect((await mockRecharge(mockRechargeRequest(), routeContext)).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects fractional and oversized amounts before changing a wallet", async () => {
    const fractional = await POST(
      rechargeRequest({ userId: residentId, amount: 1.5 }),
      routeContext,
    );
    const oversized = await POST(
      rechargeRequest({ userId: residentId, amount: 10_001 }),
      routeContext,
    );

    expect(fractional.status).toBe(422);
    expect(oversized.status).toBe(422);
    expect(await prisma.wallet.count({ where: { userId: residentId } })).toBe(0);
  });

  it("creates a consistent wallet and a RECHARGE ledger entry", async () => {
    const response = await POST(
      rechargeRequest({ userId: residentId, amount: 750 }),
      routeContext,
    );

    expect(response.status).toBe(200);
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: residentId },
      include: { transactions: { orderBy: { createdAt: "asc" } } },
    });
    expect(wallet.balance).toBe(5_750);
    expect(wallet.transactions.map(({ amount, type }) => ({ amount, type }))).toEqual([
      { amount: 5_000, type: "CREDIT" },
      { amount: 750, type: "RECHARGE" },
    ]);
  });
});
