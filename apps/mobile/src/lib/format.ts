import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { BookingStatus } from "@/src/types/api";

export function hoursLabel(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hrs`;
}

export function bookingDate(value: string, timezone: string) {
  return formatInTimeZone(value, timezone, "EEE, d MMM yyyy");
}

export function bookingTime(value: string, timezone: string) {
  return formatInTimeZone(value, timezone, "h:mm a");
}

export function defaultBookingFields() {
  const now = new Date();
  const start = new Date(now);
  
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
  if (status === "BOOKED" || status === "DRIVER_ASSIGNED") return "Upcoming";
  if (status === "OTP_PENDING") return "OTP Pending";
  if (status === "IN_PROGRESS" || status === "ACTIVE") return "In Progress";
  if (status === "COMPLETED") return "Completed";
  if (status === "REASSIGNED") return "Reassigned";
  if (status === "AT_RISK") return "At Risk";
  return "Cancelled";
}
