import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { driverArrive, verifyOtp } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const MINUTE = 60_000;

/**
 * A driver must not be able to start a trip that is not due. Doing so takes the
 * vehicle off the road during a window availability still believes is free.
 */
describe("trip start window", () => {
  let societyId: string;
  let flatId: string;
  let resident: AuthUser;
  let driverUser: AuthUser;
  let driverProfileId: string;
  let vehicleSequence = 0;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Start Window Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    const flat = await prisma.flat.create({
      data: { societyId, number: "SW-101" },
    });
    flatId = flat.id;

    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Window Resident",
        phone: "9410000001",
        passwordHash: "fixture-hash",
      },
    });

    driverUser = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Window Driver",
        phone: "9410000002",
        passwordHash: "fixture-hash",
      },
    });

    driverProfileId = (
      await prisma.driver.create({
        data: {
          societyId,
          fullName: "Window Driver",
          phoneNumber: "9410000002",
          licenseNumber: "SW-LICENSE-1",
        },
      })
    ).id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  async function bookingStartingIn(minutesFromNow: number) {
    vehicleSequence += 1;
    // A dedicated vehicle per case keeps these fixtures from colliding on the
    // per-vehicle overlap constraint.
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: `Window EV ${vehicleSequence}`,
        registrationNumber: `SW-EV-${vehicleSequence}`,
      },
    });

    const startTime = new Date(Date.now() + minutesFromNow * MINUTE);
    const period = getIsoWeek(startTime);

    return prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId,
        userId: resident.id,
        driverId: driverProfileId,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * MINUTE),
        durationMinutes: 60,
        status: BookingStatus.DRIVER_ASSIGNED,
      },
    });
  }

  it("refuses arrival well before the booked slot", async () => {
    const booking = await bookingStartingIn(24 * 60);

    await expect(driverArrive(driverUser, booking.id)).rejects.toThrow(
      /cannot start yet/i,
    );

    const untouched = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(untouched.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(untouched.otp).toBeNull();
  });

  it("refuses arrival just outside the grace period", async () => {
    const booking = await bookingStartingIn(20);

    await expect(driverArrive(driverUser, booking.id)).rejects.toThrow(
      /cannot start yet/i,
    );
  });

  it("allows arrival inside the grace period before the slot", async () => {
    const booking = await bookingStartingIn(10);

    const arrived = await driverArrive(driverUser, booking.id);
    expect(arrived.status).toBe(BookingStatus.OTP_PENDING);
  });

  it("allows a late arrival so traffic never locks the driver out", async () => {
    const booking = await bookingStartingIn(-90);

    const arrived = await driverArrive(driverUser, booking.id);
    expect(arrived.status).toBe(BookingStatus.OTP_PENDING);
  });

  it("refuses to verify an OTP issued before the window opened", async () => {
    const booking = await bookingStartingIn(10);
    await driverArrive(driverUser, booking.id);

    const otp = (
      await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { otp: true },
      })
    ).otp!;

    // Push the slot back out of reach: the OTP is still valid, but the trip is
    // no longer due, so verification must fail too rather than trusting that
    // arrival already checked.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        startTime: new Date(Date.now() + 6 * 60 * MINUTE),
        endTime: new Date(Date.now() + 7 * 60 * MINUTE),
      },
    });

    await expect(verifyOtp(driverUser, booking.id, otp)).rejects.toThrow(
      /cannot start yet/i,
    );

    const stillPending = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stillPending.status).toBe(BookingStatus.OTP_PENDING);
    expect(stillPending.actualRideStartTime).toBeNull();
  });
});
