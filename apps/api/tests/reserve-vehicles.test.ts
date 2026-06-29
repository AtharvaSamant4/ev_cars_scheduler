import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, ReassignReason, UserRole, BookingStatus } from "@society-ev/db";
import { reassignBooking, createBooking, checkAvailability } from "@/src/modules/bookings/service";

describe("Reserve Vehicle Integration", () => {
  let adminUser: any;
  let residentUser: any;
  let societyId: string;
  let flatId: string;
  let normalVehicleId: string;
  let reserveVehicle1Id: string;
  let reserveVehicle2Id: string;
  let bookingId: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    if (!admin) throw new Error("No admin found");
    societyId = admin.societyId;
    adminUser = { id: admin.id, role: admin.role, societyId: admin.societyId, name: admin.name || "Admin" };

    const resident = await prisma.user.findFirst({ where: { role: UserRole.RESIDENT } });
    if (!resident || !resident.flatId) throw new Error("No resident found");
    residentUser = resident;
    flatId = resident.flatId;

    // Create a normal vehicle and two reserve vehicles explicitly for testing
    const normalVehicle = await prisma.vehicle.create({
      data: { societyId, name: "Normal Test EV", registrationNumber: "NRM-001", isReserve: false, status: "AVAILABLE", hourlyRate: 100 }
    });
    normalVehicleId = normalVehicle.id;

    const reserveVehicle1 = await prisma.vehicle.create({
      data: { societyId, name: "Reserve Test EV 1", registrationNumber: "RES-001", isReserve: true, status: "AVAILABLE", hourlyRate: 100 }
    });
    reserveVehicle1Id = reserveVehicle1.id;

    const reserveVehicle2 = await prisma.vehicle.create({
      data: { societyId, name: "Reserve Test EV 2", registrationNumber: "RES-002", isReserve: true, status: "AVAILABLE", hourlyRate: 100 }
    });
    reserveVehicle2Id = reserveVehicle2.id;

    const start1 = new Date();
    start1.setDate(start1.getDate() + 10);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    const b1 = await createBooking(residentUser, start1.toISOString(), end1.toISOString(), normalVehicleId);
    bookingId = b1.booking.id;
  });

  afterAll(async () => {
    // Delete the booking, its logs, and the test vehicles
    await prisma.reassignmentLog.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [normalVehicleId, reserveVehicle1Id, reserveVehicle2Id] } } });
  });

  it("should exclude reserve vehicles from availability", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 11);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(12, 0, 0, 0);

    const result = await checkAvailability(residentUser, start.toISOString(), end.toISOString());
    const vehicleIds = result.availableVehicles.map(v => v.id);
    expect(vehicleIds).toContain(normalVehicleId);
    expect(vehicleIds).not.toContain(reserveVehicle1Id);
    expect(vehicleIds).not.toContain(reserveVehicle2Id);
  });

  it("should reassign booking to reserve vehicle and create audit trail", async () => {
    const result = await reassignBooking(adminUser, bookingId, reserveVehicle1Id, ReassignReason.LATE_RETURN);
    
    expect(result.booking.reassignedVehicleId).toBe(reserveVehicle1Id);
    expect(result.booking.reassignedReason).toBe(ReassignReason.LATE_RETURN);

    // Verify Audit Trail
    const logs = await prisma.reassignmentLog.findMany({ where: { bookingId } });
    expect(logs.length).toBe(1);
    expect(logs[0].originalVehicleId).toBe(normalVehicleId);
    expect(logs[0].newVehicleId).toBe(reserveVehicle1Id);
    expect(logs[0].reason).toBe(ReassignReason.LATE_RETURN);
    expect(logs[0].reassignedByUserId).toBe(adminUser.id);
  });

  it("should support multiple reassignments without losing history", async () => {
    // Reassign again to the second reserve vehicle
    const result = await reassignBooking(adminUser, bookingId, reserveVehicle2Id, ReassignReason.BREAKDOWN);
    
    expect(result.booking.reassignedVehicleId).toBe(reserveVehicle2Id);
    expect(result.booking.reassignedReason).toBe(ReassignReason.BREAKDOWN);

    // Verify Audit Trail retains both logs
    const logs = await prisma.reassignmentLog.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
    expect(logs.length).toBe(2);
    
    // First log
    expect(logs[0].originalVehicleId).toBe(normalVehicleId);
    expect(logs[0].newVehicleId).toBe(reserveVehicle1Id);
    
    // Second log
    expect(logs[1].originalVehicleId).toBe(reserveVehicle1Id);
    expect(logs[1].newVehicleId).toBe(reserveVehicle2Id);
    expect(logs[1].reason).toBe(ReassignReason.BREAKDOWN);
  });

  it("should throw error on concurrent reassignment", async () => {
    const promises = [
      reassignBooking(adminUser, bookingId, normalVehicleId, ReassignReason.MAINTENANCE), // Revert to normal
      reassignBooking(adminUser, bookingId, normalVehicleId, ReassignReason.EMERGENCY)
    ];

    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === "fulfilled");
    const failures = results.filter(r => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });
});
