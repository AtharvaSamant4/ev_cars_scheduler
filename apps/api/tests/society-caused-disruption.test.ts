import {
  BookingStatus,
  TransactionType,
  UserRole,
  prisma,
} from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { cancelBooking } from "@/src/modules/bookings/service";
import { updateDriver } from "@/src/modules/drivers/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const MINUTE = 60_000;
const FARE = 200;
const CANCELLATION_FEE = 50;

/**
 * When the society takes a vehicle or driver out of service, the resident is
 * the injured party. They must not be charged for cancelling, and they must be
 * told rather than left waiting for a driver who is never coming.
 */
describe("society-caused disruption", () => {
  let societyId: string;
  let flatId: string;
  let resident: AuthUser;
  let admin: AuthUser;
  let walletId: string;
  let sequence = 0;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Disruption Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    const flat = await prisma.flat.create({
      data: { societyId, number: "DIS-101" },
    });
    flatId = flat.id;

    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Disruption Resident",
        phone: "9610000001",
        passwordHash: "fixture-hash",
      },
    });

    admin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Disruption Admin",
        email: "disruption-admin@example.test",
        passwordHash: "fixture-hash",
      },
    });

    walletId = (
      await prisma.wallet.create({
        data: { userId: resident.id, balance: 10_000 },
      })
    ).id;

    await prisma.penaltyRule.create({
      data: {
        societyId,
        name: "Cancellation",
        code: "CANCELLATION",
        amount: CANCELLATION_FEE,
        isActive: true,
      },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  async function bookingWithStatus(status: BookingStatus) {
    sequence += 1;
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: `Disruption EV ${sequence}`,
        registrationNumber: `DIS-EV-${sequence}`,
      },
    });

    const startTime = new Date(Date.now() + (4 + sequence) * 60 * MINUTE);
    const period = getIsoWeek(startTime);

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
        usedMinutes: 120,
      },
      update: { usedMinutes: { increment: 120 } },
    });

    const booking = await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime: new Date(startTime.getTime() + 120 * MINUTE),
        durationMinutes: 120,
        status,
      },
    });

    await prisma.walletTransaction.create({
      data: {
        walletId,
        bookingId: booking.id,
        amount: FARE,
        type: TransactionType.BOOKING_DEBIT,
        description: "Fixture booking charge",
      },
    });

    return booking;
  }

  async function penaltyTotalFor(bookingId: string) {
    const penalties = await prisma.walletTransaction.findMany({
      where: { bookingId, type: TransactionType.PENALTY },
    });
    return penalties.reduce((total, row) => total + row.amount, 0);
  }

  it("charges the usual fee when the resident simply changes their mind", async () => {
    const booking = await bookingWithStatus(BookingStatus.BOOKED);

    await cancelBooking(resident, booking.id);

    expect(await penaltyTotalFor(booking.id)).toBe(CANCELLATION_FEE);
  });

  it("waives the fee when the vehicle was taken out of service", async () => {
    const booking = await bookingWithStatus(BookingStatus.AT_RISK);
    const before = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    await cancelBooking(resident, booking.id);

    expect(await penaltyTotalFor(booking.id)).toBe(0);

    // The resident gets the whole fare back, not the fare minus a fee.
    const after = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(after.balance - before.balance).toBe(FARE);
  });

  it("hands back the bookings of a driver who is deactivated", async () => {
    sequence += 1;
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: `Disruption EV ${sequence}`,
        registrationNumber: `DIS-EV-${sequence}`,
      },
    });

    const driverProfile = await prisma.driver.create({
      data: {
        societyId,
        fullName: "Leaving Driver",
        phoneNumber: "9610000002",
        licenseNumber: "DIS-LICENSE-1",
        vehicleId: vehicle.id,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Leaving Driver",
        phone: "9610000002",
        passwordHash: "fixture-hash",
      },
    });

    const startTime = new Date(Date.now() + 12 * 60 * MINUTE);
    const period = getIsoWeek(startTime);
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

    const booking = await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId,
        userId: resident.id,
        driverId: driverProfile.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * MINUTE),
        durationMinutes: 60,
        status: BookingStatus.DRIVER_ASSIGNED,
      },
    });

    const noticesBefore = await prisma.notification.count({
      where: { userId: resident.id },
    });

    await updateDriver(admin, driverProfile.id, { isActive: false });

    const stranded = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stranded.status).toBe(BookingStatus.AT_RISK);
    expect(stranded.driverId).toBeNull();

    const noticesAfter = await prisma.notification.count({
      where: { userId: resident.id },
    });
    expect(noticesAfter).toBe(noticesBefore + 1);
  });

  it("leaves finished trips alone when a driver is deactivated", async () => {
    sequence += 1;
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: `Disruption EV ${sequence}`,
        registrationNumber: `DIS-EV-${sequence}`,
      },
    });

    const driverProfile = await prisma.driver.create({
      data: {
        societyId,
        fullName: "Retiring Driver",
        phoneNumber: "9610000003",
        licenseNumber: "DIS-LICENSE-2",
        vehicleId: vehicle.id,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Retiring Driver",
        phone: "9610000003",
        passwordHash: "fixture-hash",
      },
    });

    const startTime = new Date(Date.now() - 300 * MINUTE);
    const period = getIsoWeek(startTime);
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

    const completed = await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId,
        userId: resident.id,
        driverId: driverProfile.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * MINUTE),
        durationMinutes: 60,
        status: BookingStatus.COMPLETED,
      },
    });

    await updateDriver(admin, driverProfile.id, { isActive: false });

    const untouched = await prisma.booking.findUniqueOrThrow({
      where: { id: completed.id },
    });
    expect(untouched.status).toBe(BookingStatus.COMPLETED);
    expect(untouched.driverId).toBe(driverProfile.id);
  });
});
