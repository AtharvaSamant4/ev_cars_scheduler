import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import {
  completeTrip,
  createBooking,
  driverArrive,
  verifyOtp,
} from "@/src/modules/bookings/service";
import {
  getDriverDashboard,
  getDriverHistory,
} from "@/src/modules/drivers/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Driver booking authorization", () => {
  let societyId: string;
  let resident: AuthUser;
  let assignedDriverUser: AuthUser;
  let autoAssignedDriverUser: AuthUser;
  let otherDriverUser: AuthUser;
  let bookingId: string;
  let autoAssignedDriverId: string;
  let autoAssignedVehicleId: string;
  let sharedVehicleId: string;
  let reserveVehicleId: string;
  let scheduledEnd: Date;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Driver Authorization Fixture", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "DRV-AUTH-1" } });
    resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Driver Auth Resident",
        phone: "9100000201",
        passwordHash: "fixture-hash",
      },
    });
    assignedDriverUser = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Assigned Driver",
        phone: "9100000202",
        passwordHash: "fixture-hash",
      },
    });
    otherDriverUser = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Other Driver",
        phone: "9100000203",
        passwordHash: "fixture-hash",
      },
    });
    autoAssignedDriverUser = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Auto-assigned Driver",
        phone: "9100000299",
        passwordHash: "fixture-hash",
      },
    });
    const primaryVehicle = await prisma.vehicle.create({
      data: { societyId, name: "Shared Primary EV", registrationNumber: "DRV-PRIMARY" },
    });
    sharedVehicleId = primaryVehicle.id;
    const autoAssignedVehicle = await prisma.vehicle.create({
      data: { societyId, name: "Auto-assigned EV", registrationNumber: "DRV-AUTO" },
    });
    autoAssignedVehicleId = autoAssignedVehicle.id;
    const reserveVehicle = await prisma.vehicle.create({
      data: { societyId, name: "Effective Reserve EV", registrationNumber: "DRV-RESERVE", isReserve: true },
    });
    reserveVehicleId = reserveVehicle.id;
    const [assignedProfile] = await Promise.all([
      prisma.driver.create({
        data: {
          societyId,
          fullName: assignedDriverUser.name,
          phoneNumber: "9100000202",
          licenseNumber: "DRV-AUTH-LIC-1",
          vehicleId: primaryVehicle.id,
        },
      }),
      prisma.driver.create({
        data: {
          societyId,
          fullName: otherDriverUser.name,
          phoneNumber: "9100000203",
          licenseNumber: "DRV-AUTH-LIC-2",
          vehicleId: primaryVehicle.id,
        },
      }),
      prisma.driver.create({
        data: {
          societyId,
          fullName: autoAssignedDriverUser.name,
          phoneNumber: "9100000299",
          licenseNumber: "DRV-AUTH-LIC-AUTO",
          vehicleId: autoAssignedVehicle.id,
        },
      }).then((profile) => {
        autoAssignedDriverId = profile.id;
        return profile;
      }),
    ]);

    await prisma.wallet.create({
      data: { userId: resident.id, balance: 10_000 },
    });

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    scheduledEnd = new Date(start.getTime() + 60 * 60_000);
    const period = getIsoWeek(start);
    bookingId = (await prisma.booking.create({
      data: {
        societyId,
        flatId: flat.id,
        userId: resident.id,
        vehicleId: primaryVehicle.id,
        reassignedVehicleId: reserveVehicle.id,
        driverId: assignedProfile.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime: start,
        endTime: scheduledEnd,
        durationMinutes: 60,
        status: BookingStatus.DRIVER_ASSIGNED,
      },
    })).id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("auto-assigns the sole active vehicle driver and shows the trip", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(11, 0, 0, 0);
    const created = await createBooking(
      resident,
      start.toISOString(),
      new Date(start.getTime() + 60 * 60_000).toISOString(),
      autoAssignedVehicleId,
    );

    expect(created.booking).toMatchObject({
      driverId: autoAssignedDriverId,
      status: BookingStatus.DRIVER_ASSIGNED,
    });

    const dashboard = await getDriverDashboard(autoAssignedDriverUser);
    expect(
      [...dashboard.today, ...dashboard.upcoming].some(
        (booking) => booking.id === created.booking.id,
      ),
    ).toBe(true);
  });

  it("leaves ambiguous vehicle mappings for explicit admin assignment", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    start.setHours(11, 0, 0, 0);
    const created = await createBooking(
      resident,
      start.toISOString(),
      new Date(start.getTime() + 60 * 60_000).toISOString(),
      sharedVehicleId,
    );

    expect(created.booking).toMatchObject({
      driverId: null,
      status: BookingStatus.BOOKED,
    });
  });

  it("shows only driverId-assigned trips and identifies the reserve as effective", async () => {
    const assignedDashboard = await getDriverDashboard(assignedDriverUser);
    const assignedBooking = assignedDashboard.upcoming.find((booking) => booking.id === bookingId);
    expect(assignedBooking?.effectiveVehicle.id).toBe(reserveVehicleId);

    const otherDashboard = await getDriverDashboard(otherDriverUser);
    expect(otherDashboard.upcoming.some((booking) => booking.id === bookingId)).toBe(false);
  });

  it("rejects another driver even when both profiles share the primary vehicle", async () => {
    await expect(driverArrive(otherDriverUser, bookingId)).rejects.toThrow("assigned to another driver");
    const arrived = await driverArrive(assignedDriverUser, bookingId);
    await expect(verifyOtp(otherDriverUser, bookingId, arrived.otp!)).rejects.toThrow("assigned to another driver");
    await verifyOtp(assignedDriverUser, bookingId, arrived.otp!);
    await expect(completeTrip(otherDriverUser, bookingId, scheduledEnd.toISOString())).rejects.toThrow("assigned to another driver");
    await expect(completeTrip(assignedDriverUser, bookingId, scheduledEnd.toISOString())).resolves.toMatchObject({
      status: BookingStatus.COMPLETED,
      reassignedVehicle: { id: reserveVehicleId },
    });
  });

  it("keeps completed reassigned trips in only the assigned driver's history", async () => {
    const assignedHistory = await getDriverHistory(assignedDriverUser);
    expect(assignedHistory.find((booking) => booking.id === bookingId)?.effectiveVehicle.id).toBe(reserveVehicleId);
    const otherHistory = await getDriverHistory(otherDriverUser);
    expect(otherHistory.some((booking) => booking.id === bookingId)).toBe(false);
  });
});
