import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import {
  completeTrip,
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
  let assignedDriverUser: AuthUser;
  let otherDriverUser: AuthUser;
  let bookingId: string;
  let reserveVehicleId: string;
  let scheduledEnd: Date;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Driver Authorization Fixture", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "DRV-AUTH-1" } });
    const resident = await prisma.user.create({
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
    const primaryVehicle = await prisma.vehicle.create({
      data: { societyId, name: "Shared Primary EV", registrationNumber: "DRV-PRIMARY" },
    });
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
    ]);

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
