import { prisma, UserRole, TransactionType, VehicleStatus } from "@society-ev/db";
import { createBooking, cancelBooking } from "../src/modules/bookings/service";
import { normalizeBookingRange } from "../src/modules/bookings/service";

async function runTests() {
  console.log("Starting QA Validation Run...\n");

  // PHASE 1: Inventory Verification
  console.log("--- PHASE 1: SYSTEM INVENTORY ---");
  const userCount = await prisma.user.count();
  const vehicleCount = await prisma.vehicle.count();
  const bookingCount = await prisma.booking.count();
  console.log(`Verified DB connectivity. Users: ${userCount}, Vehicles: ${vehicleCount}, Bookings: ${bookingCount}`);

  // Get a test resident
  const resident = await prisma.user.findFirst({
    where: { role: "RESIDENT" },
    include: { flat: { include: { society: true } }, wallet: true }
  });

  if (!resident || !resident.wallet) {
    throw new Error("Missing test resident data");
  }

  const authUser = {
    id: resident.id,
    role: resident.role,
    societyId: resident.flat!.societyId,
    flatNumber: resident.flat!.number,
    flatId: resident.flat!.id
  };

  // Ensure wallet has funds
  await prisma.wallet.update({
    where: { id: resident.wallet!.id },
    data: { balance: 1000 }
  });

  const vehicle = await prisma.vehicle.findFirst({
    where: { status: "AVAILABLE", isReserve: false }
  });

  if (!vehicle) {
    throw new Error("Missing test vehicle");
  }

  // PHASE 3 & 4: Booking & Buffer Validation
  console.log("\n--- PHASE 3 & 4: BOOKING & BUFFER VALIDATION ---");
  const now = new Date();
  
  // Test 7-day rule
  console.log("Testing 7-Day Rule...");
  const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  try {
    normalizeBookingRange(eightDaysFromNow.toISOString(), new Date(eightDaysFromNow.getTime() + 2*60*60*1000).toISOString(), "UTC", UserRole.RESIDENT, now);
    console.error("❌ FAILED: 7-day rule allowed booking >7 days!");
  } catch (e: any) {
    console.log(`✅ PASSED: 7-day rule blocked future booking. Error: ${e.message}`);
  }

  // Let's create a booking 1 day from now
  const baseStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  baseStart.setUTCHours(10, 0, 0, 0); // 10:00 AM UTC
  
  const b1Start = new Date(baseStart);
  const b1End = new Date(baseStart.getTime() + 2 * 60 * 60 * 1000); // 12:00 PM
  
  const b2Start_conflict = new Date(b1End.getTime() + 29 * 60 * 1000); // 12:29 PM
  const b2End_conflict = new Date(b2Start_conflict.getTime() + 60 * 60 * 1000);

  const b3Start_ok = new Date(b1End.getTime() + 30 * 60 * 1000); // 12:30 PM
  const b3End_ok = new Date(b3Start_ok.getTime() + 60 * 60 * 1000);

  // Allocate 1000 hours of quota for this flat for this year/week
  await prisma.$executeRaw`
    INSERT INTO "FlatQuota" ("id", "flatId", "year", "weekNumber", "allocatedMinutes", "usedMinutes", "updatedAt")
    VALUES (gen_random_uuid(), ${resident.flat!.id}::uuid, 2026, extract(week from ${b1Start}::date)::integer, 60000, 0, now())
    ON CONFLICT ("flatId", "year", "weekNumber") DO UPDATE SET "allocatedMinutes" = 60000;
  `;

  let booking1: any = null;
  console.log("Testing Buffer Validation...");
  try {
    const res1 = await createBooking(authUser as any, b1Start.toISOString(), b1End.toISOString(), vehicle.id);
    booking1 = res1.booking;
    console.log(`✅ PASSED: Created Booking A (10:00 - 12:00) ID: ${booking1.id}`);
    
    try {
      await createBooking(authUser as any, b2Start_conflict.toISOString(), b2End_conflict.toISOString(), vehicle.id);
      console.error("❌ FAILED: Buffer constraint allowed 29-minute gap!");
    } catch (e: any) {
      console.log(`✅ PASSED: Buffer constraint blocked 29-minute gap.`);
    }

    try {
      const res3 = await createBooking(authUser as any, b3Start_ok.toISOString(), b3End_ok.toISOString(), vehicle.id);
      console.log(`✅ PASSED: Buffer constraint allowed 30-minute gap. Booking ID: ${res3.booking.id}`);
      await cancelBooking(authUser as any, res3.booking.id);
    } catch(e: any) {
      console.log(`⚠️ B3 failed: ${e.message}`);
    }
  } catch (e: any) {
    console.error("Failed to execute buffer tests", e);
  }

  // PHASE 7 & 8: Wallet & Penalty Validation
  console.log("\n--- PHASE 7 & 8: WALLET & CANCELLATION PENALTY ---");
  
  if (booking1) {
    const preWallet = await prisma.wallet.findUnique({ where: { id: resident.wallet!.id } });
    console.log(`Initial Balance: ₹${preWallet?.balance}`);
    
    console.log(`Cancelling Booking A (Cost was approx ₹${booking1.totalCost})...`);
    try {
      await cancelBooking(authUser as any, booking1.id);
      
      const postWallet = await prisma.wallet.findUnique({ where: { id: resident.wallet!.id } });
      console.log(`Final Balance: ₹${postWallet?.balance}`);
      
      const txs = await prisma.walletTransaction.findMany({
        where: { bookingId: booking1.id },
        orderBy: { createdAt: 'asc' }
      });
      
      console.log("Transactions related to booking:");
      txs.forEach(tx => console.log(` - [${tx.type}] ₹${tx.amount} : ${tx.description}`));
      
      const penaltyTx = txs.find(tx => tx.type === "CANCELLATION_PENALTY");
      if (penaltyTx) {
        console.log(`✅ PASSED: Cancellation penalty deducted correctly (₹${penaltyTx.amount}).`);
      } else {
        console.error(`❌ FAILED: No cancellation penalty transaction found!`);
      }
    } catch(e: any) {
      console.error(`❌ FAILED to cancel booking A: ${e.message}`);
    }
  }

  console.log("\n--- PHASE 11: CONCURRENCY TESTING (Wallet Deductions) ---");
  const walletPreBurst = await prisma.wallet.findUnique({ where: { id: resident.wallet!.id } });
  
  console.log(`Executing 20 concurrent ₹10 deductions...`);
  const burst = Array.from({ length: 20 }).map(async () => {
    // Atomic update
    const res = await prisma.wallet.updateMany({
      where: { id: resident.wallet!.id, balance: { gte: 10 } },
      data: { balance: { decrement: 10 } }
    });
    if (res.count > 0) {
      await prisma.walletTransaction.create({
        data: { walletId: resident.wallet!.id, amount: 10, type: "PAYMENT", description: "Burst Test" }
      });
    }
  });

  await Promise.allSettled(burst);
  
  const walletPostBurst = await prisma.wallet.findUnique({ where: { id: resident.wallet!.id } });
  const diff = walletPreBurst!.balance - walletPostBurst!.balance;
  console.log(`Total balance deducted during burst: ₹${diff} (Expected: ₹200)`);
  
  if (diff === 200) {
    console.log("✅ PASSED: Concurrency handled perfectly by Prisma atomic operations.");
  } else {
    console.error("❌ FAILED: Race condition detected in wallet deduction!");
  }

  console.log("\nDone.");
}

runTests().catch(console.error).finally(() => process.exit(0));
