import { BookingStatus, prisma, TransactionType, UserRole } from "@society-ev/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as updateCancellationPenalty } from "@/app/api/v1/admin/cancellation-penalty/route";
import { POST as applyPenaltyRoute } from "@/app/api/v1/admin/bookings/[id]/penalties/route";
import { GET as getVehicleRoute } from "@/app/api/v1/admin/vehicles/[id]/route";
import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";
import { getIsoWeek } from "@/src/lib/date";
import { applyPenalty } from "@/src/modules/penalties/service";
import { cleanupSocietyFixture } from "@/tests/helpers/database";

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(url: string, token: string, body?: string) {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body,
  });
}

function expectNoInternalLeak(body: unknown) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/postgres(?:ql)?:\/\//i);
  expect(serialized).not.toMatch(/prisma|stack|password|npg_/i);
}

describe("Penalty and malformed-input hardening", () => {
  let societyId: string;
  let admin: AuthUser;
  let bookingId: string;
  let cancellationRuleId: string;
  let lateRuleId: string;
  let walletId: string;

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: { name: "Penalty Input Fixture Society", timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({
      data: { societyId, number: "PIH-101" },
    });
    [admin] = await Promise.all([
      prisma.user.create({
        data: {
          societyId,
          role: UserRole.ADMIN,
          name: "Penalty Input Admin",
          phone: "918877660201",
          passwordHash: "fixture-hash",
        },
      }),
    ]);
    const resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Penalty Input Resident",
        phone: "918877660202",
        passwordHash: "fixture-hash",
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        societyId,
        name: "Penalty Input EV",
        registrationNumber: "PIH-EV-1",
      },
    });
    const wallet = await prisma.wallet.create({
      data: {
        userId: resident.id,
        balance: 1_000,
        transactions: {
          create: {
            amount: 1_000,
            type: TransactionType.CREDIT,
            description: "Fixture opening balance",
          },
        },
      },
    });
    walletId = wallet.id;

    const startTime = new Date(Date.now() + 24 * 60 * 60_000);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    const period = getIsoWeek(startTime);
    bookingId = (await prisma.booking.create({
      data: {
        societyId,
        vehicleId: vehicle.id,
        flatId: flat.id,
        userId: resident.id,
        quotaYear: period.year,
        quotaWeek: period.week,
        startTime,
        endTime,
        durationMinutes: 60,
        status: BookingStatus.BOOKED,
      },
    })).id;

    const [cancellationRule, lateRule] = await Promise.all([
      prisma.penaltyRule.create({
        data: {
          societyId,
          code: "CANCELLATION",
          name: "Automatic cancellation",
          amount: 100,
          isActive: true,
        },
      }),
      prisma.penaltyRule.create({
        data: {
          societyId,
          code: "LATE_RETURN_PER_HOUR",
          name: "Automatic late return",
          amount: 100,
          isActive: true,
        },
      }),
    ]);
    cancellationRuleId = cancellationRule.id;
    lateRuleId = lateRule.id;
  });

  afterAll(async () => cleanupSocietyFixture(societyId));

  it("cannot manually apply either automatic workflow penalty rule", async () => {
    for (const ruleId of [cancellationRuleId, lateRuleId]) {
      await expect(applyPenalty(admin, bookingId, ruleId)).rejects.toMatchObject({
        status: 409,
        code: "AUTOMATIC_RULE",
      });
    }

    const token = await issueToken(admin);
    const response = await applyPenaltyRoute(
      request(
        `http://127.0.0.1/api/v1/admin/bookings/${bookingId}/penalties`,
        token,
        JSON.stringify({ penaltyRuleId: cancellationRuleId }),
      ),
      routeContext(bookingId),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTOMATIC_RULE" },
    });
    expect(await prisma.penalty.count({ where: { bookingId } })).toBe(0);
    expect(await prisma.walletTransaction.count({
      where: { walletId, type: TransactionType.PENALTY },
    })).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance).toBe(1_000);
  });

  it("returns a sanitized 400 response for malformed UUID route parameters", async () => {
    const token = await issueToken(admin);
    const response = await getVehicleRoute(
      request("http://127.0.0.1/api/v1/admin/vehicles/not-a-uuid", token),
      routeContext("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "INVALID_ROUTE", message: "Invalid route parameter: id" },
    });
    expectNoInternalLeak(body);
  });

  it("returns a sanitized 400 response for malformed JSON without side effects", async () => {
    const token = await issueToken(admin);
    const response = await updateCancellationPenalty(
      request(
        "http://127.0.0.1/api/v1/admin/cancellation-penalty",
        token,
        '{"amount":',
      ),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" },
    });
    expectNoInternalLeak(body);
    expect((await prisma.penaltyRule.findUniqueOrThrow({
      where: {
        societyId_code: { societyId, code: "CANCELLATION" },
      },
    })).amount).toBe(100);
  });
});
