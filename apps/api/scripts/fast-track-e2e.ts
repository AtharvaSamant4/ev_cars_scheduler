import { hash } from "bcryptjs";

import { prisma, TransactionType, UserRole } from "@society-ev/db";

import {
  assertSafeTestDatabase,
  cleanupSocietyFixture,
} from "../tests/helpers/database";

const FIXTURE_SOCIETY = "Fast Track HTTP E2E Society";
const PASSWORD = "FastTrack@123";
const apiUrl = new URL(process.env.FAST_TRACK_API_URL ?? "http://127.0.0.1:3100/api/v1/");

if (apiUrl.hostname !== "127.0.0.1" && apiUrl.hostname !== "localhost") {
  throw new Error(`Refusing non-local API target ${apiUrl.hostname}`);
}
assertSafeTestDatabase();

type Login = { token: string; user: { id: string } };
type BookingResult = {
  booking: {
    id: string;
    status: string;
    startTime: string;
    endTime: string;
    actualRideStartTime?: string | null;
    actualEndTime?: string | null;
    reassignedVehicleId?: string | null;
    reassignedVehicle?: { id: string } | null;
    invoice?: {
      subtotal: number;
      penaltyAmount: number;
      totalAmount: number;
    } | null;
  };
};
type Wallet = {
  balance: number;
  transactions: Array<{ bookingId?: string | null; type: string; amount: number }>;
};

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
  expectedStatus = 200,
) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(new URL(path.replace(/^\//, ""), apiUrl), { ...init, headers });
  const text = await response.text();
  let payload: { data?: T; error?: { code?: string; message?: string } };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error(`${init.method ?? "GET"} ${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${init.method ?? "GET"} ${path}: expected ${expectedStatus}, got ${response.status}: ${payload.error?.code ?? "UNKNOWN"} ${payload.error?.message ?? text}`);
  }
  return payload.data as T;
}

function jsonBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

function slot(days: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  for (const stale of await prisma.society.findMany({ where: { name: FIXTURE_SOCIETY }, select: { id: true } })) {
    await cleanupSocietyFixture(stale.id);
  }

  let societyId: string | undefined;
  try {
    const passwordHash = await hash(PASSWORD, 4);
    const society = await prisma.society.create({
      data: { name: FIXTURE_SOCIETY, timezone: "Asia/Kolkata" },
    });
    societyId = society.id;
    const flat = await prisma.flat.create({ data: { societyId, number: "E2E101" } });
    const admin = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.ADMIN,
        name: "Fast Track Admin",
        email: "fast-track-admin@local.test",
        phone: "9100000101",
        passwordHash,
      },
    });
    const resident = await prisma.user.create({
      data: {
        societyId,
        flatId: flat.id,
        role: UserRole.RESIDENT,
        name: "Fast Track Resident",
        phone: "9100000102",
        passwordHash,
      },
    });
    const driverUser = await prisma.user.create({
      data: {
        societyId,
        role: UserRole.DRIVER,
        name: "Fast Track Driver",
        phone: "9100000103",
        passwordHash,
      },
    });
    const [primaryVehicle, maintenanceVehicle, reserveVehicle] = await Promise.all([
      prisma.vehicle.create({ data: { societyId, name: "E2E Primary EV", registrationNumber: "E2E-PRIMARY", hourlyRate: 100 } }),
      prisma.vehicle.create({ data: { societyId, name: "E2E Maintenance EV", registrationNumber: "E2E-MAINT", hourlyRate: 120 } }),
      prisma.vehicle.create({ data: { societyId, name: "E2E Reserve EV", registrationNumber: "E2E-RESERVE", hourlyRate: 100, isReserve: true } }),
    ]);
    const driverProfile = await prisma.driver.create({
      data: {
        societyId,
        fullName: driverUser.name,
        phoneNumber: driverUser.phone!,
        licenseNumber: "E2E-LICENSE",
        vehicleId: primaryVehicle.id,
      },
    });
    await prisma.wallet.create({
      data: {
        userId: resident.id,
        balance: 10_000,
        transactions: { create: { amount: 10_000, type: TransactionType.CREDIT, description: "E2E opening balance" } },
      },
    });
    await prisma.penaltyRule.createMany({
      data: [
        { societyId, code: "CANCELLATION", name: "Cancellation", amount: 50, isActive: true },
        { societyId, code: "LATE_RETURN_PER_HOUR", name: "Late return per hour", amount: 75, isActive: true },
      ],
    });

    const residentLogin = await jsonRequest<Login>("auth/resident/login", jsonBody({ societyId, flatNumber: "E2E101", password: PASSWORD }));
    const residentToken = residentLogin.token;
    const dashboard = await jsonRequest<{ quota: { allocatedMinutes: number; usedMinutes: number } }>("dashboard", {}, residentToken);
    if (dashboard.quota.allocatedMinutes !== 960 || dashboard.quota.usedMinutes !== 0) {
      throw new Error(`Unexpected dashboard quota ${JSON.stringify(dashboard.quota)}`);
    }
    const provisionedQuotas = await prisma.flatQuota.findMany({ where: { flatId: flat.id } });
    if (provisionedQuotas.length !== 2) throw new Error(`Expected current/next quota rows, found ${provisionedQuotas.length}`);

    const mainStart = slot(1);
    const mainEnd = new Date(mainStart.getTime() + 60 * 60_000);
    const query = new URLSearchParams({ startTime: mainStart.toISOString(), endTime: mainEnd.toISOString() });
    const availability = await jsonRequest<{ available: boolean; availableVehicles: Array<{ id: string }> }>(`availability?${query}`, {}, residentToken);
    if (!availability.available || !availability.availableVehicles.some((vehicle) => vehicle.id === primaryVehicle.id)) {
      throw new Error("Primary vehicle was not available through the HTTP API");
    }
    const mainBooking = await jsonRequest<BookingResult>("bookings", jsonBody({ startTime: mainStart.toISOString(), endTime: mainEnd.toISOString(), vehicleId: primaryVehicle.id }), residentToken, 201);
    const mainBookingId = mainBooking.booking.id;
    const walletAfterBooking = await jsonRequest<Wallet>("wallet", {}, residentToken);
    if (walletAfterBooking.balance !== 9_900) throw new Error(`Expected booking wallet balance 9900, got ${walletAfterBooking.balance}`);
    if (walletAfterBooking.transactions.filter((tx) => tx.bookingId === mainBookingId && tx.type === "BOOKING_DEBIT").length !== 1) {
      throw new Error("Booking debit was not recorded exactly once");
    }
    await jsonRequest<BookingResult["booking"]>(`bookings/${mainBookingId}`, {}, residentToken);

    const adminLogin = await jsonRequest<Login>("auth/admin/login", jsonBody({ email: "fast-track-admin@local.test", password: PASSWORD }));
    const adminToken = adminLogin.token;
    const penaltyRules = await jsonRequest<Array<{ code: string }>>("admin/penalty-rules", {}, adminToken);
    if (!penaltyRules.some((rule) => rule.code === "CANCELLATION") || !penaltyRules.some((rule) => rule.code === "LATE_RETURN_PER_HOUR")) {
      throw new Error("Admin penalty-rule listing omitted an active rule");
    }
    await jsonRequest<unknown>(
      `admin/bookings/${mainBookingId}/reassign`,
      jsonBody({ reserveVehicleId: reserveVehicle.id, reason: "EMERGENCY" }),
      residentToken,
      403,
    );
    await jsonRequest(`admin/bookings/${mainBookingId}/assign-driver`, jsonBody({ driverId: driverProfile.id }), adminToken);

    const driverLogin = await jsonRequest<Login>("auth/driver/login", jsonBody({ phone: "9100000103", password: PASSWORD }));
    const driverToken = driverLogin.token;
    const driverDashboard = await jsonRequest<{ upcoming: Array<{ id: string }> }>("driver/dashboard", {}, driverToken);
    if (!driverDashboard.upcoming.some((booking) => booking.id === mainBookingId)) throw new Error("Assigned booking missing from driver dashboard");
    const arrived = await jsonRequest<{ otp: string; status: string }>(`driver/bookings/${mainBookingId}/arrive`, jsonBody({}), driverToken);
    if (arrived.status !== "OTP_PENDING" || !/^\d{6}$/.test(arrived.otp)) throw new Error("Driver arrival did not generate a six-digit OTP");
    const started = await jsonRequest<{ status: string; actualRideStartTime: string }>(`driver/bookings/${mainBookingId}/verify-otp`, jsonBody({ otp: arrived.otp }), driverToken);
    if (started.status !== "IN_PROGRESS" || !started.actualRideStartTime) throw new Error("OTP verification did not start the ride");
    const lateEnd = new Date(mainEnd.getTime() + 65 * 60_000);
    await jsonRequest(`driver/bookings/${mainBookingId}/complete`, jsonBody({ actualEndTime: lateEnd.toISOString() }), driverToken);

    const completed = await jsonRequest<BookingResult["booking"]>(`bookings/${mainBookingId}`, {}, residentToken);
    if (completed.status !== "COMPLETED" || !completed.actualRideStartTime || completed.actualEndTime !== lateEnd.toISOString()) {
      throw new Error("Completed booking did not persist the real ride timestamps");
    }
    if (!completed.invoice || completed.invoice.subtotal !== 100 || completed.invoice.penaltyAmount !== 150 || completed.invoice.totalAmount !== 250) {
      throw new Error(`Unexpected invoice totals ${JSON.stringify(completed.invoice)}`);
    }
    const walletAfterCompletion = await jsonRequest<Wallet>("wallet", {}, residentToken);
    if (walletAfterCompletion.balance !== 9_750) throw new Error(`Expected late-penalty wallet balance 9750, got ${walletAfterCompletion.balance}`);

    const pdf = await fetch(new URL(`bookings/${mainBookingId}/invoice/pdf`, apiUrl), { headers: { authorization: `Bearer ${residentToken}` } });
    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    if (!pdf.ok || !pdf.headers.get("content-type")?.includes("application/pdf") || pdfBytes.length < 1_000 || pdfBytes.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("Invoice PDF endpoint did not return a valid PDF");
    }

    const cancelStart = slot(2);
    const cancelEnd = new Date(cancelStart.getTime() + 60 * 60_000);
    const cancellable = await jsonRequest<BookingResult>("bookings", jsonBody({ startTime: cancelStart.toISOString(), endTime: cancelEnd.toISOString(), vehicleId: maintenanceVehicle.id }), residentToken, 201);
    await jsonRequest(`bookings/${cancellable.booking.id}/cancel`, jsonBody({}), residentToken);
    const walletAfterCancellation = await jsonRequest<Wallet>("wallet", {}, residentToken);
    if (walletAfterCancellation.balance !== 9_700) throw new Error(`Expected cancellation wallet balance 9700, got ${walletAfterCancellation.balance}`);
    if (walletAfterCancellation.transactions.filter((tx) => tx.bookingId === cancellable.booking.id && tx.type === "REFUND").length !== 1 ||
        walletAfterCancellation.transactions.filter((tx) => tx.bookingId === cancellable.booking.id && tx.type === "PENALTY").length !== 1) {
      throw new Error("Cancellation did not record exactly one refund and one penalty");
    }

    const maintenanceStart = slot(3);
    const maintenanceEnd = new Date(maintenanceStart.getTime() + 60 * 60_000);
    const atRisk = await jsonRequest<BookingResult>("bookings", jsonBody({ startTime: maintenanceStart.toISOString(), endTime: maintenanceEnd.toISOString(), vehicleId: maintenanceVehicle.id }), residentToken, 201);
    await jsonRequest(`admin/vehicles/${maintenanceVehicle.id}`, { method: "PATCH", body: JSON.stringify({ status: "MAINTENANCE", maintenanceReason: "E2E maintenance" }) }, adminToken);
    const affected = await jsonRequest<Array<{ id: string }>>("admin/bookings/affected", {}, adminToken);
    if (!affected.some((booking) => booking.id === atRisk.booking.id)) throw new Error("Maintenance booking was not marked AT_RISK");
    const reassigned = await jsonRequest<BookingResult["booking"]>(`admin/bookings/${atRisk.booking.id}/reassign`, jsonBody({ reserveVehicleId: reserveVehicle.id, reason: "MAINTENANCE" }), adminToken);
    if (reassigned.status !== "BOOKED" || reassigned.reassignedVehicleId !== reserveVehicle.id) throw new Error("Reserve reassignment did not restore the booking");
    const residentReassigned = await jsonRequest<BookingResult["booking"]>(`bookings/${atRisk.booking.id}`, {}, residentToken);
    if (residentReassigned.reassignedVehicle?.id !== reserveVehicle.id) throw new Error("Resident booking detail did not expose the effective reserve vehicle");

    const issue = await jsonRequest<{ success: boolean; vehicle: { status: string } }>("driver/vehicle/report-issue", jsonBody({}), driverToken);
    if (!issue.success || issue.vehicle.status !== "BREAKDOWN") throw new Error("Driver report-issue endpoint did not mark the vehicle as BREAKDOWN");

    const recharge = await jsonRequest<{ wallet: { balance: number } }>("wallet/public-demo-recharge", jsonBody({ userId: resident.id, amount: 100 }));
    if (recharge.wallet.balance !== 9_680) throw new Error(`Expected local demo recharge balance 9680, got ${recharge.wallet.balance}`);

    const verified = await prisma.booking.findUniqueOrThrow({ where: { id: mainBookingId }, include: { penalties: true, invoice: true } });
    if (verified.penalties.length !== 1 || !verified.invoice) throw new Error("Database verification of penalty/invoice failed");

    console.log("FAST_TRACK_HTTP_E2E=PASS");
    console.log(`MAIN_BOOKING=${mainBookingId}`);
    console.log(`FINAL_WALLET=${recharge.wallet.balance}`);
    console.log("FLOWS=booking,wallet,driver,otp,completion,late-penalty,invoice-pdf,cancellation,maintenance,reserve-reassignment,driver-issue,demo-recharge");
    void admin;
  } finally {
    if (societyId) await cleanupSocietyFixture(societyId);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
