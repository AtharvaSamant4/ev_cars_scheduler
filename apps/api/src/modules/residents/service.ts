import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { toZonedTime } from "date-fns-tz";

import type { AuthUser } from "@/src/lib/auth";
import { AppError } from "@/src/lib/errors";
import {
  bookingResponse,
  getCurrentQuota,
} from "@/src/modules/bookings/service";

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
        status: BookingStatus.BOOKED,
        startTime: { gt: new Date() },
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

export async function currentQuotaYear(societyId: string) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { timezone: true },
  });

  if (!society) {
    throw new AppError(404, "NOT_FOUND", "Society not found");
  }

  return toZonedTime(new Date(), society.timezone).getFullYear();
}
