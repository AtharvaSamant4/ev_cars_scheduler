import { prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getCancellationPenaltyAmount, updateCancellationPenaltyAmount } from "@/src/modules/penalties/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Cancellation penalty settings", () => {
  let admin: AuthUser;
  let societyId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({ data: { name: "Penalty Fixture Society", timezone: "Asia/Kolkata" } });
    societyId = society.id;
    admin = await prisma.user.create({
      data: { societyId, role: UserRole.ADMIN, name: "Penalty Admin", phone: "9100000031", passwordHash: "fixture-hash" },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("returns zero when no cancellation rule exists", async () => {
    await expect(getCancellationPenaltyAmount(admin)).resolves.toEqual({ amount: 0 });
  });

  it("creates and then updates the society-scoped rule", async () => {
    await expect(updateCancellationPenaltyAmount(admin, 500)).resolves.toEqual({ amount: 500 });
    await expect(updateCancellationPenaltyAmount(admin, 1_000)).resolves.toEqual({ amount: 1_000 });
    await expect(getCancellationPenaltyAmount(admin)).resolves.toEqual({ amount: 1_000 });
    await expect(prisma.penaltyRule.count({ where: { societyId, code: "CANCELLATION" } })).resolves.toBe(1);
  });
});
