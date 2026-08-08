import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import pg from "pg";

import { assertLocalDatabaseUrl } from "./assert-local-database.mjs";

const { Client } = pg;
const connectionString = process.argv[2] ?? process.env.DIRECT_URL;
const target = assertLocalDatabaseUrl(connectionString);
const societyId = "00000000-0000-4000-8000-000000000001";

async function rows(client, query, parameters = []) {
  return (await client.query(query, parameters)).rows;
}

const client = new Client({ connectionString });

try {
  await client.connect();

  const society = await rows(
    client,
    `SELECT "id", "name", "timezone" FROM "Society" WHERE "id" = $1`,
    [societyId],
  );
  assert.deepEqual(society, [
    {
      id: societyId,
      name: "Green Meadows Residency",
      timezone: "Asia/Kolkata",
    },
  ]);

  const counts = Object.fromEntries(
    await Promise.all(
      [
        ["flats", `SELECT COUNT(*)::int AS count FROM "Flat" WHERE "societyId" = $1`],
        ["residents", `SELECT COUNT(*)::int AS count FROM "User" WHERE "societyId" = $1 AND "role" = 'RESIDENT'`],
        ["driverUsers", `SELECT COUNT(*)::int AS count FROM "User" WHERE "societyId" = $1 AND "role" = 'DRIVER'`],
        ["admins", `SELECT COUNT(*)::int AS count FROM "User" WHERE "societyId" = $1 AND "role" = 'ADMIN'`],
        ["drivers", `SELECT COUNT(*)::int AS count FROM "Driver" WHERE "societyId" = $1`],
        ["normalVehicles", `SELECT COUNT(*)::int AS count FROM "Vehicle" WHERE "societyId" = $1 AND NOT "isReserve"`],
        ["reserveVehicles", `SELECT COUNT(*)::int AS count FROM "Vehicle" WHERE "societyId" = $1 AND "isReserve"`],
        ["wallets", `SELECT COUNT(*)::int AS count FROM "Wallet" AS wallet JOIN "User" AS resident ON resident."id" = wallet."userId" WHERE resident."societyId" = $1`],
        ["transactions", `SELECT COUNT(*)::int AS count FROM "WalletTransaction" AS transaction JOIN "Wallet" AS wallet ON wallet."id" = transaction."walletId" JOIN "User" AS resident ON resident."id" = wallet."userId" WHERE resident."societyId" = $1`],
        ["rules", `SELECT COUNT(*)::int AS count FROM "PenaltyRule" WHERE "societyId" = $1`],
      ].map(async ([name, query]) => {
        const result = await rows(client, query, [societyId]);
        return [name, result[0].count];
      }),
    ),
  );
  assert.deepEqual(counts, {
    flats: 50,
    residents: 50,
    driverUsers: 5,
    admins: 1,
    drivers: 5,
    normalVehicles: 5,
    reserveVehicles: 1,
    wallets: 50,
    transactions: 50,
    rules: 2,
  });

  const quotaPeriods = await rows(
    client,
    `WITH society AS (
       SELECT "timezone" FROM "Society" WHERE "id" = $1
     ), expected AS (
       SELECT
         EXTRACT(ISOYEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE "timezone"))::int AS year,
         EXTRACT(WEEK FROM (CURRENT_TIMESTAMP AT TIME ZONE "timezone"))::int AS week
       FROM society
       UNION
       SELECT
         EXTRACT(ISOYEAR FROM ((CURRENT_TIMESTAMP + INTERVAL '7 days') AT TIME ZONE "timezone"))::int,
         EXTRACT(WEEK FROM ((CURRENT_TIMESTAMP + INTERVAL '7 days') AT TIME ZONE "timezone"))::int
       FROM society
     )
     SELECT expected.year, expected.week, COUNT(flat."id")::int AS "quotaCount"
     FROM expected
     LEFT JOIN "FlatQuota" AS quota
       ON quota."year" = expected.year AND quota."weekNumber" = expected.week
     LEFT JOIN "Flat" AS flat
       ON flat."id" = quota."flatId" AND flat."societyId" = $1
     GROUP BY expected.year, expected.week
     ORDER BY expected.year, expected.week`,
    [societyId],
  );
  assert.equal(quotaPeriods.length, 2);
  assert.ok(quotaPeriods.every((period) => period.quotaCount === 50));

  const quotaMismatch = await rows(
    client,
    `SELECT COUNT(*)::int AS count
     FROM "FlatQuota" AS quota
     JOIN "Flat" AS flat ON flat."id" = quota."flatId"
     WHERE flat."societyId" = $1
       AND (quota."allocatedMinutes" <> 960 OR quota."usedMinutes" <> 0)`,
    [societyId],
  );
  assert.equal(quotaMismatch[0].count, 0);

  const walletMismatch = await rows(
    client,
    `SELECT wallet."id"
     FROM "Wallet" AS wallet
     JOIN "User" AS resident ON resident."id" = wallet."userId"
     LEFT JOIN "WalletTransaction" AS transaction ON transaction."walletId" = wallet."id"
     WHERE resident."societyId" = $1
     GROUP BY wallet."id", wallet."balance"
     HAVING wallet."balance" <> 5000
        OR COUNT(transaction."id") <> 1
        OR COALESCE(SUM(CASE
             WHEN transaction."type" IN ('CREDIT', 'REFUND', 'RECHARGE') THEN transaction."amount"
             ELSE -transaction."amount"
           END), 0) <> wallet."balance"`,
    [societyId],
  );
  assert.deepEqual(walletMismatch, []);

  const vehiclePolicy = await rows(
    client,
    `SELECT "name", "registrationNumber", "hourlyRate", "isReserve", "status"::text
     FROM "Vehicle" WHERE "societyId" = $1 ORDER BY "registrationNumber"`,
    [societyId],
  );
  assert.deepEqual(vehiclePolicy, [
    { name: "EV 1", registrationNumber: "MH-01-EV-1000", hourlyRate: 100, isReserve: false, status: "AVAILABLE" },
    { name: "EV 2", registrationNumber: "MH-01-EV-1001", hourlyRate: 150, isReserve: false, status: "AVAILABLE" },
    { name: "EV 3", registrationNumber: "MH-01-EV-1002", hourlyRate: 100, isReserve: false, status: "AVAILABLE" },
    { name: "EV 4", registrationNumber: "MH-01-EV-1003", hourlyRate: 150, isReserve: false, status: "AVAILABLE" },
    { name: "EV 5", registrationNumber: "MH-01-EV-1004", hourlyRate: 100, isReserve: false, status: "AVAILABLE" },
    { name: "Reserve EV 1", registrationNumber: "MH-01-EV-1099", hourlyRate: 100, isReserve: true, status: "AVAILABLE" },
  ]);

  const driverMismatch = await rows(
    client,
    `SELECT driver."id"
     FROM "Driver" AS driver
     LEFT JOIN "User" AS login
       ON login."phone" = driver."phoneNumber"
      AND login."societyId" = driver."societyId"
      AND login."role" = 'DRIVER'
      AND login."isActive"
     LEFT JOIN "Vehicle" AS vehicle ON vehicle."id" = driver."vehicleId"
     WHERE driver."societyId" = $1
       AND (login."id" IS NULL OR vehicle."id" IS NULL OR vehicle."isReserve")`,
    [societyId],
  );
  assert.deepEqual(driverMismatch, []);

  const rules = await rows(
    client,
    `SELECT "code", "amount", "isActive"
     FROM "PenaltyRule" WHERE "societyId" = $1 ORDER BY "code"`,
    [societyId],
  );
  assert.deepEqual(rules, [
    { code: "CANCELLATION", amount: 100, isActive: true },
    { code: "LATE_RETURN_PER_HOUR", amount: 100, isActive: true },
  ]);

  const historyCounts = await rows(client, `
    SELECT
      (SELECT COUNT(*)::int FROM "Booking") AS bookings,
      (SELECT COUNT(*)::int FROM "ReassignmentLog") AS reassignments,
      (SELECT COUNT(*)::int FROM "Penalty") AS penalties,
      (SELECT COUNT(*)::int FROM "Notification") AS notifications,
      (SELECT COUNT(*)::int FROM "RechargeRequest") AS recharges,
      (SELECT COUNT(*)::int FROM "Invoice") AS invoices
  `);
  assert.deepEqual(historyCounts[0], {
    bookings: 0,
    reassignments: 0,
    penalties: 0,
    notifications: 0,
    recharges: 0,
    invoices: 0,
  });

  const fingerprintSources = await Promise.all([
    rows(client, `SELECT "id", "name", "timezone" FROM "Society" WHERE "id" = $1 ORDER BY "id"`, [societyId]),
    rows(client, `SELECT "id", "number", "isActive" FROM "Flat" WHERE "societyId" = $1 ORDER BY "id"`, [societyId]),
    rows(client, `SELECT "id", "flatId", "role"::text, "name", "email", "phone", "isActive" FROM "User" WHERE "societyId" = $1 ORDER BY "id"`, [societyId]),
    rows(client, `SELECT "id", "name", "registrationNumber", "hourlyRate", "status"::text, "isReserve", "maintenanceReason", "expectedReturnDate" FROM "Vehicle" WHERE "societyId" = $1 ORDER BY "id"`, [societyId]),
    rows(client, `SELECT quota."id", quota."flatId", quota."year", quota."weekNumber", quota."allocatedMinutes", quota."usedMinutes" FROM "FlatQuota" AS quota JOIN "Flat" AS flat ON flat."id" = quota."flatId" WHERE flat."societyId" = $1 ORDER BY quota."id"`, [societyId]),
    rows(client, `SELECT wallet."id", wallet."userId", wallet."balance" FROM "Wallet" AS wallet JOIN "User" AS resident ON resident."id" = wallet."userId" WHERE resident."societyId" = $1 ORDER BY wallet."id"`, [societyId]),
    rows(client, `SELECT transaction."id", transaction."walletId", transaction."amount", transaction."type"::text, transaction."description", transaction."bookingId" FROM "WalletTransaction" AS transaction JOIN "Wallet" AS wallet ON wallet."id" = transaction."walletId" JOIN "User" AS resident ON resident."id" = wallet."userId" WHERE resident."societyId" = $1 ORDER BY transaction."id"`, [societyId]),
    rows(client, `SELECT "id", "phoneNumber", "email", "licenseNumber", "isActive", "vehicleId" FROM "Driver" WHERE "societyId" = $1 ORDER BY "id"`, [societyId]),
    rows(client, `SELECT "id", "code", "amount", "isActive" FROM "PenaltyRule" WHERE "societyId" = $1 ORDER BY "id"`, [societyId]),
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintSources))
    .digest("hex");

  console.log(`DEMO_SEED_ASSERTIONS=PASS database=${target.databaseName}`);
  console.log(`DEMO_SEED_FINGERPRINT=${fingerprint}`);
  console.log(
    `DEMO_QUOTA_PERIODS=${quotaPeriods.map((period) => `${period.year}-W${period.week}`).join(",")}`,
  );
} finally {
  await client.end();
}
