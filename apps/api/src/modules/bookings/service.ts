import {
  BookingStatus,
  Prisma,
  prisma,
  UserRole,
  TransactionType,
  ReassignReason,
} from "@society-ev/db";
import { toZonedTime } from "date-fns-tz";

import type { AuthUser } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { AppError } from "@/src/lib/errors";
import { paginated, pagination } from "@/src/lib/pagination";

type NormalizedRange = {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  quotaYear: number;
  quotaWeek: number;
};

type LockedQuota = {
  id: string;
  allocatedMinutes: number;
  usedMinutes: number;
};

type LockedVehicle = {
  id: string;
  hourlyRate: number;
};

export function residentFlatId(user: AuthUser) {
  if (user.role !== UserRole.RESIDENT || !user.flatId) {
    throw new AppError(403, "FORBIDDEN", "A resident account is required");
  }

  return user.flatId;
}

async function societyTimezone(societyId: string) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { timezone: true },
  });

  if (!society) {
    throw new AppError(404, "NOT_FOUND", "Society not found");
  }

  return society.timezone;
}

export function normalizeBookingRange(
  startValue: string,
  endValue: string,
  timezone: string,
  userRole?: UserRole,
  now = new Date(),
): NormalizedRange {
  const startTime = new Date(startValue);
  const endTime = new Date(endValue);
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60_000;

  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    durationMinutes <= 0
  ) {
    throw new AppError(
      400,
      "INVALID_TIME_RANGE",
      "End time must be after start time",
    );
  }

  if (startTime <= now) {
    throw new AppError(
      400,
      "INVALID_TIME_RANGE",
      "Bookings must start in the future",
    );
  }

  if (userRole !== UserRole.ADMIN) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (startTime.getTime() - now.getTime() > sevenDaysMs) {
      throw new AppError(
        400,
        "INVALID_TIME_RANGE",
        "Bookings can only be made up to 7 days in advance.",
      );
    }
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 60 ||
    durationMinutes > 24 * 60
  ) {
    throw new AppError(
      400,
      "INVALID_TIME_RANGE",
      "Bookings must last between 1 and 24 hours",
    );
  }

  const localStart = toZonedTime(startTime, timezone);
  const localEnd = toZonedTime(endTime, timezone);
  const isHalfHourBoundary = (date: Date) =>
    date.getMinutes() % 30 === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  if (!isHalfHourBoundary(localStart) || !isHalfHourBoundary(localEnd)) {
    throw new AppError(
      400,
      "INVALID_TIME_RANGE",
      "Start and end times must use 30-minute boundaries",
    );
  }

  if (localStart.getFullYear() !== localEnd.getFullYear()) {
    throw new AppError(
      400,
      "INVALID_TIME_RANGE",
      "A booking cannot cross a calendar-year boundary",
    );
  }

  const isoDate = getIsoWeek(localStart);

  return {
    startTime,
    endTime,
    durationMinutes,
    quotaYear: isoDate.year,
    quotaWeek: isoDate.week,
  };
}

function quotaResponse(quota: {
  year: number;
  allocatedMinutes: number;
  usedMinutes: number;
}) {
  return {
    ...quota,
    remainingMinutes: quota.allocatedMinutes - quota.usedMinutes,
  };
}

export function bookingResponse<
  T extends {
    status: BookingStatus;
    endTime: Date;
  },
>(booking: T) {
  return {
    ...booking,
    effectiveStatus:
      booking.status === BookingStatus.BOOKED && booking.endTime <= new Date()
        ? BookingStatus.COMPLETED
        : booking.status,
  };
}

function isRetryableTransactionError(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Prisma.PrismaClientKnownRequestError) {
      if (current.code === "P2034") {
        return true;
      }
    }

    if (current instanceof Error) {
      if (
        current.message.includes("TransactionWriteConflict") ||
        current.message.includes("Booking_vehicle_no_overlap") ||
        current.message.includes("23P01") ||
        current.message.includes("40001")
      ) {
        return true;
      }
    }

    if (typeof current === "object") {
      const candidate = current as {
        cause?: unknown;
        code?: unknown;
        kind?: unknown;
        originalCode?: unknown;
      };

      if (
        candidate.code === "40001" ||
        candidate.originalCode === "40001" ||
        candidate.kind === "TransactionWriteConflict"
      ) {
        return true;
      }

      current = candidate.cause;
      continue;
    }

    break;
  }

  return false;
}

async function serializable<T>(operation: () => Promise<T>) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) {
        throw error;
      }

      const backoffMs = attempt * 25 + Math.floor(Math.random() * 25);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new AppError(409, "BOOKING_CONFLICT", "Please retry the booking");
}

export async function checkAvailability(
  user: AuthUser,
  startValue: string,
  endValue: string,
) {
  const flatId = residentFlatId(user);
  const timezone = await societyTimezone(user.societyId);
  const range = normalizeBookingRange(startValue, endValue, timezone, user.role);

  const [quota, availableVehicles] = await Promise.all([
    prisma.flatQuota.findUnique({
      where: {
        flatId_year_weekNumber: {
          flatId,
          year: range.quotaYear,
          weekNumber: range.quotaWeek,
        },
      },
    }),
    prisma.vehicle.findMany({
      where: {
        societyId: user.societyId,
        status: "AVAILABLE",
        isReserve: false,
        bookings: {
          none: {
            status: { not: BookingStatus.CANCELLED },
            startTime: { lt: new Date(range.endTime.getTime() + 30 * 60000) },
            endTime: { gt: new Date(range.startTime.getTime() - 30 * 60000) },
          },
        },
      },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const remainingMinutes = quota
    ? quota.allocatedMinutes - quota.usedMinutes
    : 0;
  const availableVehicleCount = availableVehicles.length;

  return {
    available:
      availableVehicleCount > 0 &&
      remainingMinutes >= range.durationMinutes,
    availableVehicleCount,
    availableVehicles,
    durationMinutes: range.durationMinutes,
    quota: {
      year: range.quotaYear,
      allocatedMinutes: quota?.allocatedMinutes ?? 0,
      usedMinutes: quota?.usedMinutes ?? 0,
      remainingMinutes,
      sufficient: remainingMinutes >= range.durationMinutes,
    },
  };
}

export async function createBooking(
  user: AuthUser,
  startValue: string,
  endValue: string,
  vehicleId: string,
) {
  const flatId = residentFlatId(user);
  const timezone = await societyTimezone(user.societyId);
  const range = normalizeBookingRange(startValue, endValue, timezone, user.role);

  return serializable(() =>
    prisma.$transaction(
      async (tx) => {
        const quotaRows = await tx.$queryRaw<LockedQuota[]>`
          SELECT "id", "allocatedMinutes", "usedMinutes"
          FROM "FlatQuota"
          WHERE "flatId" = ${flatId}::uuid
            AND "year" = ${range.quotaYear}
            AND "weekNumber" = ${range.quotaWeek}
          FOR UPDATE
        `;
        const quota = quotaRows[0];

        if (!quota) {
          throw new AppError(
            409,
            "QUOTA_NOT_ALLOCATED",
            `No quota is allocated for ${range.quotaYear}`,
          );
        }

        if (
          quota.allocatedMinutes - quota.usedMinutes <
          range.durationMinutes
        ) {
          throw new AppError(
            409,
            "QUOTA_EXCEEDED",
            "The flat does not have enough remaining quota",
          );
        }

        const vehicles = await tx.$queryRaw<LockedVehicle[]>`
          SELECT id, "hourlyRate"
          FROM "Vehicle" 
          WHERE "societyId" = ${user.societyId}::uuid 
            AND "id" = ${vehicleId}::uuid
            AND "status" = 'AVAILABLE'
            AND "isReserve" = false
            AND NOT EXISTS (
              SELECT 1 
              FROM "Booking" 
              WHERE "vehicleId" = ${vehicleId}::uuid
                AND "status" != 'CANCELLED'
                AND "startTime" < ${new Date(range.endTime.getTime() + 30 * 60000)}
                AND "endTime" > ${new Date(range.startTime.getTime() - 30 * 60000)}
            )
          FOR UPDATE
        `;
        const vehicle = vehicles[0];

        if (!vehicle) {
          throw new AppError(
            409,
            "NO_VEHICLE_AVAILABLE",
            "No vehicle is available for the selected slot",
          );
        }

        const bookingCost = Math.round((range.durationMinutes / 60) * vehicle.hourlyRate);

        const wallets = await tx.$queryRaw<{id: string, balance: number}[]>`
          SELECT "id", "balance" FROM "Wallet" WHERE "userId" = ${user.id}::uuid FOR UPDATE
        `;
        const wallet = wallets[0];

        if (!wallet || wallet.balance < bookingCost) {
          throw new AppError(400, "INSUFFICIENT_BALANCE", "Insufficient wallet balance.");
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const booking = await tx.booking.create({
          data: {
            societyId: user.societyId,
            vehicleId: vehicle.id,
            flatId,
            userId: user.id,
            quotaYear: range.quotaYear,
            quotaWeek: range.quotaWeek,
            startTime: range.startTime,
            endTime: range.endTime,
            durationMinutes: range.durationMinutes,
            otp,
          },
          include: {
            vehicle: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        });

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { decrement: bookingCost },
            transactions: {
              create: {
                amount: bookingCost,
                type: TransactionType.BOOKING_DEBIT,
                description: `Booking deduction for ${range.durationMinutes / 60} hours`,
                bookingId: booking.id,
              },
            },
          },
        });

        const updatedQuota = await tx.flatQuota.update({
          where: { id: quota.id },
          data: {
            usedMinutes: { increment: range.durationMinutes },
          },
        });

        return {
          booking: bookingResponse(booking),
          quota: quotaResponse(updatedQuota),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    ),
  );
}

export async function listResidentBookings(
  user: AuthUser,
  view: "upcoming" | "history",
  page: number,
  pageSize: number,
) {
  const flatId = residentFlatId(user);
  const now = new Date();
  const where: Prisma.BookingWhereInput = {
    flatId,
    ...(view === "upcoming"
      ? {
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
          endTime: { gt: now },
        }
      : {
          OR: [
            { status: BookingStatus.CANCELLED },
            { status: BookingStatus.COMPLETED },
            { endTime: { lte: now } },
          ],
        }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: {
        vehicle: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
          },
        },
      },
      orderBy:
        view === "upcoming"
          ? { startTime: "asc" }
          : { startTime: "desc" },
      ...pagination(page, pageSize),
    }),
    prisma.booking.count({ where }),
  ]);

  return paginated(
    items.map((booking) => bookingResponse(booking)),
    total,
    page,
    pageSize,
  );
}

export async function getResidentBooking(user: AuthUser, bookingId: string) {
  const flatId = residentFlatId(user);
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      flatId,
    },
    include: {
      vehicle: {
        select: {
          id: true,
          name: true,
          registrationNumber: true,
        },
      },
      driver: true,
      invoice: true,
    },
  });

  if (!booking) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  return bookingResponse(booking);
}

export async function cancelBooking(user: AuthUser, bookingId: string) {
  const flatId = residentFlatId(user);

  return serializable(() =>
    prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "Booking"
          WHERE "id" = ${bookingId}::uuid
          FOR UPDATE
        `;

        if (!rows[0]) {
          throw new AppError(404, "NOT_FOUND", "Booking not found");
        }

        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            vehicle: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        });

        if (!booking || booking.flatId !== flatId) {
          throw new AppError(404, "NOT_FOUND", "Booking not found");
        }

        if (
          booking.status !== BookingStatus.BOOKED ||
          booking.startTime <= new Date()
        ) {
          throw new AppError(
            409,
            "BOOKING_NOT_CANCELLABLE",
            "Only future booked reservations can be cancelled",
          );
        }

        const cancelled = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: new Date(),
          },
          include: {
            vehicle: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        });

        const transactions = await tx.$queryRaw<{amount: number}[]>`
          SELECT "amount" FROM "WalletTransaction"
          WHERE "bookingId" = ${booking.id}::uuid AND "type" = 'BOOKING_DEBIT'
        `;
        const deduction = transactions[0]?.amount ?? 0;

        let wallet = await tx.wallet.findUnique({
          where: { userId: booking.userId },
        });

        if (wallet && deduction > 0) {
          const rule = await tx.penaltyRule.findUnique({
            where: {
              societyId_code: {
                societyId: booking.societyId,
                code: "CANCELLATION",
              },
            },
          });
          
          const penaltyAmount = rule?.isActive ? rule.amount : 0;

          const transactionsToCreate: any[] = [
            {
              amount: deduction,
              type: TransactionType.REFUND,
              description: `Refund for cancelled booking on ${booking.startTime.toDateString()}`,
              bookingId: booking.id,
            }
          ];

          if (penaltyAmount > 0) {
            transactionsToCreate.push({
              amount: penaltyAmount,
              type: TransactionType.PENALTY,
              description: `Cancellation penalty`,
              bookingId: booking.id,
            });
          }

          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: deduction - penaltyAmount },
              transactions: {
                create: transactionsToCreate,
              },
            },
          });
        }

        const existingQuota = await tx.flatQuota.findUnique({
          where: {
            flatId_year_weekNumber: {
              flatId: booking.flatId,
              year: booking.quotaYear,
              weekNumber: booking.quotaWeek,
            },
          },
        });

        let updatedQuota;
        if (existingQuota) {
          updatedQuota = await tx.flatQuota.update({
            where: { id: existingQuota.id },
            data: {
              usedMinutes: { decrement: booking.durationMinutes },
            },
          });
        } else {
          updatedQuota = {
            year: booking.quotaYear,
            allocatedMinutes: 0,
            usedMinutes: 0,
          };
        }

        return {
          booking: bookingResponse(cancelled),
          quota: quotaResponse(updatedQuota),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    ),
  );
}

export async function reassignBooking(
  user: AuthUser,
  bookingId: string,
  reserveVehicleId: string,
  reason: ReassignReason,
) {
  return serializable(() =>
    prisma.$transaction(
      async (tx) => {
        const bookings = await tx.$queryRaw<any[]>`
          SELECT * FROM "Booking"
          WHERE "id" = ${bookingId}::uuid
            AND "societyId" = ${user.societyId}::uuid
          FOR UPDATE
        `;
        const booking = bookings[0];

        if (!booking) {
          throw new AppError(404, "NOT_FOUND", "Booking not found");
        }

        if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
          throw new AppError(409, "INVALID_STATUS", "Booking is no longer active");
        }

        const vehicles = await tx.$queryRaw<LockedVehicle[]>`
          SELECT id 
          FROM "Vehicle" 
          WHERE "societyId" = ${user.societyId}::uuid 
            AND "id" = ${reserveVehicleId}::uuid
            AND "status" = 'AVAILABLE'
            AND "isReserve" = true
            AND NOT EXISTS (
              SELECT 1 
              FROM "Booking" 
              WHERE ("vehicleId" = ${reserveVehicleId}::uuid OR "reassignedVehicleId" = ${reserveVehicleId}::uuid)
                AND "status" != 'CANCELLED'
                AND "startTime" < ${new Date(booking.endTime.getTime() + 30 * 60000)}
                AND "endTime" > ${new Date(booking.startTime.getTime() - 30 * 60000)}
            )
          FOR UPDATE
        `;
        const vehicle = vehicles[0];

        if (!vehicle) {
          throw new AppError(
            409,
            "NO_VEHICLE_AVAILABLE",
            "Reserve vehicle is not available for the selected slot",
          );
        }

        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: booking.status === "AT_RISK" ? "BOOKED" : booking.status,
            reassignedVehicleId: vehicle.id,
            reassignedReason: reason,
            reassignedAt: new Date(),
            reassignedByUserId: user.id,
          },
          include: {
            vehicle: {
              select: { id: true, name: true, registrationNumber: true },
            },
            reassignedVehicle: {
              select: { id: true, name: true, registrationNumber: true },
            },
            user: { select: { id: true, name: true, email: true, phone: true } },
            flat: { select: { id: true, number: true } },
          },
        });

        await tx.reassignmentLog.create({
          data: {
            bookingId: booking.id,
            originalVehicleId: booking.reassignedVehicleId || booking.vehicleId,
            newVehicleId: vehicle.id,
            reason: reason,
            reassignedByUserId: user.id,
          }
        });

        await tx.notification.create({
          data: {
            userId: booking.userId,
            title: "Booking Reassigned",
            message: `Your booking on ${booking.startTime.toLocaleDateString()} has been reassigned to ${vehicle.name}.`,
          }
        });

        return bookingResponse(updated);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    )
  );
}

export async function assignDriver(
  user: AuthUser,
  bookingId: string,
  driverId: string
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only admins can assign drivers");
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
  });

  if (!driver || driver.societyId !== user.societyId) {
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  }

  if (!driver.isActive) {
    throw new AppError(400, "INACTIVE", "Cannot assign an inactive driver");
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking || booking.societyId !== user.societyId) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
    throw new AppError(409, "INVALID_STATUS", "Booking is no longer active");
  }

  const updatedStatus = booking.status === "BOOKED" ? "DRIVER_ASSIGNED" : booking.status;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { 
      driverId,
      status: updatedStatus 
    },
    include: {
      vehicle: true,
      driver: true,
      user: true,
      flat: true,
    },
  });

  return bookingResponse(updated);
}

export async function driverArrive(user: AuthUser, bookingId: string) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can trigger arrival");
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser || !fullUser.phone) {
    throw new AppError(404, "NOT_FOUND", "User profile not found");
  }

  const driver = await prisma.driver.findFirst({
    where: { phoneNumber: fullUser.phone },
  });

  if (!driver) {
    throw new AppError(404, "NOT_FOUND", "Driver profile not found");
  }

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId, societyId: user.societyId },
    });

    if (!booking) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }

    if (booking.vehicleId !== driver.vehicleId) {
      throw new AppError(403, "FORBIDDEN", "You are not assigned to this vehicle");
    }

    if (booking.status !== "DRIVER_ASSIGNED" && booking.status !== "BOOKED") {
      throw new AppError(400, "INVALID_STATUS", "Booking is not ready for arrival");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60000); // 15 mins

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "OTP_PENDING",
        otp,
        otpGeneratedAt: now,
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        otpVerified: false,
      },
      include: {
        vehicle: true,
        driver: true,
        user: true,
        flat: true,
      },
    });

    return bookingResponse(updated);
  });
}

export async function verifyOtp(user: AuthUser, bookingId: string, otp: string) {
  if (user.role !== "DRIVER") {
    throw new AppError(403, "FORBIDDEN", "Only drivers can verify OTP");
  }

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser || !fullUser.phone) {
    throw new AppError(404, "NOT_FOUND", "User profile not found");
  }

  const driver = await prisma.driver.findFirst({
    where: { phoneNumber: fullUser.phone },
  });

  if (!driver) {
    throw new AppError(404, "NOT_FOUND", "Driver profile not found");
  }

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId, societyId: user.societyId },
    });

    if (!booking) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }

    if (booking.vehicleId !== driver.vehicleId) {
      throw new AppError(403, "FORBIDDEN", "You are not assigned to this vehicle");
    }

    if (booking.status !== "OTP_PENDING") {
      throw new AppError(400, "INVALID_STATUS", "Booking is not pending OTP verification");
    }

    if (booking.otpAttempts >= 5) {
      throw new AppError(400, "MAX_ATTEMPTS", "Maximum OTP attempts exceeded");
    }

    const now = new Date();

    if (!booking.otpExpiresAt || now > booking.otpExpiresAt) {
      throw new AppError(400, "OTP_EXPIRED", "OTP has expired");
    }

    if (booking.otp !== otp) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new AppError(400, "INVALID_OTP", "Invalid OTP");
    }

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "IN_PROGRESS",
        otpVerified: true,
        otpVerifiedAt: now,
        actualRideStartTime: now,
      },
      include: {
        vehicle: true,
        driver: true,
        user: true,
        flat: true,
      },
    });

    return bookingResponse(updated);
  });
}

export async function completeTrip(user: AuthUser, bookingId: string, actualEndTimeValue?: string) {
  if (user.role !== "DRIVER" && user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only drivers or admins can complete trips");
  }

  let driverVehicleId: string | null = null;
  if (user.role === "DRIVER") {
    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser || !fullUser.phone) {
      throw new AppError(404, "NOT_FOUND", "User profile not found");
    }

    const driver = await prisma.driver.findFirst({
      where: { phoneNumber: fullUser.phone },
    });

    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver profile not found");
    }
    driverVehicleId = driver.vehicleId;
  }

  return serializable(() => prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId, societyId: user.societyId },
      include: { vehicle: true },
    });

    if (!booking) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }

    if (user.role === "DRIVER" && booking.vehicleId !== driverVehicleId) {
      throw new AppError(403, "FORBIDDEN", "You are not assigned to this vehicle");
    }

    if (booking.status === "COMPLETED" || booking.status === "CANCELLED") {
      throw new AppError(400, "INVALID_STATUS", "Booking is already completed or cancelled");
    }

    const actualEndTime = actualEndTimeValue ? new Date(actualEndTimeValue) : new Date();

    const delayMs = actualEndTime.getTime() - booking.endTime.getTime();
    const delayMinutes = Math.max(0, delayMs / 60000);
    let penaltyAmount = 0;

    const penaltyRule = await tx.penaltyRule.findUnique({
      where: { societyId_code: { societyId: user.societyId, code: "LATE_RETURN_PER_HOUR" } }
    });

    if (delayMinutes > 0 && penaltyRule) {
      const delayHours = Math.ceil(delayMinutes / 60);
      penaltyAmount = delayHours * penaltyRule.amount;
    }

    if (penaltyAmount > 0 && penaltyRule) {
      const wallets = await tx.$queryRaw<{id: string, balance: number}[]>`
        SELECT "id", "balance" FROM "Wallet" WHERE "userId" = ${booking.userId}::uuid FOR UPDATE
      `;
      const wallet = wallets[0];
      if (wallet) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: penaltyAmount } }
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: penaltyAmount,
            type: "PENALTY",
            description: "Late Return Penalty",
            bookingId: booking.id
          }
        });
      }

      await tx.penalty.create({
        data: {
          bookingId: booking.id,
          penaltyRuleId: penaltyRule.id,
          amount: penaltyAmount,
          notes: "Late Return Penalty",
          createdByAdminId: user.id,
        }
      });
    }

    const subtotal = Math.round((booking.durationMinutes / 60) * booking.vehicle.hourlyRate);
    const totalAmount = subtotal + penaltyAmount;

    await tx.invoice.create({
      data: {
        bookingId: booking.id,
        subtotal,
        penaltyAmount,
        totalAmount
      }
    });

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "COMPLETED",
        actualEndTime,
      },
      include: {
        vehicle: true,
        driver: true,
        user: true,
        flat: true,
        invoice: true
      },
    });

    return bookingResponse(updated);
  }));
}
