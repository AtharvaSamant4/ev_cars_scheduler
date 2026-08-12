import { prisma, UserRole } from "@society-ev/db";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";
import {
  activeBookingFilter,
  bookingResponse,
  residentFlatId,
} from "@/src/modules/bookings/service";
import {
  currentQuotaPeriods,
  ensureWeeklyQuotaHorizon,
} from "@/src/modules/quotas/service";

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
        ...activeBookingFilter(new Date()),
      },
      include: {
        vehicle: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
          },
        },
        reassignedVehicle: {
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
  const [current] = await ensureWeeklyQuotaHorizon(flatId, user.societyId);
  const quota = await prisma.flatQuota.findUnique({
    where: {
      flatId_year_weekNumber: {
        flatId,
        year: current.year,
        weekNumber: current.week,
      },
    },
  });

  if (!quota) {
    throw new AppError(500, "QUOTA_PROVISION_FAILED", "Weekly quota could not be provisioned");
  }

  return {
    ...quota,
    remainingMinutes: quota.allocatedMinutes - quota.usedMinutes,
  };
}

export async function currentQuotaYear(societyId: string) {
  return (await currentQuotaPeriods(societyId))[0].year;
}

export async function currentQuotaWeek(societyId: string) {
  return (await currentQuotaPeriods(societyId))[0].week;
}

export async function getNotifications(user: AuthUser) {
  return prisma.notification.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      title: true,
      message: true,
      read: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationsRead(
  user: AuthUser,
  notificationIds: string[],
) {
  return prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId: user.id,
      read: false,
    },
    data: { read: true },
  });
}
