import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

import type { BookingStatus } from "@/src/types/api";

export function hoursLabel(minutes: number) {
  const hours = minutes / 60;
  const rounded = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `${rounded} ${rounded === 1 ? "hr" : "hrs"}`;
}

export function hoursShortLabel(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function currencyLabel(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function bookingDate(value: string, timezone: string) {
  return formatInTimeZone(value, timezone, "EEE, d MMM yyyy");
}

export function bookingTime(value: string, timezone: string) {
  return formatInTimeZone(value, timezone, "h:mm a");
}

/** "Sat, 16 Aug" — the year is noise for anything within a booking horizon. */
export function shortDayLabel(value: string | Date, timezone: string) {
  return formatInTimeZone(value, timezone, "EEE, d MMM");
}

/**
 * Compared as calendar days in the society's timezone rather than by elapsed
 * hours, so "today" means what a resident would mean by it.
 */
export function isTodayInTimezone(value: string | Date, timezone: string) {
  return (
    formatInTimeZone(value, timezone, "yyyy-MM-dd") ===
    formatInTimeZone(new Date(), timezone, "yyyy-MM-dd")
  );
}

export function defaultBookingFields(timezone: string) {
  const start = toZonedTime(new Date(), timezone);
  
  if (start.getMinutes() < 30) {
    start.setMinutes(30, 0, 0);
  } else {
    start.setHours(start.getHours() + 1);
    start.setMinutes(0, 0, 0);
  }

  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  return {
    date: format(start, "yyyy-MM-dd"),
    startTime: format(start, "HH:mm"),
    endTime: format(end, "HH:mm"),
  };
}

export function bookingRange(
  date: string,
  startTime: string,
  endTime: string,
  timezone: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Use date format YYYY-MM-DD");
  }

  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("Use time format HH:mm");
  }

  const start = fromZonedTime(`${date}T${startTime}:00`, timezone);
  const end = fromZonedTime(`${date}T${endTime}:00`, timezone);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Enter a valid date and time");
  }

  if (
    formatInTimeZone(start, timezone, "yyyy-MM-dd HH:mm") !==
      `${date} ${startTime}` ||
    formatInTimeZone(end, timezone, "yyyy-MM-dd HH:mm") !==
      `${date} ${endTime}`
  ) {
    throw new Error("Enter a real date and time in your society timezone");
  }

  if (end <= start) {
    throw new Error("End time must be after start time");
  }

  if (
    start.getMinutes() % 30 !== 0 ||
    end.getMinutes() % 30 !== 0
  ) {
    throw new Error("Use 30-minute time boundaries");
  }

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

export function statusLabel(status: BookingStatus) {
  if (status === "BOOKED") return "Confirmed";
  if (status === "DRIVER_ASSIGNED") return "Driver assigned";
  if (status === "OTP_PENDING") return "Share your OTP";
  if (status === "IN_PROGRESS" || status === "ACTIVE") return "Ride in progress";
  if (status === "COMPLETED") return "Completed";
  if (status === "REASSIGNED") return "Vehicle changed";
  if (status === "AT_RISK") return "Needs attention";
  return "Cancelled";
}
