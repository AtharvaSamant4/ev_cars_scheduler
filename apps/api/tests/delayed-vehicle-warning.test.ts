import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { getResidentBooking } from "@/src/modules/bookings/service";
import { getDashboard } from "@/src/modules/residents/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const MINUTE = 60_000;

/**
 * Resident A keeps a vehicle out well past its booked end. Resident B holds the
 * next booking on that same vehicle and would otherwise walk down to an empty
 * parking space with no warning at all.
 */
describe("warning when the next resident's vehicle is still out", () => {
  let societyId: string;
  let vehicleId: string;
  let spareVehicleId: string;
  let residentA: AuthUser;
  let residentB: AuthUser;
  let residentC: AuthUser;
  let flatBId: string;
  let flatCId: string;

  async function makeResident(flatNumber: string, phone: string) {
    const flat = await prisma.flat.create({
      data: { societyId, number: flatNumber },
    });
    const user = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: `Resident ${flatNumber}`,
        phone,
        passwordHash: "fixture-hash",
      },
    });
    return { flatId: flat.id, user };
  }

  async function seedBooking(options: {
    flatId: string;
    userId: string;
    vehicleId: string;
    startTime: Date;
    endTime: Date;
    status: BookingStatus;
  }) {
    const period = getIsoWeek(options.startTime);
    await prisma.flatQuota.upsert({
      where: {
        flatId_year_weekNumber: {
          flatId: options.flatId,
          year: period.year,
          weekNumber: period.week,
        },
      },
      create: {
        flatId: options.flatId,
        year: period.year,
        weekNumber: period.week,
        allocatedMinutes: 6_000,
        usedMinutes: 0,
      },
      update: {},
    });

    return prisma.booking.create({
      data: {
        societyId,
        vehicleId: options.vehicleId,
        flatId: options.flatId,
        userId: options.userId,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: options.startTime,
        endTime: options.endTime,
        durationMinutes: Math.round(
          (options.endTime.getTime() - options.startTime.getTime()) / MINUTE,
        ),
        status: options.status,
        ...(options.status === BookingStatus.IN_PROGRESS
          ? { otpVerified: true, actualRideStartTime: options.startTime }
          : {}),
      },
    });
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Delay Warning Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    vehicleId = (
      await prisma.vehicle.create({
        data: {
          societyId,
          name: "Shared EV",
          registrationNumber: "DLY-EV-1",
          hourlyRate: 100,
        },
      })
    ).id;

    spareVehicleId = (
      await prisma.vehicle.create({
        data: {
          societyId,
          name: "Spare EV",
          registrationNumber: "DLY-EV-2",
          hourlyRate: 100,
        },
      })
    ).id;

    const a = await makeResident("DLY-A", "9610000001");
    const b = await makeResident("DLY-B", "9610000002");
    const c = await makeResident("DLY-C", "9610000003");
    residentA = a.user;
    residentB = b.user;
    residentC = c.user;
    flatBId = b.flatId;
    flatCId = c.flatId;

    // A booked 2 hours ago for one hour and is still driving: 60 minutes late.
    await seedBooking({
      flatId: a.flatId,
      userId: residentA.id,
      vehicleId,
      startTime: new Date(Date.now() - 120 * MINUTE),
      endTime: new Date(Date.now() - 60 * MINUTE),
      status: BookingStatus.IN_PROGRESS,
    });

    // B is next on that vehicle and due imminently.
    await seedBooking({
      flatId: flatBId,
      userId: residentB.id,
      vehicleId,
      startTime: new Date(Date.now() + 10 * MINUTE),
      endTime: new Date(Date.now() + 70 * MINUTE),
      status: BookingStatus.DRIVER_ASSIGNED,
    });

    // C holds the same vehicle, but not until next week.
    await seedBooking({
      flatId: flatCId,
      userId: residentC.id,
      vehicleId: spareVehicleId,
      startTime: new Date(Date.now() + 5 * 24 * 60 * MINUTE),
      endTime: new Date(Date.now() + 5 * 24 * 60 * MINUTE + 60 * MINUTE),
      status: BookingStatus.BOOKED,
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("tells the waiting resident their vehicle is overdue, and by how long", async () => {
    const dashboard = await getDashboard(residentB);
    const booking = dashboard.upcomingBookings[0];

    expect(booking).toBeDefined();
    expect(booking.vehicleDelayedMinutes).toBeGreaterThanOrEqual(59);
    expect(booking.vehicleDelayedMinutes).toBeLessThanOrEqual(61);
  });

  it("carries the warning through to the booking detail screen", async () => {
    const dashboard = await getDashboard(residentB);
    const detail = await getResidentBooking(
      residentB,
      dashboard.upcomingBookings[0].id,
    );

    expect(detail.vehicleDelayedMinutes).toBeGreaterThan(0);
  });

  it("does not alarm a resident whose booking is days away", async () => {
    const dashboard = await getDashboard(residentC);

    for (const booking of dashboard.upcomingBookings) {
      expect(booking.vehicleDelayedMinutes).toBeNull();
    }
  });

  it("says nothing to the resident who is actually driving", async () => {
    const dashboard = await getDashboard(residentA);

    for (const booking of dashboard.upcomingBookings) {
      expect(booking.vehicleDelayedMinutes).toBeNull();
    }
  });
});
