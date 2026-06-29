import { UserRole } from "@society-ev/db";
import { describe, expect, it } from "vitest";

import { AppError } from "@/src/lib/errors";
import { normalizeBookingRange } from "@/src/modules/bookings/service";

const timezone = "Asia/Kolkata";
const now = new Date("2030-06-01T00:00:00Z");

describe("normalizeBookingRange", () => {
  it("accepts a future half-hour-aligned booking within 7 days", () => {
    const result = normalizeBookingRange(
      "2030-06-05T10:00:00+05:30",
      "2030-06-05T12:30:00+05:30",
      timezone,
      UserRole.RESIDENT,
      now,
    );

    expect(result.durationMinutes).toBe(150);
    expect(result.quotaYear).toBe(2030);
    expect(result.quotaWeek).toBe(23);
  });

  it("rejects bookings in the past", () => {
    expect(() =>
      normalizeBookingRange(
        "2030-05-10T10:00:00+05:30",
        "2030-05-10T12:00:00+05:30",
        timezone,
        UserRole.RESIDENT,
        now,
      ),
    ).toThrowError(/start in the future/);
  });

  it("rejects times outside 30-minute boundaries", () => {
    expect(() =>
      normalizeBookingRange(
        "2030-06-05T10:15:00+05:30",
        "2030-06-05T12:15:00+05:30",
        timezone,
        UserRole.RESIDENT,
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
        UserRole.RESIDENT,
        new Date("2030-12-30T00:00:00Z"),
      ),
    ).toThrowError(/calendar-year boundary/);
  });

  describe("7-day rolling window", () => {
    it("accepts booking exactly 7 days ahead (PASS)", () => {
      // now is 2030-06-01T00:00:00Z
      // exactly 7 days is 2030-06-08T00:00:00Z
      // Note: 2030-06-08T00:00:00Z is 2030-06-08T05:30:00+05:30
      const result = normalizeBookingRange(
        "2030-06-08T05:30:00+05:30",
        "2030-06-08T07:30:00+05:30",
        timezone,
        UserRole.RESIDENT,
        now,
      );
      expect(result.durationMinutes).toBe(120);
    });

    it("rejects booking 7 days + 1 minute ahead (FAIL)", () => {
      // exactly 7 days is 2030-06-08T00:00:00Z
      // 1 minute ahead is 2030-06-08T00:01:00Z -> 2030-06-08T05:31:00+05:30
      // But we require 30-min boundaries, so let's test 7 days + 30 mins ahead
      expect(() =>
        normalizeBookingRange(
          "2030-06-08T06:00:00+05:30",
          "2030-06-08T08:00:00+05:30",
          timezone,
          UserRole.RESIDENT,
          now,
        ),
      ).toThrowError("Bookings can only be made up to 7 days in advance.");
    });

    it("accepts booking today (PASS)", () => {
      // now is 2030-06-01T00:00:00Z
      // today later is 2030-06-01T02:00:00Z -> 2030-06-01T07:30:00+05:30
      const result = normalizeBookingRange(
        "2030-06-01T07:30:00+05:30",
        "2030-06-01T09:30:00+05:30",
        timezone,
        UserRole.RESIDENT,
        now,
      );
      expect(result.durationMinutes).toBe(120);
    });

    it("accepts admin booking > 7 days ahead (PASS)", () => {
      // 10 days ahead
      const result = normalizeBookingRange(
        "2030-06-11T05:30:00+05:30",
        "2030-06-11T07:30:00+05:30",
        timezone,
        UserRole.ADMIN,
        now,
      );
      expect(result.durationMinutes).toBe(120);
    });
  });
});
