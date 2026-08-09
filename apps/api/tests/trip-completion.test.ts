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
  let driver: AuthUser;
  let vehicleId: string;
  let driverProfileId: string;
  let walletId: string;
  let onTimeBookingId: string;
  let lateBookingId: string;
  const hourlyRate = 140;
  const latePenaltyPerHour = 125;
  const openingBalance = 5_000;

  async function createRide(start: Date) {
    const period = getIsoWeek(start);
    return prisma.booking.create({
      data: {
        societyId,
        vehicleId,
        flatId,
        userId: resident.id,
        driverId: driverProfileId,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: start,
        endTime: new Date(start.getTime() + 60 * 60_000),
        durationMinutes: 60,
        status: BookingStatus.BOOKED,
      },
    });
  }

  async function startRideThroughOtp(bookingId: string) {
    const arrived = await driverArrive(driver, bookingId);
    const started = await verifyOtp(driver, bookingId, arrived.otp!);
    expect(started.status).toBe(BookingStatus.IN_PROGRESS);
    expect(started.otpVerified).toBe(true);
    expect(started.actualRideStartTime).toBeInstanceOf(Date);
    return started;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({ data: { name: "Completion Fixture Society", timezone: "Asia/Kolkata" } });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "CMP-101" } });
    flatId = flat.id;
    const admin = await prisma.user.create({
      data: { societyId, role: UserRole.ADMIN, name: "Completion Admin", phone: "9100000041", passwordHash: "fixture-hash" },
    });
    resident = await prisma.user.create({
      data: { societyId, flatId, role: UserRole.RESIDENT, name: "Completion Resident", phone: "9100000042", passwordHash: "fixture-hash" },
    });
    driver = await prisma.user.create({
      data: { societyId, role: UserRole.DRIVER, name: "Completion Driver", phone: "9100000043", passwordHash: "fixture-hash" },
    });
    const vehicle = await prisma.vehicle.create({
      data: { societyId, name: "Completion EV", registrationNumber: "CMP-EV-1", hourlyRate },
    });
    vehicleId = vehicle.id;
    driverProfileId = (await prisma.driver.create({
      data: { societyId, fullName: driver.name, phoneNumber: "9100000043", licenseNumber: "CMP-LICENSE", vehicleId },
    })).id;
    const wallet = await prisma.wallet.create({ data: { userId: resident.id, balance: openingBalance } });
    walletId = wallet.id;
    await prisma.penaltyRule.create({
      data: { societyId, code: "LATE_RETURN_PER_HOUR", name: "Late return per hour", amount: latePenaltyPerHour, isActive: true },
    });

    const firstStart = new Date(Date.now() + 30 * 60_000);
    firstStart.setSeconds(0, 0);
    const secondStart = new Date(firstStart.getTime() + 3 * 60 * 60_000);
    onTimeBookingId = (await createRide(firstStart)).id;
    lateBookingId = (await createRide(secondStart)).id;

    expect(admin.id).toBeDefined();
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("rejects completion when the ride has not legitimately started", async () => {
    await expect(completeTrip(driver, onTimeBookingId)).rejects.toThrow("Only a verified ride in progress");
    expect(await prisma.invoice.count({ where: { bookingId: onTimeBookingId } })).toBe(0);
  });

  it("completes an OTP-started on-time ride, stores actualEndTime, and creates a zero-penalty invoice once", async () => {
    await startRideThroughOtp(onTimeBookingId);
    const scheduled = await prisma.booking.findUniqueOrThrow({ where: { id: onTimeBookingId } });
    const completed = await completeTrip(driver, onTimeBookingId, scheduled.endTime.toISOString());

    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.actualEndTime?.toISOString()).toBe(scheduled.endTime.toISOString());
    expect(await prisma.penalty.count({ where: { bookingId: onTimeBookingId } })).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { bookingId: onTimeBookingId, type: TransactionType.PENALTY } })).toBe(0);
    const invoices = await prisma.invoice.findMany({ where: { bookingId: onTimeBookingId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ subtotal: hourlyRate, penaltyAmount: 0, totalAmount: hourlyRate });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(openingBalance);
  });

  it("applies the rounded-up late penalty and wallet deduction exactly once", async () => {
    await startRideThroughOtp(lateBookingId);
    const scheduled = await prisma.booking.findUniqueOrThrow({ where: { id: lateBookingId } });
    const actualEndTime = new Date(scheduled.endTime.getTime() + 65 * 60_000);
    const expectedPenalty = 2 * latePenaltyPerHour;
    await completeTrip(driver, lateBookingId, actualEndTime.toISOString());

    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: lateBookingId } });
    expect(stored.actualEndTime?.toISOString()).toBe(actualEndTime.toISOString());
    const penalties = await prisma.penalty.findMany({ where: { bookingId: lateBookingId } });
    expect(penalties).toHaveLength(1);
    expect(penalties[0].amount).toBe(expectedPenalty);
    const deductions = await prisma.walletTransaction.findMany({ where: { bookingId: lateBookingId, type: TransactionType.PENALTY } });
    expect(deductions).toHaveLength(1);
    expect(deductions[0].amount).toBe(expectedPenalty);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(openingBalance - expectedPenalty);

    const invoices = await prisma.invoice.findMany({ where: { bookingId: lateBookingId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      subtotal: hourlyRate,
      penaltyAmount: expectedPenalty,
      totalAmount: hourlyRate + expectedPenalty,
    });
  });

  it("does not duplicate penalty, invoice, or deduction on duplicate completion", async () => {
    const balanceBefore = (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance;
    await expect(completeTrip(driver, lateBookingId)).rejects.toThrow("Only a verified ride in progress");
    expect(await prisma.penalty.count({ where: { bookingId: lateBookingId } })).toBe(1);
    expect(await prisma.invoice.count({ where: { bookingId: lateBookingId } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { bookingId: lateBookingId, type: TransactionType.PENALTY } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(balanceBefore);
  });

  it("returns a valid non-empty PDF from the invoice endpoint", async () => {
    const token = await issueToken(resident);
    const response = await downloadInvoicePdf(
      new NextRequest(`http://127.0.0.1/api/v1/bookings/${lateBookingId}/invoice/pdf`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ bookingId: lateBookingId }) },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(bytes.length).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
