import { prisma } from "@society-ev/db";
import { toZonedTime } from "date-fns-tz";

import { addCalendarDaysInTimezone, getIsoWeek } from "@/src/lib/date";
import { AppError } from "@/src/lib/errors";

export const WEEKLY_QUOTA_MINUTES = 16 * 60;

type QuotaPeriod = { year: number; week: number };

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

function quotaPeriod(date: Date, timezone: string): QuotaPeriod {
  return getIsoWeek(toZonedTime(date, timezone));
}

export async function currentQuotaPeriods(
  societyId: string,
  now = new Date(),
) {
  const timezone = await societyTimezone(societyId);
  const periods = [now, addCalendarDaysInTimezone(now, 7, timezone)]
    .map((date) => quotaPeriod(date, timezone));

  return [...new Map(periods.map((period) => [
    `${period.year}-${period.week}`,
    period,
  ])).values()];
}

export async function ensureWeeklyQuotaHorizon(
  flatId: string,
  societyId: string,
  requiredDate?: Date,
) {
  const timezone = await societyTimezone(societyId);
  const now = new Date();
  const dates = [now, addCalendarDaysInTimezone(now, 7, timezone)];

  if (requiredDate) {
    dates.push(requiredDate);
  }

  const periods = [...new Map(dates.map((date) => {
    const period = quotaPeriod(date, timezone);
    return [`${period.year}-${period.week}`, period] as const;
  })).values()];

  await prisma.flatQuota.createMany({
    data: periods.map((period) => ({
      flatId,
      year: period.year,
      weekNumber: period.week,
      allocatedMinutes: WEEKLY_QUOTA_MINUTES,
    })),
    skipDuplicates: true,
  });

  return periods;
}
