import { BookingStatus, prisma, TransactionType, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { cancelBooking, createBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("AT_RISK resident cancellation", () => {
  let societyId: string;
  let resident: AuthUser;
  let otherResident: AuthUser;
  let vehicleId: string;

  function slot(days: number) {
    const start = new Date();
    start.setDate(start.getDate() + days);
    start.setHours(11, 0, 0, 0);
    return start;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "AT_RISK Cancellation Fixture", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const [flat, otherFlat] = await Promise.all([
      prisma.flat.create({ data: { societyId, number: "RISK-101" } }),
      prisma.flat.create({ data: { societyId, number: "RISK-102" } }),
    ]);
    resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "At Risk Resident",
        phone: "9100000221",
        passwordHash: "fixture-hash",
      },
    });
    otherResident = await prisma.user.create({
      data: {
        societyId,
        flatId: otherFlat.id,
        role: UserRole.RESIDENT,
        name: "Other At Risk Resident",
        phone: "9100000222",
        passwordHash: "fixture-hash",
      },
    });
    await Promise.all([
      prisma.wallet.create({ data: { userId: resident.id, balance: 5_000 } }),
      prisma.wallet.create({ data: { userId: otherResident.id, balance: 5_000 } }),
    ]);
    vehicleId = (await prisma.vehicle.create({
      data: { societyId, name: "At Risk EV", registrationNumber: "RISK-EV", hourlyRate: 100 },
    })).id;
    await prisma.penaltyRule.create({
      data: {
        societyId,
        code: "CANCELLATION",
        name: "Cancellation",
        amount: 50,
        isActive: true,
      },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("lets the owning resident cancel a future AT_RISK booking under the normal refund and penalty policy", async () => {
    const start = slot(1);
    const created = await createBooking(
      resident,
      start.toISOString(),
      new Date(start.getTime() + 60 * 60_000).toISOString(),
      vehicleId,
    );
    await prisma.booking.update({
      where: { id: created.booking.id },
      data: { status: BookingStatus.AT_RISK },
    });

    await expect(cancelBooking(otherResident, created.booking.id)).rejects.toThrow("Booking not found");
    const cancelled = await cancelBooking(resident, created.booking.id);
    expect(cancelled.booking.status).toBe(BookingStatus.CANCELLED);
    expect(cancelled.quota.usedMinutes).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } })).balance).toBe(4_950);

    const transactions = await prisma.walletTransaction.findMany({
      where: { bookingId: created.booking.id },
    });
    expect(transactions.filter((transaction) => transaction.type === TransactionType.BOOKING_DEBIT)).toHaveLength(1);
    expect(transactions.filter((transaction) => transaction.type === TransactionType.REFUND)).toHaveLength(1);
    expect(transactions.filter((transaction) => transaction.type === TransactionType.PENALTY)).toHaveLength(1);
  });

  it("does not cancel an already started or completed ride", async () => {
    const startedAt = new Date();
    const inProgressStart = slot(3);
    const inProgress = await createBooking(
      resident,
      inProgressStart.toISOString(),
      new Date(inProgressStart.getTime() + 60 * 60_000).toISOString(),
      vehicleId,
    );
    await prisma.booking.update({
      where: { id: inProgress.booking.id },
      data: {
        status: BookingStatus.IN_PROGRESS,
        otpVerified: true,
        otpVerifiedAt: startedAt,
        actualRideStartTime: startedAt,
      },
    });
    await expect(cancelBooking(resident, inProgress.booking.id)).rejects.toThrow("Only future booked or at-risk");

    const completedStart = slot(5);
    const completed = await createBooking(
      resident,
      completedStart.toISOString(),
      new Date(completedStart.getTime() + 60 * 60_000).toISOString(),
      vehicleId,
    );
    await prisma.booking.update({
      where: { id: completed.booking.id },
      data: { status: BookingStatus.COMPLETED, actualEndTime: new Date() },
    });
    await expect(cancelBooking(resident, completed.booking.id)).rejects.toThrow("Only future booked or at-risk");
  });
});
