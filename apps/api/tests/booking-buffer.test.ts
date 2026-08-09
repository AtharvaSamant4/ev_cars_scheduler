import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { createBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Booking 30-minute buffer system", () => {
  let resident: AuthUser;
  let societyId: string;
  let flatId: string;
  let vehicle1Id: string;
  let vehicle2Id: string;

  function slot(days: number, hour: number, minute = 0) {
    const start = new Date();
    start.setDate(start.getDate() + days);
    start.setHours(hour, minute, 0, 0);
    return start;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Buffer Fixture Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({
      data: { societyId, number: "BUF-101" },
    });
    flatId = flat.id;
    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Buffer Resident",
        phone: "9100000001",
        passwordHash: "fixture-hash",
      },
    });
    await prisma.wallet.create({
      data: { userId: resident.id, balance: 100_000 },
    });
    const [vehicle1, vehicle2] = await Promise.all([
      prisma.vehicle.create({
        data: { societyId, name: "Buffer EV 1", registrationNumber: "BUF-EV-1" },
      }),
      prisma.vehicle.create({
        data: { societyId, name: "Buffer EV 2", registrationNumber: "BUF-EV-2" },
      }),
    ]);
    vehicle1Id = vehicle1.id;
    vehicle2Id = vehicle2.id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("allows exactly a 30-minute gap", async () => {
    const start1 = slot(1, 10);
    const end1 = new Date(start1.getTime() + 2 * 60 * 60_000);
    const start2 = new Date(end1.getTime() + 30 * 60_000);
    const end2 = new Date(start2.getTime() + 2 * 60 * 60_000);

    await expect(createBooking(resident, start1.toISOString(), end1.toISOString(), vehicle1Id)).resolves.toBeDefined();
    await expect(createBooking(resident, start2.toISOString(), end2.toISOString(), vehicle1Id)).resolves.toBeDefined();
  });

  it.each([[0], [29]])("rejects a %i-minute gap at the database constraint", async (gapMinutes) => {
    const start1 = slot(gapMinutes === 0 ? 2 : 3, 10);
    const end1 = new Date(start1.getTime() + 2 * 60 * 60_000);
    const period = getIsoWeek(start1);
    await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: start1,
        endTime: end1,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      },
    });

    const start2 = new Date(end1.getTime() + gapMinutes * 60_000);
    const end2 = new Date(start2.getTime() + 2 * 60 * 60_000);
    await expect(prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: start2,
        endTime: end2,
        durationMinutes: 120,
      },
    })).rejects.toThrow();
  });

  it("allows the same slot on different vehicles", async () => {
    const start = slot(4, 10);
    const end = new Date(start.getTime() + 2 * 60 * 60_000);
    await createBooking(resident, start.toISOString(), end.toISOString(), vehicle1Id);
    await expect(createBooking(resident, start.toISOString(), end.toISOString(), vehicle2Id)).resolves.toBeDefined();
  });

  it("allows exactly one winner under concurrent booking attempts", async () => {
    const start = slot(5, 10);
    const end = new Date(start.getTime() + 2 * 60 * 60_000);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createBooking(resident, start.toISOString(), end.toISOString(), vehicle2Id)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);
  });
});
