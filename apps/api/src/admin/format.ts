import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function hours(minutes: number) {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hrs`;
}

export function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function minutesFromHours(value: string) {
  return Math.round(Number(value) * 60);
}

export function dateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function dateInputToIso(
  value: string,
  endOfDay = false,
  timeZone = "Asia/Kolkata",
) {
  if (!value) {
    return undefined;
  }

  return fromZonedTime(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
    timeZone,
  ).toISOString();
}

export function dateInputValue(value: string, timeZone = "Asia/Kolkata") {
  return formatInTimeZone(value, timeZone, "yyyy-MM-dd");
}

export function statusClass(status: string) {
  if (
    status === "MAINTENANCE" ||
    status === "BREAKDOWN" ||
    status === "AT_RISK" ||
    status === "BOOKED"
  ) {
    return "warning";
  }

  if (status === "INACTIVE" || status === "CANCELLED") {
    return "danger";
  }

  return "";
}
