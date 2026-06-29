import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, UserRole } from "@society-ev/db";
import { createRechargeRequest, getResidentRechargeRequests } from "@/src/modules/wallet/service";
import { processRechargeRequest, getAllRechargeRequests } from "@/src/modules/admin/service";

describe("Wallet Recharge Request Workflow", () => {
  let admin: any;
  let resident: any;
  let society: any;

  beforeAll(async () => {
    society = await prisma.society.create({
      data: { name: "Recharge Society", timezone: "Asia/Kolkata" },
    });

    const flat = await prisma.flat.create({
      data: { societyId: society.id, number: "R101" },
    });

    admin = await prisma.user.create({
      data: {
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Admin Recharge",
        phone: "9999977771",
        passwordHash: "hash",
      },
    });

    resident = await prisma.user.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Resident Recharge",
        phone: "9999977772",
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

  it("should create and fetch a recharge request", async () => {
    const request = await createRechargeRequest(resident, 1500, "Need topup");
    expect(request).toBeDefined();
    expect(request.status).toBe("PENDING");
    expect(request.amount).toBe(1500);

    const requests = await getResidentRechargeRequests(resident);
    expect(requests.length).toBe(1);
    expect(requests[0].id).toBe(request.id);
  });

  it("should approve a recharge request and credit the wallet", async () => {
    const requests = await getResidentRechargeRequests(resident);
    const reqId = requests[0].id;

    const result = await processRechargeRequest(admin, reqId, "APPROVE");
    expect(result.status).toBe("APPROVED");

    const wallet = await prisma.wallet.findUnique({
      where: { userId: resident.id },
      include: { transactions: true },
    });
    // 5000 initial + 1500
    expect(wallet?.balance).toBe(6500);
    expect(wallet?.transactions.length).toBe(2);
    expect(wallet?.transactions[1].amount).toBe(1500);
  });

  it("should prevent duplicate processing", async () => {
    const requests = await getResidentRechargeRequests(resident);
    const reqId = requests[0].id;

    await expect(processRechargeRequest(admin, reqId, "APPROVE")).rejects.toThrow("Request is already APPROVED");
    await expect(processRechargeRequest(admin, reqId, "REJECT")).rejects.toThrow("Request is already APPROVED");
  });

  it("should successfully reject a new request", async () => {
    const request = await createRechargeRequest(resident, 2000, "Second request");
    
    const result = await processRechargeRequest(admin, request.id, "REJECT");
    expect(result.status).toBe("REJECTED");

    const wallet = await prisma.wallet.findUnique({
      where: { userId: resident.id },
    });
    // Balance shouldn't change
    expect(wallet?.balance).toBe(6500);
  });
});
