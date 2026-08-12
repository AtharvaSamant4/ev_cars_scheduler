import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { listResidentBookings } from "@/src/modules/bookings/service";
import { getDashboard } from "@/src/modules/residents/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

/**
 * A ride that runs past its scheduled endTime must stay visible as live work.
 * Filtering only on `endTime > now` used to move an in-progress trip into
 * history while the car was still out.
 */
describe("rides running past their scheduled end time", () => {
  let resident: AuthUser;
  let societyId: string;
  let flatId: string;
  let vehicleId: string;
  let overdueInProgressId: string;
  let overdueNeverStartedId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Overdue Visibility Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    const flat = await prisma.flat.create({
      data: { societyId, number: "OVD-101" },
    });
    flatId = flat.id;

    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Overdue Resident",
        phone: "9310000001",
        passwordHash: "fixture-hash",
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: { societyId, name: "Overdue EV", registrationNumber: "OVD-EV-1" },
    });
    vehicleId = vehicle.id;

    // Scheduled 09:00-11:00 yesterday; the ride started but never completed,
    // so it is still running well past its scheduled end.
    const startTime = new Date(Date.now() - 26 * 60 * 60_000);
    const endTime = new Date(Date.now() - 24 * 60 * 60_000);
    const period = getIsoWeek(startTime);

    await prisma.flatQuota.create({
      data: {
        flatId,
        year: period.year,
        weekNumber: period.week,
        allocatedMinutes: 600,
        usedMinutes: 120,
      },
    });

    const overdueInProgress = await prisma.booking.create({
      data: {
        societyId,
        vehicleId,
        flatId,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime,
        durationMinutes: 120,
        status: BookingStatus.IN_PROGRESS,
        otpVerified: true,
        otpVerifiedAt: startTime,
        actualRideStartTime: startTime,
      },
    });
    overdueInProgressId = overdueInProgress.id;

    // A reservation nobody ever picked up. Its window has passed and no ride
    // is underway, so this one genuinely belongs in history.
    const staleStart = new Date(Date.now() - 50 * 60 * 60_000);
    const staleEnd = new Date(Date.now() - 48 * 60 * 60_000);
    const stalePeriod = getIsoWeek(staleStart);

    if (
      stalePeriod.year !== period.year ||
      stalePeriod.week !== period.week
    ) {
      await prisma.flatQuota.create({
        data: {
          flatId,
          year: stalePeriod.year,
          weekNumber: stalePeriod.week,
          allocatedMinutes: 600,
          usedMinutes: 120,
        },
      });
    }

    const overdueNeverStarted = await prisma.booking.create({
      data: {
        societyId,
        vehicleId,
        flatId,
        userId: resident.id,
        quotaYear: stalePeriod.year,
        quotaWeek: stalePeriod.week,
        startTime: staleStart,
        endTime: staleEnd,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      },
    });
    overdueNeverStartedId = overdueNeverStarted.id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("keeps an overdue in-progress ride in the upcoming list", async () => {
    const upcoming = await listResidentBookings(resident, "upcoming", 1, 50);
    expect(upcoming.items.map((booking) => booking.id)).toContain(
      overdueInProgressId,
    );
  });

  it("keeps it off the history list so it is never shown twice", async () => {
    const history = await listResidentBookings(resident, "history", 1, 50);
    expect(history.items.map((booking) => booking.id)).not.toContain(
      overdueInProgressId,
    );
  });

  it("surfaces it on the resident dashboard", async () => {
    const dashboard = await getDashboard(resident);
    expect(dashboard.upcomingBookings.map((booking) => booking.id)).toContain(
      overdueInProgressId,
    );
  });

  it("still files an elapsed reservation that never started under history", async () => {
    const [upcoming, history] = await Promise.all([
      listResidentBookings(resident, "upcoming", 1, 50),
      listResidentBookings(resident, "history", 1, 50),
    ]);

    expect(upcoming.items.map((booking) => booking.id)).not.toContain(
      overdueNeverStartedId,
    );
    expect(history.items.map((booking) => booking.id)).toContain(
      overdueNeverStartedId,
    );
  });
});
