import { hash } from "bcryptjs";

import {
  BookingStatus,
  Prisma,
  prisma,
  RechargeRequestStatus,
  TransactionType,
  UserRole,
  VehicleStatus,
} from "@society-ev/db";

import type { AuthUser } from "@/src/lib/auth";
import { formatDateInTimezone } from "@/src/lib/date";
import { AppError } from "@/src/lib/errors";
import { paginated, pagination } from "@/src/lib/pagination";
import { bookingResponseWithoutOtp } from "@/src/modules/bookings/service";
import { currentQuotaYear, currentQuotaWeek } from "@/src/modules/residents/service";
import {
  currentQuotaPeriods,
  WEEKLY_QUOTA_MINUTES,
} from "@/src/modules/quotas/service";
import { creditWallet } from "@/src/modules/wallet/service";

export async function adminDashboard(user: AuthUser) {
  const now = new Date();
  const [
    activeFlats,
    residents,
    vehiclesByStatus,
    allBookings,
    upcomingBookings,
  ] = await Promise.all([
    prisma.flat.count({
      where: { societyId: user.societyId, isActive: true },
    }),
    prisma.user.count({
      where: {
        societyId: user.societyId,
        role: UserRole.RESIDENT,
        isActive: true,
      },
    }),
    prisma.vehicle.groupBy({
      by: ["status"],
      where: { societyId: user.societyId },
      _count: true,
    }),
    prisma.booking.count({ where: { societyId: user.societyId } }),
    prisma.booking.count({
      where: {
        societyId: user.societyId,
        status: {
          in: [
            BookingStatus.BOOKED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.OTP_PENDING,
            BookingStatus.REASSIGNED,
            BookingStatus.AT_RISK,
          ],
        },
        endTime: { gt: now },
      },
    }),
  ]);

  const vehicleCounts = Object.fromEntries(
    Object.values(VehicleStatus).map((status) => [status, 0]),
  ) as Record<VehicleStatus, number>;

  for (const item of vehiclesByStatus) {
    vehicleCounts[item.status] = item._count;
  }

  return {
    activeFlats,
    activeResidents: residents,
    vehicles: vehicleCounts,
    bookings: {
      total: allBookings,
      upcoming: upcomingBookings,
    },
  };
}

export async function listVehicles(
  user: AuthUser,
  page: number,
  pageSize: number,
) {
  const where = { societyId: user.societyId };
  const [items, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      orderBy: { name: "asc" },
      ...pagination(page, pageSize),
    }),
    prisma.vehicle.count({ where }),
  ]);

  return paginated(items, total, page, pageSize);
}

export async function createVehicle(
  user: AuthUser,
  input: {
    name: string;
    registrationNumber: string;
    status?: VehicleStatus;
    isReserve?: boolean;
    hourlyRate?: number;
    maintenanceReason?: string;
    expectedReturnDate?: string;
  },
) {
  return prisma.vehicle.create({
    data: {
      societyId: user.societyId,
      name: input.name,
      registrationNumber: input.registrationNumber.toUpperCase(),
      status: input.status,
      isReserve: input.isReserve,
      hourlyRate: input.hourlyRate,
      maintenanceReason: input.maintenanceReason,
      expectedReturnDate: input.expectedReturnDate
        ? new Date(input.expectedReturnDate)
        : undefined,
    },
  });
}

export async function getVehicle(user: AuthUser, id: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, societyId: user.societyId },
  });

  if (!vehicle) {
    throw new AppError(404, "NOT_FOUND", "Vehicle not found");
  }

  return vehicle;
}

export async function updateVehicle(
  user: AuthUser,
  id: string,
  input: {
    name?: string;
    registrationNumber?: string;
    status?: VehicleStatus;
    isReserve?: boolean;
    hourlyRate?: number;
    maintenanceReason?: string;
    expectedReturnDate?: string;
  },
) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const vehicles = await tx.$queryRaw<Array<{
      id: string;
      name: string;
      status: VehicleStatus;
    }>>`
      SELECT "id", "name", "status"
      FROM "Vehicle"
      WHERE "id" = ${id}::uuid
        AND "societyId" = ${user.societyId}::uuid
      FOR UPDATE
    `;
    const vehicle = vehicles[0];
    if (!vehicle) {
      throw new AppError(404, "NOT_FOUND", "Vehicle not found");
    }

    const updated = await tx.vehicle.update({
      where: { id },
      data: {
        ...input,
        registrationNumber: input.registrationNumber?.toUpperCase(),
        maintenanceReason: input.status === VehicleStatus.AVAILABLE
          ? null
          : input.maintenanceReason,
        expectedReturnDate: input.status === VehicleStatus.AVAILABLE
          ? null
          : input.expectedReturnDate
            ? new Date(input.expectedReturnDate)
            : undefined,
      },
    });

    if (
      (
        input.status === VehicleStatus.MAINTENANCE ||
        input.status === VehicleStatus.BREAKDOWN ||
        input.status === VehicleStatus.INACTIVE
      ) &&
      vehicle.status !== input.status
    ) {
      const affectedBookings = await tx.booking.findMany({
        where: {
          societyId: user.societyId,
          OR: [
            { reassignedVehicleId: id },
            { vehicleId: id, reassignedVehicleId: null },
          ],
          startTime: { gt: now },
          status: {
            in: [
              BookingStatus.BOOKED,
              BookingStatus.DRIVER_ASSIGNED,
              BookingStatus.OTP_PENDING,
              BookingStatus.REASSIGNED,
            ],
          },
        },
        include: { user: true },
      });

      if (affectedBookings.length > 0) {
        const society = await tx.society.findUniqueOrThrow({
          where: { id: user.societyId },
          select: { timezone: true },
        });

        await tx.booking.updateMany({
          where: { id: { in: affectedBookings.map((b) => b.id) } },
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
          data: affectedBookings.map((b) => ({
            userId: b.userId,
            title: "Booking Impacted",
            message: `Your assigned EV (${updated.name}) is unavailable. Your booking on ${formatDateInTimezone(b.startTime, society.timezone)} may be impacted.`,
          })),
        });
      }
    }

    return updated;
  });
}

export async function deactivateVehicle(user: AuthUser, id: string) {
  return updateVehicle(user, id, { status: VehicleStatus.INACTIVE });
}

export async function listFlats(
  user: AuthUser,
  page: number,
  pageSize: number,
  isActive?: boolean,
) {
  const year = await currentQuotaYear(user.societyId);
  const week = await currentQuotaWeek(user.societyId);
  const where: Prisma.FlatWhereInput = {
    societyId: user.societyId,
    isActive,
  };
  const [items, total] = await prisma.$transaction([
    prisma.flat.findMany({
      where,
      include: {
        resident: {
          select: {
            id: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        quotas: {
          where: { year, weekNumber: week },
        },
      },
      orderBy: { number: "asc" },
      ...pagination(page, pageSize),
    }),
    prisma.flat.count({ where }),
  ]);

  return paginated(items, total, page, pageSize);
}

export async function createFlat(
  user: AuthUser,
  input: {
    number: string;
    allocatedMinutes: number;
    year?: number;
    weekNumber?: number;
  },
) {
  const periods = await currentQuotaPeriods(user.societyId);
  const currentPeriod = {
    year: input.year ?? periods[0].year,
    week: input.weekNumber ?? periods[0].week,
  };
  const quotaPeriods = [...new Map([currentPeriod, ...periods].map((period) => [
    `${period.year}-${period.week}`,
    period,
  ])).values()];

  return prisma.$transaction(async (tx) => {
    const flat = await tx.flat.create({
      data: {
        societyId: user.societyId,
        number: input.number.toUpperCase(),
      },
    });
    await tx.flatQuota.createMany({
      data: quotaPeriods.map((period, index) => ({
        flatId: flat.id,
        year: period.year,
        weekNumber: period.week,
        allocatedMinutes: index === 0
          ? input.allocatedMinutes
          : WEEKLY_QUOTA_MINUTES,
      })),
      skipDuplicates: true,
    });
    const quota = await tx.flatQuota.findUniqueOrThrow({
      where: {
        flatId_year_weekNumber: {
          flatId: flat.id,
          year: currentPeriod.year,
          weekNumber: currentPeriod.week,
        },
      },
    });

    return { ...flat, quota };
  });
}

export async function getFlat(user: AuthUser, id: string) {
  const flat = await prisma.flat.findFirst({
    where: { id, societyId: user.societyId },
    include: {
      resident: {
        select: {
          id: true,
          name: true,
          phone: true,
          isActive: true,
        },
      },
      quotas: {
        orderBy: { year: "desc" },
      },
    },
  });

  if (!flat) {
    throw new AppError(404, "NOT_FOUND", "Flat not found");
  }

  return flat;
}

export async function updateFlat(
  user: AuthUser,
  id: string,
  input: { number?: string; isActive?: boolean },
) {
  await getFlat(user, id);
  return prisma.$transaction(async (tx) => {
    if (input.isActive === false) {
      await tx.user.updateMany({
        where: { flatId: id, societyId: user.societyId, role: UserRole.RESIDENT },
        data: { isActive: false },
      });
    }

    return tx.flat.update({
      where: { id },
      data: {
        ...input,
        number: input.number?.toUpperCase(),
      },
    });
  });
}

export async function deactivateFlat(user: AuthUser, id: string) {
  await getFlat(user, id);

  return prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { flatId: id, role: UserRole.RESIDENT },
      data: { isActive: false },
    });

    return tx.flat.update({
      where: { id },
      data: { isActive: false },
    });
  });
}

export async function updateQuota(
  user: AuthUser,
  flatId: string,
  year: number,
  weekNumber: number,
  allocatedMinutes: number,
) {
  return prisma.$transaction(async (tx) => {
    const flats = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Flat"
      WHERE "id" = ${flatId}::uuid
        AND "societyId" = ${user.societyId}::uuid
      FOR UPDATE
    `;

    if (!flats[0]) {
      throw new AppError(404, "NOT_FOUND", "Flat not found");
    }

    const locked = await tx.$queryRaw<{ id: string; usedMinutes: number }[]>`
      SELECT "id", "usedMinutes" FROM "FlatQuota"
      WHERE "flatId" = ${flatId}::uuid
        AND "year" = ${year}
        AND "weekNumber" = ${weekNumber}
      FOR UPDATE
    `;
    const existing = locked[0];

    if (existing && allocatedMinutes < existing.usedMinutes) {
      throw new AppError(
        409,
        "QUOTA_BELOW_USAGE",
        "Allocated quota cannot be lower than used quota",
      );
    }

    return existing
      ? tx.flatQuota.update({ where: { id: existing.id }, data: { allocatedMinutes } })
      : tx.flatQuota.create({ data: { flatId, year, weekNumber, allocatedMinutes } });
  });
}

export async function listResidents(
  user: AuthUser,
  page: number,
  pageSize: number,
  isActive?: boolean,
) {
  const where: Prisma.UserWhereInput = {
    societyId: user.societyId,
    role: UserRole.RESIDENT,
    isActive,
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        flat: {
          select: {
            id: true,
            number: true,
            isActive: true,
          },
        },
      },
      orderBy: { flat: { number: "asc" } },
      ...pagination(page, pageSize),
    }),
    prisma.user.count({ where }),
  ]);

  return paginated(items, total, page, pageSize);
}

export async function createResident(
  user: AuthUser,
  input: {
    flatId: string;
    name: string;
    phone: string;
    password: string;
  },
) {
  const flat = await prisma.flat.findFirst({
    where: {
      id: input.flatId,
      societyId: user.societyId,
      isActive: true,
    },
    include: { resident: { select: { id: true } } },
  });

  if (!flat) {
    throw new AppError(404, "NOT_FOUND", "Active flat not found");
  }

  if (flat.resident) {
    throw new AppError(
      409,
      "FLAT_HAS_RESIDENT",
      "This flat already has a resident account",
    );
  }

  const passwordHash = await hash(input.password, 12);
  return prisma.user.create({
    data: {
      societyId: user.societyId,
      flatId: flat.id,
      role: UserRole.RESIDENT,
      name: input.name,
      phone: input.phone,
      passwordHash,
      wallet: {
        create: {
          balance: 5000,
          transactions: {
            create: {
              amount: 5000,
              type: "CREDIT",
              description: "Initial Promotional Balance",
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      flat: { select: { id: true, number: true } },
    },
  });
}

export async function getResident(user: AuthUser, id: string) {
  const resident = await prisma.user.findFirst({
    where: {
      id,
      societyId: user.societyId,
      role: UserRole.RESIDENT,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      flat: {
        select: {
          id: true,
          number: true,
          isActive: true,
        },
      },
    },
  });

  if (!resident) {
    throw new AppError(404, "NOT_FOUND", "Resident not found");
  }

  return resident;
}

export async function updateResident(
  user: AuthUser,
  id: string,
  input: {
    name?: string;
    phone?: string;
    password?: string;
    isActive?: boolean;
  },
) {
  await getResident(user, id);
  const { password, ...data } = input;

  return prisma.user.update({
    where: { id },
    data: {
      ...data,
      passwordHash: password ? await hash(password, 12) : undefined,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      flat: { select: { id: true, number: true } },
    },
  });
}

export async function deactivateResident(user: AuthUser, id: string) {
  return updateResident(user, id, { isActive: false });
}

export async function listAdminBookings(
  user: AuthUser,
  query: {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    status?: BookingStatus;
    flatId?: string;
    vehicleId?: string;
  },
) {
  const statusWhere: Prisma.BookingWhereInput = query.status
    ? { status: query.status }
    : {};
  const where: Prisma.BookingWhereInput = {
    societyId: user.societyId,
    flatId: query.flatId,
    ...(query.vehicleId
      ? {
          OR: [
            { reassignedVehicleId: query.vehicleId },
            { vehicleId: query.vehicleId, reassignedVehicleId: null },
          ],
        }
      : {}),
    startTime: {
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? new Date(query.to) : undefined,
    },
    ...statusWhere,
  };
  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: {
        vehicle: {
          select: { id: true, name: true, registrationNumber: true },
        },
        reassignedVehicle: {
          select: { id: true, name: true, registrationNumber: true },
        },
        flat: { select: { id: true, number: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { startTime: "desc" },
      ...pagination(query.page, query.pageSize),
    }),
    prisma.booking.count({ where }),
  ]);

  return paginated(
    items.map((booking) => bookingResponseWithoutOtp(booking)),
    total,
    query.page,
    query.pageSize,
  );
}

export async function getAdminBooking(user: AuthUser, id: string) {
  const booking = await prisma.booking.findFirst({
    where: { id, societyId: user.societyId },
    include: {
      vehicle: true,
      reassignedVehicle: true,
      driver: true,
      invoice: true,
      flat: { select: { id: true, number: true } },
      user: { select: { id: true, name: true, phone: true } },
      reassignmentLogs: {
        orderBy: { createdAt: 'asc' },
        include: {
          originalVehicle: { select: { id: true, name: true, registrationNumber: true } },
          newVehicle: { select: { id: true, name: true, registrationNumber: true } },
          reassignedByUser: { select: { id: true, name: true } },
        }
      }
    },
  });

  if (!booking) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  return bookingResponseWithoutOtp(booking);
}

export async function getAffectedBookings(user: AuthUser) {
  return prisma.booking.findMany({
    where: {
      societyId: user.societyId,
      status: "AT_RISK",
    },
    include: {
      vehicle: true,
      reassignedVehicle: true,
      user: { select: { id: true, name: true, phone: true } },
      flat: { select: { id: true, number: true } },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getAllRechargeRequests(user: AuthUser, page: number, status?: string) {
  const where: Prisma.RechargeRequestWhereInput = {
    user: { societyId: user.societyId },
  };
  if (status && status !== "ALL") {
    const rechargeStatus =
      status === RechargeRequestStatus.PENDING
        ? RechargeRequestStatus.PENDING
        : status === RechargeRequestStatus.APPROVED
          ? RechargeRequestStatus.APPROVED
          : status === RechargeRequestStatus.REJECTED
            ? RechargeRequestStatus.REJECTED
            : null;

    if (!rechargeStatus) {
      throw new AppError(400, "INVALID_STATUS", "Invalid recharge request status");
    }

    where.status = rechargeStatus;
  }

  const pageSize = 50;
  const { skip, take } = pagination(page, pageSize);

  const [items, total] = await prisma.$transaction([
    prisma.rechargeRequest.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, phone: true, flat: { select: { number: true } } } },
        approvedUser: { select: { name: true } }
      },
    }),
    prisma.rechargeRequest.count({ where }),
  ]);

  return paginated(items, total, page, pageSize);
}

export async function processRechargeRequest(user: AuthUser, requestId: string, action: "APPROVE" | "REJECT") {
  return prisma.$transaction(async (tx) => {
    const requests = await tx.$queryRaw<Array<{
      id: string;
      userId: string;
      amount: number;
      status: RechargeRequestStatus;
    }>>`
      SELECT request."id", request."userId", request."amount", request."status"
      FROM "RechargeRequest" AS request
      INNER JOIN "User" AS resident ON resident."id" = request."userId"
      WHERE request."id" = ${requestId}::uuid
        AND resident."societyId" = ${user.societyId}::uuid
      FOR UPDATE OF request
    `;
    const request = requests[0];

    if (!request) {
      throw new AppError(404, "NOT_FOUND", "Recharge request not found");
    }

    if (request.status !== "PENDING") {
      throw new AppError(400, "INVALID_STATE", `Request is already ${request.status}`);
    }

    if (action === "REJECT") {
      return tx.rechargeRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED" },
      });
    }

    // APPROVE
    const updatedRequest = await tx.rechargeRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: user.id,
      },
    });

    await creditWallet(
      tx,
      request.userId,
      request.amount,
      TransactionType.RECHARGE,
      `Wallet recharge request approved (Req: ${request.id.slice(0, 8)})`,
    );

    return updatedRequest;
  });
}
