import { prisma, BookingStatus, Prisma } from "@society-ev/db";
import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

async function driverProfileForUser(user: AuthUser, includeVehicle = false) {
  const account = await prisma.user.findFirst({
    where: {
      id: user.id,
      societyId: user.societyId,
      role: "DRIVER",
      isActive: true,
    },
    select: { phone: true },
  });

  if (!account?.phone) {
    throw new AppError(404, "NOT_FOUND", "Driver account phone number is missing");
  }

  const profile = await prisma.driver.findFirst({
    where: {
      societyId: user.societyId,
      phoneNumber: account.phone,
      isActive: true,
    },
    include: { vehicle: includeVehicle },
  });

  if (!profile) {
    throw new AppError(404, "NOT_FOUND", "Active driver profile not found");
  }

  return profile;
}

export async function listDrivers(user: AuthUser, includeInactive = false) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can view drivers");
  }

  const where: Prisma.DriverWhereInput = { societyId: user.societyId };
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
  const driverIds = drivers.map((driver) => driver.id);

  const upcomingCounts = await prisma.booking.groupBy({
    by: ["driverId"],
    where: {
      societyId: user.societyId,
      driverId: { in: driverIds },
      status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      startTime: { gt: now },
    },
    _count: true,
  });

  const countsMap = new Map(upcomingCounts.map((count) => [count.driverId, count._count]));

  return drivers.map(driver => ({
    ...driver,
    upcomingTripsCount: countsMap.get(driver.id) || 0,
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

  const driverProfile = await driverProfileForUser(user, true);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [today, upcoming] = await Promise.all([
    prisma.booking.findMany({
      where: {
        societyId: user.societyId,
        driverId: driverProfile.id,
        startTime: {
          gte: todayStart,
          lte: todayEnd,
        },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      },
      include: {
        vehicle: true,
        reassignedVehicle: true,
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
        driverId: driverProfile.id,
        startTime: {
          gt: todayEnd,
        },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
      },
      include: {
        vehicle: true,
        reassignedVehicle: true,
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
    today: today.map((booking) => ({
      ...booking,
      effectiveVehicle: booking.reassignedVehicle ?? booking.vehicle,
    })),
    upcoming: upcoming.map((booking) => ({
      ...booking,
      effectiveVehicle: booking.reassignedVehicle ?? booking.vehicle,
    })),
  };
}

export async function getDriverHistory(user: AuthUser) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can view driver history");
  }

  const driverProfile = await driverProfileForUser(user);

  const bookings = await prisma.booking.findMany({
    where: {
      societyId: user.societyId,
      driverId: driverProfile.id,
      OR: [
        { startTime: { lt: new Date() } },
        { status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED] } }
      ]
    },
    include: {
      vehicle: true,
      reassignedVehicle: true,
      flat: true,
      user: true,
    },
    orderBy: {
      startTime: "desc",
    },
    take: 50,
  });

  return bookings.map((booking) => ({
    ...booking,
    effectiveVehicle: booking.reassignedVehicle ?? booking.vehicle,
  }));
}

export async function reportAssignedVehicleIssue(user: AuthUser) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can report vehicle issues");
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phone: true },
  });
  if (!fullUser?.phone) {
    throw new AppError(404, "NOT_FOUND", "Driver account phone number is missing");
  }

  const driver = await prisma.driver.findFirst({
    where: {
      societyId: user.societyId,
      phoneNumber: fullUser.phone,
      isActive: true,
    },
    include: { vehicle: true },
  });
  if (!driver?.vehicle) {
    throw new AppError(409, "NO_ASSIGNED_VEHICLE", "No vehicle is assigned to this driver");
  }

  const now = new Date();
  const vehicle = driver.vehicle;

  return prisma.$transaction(async (tx) => {
    const updatedVehicle = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: {
        status: "BREAKDOWN",
        maintenanceReason: `Breakdown reported by driver ${driver.fullName}`,
      },
    });

    const affectedBookings = await tx.booking.findMany({
      where: {
        societyId: user.societyId,
        OR: [
          { vehicleId: vehicle.id },
          { reassignedVehicleId: vehicle.id },
        ],
        startTime: { gt: now },
        status: "BOOKED",
      },
      select: { id: true, userId: true, startTime: true },
    });

    if (affectedBookings.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: affectedBookings.map((booking) => booking.id) } },
        data: { status: "AT_RISK" },
      });
      await tx.notification.createMany({
        data: affectedBookings.map((booking) => ({
          userId: booking.userId,
          title: "Booking Impacted",
          message: `Your assigned EV (${vehicle.name}) has a reported breakdown. Your booking on ${booking.startTime.toLocaleDateString()} may be impacted.`,
        })),
      });
    }

    return { success: true, vehicle: updatedVehicle };
  });
}
