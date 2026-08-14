import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { checkAvailability, createBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const MINUTE = 60_000;

function halfHourBoundary(base: Date) {
  const value = new Date(base);
  value.setSeconds(0, 0);
  value.setMinutes(value.getMinutes() < 30 ? 0 : 30);
  return value;
}

/**
 * The first bookable slot from now. Always less than 30 minutes away, which is
 * what puts it inside the buffer of a trip that is currently running -- picking
 * a rounded-down boundary instead made the case depend on where the wall clock
 * happened to fall.
 */
function nextBookableSlot() {
  const value = halfHourBoundary(new Date());
  value.setMinutes(value.getMinutes() + 30);
  return value;
}

/**
 * Availability has to follow the vehicle, not the calendar: a car returned
 * early is free, and a car still out past its booked end is not.
 */
describe("vehicle availability follows the real trip", () => {
  let societyId: string;
  let flatId: string;
  let resident: AuthUser;
  let vehicleSequence = 0;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Release Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    const flat = await prisma.flat.create({
      data: { societyId, number: "REL-101" },
    });
    flatId = flat.id;

    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Release Resident",
        phone: "9510000001",
        passwordHash: "fixture-hash",
      },
    });

    await prisma.wallet.create({
      data: { userId: resident.id, balance: 500_000 },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  async function newVehicle() {
    vehicleSequence += 1;
    return prisma.vehicle.create({
      data: {
        societyId,
        name: `Release EV ${vehicleSequence}`,
        registrationNumber: `REL-EV-${vehicleSequence}`,
        hourlyRate: 100,
      },
    });
  }

  async function seedBooking(options: {
    vehicleId: string;
    startTime: Date;
    endTime: Date;
    status: BookingStatus;
    actualEndTime?: Date;
  }) {
    const period = getIsoWeek(options.startTime);
    await prisma.flatQuota.upsert({
      where: {
        flatId_year_weekNumber: {
          flatId,
          year: period.year,
          weekNumber: period.week,
        },
      },
      create: {
        flatId,
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
        flatId,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: options.startTime,
        endTime: options.endTime,
        durationMinutes: Math.round(
          (options.endTime.getTime() - options.startTime.getTime()) / MINUTE,
        ),
        status: options.status,
        actualEndTime: options.actualEndTime,
        actualRideStartTime: options.actualEndTime
          ? options.startTime
          : undefined,
        otpVerified: Boolean(options.actualEndTime),
      },
    });
  }

  it("frees the vehicle once a trip has actually finished early", async () => {
    const vehicle = await newVehicle();
    // Booked 3 hours from now for 3 hours, but handed back after one.
    const bookedStart = halfHourBoundary(new Date(Date.now() + 3 * 60 * MINUTE));
    const bookedEnd = new Date(bookedStart.getTime() + 180 * MINUTE);
    const returnedAt = new Date(bookedStart.getTime() + 60 * MINUTE);

    await seedBooking({
      vehicleId: vehicle.id,
      startTime: bookedStart,
      endTime: bookedEnd,
      status: BookingStatus.COMPLETED,
      actualEndTime: returnedAt,
    });

    // Starting 30 minutes after the real return, still inside the booked slot.
    const wantedStart = new Date(returnedAt.getTime() + 30 * MINUTE);
    const wantedEnd = new Date(wantedStart.getTime() + 60 * MINUTE);

    const availability = await checkAvailability(
      resident,
      wantedStart.toISOString(),
      wantedEnd.toISOString(),
    );

    expect(availability.availableVehicles.map(({ id }) => id)).toContain(
      vehicle.id,
    );

    // And the booking must actually go through, not just be offered.
    await expect(
      createBooking(
        resident,
        wantedStart.toISOString(),
        wantedEnd.toISOString(),
        vehicle.id,
      ),
    ).resolves.toBeDefined();
  });

  it("still honours the 30-minute turnaround after an early return", async () => {
    const vehicle = await newVehicle();
    const bookedStart = halfHourBoundary(new Date(Date.now() + 3 * 60 * MINUTE));
    const bookedEnd = new Date(bookedStart.getTime() + 180 * MINUTE);
    const returnedAt = new Date(bookedStart.getTime() + 60 * MINUTE);

    await seedBooking({
      vehicleId: vehicle.id,
      startTime: bookedStart,
      endTime: bookedEnd,
      status: BookingStatus.COMPLETED,
      actualEndTime: returnedAt,
    });

    // Only 30 minutes minus one slot step after the return: too soon.
    const tooSoonStart = new Date(returnedAt.getTime());
    const tooSoonEnd = new Date(tooSoonStart.getTime() + 60 * MINUTE);

    const availability = await checkAvailability(
      resident,
      tooSoonStart.toISOString(),
      tooSoonEnd.toISOString(),
    );

    expect(availability.availableVehicles.map(({ id }) => id)).not.toContain(
      vehicle.id,
    );
  });

  it("keeps a vehicle busy while a trip runs past its booked end", async () => {
    const vehicle = await newVehicle();
    // Booked to have ended an hour ago, but the ride is still in progress.
    const bookedStart = new Date(Date.now() - 180 * MINUTE);
    const bookedEnd = new Date(Date.now() - 60 * MINUTE);

    await seedBooking({
      vehicleId: vehicle.id,
      startTime: bookedStart,
      endTime: bookedEnd,
      status: BookingStatus.IN_PROGRESS,
    });

    // Without the running-trip rule this window sits clear of endTime + 30min
    // and the car would be offered while it is still out on the road.
    const wantedStart = nextBookableSlot();
    const wantedEnd = new Date(wantedStart.getTime() + 60 * MINUTE);

    const availability = await checkAvailability(
      resident,
      wantedStart.toISOString(),
      wantedEnd.toISOString(),
    );

    expect(availability.availableVehicles.map(({ id }) => id)).not.toContain(
      vehicle.id,
    );
  });

  it("leaves an ordinary future reservation blocking as before", async () => {
    const vehicle = await newVehicle();
    const bookedStart = halfHourBoundary(new Date(Date.now() + 4 * 60 * MINUTE));
    const bookedEnd = new Date(bookedStart.getTime() + 120 * MINUTE);

    await seedBooking({
      vehicleId: vehicle.id,
      startTime: bookedStart,
      endTime: bookedEnd,
      status: BookingStatus.BOOKED,
    });

    const overlappingStart = new Date(bookedStart.getTime() + 30 * MINUTE);
    const overlappingEnd = new Date(overlappingStart.getTime() + 60 * MINUTE);

    const availability = await checkAvailability(
      resident,
      overlappingStart.toISOString(),
      overlappingEnd.toISOString(),
    );

    expect(availability.availableVehicles.map(({ id }) => id)).not.toContain(
      vehicle.id,
    );
  });
});
