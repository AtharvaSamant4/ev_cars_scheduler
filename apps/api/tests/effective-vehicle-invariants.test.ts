import {
  BookingStatus,
  prisma,
  ReassignReason,
  UserRole,
  VehicleStatus,
} from "@society-ev/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { updateVehicle } from "@/src/modules/admin/service";
import {
  assignDriver,
  checkAvailability,
  createBooking,
  driverArrive,
  reassignBooking,
} from "@/src/modules/bookings/service";
import { reportAssignedVehicleIssue } from "@/src/modules/drivers/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

let fixtureSequence = 0;

function futureBase() {
  const value = new Date(Date.now() + 24 * 60 * 60_000);
  value.setUTCMinutes(0, 0, 0);
  return value;
}

function shifted(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

async function createFixture() {
  fixtureSequence += 1;
  const suffix = fixtureSequence.toString().padStart(3, "0");
  const society = await prisma.society.create({
    data: {
      name: `Effective Vehicle Invariants ${suffix}`,
      timezone: "UTC",
    },
  });
  const [flatOne, flatTwo] = await Promise.all([
    prisma.flat.create({
      data: { societyId: society.id, number: `EVI-${suffix}-1` },
    }),
    prisma.flat.create({
      data: { societyId: society.id, number: `EVI-${suffix}-2` },
    }),
  ]);
  const [admin, residentOne, residentTwo, driverUser, otherDriverUser] =
    await Promise.all([
      prisma.user.create({
        data: {
          societyId: society.id,
          role: UserRole.ADMIN,
          name: "Effective Vehicle Admin",
          phone: `9730001${suffix}`,
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId: society.id,
          flatId: flatOne.id,
          role: UserRole.RESIDENT,
          name: "Effective Vehicle Resident One",
          phone: `9730002${suffix}`,
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId: society.id,
          flatId: flatTwo.id,
          role: UserRole.RESIDENT,
          name: "Effective Vehicle Resident Two",
          phone: `9730003${suffix}`,
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: "Effective Vehicle Driver",
          phone: `9730004${suffix}`,
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId: society.id,
          role: UserRole.DRIVER,
          name: "Other Effective Vehicle Driver",
          phone: `9730005${suffix}`,
          passwordHash: "fixture-hash",
        },
      }),
    ]);

  await Promise.all([
    prisma.wallet.create({ data: { userId: residentOne.id, balance: 50_000 } }),
    prisma.wallet.create({ data: { userId: residentTwo.id, balance: 50_000 } }),
  ]);

  const [target, sourceOne, sourceTwo, autoAssigned, reserve] =
    await Promise.all([
      prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Target Normal EV",
          registrationNumber: `EVI-${suffix}-TARGET`,
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Source Normal EV One",
          registrationNumber: `EVI-${suffix}-SOURCE-1`,
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Source Normal EV Two",
          registrationNumber: `EVI-${suffix}-SOURCE-2`,
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Automatically Assigned EV",
          registrationNumber: `EVI-${suffix}-AUTO`,
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId: society.id,
          name: "Effective Reserve EV",
          registrationNumber: `EVI-${suffix}-RESERVE`,
          isReserve: true,
        },
      }),
    ]);

  const [driver, otherDriver] = await Promise.all([
    prisma.driver.create({
      data: {
        societyId: society.id,
        fullName: driverUser.name,
        phoneNumber: driverUser.phone!,
        licenseNumber: `EVI-${suffix}-LICENSE-1`,
        vehicleId: autoAssigned.id,
      },
    }),
    prisma.driver.create({
      data: {
        societyId: society.id,
        fullName: otherDriverUser.name,
        phoneNumber: otherDriverUser.phone!,
        licenseNumber: `EVI-${suffix}-LICENSE-2`,
        vehicleId: sourceTwo.id,
      },
    }),
  ]);

  return {
    society,
    flatOne,
    flatTwo,
    admin: admin as AuthUser,
    residentOne: residentOne as AuthUser,
    residentTwo: residentTwo as AuthUser,
    driverUser: driverUser as AuthUser,
    otherDriverUser: otherDriverUser as AuthUser,
    driver,
    otherDriver,
    target,
    sourceOne,
    sourceTwo,
    autoAssigned,
    reserve,
    base: futureBase(),
  };
}

async function ensureQuota(
  fixture: Fixture,
  flatId: string,
  startTime: Date,
) {
  const period = getIsoWeek(startTime);
  return prisma.flatQuota.upsert({
    where: {
      flatId_year_weekNumber: {
        flatId,
        year: period.year,
        weekNumber: period.week,
      },
    },
    create: {
      flatId,
      year: period.year,
      weekNumber: period.week,
      allocatedMinutes: 10_000,
    },
    update: { allocatedMinutes: 10_000 },
  });
}

async function directBooking(
  fixture: Fixture,
  options: {
    resident?: AuthUser;
    flatId?: string;
    vehicleId: string;
    reassignedVehicleId?: string;
    driverId?: string;
    startTime: Date;
    endTime: Date;
    status?: BookingStatus;
    actualRideStartTime?: Date;
    otpVerified?: boolean;
  },
) {
  const resident = options.resident ?? fixture.residentOne;
  const flatId = options.flatId ?? fixture.flatOne.id;
  const period = getIsoWeek(options.startTime);

  return prisma.booking.create({
    data: {
      societyId: fixture.society.id,
      flatId,
      userId: resident.id,
      vehicleId: options.vehicleId,
      reassignedVehicleId: options.reassignedVehicleId,
      driverId: options.driverId,
      startTime: options.startTime,
      endTime: options.endTime,
      durationMinutes: Math.round(
        (options.endTime.getTime() - options.startTime.getTime()) / 60_000,
      ),
      quotaYear: period.year,
      quotaWeek: period.week,
      status: options.status ?? BookingStatus.BOOKED,
      actualRideStartTime: options.actualRideStartTime,
      startedAt: options.actualRideStartTime,
      otpVerified: options.otpVerified,
      otpVerifiedAt: options.otpVerified
        ? options.actualRideStartTime
        : undefined,
    },
  });
}

describe("effective vehicle invariants", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await cleanupSocietyFixture(fixture.society.id);
  });

  it("rejects a +29 minute cross-column conflict and allows exactly +30 minutes", async () => {
    const existing = await directBooking(fixture, {
      vehicleId: fixture.sourceOne.id,
      reassignedVehicleId: fixture.target.id,
      startTime: fixture.base,
      endTime: shifted(fixture.base, 121),
    });
    const requestedStart = shifted(fixture.base, 150);
    const requestedEnd = shifted(requestedStart, 60);
    await ensureQuota(fixture, fixture.flatTwo.id, requestedStart);

    const atTwentyNine = await checkAvailability(
      fixture.residentTwo,
      requestedStart.toISOString(),
      requestedEnd.toISOString(),
    );
    expect(atTwentyNine.availableVehicles.map(({ id }) => id)).not.toContain(
      fixture.target.id,
    );
    await expect(
      createBooking(
        fixture.residentTwo,
        requestedStart.toISOString(),
        requestedEnd.toISOString(),
        fixture.target.id,
      ),
    ).rejects.toThrow("No vehicle is available");

    await prisma.booking.update({
      where: { id: existing.id },
      data: { endTime: shifted(fixture.base, 120), durationMinutes: 120 },
    });

    const atThirty = await checkAvailability(
      fixture.residentTwo,
      requestedStart.toISOString(),
      requestedEnd.toISOString(),
    );
    expect(atThirty.availableVehicles.map(({ id }) => id)).toContain(
      fixture.target.id,
    );
    const created = await createBooking(
      fixture.residentTwo,
      requestedStart.toISOString(),
      requestedEnd.toISOString(),
      fixture.target.id,
    );
    expect(created.booking.vehicleId).toBe(fixture.target.id);
  });

  it("rejects concurrent reassignment attempts that conflict with a primary vehicle reservation", async () => {
    await directBooking(fixture, {
      vehicleId: fixture.reserve.id,
      startTime: fixture.base,
      endTime: shifted(fixture.base, 120),
    });
    const [first, second] = await Promise.all([
      directBooking(fixture, {
        vehicleId: fixture.sourceOne.id,
        startTime: shifted(fixture.base, 30),
        endTime: shifted(fixture.base, 90),
      }),
      directBooking(fixture, {
        resident: fixture.residentTwo,
        flatId: fixture.flatTwo.id,
        vehicleId: fixture.sourceTwo.id,
        startTime: shifted(fixture.base, 30),
        endTime: shifted(fixture.base, 90),
      }),
    ]);

    const results = await Promise.allSettled([
      reassignBooking(
        fixture.admin,
        first.id,
        fixture.reserve.id,
        ReassignReason.BREAKDOWN,
      ),
      reassignBooking(
        fixture.admin,
        second.id,
        fixture.reserve.id,
        ReassignReason.EMERGENCY,
      ),
    ]);

    expect(results.every(({ status }) => status === "rejected")).toBe(true);
    const stored = await prisma.booking.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { reassignedVehicleId: true },
    });
    expect(stored.every(({ reassignedVehicleId }) => !reassignedVehicleId)).toBe(
      true,
    );
  });

  it.each([VehicleStatus.MAINTENANCE, VehicleStatus.BREAKDOWN])(
    "marks an automatically assigned DRIVER_ASSIGNED booking AT_RISK for %s",
    async (status) => {
      await ensureQuota(fixture, fixture.flatOne.id, fixture.base);
      const created = await createBooking(
        fixture.residentOne,
        fixture.base.toISOString(),
        shifted(fixture.base, 60).toISOString(),
        fixture.autoAssigned.id,
      );
      expect(created.booking).toMatchObject({
        status: BookingStatus.DRIVER_ASSIGNED,
        driverId: fixture.driver.id,
      });

      await updateVehicle(fixture.admin, fixture.autoAssigned.id, {
        status,
        maintenanceReason: `${status} regression fixture`,
      });

      const [booking, notifications] = await Promise.all([
        prisma.booking.findUniqueOrThrow({ where: { id: created.booking.id } }),
        prisma.notification.findMany({
          where: { userId: fixture.residentOne.id },
        }),
      ]);
      expect(booking).toMatchObject({
        status: BookingStatus.AT_RISK,
        driverId: fixture.driver.id,
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.message).toContain(fixture.autoAssigned.name);
    },
  );

  it("emits booking impact only once for concurrent duplicate maintenance updates", async () => {
    const booking = await directBooking(fixture, {
      vehicleId: fixture.autoAssigned.id,
      driverId: fixture.driver.id,
      startTime: fixture.base,
      endTime: shifted(fixture.base, 60),
      status: BookingStatus.DRIVER_ASSIGNED,
    });

    await Promise.all([
      updateVehicle(fixture.admin, fixture.autoAssigned.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent maintenance report",
      }),
      updateVehicle(fixture.admin, fixture.autoAssigned.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent maintenance report",
      }),
    ]);

    const [stored, notifications] = await Promise.all([
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      prisma.notification.findMany({
        where: {
          userId: fixture.residentOne.id,
          title: "Booking Impacted",
        },
      }),
    ]);
    expect(stored.status).toBe(BookingStatus.AT_RISK);
    expect(notifications).toHaveLength(1);
  });

  it("does not impact a reassigned booking when only its original vehicle breaks down", async () => {
    const booking = await directBooking(fixture, {
      vehicleId: fixture.autoAssigned.id,
      driverId: fixture.driver.id,
      startTime: fixture.base,
      endTime: shifted(fixture.base, 60),
      status: BookingStatus.DRIVER_ASSIGNED,
    });
    await reassignBooking(
      fixture.admin,
      booking.id,
      fixture.reserve.id,
      ReassignReason.MAINTENANCE,
    );
    const notificationsBefore = await prisma.notification.count({
      where: { userId: fixture.residentOne.id },
    });

    await updateVehicle(fixture.admin, fixture.autoAssigned.id, {
      status: VehicleStatus.BREAKDOWN,
      maintenanceReason: "Original vehicle breakdown",
    });

    const [stored, notificationsAfter] = await Promise.all([
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      prisma.notification.count({ where: { userId: fixture.residentOne.id } }),
    ]);
    expect(stored).toMatchObject({
      status: BookingStatus.DRIVER_ASSIGNED,
      reassignedVehicleId: fixture.reserve.id,
    });
    expect(notificationsAfter).toBe(notificationsBefore);
  });

  it("marks the effective reserve vehicle, not the original vehicle, on a driver issue", async () => {
    // Unlike the availability cases above, this one drives the arrival flow, so
    // the booking has to be inside its window rather than a day out.
    const liveStart = shifted(new Date(), -10);
    const booking = await directBooking(fixture, {
      vehicleId: fixture.autoAssigned.id,
      reassignedVehicleId: fixture.reserve.id,
      driverId: fixture.driver.id,
      startTime: liveStart,
      endTime: shifted(liveStart, 60),
      status: BookingStatus.DRIVER_ASSIGNED,
    });

    await driverArrive(fixture.driverUser, booking.id);
    const arrived = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(arrived.status).toBe(BookingStatus.OTP_PENDING);
    expect(arrived.otp).toMatch(/^\d{6}$/);

    const result = await reportAssignedVehicleIssue(
      fixture.driverUser,
      booking.id,
    );
    const [original, reserve, stored] = await Promise.all([
      prisma.vehicle.findUniqueOrThrow({
        where: { id: fixture.autoAssigned.id },
      }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: fixture.reserve.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ]);

    expect(result.vehicle.id).toBe(fixture.reserve.id);
    expect(original.status).toBe(VehicleStatus.AVAILABLE);
    expect(reserve.status).toBe(VehicleStatus.BREAKDOWN);
    expect(stored).toMatchObject({
      status: BookingStatus.AT_RISK,
      otp: null,
      otpGeneratedAt: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpVerified: false,
      otpVerifiedAt: null,
    });
  });

  it("rejects both driver changes and reserve reassignment after a ride starts", async () => {
    const actualStart = new Date(Date.now() - 5 * 60_000);
    const booking = await directBooking(fixture, {
      vehicleId: fixture.autoAssigned.id,
      driverId: fixture.driver.id,
      startTime: shifted(fixture.base, -120),
      endTime: shifted(fixture.base, -60),
      status: BookingStatus.IN_PROGRESS,
      actualRideStartTime: actualStart,
      otpVerified: true,
    });

    await expect(
      assignDriver(fixture.admin, booking.id, fixture.otherDriver.id),
    ).rejects.toThrow("cannot be changed after arrival or ride start");
    await expect(
      reassignBooking(
        fixture.admin,
        booking.id,
        fixture.reserve.id,
        ReassignReason.EMERGENCY,
      ),
    ).rejects.toThrow("has not started");

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored).toMatchObject({
      status: BookingStatus.IN_PROGRESS,
      driverId: fixture.driver.id,
      reassignedVehicleId: null,
    });
  });

  it("serializes duplicate maintenance updates without duplicate resident alerts", async () => {
    const booking = await directBooking(fixture, {
      vehicleId: fixture.autoAssigned.id,
      driverId: fixture.driver.id,
      startTime: fixture.base,
      endTime: shifted(fixture.base, 60),
      status: BookingStatus.DRIVER_ASSIGNED,
    });

    const results = await Promise.allSettled([
      updateVehicle(fixture.admin, fixture.autoAssigned.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent inspection",
      }),
      updateVehicle(fixture.admin, fixture.autoAssigned.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent inspection",
      }),
    ]);

    expect(results.every(({ status }) => status === "fulfilled")).toBe(true);
    await expect(
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).resolves.toMatchObject({ status: BookingStatus.AT_RISK });
    await expect(
      prisma.notification.count({
        where: { userId: fixture.residentOne.id, title: "Booking Impacted" },
      }),
    ).resolves.toBe(1);
  });
});
