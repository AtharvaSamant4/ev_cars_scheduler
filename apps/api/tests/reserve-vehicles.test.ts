import { prisma, ReassignReason, UserRole } from "@society-ev/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { checkAvailability, createBooking, reassignBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

describe("Reserve vehicle integration", () => {
  let admin: AuthUser;
  let resident: AuthUser;
  let societyId: string;
  let normalVehicleId: string;
  let reserveVehicle1Id: string;
  let reserveVehicle2Id: string;
  let reserveVehicle3Id: string;
  let bookingId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({ data: { name: "Reserve Fixture Society", timezone: "Asia/Kolkata" } });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "RES-101" } });
    [admin, resident] = await Promise.all([
      prisma.user.create({ data: { societyId, role: UserRole.ADMIN, name: "Reserve Admin", phone: "9100000021", passwordHash: "fixture-hash" } }),
      prisma.user.create({ data: { societyId, flatId: flat.id, role: UserRole.RESIDENT, name: "Reserve Resident", phone: "9100000022", passwordHash: "fixture-hash" } }),
    ]);
    await prisma.wallet.create({ data: { userId: resident.id, balance: 10_000 } });
    const vehicles = await Promise.all([
      prisma.vehicle.create({ data: { societyId, name: "Normal Fixture EV", registrationNumber: "RES-NORMAL", isReserve: false } }),
      prisma.vehicle.create({ data: { societyId, name: "Reserve Fixture EV 1", registrationNumber: "RES-ONE", isReserve: true } }),
      prisma.vehicle.create({ data: { societyId, name: "Reserve Fixture EV 2", registrationNumber: "RES-TWO", isReserve: true } }),
      prisma.vehicle.create({ data: { societyId, name: "Reserve Fixture EV 3", registrationNumber: "RES-THREE", isReserve: true } }),
    ]);
    [normalVehicleId, reserveVehicle1Id, reserveVehicle2Id, reserveVehicle3Id] = vehicles.map((vehicle) => vehicle.id);

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    bookingId = (await createBooking(resident, start.toISOString(), new Date(start.getTime() + 2 * 60 * 60_000).toISOString(), normalVehicleId)).booking.id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("excludes reserve vehicles from resident availability", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const result = await checkAvailability(resident, start.toISOString(), new Date(start.getTime() + 2 * 60 * 60_000).toISOString());
    const ids = result.availableVehicles.map((vehicle) => vehicle.id);
    expect(ids).toContain(normalVehicleId);
    expect(ids).not.toContain(reserveVehicle1Id);
    expect(ids).not.toContain(reserveVehicle2Id);
  });

  it("rejects reassignment by a resident", async () => {
    await expect(reassignBooking(resident, bookingId, reserveVehicle1Id, ReassignReason.BREAKDOWN)).rejects.toThrow("Only admins");
  });

  it("reassigns to a reserve vehicle with an audit trail", async () => {
    const result = await reassignBooking(admin, bookingId, reserveVehicle1Id, ReassignReason.LATE_RETURN);
    expect(result.reassignedVehicleId).toBe(reserveVehicle1Id);
    const logs = await prisma.reassignmentLog.findMany({ where: { bookingId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      originalVehicleId: normalVehicleId,
      newVehicleId: reserveVehicle1Id,
      reason: ReassignReason.LATE_RETURN,
      reassignedByUserId: admin.id,
    });
  });

  it("retains history across a second reassignment", async () => {
    await reassignBooking(admin, bookingId, reserveVehicle2Id, ReassignReason.BREAKDOWN);
    const logs = await prisma.reassignmentLog.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ originalVehicleId: reserveVehicle1Id, newVehicleId: reserveVehicle2Id });
  });

  it("allows one winner when the same reserve vehicle is assigned concurrently", async () => {
    const results = await Promise.allSettled([
      reassignBooking(admin, bookingId, reserveVehicle3Id, ReassignReason.MAINTENANCE),
      reassignBooking(admin, bookingId, reserveVehicle3Id, ReassignReason.EMERGENCY),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
