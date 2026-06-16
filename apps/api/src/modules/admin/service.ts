import { hash } from "bcryptjs";

import {
  BookingStatus,
  Prisma,
  prisma,
  UserRole,
  VehicleStatus,
} from "@society-ev/db";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";
import { paginated, pagination } from "@/src/lib/pagination";
import { bookingResponse } from "@/src/modules/bookings/service";
import { currentQuotaYear, currentQuotaWeek } from "@/src/modules/residents/service";

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
        status: BookingStatus.BOOKED,
        startTime: { gt: now },
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
  },
) {
  return prisma.vehicle.create({
    data: {
      societyId: user.societyId,
      name: input.name,
      registrationNumber: input.registrationNumber.toUpperCase(),
      status: input.status,
      isReserve: input.isReserve,
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
  },
) {
  await getVehicle(user, id);
  return prisma.vehicle.update({
    where: { id },
    data: {
      ...input,
      registrationNumber: input.registrationNumber?.toUpperCase(),
    },
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
  const year = input.year ?? (await currentQuotaYear(user.societyId));
  const weekNumber = input.weekNumber ?? (await currentQuotaWeek(user.societyId));

  return prisma.$transaction(async (tx) => {
    const flat = await tx.flat.create({
      data: {
        societyId: user.societyId,
        number: input.number.toUpperCase(),
      },
    });
    const quota = await tx.flatQuota.create({
      data: {
        flatId: flat.id,
        year,
        weekNumber,
        allocatedMinutes: input.allocatedMinutes,
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
  return prisma.flat.update({
    where: { id },
    data: {
      ...input,
      number: input.number?.toUpperCase(),
    },
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
  const flat = await prisma.flat.findFirst({
    where: { id: flatId, societyId: user.societyId },
    select: { id: true },
  });

  if (!flat) {
    throw new AppError(404, "NOT_FOUND", "Flat not found");
  }

  const existing = await prisma.flatQuota.findUnique({
    where: { flatId_year_weekNumber: { flatId, year, weekNumber } },
  });

  if (existing && allocatedMinutes < existing.usedMinutes) {
    throw new AppError(
      409,
      "QUOTA_BELOW_USAGE",
      "Allocated quota cannot be lower than used quota",
    );
  }

  return prisma.flatQuota.upsert({
    where: { flatId_year_weekNumber: { flatId, year, weekNumber } },
    update: { allocatedMinutes },
    create: {
      flatId,
      year,
      weekNumber,
      allocatedMinutes,
    },
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

  return prisma.user.create({
    data: {
      societyId: user.societyId,
      flatId: flat.id,
      role: UserRole.RESIDENT,
      name: input.name,
      phone: input.phone,
      passwordHash: await hash(input.password, 12),
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
  const now = new Date();
  const statusWhere: Prisma.BookingWhereInput =
    query.status === BookingStatus.COMPLETED
      ? {
          OR: [
            { status: BookingStatus.COMPLETED },
            { status: BookingStatus.BOOKED, endTime: { lte: now } },
          ],
        }
      : query.status === BookingStatus.BOOKED
        ? { status: BookingStatus.BOOKED, endTime: { gt: now } }
        : query.status
          ? { status: query.status }
          : {};
  const where: Prisma.BookingWhereInput = {
    societyId: user.societyId,
    flatId: query.flatId,
    vehicleId: query.vehicleId,
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
        flat: { select: { id: true, number: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { startTime: "desc" },
      ...pagination(query.page, query.pageSize),
    }),
    prisma.booking.count({ where }),
  ]);

  return paginated(
    items.map((booking) => bookingResponse(booking)),
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
      flat: { select: { id: true, number: true } },
      user: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!booking) {
    throw new AppError(404, "NOT_FOUND", "Booking not found");
  }

  return bookingResponse(booking);
}

export async function listDrivers(
  user: AuthUser,
  page: number,
  pageSize: number,
) {
  const where = { societyId: user.societyId, role: UserRole.DRIVER };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: {
        driver: {
          include: {
            vehicle: true,
          },
        },
      },
      orderBy: { name: "asc" },
      ...pagination(page, pageSize),
    }),
    prisma.user.count({ where }),
  ]);

  return paginated(items, total, page, pageSize);
}

export async function createDriver(
  user: AuthUser,
  input: {
    name: string;
    phone: string;
    password?: string;
  },
) {
  const phone = input.phone.trim();
  const existing = await prisma.user.findUnique({
    where: { phone },
  });

  if (existing) {
    throw new AppError(409, "CONFLICT", "Phone number already exists");
  }

  const passwordHash = await hash(input.password || "Driver@123", 10);

  return prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        societyId: user.societyId,
        role: UserRole.DRIVER,
        name: input.name.trim(),
        phone,
        passwordHash,
      },
    });

    const driver = await tx.driver.create({
      data: {
        userId: newUser.id,
      },
    });

    return { ...newUser, driver };
  });
}

export async function updateDriver(
  user: AuthUser,
  id: string,
  input: {
    name?: string;
    phone?: string;
    password?: string;
  },
) {
  const existing = await prisma.user.findFirst({
    where: { id, societyId: user.societyId, role: UserRole.DRIVER },
  });

  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.name) {
    data.name = input.name.trim();
  }

  if (input.phone) {
    const phone = input.phone.trim();
    const phoneUser = await prisma.user.findUnique({ where: { phone } });
    if (phoneUser && phoneUser.id !== id) {
      throw new AppError(409, "CONFLICT", "Phone number already exists");
    }
    data.phone = phone;
  }

  if (input.password) {
    data.passwordHash = await hash(input.password, 10);
  }

  return prisma.user.update({
    where: { id },
    data,
  });
}

export async function assignDriverVehicle(
  user: AuthUser,
  userId: string,
  vehicleId: string | null,
) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, societyId: user.societyId, role: UserRole.DRIVER },
    include: { driver: true },
  });

  if (!existing || !existing.driver) {
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  }

  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, societyId: user.societyId },
    });
    if (!vehicle) {
      throw new AppError(404, "NOT_FOUND", "Vehicle not found");
    }
  }

  return prisma.driver.update({
    where: { id: existing.driver.id },
    data: { vehicleId },
  });
}
