# Recovery Phase 4A — Reproducible Database Migration Reconciliation

**RECOVERY PHASE 4A STATUS: PASS**

| Result | Status |
| --- | --- |
| Migration files added | **2** forward migrations; original migration preserved |
| Clean migration #1 | **PASS** — 3/3 migrations from an empty local database |
| Clean migration #2 | **PASS** — 3/3 migrations from a second empty local database |
| Unexplained schema drift | **None** — Prisma reported `No difference detected.` twice |
| Prisma validate | **PASS** |
| Typecheck | **PASS** — API, mobile, and root; 0 errors |
| Lint | **PASS** — API, mobile, and root; 0 errors / 0 warnings |
| Backend build | **PASS** |
| Mobile export | **PASS** |
| Pure tests | **PASS** — 1 allow-listed file, 8/8 tests |

No Neon, production, staging, cloud, or other remote PostgreSQL host was contacted. No seed, database-backed Vitest suite, QA runner, E2E runner, concurrency script, `prisma db push`, `prisma migrate dev`, `prisma migrate reset`, introspection write, or migration-resolution command was run.

## 1. Phase 3B Checkpoint

The Phase 3B pre-commit review found the expected 28 source/test changes, `docs/recovery-phase-3b-lint-hygiene.md`, and the pre-existing `.env.example` change. `git diff --check` passed. The intended Phase 3B source changes were 280 insertions and 170 deletions before adding the report.

The explicit checkpoint allow-list excluded `.env.example`, environment files, credentials, generated output, database files, and migration files. A high-confidence staged secret scan passed. Only the 28 reviewed source/test files and the Phase 3B report were committed.

- Branch: `recovery/v2-reconciliation`
- Phase 3A checkpoint: `44dcd659f5e4fffa379871f8bf3a0b66e79cc56b`
- Phase 3B checkpoint: `904714f0b003fd05f3112ec21b0a9ed79bc95665`
- Commit subject: `refactor: complete recovery type and lint hygiene`
- Pushed: **No**
- Post-commit tracked difference: only the pre-existing `.env.example`

## 2. Original Migration Inventory

The preserved migration history originally contained one migration:

`packages/db/prisma/migrations/20260609070000_initial_mvp/migration.sql`

### PostgreSQL schema and extension

- Creates the `public` schema if absent.
- Creates the `btree_gist` extension, required by the UUID plus time-range GiST exclusion.

### Enums

| Enum | Original labels |
| --- | --- |
| `UserRole` | `RESIDENT`, `ADMIN` |
| `VehicleStatus` | `AVAILABLE`, `MAINTENANCE`, `INACTIVE` |
| `BookingStatus` | `BOOKED`, `COMPLETED`, `CANCELLED` |

### Tables and fields

| Table | Original migration fields |
| --- | --- |
| `Society` | `id`, `name`, `timezone`, `createdAt`, `updatedAt` |
| `Flat` | `id`, `societyId`, `number`, `isActive`, `createdAt`, `updatedAt` |
| `User` | `id`, `societyId`, `flatId`, `role`, `name`, `email`, `phone`, `passwordHash`, `isActive`, `createdAt`, `updatedAt` |
| `Vehicle` | `id`, `societyId`, `name`, `registrationNumber`, `status`, `createdAt`, `updatedAt` |
| `FlatQuota` | `id`, `flatId`, `year`, `allocatedMinutes`, `usedMinutes`, `createdAt`, `updatedAt` |
| `Booking` | `id`, `societyId`, `vehicleId`, `flatId`, `userId`, `quotaYear`, `startTime`, `endTime`, `durationMinutes`, `status`, `cancelledAt`, `createdAt`, `updatedAt` |

### Original constraints

- Six primary keys, one for each table.
- `User_role_flat_check`: only a resident with a flat or an admin without a flat was valid.
- `FlatQuota_year_check`: year from 2020 through 2100.
- `FlatQuota_bounds_check`: allocated and used minutes non-negative, and used minutes no greater than allocated minutes.
- `Booking_valid_interval_check`: end after start.
- `Booking_positive_duration_check`: duration greater than zero.
- `Booking_cancelled_at_check`: `CANCELLED` requires `cancelledAt`; every other status requires it to be null.
- `Booking_vehicle_no_overlap`: same `vehicleId` cannot overlap on `tstzrange(startTime, endTime, '[)')` when status is not `CANCELLED`. It had no turnaround buffer and no reassigned-vehicle coverage.

### Original secondary indexes and unique indexes

- `Flat`: index `(societyId, isActive)`; unique `(societyId, number)`.
- `User`: unique `flatId`, `email`, and `phone`; index `(societyId, role, isActive)`.
- `Vehicle`: index `(societyId, status)`; unique `(societyId, registrationNumber)`.
- `FlatQuota`: index `year`; unique `(flatId, year)`.
- `Booking`: indexes `(societyId, status, startTime)`, `(vehicleId, startTime, endTime)`, `(flatId, createdAt)`, and `(userId, createdAt)`.

### Original foreign keys

Nine foreign keys existed: `Flat.societyId`; `User.societyId`; `User.flatId`; `Vehicle.societyId`; `FlatQuota.flatId`; and `Booking.societyId`, `vehicleId`, `flatId`, and `userId`. Delete behavior was `CASCADE` only for `FlatQuota.flatId`; the others were `RESTRICT`. All used `ON UPDATE CASCADE`.

## 3. Current Prisma Schema Inventory

The target `packages/db/prisma/schema.prisma` declares 15 models and 6 enums. The cleanly migrated database contains 136 application columns across those tables.

### Target enums

| Enum | Target labels in order |
| --- | --- |
| `UserRole` | `RESIDENT`, `ADMIN`, `DRIVER` |
| `VehicleStatus` | `AVAILABLE`, `MAINTENANCE`, `INACTIVE`, `BREAKDOWN` |
| `BookingStatus` | `BOOKED`, `DRIVER_ASSIGNED`, `OTP_PENDING`, `IN_PROGRESS`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `REASSIGNED`, `AT_RISK` |
| `TransactionType` | `CREDIT`, `DEBIT`, `BOOKING_DEBIT`, `REFUND`, `PENALTY`, `RECHARGE` |
| `ReassignReason` | `LATE_RETURN`, `BREAKDOWN`, `MAINTENANCE`, `EMERGENCY` |
| `RechargeRequestStatus` | `PENDING`, `APPROVED`, `REJECTED` |

### Target models and scalar fields

| Model | Scalar fields |
| --- | --- |
| `Society` | `id`, `name`, `timezone`, `createdAt`, `updatedAt` |
| `Flat` | `id`, `societyId`, `number`, `isActive`, `createdAt`, `updatedAt` |
| `User` | `id`, `societyId`, `flatId`, `role`, `name`, `email`, `phone`, `passwordHash`, `isActive`, `createdAt`, `updatedAt` |
| `Vehicle` | `id`, `societyId`, `name`, `registrationNumber`, `hourlyRate`, `status`, `isReserve`, `maintenanceReason`, `expectedReturnDate`, `createdAt`, `updatedAt` |
| `FlatQuota` | `id`, `flatId`, `year`, `weekNumber`, `allocatedMinutes`, `usedMinutes`, `createdAt`, `updatedAt` |
| `Booking` | `id`, `societyId`, `vehicleId`, `flatId`, `userId`, `quotaYear`, `quotaWeek`, `startTime`, `endTime`, `durationMinutes`, `status`, `otp`, `otpGeneratedAt`, `otpExpiresAt`, `otpVerifiedAt`, `otpAttempts`, `otpVerified`, `actualRideStartTime`, `actualEndTime`, `startedAt`, `cancelledAt`, `createdAt`, `updatedAt`, `driverId`, `reassignedVehicleId`, `reassignedAt`, `reassignedReason`, `reassignedByUserId` |
| `Driver` | `id`, `societyId`, `fullName`, `phoneNumber`, `email`, `licenseNumber`, `isActive`, `vehicleId`, `createdAt`, `updatedAt` |
| `Wallet` | `id`, `userId`, `balance`, `createdAt`, `updatedAt` |
| `WalletTransaction` | `id`, `walletId`, `amount`, `type`, `description`, `bookingId`, `createdAt`, `updatedAt` |
| `ReassignmentLog` | `id`, `bookingId`, `originalVehicleId`, `newVehicleId`, `reassignedByUserId`, `reason`, `createdAt` |
| `PenaltyRule` | `id`, `societyId`, `name`, `code`, `amount`, `isActive`, `description`, `createdAt`, `updatedAt` |
| `Penalty` | `id`, `bookingId`, `penaltyRuleId`, `amount`, `notes`, `createdByAdminId`, `createdAt`, `updatedAt` |
| `Notification` | `id`, `userId`, `title`, `message`, `read`, `createdAt` |
| `RechargeRequest` | `id`, `userId`, `amount`, `status`, `notes`, `approvedAt`, `approvedBy`, `createdAt` |
| `Invoice` | `id`, `bookingId`, `subtotal`, `penaltyAmount`, `totalAmount`, `generatedAt` |

The target Prisma definition declares 16 ordinary non-unique indexes, 13 non-primary unique indexes, 15 primary keys, and relations that materialize as 28 foreign keys. PostgreSQL-only checks and exclusion constraints are intentionally outside Prisma Schema Language and are inventoried below.

## 4. Exact Schema Delta

### Enum delta

- Add `DRIVER` to `UserRole`.
- Add `BREAKDOWN` to `VehicleStatus`.
- Add `DRIVER_ASSIGNED`, `OTP_PENDING`, `IN_PROGRESS`, `ACTIVE`, `REASSIGNED`, and `AT_RISK` to `BookingStatus`, preserving target ordering.
- Create `TransactionType`, `ReassignReason`, and `RechargeRequestStatus` with the exact target labels above.

### Existing-table delta

| Existing table | Exact target change |
| --- | --- |
| `Society` | No scalar column change; gains relations to `Driver` and `PenaltyRule`. |
| `Flat` | No scalar or physical constraint change. |
| `User` | Role enum gains `DRIVER`; legacy role/flat check must accept `ADMIN` and `DRIVER` only when `flatId` is null; gains wallet, reassignment, notification, penalty-creator, and recharge relations. |
| `Vehicle` | Add `hourlyRate INTEGER NOT NULL DEFAULT 100`, `isReserve BOOLEAN NOT NULL DEFAULT false`, nullable `maintenanceReason TEXT`, and nullable `expectedReturnDate TIMESTAMPTZ(3)`; status enum gains `BREAKDOWN`; gains driver/reassignment relations. |
| `FlatQuota` | Add required `weekNumber SMALLINT`; replace index `year` with `(year, weekNumber)`; replace unique `(flatId, year)` with `(flatId, year, weekNumber)`; add week range check 1–53. |
| `Booking` | Add required `quotaWeek`; OTP fields `otp`, `otpGeneratedAt`, `otpExpiresAt`, `otpVerifiedAt`, `otpAttempts`, `otpVerified`; ride fields `actualRideStartTime`, `actualEndTime`, `startedAt`; nullable `driverId`; reassignment fields `reassignedVehicleId`, `reassignedAt`, `reassignedReason`, `reassignedByUserId`; add 3 foreign keys; expand lifecycle enum; replace the primary overlap exclusion with the 30-minute form; add a buffered reassigned-vehicle exclusion and quota-week check. |

`Booking.cancelledAt`, the valid-interval check, positive-duration check, cancellation-timestamp check, and existing lookup indexes remain. `FlatQuota` retains its year and allocation-bound checks.

### New-table delta

| New table | Keys and relationships |
| --- | --- |
| `Driver` | Unique `phoneNumber` and `licenseNumber`; indexes `(societyId, isActive)` and `vehicleId`; society `RESTRICT`, optional vehicle `SET NULL`. |
| `Wallet` | Unique `userId`; user `CASCADE`. |
| `WalletTransaction` | Index `(walletId, createdAt)`; wallet `CASCADE`. `bookingId` is a scalar only because the Prisma schema declares no relation. |
| `ReassignmentLog` | Index `(bookingId, createdAt)`; booking `CASCADE`; original/new vehicles and reassigning user `RESTRICT`. |
| `PenaltyRule` | Unique `(societyId, code)`; society `RESTRICT`. |
| `Penalty` | Unique `(bookingId, penaltyRuleId)` and index `bookingId`; booking `CASCADE`; rule and creating user `RESTRICT`. |
| `Notification` | Index `(userId, createdAt)`; user `CASCADE`. |
| `RechargeRequest` | Indexes `(userId, createdAt)` and `(status, createdAt)`; user `CASCADE`; optional approver `SET NULL`. |
| `Invoice` | Unique `bookingId`; booking `CASCADE`. |

The forward delta creates 9 tables, 3 enum types, 16 indexes/unique indexes, and 19 new foreign keys. The 9 original foreign keys remain, producing 28 target foreign keys.

## 5. Legacy Constraint Problems

1. `User_role_flat_check` enumerated only `RESIDENT` and `ADMIN`; a valid DRIVER user with no flat would fail. The replacement explicitly permits residents with a flat and admin/driver users without one.
2. `FlatQuota` was annual: unique `(flatId, year)` with an index on `year`. The target is weekly and requires `weekNumber`, a new compound unique key, a compound lookup index, and a 1–53 check.
3. `BookingStatus` had only three labels. The lifecycle fields and states in the target could not be stored.
4. `Booking_vehicle_no_overlap` used the unbuffered range `[startTime, endTime)`. It allowed a new booking immediately at the preceding end time, contradicting the application’s 30-minute turnaround.
5. `apps/api/update-constraint.ts` contained the intended one-sided buffered end range, but it was an unregistered imperative helper and therefore could not reproduce a database from Git.
6. `packages/db/fix-constraint.ts` attempted a separate reassigned-vehicle exclusion, but it omitted the 30-minute buffer, did not safely handle reruns, and did not cover cross-column primary/reassigned conflicts.
7. The cancellation timestamp, valid interval, positive duration, quota year, and quota allocation-bound checks remain compatible with the target and were retained.

## 6. Migration Strategy

The original migration was preserved unchanged. The repair uses two forward migrations:

1. A Prisma-managed V2 schema migration evolves enums, changes weekly fields/indexes, adds V2 fields and tables, and installs every declared foreign key and index.
2. A PostgreSQL-specific constraint migration repairs legacy checks and installs the 30-minute primary and reassigned GiST exclusions.

The split ensures the `DRIVER` enum value exists in a completed migration before the replacement check constraint refers to it. It also separates Prisma-representable structure from raw PostgreSQL behavior.

For a possible upgrade containing legacy rows:

- Existing bookings derive `quotaYear` with `EXTRACT(ISOYEAR FROM startTime)` and `quotaWeek` with `EXTRACT(WEEK FROM startTime)`, after which `quotaWeek` becomes non-null.
- Existing annual `FlatQuota` rows are preserved once in deterministic week 1, after which `weekNumber` becomes non-null. They are not duplicated into 52/53 weeks because Git contains no approved rule for distributing an annual aggregate. This is structurally safe but remains a business-data remediation risk for any non-empty legacy database.

No migration was generated blindly. Prisma’s local diff supplied the Prisma-managed baseline, which was reviewed and changed to use safe nullable-add/backfill/not-null sequencing before the raw constraints were added.

## 7. Migration Files Created

1. `packages/db/prisma/migrations/20260808090000_v2_schema_reconciliation/migration.sql`
   - 228 lines.
   - Adds 3 enums and evolves 3 legacy enums.
   - Adds/changes all Prisma-managed V2 tables, columns, defaults, indexes, unique keys, and foreign keys.
   - Includes deterministic legacy backfills for `Booking.quotaWeek`/`quotaYear` and `FlatQuota.weekNumber`.
2. `packages/db/prisma/migrations/20260808090100_booking_buffer_constraints/migration.sql`
   - 45 lines.
   - Replaces the role/flat check, adds weekly checks, creates the immutable fixed-30-minute helper, replaces the primary exclusion, and adds the reassigned exclusion.

Supporting fail-closed guard:

- `packages/db/scripts/assert-local-database.mjs`
- Rejects a missing or malformed URL, non-PostgreSQL protocol, any hostname other than `localhost`, `127.0.0.1`, or IPv6 loopback, any port other than `55432`, any user other than `society_ev_recovery`, any database outside `society_ev_recovery_*`, and connection parameters that could override host/port/user/database.
- A simulated `ep-example.neon.tech` URL was rejected; the loopback recovery URL passed.

## 8. Local Disposable PostgreSQL Setup

The registered Windows PostgreSQL service was stopped and referred to a missing installation path, so it was not used. Docker Desktop was already installed; its backend was started without installing additional host infrastructure.

- Docker server: 25.0.3
- Image: `postgres:16-alpine`
- PostgreSQL server: 16.14
- Container: `society-ev-recovery-pg`
- Binding: `127.0.0.1:55432 -> container 5432`
- Recovery-only user: `society_ev_recovery`
- Administration database: `society_ev_recovery_admin`
- Delta-development database: `society_ev_recovery_delta`
- First clean database: `society_ev_recovery_test_1` — destroyed before rehearsal #2
- Second clean database: `society_ev_recovery_test_2` — retained locally for review

The URL supplied to every Prisma command was constructed explicitly for loopback and checked by the guard. Root dotenv loading reported zero database environment values, and the explicit process values took precedence. No remote connection string was used or printed.

## 9. First Clean Migration Result

An empty `society_ev_recovery_test_1` database was created only after the guard passed. The exact repository migration directory was deployed with `prisma migrate deploy`.

Applied in order:

1. `20260609070000_initial_mvp`
2. `20260808090000_v2_schema_reconciliation`
3. `20260808090100_booking_buffer_constraints`

Result: **PASS**. Three completed migration records existed, with none rolled back. No seed or application DB test suite ran.

## 10. Schema Equivalence Result

Prisma’s read-only diff from the first migration-created local schema to `prisma/schema.prisma` returned exit code 0 and `No difference detected.`

Catalog verification found:

| Object | Verified result |
| --- | --- |
| Application tables | 15 |
| Application columns | 136 |
| Enums | 6, with labels and order exactly matching Prisma |
| Foreign keys | 28 |
| Primary keys | 15 |
| Non-primary unique indexes | 13 |
| Prisma-declared ordinary indexes | 16 |
| Check constraints | 8 |
| Exclusion constraints | 2 |
| Required extension | `btree_gist` present |
| Buffer helper | `booking_buffer_end(timestamptz)`, immutable and parallel-safe |

The catalog’s 28 `CREATE UNIQUE INDEX` objects consist of 15 primary-key indexes and 13 Prisma unique indexes. Its 18 non-unique index objects consist of 16 Prisma indexes and the 2 GiST indexes backing the exclusion constraints.

Direct constraint probes in the disposable database verified the required boundary:

- Primary vehicle: 10:00–12:00 followed by 12:29 conflicted.
- Primary vehicle: 10:00–12:00 followed by 12:30 succeeded.
- Reassigned vehicle: 14:00–16:00 followed by 16:29 conflicted.
- Reassigned vehicle: 14:00–16:00 followed by 16:30 succeeded.

The four successfully committed probe rows were exactly the two baseline and two `+30m` rows; the two `+29m` inserts were rejected with PostgreSQL exclusion violations.

## 11. Second Clean Migration Result

The exact database name `society_ev_recovery_test_1` was verified, passed through the guard, dropped, and confirmed absent. A different empty database, `society_ev_recovery_test_2`, was then created after its own guard check.

The same three migrations deployed from zero in the same order. Result: **PASS**.

A second Prisma diff returned `No difference detected.` The independent catalog check again found 15 tables, 6 enums, 28 foreign keys, 8 checks, 2 exclusions, and `btree_gist`.

The first rehearsal therefore did not depend on leftover schema or data.

## 12. Raw SQL / PostgreSQL-Specific Constraints

Prisma Schema Language does not represent the following intentional objects, so a zero Prisma diff does not prove them; they were verified separately through PostgreSQL catalogs.

### Retained checks

- `FlatQuota_year_check`
- `FlatQuota_bounds_check`
- `Booking_valid_interval_check`
- `Booking_positive_duration_check`
- `Booking_cancelled_at_check`

### Repaired or added checks

- `User_role_flat_check`: resident plus flat, or admin/driver without flat.
- `FlatQuota_week_number_check`: week 1–53.
- `Booking_quota_week_check`: week 1–53.

### Buffered exclusion behavior

`booking_buffer_end(timestamptz)` returns the supplied timestamp plus a fixed 30 minutes. It is declared immutable because the fixed-minute operation is suitable for a GiST expression.

Both exclusions use `tstzrange(startTime, booking_buffer_end(endTime), '[)')`. Only the end is expanded. Expanding both ends inside every stored range would incorrectly require a 60-minute separation. With a half-open range, exactly 30 minutes is allowed and anything less conflicts.

- `Booking_vehicle_no_overlap`: applies to `vehicleId` for every status except `CANCELLED`.
- `Booking_reassigned_vehicle_no_overlap`: applies to non-null `reassignedVehicleId` for every status except `CANCELLED`.

### Cross-column boundary

The two declarative exclusions do not compare one row’s `vehicleId` with another row’s `reassignedVehicleId`. A single `COALESCE(reassignedVehicleId, vehicleId)` constraint would free the original vehicle after reassignment and contradict the current application, which continues to reserve the original `vehicleId`. Two same-column exclusions cannot express the cross-column comparison. A trigger/advisory-lock design would be substantially more complex and was not invented in this schema-reconciliation phase.

Current services mitigate the gap by allowing resident creation only on non-reserve primary vehicles and reassignment only to reserve vehicles after checking both `vehicleId` and `reassignedVehicleId`. The database does not itself enforce the reserve/non-reserve partition across these foreign keys, so direct SQL or a future bypassing code path remains a risk.

The old helper scripts were inspected but not executed.

## 13. Static Regression Results

All static commands used the explicit loopback recovery URL where Prisma configuration could be loaded.

| Gate | Result | Evidence |
| --- | --- | --- |
| Prisma generate | **PASS** | Prisma Client 7.8.0 generated. |
| Prisma validate | **PASS** | `prisma/schema.prisma` valid. |
| API typecheck | **PASS** | 0 errors. |
| Mobile typecheck | **PASS** | 0 errors. |
| Root typecheck | **PASS** | All participating workspaces passed. |
| API lint | **PASS** | 0 errors / 0 warnings with `--max-warnings=0`. |
| Mobile lint | **PASS** | 0 errors / 0 warnings with `--max-warnings=0`. |
| Root lint | **PASS** | Recursive API/mobile lint passed. |
| Backend production build | **PASS** | Next.js 16.2.7 compiled, typechecked, and generated 15/15 static pages. |
| Mobile web export | **PASS** | Expo/Metro bundled 1,243 modules and exported the ignored web output. |
| Pure booking-range tests | **PASS** | Exactly `tests/booking-range.test.ts`; 8/8 passed. |
| `git diff --check` | **PASS** | No whitespace errors. |

Next’s generated `apps/api/next-env.d.ts` route import was restored to the exact checkpoint blob after the production build. `.next`, Expo `dist`, generated Prisma client files, and other build artifacts are ignored and absent from the intended Git change set.

## 14. Remaining Database Risks

1. **Remote database state remains unknown by design.** Neon was not contacted. Its actual schema, PostgreSQL version, migration table, ad-hoc helper state, and data compatibility still require a separately approved, non-mutating discovery/snapshot phase before any remote deployment.
2. **Legacy annual quota data has no approved weekly conversion.** The forward migration places a pre-existing annual row in week 1 without multiplying it. A real non-empty upgrade needs an approved data-remediation policy.
3. **The migration was proven from zero and from an empty initial-schema delta database, not against populated legacy data.** A populated synthetic or sanitized local upgrade rehearsal is still required.
4. **Cross-column primary/reassigned conflicts are application-enforced.** Direct database writes can violate that domain partition.
5. **Raw helpers remain in the repository.** Running `apps/api/update-constraint.ts` or `packages/db/fix-constraint.ts` later could replace or conflict with the reconciled constraints; they should be retired in a reviewed follow-up.
6. **PostgreSQL version compatibility needs confirmation before remote use.** The clean rehearsals passed on PostgreSQL 16.14. The enum migration adds multiple labels and should not be assumed safe on PostgreSQL 11 or earlier.
7. **Checks/exclusions are outside Prisma’s data model.** CI needs catalog assertions in addition to Prisma drift checks to prevent their silent loss.
8. **Seed and product-rule inconsistencies remain.** Weekly quota provisioning, wallet opening balances, reserve vehicles, and penalty-rule setup were deliberately not changed or executed.
9. **Other audited data-model risks remain out of scope.** Examples include the lack of a direct foreign key from a DRIVER user to a `Driver` profile and the scalar-only `WalletTransaction.bookingId`.

## 15. Recommended Next Phase

After review, checkpoint the two migrations, local-only guard, and this report without including `.env.example` or generated output.

Then begin a separate **Recovery Phase 4B — Seed, Upgrade-Data, and Fixture Reconciliation** against disposable local PostgreSQL only:

1. Define and approve the annual-to-weekly quota conversion/provisioning rule.
2. Reconcile wallet opening balances, ledger history, reserve-vehicle fixtures, cancellation/late-return rules, and seed idempotency.
3. Rehearse the forward migrations against populated synthetic MVP data and verify backfill outcomes.
4. Add automated local catalog assertions for checks, extension, buffer boundaries, reassigned conflicts, and the documented cross-column limitation.
5. Only after those gates pass, design isolated database-backed test execution. Remote Neon discovery or deployment must remain a separately authorized step.

Phase 4A changes are intentionally **uncommitted** and **unpushed** for review.
