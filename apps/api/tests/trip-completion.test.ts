import { BookingStatus, prisma, TransactionType, UserRole } from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as downloadInvoicePdf } from "@/app/api/v1/bookings/[bookingId]/invoice/pdf/route";
import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { completeTrip, driverArrive, verifyOtp } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Trip completion, late penalty, and invoice", () => {
  let societyId: string;
  let flatId: string;
  let resident: AuthUser;
  let admin: AuthUser;
  let driver: AuthUser;
  let vehicleId: string;
  let driverProfileId: string;
  let walletId: string;
  let futureRideSequence = 0;
  let historicalRideSequence = 0;
  const hourlyRate = 140;
  const latePenaltyPerHour = 125;
  const openingBalance = 5_000;
  const minute = 60_000;

  async function createRide() {
    futureRideSequence += 1;
    // A driver may only start a trip once its booked window has opened, so the
    // fixture has to be live rather than scheduled for tomorrow. Each ride gets
    // its own vehicle so several can be in-window at the same time without
    // colliding on the per-vehicle overlap constraint.
    const rideVehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: `Completion EV ${futureRideSequence}`,
        registrationNumber: `CMP-EV-R${futureRideSequence}`,
        hourlyRate,
      },
    });
    const start = new Date(Date.now() - 10 * minute);
    start.setSeconds(0, 0);
    const period = getIsoWeek(start);

    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          societyId,
          vehicleId: rideVehicle.id,
          flatId,
          userId: resident.id,
          driverId: driverProfileId,
          quotaYear: period.year,
          quotaWeek: period.week,
          startTime: start,
          endTime: new Date(start.getTime() + 60 * minute),
          durationMinutes: 60,
          status: BookingStatus.BOOKED,
        },
      });

      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: { decrement: hourlyRate },
          transactions: {
            create: {
              bookingId: booking.id,
              amount: hourlyRate,
              type: TransactionType.BOOKING_DEBIT,
              description: "Fixture booking charge",
            },
          },
        },
      });

      return booking;
    });
  }

  async function storedOtp(bookingId: string) {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { otp: true },
    });
    expect(booking.otp).toMatch(/^\d{6}$/);
    return booking.otp!;
  }

  async function startRideThroughOtp(bookingId: string) {
    const arrived = await driverArrive(driver, bookingId);
    expect(arrived.status).toBe(BookingStatus.OTP_PENDING);
    expect(arrived).not.toHaveProperty("otp");
    expect(arrived.user).not.toHaveProperty("passwordHash");

    const started = await verifyOtp(driver, bookingId, await storedOtp(bookingId));
    expect(started.status).toBe(BookingStatus.IN_PROGRESS);
    expect(started.otpVerified).toBe(true);
    expect(started.actualRideStartTime).toBeInstanceOf(Date);
    expect(started).not.toHaveProperty("otp");
    expect(started.user).not.toHaveProperty("passwordHash");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).otp).toBeNull();
  }

  async function prepareStartedRide(lateMinutes = 0) {
    const booking = await createRide();
    await startRideThroughOtp(booking.id);

    historicalRideSequence += 1;
    const scheduledEndTime = new Date(
      Date.now() - (90 + historicalRideSequence * 180) * minute,
    );
    const scheduledStartTime = new Date(scheduledEndTime.getTime() - 60 * minute);
    const actualEndTime = new Date(scheduledEndTime.getTime() + lateMinutes * minute);
    const period = getIsoWeek(scheduledStartTime);

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        startTime: scheduledStartTime,
        endTime: scheduledEndTime,
        durationMinutes: 60,
        quotaYear: period.year,
        quotaWeek: period.week,
        actualRideStartTime: scheduledStartTime,
      },
    });

    return {
      bookingId: booking.id,
      scheduledStartTime,
      scheduledEndTime,
      actualEndTime,
    };
  }

  async function expectWalletMatchesLedger() {
    const [wallet, transactions] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { id: walletId } }),
      prisma.walletTransaction.findMany({ where: { walletId } }),
    ]);
    const signedTotal = transactions.reduce((total, transaction) => {
      const positive =
        transaction.type === TransactionType.CREDIT ||
        transaction.type === TransactionType.REFUND ||
        transaction.type === TransactionType.RECHARGE;
      return total + (positive ? transaction.amount : -transaction.amount);
    }, 0);
    expect(wallet.balance).toBe(signedTotal);
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Completion Fixture Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "CMP-101" } });
    flatId = flat.id;
    resident = await prisma.user.create({
      data: {
        societyId,
        flatId,
        role: UserRole.RESIDENT,
        name: "Completion Resident",
        phone: "9100000042",
        passwordHash: "fixture-hash",
      },
    });
    admin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Completion Admin",
        phone: "9100000044",
        passwordHash: "fixture-hash",
      },
    });
    driver = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Completion Driver",
        phone: "9100000043",
        passwordHash: "fixture-hash",
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Completion EV",
        registrationNumber: "CMP-EV-1",
        hourlyRate,
      },
    });
    vehicleId = vehicle.id;
    driverProfileId = (await prisma.driver.create({
      data: {
        societyId,
        fullName: driver.name,
        phoneNumber: "9100000043",
        licenseNumber: "CMP-LICENSE",
        vehicleId,
      },
    })).id;
    const wallet = await prisma.wallet.create({
      data: {
        userId: resident.id,
        balance: openingBalance,
        transactions: {
          create: {
            amount: openingBalance,
            type: TransactionType.CREDIT,
            description: "Fixture opening balance",
          },
        },
      },
    });
    walletId = wallet.id;
    await prisma.penaltyRule.create({
      data: {
        societyId,
        code: "LATE_RETURN_PER_HOUR",
        name: "Late return per hour",
        amount: latePenaltyPerHour,
        isActive: true,
      },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("rejects completion when the ride has not legitimately started", async () => {
    const booking = await createRide();
    await expect(completeTrip(driver, booking.id)).rejects.toThrow(
      "Only a verified ride in progress",
    );
    expect(await prisma.invoice.count({ where: { bookingId: booking.id } })).toBe(0);
    await expectWalletMatchesLedger();
  });

  it("rejects an end time equal to the start or in the future", async () => {
    const ride = await prepareStartedRide();

    await expect(
      completeTrip(admin, ride.bookingId, ride.scheduledStartTime.toISOString()),
    ).rejects.toThrow("after the ride start and cannot be in the future");
    await expect(
      completeTrip(admin, ride.bookingId, new Date(Date.now() + 60_000).toISOString()),
    ).rejects.toThrow("after the ride start and cannot be in the future");

    expect(await prisma.booking.findUniqueOrThrow({ where: { id: ride.bookingId } })).toMatchObject({
      status: BookingStatus.IN_PROGRESS,
      actualEndTime: null,
    });
    expect(await prisma.invoice.count({ where: { bookingId: ride.bookingId } })).toBe(0);
    expect(await prisma.penalty.count({ where: { bookingId: ride.bookingId } })).toBe(0);
    await expectWalletMatchesLedger();
  });

  it("completes an on-time ride once and invoices the immutable booking debit", async () => {
    const ride = await prepareStartedRide();
    const balanceBeforeCompletion = (
      await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })
    ).balance;

    await prisma.vehicle.update({ where: { id: vehicleId }, data: { hourlyRate: 999 } });
    const completed = await completeTrip(
      admin,
      ride.bookingId,
      ride.actualEndTime.toISOString(),
    );
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { hourlyRate } });

    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.actualEndTime?.toISOString()).toBe(ride.actualEndTime.toISOString());
    expect(completed).not.toHaveProperty("otp");
    expect(completed.user).not.toHaveProperty("passwordHash");
    expect(await prisma.penalty.count({ where: { bookingId: ride.bookingId } })).toBe(0);
    expect(
      await prisma.walletTransaction.count({
        where: { bookingId: ride.bookingId, type: TransactionType.PENALTY },
      }),
    ).toBe(0);
    const invoices = await prisma.invoice.findMany({ where: { bookingId: ride.bookingId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      subtotal: hourlyRate,
      penaltyAmount: 0,
      totalAmount: hourlyRate,
    });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(
      balanceBeforeCompletion,
    );
    await expectWalletMatchesLedger();
  });

  it("rounds up a late penalty and never duplicates its debit or invoice", async () => {
    const ride = await prepareStartedRide(65);
    const expectedPenalty = 2 * latePenaltyPerHour;
    const balanceBeforeCompletion = (
      await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })
    ).balance;

    await completeTrip(admin, ride.bookingId, ride.actualEndTime.toISOString());

    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: ride.bookingId } });
    expect(stored.actualEndTime?.toISOString()).toBe(ride.actualEndTime.toISOString());
    const penalties = await prisma.penalty.findMany({ where: { bookingId: ride.bookingId } });
    expect(penalties).toHaveLength(1);
    expect(penalties[0].amount).toBe(expectedPenalty);
    const deductions = await prisma.walletTransaction.findMany({
      where: { bookingId: ride.bookingId, type: TransactionType.PENALTY },
    });
    expect(deductions).toHaveLength(1);
    expect(deductions[0].amount).toBe(expectedPenalty);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(
      balanceBeforeCompletion - expectedPenalty,
    );

    const invoices = await prisma.invoice.findMany({ where: { bookingId: ride.bookingId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      subtotal: hourlyRate,
      penaltyAmount: expectedPenalty,
      totalAmount: hourlyRate + expectedPenalty,
    });

    const balanceAfterCompletion = (
      await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })
    ).balance;
    await expect(completeTrip(driver, ride.bookingId)).rejects.toThrow(
      "Only a verified ride in progress",
    );
    expect(await prisma.penalty.count({ where: { bookingId: ride.bookingId } })).toBe(1);
    expect(await prisma.invoice.count({ where: { bookingId: ride.bookingId } })).toBe(1);
    expect(
      await prisma.walletTransaction.count({
        where: { bookingId: ride.bookingId, type: TransactionType.PENALTY },
      }),
    ).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(
      balanceAfterCompletion,
    );
    await expectWalletMatchesLedger();
  });

  it("returns a valid non-empty PDF for the owning resident", async () => {
    const ride = await prepareStartedRide();
    await completeTrip(admin, ride.bookingId, ride.actualEndTime.toISOString());
    const token = await issueToken(resident);
    const response = await downloadInvoicePdf(
      new NextRequest(`http://127.0.0.1/api/v1/bookings/${ride.bookingId}/invoice/pdf`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ bookingId: ride.bookingId }) },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(bytes.length).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
    await expectWalletMatchesLedger();
  });
});
