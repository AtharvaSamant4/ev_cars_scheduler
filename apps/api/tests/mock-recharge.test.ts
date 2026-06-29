import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, UserRole } from "@society-ev/db";
import { mockRechargeWallet } from "@/src/modules/wallet/service";

describe("Mock QR Wallet Recharge Flow", () => {
  let resident: any;
  let society: any;

  beforeAll(async () => {
    society = await prisma.society.create({
      data: { name: "Mock Recharge Society", timezone: "Asia/Kolkata" },
    });

    const flat = await prisma.flat.create({
      data: { societyId: society.id, number: "MOCK101" },
    });

    resident = await prisma.user.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Mock Resident",
        phone: "9999988881",
        passwordHash: "hash",
      },
    });
  });

  afterAll(async () => {
    if (society) {
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: resident.id } } });
      await prisma.wallet.deleteMany({ where: { userId: resident.id } });
      await prisma.rechargeRequest.deleteMany({ where: { userId: resident.id } });
      await prisma.user.deleteMany({ where: { societyId: society.id } });
      await prisma.flat.deleteMany({ where: { societyId: society.id } });
      await prisma.society.deleteMany({ where: { id: society.id } });
    }
    await prisma.$disconnect();
  });

  it("should successfully mock recharge within limits", async () => {
    const updatedWallet = await mockRechargeWallet(resident, 2000);
    
    // 5000 initial + 2000
    expect(updatedWallet.balance).toBe(7000);
    
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: updatedWallet.id },
      orderBy: { createdAt: "desc" },
    });

    expect(transactions[0].type).toBe("RECHARGE");
    expect(transactions[0].amount).toBe(2000);

    const requests = await prisma.rechargeRequest.findMany({
      where: { userId: resident.id },
    });
    expect(requests.length).toBe(1);
    expect(requests[0].status).toBe("APPROVED");
    expect(requests[0].amount).toBe(2000);
    expect(requests[0].notes).toBe("Mock Payment via QR");
  });

  it("should reject negative or zero amounts", async () => {
    await expect(mockRechargeWallet(resident, 0)).rejects.toThrow("strictly between 1 and 10000");
    await expect(mockRechargeWallet(resident, -500)).rejects.toThrow("strictly between 1 and 10000");
  });

  it("should reject amounts over the limit", async () => {
    await expect(mockRechargeWallet(resident, 10001)).rejects.toThrow("strictly between 1 and 10000");
  });
});
