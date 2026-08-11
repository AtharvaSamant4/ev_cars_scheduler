import { fromZonedTime, toZonedTime } from "date-fns-tz";

export function getIsoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return { year: target.getUTCFullYear(), week };
}

export function addCalendarDaysInTimezone(
  instant: Date,
  days: number,
  timezone: string,
) {
  const wallClock = toZonedTime(instant, timezone);
  wallClock.setDate(wallClock.getDate() + days);
  return fromZonedTime(wallClock, timezone);
}

export function dayBoundsInTimezone(instant: Date, timezone: string) {
  const wallClock = toZonedTime(instant, timezone);
  const start = new Date(wallClock);
  start.setHours(0, 0, 0, 0);
  const end = new Date(wallClock);
  end.setHours(23, 59, 59, 999);

  return {
    start: fromZonedTime(start, timezone),
    end: fromZonedTime(end, timezone),
  };
}

export function formatDateInTimezone(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
  }).format(instant);
}

export function formatDateTimeInTimezone(instant: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}
