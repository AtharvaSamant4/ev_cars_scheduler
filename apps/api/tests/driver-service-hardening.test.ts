import { BookingStatus, UserRole, VehicleStatus, prisma } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { driverLogin } from "@/src/modules/auth/service";
import {
  createDriver,
  getDriverDashboard,
  getDriverHistory,
  reportAssignedVehicleIssue,
  updateDriver,
} from "@/src/modules/drivers/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Driver service hardening", () => {
  let societyId: string;
  let otherSocietyId: string;
  let admin: AuthUser;
  let primaryVehicleId: string;
  let otherSocietyVehicleId: string;

  beforeAll(async () => {
    const [society, otherSociety] = await Promise.all([
      prisma.society.create({
        data: {
          name: "Driver Hardening Society",
          timezone: "Pacific/Kiritimati",
        },
      }),
      prisma.society.create({
        data: {
          name: "Driver Hardening Other Society",
          timezone: "UTC",
        },
      }),
    ]);
    societyId = society.id;
    otherSocietyId = otherSociety.id;

    const adminAccount = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Driver Hardening Admin",
        email: "driver-hardening-admin@example.test",
        passwordHash: "fixture-hash",
      },
    });
    admin = adminAccount;

    const [primaryVehicle, otherVehicle] = await Promise.all([
      prisma.vehicle.create({
        data: {
          societyId,
          name: "Driver Hardening Primary",
          registrationNumber: "DRV-HARD-PRIMARY",
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId: otherSocietyId,
          name: "Other Society EV",
          registrationNumber: "DRV-HARD-OTHER",
        },
      }),
    ]);
    primaryVehicleId = primaryVehicle.id;
    otherSocietyVehicleId = otherVehicle.id;
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyId);
    await cleanupSocietyFixture(otherSocietyId);
  });

  it("atomically provisions, updates, and deactivates the matching login account", async () => {
    await expect(
      createDriver(admin, {
        fullName: "Cross Society Driver",
        phoneNumber: "9200001101",
        licenseNumber: "DRV-HARD-CROSS",
        password: "DriverPass1101!",
        vehicleId: otherSocietyVehicleId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await prisma.user.findUnique({ where: { phone: "9200001101" } }),
    ).toBeNull();

    const created = await createDriver(admin, {
      fullName: "Provisioned Driver",
      phoneNumber: "9200001102",
      email: "PROVISIONED.DRIVER@EXAMPLE.TEST",
      licenseNumber: "DRV-HARD-LICENSE-1",
      password: "DriverPass1102!",
      vehicleId: primaryVehicleId,
    });

    expect(created).toMatchObject({
      fullName: "Provisioned Driver",
      phoneNumber: "9200001102",
      email: "provisioned.driver@example.test",
      isActive: true,
      vehicleId: primaryVehicleId,
    });
    await expect(
      driverLogin({ phone: "9200001102", password: "DriverPass1102!" }),
    ).resolves.toMatchObject({ user: { name: "Provisioned Driver" } });

    await expect(
      createDriver(admin, {
        fullName: "Duplicate License Driver",
        phoneNumber: "9200001103",
        licenseNumber: "DRV-HARD-LICENSE-1",
        password: "DriverPass1103!",
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      await prisma.user.findUnique({ where: { phone: "9200001103" } }),
    ).toBeNull();

    await updateDriver(admin, created.id, {
      fullName: "Updated Driver",
      phoneNumber: "9200001112",
      password: "UpdatedPass1112!",
    });

    await expect(
      driverLogin({ phone: "9200001102", password: "DriverPass1102!" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID" });
    await expect(
      driverLogin({ phone: "9200001112", password: "UpdatedPass1112!" }),
    ).resolves.toMatchObject({ user: { name: "Updated Driver" } });

    await updateDriver(admin, created.id, { isActive: false });
    const [profile, account] = await Promise.all([
      prisma.driver.findUniqueOrThrow({ where: { id: created.id } }),
      prisma.user.findUniqueOrThrow({ where: { phone: "9200001112" } }),
    ]);
    expect(profile.isActive).toBe(false);
    expect(account.isActive).toBe(false);
    await expect(
      driverLogin({ phone: "9200001112", password: "UpdatedPass1112!" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID" });

    // A stale active User row must not bypass an inactive Driver profile.
    await prisma.user.update({
      where: { id: account.id },
      data: { isActive: true },
    });
    await expect(
      driverLogin({ phone: "9200001112", password: "UpdatedPass1112!" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID" });
  }, 20_000);

  it("redacts OTP and resident password data from dashboard and history DTOs", async () => {
    const flat = await prisma.flat.create({
      data: { societyId, number: "DRV-HARD-DTO" },
    });
    const resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "DTO Resident",
        phone: "9200001201",
        passwordHash: "RESIDENT_PASSWORD_MUST_NOT_LEAK",
      },
    });
    const account = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "DTO Driver",
        phone: "9200001202",
        passwordHash: "DRIVER_PASSWORD_MUST_NOT_LEAK",
      },
    });
    const profile = await prisma.driver.create({
      data: {
        societyId,
        fullName: account.name,
        phoneNumber: account.phone!,
        licenseNumber: "DRV-HARD-DTO-LICENSE",
        vehicleId: primaryVehicleId,
      },
    });
    const driverUser: AuthUser = account;

    const active = await prisma.booking.create({
      data: {
        societyId,
        flatId: flat.id,
        userId: resident.id,
        vehicleId: primaryVehicleId,
        driverId: profile.id,
        quotaYear: 2026,
        quotaWeek: 33,
        startTime: new Date("2026-08-11T11:00:00.000Z"),
        endTime: new Date("2026-08-11T12:00:00.000Z"),
        durationMinutes: 60,
        status: BookingStatus.OTP_PENDING,
        otp: "654321",
        otpAttempts: 2,
      },
    });
    const completed = await prisma.booking.create({
      data: {
        societyId,
        flatId: flat.id,
        userId: resident.id,
        vehicleId: primaryVehicleId,
        driverId: profile.id,
        quotaYear: 2026,
        quotaWeek: 32,
        startTime: new Date("2026-08-10T06:00:00.000Z"),
        endTime: new Date("2026-08-10T07:00:00.000Z"),
        durationMinutes: 60,
        status: BookingStatus.COMPLETED,
        otp: "123456",
      },
    });

    const dashboard = await getDriverDashboard(
      driverUser,
      new Date("2026-08-11T10:30:00.000Z"),
    );
    const history = await getDriverHistory(driverUser);
    expect(dashboard.today.some(({ id }) => id === active.id)).toBe(true);
    expect(history.some(({ id }) => id === completed.id)).toBe(true);

    const serialized = JSON.stringify({ dashboard, history });
    expect(serialized).not.toContain("654321");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("RESIDENT_PASSWORD_MUST_NOT_LEAK");
    expect(serialized).not.toContain("passwordHash");
    expect(dashboard.today[0]).not.toHaveProperty("otp");
  });

  it("uses society-local day boundaries, keeps overdue work actionable, and only histories terminal trips", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Timezone EV",
        registrationNumber: "DRV-HARD-TZ",
      },
    });
    const flat = await prisma.flat.create({
      data: { societyId, number: "DRV-HARD-TZ" },
    });
    const resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Timezone Resident",
        phone: "9200001301",
        passwordHash: "fixture-hash",
      },
    });
    const account = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Timezone Driver",
        phone: "9200001302",
        passwordHash: "fixture-hash",
      },
    });
    const profile = await prisma.driver.create({
      data: {
        societyId,
        fullName: account.name,
        phoneNumber: account.phone!,
        licenseNumber: "DRV-HARD-TZ-LICENSE",
        vehicleId: vehicle.id,
      },
    });
    const base = {
      societyId,
      flatId: flat.id,
      userId: resident.id,
      vehicleId: vehicle.id,
      driverId: profile.id,
      quotaYear: 2026,
      quotaWeek: 33,
      durationMinutes: 15,
    };
    const [overdue, localToday, localTomorrow, completed, cancelled] =
      await Promise.all([
        prisma.booking.create({
          data: {
            ...base,
            startTime: new Date("2026-08-10T05:00:00.000Z"),
            endTime: new Date("2026-08-10T05:15:00.000Z"),
            status: BookingStatus.DRIVER_ASSIGNED,
          },
        }),
        prisma.booking.create({
          data: {
            ...base,
            startTime: new Date("2026-08-12T09:00:00.000Z"),
            endTime: new Date("2026-08-12T09:15:00.000Z"),
            status: BookingStatus.DRIVER_ASSIGNED,
          },
        }),
        prisma.booking.create({
          data: {
            ...base,
            startTime: new Date("2026-08-12T10:00:00.000Z"),
            endTime: new Date("2026-08-12T10:15:00.000Z"),
            status: BookingStatus.DRIVER_ASSIGNED,
          },
        }),
        prisma.booking.create({
          data: {
            ...base,
            startTime: new Date("2026-08-09T03:00:00.000Z"),
            endTime: new Date("2026-08-09T03:15:00.000Z"),
            status: BookingStatus.COMPLETED,
          },
        }),
        prisma.booking.create({
          data: {
            ...base,
            startTime: new Date("2026-08-13T03:00:00.000Z"),
            endTime: new Date("2026-08-13T03:15:00.000Z"),
            status: BookingStatus.CANCELLED,
            cancelledAt: new Date("2026-08-11T03:00:00.000Z"),
          },
        }),
      ]);

    // 2026-08-11 10:30Z is 2026-08-12 00:30 in Pacific/Kiritimati.
    // The next society-local midnight is exactly 2026-08-12 10:00Z.
    const dashboard = await getDriverDashboard(
      account,
      new Date("2026-08-11T10:30:00.000Z"),
    );
    expect(dashboard.today.map(({ id }) => id)).toEqual(
      expect.arrayContaining([overdue.id, localToday.id]),
    );
    expect(dashboard.upcoming.map(({ id }) => id)).toContain(localTomorrow.id);
    expect(
      [...dashboard.today, ...dashboard.upcoming].map(({ id }) => id),
    ).not.toEqual(expect.arrayContaining([completed.id, cancelled.id]));

    const history = await getDriverHistory(account);
    expect(history.map(({ id }) => id)).toEqual(
      expect.arrayContaining([completed.id, cancelled.id]),
    );
    expect(history.map(({ id }) => id)).not.toContain(overdue.id);
  });

  it("reports the exact booking's effective reserve vehicle and does not affect bookings moved away from it", async () => {
    const [primary, reserve, movedTo] = await Promise.all([
      prisma.vehicle.create({
        data: {
          societyId,
          name: "Issue Primary",
          registrationNumber: "DRV-HARD-ISSUE-P",
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId,
          name: "Issue Reserve",
          registrationNumber: "DRV-HARD-ISSUE-R",
          isReserve: true,
        },
      }),
      prisma.vehicle.create({
        data: {
          societyId,
          name: "Issue Moved-To",
          registrationNumber: "DRV-HARD-ISSUE-M",
          isReserve: true,
        },
      }),
    ]);
    const flats = await Promise.all(
      [1, 2, 3, 4].map((number) =>
        prisma.flat.create({
          data: { societyId, number: `DRV-HARD-ISSUE-${number}` },
        }),
      ),
    );
    const residents = await Promise.all(
      flats.map((flat, index) =>
        prisma.user.create({
          data: {
            societyId,
            flatId: flat.id,
            role: UserRole.RESIDENT,
            name: `Issue Resident ${index + 1}`,
            phone: `92000014${String(index + 1).padStart(2, "0")}`,
            passwordHash: "fixture-hash",
          },
        }),
      ),
    );
    const [assignedAccount, otherAccount] = await Promise.all([
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.DRIVER,
          name: "Issue Assigned Driver",
          phone: "9200001451",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.DRIVER,
          name: "Issue Other Driver",
          phone: "9200001452",
          passwordHash: "fixture-hash",
        },
      }),
    ]);
    const [assignedDriver, otherDriver] = await Promise.all([
      prisma.driver.create({
        data: {
          societyId,
          fullName: assignedAccount.name,
          phoneNumber: assignedAccount.phone!,
          licenseNumber: "DRV-HARD-ISSUE-L1",
          vehicleId: primary.id,
        },
      }),
      prisma.driver.create({
        data: {
          societyId,
          fullName: otherAccount.name,
          phoneNumber: otherAccount.phone!,
          licenseNumber: "DRV-HARD-ISSUE-L2",
          vehicleId: primary.id,
        },
      }),
    ]);

    const bookingData = (index: number, startTime: Date) => ({
      societyId,
      flatId: flats[index].id,
      userId: residents[index].id,
      quotaYear: 2026,
      quotaWeek: 33,
      startTime,
      endTime: new Date(startTime.getTime() + 15 * 60_000),
      durationMinutes: 15,
    });
    const [selected, futureOnReserve, movedOffReserve, inProgress] =
      await Promise.all([
        prisma.booking.create({
          data: {
            ...bookingData(0, new Date("2030-01-01T03:00:00.000Z")),
            vehicleId: primary.id,
            reassignedVehicleId: reserve.id,
            driverId: assignedDriver.id,
            status: BookingStatus.DRIVER_ASSIGNED,
          },
        }),
        prisma.booking.create({
          data: {
            ...bookingData(1, new Date("2030-01-01T05:00:00.000Z")),
            vehicleId: reserve.id,
            status: BookingStatus.BOOKED,
          },
        }),
        prisma.booking.create({
          data: {
            ...bookingData(2, new Date("2030-01-01T07:00:00.000Z")),
            vehicleId: reserve.id,
            reassignedVehicleId: movedTo.id,
            status: BookingStatus.BOOKED,
          },
        }),
        prisma.booking.create({
          data: {
            ...bookingData(3, new Date("2030-01-01T09:00:00.000Z")),
            vehicleId: movedTo.id,
            driverId: assignedDriver.id,
            status: BookingStatus.IN_PROGRESS,
          },
        }),
      ]);

    await expect(
      reportAssignedVehicleIssue(otherAccount, selected.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reportAssignedVehicleIssue(assignedAccount, inProgress.id),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    await expect(
      reportAssignedVehicleIssue(assignedAccount, selected.id),
    ).resolves.toMatchObject({
      success: true,
      bookingId: selected.id,
      vehicle: { id: reserve.id, status: VehicleStatus.BREAKDOWN },
    });

    const [storedPrimary, storedReserve, storedSelected, storedFuture, storedMoved] =
      await Promise.all([
        prisma.vehicle.findUniqueOrThrow({ where: { id: primary.id } }),
        prisma.vehicle.findUniqueOrThrow({ where: { id: reserve.id } }),
        prisma.booking.findUniqueOrThrow({ where: { id: selected.id } }),
        prisma.booking.findUniqueOrThrow({ where: { id: futureOnReserve.id } }),
        prisma.booking.findUniqueOrThrow({ where: { id: movedOffReserve.id } }),
      ]);
    expect(storedPrimary.status).toBe(VehicleStatus.AVAILABLE);
    expect(storedReserve.status).toBe(VehicleStatus.BREAKDOWN);
    expect(storedSelected.status).toBe(BookingStatus.AT_RISK);
    expect(storedFuture.status).toBe(BookingStatus.AT_RISK);
    expect(storedMoved.status).toBe(BookingStatus.BOOKED);
    expect(
      await prisma.notification.count({
        where: { userId: residents[2].id, title: "Booking Impacted" },
      }),
    ).toBe(0);
    expect(otherDriver.vehicleId).toBe(primary.id);
  });
});
