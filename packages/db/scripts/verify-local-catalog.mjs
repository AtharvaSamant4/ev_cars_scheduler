import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

import { assertLocalDatabaseUrl } from "./assert-local-database.mjs";

const { Client } = pg;
const connectionString = process.argv[2] ?? process.env.DIRECT_URL;
const target = assertLocalDatabaseUrl(connectionString);

const expectedTables = [
  "Booking",
  "Driver",
  "Flat",
  "FlatQuota",
  "Invoice",
  "Notification",
  "Penalty",
  "PenaltyRule",
  "ReassignmentLog",
  "RechargeRequest",
  "Society",
  "User",
  "Vehicle",
  "Wallet",
  "WalletTransaction",
];

const expectedEnums = {
  BookingStatus: [
    "BOOKED",
    "DRIVER_ASSIGNED",
    "OTP_PENDING",
    "IN_PROGRESS",
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
    "REASSIGNED",
    "AT_RISK",
  ],
  ReassignReason: ["LATE_RETURN", "BREAKDOWN", "MAINTENANCE", "EMERGENCY"],
  RechargeRequestStatus: ["PENDING", "APPROVED", "REJECTED"],
  TransactionType: ["CREDIT", "DEBIT", "BOOKING_DEBIT", "REFUND", "PENALTY", "RECHARGE"],
  UserRole: ["RESIDENT", "ADMIN", "DRIVER"],
  VehicleStatus: ["AVAILABLE", "MAINTENANCE", "INACTIVE", "BREAKDOWN"],
};

const requiredChecks = [
  "Booking_cancelled_at_check",
  "Booking_positive_duration_check",
  "Booking_quota_week_check",
  "Booking_valid_interval_check",
  "FlatQuota_bounds_check",
  "FlatQuota_week_number_check",
  "FlatQuota_year_check",
  "User_role_flat_check",
];

async function expectExclusion(client, insert, label) {
  await client.query(`SAVEPOINT ${label}`);
  let exclusionError;

  try {
    await insert();
  } catch (error) {
    exclusionError = error;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${label}`);
  assert.equal(
    exclusionError?.code,
    "23P01",
    `${label} should be rejected by an exclusion constraint`,
  );
}

async function insertBooking(client, values) {
  await client.query(
    `INSERT INTO "Booking" (
       "id", "societyId", "vehicleId", "flatId", "userId", "quotaYear",
       "quotaWeek", "startTime", "endTime", "durationMinutes",
       "reassignedVehicleId", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, 2035, 1, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
    [
      values.id,
      values.societyId,
      values.vehicleId,
      values.flatId,
      values.userId,
      values.startTime,
      values.endTime,
      values.durationMinutes,
      values.reassignedVehicleId ?? null,
    ],
  );
}

const client = new Client({ connectionString });
let transactionOpen = false;

try {
  await client.connect();

  const tables = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  assert.deepEqual(
    tables.rows.map((row) => row.tablename),
    expectedTables,
  );

  const enums = await client.query(`
    SELECT type.typname,
           json_agg(enum.enumlabel ORDER BY enum.enumsortorder) AS labels
    FROM pg_type AS type
    JOIN pg_enum AS enum ON enum.enumtypid = type.oid
    JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public'
    GROUP BY type.typname
    ORDER BY type.typname
  `);
  assert.deepEqual(
    Object.fromEntries(enums.rows.map((row) => [row.typname, row.labels])),
    expectedEnums,
  );

  const extension = await client.query(
    `SELECT COUNT(*)::int AS count FROM pg_extension WHERE extname = 'btree_gist'`,
  );
  assert.equal(extension.rows[0].count, 1);

  const constraints = await client.query(`
    SELECT catalog_constraint.conname,
           catalog_constraint.contype,
           pg_get_constraintdef(catalog_constraint.oid) AS definition
    FROM pg_constraint AS catalog_constraint
    JOIN pg_namespace AS namespace ON namespace.oid = catalog_constraint.connamespace
    WHERE namespace.nspname = 'public'
      AND catalog_constraint.contype IN ('c', 'x')
    ORDER BY catalog_constraint.conname
  `);
  const byName = new Map(
    constraints.rows.map((constraint) => [constraint.conname, constraint]),
  );

  for (const checkName of requiredChecks) {
    assert.equal(byName.get(checkName)?.contype, "c", `${checkName} missing`);
  }
  assert.match(byName.get("User_role_flat_check").definition, /DRIVER/);
  assert.match(byName.get("FlatQuota_week_number_check").definition, /53/);
  assert.equal(byName.get("Booking_vehicle_no_overlap")?.contype, "x");
  assert.equal(
    byName.get("Booking_reassigned_vehicle_no_overlap")?.contype,
    "x",
  );
  assert.match(
    byName.get("Booking_vehicle_no_overlap").definition,
    /booking_buffer_end/,
  );
  assert.match(
    byName.get("Booking_reassigned_vehicle_no_overlap").definition,
    /booking_buffer_end/,
  );

  await client.query("BEGIN");
  transactionOpen = true;

  const ids = {
    society: randomUUID(),
    flat: randomUUID(),
    user: randomUUID(),
    primary1: randomUUID(),
    primary2: randomUUID(),
    primary3: randomUUID(),
    primary4: randomUUID(),
    reserve: randomUUID(),
  };
  const suffix = ids.society.slice(0, 8).toUpperCase();

  await client.query(
    `INSERT INTO "Society" ("id", "name", "updatedAt")
     VALUES ($1, 'Catalog Verification', CURRENT_TIMESTAMP)`,
    [ids.society],
  );
  await client.query(
    `INSERT INTO "Flat" ("id", "societyId", "number", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [ids.flat, ids.society, `VERIFY-${suffix}`],
  );
  await client.query(
    `INSERT INTO "User" (
       "id", "societyId", "flatId", "role", "name", "passwordHash", "updatedAt"
     ) VALUES ($1, $2, $3, 'RESIDENT', 'Catalog Verifier', 'not-a-login', CURRENT_TIMESTAMP)`,
    [ids.user, ids.society, ids.flat],
  );

  for (const [index, vehicleId] of [
    ids.primary1,
    ids.primary2,
    ids.primary3,
    ids.primary4,
    ids.reserve,
  ].entries()) {
    await client.query(
      `INSERT INTO "Vehicle" (
         "id", "societyId", "name", "registrationNumber", "isReserve", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        vehicleId,
        ids.society,
        index === 4 ? "Verification Reserve" : `Verification Primary ${index + 1}`,
        `VERIFY-${suffix}-${index + 1}`,
        index === 4,
      ],
    );
  }

  const base = {
    societyId: ids.society,
    flatId: ids.flat,
    userId: ids.user,
  };

  await insertBooking(client, {
    ...base,
    id: randomUUID(),
    vehicleId: ids.primary1,
    startTime: "2035-01-01T10:00:00Z",
    endTime: "2035-01-01T12:00:00Z",
    durationMinutes: 120,
  });
  await expectExclusion(
    client,
    () =>
      insertBooking(client, {
        ...base,
        id: randomUUID(),
        vehicleId: ids.primary1,
        startTime: "2035-01-01T12:29:00Z",
        endTime: "2035-01-01T13:29:00Z",
        durationMinutes: 60,
      }),
    "primary_gap_29",
  );
  await insertBooking(client, {
    ...base,
    id: randomUUID(),
    vehicleId: ids.primary1,
    startTime: "2035-01-01T12:30:00Z",
    endTime: "2035-01-01T13:30:00Z",
    durationMinutes: 60,
  });

  await insertBooking(client, {
    ...base,
    id: randomUUID(),
    vehicleId: ids.primary2,
    reassignedVehicleId: ids.reserve,
    startTime: "2035-01-02T14:00:00Z",
    endTime: "2035-01-02T16:00:00Z",
    durationMinutes: 120,
  });
  await expectExclusion(
    client,
    () =>
      insertBooking(client, {
        ...base,
        id: randomUUID(),
        vehicleId: ids.primary3,
        reassignedVehicleId: ids.reserve,
        startTime: "2035-01-02T16:29:00Z",
        endTime: "2035-01-02T17:29:00Z",
        durationMinutes: 60,
      }),
    "reassigned_gap_29",
  );
  await insertBooking(client, {
    ...base,
    id: randomUUID(),
    vehicleId: ids.primary4,
    reassignedVehicleId: ids.reserve,
    startTime: "2035-01-02T16:30:00Z",
    endTime: "2035-01-02T17:30:00Z",
    durationMinutes: 60,
  });

  await client.query("ROLLBACK");
  transactionOpen = false;

  console.log(`LOCAL_CATALOG_ASSERTIONS=PASS database=${target.databaseName}`);
  console.log("PRIMARY_BUFFER=+29 rejected,+30 accepted");
  console.log("REASSIGNED_BUFFER=+29 rejected,+30 accepted");
  console.log("CROSS_COLUMN_PRIMARY_REASSIGNED=APPLICATION_ENFORCED_NOT_ASSERTED");
} finally {
  if (transactionOpen) {
    await client.query("ROLLBACK");
  }
  await client.end();
}
