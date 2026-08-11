import { prisma } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addCalendarDaysInTimezone, getIsoWeek } from "@/src/lib/date";
import { currentQuotaPeriods } from "@/src/modules/quotas/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Quota ISO-year and DST boundaries", () => {
  let societyId: string;

  beforeAll(async () => {
    societyId = (await prisma.society.create({
      data: {
        name: "Quota Timezone Boundary Society",
        timezone: "America/New_York",
      },
    })).id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("uses the ISO week-year rather than the calendar year at New Year", async () => {
    expect(getIsoWeek(new Date("2021-01-01T12:00:00.000Z"))).toEqual({
      year: 2020,
      week: 53,
    });
    expect(getIsoWeek(new Date("2021-01-04T12:00:00.000Z"))).toEqual({
      year: 2021,
      week: 1,
    });

    await expect(currentQuotaPeriods(
      societyId,
      new Date("2020-12-31T17:00:00.000Z"),
    )).resolves.toEqual([
      { year: 2020, week: 53 },
      { year: 2021, week: 1 },
    ]);
  });

  it("advances the quota horizon by seven local calendar days across spring DST", async () => {
    const beforeDst = new Date("2026-03-05T17:00:00.000Z"); // 12:00 EST
    const nextWeek = addCalendarDaysInTimezone(
      beforeDst,
      7,
      "America/New_York",
    );

    expect(nextWeek.toISOString()).toBe("2026-03-12T16:00:00.000Z"); // 12:00 EDT
    expect(nextWeek.getTime() - beforeDst.getTime()).toBe(167 * 60 * 60_000);
    await expect(currentQuotaPeriods(societyId, beforeDst)).resolves.toEqual([
      { year: 2026, week: 10 },
      { year: 2026, week: 11 },
    ]);
  });

  it("preserves local wall-clock time across fall DST instead of adding 168 hours", () => {
    const beforeDst = new Date("2026-10-29T16:00:00.000Z"); // 12:00 EDT
    const nextWeek = addCalendarDaysInTimezone(
      beforeDst,
      7,
      "America/New_York",
    );

    expect(nextWeek.toISOString()).toBe("2026-11-05T17:00:00.000Z"); // 12:00 EST
    expect(nextWeek.getTime() - beforeDst.getTime()).toBe(169 * 60 * 60_000);
  });
});
