import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { toZonedTime } from "date-fns-tz";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";
import {
  bookingResponse,
  residentFlatId,
  checkAvailability,
} from "@/src/modules/bookings/service";
import { getIsoWeek } from "@/src/lib/date";

function assertResident(user: AuthUser) {
  if (user.role !== UserRole.RESIDENT || !user.flatId) {
    throw new AppError(403, "FORBIDDEN", "A resident account is required");
  }
}

export async function getMe(user: AuthUser) {
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      flat: {
        select: {
          id: true,
          number: true,
          isActive: true,
        },
      },
      society: {
        select: {
          id: true,
          name: true,
          timezone: true,
        },
      },
    },
  });

  if (!account) {
    throw new AppError(404, "NOT_FOUND", "Account not found");
  }

  return account;
}

export async function getDashboard(user: AuthUser) {
  assertResident(user);

  const [quota, upcomingBookings] = await Promise.all([
    getCurrentQuota(user),
    prisma.booking.findMany({
      where: {
        flatId: user.flatId!,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
        endTime: { gt: new Date() },
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
      orderBy: { startTime: "asc" },
      take: 5,
    }),
  ]);

  return {
    quota,
    upcomingBookings: upcomingBookings.map((booking) =>
      bookingResponse(booking),
    ),
  };
}

export async function getCurrentQuota(user: AuthUser) {
  const flatId = residentFlatId(user);
  const year = await currentQuotaYear(user.societyId);
  const week = await currentQuotaWeek(user.societyId);

  const flat = await prisma.flat.findUnique({
    where: { id: flatId },
    include: {
      quotas: {
        where: {
          year,
          weekNumber: week,
        },
      },
    },
  });

  const quota = flat?.quotas[0];
  if (quota) {
    return {
      ...quota,
      remainingMinutes: quota.allocatedMinutes - quota.usedMinutes,
    };
  }

  return {
    allocatedMinutes: 16 * 60,
    usedMinutes: 0,
    remainingMinutes: 16 * 60,
  };
}

export async function currentQuotaYear(societyId: string) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { timezone: true },
  });

  if (!society) {
    throw new AppError(404, "NOT_FOUND", "Society not found");
  }

  return getIsoWeek(new Date()).year;
}

export async function currentQuotaWeek(societyId: string) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { timezone: true },
  });

  if (!society) {
    throw new AppError(404, "NOT_FOUND", "Society not found");
  }

  return getIsoWeek(new Date()).week;
}

export async function getNotifications(user: AuthUser) {
  return prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationsRead(user: AuthUser) {
  return prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
}
