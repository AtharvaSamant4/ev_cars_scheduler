import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, UserRole } from "@society-ev/db";
import { getCancellationPenaltyAmount, updateCancellationPenaltyAmount } from "@/src/modules/penalties/service";

describe("Cancellation Penalty System", () => {
  let adminUser: any;
  let societyId: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
    });
    if (!admin) throw new Error("No admin found");
    
    societyId = admin.societyId;
    adminUser = {
      id: admin.id,
      role: admin.role,
      societyId: admin.societyId,
    };
  });

  afterAll(async () => {
    await prisma.penaltyRule.deleteMany({
      where: { code: "CANCELLATION" }
    });
  });

  it("should return 0 when no cancellation penalty is configured", async () => {
    await prisma.penaltyRule.deleteMany({
      where: { societyId, code: "CANCELLATION" }
    });

    const result = await getCancellationPenaltyAmount(adminUser);
    expect(result.amount).toBe(0);
  });

  it("should allow admin to update cancellation penalty", async () => {
    const result = await updateCancellationPenaltyAmount(adminUser, 500);
    expect(result.amount).toBe(500);

    const check = await getCancellationPenaltyAmount(adminUser);
    expect(check.amount).toBe(500);
  });

  it("should allow admin to update an existing cancellation penalty", async () => {
    const result = await updateCancellationPenaltyAmount(adminUser, 1000);
    expect(result.amount).toBe(1000);

    const check = await getCancellationPenaltyAmount(adminUser);
    expect(check.amount).toBe(1000);
  });
});
