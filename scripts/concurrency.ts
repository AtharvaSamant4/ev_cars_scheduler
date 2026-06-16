import { prisma, UserRole } from "@society-ev/db";
import { createBooking } from "../apps/api/src/modules/bookings/service";

async function runConcurrencyTest() {
  console.log("Starting concurrency test for 30-min buffer...");
  
  // Find a society and a resident
  const society = await prisma.society.findFirst();
  const user = await prisma.user.findFirst({ where: { role: "RESIDENT" } });
  const vehicle = await prisma.vehicle.findFirst({ where: { status: "AVAILABLE" } });
  const flat = await prisma.flat.findFirst({ where: { id: user?.flatId! } });

  if (!society || !user || !vehicle || !flat) {
    console.error("Missing data");
    process.exit(1);
  }

  const authUser = {
    id: user.id,
    societyId: society.id,
    flatId: flat.id,
    role: UserRole.RESIDENT,
    name: user.name,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
  };

  // Define booking ranges
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12, 0, 0); // Day after tomorrow 12:00
  
  const startTime1 = new Date(today.getTime()); // 12:00
  const endTime1 = new Date(today.getTime() + 60 * 60000); // 13:00

  const startTime2 = new Date(endTime1.getTime()); // 13:00
  const endTime2 = new Date(startTime2.getTime() + 60 * 60000); // 14:00

  const startTime3 = new Date(endTime1.getTime() + 30 * 60000); // 13:30
  const endTime3 = new Date(startTime3.getTime() + 60 * 60000); // 14:30

  // 1. Book first slot
  console.log("Booking slot 1: 12:00 - 13:00");
  try {
    await createBooking(
      authUser,
      startTime1.toISOString(),
      endTime1.toISOString(),
      vehicle.id
    );
    console.log("Slot 1 booked successfully.");
  } catch (err: any) {
    console.log("Slot 1 failed:", err.message);
  }

  // 2. Try booking slot 2 (13:00 - 14:00) - Should fail due to buffer
  console.log("Booking slot 2: 13:00 - 14:00 (Should reject due to 30 min buffer)");
  try {
    await createBooking(
      authUser,
      startTime2.toISOString(),
      endTime2.toISOString(),
      vehicle.id
    );
    console.log("❌ Slot 2 booked successfully. BUG!");
  } catch (err: any) {
    console.log("✅ Slot 2 rejected as expected:", err.message);
  }

  // 3. Try booking slot 3 (13:30 - 14:30) - Should succeed
  console.log("Booking slot 3: 13:30 - 14:30 (Should succeed)");
  try {
    await createBooking(
      authUser,
      startTime3.toISOString(),
      endTime3.toISOString(),
      vehicle.id
    );
    console.log("✅ Slot 3 booked successfully.");
  } catch (err: any) {
    console.log("❌ Slot 3 failed:", err.message);
  }

  // 4. Concurrency Test
  console.log("Running Concurrency test...");
  const startTimeC = new Date(endTime3.getTime() + 60 * 60000); // 15:30
  const endTimeC = new Date(startTimeC.getTime() + 60 * 60000); // 16:30

  const promises = Array.from({ length: 10 }).map(() => 
    createBooking(
      authUser,
      startTimeC.toISOString(),
      endTimeC.toISOString(),
      vehicle.id
    ).then(() => "SUCCESS").catch(err => "FAILED")
  );

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r === "SUCCESS").length;
  console.log(`Concurrency test results: ${successCount} successful out of 10.`);
  if (successCount === 1) {
    console.log("✅ Concurrency test PASSED.");
  } else {
    console.log("❌ Concurrency test FAILED.");
  }

  process.exit(0);
}

runConcurrencyTest();
