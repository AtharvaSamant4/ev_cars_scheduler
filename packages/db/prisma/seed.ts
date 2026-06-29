import "../src/load-root-env";

import { PrismaNeon } from "@prisma/adapter-neon";
import { hash } from "bcryptjs";

import {
  BookingStatus,
  PrismaClient,
  UserRole,
  VehicleStatus,
} from "../src/generated/prisma/client";

function getIsoWeek(date: Date): { year: number; week: number } {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return { year: target.getFullYear(), week };
}

const SOCIETY_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const BOOKING_IDS = [
  "00000000-0000-4000-8000-000000000101",
  "00000000-0000-4000-8000-000000000102",
  "00000000-0000-4000-8000-000000000103",
  "00000000-0000-4000-8000-000000000104",
  "00000000-0000-4000-8000-000000000105",
  "00000000-0000-4000-8000-000000000106",
  "00000000-0000-4000-8000-000000000107",
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_WEEK = getIsoWeek(new Date()).week;
const WEEKLY_QUOTA_MINUTES = 16 * 60;
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
          flatId_year_weekNumber: {
            flatId: flat.id,
            year: CURRENT_YEAR,
            weekNumber: CURRENT_WEEK,
          },
        },
        update: {
          allocatedMinutes: WEEKLY_QUOTA_MINUTES,
        },
        create: {
          flatId: flat.id,
          year: CURRENT_YEAR,
          weekNumber: CURRENT_WEEK,
          allocatedMinutes: WEEKLY_QUOTA_MINUTES,
        },
      });

      const residentUser = await prisma.user.upsert({
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

      await prisma.wallet.upsert({
        where: { userId: residentUser.id },
        update: { balance: 1000 },
        create: {
          userId: residentUser.id,
          balance: 1000,
          transactions: {
            create: {
              amount: 1000,
              type: "CREDIT",
              description: "Initial Promotional Balance",
            },
          },
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
      ["EV 1", "MH-01-EV-1000", 100],
      ["EV 2", "MH-01-EV-1001", 150],
      ["EV 3", "MH-01-EV-1002", 100],
      ["EV 4", "MH-01-EV-1003", 150],
      ["EV 5", "MH-01-EV-1004", 100],
    ] as const;

    const vehicles = [];

    for (const [name, registrationNumber, hourlyRate] of vehicleDefinitions) {
      const vehicle = await prisma.vehicle.upsert({
        where: {
          societyId_registrationNumber: {
            societyId: society.id,
            registrationNumber,
          },
        },
        update: {
          name,
          hourlyRate,
          status: VehicleStatus.AVAILABLE,
        },
        create: {
          societyId: society.id,
          name,
          registrationNumber,
          hourlyRate,
        },
      });

      vehicles.push(vehicle);
    }

    const driverPasswordHash = await hash("Driver@123", 12);
    const drivers = [];

    for (let i = 0; i < 5; i++) {
      const driverPhone = `800000000${i + 1}`;
      const driverUser = await prisma.user.upsert({
        where: { phone: driverPhone },
        update: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: `Driver ${i + 1}`,
          passwordHash: driverPasswordHash,
          isActive: true,
        },
        create: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: `Driver ${i + 1}`,
          phone: driverPhone,
          passwordHash: driverPasswordHash,
        },
      });

      const driverProfile = await prisma.driver.upsert({
        where: { phoneNumber: driverPhone },
        update: {
          societyId: society.id,
          fullName: `Driver ${i + 1}`,
          licenseNumber: `DL-MH-${1000 + i}`,
          isActive: true,
          vehicleId: vehicles[i]?.id,
        },
        create: {
          societyId: society.id,
          fullName: `Driver ${i + 1}`,
          phoneNumber: driverPhone,
          licenseNumber: `DL-MH-${1000 + i}`,
          isActive: true,
          vehicleId: vehicles[i]?.id,
        },
      });

      drivers.push(driverProfile);
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
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, 1, 15, 9)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, 1, 15, 9)).week,
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
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, 2, 20, 14)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, 2, 20, 14)).week,
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
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, 12, 15, 9)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, 12, 15, 9)).week,
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
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, 11, 10, 10)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, 11, 10, 10)).week,
        startTime: localDate(CURRENT_YEAR, 11, 10, 10),
        endTime: localDate(CURRENT_YEAR, 11, 10, 12),
        durationMinutes: 120,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      {
        id: BOOKING_IDS[4],
        societyId: society.id,
        vehicleId: vehicles[3].id,
        flatId: flats[0].id,
        userId: residentByFlatId.get(flats[0].id)!.id,
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate(), 14)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate(), 14)).week,
        startTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate(), 14),
        endTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate(), 16),
        durationMinutes: 120,
        status: BookingStatus.ACTIVE,
        startedAt: new Date(),
      },
      {
        id: BOOKING_IDS[5],
        societyId: society.id,
        vehicleId: vehicles[4].id,
        flatId: flats[1].id,
        userId: residentByFlatId.get(flats[1].id)!.id,
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() + 1, 10)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() + 1, 10)).week,
        startTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() + 1, 10),
        endTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() + 1, 14),
        durationMinutes: 240,
        status: BookingStatus.BOOKED,
      },
      {
        id: BOOKING_IDS[6],
        societyId: society.id,
        vehicleId: vehicles[3].id,
        flatId: flats[2].id,
        userId: residentByFlatId.get(flats[2].id)!.id,
        quotaYear: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() - 1, 10)).year,
        quotaWeek: getIsoWeek(localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() - 1, 10)).week,
        startTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() - 1, 10),
        endTime: localDate(CURRENT_YEAR, new Date().getMonth() + 1, new Date().getDate() - 1, 12),
        durationMinutes: 120,
        status: BookingStatus.COMPLETED,
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
          flatId_year_weekNumber: {
            flatId: flat.id,
            year: CURRENT_YEAR,
            weekNumber: CURRENT_WEEK,
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
    console.log(`Weekly quota: ${WEEKLY_QUOTA_MINUTES / 60} hours`);
    console.log(`Resident login: A101 / ${RESIDENT_PASSWORD}`);
    console.log(`Admin login: admin@greenmeadows.demo / ${ADMIN_PASSWORD}`);
    console.log(`Driver login: 8000000001 / Driver@123`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
