import { prisma, TransactionType, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { cancelBooking, createBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Wallet booking integration", () => {
  let societyId: string;
  let resident: AuthUser;
  let vehicleId: string;
  const hourlyRate = 125;

  function slot(days: number) {
    const start = new Date();
    start.setDate(start.getDate() + days);
    start.setHours(9, 0, 0, 0);
    return start;
  }

  beforeAll(async () => {
    const society = await prisma.society.create({ data: { name: "Wallet Fixture Society", timezone: "Asia/Kolkata" } });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "WAL-101" } });
    resident = await prisma.user.create({
      data: { societyId, flatId: flat.id, role: UserRole.RESIDENT, name: "Wallet Resident", phone: "9100000011", passwordHash: "fixture-hash" },
    });
    await prisma.wallet.create({ data: { userId: resident.id, balance: 0 } });
    const vehicle = await prisma.vehicle.create({
      data: { societyId, name: "Wallet EV", registrationNumber: "WAL-EV-1", hourlyRate },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("deducts the exact booking charge once", async () => {
    const cost = hourlyRate * 2;
    await prisma.wallet.update({ where: { userId: resident.id }, data: { balance: cost } });
    const start = slot(3);
    const result = await createBooking(resident, start.toISOString(), new Date(start.getTime() + 2 * 60 * 60_000).toISOString(), vehicleId);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } });
    const debits = await prisma.walletTransaction.findMany({ where: { bookingId: result.booking.id, type: TransactionType.BOOKING_DEBIT } });
    expect(wallet.balance).toBe(0);
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(cost);
  });

  it("rejects an insufficient wallet balance", async () => {
    await prisma.wallet.update({ where: { userId: resident.id }, data: { balance: 0 } });
    const start = slot(4);
    await expect(createBooking(resident, start.toISOString(), new Date(start.getTime() + 2 * 60 * 60_000).toISOString(), vehicleId)).rejects.toThrow("Insufficient wallet balance");
  });

  it("refunds the exact charge once on cancellation", async () => {
    const cost = hourlyRate;
    await prisma.wallet.update({ where: { userId: resident.id }, data: { balance: cost } });
    const start = slot(5);
    const result = await createBooking(resident, start.toISOString(), new Date(start.getTime() + 60 * 60_000).toISOString(), vehicleId);
    await cancelBooking(resident, result.booking.id);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: resident.id } });
    const refunds = await prisma.walletTransaction.findMany({ where: { bookingId: result.booking.id, type: TransactionType.REFUND } });
    expect(wallet.balance).toBe(cost);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(cost);
  });
});
