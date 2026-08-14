import { randomUUID } from "node:crypto";

import {
  BookingStatus,
  prisma,
  TransactionType,
  UserRole,
} from "@society-ev/db";
import { describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import {
  completeTrip,
  driverArrive,
  verifyOtp,
} from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

type RuleMode = "active" | "disabled" | "missing";

type Fixture = {
  societyId: string;
  flatId: string;
  residentId: string;
  admin: AuthUser;
  driver: AuthUser;
  driverProfileId: string;
  vehicleId: string;
};

const minute = 60_000;
const latePenaltyPerHour = 125;

async function createFixture({
  ruleMode = "active",
  walletBalance,
}: {
  ruleMode?: RuleMode;
  walletBalance?: number;
} = {}): Promise<Fixture> {
  const marker = randomUUID().replaceAll("-", "").slice(0, 12);
  const society = await prisma.society.create({
    data: { name: `OTP completion ${marker}`, timezone: "Asia/Kolkata" },
  });
  const flat = await prisma.flat.create({
    data: { societyId: society.id, number: `F-${marker}` },
  });
  const resident = await prisma.user.create({
    data: {
      societyId: society.id,
      flatId: flat.id,
      role: UserRole.RESIDENT,
      name: "OTP Resident",
      phone: `r-${marker}`,
      passwordHash: "fixture-hash",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      societyId: society.id,
      role: UserRole.ADMIN,
      name: "OTP Admin",
      phone: `a-${marker}`,
      passwordHash: "fixture-hash",
    },
  });
  const driverUser = await prisma.user.create({
    data: {
      societyId: society.id,
      role: UserRole.DRIVER,
      name: "OTP Driver",
      phone: `d-${marker}`,
      passwordHash: "fixture-hash",
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      societyId: society.id,
      name: "OTP EV",
      registrationNumber: `EV-${marker}`,
      hourlyRate: 100,
    },
  });
  const driverProfile = await prisma.driver.create({
    data: {
      societyId: society.id,
      fullName: driverUser.name,
      phoneNumber: driverUser.phone!,
      licenseNumber: `LIC-${marker}`,
      vehicleId: vehicle.id,
    },
  });

  if (walletBalance !== undefined) {
    const wallet = await prisma.wallet.create({
      data: { userId: resident.id, balance: walletBalance },
    });
    if (walletBalance !== 0) {
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: walletBalance,
          type: TransactionType.CREDIT,
          description: "Fixture opening balance",
        },
      });
    }
  }

  if (ruleMode !== "missing") {
    await prisma.penaltyRule.create({
      data: {
        societyId: society.id,
        code: "LATE_RETURN_PER_HOUR",
        name: "Late return per started hour",
        amount: latePenaltyPerHour,
        isActive: ruleMode === "active",
      },
    });
  }

  return {
    societyId: society.id,
    flatId: flat.id,
    residentId: resident.id,
    admin: {
      id: adminUser.id,
      societyId: society.id,
      flatId: null,
      role: UserRole.ADMIN,
      name: adminUser.name,
    },
    driver: {
      id: driverUser.id,
      societyId: society.id,
      flatId: null,
      role: UserRole.DRIVER,
      name: driverUser.name,
    },
    driverProfileId: driverProfile.id,
    vehicleId: vehicle.id,
  };
}

async function createOtpBooking(fixture: Fixture) {
  // Live rather than scheduled for tomorrow: a driver can only raise an OTP
  // once the booked window has opened.
  const startTime = new Date(Date.now() - 10 * minute);
  const period = getIsoWeek(startTime);
  return prisma.booking.create({
    data: {
      societyId: fixture.societyId,
      flatId: fixture.flatId,
      userId: fixture.residentId,
      vehicleId: fixture.vehicleId,
      driverId: fixture.driverProfileId,
      quotaYear: period.year,
      quotaWeek: period.week,
      startTime,
      endTime: new Date(startTime.getTime() + 60 * minute),
      durationMinutes: 60,
      status: BookingStatus.DRIVER_ASSIGNED,
    },
  });
}

async function createStartedBooking(fixture: Fixture, lateMinutes: number) {
  const actualEndTime = new Date(Date.now() - 1_000);
  const scheduledEndTime = new Date(actualEndTime.getTime() - lateMinutes * minute);
  const startTime = new Date(scheduledEndTime.getTime() - 60 * minute);
  const period = getIsoWeek(startTime);
  const booking = await prisma.booking.create({
    data: {
      societyId: fixture.societyId,
      flatId: fixture.flatId,
      userId: fixture.residentId,
      vehicleId: fixture.vehicleId,
      driverId: fixture.driverProfileId,
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

  return { booking, actualEndTime };
}

async function readOtp(bookingId: string) {
  const { otp } = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { otp: true },
  });
  expect(otp).toMatch(/^\d{6}$/);
  return otp!;
}

async function expectWalletLedgerInvariant(userId: string) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
  });
  const ledgerBalance = transactions.reduce((balance, transaction) => {
    const credit =
      transaction.type === TransactionType.CREDIT ||
      transaction.type === TransactionType.REFUND ||
      transaction.type === TransactionType.RECHARGE;
    return balance + (credit ? transaction.amount : -transaction.amount);
  }, 0);
  expect(wallet.balance).toBe(ledgerBalance);
}

describe("OTP concurrency and secret handling", () => {
  it("serializes concurrent arrivals and never returns the OTP secret", async () => {
    const fixture = await createFixture();
    try {
      const booking = await createOtpBooking(fixture);
      const results = await Promise.allSettled([
        driverArrive(fixture.driver, booking.id),
        driverArrive(fixture.driver, booking.id),
      ]);
      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof driverArrive>>> =>
          result.status === "fulfilled",
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: "INVALID_STATUS" });
      expect(fulfilled[0].value).not.toHaveProperty("otp");
      expect(fulfilled[0].value.user).not.toHaveProperty("passwordHash");
      expect(fulfilled[0].value.driver).not.toHaveProperty("passwordHash");

      const stored = await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      expect(stored.status).toBe(BookingStatus.OTP_PENDING);
      expect(stored.otp).toMatch(/^\d{6}$/);
      expect(stored.otpAttempts).toBe(0);
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it("atomically enforces five attempts and blocks early regeneration", async () => {
    const fixture = await createFixture();
    try {
      const booking = await createOtpBooking(fixture);
      await driverArrive(fixture.driver, booking.id);
      const secret = await readOtp(booking.id);

      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, () => verifyOtp(fixture.driver, booking.id, "000000")),
      );
      expect(attempts.every((attempt) => attempt.status === "rejected")).toBe(true);
      for (const attempt of attempts) {
        if (attempt.status === "rejected") {
          expect(attempt.reason).toMatchObject({ code: "INVALID_OTP" });
        }
      }
      expect(
        (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).otpAttempts,
      ).toBe(5);
      await expect(verifyOtp(fixture.driver, booking.id, secret)).rejects.toMatchObject({
        code: "MAX_ATTEMPTS",
      });
      await expect(driverArrive(fixture.driver, booking.id)).rejects.toMatchObject({
        code: "INVALID_STATUS",
      });
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it("regenerates only an expired OTP and permanently invalidates the old code", async () => {
    const fixture = await createFixture();
    try {
      const booking = await createOtpBooking(fixture);
      await driverArrive(fixture.driver, booking.id);
      const oldOtp = await readOtp(booking.id);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { otpExpiresAt: new Date(Date.now() - 1_000) },
      });

      const regenerated = await driverArrive(fixture.driver, booking.id);
      const newOtp = await readOtp(booking.id);
      expect(regenerated).not.toHaveProperty("otp");
      expect(newOtp).not.toBe(oldOtp);
      expect(
        (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).otpAttempts,
      ).toBe(0);

      await expect(verifyOtp(fixture.driver, booking.id, oldOtp)).rejects.toMatchObject({
        code: "INVALID_OTP",
      });
      const started = await verifyOtp(fixture.driver, booking.id, newOtp);
      expect(started.status).toBe(BookingStatus.IN_PROGRESS);
      expect(started).not.toHaveProperty("otp");
      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.otp).toBeNull();
      expect(stored.otpExpiresAt).toBeNull();
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it("allows only one concurrent verification of a valid OTP", async () => {
    const fixture = await createFixture();
    try {
      const booking = await createOtpBooking(fixture);
      await driverArrive(fixture.driver, booking.id);
      const secret = await readOtp(booking.id);
      const results = await Promise.allSettled([
        verifyOtp(fixture.driver, booking.id, secret),
        verifyOtp(fixture.driver, booking.id, secret),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected && rejected.reason).toMatchObject({ code: "INVALID_STATUS" });
      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.status).toBe(BookingStatus.IN_PROGRESS);
      expect(stored.otp).toBeNull();
      expect(stored.otpVerified).toBe(true);
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });
});

describe("trip completion state, concurrency, and accounting", () => {
  it("rejects driver timestamp spoofing and validates the admin correction timestamp", async () => {
    const fixture = await createFixture({ ruleMode: "missing" });
    try {
      const booking = await createOtpBooking(fixture);
      await expect(completeTrip(fixture.driver, booking.id)).rejects.toMatchObject({
        code: "RIDE_NOT_STARTED",
      });

      const actualStart = new Date(Date.now() - minute);
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.IN_PROGRESS,
          otpVerified: false,
          actualRideStartTime: actualStart,
        },
      });
      await expect(completeTrip(fixture.driver, booking.id)).rejects.toMatchObject({
        code: "RIDE_NOT_STARTED",
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { otpVerified: true, otpVerifiedAt: actualStart },
      });
      await expect(
        completeTrip(
          fixture.driver,
          booking.id,
          new Date(actualStart.getTime() + 1_000).toISOString(),
        ),
      ).rejects.toMatchObject({ code: "DRIVER_END_TIME_OVERRIDE_FORBIDDEN", status: 400 });

      for (const endTime of [
        actualStart,
        new Date(actualStart.getTime() - 1),
        new Date(Date.now() + 10_000),
      ]) {
        await expect(
          completeTrip(fixture.admin, booking.id, endTime.toISOString()),
        ).rejects.toMatchObject({ code: "INVALID_END_TIME" });
      }
      expect(await prisma.invoice.count({ where: { bookingId: booking.id } })).toBe(0);
      expect(
        (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
      ).toBe(BookingStatus.IN_PROGRESS);

      const correctedEndTime = new Date(Date.now() - 1_000);
      const corrected = await completeTrip(
        fixture.admin,
        booking.id,
        correctedEndTime.toISOString(),
      );
      expect(corrected.actualEndTime?.toISOString()).toBe(correctedEndTime.toISOString());
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it("records server time when a driver completes a trip without an override", async () => {
    const fixture = await createFixture({ ruleMode: "missing" });
    try {
      const { booking } = await createStartedBooking(fixture, 0);
      const before = new Date();
      const completed = await completeTrip(fixture.driver, booking.id);
      const after = new Date();
      expect(completed.status).toBe(BookingStatus.COMPLETED);
      expect(completed.actualEndTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(completed.actualEndTime!.getTime()).toBeLessThanOrEqual(after.getTime());
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it("makes concurrent duplicate completion exactly-once", async () => {
    const fixture = await createFixture({ walletBalance: 1_000 });
    try {
      const { booking, actualEndTime } = await createStartedBooking(fixture, 61);
      const results = await Promise.allSettled([
        completeTrip(fixture.admin, booking.id, actualEndTime.toISOString()),
        completeTrip(fixture.admin, booking.id, actualEndTime.toISOString()),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected && rejected.reason).toMatchObject({ code: "RIDE_NOT_STARTED" });
      expect(await prisma.invoice.count({ where: { bookingId: booking.id } })).toBe(1);
      expect(await prisma.penalty.count({ where: { bookingId: booking.id } })).toBe(1);
      expect(
        await prisma.walletTransaction.count({
          where: { bookingId: booking.id, type: TransactionType.PENALTY },
        }),
      ).toBe(1);
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: fixture.residentId },
      });
      expect(wallet.balance).toBe(1_000 - 2 * latePenaltyPerHour);
      await expectWalletLedgerInvariant(fixture.residentId);
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it.each([
    { lateMinutes: 1, expectedPenalty: latePenaltyPerHour },
    { lateMinutes: 60, expectedPenalty: latePenaltyPerHour },
    { lateMinutes: 61, expectedPenalty: 2 * latePenaltyPerHour },
  ])(
    "charges $expectedPenalty for $lateMinutes late minute(s)",
    async ({ lateMinutes, expectedPenalty }) => {
      const fixture = await createFixture({ walletBalance: 1_000 });
      try {
        const { booking, actualEndTime } = await createStartedBooking(fixture, lateMinutes);
        const result = await completeTrip(
          fixture.admin,
          booking.id,
          actualEndTime.toISOString(),
        );
        expect(result.invoice).toMatchObject({
          penaltyAmount: expectedPenalty,
          totalAmount: 100 + expectedPenalty,
        });
        expect(
          await prisma.penalty.findUniqueOrThrow({
            where: {
              bookingId_penaltyRuleId: {
                bookingId: booking.id,
                penaltyRuleId: (
                  await prisma.penaltyRule.findUniqueOrThrow({
                    where: {
                      societyId_code: {
                        societyId: fixture.societyId,
                        code: "LATE_RETURN_PER_HOUR",
                      },
                    },
                  })
                ).id,
              },
            },
          }),
        ).toMatchObject({ amount: expectedPenalty });
        await expectWalletLedgerInvariant(fixture.residentId);
      } finally {
        await cleanupSocietyFixture(fixture.societyId);
      }
    },
  );

  it("creates a balanced negative wallet and ledger when a late resident has no wallet", async () => {
    const fixture = await createFixture();
    try {
      const { booking, actualEndTime } = await createStartedBooking(fixture, 1);
      await completeTrip(fixture.admin, booking.id, actualEndTime.toISOString());
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: fixture.residentId },
      });
      expect(wallet.balance).toBe(-latePenaltyPerHour);
      const ledger = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
      });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        bookingId: booking.id,
        amount: latePenaltyPerHour,
        type: TransactionType.PENALTY,
      });
      await expectWalletLedgerInvariant(fixture.residentId);
    } finally {
      await cleanupSocietyFixture(fixture.societyId);
    }
  });

  it.each(["disabled", "missing"] as const)(
    "completes without a penalty when the late-return rule is %s",
    async (ruleMode) => {
      const fixture = await createFixture({ ruleMode });
      try {
        const { booking, actualEndTime } = await createStartedBooking(fixture, 61);
        const result = await completeTrip(
          fixture.admin,
          booking.id,
          actualEndTime.toISOString(),
        );
        expect(result.status).toBe(BookingStatus.COMPLETED);
        expect(result.invoice).toMatchObject({ penaltyAmount: 0, totalAmount: 100 });
        expect(await prisma.penalty.count({ where: { bookingId: booking.id } })).toBe(0);
        expect(
          await prisma.walletTransaction.count({ where: { bookingId: booking.id } }),
        ).toBe(0);
        expect(await prisma.wallet.count({ where: { userId: fixture.residentId } })).toBe(0);
      } finally {
        await cleanupSocietyFixture(fixture.societyId);
      }
    },
  );
});
