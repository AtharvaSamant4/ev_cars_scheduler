import { describe, expect, it } from "vitest";

import { AppError } from "@/src/lib/errors";
import { normalizeBookingRange } from "@/src/modules/bookings/service";

const timezone = "Asia/Kolkata";
const now = new Date("2030-06-01T00:00:00Z");

describe("normalizeBookingRange", () => {
  it("accepts a future half-hour-aligned booking", () => {
    const result = normalizeBookingRange(
      "2030-06-10T10:00:00+05:30",
      "2030-06-10T12:30:00+05:30",
      timezone,
      now,
    );

    expect(result.durationMinutes).toBe(150);
    expect(result.quotaYear).toBe(2030);
  });

  it("rejects bookings in the past", () => {
    expect(() =>
      normalizeBookingRange(
        "2030-05-10T10:00:00+05:30",
        "2030-05-10T12:00:00+05:30",
        timezone,
        now,
      ),
    ).toThrowError(AppError);
  });

  it("rejects times outside 30-minute boundaries", () => {
    expect(() =>
      normalizeBookingRange(
        "2030-06-10T10:15:00+05:30",
        "2030-06-10T12:15:00+05:30",
        timezone,
        now,
      ),
    ).toThrowError(/30-minute boundaries/);
  });

  it("rejects bookings that cross calendar years", () => {
    expect(() =>
      normalizeBookingRange(
        "2030-12-31T23:00:00+05:30",
        "2031-01-01T01:00:00+05:30",
        timezone,
        now,
      ),
    ).toThrowError(/calendar-year boundary/);
  });
});
