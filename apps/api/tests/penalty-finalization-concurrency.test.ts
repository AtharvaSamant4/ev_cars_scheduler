import { randomUUID } from "node:crypto";

import { BookingStatus, prisma, TransactionType, UserRole } from "@society-ev/db";
import { describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { completeTrip } from "@/src/modules/bookings/service";
import { applyPenalty } from "@/src/modules/penalties/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

async function waitForLockWaiters(expected: number) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const [result] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS "count"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `;
    if (result.count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expected} blocked database operation(s)`);
}

describe("manual penalty versus trip finalization", () => {
  it("linearizes on the booking and rejects a manual penalty when completion wins", async () => {
    const marker = randomUUID().replaceAll("-", "").slice(0, 12);
    const society = await prisma.society.create({
      data: { name: `Penalty race ${marker}`, timezone: "Asia/Kolkata" },
    });
    let releaseWalletLock = () => {};
    let holder: Promise<unknown> | undefined;

    try {
      const flat = await prisma.flat.create({
        data: { societyId: society.id, number: `F-${marker}` },
      });
      const adminRecord = await prisma.user.create({
        data: {
          societyId: society.id,
          role: UserRole.ADMIN,
          name: "Penalty Race Admin",
          phone: `a-${marker}`,
          passwordHash: "fixture-hash",
        },
      });
      const resident = await prisma.user.create({
        data: {
          societyId: society.id,
          flatId: flat.id,
          role: UserRole.RESIDENT,
          name: "Penalty Race Resident",
          phone: `r-${marker}`,
          passwordHash: "fixture-hash",
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Penalty Race EV",
          registrationNumber: `EV-${marker}`,
          hourlyRate: 100,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: resident.id,
          balance: 1_000,
          transactions: {
            create: {
              amount: 1_000,
              type: TransactionType.CREDIT,
              description: "Fixture opening balance",
            },
          },
        },
      });
      const [lateRule, manualRule] = await Promise.all([
        prisma.penaltyRule.create({
          data: {
            societyId: society.id,
            code: "LATE_RETURN_PER_HOUR",
            name: "Late return",
            amount: 100,
          },
        }),
        prisma.penaltyRule.create({
          data: {
            societyId: society.id,
            code: "DAMAGE",
            name: "Damage",
            amount: 75,
          },
        }),
      ]);

      const actualEndTime = new Date(Date.now() - 1_000);
      const scheduledEndTime = new Date(actualEndTime.getTime() - 61 * 60_000);
      const startTime = new Date(scheduledEndTime.getTime() - 60 * 60_000);
      const period = getIsoWeek(startTime);
      const booking = await prisma.booking.create({
        data: {
          societyId: society.id,
          flatId: flat.id,
          userId: resident.id,
          vehicleId: vehicle.id,
          quotaYear: period.year,
          quotaWeek: period.week,
          startTime,
          endTime: scheduledEndTime,
          durationMinutes: 60,
          status: BookingStatus.IN_PROGRESS,
          otpVerified: true,
          otpVerifiedAt: startTime,
          actualRideStartTime: startTime,
        },
      });
      const admin: AuthUser = {
        id: adminRecord.id,
        societyId: society.id,
        flatId: null,
        role: UserRole.ADMIN,
        name: adminRecord.name,
      };

      let walletLockReady!: () => void;
      const walletLockAcquired = new Promise<void>((resolve) => {
        walletLockReady = resolve;
      });
      let release!: () => void;
      const releaseSignal = new Promise<void>((resolve) => {
        release = resolve;
      });
      releaseWalletLock = release;
      holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM "Wallet" WHERE "id" = ${wallet.id}::uuid FOR UPDATE
          `;
          walletLockReady();
          await releaseSignal;
        },
        { timeout: 15_000 },
      );
      await walletLockAcquired;

      const completion = completeTrip(admin, booking.id, actualEndTime.toISOString());
      await waitForLockWaiters(1);
      const manualPenalty = applyPenalty(admin, booking.id, manualRule.id, "Concurrent damage");
      await waitForLockWaiters(2);
      releaseWalletLock();

      const [completionResult, manualResult] = await Promise.allSettled([
        completion,
        manualPenalty,
      ]);
      await holder;

      expect(completionResult.status).toBe("fulfilled");
      expect(manualResult.status).toBe("rejected");
      if (manualResult.status === "rejected") {
        expect(manualResult.reason).toMatchObject({ code: "BOOKING_FINALIZED" });
      }
      expect(
        await prisma.penalty.count({
          where: { bookingId: booking.id, penaltyRuleId: manualRule.id },
        }),
      ).toBe(0);
      expect(
        await prisma.penalty.count({
          where: { bookingId: booking.id, penaltyRuleId: lateRule.id },
        }),
      ).toBe(1);
      expect(
        await prisma.walletTransaction.count({
          where: { bookingId: booking.id, type: TransactionType.PENALTY },
        }),
      ).toBe(1);
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance).toBe(800);
    } finally {
      releaseWalletLock();
      if (holder) await holder.catch(() => undefined);
      await cleanupSocietyFixture(society.id);
    }
  });

  it("serializes first-wallet creation across completion and a manual penalty", async () => {
    const marker = randomUUID().replaceAll("-", "").slice(0, 12);
    const society = await prisma.society.create({
      data: { name: `Penalty wallet race ${marker}`, timezone: "Asia/Kolkata" },
    });

    try {
      const flat = await prisma.flat.create({
        data: { societyId: society.id, number: `F-${marker}` },
      });
      const adminRecord = await prisma.user.create({
        data: {
          societyId: society.id,
          role: UserRole.ADMIN,
          name: "Wallet Race Admin",
          phone: `a-${marker}`,
          passwordHash: "fixture-hash",
        },
      });
      const resident = await prisma.user.create({
        data: {
          societyId: society.id,
          flatId: flat.id,
          role: UserRole.RESIDENT,
          name: "Wallet Race Resident",
          phone: `r-${marker}`,
          passwordHash: "fixture-hash",
        },
      });
      const [rideVehicle, manualVehicle] = await Promise.all([
        prisma.vehicle.create({
          data: {
            societyId: society.id,
            name: "Ride EV",
            registrationNumber: `R-${marker}`,
            hourlyRate: 100,
          },
        }),
        prisma.vehicle.create({
          data: {
            societyId: society.id,
            name: "Manual EV",
            registrationNumber: `M-${marker}`,
            hourlyRate: 100,
          },
        }),
      ]);
      await prisma.penaltyRule.create({
        data: {
          societyId: society.id,
          code: "LATE_RETURN_PER_HOUR",
          name: "Late return",
          amount: 100,
        },
      });
      const manualRule = await prisma.penaltyRule.create({
        data: {
          societyId: society.id,
          code: "DAMAGE",
          name: "Damage",
          amount: 75,
        },
      });
      const admin: AuthUser = {
        id: adminRecord.id,
        societyId: society.id,
        flatId: null,
        role: UserRole.ADMIN,
        name: adminRecord.name,
      };

      const actualEndTime = new Date(Date.now() - 1_000);
      const rideEndTime = new Date(actualEndTime.getTime() - 61 * 60_000);
      const rideStartTime = new Date(rideEndTime.getTime() - 60 * 60_000);
      const ridePeriod = getIsoWeek(rideStartTime);
      const manualStartTime = new Date(Date.now() + 24 * 60 * 60_000);
      const manualPeriod = getIsoWeek(manualStartTime);
      const [rideBooking, manualBooking] = await Promise.all([
        prisma.booking.create({
          data: {
            societyId: society.id,
            flatId: flat.id,
            userId: resident.id,
            vehicleId: rideVehicle.id,
            quotaYear: ridePeriod.year,
            quotaWeek: ridePeriod.week,
            startTime: rideStartTime,
            endTime: rideEndTime,
            durationMinutes: 60,
            status: BookingStatus.IN_PROGRESS,
            otpVerified: true,
            otpVerifiedAt: rideStartTime,
            actualRideStartTime: rideStartTime,
          },
        }),
        prisma.booking.create({
          data: {
            societyId: society.id,
            flatId: flat.id,
            userId: resident.id,
            vehicleId: manualVehicle.id,
            quotaYear: manualPeriod.year,
            quotaWeek: manualPeriod.week,
            startTime: manualStartTime,
            endTime: new Date(manualStartTime.getTime() + 60 * 60_000),
            durationMinutes: 60,
            status: BookingStatus.BOOKED,
          },
        }),
      ]);

      await expect(prisma.wallet.count({ where: { userId: resident.id } })).resolves.toBe(0);
      const [completed, manualPenalty] = await Promise.all([
        completeTrip(admin, rideBooking.id, actualEndTime.toISOString()),
        applyPenalty(admin, manualBooking.id, manualRule.id, "Concurrent first use"),
      ]);
      expect(completed.status).toBe(BookingStatus.COMPLETED);
      expect(manualPenalty).toMatchObject({
        bookingId: manualBooking.id,
        amount: 75,
      });

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: resident.id },
      });
      expect(wallet.balance).toBe(-275);
      const ledger = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
      });
      expect(ledger).toHaveLength(2);
      expect(ledger.reduce((total, transaction) => total - transaction.amount, 0)).toBe(
        wallet.balance,
      );
      expect(await prisma.wallet.count({ where: { userId: resident.id } })).toBe(1);
    } finally {
      await cleanupSocietyFixture(society.id);
    }
  });
});
