import { prisma, UserRole, BookingStatus } from "@society-ev/db";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

function assertDriver(user: AuthUser) {
  if (user.role !== UserRole.DRIVER) {
    throw new AppError(403, "FORBIDDEN", "Only drivers can access this endpoint");
  }
}

export async function driverDashboard(user: AuthUser) {
  assertDriver(user);

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
    include: { vehicle: true },
  });

  if (!driver) {
    throw new AppError(404, "NOT_FOUND", "Driver profile not found");
  }

  const vehicle = driver.vehicle;

  if (!vehicle) {
    return {
      vehicle: null,
      today: [],
      upcoming: [],
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const allBookings = await prisma.booking.findMany({
    where: {
      vehicleId: vehicle.id,
      status: { in: [BookingStatus.BOOKED, BookingStatus.ACTIVE] },
      startTime: { gte: startOfToday },
    },
    include: {
      flat: { select: { number: true } },
      user: { select: { name: true, phone: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const today = allBookings.filter((b) => b.startTime < endOfToday);
  const upcoming = allBookings.filter((b) => b.startTime >= endOfToday);

  return {
    vehicle,
    today,
    upcoming,
  };
}

export async function driverHistory(user: AuthUser) {
  assertDriver(user);

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver || !driver.vehicleId) {
    return [];
  }

  const history = await prisma.booking.findMany({
    where: {
      vehicleId: driver.vehicleId,
      status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] },
    },
    include: {
      flat: { select: { number: true } },
      user: { select: { name: true, phone: true } },
    },
    orderBy: { startTime: "desc" },
    take: 50,
  });

  return history;
}

export async function verifyBookingOtp(user: AuthUser, bookingId: string, otp: string) {
  assertDriver(user);

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver?.vehicleId) {
    throw new AppError(400, "NO_VEHICLE", "You are not assigned to a vehicle");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  if (booking.vehicleId !== driver.vehicleId) {
    throw new AppError(403, "FORBIDDEN", "Booking belongs to another vehicle");
  }

  if (booking.status !== BookingStatus.BOOKED) {
    throw new AppError(400, "INVALID_STATE", "Booking cannot be started");
  }

  if (booking.otpVerified) {
    throw new AppError(400, "ALREADY_VERIFIED", "OTP already verified");
  }

  if (booking.otpAttempts >= 5) {
    throw new AppError(403, "LOCKED", "Maximum OTP attempts exceeded");
  }

  if (new Date() > booking.endTime) {
    throw new AppError(400, "EXPIRED", "Booking has already expired");
  }

  if (booking.otp !== otp) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { otpAttempts: { increment: 1 } },
    });
    throw new AppError(400, "INVALID_OTP", "Invalid OTP");
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      otpVerified: true,
      status: BookingStatus.ACTIVE,
      startedAt: new Date(),
    },
  });

  return { success: true };
}

export async function completeBooking(
  user: AuthUser,
  bookingId: string,
) {
  if (user.role !== UserRole.DRIVER) {
    throw new AppError(403, "FORBIDDEN", "Only drivers can complete bookings");
  }

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver) {
    throw new AppError(404, "DRIVER_NOT_FOUND", "Driver profile not found");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  if (booking.vehicleId !== driver.vehicleId) {
    throw new AppError(403, "FORBIDDEN", "Booking belongs to another vehicle");
  }

  if (booking.status !== BookingStatus.ACTIVE) {
    throw new AppError(400, "INVALID_STATE", "Booking is not active");
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETED,
    },
  });

  return { success: true };
}

export async function reportVehicleIssue(user: AuthUser) {
  assertDriver(user);

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver || !driver.vehicleId) {
    throw new AppError(404, "NOT_FOUND", "No assigned vehicle found");
  }

  await prisma.vehicle.update({
    where: { id: driver.vehicleId },
    data: {
      status: "MAINTENANCE",
    },
  });

  return { success: true };
}
