import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import pg from "pg";

import { assertLocalDatabaseUrl } from "./assert-local-database.mjs";

const { Client } = pg;
const stage = process.argv[2];
const connectionString = process.argv[3] ?? process.env.DIRECT_URL;

if (!["before", "after"].includes(stage)) {
  throw new Error("usage: verify-legacy-upgrade.mjs <before|after> [database-url]");
}

const target = assertLocalDatabaseUrl(connectionString);
const expected = JSON.parse(
  await readFile(
    new URL("../recovery/legacy-mvp-expected.json", import.meta.url),
    "utf8",
  ),
);

function normalize(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalize(nestedValue)]),
    );
  }

  return value;
}

async function applicationCounts(client) {
  const tables = Object.keys(expected.counts);
  const counts = {};

  for (const table of tables) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"`,
    );
    counts[table] = result.rows[0].count;
  }

  return counts;
}

async function commonSnapshot(client, includeV2Fields) {
  const society = await client.query(
    `SELECT "id", "name", "timezone" FROM "Society" ORDER BY "id"`,
  );
  const flats = await client.query(
    `SELECT "id", "number", "isActive" FROM "Flat" ORDER BY "id"`,
  );
  const users = await client.query(
    `SELECT "id", "flatId", "role"::text, "name", "email", "phone", "isActive"
     FROM "User" ORDER BY "id"`,
  );
  const vehicleColumns = includeV2Fields
    ? `, "hourlyRate", "isReserve", "maintenanceReason", "expectedReturnDate"`
    : "";
  const vehicles = await client.query(
    `SELECT "id", "name", "registrationNumber", "status"::text${vehicleColumns}
     FROM "Vehicle" ORDER BY "id"`,
  );
  const quotaColumns = includeV2Fields ? `, "weekNumber"` : "";
  const quotas = await client.query(
    `SELECT "id", "flatId", "year", "allocatedMinutes", "usedMinutes"${quotaColumns}
     FROM "FlatQuota" ORDER BY "id"`,
  );
  const bookingColumns = includeV2Fields ? `, "quotaWeek"` : "";
  const bookings = await client.query(
    `SELECT "id", "vehicleId", "flatId", "userId", "quotaYear"${bookingColumns},
            "startTime", "endTime", "durationMinutes", "status"::text, "cancelledAt"
     FROM "Booking" ORDER BY "id"`,
  );

  return normalize({
    counts: await applicationCounts(client),
    society: society.rows[0],
    flats: flats.rows,
    users: users.rows,
    vehicles: vehicles.rows,
    quotas: quotas.rows,
    bookings: bookings.rows,
  });
}

function expectedBeforeSnapshot() {
  return {
    ...expected,
    bookings: expected.bookings.map(
      ({ expectedQuotaYear, expectedQuotaWeek, ...booking }) => booking,
    ),
  };
}

function verifyPreservedRows(snapshot) {
  assert.deepEqual(snapshot.counts, expected.counts);
  assert.deepEqual(snapshot.society, expected.society);
  assert.deepEqual(snapshot.flats, expected.flats);
  assert.deepEqual(snapshot.users, expected.users);

  for (const [index, expectedVehicle] of expected.vehicles.entries()) {
    const actualVehicle = snapshot.vehicles[index];
    assert.deepEqual(
      {
        id: actualVehicle.id,
        name: actualVehicle.name,
        registrationNumber: actualVehicle.registrationNumber,
        status: actualVehicle.status,
      },
      expectedVehicle,
    );
    assert.equal(actualVehicle.hourlyRate, 100);
    assert.equal(actualVehicle.isReserve, false);
    assert.equal(actualVehicle.maintenanceReason, null);
    assert.equal(actualVehicle.expectedReturnDate, null);
  }

  for (const [index, expectedQuota] of expected.quotas.entries()) {
    const actualQuota = snapshot.quotas[index];
    assert.deepEqual(
      {
        id: actualQuota.id,
        flatId: actualQuota.flatId,
        year: actualQuota.year,
        allocatedMinutes: actualQuota.allocatedMinutes,
        usedMinutes: actualQuota.usedMinutes,
      },
      expectedQuota,
    );
    assert.equal(actualQuota.weekNumber, 1);
  }

  for (const [index, expectedBooking] of expected.bookings.entries()) {
    const actualBooking = snapshot.bookings[index];
    assert.deepEqual(
      {
        id: actualBooking.id,
        vehicleId: actualBooking.vehicleId,
        flatId: actualBooking.flatId,
        userId: actualBooking.userId,
        startTime: actualBooking.startTime,
        endTime: actualBooking.endTime,
        durationMinutes: actualBooking.durationMinutes,
        status: actualBooking.status,
        cancelledAt: actualBooking.cancelledAt,
      },
      {
        id: expectedBooking.id,
        vehicleId: expectedBooking.vehicleId,
        flatId: expectedBooking.flatId,
        userId: expectedBooking.userId,
        startTime: expectedBooking.startTime,
        endTime: expectedBooking.endTime,
        durationMinutes: expectedBooking.durationMinutes,
        status: expectedBooking.status,
        cancelledAt: expectedBooking.cancelledAt,
      },
    );
    assert.equal(actualBooking.quotaYear, expectedBooking.expectedQuotaYear);
    assert.equal(actualBooking.quotaWeek, expectedBooking.expectedQuotaWeek);
  }
}

const client = new Client({ connectionString });

try {
  await client.connect();
  const snapshot = await commonSnapshot(client, stage === "after");

  if (stage === "before") {
    assert.deepEqual(snapshot, expectedBeforeSnapshot());
    console.log(`LEGACY_BEFORE_SNAPSHOT=PASS database=${target.databaseName}`);
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    verifyPreservedRows(snapshot);

    const newTableCounts = await client.query(`
      SELECT table_name, row_count
      FROM (
        SELECT 'Driver' AS table_name, COUNT(*)::int AS row_count FROM "Driver"
        UNION ALL SELECT 'Wallet', COUNT(*)::int FROM "Wallet"
        UNION ALL SELECT 'WalletTransaction', COUNT(*)::int FROM "WalletTransaction"
        UNION ALL SELECT 'ReassignmentLog', COUNT(*)::int FROM "ReassignmentLog"
        UNION ALL SELECT 'PenaltyRule', COUNT(*)::int FROM "PenaltyRule"
        UNION ALL SELECT 'Penalty', COUNT(*)::int FROM "Penalty"
        UNION ALL SELECT 'Notification', COUNT(*)::int FROM "Notification"
        UNION ALL SELECT 'RechargeRequest', COUNT(*)::int FROM "RechargeRequest"
        UNION ALL SELECT 'Invoice', COUNT(*)::int FROM "Invoice"
      ) AS counts
      ORDER BY table_name
    `);
    assert.ok(newTableCounts.rows.every((row) => row.row_count === 0));

    const migrations = await client.query(`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ORDER BY "started_at"
    `);
    assert.deepEqual(
      migrations.rows.map((row) => row.migration_name),
      [
        "20260609070000_initial_mvp",
        "20260808090000_v2_schema_reconciliation",
        "20260808090100_booking_buffer_constraints",
      ],
    );

    console.log(`LEGACY_AFTER_UPGRADE=PASS database=${target.databaseName}`);
    console.log(
      JSON.stringify(
        {
          counts: snapshot.counts,
          bookingBackfills: snapshot.bookings.map((booking) => ({
            id: booking.id,
            quotaYear: booking.quotaYear,
            quotaWeek: booking.quotaWeek,
            status: booking.status,
          })),
          quotaBackfills: snapshot.quotas.map((quota) => ({
            id: quota.id,
            year: quota.year,
            weekNumber: quota.weekNumber,
            allocatedMinutes: quota.allocatedMinutes,
            usedMinutes: quota.usedMinutes,
          })),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.end();
}
