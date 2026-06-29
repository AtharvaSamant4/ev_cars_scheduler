import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, UserRole, BookingStatus } from "@society-ev/db";
import { createBooking } from "@/src/modules/bookings/service";

describe("Booking 30-Minute Buffer System", () => {
  let adminUser: any;
  let residentUser: any;
  let societyId: string;
  let flatId: string;
  let vehicle1Id: string;
  let vehicle2Id: string;
  
  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    if (!admin) throw new Error("No admin found");
    societyId = admin.societyId;
    
    adminUser = {
      id: admin.id,
      role: admin.role,
      societyId: admin.societyId,
    };

    const resident = await prisma.user.findFirst({ where: { role: UserRole.RESIDENT } });
    if (!resident || !resident.flatId) throw new Error("No resident found");
    residentUser = resident;
    flatId = resident.flatId;

    // Provide huge wallet balance for testing
    await prisma.wallet.upsert({
      where: { userId: resident.id },
      update: { balance: 100000 },
      create: { userId: resident.id, balance: 100000 },
    });

    const vehicles = await prisma.vehicle.findMany({ where: { societyId }, take: 2 });
    vehicle1Id = vehicles[0]!.id;
    vehicle2Id = vehicles[1]!.id;

    // Allocate flat quota for this week
    const now = new Date();
    const isoDate = getIsoWeek(now);
    await prisma.flatQuota.upsert({
      where: {
        flatId_year_weekNumber: {
          flatId,
          year: isoDate.year,
          weekNumber: isoDate.week,
        }
      },
      update: { allocatedMinutes: 10000 },
      create: {
        flatId,
        year: isoDate.year,
        weekNumber: isoDate.week,
        allocatedMinutes: 10000,
        usedMinutes: 0
      }
    });

    // Clean up existing bookings that might conflict
    await prisma.booking.deleteMany({
      where: {
        OR: [
          { vehicleId: vehicle1Id },
          { vehicleId: vehicle2Id }
        ]
      }
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({});
  });

  function getIsoWeek(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return { year: d.getUTCFullYear(), week };
  }

  it("should allow a booking with exactly a 30-minute gap", async () => {
    // Booking 1: Tomorrow 10:00 to 12:00
    const start1 = new Date();
    start1.setDate(start1.getDate() + 1);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    const b1 = await createBooking(residentUser, start1.toISOString(), end1.toISOString(), vehicle1Id);
    expect(b1.booking).toBeDefined();

    // Booking 2: Tomorrow 12:30 to 14:30
    const start2 = new Date();
    start2.setDate(start2.getDate() + 1);
    start2.setHours(12, 30, 0, 0);
    const end2 = new Date(start2);
    end2.setHours(14, 30, 0, 0);

    const b2 = await createBooking(residentUser, start2.toISOString(), end2.toISOString(), vehicle1Id);
    expect(b2.booking).toBeDefined();
  });

  it("should reject a 0-minute gap at the DB constraint level", async () => {
    // Let's create Booking 1 directly via prisma
    const start1 = new Date();
    start1.setDate(start1.getDate() + 2);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    const isoDate = getIsoWeek(start1);

    await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: residentUser.id,
        quotaYear: isoDate.year,
        quotaWeek: isoDate.week,
        startTime: start1,
        endTime: end1,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      }
    });

    // Try creating Booking 2 starting exactly at 12:00 via DB
    const start2 = new Date(end1);
    const end2 = new Date(start2);
    end2.setHours(14, 0, 0, 0);

    await expect(prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: residentUser.id,
        quotaYear: isoDate.year,
        quotaWeek: isoDate.week,
        startTime: start2,
        endTime: end2,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      }
    })).rejects.toThrow();
  });

  it("should reject a 29-minute gap at the DB constraint level", async () => {
    const start1 = new Date();
    start1.setDate(start1.getDate() + 3);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    const isoDate = getIsoWeek(start1);

    await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: residentUser.id,
        quotaYear: isoDate.year,
        quotaWeek: isoDate.week,
        startTime: start1,
        endTime: end1,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      }
    });

    // Try creating Booking 2 starting at 12:29 via DB
    const start2 = new Date(end1);
    start2.setMinutes(29);
    const end2 = new Date(start2);
    end2.setHours(end2.getHours() + 2);

    await expect(prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle1Id,
        flatId,
        userId: residentUser.id,
        quotaYear: isoDate.year,
        quotaWeek: isoDate.week,
        startTime: start2,
        endTime: end2,
        durationMinutes: 120,
        status: BookingStatus.BOOKED,
      }
    })).rejects.toThrow();
  });

  it("should allow a 0-minute gap on different vehicles", async () => {
    // Vehicle 2
    const start1 = new Date();
    start1.setDate(start1.getDate() + 4);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    await createBooking(residentUser, start1.toISOString(), end1.toISOString(), vehicle2Id);
    
    // Vehicle 1 at same time
    const res = await createBooking(residentUser, start1.toISOString(), end1.toISOString(), vehicle1Id);
    expect(res.booking).toBeDefined();
  });

  it("should handle concurrent bookings without double booking", async () => {
    const start1 = new Date();
    start1.setDate(start1.getDate() + 5);
    start1.setHours(10, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 0, 0, 0);

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(createBooking(residentUser, start1.toISOString(), end1.toISOString(), vehicle2Id));
    }

    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === "fulfilled");
    const failures = results.filter(r => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);
  });
});
