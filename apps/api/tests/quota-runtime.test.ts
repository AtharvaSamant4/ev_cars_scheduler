import { prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  currentQuotaPeriods,
  ensureWeeklyQuotaHorizon,
} from "@/src/modules/quotas/service";
import type { AuthUser } from "@/src/lib/auth";
import { updateQuota } from "@/src/modules/admin/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Weekly quota runtime", () => {
  let societyId: string;
  let flatId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Quota Fixture Society", timezone: "America/Los_Angeles" },
    });
    societyId = society.id;
    flatId = (await prisma.flat.create({ data: { societyId, number: "QUO-101" } })).id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("derives the ISO week from society-local time", async () => {
    const [period] = await currentQuotaPeriods(
      societyId,
      new Date("2026-08-10T00:30:00.000Z"),
    );
    expect(period).toEqual({ year: 2026, week: 32 });
  });

  it("provisions current and next week once without changing used minutes", async () => {
    const [current] = await currentQuotaPeriods(societyId);
    await prisma.flatQuota.create({
      data: {
        flatId,
        year: current.year,
        weekNumber: current.week,
        allocatedMinutes: 960,
        usedMinutes: 120,
      },
    });
    await ensureWeeklyQuotaHorizon(flatId, societyId);
    await ensureWeeklyQuotaHorizon(flatId, societyId);

    const quotas = await prisma.flatQuota.findMany({ where: { flatId } });
    expect(quotas).toHaveLength(2);
    expect(quotas.find((quota) => quota.year === current.year && quota.weekNumber === current.week)?.usedMinutes).toBe(120);
    expect(quotas.every((quota) => quota.allocatedMinutes === 960)).toBe(true);
  });

  it("serializes concurrent admin creation of the same weekly quota row", async () => {
    const admin: AuthUser = {
      id: "00000000-0000-4000-8000-000000000001",
      societyId,
      flatId: null,
      role: UserRole.ADMIN,
      name: "Quota Admin",
    };

    const results = await Promise.allSettled([
      updateQuota(admin, flatId, 2099, 1, 720),
      updateQuota(admin, flatId, 2099, 1, 720),
    ]);

    expect(results.every(({ status }) => status === "fulfilled")).toBe(true);
    await expect(
      prisma.flatQuota.count({
        where: { flatId, year: 2099, weekNumber: 1 },
      }),
    ).resolves.toBe(1);
  });
});
