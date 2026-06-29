import { prisma } from "@society-ev/db";



async function main() {
  console.log("Dropping old constraint...");
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_vehicle_no_overlap";`);
    console.log("Old constraint dropped.");
  } catch (error) {
    console.log("Could not drop constraint (maybe it doesn't exist):", error);
  }

  console.log("Creating immutable function...");
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION add_30_mins(t timestamptz) 
    RETURNS timestamptz 
    IMMUTABLE PARALLEL SAFE
    LANGUAGE sql 
    AS $$
      SELECT t + interval '30 minutes';
    $$;
  `);

  console.log("Adding new constraint with 30-minute buffer...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicle_no_overlap" EXCLUDE USING gist (
      "vehicleId" WITH =,
      tstzrange("startTime", add_30_mins("endTime"), '[)') WITH &&
    ) WHERE ("status" <> 'CANCELLED');
  `);
  console.log("New constraint added successfully.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
