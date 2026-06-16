import { prisma } from "./src";

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reassigned_vehicle_no_overlap" EXCLUDE USING gist (
          "reassignedVehicleId" WITH =,
          tstzrange("startTime", "endTime", '[)') WITH &&
      ) WHERE ("status" <> 'CANCELLED' AND "reassignedVehicleId" IS NOT NULL);
    `);
    console.log("Added reassigned vehicle exclusion constraint");
  } catch (error) {
    console.error("Failed:", error);
  } finally {
  }
}

main();
