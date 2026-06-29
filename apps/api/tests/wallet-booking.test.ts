import { describe, expect, it, beforeAll } from "vitest";
import { prisma, UserRole, TransactionType } from "@society-ev/db";
import { AppError } from "@/src/lib/errors";
import { createBooking, cancelBooking } from "@/src/modules/bookings/service";
import { toZonedTime } from "date-fns-tz";

describe("Wallet Booking Integration", () => {
  let societyId: string;
  let flatId: string;
  let userId: string;
  let vehicleId: string;
  let vehicleRate: number;
  let adminUser: any;
  let residentUser: any;

  beforeAll(async () => {
    // We assume the DB is seeded. We will just pick the first available vehicle and resident.
    const society = await prisma.society.findFirst();
    if (!society) throw new Error("No society found");
    societyId = society.id;

    const resident = await prisma.user.findFirst({
      where: { role: UserRole.RESIDENT },
      include: { flat: true },
    });
    if (!resident || !resident.flatId) throw new Error("No resident found");
    userId = resident.id;
    flatId = resident.flatId;

    residentUser = {
      id: resident.id,
      societyId: society.id,
      role: UserRole.RESIDENT,
      flatId: resident.flatId,
    };

    const vehicle = await prisma.vehicle.findFirst({
      where: { status: "AVAILABLE", isReserve: false },
    });
    if (!vehicle) throw new Error("No vehicle found");
    vehicleId = vehicle.id;
    vehicleRate = vehicle.hourlyRate;
  });

  it("should successfully deduct balance on booking", async () => {
    // Reset wallet to exact balance for 2 hours
    const cost = vehicleRate * 2;
    await prisma.wallet.update({
      where: { userId },
      data: { balance: cost },
    });

    // Create a booking 3 days ahead
    const startTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    startTime.setMinutes(0, 0, 0); // Align to boundary
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const result = await createBooking(
      residentUser,
      startTime.toISOString(),
      endTime.toISOString(),
      vehicleId
    );

    expect(result.booking).toBeDefined();
    
    // Verify wallet balance is 0
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet?.balance).toBe(0);

    // Verify transaction was created
    const tx = await prisma.walletTransaction.findFirst({
      where: { bookingId: result.booking.id, type: TransactionType.BOOKING_DEBIT },
    });
    expect(tx).toBeDefined();
    expect(tx?.amount).toBe(cost);
  });

  it("should reject booking if insufficient balance", async () => {
    // Wallet is currently 0 from previous test
    const startTime = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    startTime.setMinutes(0, 0, 0); 
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    await expect(
      createBooking(residentUser, startTime.toISOString(), endTime.toISOString(), vehicleId)
    ).rejects.toThrowError("Insufficient wallet balance.");
  });

  it("should refund the exact amount on cancellation", async () => {
    const cost = vehicleRate * 1;
    await prisma.wallet.update({
      where: { userId },
      data: { balance: cost },
    });

    const startTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startTime.setMinutes(0, 0, 0); 
    const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);

    const result = await createBooking(
      residentUser,
      startTime.toISOString(),
      endTime.toISOString(),
      vehicleId
    );

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet?.balance).toBe(0);

    const cancelResult = await cancelBooking(residentUser, result.booking.id);
    expect(cancelResult.booking.status).toBe("CANCELLED");

    wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet?.balance).toBe(cost);

    const refundTx = await prisma.walletTransaction.findFirst({
      where: { bookingId: result.booking.id, type: TransactionType.REFUND },
    });
    expect(refundTx).toBeDefined();
    expect(refundTx?.amount).toBe(cost);
  });
});
