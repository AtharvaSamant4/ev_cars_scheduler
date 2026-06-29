import { prisma, BookingStatus } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

export async function listDrivers(user: AuthUser, includeInactive = false) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view drivers");
  }

  const where: any = { societyId: user.societyId };
  if (!includeInactive) {
    where.isActive = true;
  }

  const drivers = await prisma.driver.findMany({
    where,
    orderBy: { fullName: "asc" },
    include: {
      vehicle: true,
    }
  });

  const now = new Date();
  const activeVehicleIds = drivers.map(d => d.vehicleId).filter(Boolean) as string[];

  const upcomingCounts = await prisma.booking.groupBy({
    by: ["vehicleId"],
    where: {
      vehicleId: { in: activeVehicleIds },
      status: { in: [BookingStatus.BOOKED, BookingStatus.ACTIVE] },
      startTime: { gt: now },
    },
    _count: true,
  });

  const countsMap = new Map(upcomingCounts.map(c => [c.vehicleId, c._count]));

  return drivers.map(driver => ({
    ...driver,
    upcomingTripsCount: driver.vehicleId ? (countsMap.get(driver.vehicleId) || 0) : 0,
  }));
}

export async function createDriver(
  user: AuthUser,
  data: { fullName: string; phoneNumber: string; email?: string; licenseNumber: string; isActive?: boolean; vehicleId?: string }
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can create drivers");
  }

  return await prisma.driver.create({
    data: {
      societyId: user.societyId,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      email: data.email,
      licenseNumber: data.licenseNumber,
      isActive: data.isActive,
      vehicleId: data.vehicleId || null,
    },
  });
}

export async function updateDriver(
  user: AuthUser,
  driverId: string,
  data: { fullName?: string; phoneNumber?: string; email?: string; licenseNumber?: string; isActive?: boolean; vehicleId?: string }
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can update drivers");
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver || driver.societyId !== user.societyId) {
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  }

  return await prisma.driver.update({
    where: { id: driverId },
    data: {
      ...data,
      vehicleId: data.vehicleId === "" ? null : data.vehicleId,
    },
  });
}

export async function getDriverDashboard(user: AuthUser) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can view driver dashboard");
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser || !fullUser.phone) {
    throw new AppError(404, "NOT_FOUND", "User profile not found or phone number missing");
  }

  const driverProfile = await prisma.driver.findFirst({
    where: { phoneNumber: fullUser.phone },
    include: {
      vehicle: true,
    },
  });

  if (!driverProfile) {
    throw new AppError(404, "NOT_FOUND", "Driver profile not found");
  }

  if (!driverProfile.vehicleId) {
    return {
      vehicle: null,
      today: [],
      upcoming: [],
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [today, upcoming] = await Promise.all([
    prisma.booking.findMany({
      where: {
        societyId: user.societyId,
        vehicleId: driverProfile.vehicleId,
        startTime: {
          gte: todayStart,
          lte: todayEnd,
        },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      },
      include: {
        flat: true,
        user: true,
      },
      orderBy: {
        startTime: "asc",
      },
    }),
    prisma.booking.findMany({
      where: {
        societyId: user.societyId,
        vehicleId: driverProfile.vehicleId,
        startTime: {
          gt: todayEnd,
        },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      },
      include: {
        flat: true,
        user: true,
      },
      orderBy: {
        startTime: "asc",
      },
    }),
  ]);

  return {
    vehicle: driverProfile.vehicle,
    today,
    upcoming,
  };
}

export async function getDriverHistory(user: AuthUser) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can view driver history");
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser || !fullUser.phone) {
    throw new AppError(404, "NOT_FOUND", "User profile not found or phone number missing");
  }

  const driverProfile = await prisma.driver.findFirst({
    where: { phoneNumber: fullUser.phone }
  });

  if (!driverProfile) {
    throw new AppError(404, "NOT_FOUND", "Driver profile not found");
  }

  if (!driverProfile.vehicleId) {
    return [];
  }

  return await prisma.booking.findMany({
    where: {
      societyId: user.societyId,
      vehicleId: driverProfile.vehicleId,
      OR: [
        { startTime: { lt: new Date() } },
        { status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] } }
      ]
    },
    include: {
      flat: true,
      user: true,
    },
    orderBy: {
      startTime: "desc",
    },
    take: 50,
  });
}
