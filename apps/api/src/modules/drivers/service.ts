import { hash } from "bcryptjs";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import {
  BookingStatus,
  Prisma,
  UserRole,
  VehicleStatus,
  prisma,
} from "@society-ev/db";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";

const terminalBookingStatuses = [
  BookingStatus.CANCELLED,
  BookingStatus.COMPLETED,
] as const;

const preStartBookingStatuses = [
  BookingStatus.BOOKED,
  BookingStatus.DRIVER_ASSIGNED,
  BookingStatus.OTP_PENDING,
  BookingStatus.REASSIGNED,
  BookingStatus.AT_RISK,
] as const;

const vehicleSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  hourlyRate: true,
  status: true,
  isReserve: true,
  maintenanceReason: true,
  expectedReturnDate: true,
} satisfies Prisma.VehicleSelect;

const driverSelect = {
  id: true,
  societyId: true,
  fullName: true,
  phoneNumber: true,
  email: true,
  licenseNumber: true,
  isActive: true,
  vehicleId: true,
  createdAt: true,
  updatedAt: true,
  vehicle: { select: vehicleSelect },
} satisfies Prisma.DriverSelect;

const driverBookingSelect = {
  id: true,
  societyId: true,
  vehicleId: true,
  flatId: true,
  userId: true,
  quotaYear: true,
  quotaWeek: true,
  startTime: true,
  endTime: true,
  durationMinutes: true,
  status: true,
  actualRideStartTime: true,
  actualEndTime: true,
  startedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  driverId: true,
  reassignedVehicleId: true,
  reassignedAt: true,
  reassignedReason: true,
  vehicle: { select: vehicleSelect },
  reassignedVehicle: { select: vehicleSelect },
  flat: {
    select: {
      id: true,
      number: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
} satisfies Prisma.BookingSelect;

type DriverBooking = Prisma.BookingGetPayload<{
  select: typeof driverBookingSelect;
}>;

export type DriverCreateInput = {
  fullName: string;
  phoneNumber: string;
  email?: string;
  licenseNumber: string;
  password?: string;
  isActive?: boolean;
  vehicleId?: string;
};

export type DriverUpdateInput = Partial<DriverCreateInput>;

function assertAdmin(user: AuthUser) {
  if (user.role !== UserRole.ADMIN) {
    throw new AppError(403, "FORBIDDEN", "Only admins can manage drivers");
  }
}

function normalizeEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function validatedPassword(password: string | undefined, required: boolean) {
  if (!password && !required) {
    return undefined;
  }

  if (!password || password.length < 8) {
    throw new AppError(
      422,
      "INVALID_PASSWORD",
      "Driver password must be at least 8 characters",
    );
  }

  return password;
}

function toDriverBooking(booking: DriverBooking) {
  return {
    ...booking,
    effectiveVehicle: booking.reassignedVehicle ?? booking.vehicle,
  };
}

function societyDayBounds(now: Date, timezone: string) {
  const localStart = startOfDay(toZonedTime(now, timezone));
  return {
    start: fromZonedTime(localStart, timezone),
    end: fromZonedTime(addDays(localStart, 1), timezone),
  };
}

async function driverProfileForUser(user: AuthUser) {
  const account = await prisma.user.findFirst({
    where: {
      id: user.id,
      societyId: user.societyId,
      role: UserRole.DRIVER,
      isActive: true,
    },
    select: {
      phone: true,
      society: { select: { timezone: true } },
    },
  });

  if (!account?.phone) {
    throw new AppError(404, "NOT_FOUND", "Active driver profile not found");
  }

  const profile = await prisma.driver.findFirst({
    where: {
      societyId: user.societyId,
      phoneNumber: account.phone,
      isActive: true,
    },
    select: driverSelect,
  });

  if (!profile) {
    throw new AppError(404, "NOT_FOUND", "Active driver profile not found");
  }

  return { profile, timezone: account.society.timezone };
}

export async function listDrivers(user: AuthUser, includeInactive = false) {
  assertAdmin(user);

  const where: Prisma.DriverWhereInput = { societyId: user.societyId };
  if (!includeInactive) {
    where.isActive = true;
  }

  const drivers = await prisma.driver.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: driverSelect,
  });

  const now = new Date();
  const driverIds = drivers.map((driver) => driver.id);
  const upcomingCounts = driverIds.length
    ? await prisma.booking.groupBy({
        by: ["driverId"],
        where: {
          societyId: user.societyId,
          driverId: { in: driverIds },
          status: { notIn: [...terminalBookingStatuses] },
          startTime: { gt: now },
        },
        _count: true,
      })
    : [];

  const countsMap = new Map(
    upcomingCounts.map((count) => [count.driverId, count._count]),
  );

  return drivers.map((driver) => ({
    ...driver,
    upcomingTripsCount: countsMap.get(driver.id) || 0,
  }));
}

export async function createDriver(user: AuthUser, data: DriverCreateInput) {
  assertAdmin(user);

  const password = validatedPassword(data.password, true)!;
  const passwordHash = await hash(password, 12);
  const phoneNumber = data.phoneNumber.trim();
  const email = normalizeEmail(data.email);
  const vehicleId = data.vehicleId?.trim() || null;
  const isActive = data.isActive ?? true;

  return prisma.$transaction(async (tx) => {
    if (vehicleId) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, societyId: user.societyId },
        select: { id: true },
      });
      if (!vehicle) {
        throw new AppError(404, "NOT_FOUND", "Vehicle not found");
      }
    }

    const existingAccount = await tx.user.findUnique({
      where: { phone: phoneNumber },
      select: { id: true, societyId: true, role: true },
    });

    if (
      existingAccount &&
      (existingAccount.societyId !== user.societyId ||
        existingAccount.role !== UserRole.DRIVER)
    ) {
      throw new AppError(
        409,
        "LOGIN_CONFLICT",
        "This phone number already belongs to another account",
      );
    }

    if (existingAccount) {
      await tx.user.update({
        where: { id: existingAccount.id },
        data: {
          name: data.fullName.trim(),
          email,
          passwordHash,
          isActive,
        },
      });
    } else {
      await tx.user.create({
        data: {
          societyId: user.societyId,
          role: UserRole.DRIVER,
          name: data.fullName.trim(),
          phone: phoneNumber,
          email,
          passwordHash,
          isActive,
        },
      });
    }

    return tx.driver.create({
      data: {
        societyId: user.societyId,
        fullName: data.fullName.trim(),
        phoneNumber,
        email,
        licenseNumber: data.licenseNumber.trim(),
        isActive,
        vehicleId,
      },
      select: driverSelect,
    });
  });
}

export async function updateDriver(
  user: AuthUser,
  driverId: string,
  data: DriverUpdateInput,
) {
  assertAdmin(user);

  const password = validatedPassword(data.password, false);
  const passwordHash = password ? await hash(password, 12) : undefined;

  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.findFirst({
      where: { id: driverId, societyId: user.societyId },
    });
    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    const vehicleId =
      data.vehicleId === undefined ? undefined : data.vehicleId.trim() || null;
    if (vehicleId) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, societyId: user.societyId },
        select: { id: true },
      });
      if (!vehicle) {
        throw new AppError(404, "NOT_FOUND", "Vehicle not found");
      }
    }

    const account = await tx.user.findFirst({
      where: {
        societyId: user.societyId,
        role: UserRole.DRIVER,
        phone: driver.phoneNumber,
      },
      select: { id: true },
    });

    if (!account && !passwordHash) {
      throw new AppError(
        409,
        "LOGIN_ACCOUNT_MISSING",
        "A password is required to provision this driver's login account",
      );
    }

    const fullName = data.fullName?.trim();
    const phoneNumber = data.phoneNumber?.trim();
    const email =
      data.email === undefined ? undefined : normalizeEmail(data.email);
    const isActive = data.isActive;

    if (account) {
      await tx.user.update({
        where: { id: account.id },
        data: {
          name: fullName,
          phone: phoneNumber,
          email,
          passwordHash,
          isActive,
        },
      });
    } else {
      await tx.user.create({
        data: {
          societyId: user.societyId,
          role: UserRole.DRIVER,
          name: fullName ?? driver.fullName,
          phone: phoneNumber ?? driver.phoneNumber,
          email: email === undefined ? driver.email : email,
          passwordHash: passwordHash!,
          isActive: isActive ?? driver.isActive,
        },
      });
    }

    return tx.driver.update({
      where: { id: driver.id },
      data: {
        fullName,
        phoneNumber,
        email,
        licenseNumber: data.licenseNumber?.trim(),
        isActive,
        vehicleId,
      },
      select: driverSelect,
    });
  });
}

export async function getDriverDashboard(user: AuthUser, now = new Date()) {
  if (user.role !== UserRole.DRIVER) {
    throw new AppError(403, "FORBIDDEN", "Only drivers can view driver dashboard");
  }

  const { profile, timezone } = await driverProfileForUser(user);
  const day = societyDayBounds(now, timezone);

  const [today, upcoming] = await Promise.all([
    prisma.booking.findMany({
      where: {
        societyId: user.societyId,
        driverId: profile.id,
        startTime: { lt: day.end },
        status: { notIn: [...terminalBookingStatuses] },
      },
      select: driverBookingSelect,
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        societyId: user.societyId,
        driverId: profile.id,
        startTime: { gte: day.end },
        status: { notIn: [...terminalBookingStatuses] },
      },
      select: driverBookingSelect,
      orderBy: { startTime: "asc" },
    }),
  ]);

  return {
    vehicle: profile.vehicle,
    today: today.map(toDriverBooking),
    upcoming: upcoming.map(toDriverBooking),
  };
}

export async function getDriverHistory(user: AuthUser) {
  if (user.role !== UserRole.DRIVER) {
    throw new AppError(403, "FORBIDDEN", "Only drivers can view driver history");
  }

  const { profile } = await driverProfileForUser(user);
  const bookings = await prisma.booking.findMany({
    where: {
      societyId: user.societyId,
      driverId: profile.id,
      status: { in: [...terminalBookingStatuses] },
    },
    select: driverBookingSelect,
    orderBy: { startTime: "desc" },
    take: 50,
  });

  return bookings.map(toDriverBooking);
}

export async function reportAssignedVehicleIssue(
  user: AuthUser,
  bookingId: string,
) {
  if (user.role !== UserRole.DRIVER) {
    throw new AppError(403, "FORBIDDEN", "Only drivers can report vehicle issues");
  }

  const { profile: driver, timezone } = await driverProfileForUser(user);
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, societyId: user.societyId },
        select: {
          id: true,
          driverId: true,
          vehicleId: true,
          reassignedVehicleId: true,
          vehicle: { select: vehicleSelect },
          reassignedVehicle: { select: vehicleSelect },
        },
      });

      if (!booking) {
        throw new AppError(404, "NOT_FOUND", "Booking not found");
      }
      if (booking.driverId !== driver.id) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "This booking is assigned to another driver",
        );
      }

      const claimed = await tx.booking.updateMany({
        where: {
          id: booking.id,
          societyId: user.societyId,
          driverId: driver.id,
          status: { in: [...preStartBookingStatuses] },
        },
        data: {
          status: BookingStatus.AT_RISK,
          otp: null,
          otpGeneratedAt: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpVerified: false,
          otpVerifiedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "INVALID_STATUS",
          "Vehicle issues can only be reported before the ride starts",
        );
      }

      const vehicle = booking.reassignedVehicle ?? booking.vehicle;
      const marked = await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          societyId: user.societyId,
          status: VehicleStatus.AVAILABLE,
        },
        data: {
          status: VehicleStatus.BREAKDOWN,
          maintenanceReason: `Breakdown reported by driver ${driver.fullName}`,
          expectedReturnDate: null,
        },
      });
      if (marked.count !== 1) {
        throw new AppError(
          409,
          "VEHICLE_UNAVAILABLE",
          "The effective vehicle is already unavailable",
        );
      }

      const affectedBookings = await tx.booking.findMany({
        where: {
          societyId: user.societyId,
          status: { in: [...preStartBookingStatuses] },
          AND: [
            {
              OR: [
                { reassignedVehicleId: vehicle.id },
                { reassignedVehicleId: null, vehicleId: vehicle.id },
              ],
            },
            {
              OR: [{ id: booking.id }, { startTime: { gt: now } }],
            },
          ],
        },
        select: { id: true, userId: true, startTime: true },
      });

      if (affectedBookings.length) {
        await tx.booking.updateMany({
          where: { id: { in: affectedBookings.map(({ id }) => id) } },
          data: {
            status: BookingStatus.AT_RISK,
            otp: null,
            otpGeneratedAt: null,
            otpExpiresAt: null,
            otpAttempts: 0,
            otpVerified: false,
            otpVerifiedAt: null,
          },
        });
        await tx.notification.createMany({
          data: affectedBookings.map((affected) => ({
            userId: affected.userId,
            title: "Booking Impacted",
            message: `Your assigned EV (${vehicle.name}) has a reported breakdown. Your booking on ${affected.startTime.toLocaleDateString("en-IN", { timeZone: timezone })} may be impacted.`,
          })),
        });
      }

      const updatedVehicle = await tx.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
        select: vehicleSelect,
      });

      return {
        success: true,
        bookingId: booking.id,
        affectedBookingsCount: affectedBookings.length,
        vehicle: updatedVehicle,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}
