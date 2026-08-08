import "../src/load-root-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import {
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";

type IsoWeek = {
  year: number;
  week: number;
};

const SOCIETY_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const SOCIETY_TIMEZONE = "Asia/Kolkata";
const WEEKLY_QUOTA_MINUTES = 16 * 60;
const WALLET_OPENING_BALANCE = 5_000;
const RESIDENT_PASSWORD = "Demo@123";
const ADMIN_PASSWORD = "Admin@123";
const DRIVER_PASSWORD = "Driver@123";
const BOOKING_HORIZON_DAYS = 7;

function createClient() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required to seed the database");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

function flatNumbers() {
  return Array.from({ length: 50 }, (_, index) => {
    const floor = Math.floor(index / 10) + 1;
    const unit = (index % 10) + 1;
    return `A${floor}${unit.toString().padStart(2, "0")}`;
  });
}

function calendarDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function isoWeekInTimezone(date: Date, timezone: string): IsoWeek {
  const calendarDate = calendarDateInTimezone(date, timezone);
  const target = new Date(
    Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day),
  );
  const isoDay = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - isoDay);

  const isoYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return { year: isoYear, week };
}

function quotaPeriods(now: Date, timezone: string) {
  const horizonEnd = new Date(
    now.getTime() + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1_000,
  );
  const periods = [
    isoWeekInTimezone(now, timezone),
    isoWeekInTimezone(horizonEnd, timezone),
  ];

  return Array.from(
    new Map(periods.map((period) => [`${period.year}:${period.week}`, period])).values(),
  ).sort((left, right) => left.year - right.year || left.week - right.week);
}

async function main() {
  const prisma = createClient();
  const residentPasswordHash = await hash(RESIDENT_PASSWORD, 12);
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 12);
  const driverPasswordHash = await hash(DRIVER_PASSWORD, 12);
  const managedQuotaPeriods = quotaPeriods(new Date(), SOCIETY_TIMEZONE);
  const numbers = flatNumbers();

  try {
    const society = await prisma.society.upsert({
      where: { id: SOCIETY_ID },
      update: {
        name: "Green Meadows Residency",
        timezone: SOCIETY_TIMEZONE,
      },
      create: {
        id: SOCIETY_ID,
        name: "Green Meadows Residency",
        timezone: SOCIETY_TIMEZONE,
      },
    });

    for (const [index, number] of numbers.entries()) {
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

      for (const period of managedQuotaPeriods) {
        await prisma.flatQuota.upsert({
          where: {
            flatId_year_weekNumber: {
              flatId: flat.id,
              year: period.year,
              weekNumber: period.week,
            },
          },
          update: {
            allocatedMinutes: WEEKLY_QUOTA_MINUTES,
          },
          create: {
            flatId: flat.id,
            year: period.year,
            weekNumber: period.week,
            allocatedMinutes: WEEKLY_QUOTA_MINUTES,
          },
        });
      }

      const residentUser = await prisma.user.upsert({
        where: { flatId: flat.id },
        update: {
          societyId: society.id,
          role: UserRole.RESIDENT,
          name: `Resident ${number}`,
          phone: `900000${(index + 1).toString().padStart(4, "0")}`,
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
        update: {},
        create: {
          userId: residentUser.id,
          balance: WALLET_OPENING_BALANCE,
          transactions: {
            create: {
              amount: WALLET_OPENING_BALANCE,
              type: "CREDIT",
              description: "Initial Promotional Balance",
            },
          },
        },
      });
    }

    await prisma.user.upsert({
      where: { email: "admin@greenmeadows.demo" },
      update: {
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Society Administrator",
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
      { name: "EV 1", registrationNumber: "MH-01-EV-1000", hourlyRate: 100, isReserve: false },
      { name: "EV 2", registrationNumber: "MH-01-EV-1001", hourlyRate: 150, isReserve: false },
      { name: "EV 3", registrationNumber: "MH-01-EV-1002", hourlyRate: 100, isReserve: false },
      { name: "EV 4", registrationNumber: "MH-01-EV-1003", hourlyRate: 150, isReserve: false },
      { name: "EV 5", registrationNumber: "MH-01-EV-1004", hourlyRate: 100, isReserve: false },
      { name: "Reserve EV 1", registrationNumber: "MH-01-EV-1099", hourlyRate: 100, isReserve: true },
    ] as const;
    const normalVehicles = [];

    for (const definition of vehicleDefinitions) {
      const vehicle = await prisma.vehicle.upsert({
        where: {
          societyId_registrationNumber: {
            societyId: society.id,
            registrationNumber: definition.registrationNumber,
          },
        },
        update: {
          name: definition.name,
          hourlyRate: definition.hourlyRate,
          isReserve: definition.isReserve,
        },
        create: {
          societyId: society.id,
          ...definition,
        },
      });

      if (!definition.isReserve) {
        normalVehicles.push(vehicle);
      }
    }

    for (const [index, vehicle] of normalVehicles.entries()) {
      const driverNumber = index + 1;
      const driverPhone = `800000000${driverNumber}`;
      const fullName = `Driver ${driverNumber}`;
      const email = `driver${driverNumber}@greenmeadows.demo`;

      await prisma.user.upsert({
        where: { phone: driverPhone },
        update: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: fullName,
          email,
          isActive: true,
        },
        create: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: fullName,
          phone: driverPhone,
          email,
          passwordHash: driverPasswordHash,
        },
      });

      await prisma.driver.upsert({
        where: { phoneNumber: driverPhone },
        update: {
          societyId: society.id,
          fullName,
          email,
          licenseNumber: `DL-MH-${1000 + index}`,
          isActive: true,
          vehicleId: vehicle.id,
        },
        create: {
          societyId: society.id,
          fullName,
          phoneNumber: driverPhone,
          email,
          licenseNumber: `DL-MH-${1000 + index}`,
          isActive: true,
          vehicleId: vehicle.id,
        },
      });
    }

    const penaltyRules = [
      {
        code: "CANCELLATION",
        name: "Cancellation Penalty",
        amount: 100,
        description: "Fixed demo penalty deducted when a booking is cancelled.",
      },
      {
        code: "LATE_RETURN_PER_HOUR",
        name: "Late Return Penalty",
        amount: 100,
        description: "Demo penalty charged per started hour of late return.",
      },
    ] as const;

    for (const rule of penaltyRules) {
      await prisma.penaltyRule.upsert({
        where: {
          societyId_code: {
            societyId: society.id,
            code: rule.code,
          },
        },
        update: {
          name: rule.name,
          description: rule.description,
        },
        create: {
          societyId: society.id,
          ...rule,
        },
      });
    }

    console.log("Seed completed.");
    console.log(`Society: ${society.name}`);
    console.log(`Flats/residents/wallets: ${numbers.length}`);
    console.log("Vehicles: 5 normal + 1 reserve");
    console.log(`Drivers: ${normalVehicles.length}`);
    console.log(`Weekly quota: ${WEEKLY_QUOTA_MINUTES / 60} hours`);
    console.log(
      `Provisioned ISO weeks: ${managedQuotaPeriods.map((period) => `${period.year}-W${period.week}`).join(", ")}`,
    );
    console.log(`Wallet opening balance: INR ${WALLET_OPENING_BALANCE}`);
    console.log(`Resident login: A101 / ${RESIDENT_PASSWORD}`);
    console.log(`Admin login: admin@greenmeadows.demo / ${ADMIN_PASSWORD}`);
    console.log(`Driver login: 8000000001 / ${DRIVER_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
