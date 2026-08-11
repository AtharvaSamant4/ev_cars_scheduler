import { BookingStatus, prisma, UserRole } from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getMe } from "@/app/api/v1/me/route";
import { GET as downloadInvoicePdf } from "@/app/api/v1/bookings/[bookingId]/invoice/pdf/route";
import { POST as createInvoiceToken } from "@/app/api/v1/bookings/[bookingId]/invoice/token/route";
import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const emptyContext = { params: Promise.resolve({}) };

function bookingContext(bookingId: string) {
  return { params: Promise.resolve({ bookingId }) };
}

function bearerRequest(url: string, token: string, method = "GET") {
  return new NextRequest(url, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Authentication and invoice authorization hardening", () => {
  let societyId: string;
  let owner: AuthUser;
  let otherResident: AuthUser;
  let inactiveResident: AuthUser;
  let inactiveFlatId: string;
  let admin: AuthUser;
  let driver: AuthUser;
  let invoiceBookingId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Invoice ACL Fixture Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;

    const [ownerFlat, otherFlat, inactiveFlat] = await Promise.all([
      prisma.flat.create({ data: { societyId, number: "IACL-101" } }),
      prisma.flat.create({ data: { societyId, number: "IACL-102" } }),
      prisma.flat.create({ data: { societyId, number: "IACL-103" } }),
    ]);
    inactiveFlatId = inactiveFlat.id;

    [owner, otherResident, inactiveResident, admin, driver] = await Promise.all([
      prisma.user.create({
        data: {
          societyId,
          flatId: ownerFlat.id,
          role: UserRole.RESIDENT,
          name: "Invoice Owner",
          phone: "918877660101",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          flatId: otherFlat.id,
          role: UserRole.RESIDENT,
          name: "Other Invoice Resident",
          phone: "918877660102",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          flatId: inactiveFlat.id,
          role: UserRole.RESIDENT,
          name: "Inactive Flat Resident",
          phone: "918877660103",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.ADMIN,
          name: "Invoice ACL Admin",
          phone: "918877660104",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.DRIVER,
          name: "Invoice ACL Driver",
          phone: "918877660105",
          passwordHash: "fixture-hash",
        },
      }),
    ]);

    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Invoice ACL EV",
        registrationNumber: "IACL-EV-1",
        hourlyRate: 150,
      },
    });
    const startTime = new Date(Date.now() - 2 * 60 * 60_000);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    const period = getIsoWeek(startTime);
    const booking = await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId: ownerFlat.id,
        userId: owner.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime,
        durationMinutes: 60,
        status: BookingStatus.COMPLETED,
        actualRideStartTime: startTime,
        actualEndTime: endTime,
      },
    });
    invoiceBookingId = booking.id;
    await prisma.invoice.create({
      data: {
        bookingId: booking.id,
        subtotal: 150,
        penaltyAmount: 0,
        totalAmount: 150,
      },
    });
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("allows only the owning resident and a same-society admin to download an invoice", async () => {
    for (const allowedUser of [owner, admin]) {
      const token = await issueToken(allowedUser);
      const response = await downloadInvoicePdf(
        bearerRequest(
          `http://127.0.0.1/api/v1/bookings/${invoiceBookingId}/invoice/pdf`,
          token,
        ),
        bookingContext(invoiceBookingId),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString("ascii")).toBe("%PDF");
    }

    for (const deniedUser of [otherResident, driver]) {
      const token = await issueToken(deniedUser);
      const response = await downloadInvoicePdf(
        bearerRequest(
          `http://127.0.0.1/api/v1/bookings/${invoiceBookingId}/invoice/pdf`,
          token,
        ),
        bookingContext(invoiceBookingId),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "FORBIDDEN" },
      });
    }
  });

  it("rejects a normal JWT in a global query parameter", async () => {
    const token = await issueToken(owner);
    const query = new URLSearchParams({ token });
    const response = await getMe(
      new NextRequest(`http://127.0.0.1/api/v1/me?${query}`),
      emptyContext,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTH_INVALID", message: "Authentication is required" },
    });
  });

  it("accepts a short-lived booking-scoped invoice download token", async () => {
    const sessionToken = await issueToken(owner);
    const tokenResponse = await createInvoiceToken(
      bearerRequest(
        `http://127.0.0.1/api/v1/bookings/${invoiceBookingId}/invoice/token`,
        sessionToken,
        "POST",
      ),
      bookingContext(invoiceBookingId),
    );
    expect(tokenResponse.status).toBe(200);
    const tokenBody = await tokenResponse.json() as {
      data: { available: boolean; downloadToken: string };
    };
    expect(tokenBody.data.available).toBe(true);

    const query = new URLSearchParams({ downloadToken: tokenBody.data.downloadToken });
    const downloadResponse = await downloadInvoicePdf(
      new NextRequest(
        `http://127.0.0.1/api/v1/bookings/${invoiceBookingId}/invoice/pdf?${query}`,
      ),
      bookingContext(invoiceBookingId),
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("cache-control")).toBe("private, no-store");
  });

  it("invalidates an existing resident JWT when its flat is disabled", async () => {
    const token = await issueToken(inactiveResident);
    await prisma.flat.update({
      where: { id: inactiveFlatId },
      data: { isActive: false },
    });

    try {
      const response = await getMe(
        bearerRequest("http://127.0.0.1/api/v1/me", token),
        emptyContext,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "AUTH_INVALID", message: "The account is inactive" },
      });
    } finally {
      await prisma.flat.update({
        where: { id: inactiveFlatId },
        data: { isActive: true },
      });
    }
  });
});
