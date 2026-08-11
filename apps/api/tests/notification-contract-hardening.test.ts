import {
  BookingStatus,
  prisma,
  TransactionType,
  UserRole,
  VehicleStatus,
} from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as listNotifications,
  POST as readNotifications,
} from "@/app/api/v1/notifications/route";
import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";
import { updateVehicle } from "@/src/modules/admin/service";
import { cancelBooking } from "@/src/modules/bookings/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

const emptyContext = { params: Promise.resolve({}) };

function authenticatedRequest(token: string, method = "GET", body?: unknown) {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest("http://127.0.0.1/api/v1/notifications", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Notification ownership and event consistency", () => {
  let societyId: string;
  let otherSocietyId: string;
  let flatId: string;
  let owner: AuthUser;
  let otherResident: AuthUser;
  let admin: AuthUser;
  const timezone = "America/New_York";

  beforeAll(async () => {
    const [society, otherSociety] = await Promise.all([
      prisma.society.create({
        data: { name: "Notification Contract Fixture", timezone },
      }),
      prisma.society.create({
        data: { name: "Other Notification Fixture", timezone: "UTC" },
      }),
    ]);
    societyId = society.id;
    otherSocietyId = otherSociety.id;

    const [flat, otherFlat] = await Promise.all([
      prisma.flat.create({ data: { societyId, number: "NOTE-101" } }),
      prisma.flat.create({
        data: { societyId: otherSocietyId, number: "NOTE-201" },
      }),
    ]);
    flatId = flat.id;

    [owner, otherResident, admin] = await Promise.all([
      prisma.user.create({
        data: {
          societyId,
          flatId,
          role: UserRole.RESIDENT,
          name: "Notification Owner",
          phone: "918866440101",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId: otherSocietyId,
          flatId: otherFlat.id,
          role: UserRole.RESIDENT,
          name: "Other Notification Resident",
          phone: "918866440201",
          passwordHash: "fixture-hash",
        },
      }),
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.ADMIN,
          name: "Notification Admin",
          phone: "918866440102",
          passwordHash: "fixture-hash",
        },
      }),
    ]);
  });

  beforeEach(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { user: { societyId: { in: [societyId, otherSocietyId] } } },
      }),
      prisma.walletTransaction.deleteMany({
        where: { wallet: { user: { societyId } } },
      }),
      prisma.booking.deleteMany({ where: { societyId } }),
      prisma.wallet.deleteMany({ where: { user: { societyId } } }),
      prisma.flatQuota.deleteMany({ where: { flat: { societyId } } }),
      prisma.vehicle.deleteMany({ where: { societyId } }),
    ]);
  });

  afterAll(async () => {
    await cleanupSocietyFixture(societyId);
    await cleanupSocietyFixture(otherSocietyId);
  });

  it("returns only the authenticated user's public notification contract and marks only that user's alerts read", async () => {
    const [shownOwnerNotification, otherNotification] = await Promise.all([
      prisma.notification.create({
        data: {
          userId: owner.id,
          title: "Owner Alert",
          message: "Visible only to the owner",
        },
      }),
      prisma.notification.create({
        data: {
          userId: otherResident.id,
          title: "Other Alert",
          message: "Must remain isolated",
        },
      }),
    ]);

    const token = await issueToken(owner);
    const response = await listNotifications(
      authenticatedRequest(token),
      emptyContext,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.title).toBe("Owner Alert");
    expect(Object.keys(payload.data[0] ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "message",
      "read",
      "title",
    ]);

    await prisma.notification.create({
      data: {
        userId: owner.id,
        title: "Arrived After List",
        message: "Must stay unread because it was never rendered",
      },
    });

    const readResponse = await readNotifications(
      authenticatedRequest(token, "POST", {
        notificationIds: [shownOwnerNotification.id, otherNotification.id],
      }),
      emptyContext,
    );
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual({ data: { success: true } });

    const [ownerUnread, otherUnread] = await Promise.all([
      prisma.notification.count({ where: { userId: owner.id, read: false } }),
      prisma.notification.count({
        where: { userId: otherResident.id, read: false },
      }),
    ]);
    expect(ownerUnread).toBe(1);
    expect(otherUnread).toBe(1);
  });

  it("emits one timezone-correct impact alert under concurrent maintenance clicks", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Notification Race EV",
        registrationNumber: "NOTE-RACE-EV",
      },
    });
    const startTime = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 2,
      2,
      15,
    ));
    await prisma.booking.create({
      data: {
        societyId,
        flatId,
        userId: owner.id,
        vehicleId: vehicle.id,
        quotaYear: 2030,
        quotaWeek: 1,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * 60_000),
        durationMinutes: 60,
        status: BookingStatus.BOOKED,
      },
    });

    await Promise.all([
      updateVehicle(admin, vehicle.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent click one",
      }),
      updateVehicle(admin, vehicle.id, {
        status: VehicleStatus.MAINTENANCE,
        maintenanceReason: "Concurrent click two",
      }),
    ]);

    const notifications = await prisma.notification.findMany({
      where: { userId: owner.id, title: "Booking Impacted" },
    });
    expect(notifications).toHaveLength(1);
    const expectedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      dateStyle: "medium",
    }).format(startTime);
    expect(notifications[0]?.message).toContain(expectedDate);
    expect(await prisma.booking.count({
      where: { societyId, status: BookingStatus.AT_RISK },
    })).toBe(1);
  });

  it("creates only one cancellation alert, refund, and quota release for concurrent duplicate cancellation", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Cancellation Notification EV",
        registrationNumber: "NOTE-CANCEL-EV",
      },
    });
    const startTime = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        societyId,
        flatId,
        userId: owner.id,
        vehicleId: vehicle.id,
        quotaYear: 2030,
        quotaWeek: 2,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * 60_000),
        durationMinutes: 60,
        status: BookingStatus.BOOKED,
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        userId: owner.id,
        balance: 4_900,
        transactions: {
          create: [
            {
              amount: 5_000,
              type: TransactionType.CREDIT,
              description: "Fixture opening balance",
            },
            {
              amount: 100,
              type: TransactionType.BOOKING_DEBIT,
              description: "Fixture booking charge",
              bookingId: booking.id,
            },
          ],
        },
      },
    });
    await prisma.flatQuota.create({
      data: {
        flatId,
        year: 2030,
        weekNumber: 2,
        allocatedMinutes: 960,
        usedMinutes: 60,
      },
    });

    const results = await Promise.allSettled([
      cancelBooking(owner, booking.id),
      cancelBooking(owner, booking.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [storedWallet, quota, notifications, refunds] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } }),
      prisma.flatQuota.findUniqueOrThrow({
        where: {
          flatId_year_weekNumber: { flatId, year: 2030, weekNumber: 2 },
        },
      }),
      prisma.notification.findMany({
        where: { userId: owner.id, title: "Booking Cancelled" },
      }),
      prisma.walletTransaction.count({
        where: {
          bookingId: booking.id,
          type: TransactionType.REFUND,
        },
      }),
    ]);
    expect(storedWallet.balance).toBe(5_000);
    expect(quota.usedMinutes).toBe(0);
    expect(notifications).toHaveLength(1);
    expect(refunds).toBe(1);
    const expectedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(startTime);
    expect(notifications[0]?.message).toContain(expectedDate);
  });
});
