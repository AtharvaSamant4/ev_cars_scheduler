import "../src/load-root-env";

import { PrismaNeon } from "@prisma/adapter-neon";
import { hash } from "bcryptjs";

import {
  BookingStatus,
  PrismaClient,
  UserRole,
  VehicleStatus,
} from "../src/generated/prisma/client";

const SOCIETY_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const BOOKING_IDS = [
  "00000000-0000-4000-8000-000000000101",
  "00000000-0000-4000-8000-000000000102",
  "00000000-0000-4000-8000-000000000103",
  "00000000-0000-4000-8000-000000000104",
];

const CURRENT_YEAR = new Date().getFullYear();
const ANNUAL_QUOTA_MINUTES = 876 * 60;
const RESIDENT_PASSWORD = "Demo@123";
const ADMIN_PASSWORD = "Admin@123";

function createClient() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required to seed the database");
  }

  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
}

function flatNumbers() {
  return Array.from({ length: 50 }, (_, index) => {
    const floor = Math.floor(index / 10) + 1;
    const unit = (index % 10) + 1;
    return `A${floor}${unit.toString().padStart(2, "0")}`;
  });
}

function localDate(year: number, month: number, day: number, hour: number) {
  const monthPart = month.toString().padStart(2, "0");
  const dayPart = day.toString().padStart(2, "0");
  const hourPart = hour.toString().padStart(2, "0");
  return new Date(`${year}-${monthPart}-${dayPart}T${hourPart}:00:00+05:30`);
}

async function main() {
  const prisma = createClient();
  const residentPasswordHash = await hash(RESIDENT_PASSWORD, 12);
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 12);

  try {
    const society = await prisma.society.upsert({
      where: { id: SOCIETY_ID },
      update: {
        name: "Green Meadows Residency",
        timezone: "Asia/Kolkata",
      },
      create: {
        id: SOCIETY_ID,
        name: "Green Meadows Residency",
        timezone: "Asia/Kolkata",
      },
    });

    const flats = [];

    for (const [index, number] of flatNumbers().entries()) {
      const flat = await prisma.flat.upsert({
        where: {
          societyId_number: {
            societyId: society.id,
            number,
          },
        },
        update: { isActive: true },
        create: {
          societyId: society.id,
          number,
        },
      });

      await prisma.flatQuota.upsert({
        where: {
          flatId_year: {
            flatId: flat.id,
            year: CURRENT_YEAR,
          },
        },
        update: {
          allocatedMinutes: ANNUAL_QUOTA_MINUTES,
        },
        create: {
          flatId: flat.id,
          year: CURRENT_YEAR,
          allocatedMinutes: ANNUAL_QUOTA_MINUTES,
        },
      });

      await prisma.user.upsert({
        where: { flatId: flat.id },
        update: {
          societyId: society.id,
          role: UserRole.RESIDENT,
          name: `Resident ${number}`,
          phone: `900000${(index + 1).toString().padStart(4, "0")}`,
          passwordHash: residentPasswordHash,
          isActive: true,
        },
        create: {
          societyId: society.id,
          flatId: flat.id,
          role: UserRole.RESIDENT,
          name: `Resident ${number}`,
          phone: `900000${(index + 1).toString().padStart(4, "0")}`,
          passwordHash: residentPasswordHash,
        },
      });

      flats.push(flat);
    }

    await prisma.user.upsert({
      where: { email: "admin@greenmeadows.demo" },
      update: {
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Society Administrator",
        passwordHash: adminPasswordHash,
        isActive: true,
      },
      create: {
        id: ADMIN_ID,
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Society Administrator",
        email: "admin@greenmeadows.demo",
        passwordHash: adminPasswordHash,
      },
    });

    const vehicleDefinitions = [
      ["EV 1", "MH-01-EV-1001"],
      ["EV 2", "MH-01-EV-1002"],
      ["EV 3", "MH-01-EV-1003"],
      ["EV 4", "MH-01-EV-1004"],
      ["EV 5", "MH-01-EV-1005"],
    ] as const;

    const vehicles = [];

    for (const [name, registrationNumber] of vehicleDefinitions) {
      const vehicle = await prisma.vehicle.upsert({
        where: {
          societyId_registrationNumber: {
            societyId: society.id,
            registrationNumber,
          },
        },
        update: {
          name,
          status: VehicleStatus.AVAILABLE,
        },
        create: {
          societyId: society.id,
          name,
          registrationNumber,
        },
      });

      vehicles.push(vehicle);
    }

    const residents = await prisma.user.findMany({
      where: {
        flatId: { in: flats.slice(0, 3).map((flat) => flat.id) },
        role: UserRole.RESIDENT,
      },
    });
    const residentByFlatId = new Map(
      residents.map((resident) => [resident.flatId, resident]),
    );

    await prisma.booking.deleteMany({
      where: { id: { in: BOOKING_IDS } },
    });

    const bookings = [
      {
        id: BOOKING_IDS[0],
        societyId: society.id,
        vehicleId: vehicles[0].id,
        flatId: flats[0].id,
        userId: residentByFlatId.get(flats[0].id)!.id,
        quotaYear: CURRENT_YEAR,
        startTime: localDate(CURRENT_YEAR, 1, 15, 9),
        endTime: localDate(CURRENT_YEAR, 1, 15, 11),
        durationMinutes: 120,
        status: BookingStatus.COMPLETED,
      },
      {
        id: BOOKING_IDS[1],
        societyId: society.id,
        vehicleId: vehicles[1].id,
        flatId: flats[1].id,
        userId: residentByFlatId.get(flats[1].id)!.id,
        quotaYear: CURRENT_YEAR,
        startTime: localDate(CURRENT_YEAR, 2, 20, 14),
        endTime: localDate(CURRENT_YEAR, 2, 20, 17),
        durationMinutes: 180,
        status: BookingStatus.COMPLETED,
      },
      {
        id: BOOKING_IDS[2],
        societyId: society.id,
        vehicleId: vehicles[0].id,
        flatId: flats[0].id,
        userId: residentByFlatId.get(flats[0].id)!.id,
        quotaYear: CURRENT_YEAR,
        startTime: localDate(CURRENT_YEAR, 12, 15, 9),
        endTime: localDate(CURRENT_YEAR, 12, 15, 13),
        durationMinutes: 240,
        status: BookingStatus.BOOKED,
      },
      {
        id: BOOKING_IDS[3],
        societyId: society.id,
        vehicleId: vehicles[2].id,
        flatId: flats[2].id,
        userId: residentByFlatId.get(flats[2].id)!.id,
        quotaYear: CURRENT_YEAR,
        startTime: localDate(CURRENT_YEAR, 11, 10, 10),
        endTime: localDate(CURRENT_YEAR, 11, 10, 12),
        durationMinutes: 120,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    ];

    await prisma.booking.createMany({ data: bookings });

    const usage = await prisma.booking.groupBy({
      by: ["flatId", "quotaYear"],
      where: {
        flatId: { in: flats.map((flat) => flat.id) },
        status: { not: BookingStatus.CANCELLED },
      },
      _sum: { durationMinutes: true },
    });
    const usageByFlatYear = new Map(
      usage.map((item) => [
        `${item.flatId}:${item.quotaYear}`,
        item._sum.durationMinutes ?? 0,
      ]),
    );

    for (const flat of flats) {
      await prisma.flatQuota.update({
        where: {
          flatId_year: {
            flatId: flat.id,
            year: CURRENT_YEAR,
          },
        },
        data: {
          usedMinutes:
            usageByFlatYear.get(`${flat.id}:${CURRENT_YEAR}`) ?? 0,
        },
      });
    }

    console.log("Seed completed.");
    console.log(`Society: ${society.name}`);
    console.log(`Flats/residents: ${flats.length}`);
    console.log(`Vehicles: ${vehicles.length}`);
    console.log(`Annual quota: ${ANNUAL_QUOTA_MINUTES / 60} hours`);
    console.log(`Resident login: A101 / ${RESIDENT_PASSWORD}`);
    console.log(`Admin login: admin@greenmeadows.demo / ${ADMIN_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
