export function hours(minutes: number) {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hrs`;
}

export function minutesFromHours(value: string) {
  return Math.round(Number(value) * 60);
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function dateInputToIso(value: string, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  return `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`;
}

export function statusClass(status: string) {
  if (status === "MAINTENANCE" || status === "BOOKED") {
    return "warning";
  }

  if (status === "INACTIVE" || status === "CANCELLED") {
    return "danger";
  }

  return "";
}
