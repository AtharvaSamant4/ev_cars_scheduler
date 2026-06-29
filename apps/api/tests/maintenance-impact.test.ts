import { prisma, VehicleStatus, UserRole } from "@society-ev/db";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { updateVehicle } from "@/src/modules/admin/service";
import { getAffectedBookings } from "@/src/modules/admin/service";
import { getNotifications } from "@/src/modules/residents/service";

describe("Vehicle Maintenance & Booking Impact", () => {
  let admin: any;
  let resident: any;
  let vehicle1: any;
  let flat: any;
  let society: any;

  beforeAll(async () => {
    society = await prisma.society.create({
      data: { name: "Test Maintenance Society", timezone: "Asia/Kolkata" },
    });

    flat = await prisma.flat.create({
      data: { societyId: society.id, number: "M101" },
    });

    admin = await prisma.user.create({
      data: {
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Admin M",
        phone: "9999988881",
        passwordHash: "hash",
      },
    });

    resident = await prisma.user.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Resident M",
        phone: "9999988882",
        passwordHash: "hash",
      },
    });
  });

  afterAll(async () => {
    if (society) {
      await prisma.notification.deleteMany({ where: { user: { societyId: society.id } } });
      await prisma.reassignmentLog.deleteMany({ where: { booking: { societyId: society.id } } });
      await prisma.booking.deleteMany({ where: { societyId: society.id } });
      await prisma.vehicle.deleteMany({ where: { societyId: society.id } });
      await prisma.user.deleteMany({ where: { societyId: society.id } });
      await prisma.flat.deleteMany({ where: { societyId: society.id } });
      await prisma.society.deleteMany({ where: { id: society.id } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { user: { societyId: society.id } } });
    await prisma.booking.deleteMany({ where: { societyId: society.id } });
    await prisma.vehicle.deleteMany({ where: { societyId: society.id } });

    vehicle1 = await prisma.vehicle.create({
      data: {
        societyId: society.id,
        name: "Maintenance EV 1",
        registrationNumber: "MN01",
        status: VehicleStatus.AVAILABLE,
      },
    });
  });

  it("should mark future bookings as AT_RISK and generate notifications when vehicle goes into MAINTENANCE", async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const pastEnd = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const futureStart = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Create a past booking
    await prisma.booking.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        userId: resident.id,
        vehicleId: vehicle1.id,
        startTime: pastStart,
        endTime: pastEnd,
        durationMinutes: 60,
        status: "COMPLETED",
      },
    });

    // Create a future booking
    const futureBooking = await prisma.booking.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        userId: resident.id,
        vehicleId: vehicle1.id,
        startTime: futureStart,
        endTime: futureEnd,
        durationMinutes: 60,
        status: "BOOKED",
      },
    });

    // Update vehicle to MAINTENANCE
    await updateVehicle(admin, vehicle1.id, {
      status: VehicleStatus.MAINTENANCE,
      maintenanceReason: "Routine Checkup",
    });

    // Check affected bookings
    const affected = await getAffectedBookings(admin);
    expect(affected.length).toBe(1);
    expect(affected[0].id).toBe(futureBooking.id);

    // Check notifications
    const notifications = await getNotifications(resident);
    expect(notifications.length).toBe(1);
    expect(notifications[0].title).toBe("Booking Impacted");
    expect(notifications[0].message).toContain("Maintenance EV 1");
  });
});
