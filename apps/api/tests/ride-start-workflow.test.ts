import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, UserRole, BookingStatus, VehicleStatus } from "@society-ev/db";
import { assignDriver, driverArrive, verifyOtp } from "@/src/modules/bookings/service";

describe("Ride Start OTP Workflow", () => {
  let admin: any;
  let driverUser: any;
  let driverProfile: any;
  let resident: any;
  let society: any;
  let vehicle: any;
  let bookingId: string;

  beforeAll(async () => {
    society = await prisma.society.create({
      data: { name: "OTP Society", timezone: "Asia/Kolkata" },
    });

    const flat = await prisma.flat.create({
      data: { societyId: society.id, number: "OTP101" },
    });

    admin = await prisma.user.create({
      data: {
        societyId: society.id,
        role: UserRole.ADMIN,
        name: "Admin OTP",
        phone: "9999900001",
        passwordHash: "hash",
      },
    });

    resident = await prisma.user.create({
      data: {
        societyId: society.id,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Resident OTP",
        phone: "9999900002",
        passwordHash: "hash",
      },
    });

    driverUser = await prisma.user.create({
      data: {
        societyId: society.id,
        role: UserRole.DRIVER,
        name: "Driver User OTP",
        phone: "9999900003",
        passwordHash: "hash",
      },
    });

    driverProfile = await prisma.driver.create({
      data: {
        societyId: society.id,
        fullName: "Driver User OTP",
        phoneNumber: "9999900003",
        licenseNumber: "LIC-OTP",
      },
    });

    vehicle = await prisma.vehicle.create({
      data: {
        societyId: society.id,
        name: "EV-OTP",
        registrationNumber: "EV-OTP-123",
        status: VehicleStatus.AVAILABLE,
      },
    });

    const now = new Date();
    const start = new Date(now.getTime() + 10000);
    const end = new Date(start.getTime() + 60 * 60000);

    const b = await prisma.booking.create({
      data: {
        societyId: society.id,
        vehicleId: vehicle.id,
        flatId: flat.id,
        userId: resident.id,
        quotaYear: start.getFullYear(),
        quotaWeek: 1,
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        status: BookingStatus.BOOKED,
      },
    });
    bookingId = b.id;
  });

  afterAll(async () => {
    if (society) {
      await prisma.booking.deleteMany({ where: { societyId: society.id } });
      await prisma.driver.deleteMany({ where: { societyId: society.id } });
      await prisma.vehicle.deleteMany({ where: { societyId: society.id } });
      await prisma.user.deleteMany({ where: { societyId: society.id } });
      await prisma.flat.deleteMany({ where: { societyId: society.id } });
      await prisma.society.deleteMany({ where: { id: society.id } });
    }
    await prisma.$disconnect();
  });

  it("should assign a driver and update status", async () => {
    const updated = await assignDriver(admin, bookingId, driverProfile.id);
    expect(updated.driverId).toBe(driverProfile.id);
    expect(updated.status).toBe(BookingStatus.DRIVER_ASSIGNED);
  });

  let otpCode = "";

  it("should generate OTP on driver arrival", async () => {
    const result = await driverArrive(driverUser, bookingId);
    expect(result.status).toBe(BookingStatus.OTP_PENDING);
    expect(result.otp).toHaveLength(6);
    expect(result.otpGeneratedAt).toBeDefined();
    expect(result.otpExpiresAt).toBeDefined();
    
    otpCode = result.otp!;
  });

  it("should fail with incorrect OTP", async () => {
    await expect(verifyOtp(driverUser, bookingId, "000000")).rejects.toThrow("Invalid OTP");

    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.otpAttempts).toBe(1);
  });

  it("should succeed with correct OTP and set actual start time", async () => {
    const result = await verifyOtp(driverUser, bookingId, otpCode);
    expect(result.status).toBe(BookingStatus.IN_PROGRESS);
    expect(result.otpVerified).toBe(true);
    expect(result.actualRideStartTime).toBeDefined();
  });

  it("should prevent duplicate OTP verifications", async () => {
    await expect(verifyOtp(driverUser, bookingId, otpCode)).rejects.toThrow("Booking is not pending OTP verification");
  });
});
