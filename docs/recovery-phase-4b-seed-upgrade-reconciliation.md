# Recovery Phase 4B — Seed, Legacy-Data Upgrade & Fixture Reconciliation

**RECOVERY PHASE 4B STATUS: PASS**

| Result | Status |
| --- | --- |
| Populated legacy migration | **PASS** — initial MVP plus 21 preserved application rows upgraded with both V2 migrations |
| Data loss | **None** — all expected legacy rows and identifiers preserved |
| Booking backfill | **PASS** — society-timezone ISO year/week verified for all 5 bookings |
| Quota backfill | **PASS structurally** — 3 annual rows preserved in week 1; semantic remediation still required |
| Clean seed | **PASS** |
| Repeated seed | **PASS** — identical stable content fingerprint |
| Catalog assertions | **PASS** — structure and four buffer-boundary probes |
| Typecheck | **PASS** — API, mobile, and root; 0 errors |
| Lint | **PASS** — API, mobile, and root; 0 errors / 0 warnings |
| Build | **PASS** — backend production build and mobile export |
| Pure tests | **PASS** — 1 allow-listed file, 8/8 tests |

No Neon, production, staging, cloud, or other remote PostgreSQL database was contacted. Every database mutation used an explicit `127.0.0.1:55432` recovery URL that passed the local-only guard. No existing application database test suite, seed against a remote database, `db push`, `migrate resolve`, QA, E2E, or concurrency command was run.

## 1. Phase 4A Checkpoint

The Phase 4A review found exactly the intended two migration files, local-only database guard, and Phase 4A report. The pre-existing `.env.example` was excluded. Staged path, whitespace, generated-output, database-file, and high-confidence secret checks passed.

- Branch: `recovery/v2-reconciliation`
- Phase 4A checkpoint: `49a994e7b6390e748072a27c51914f490e805f21`
- Commit subject: `fix: reconcile v2 database migration history`
- Pushed: **No**
- Post-commit tracked difference: only the pre-existing `.env.example`

Phase 4B later found a populated-data defect in the unreleased booking backfill: extracting ISO fields directly from `TIMESTAMPTZ` depended on the migration session timezone. The V2 migration now joins `Society` and extracts from `startTime AT TIME ZONE Society.timezone`. Both Phase 4B databases were built with this corrected version. The older disposable Phase 4A `society_ev_recovery_delta` and `society_ev_recovery_test_2` databases were verified by exact name and removed so their superseded migration checksums cannot be reused accidentally.

## 2. Original Seed Problems

### Quota

- Created 50 quota rows: exactly one current-week row per flat.
- Used `new Date().getFullYear()` independently from its ISO week calculation, producing an incorrect year/week pair near ISO year boundaries.
- Did not provision the week containing the end of the rolling seven-day booking horizon.
- Grouped usage by `flatId` and `quotaYear`, not `flatId`, `quotaYear`, and `quotaWeek`.
- Wrote the entire annual grouped usage into only the current weekly row. This could make the dashboard/current row incorrect or violate `usedMinutes <= allocatedMinutes`.
- Seeded bookings in many weeks without provisioning their matching weekly quota rows.

### Wallet

- Prisma schema default: ₹0.
- Main seed create balance: ₹1,000 with a matching credit.
- Main seed rerun behavior: forcibly reset every existing wallet balance to ₹1,000 without reconciling its ledger.
- Resident lazy creation, admin adjustment, mock recharge, and recharge approval opening balance: ₹5,000 with a matching credit.
- Admin resident creation creates no wallet; the resident receives the lazy ₹5,000 wallet when a wallet path is first used.
- The penalty edge path creates a missing wallet at ₹0 to avoid granting promotional funds while applying a charge.

The clean demo opening policy was therefore selected as ₹5,000. The ₹0 schema/penalty cases remain non-promotional technical fallbacks, not the seeded/onboarding policy.

### Vehicles and drivers

- Created five normal EVs and no reserve EV, so reassignment had no usable fixture.
- Created five DRIVER users and five `Driver` profiles with matching phone numbers, usable shared credentials, and one normal vehicle assignment each. This linkage was conceptually correct despite the schema lacking a direct user/profile foreign key.
- Vehicle reruns reset operational status to `AVAILABLE`, which could erase maintenance state.

### Penalties and artificial history

- Main seed created neither `CANCELLATION` nor `LATE_RETURN_PER_HOUR`.
- A separate unregistered script created only the ₹100/hour late-return rule.
- Seven time-dependent bookings were deleted/recreated, including booking dates not backed by correct weekly quotas.
- Those bookings had no matching booking-debit/refund ledger history, so wallet balances did not represent the displayed booking history.
- Recharge requests, notifications, and invoices were not needed as base fixtures.

### Local compatibility

The old seed instantiated `PrismaNeon`, which is appropriate for Neon but not a raw local PostgreSQL TCP server. The seed now uses `@prisma/adapter-pg`; the application runtime remains on its existing Neon adapter.

## 3. Approved Demo Seed Policy

The following policy was stated before editing and used for the Phase 4B implementation:

| Area | Demo policy |
| --- | --- |
| Resident opening balance | ₹5,000, one matching `CREDIT` transaction, created only when the wallet does not exist |
| Weekly quota | 960 minutes / 16 hours per flat per ISO week |
| Provisioning horizon | Society-local current ISO week and the ISO week containing `now + 7 days` |
| Normal vehicles | 5 |
| Reserve vehicles | 1 |
| Hourly rates | Normal EVs: ₹100, ₹150, ₹100, ₹150, ₹100; reserve: ₹100 |
| Cancellation penalty | Fixed ₹100 demo rule |
| Late-return penalty | ₹100 per started late hour |
| Drivers | 5 DRIVER login users and 5 phone-linked profiles, each assigned to a normal EV |
| Artificial history | None: no bookings, recharges, notifications, penalties, reassignment logs, or invoices |

The seed establishes a coherent demonstration environment rather than pretending to reproduce production accounting history.

## 4. Seed Changes

- Added `@prisma/adapter-pg` 7.8.0 and `pg` 8.16.3 to the database package and updated the lockfile.
- Replaced the seed’s Neon adapter with `PrismaPg` for direct local PostgreSQL compatibility.
- Computes society-local calendar dates with `Intl.DateTimeFormat` and derives valid ISO year/week pairs.
- Provisions the distinct weeks containing the start and end of the seven-day horizon, including ISO year rollover.
- Upserts quota allocation but preserves existing `usedMinutes`.
- Creates a ₹5,000 wallet and matching opening CREDIT only when absent. Existing wallets and ledgers are not reset or rewritten.
- Creates five normal EVs and one reserve EV. Reruns reconcile names, rates, and reserve classification but preserve operational status and maintenance metadata.
- Creates five DRIVER users and five phone-linked profiles. Existing password hashes are preserved on rerun.
- Creates exactly the two configured penalty rules. Reruns preserve existing rule amounts/active state while reconciling names/descriptions.
- Removed all artificial booking/accounting history from the seed.
- Added guarded verification scripts and package registrations for the local guard, demo seed, legacy upgrade, and catalog assertions.

Rerunning the seed is additive/reconciling: it creates missing managed records and updates managed identity/configuration fields, but it does not delete user activity, reset wallet accounting, reset quota usage, reset vehicle status, or overwrite admin-configured penalty amounts.

## 5. Synthetic Legacy Dataset

`packages/db/recovery/legacy-mvp-fixture.sql` targets only the original MVP schema and contains no sensitive data.

| Entity | Fixture content |
| --- | --- |
| Society | 1, timezone `Asia/Kolkata` |
| Flats | 3: L101, L102, L103 |
| Users | 1 ADMIN and 3 RESIDENT users |
| Vehicles | 5 with AVAILABLE, MAINTENANCE, and INACTIVE states represented |
| Annual quotas | 3 rows with 52,560 allocated minutes and used values 240, 180, and 120 |
| Bookings | 5 across ISO weeks 2025-W52 and 2026-W1/W2/W3/W6 |
| Booking statuses | 2 BOOKED, 2 COMPLETED, 1 valid CANCELLED |

All IDs and timestamps are fixed. `packages/db/recovery/legacy-mvp-expected.json` is the machine-readable expected before-state and expected booking backfill definition.

## 6. Pre-Migration Snapshot

Only `20260609070000_initial_mvp` was applied using Prisma Migrate and a temporary byte-identical one-migration view. Prisma created `_prisma_migrations` normally; no migration metadata was fabricated or resolved.

The guarded verifier compared the database to the expected JSON and passed:

| Table | Before count |
| --- | ---: |
| `Society` | 1 |
| `Flat` | 3 |
| `User` | 4 |
| `Vehicle` | 5 |
| `FlatQuota` | 3 |
| `Booking` | 5 |

The snapshot captured all IDs, user roles/flat links, vehicle states, quota values, booking vehicle/flat/user links, original `quotaYear`, start/end times, durations, statuses, and cancellation timestamp. The fixture and observed snapshot matched exactly.

## 7. Populated Legacy Upgrade Result

Standard `prisma migrate deploy` then discovered and applied only:

1. `20260808090000_v2_schema_reconciliation`
2. `20260808090100_booking_buffer_constraints`

Result: **PASS**.

No manual ALTER, `db push`, `migrate resolve`, database recreation, or row deletion occurred between the before snapshot and the upgrade. All three migration records are completed and none is rolled back.

## 8. Data Preservation Verification

The after verifier confirmed the exact Society, Flat, User, Vehicle, FlatQuota, and Booking row counts and IDs. Core user, vehicle, booking, timestamp, relationship, and status fields matched the before-state.

New vehicle defaults were correct on every preserved vehicle:

- `hourlyRate = 100`
- `isReserve = false`
- `maintenanceReason = null`
- `expectedReturnDate = null`

Booking backfills, computed in `Asia/Kolkata`, were:

| Booking suffix | Original quota year | V2 ISO year/week | Status |
| --- | ---: | --- | --- |
| `0051` | 2025 | 2025-W52 | COMPLETED |
| `0052` | 2025 | 2026-W1 | BOOKED |
| `0053` | 2026 | 2026-W2 | CANCELLED |
| `0054` | 2026 | 2026-W3 | COMPLETED |
| `0055` | 2026 | 2026-W6 | BOOKED |

The year change for the December 29 booking is intentional: the old system stored calendar year 2025, while the V2 target stores ISO year 2026.

All three annual quota rows retained their ID, flat, year, 52,560 allocation, and used-minute value. Each received `weekNumber = 1`. This is structurally valid but is not a truthful weekly entitlement conversion.

The nine new V2 tables were empty after migration, proving the forward migration did not manufacture wallet, driver, penalty, notification, recharge, reassignment, or invoice history.

## 9. Annual-to-Weekly Quota Analysis

The legacy fields represented a single annual allocation and annual consumed total. They do not encode when the entitlement should be available during the year, so dividing by 52 would invent a policy, create rounding issues, and could place historical usage into the wrong week.

### Option A — archive legacy annual quota

Preserve annual rows in a dedicated archive/export and begin normal weekly quota only from an approved cutover week. This offers the strongest audit trail but requires a new archive representation because the current `FlatQuota` table is weekly.

### Option B — distribute remaining annual entitlement

Calculate `allocatedMinutes - usedMinutes` at cutover and spread it over remaining weeks. This appears equitable but requires decisions about partial weeks, 52/53-week years, rounding, exhausted/overused accounts, and whether old annual entitlement was intended to accrue evenly.

### Option C — prototype cutover

Preserve the before snapshot and historical bookings, treat the migrated week-1 row as a temporary legacy carrier, and initialize the standard 960-minute quota only for the current and next horizon weeks. Do not infer historical weekly usage beyond preserved bookings.

**Recommendation: Option C for this prototype/demo.** It is the least destructive and does not pretend the old annual total can be converted accurately. Implementation should be a separately reviewed local remediation command that archives/marks or removes the temporary week-1 carrier only after the policy is approved. Phase 4B did not perform that destructive conversion.

## 10. Clean V2 Seed Result

A separate empty `society_ev_recovery_seed_test` database received all three migrations from zero, with no schema drift, and then the repaired seed.

Verified result:

- 1 demo society.
- 50 flats, 50 resident users, 50 wallets.
- 100 quota rows: 50 for 2026-W32 and 50 for 2026-W33, each 960 allocated and 0 used.
- 50 wallet transactions: exactly one ₹5,000 opening CREDIT per wallet.
- Every wallet balance equals its signed ledger total.
- 5 normal EVs plus 1 reserve EV with the declared rates.
- 5 DRIVER users plus 5 phone-linked profiles; every profile is assigned to a normal EV.
- `CANCELLATION = ₹100` and `LATE_RETURN_PER_HOUR = ₹100`, both active.
- 0 bookings, reassignments, penalties, notifications, recharge requests, and invoices.
- Demonstration resident/admin/driver login identities exist.

Result: **PASS**.

## 11. Seed Repeatability Result

The seed ran a second time against the same database. The verifier repeated every count, quota, wallet-ledger, vehicle, driver-linkage, rule, and empty-history assertion.

Stable content fingerprint after run 1:

`7515e99be537bfdf61855b77ddc10fdc0fec68976dbb62c7e0390fa0810c6f5d`

Stable content fingerprint after run 2:

`7515e99be537bfdf61855b77ddc10fdc0fec68976dbb62c7e0390fa0810c6f5d`

No duplicate users, flats, wallets, opening transactions, quota rows, vehicles, rules, or driver profiles were created. Balances, ledger totals, quota usage, IDs, and managed configuration were unchanged. Result: **PASS**.

## 12. Catalog/Constraint Automation

`packages/db/scripts/verify-local-catalog.mjs` imports the same fail-closed URL guard and verifies:

- Exact 15-table application set.
- Exact 6 enums and ordered labels.
- `btree_gist`.
- All 8 checks, including DRIVER role/flat, FlatQuota year/bounds/week, and Booking interval/duration/cancellation/quota-week checks.
- `Booking_vehicle_no_overlap` and `Booking_reassigned_vehicle_no_overlap` using `booking_buffer_end`.
- Primary vehicle `+29` minutes rejected and `+30` accepted.
- Reassigned vehicle `+29` minutes rejected and `+30` accepted.

Probe data is created inside a transaction and always rolled back. The demo seed fingerprint was unchanged after the catalog run.

The script explicitly reports:

`CROSS_COLUMN_PRIMARY_REASSIGNED=APPLICATION_ENFORCED_NOT_ASSERTED`

It does not claim a database-level primary↔reassigned cross-column exclusion exists.

## 13. Legacy Helper Retirement

Repository search confirmed no imports, package scripts, or callers for the obsolete helpers.

Removed:

- `apps/api/update-constraint.ts`
- `packages/db/fix-constraint.ts`

Their behavior is now owned by the reviewed migrations and guarded catalog automation. Leaving them executable could overwrite the reconciled 30-minute constraints.

Also removed `apps/api/scripts/seed-late-penalty.ts`; the main repeatable seed now owns both intended penalty rules, so the one-off helper was redundant.

Historical audit/report references remain documentation only.

## 14. Static Regression

All Prisma-aware commands received the explicit guarded local seed-test URL.

| Gate | Result | Evidence |
| --- | --- | --- |
| Prisma migration diff | **PASS** | `No difference detected.` |
| Prisma generate | **PASS** | Prisma Client 7.8.0 generated. |
| Prisma validate | **PASS** | Schema valid. |
| API typecheck | **PASS** | 0 errors. |
| Mobile typecheck | **PASS** | 0 errors. |
| Root typecheck | **PASS** | All participating workspaces passed. |
| API lint | **PASS** | 0 errors / 0 warnings. |
| Mobile lint | **PASS** | 0 errors / 0 warnings. |
| Root lint | **PASS** | Recursive lint passed. |
| Backend production build | **PASS** | Next.js 16.2.7 compiled, typechecked, and generated 15/15 static pages. |
| Mobile web export | **PASS** | Expo/Metro bundled 1,243 modules and exported ignored output. |
| Pure booking-range test | **PASS** | Exactly 1 file, 8/8 tests. |
| `git diff --check` | **PASS** | No whitespace errors. |

The production build’s generated `apps/api/next-env.d.ts` change was restored to the exact checkpoint blob. Generated Prisma, `.next`, Expo `dist`, and local database files are absent from the intended change set.

## 15. Remaining Risks

1. Annual quota data is only structurally carried in week 1. The recommended Option C remediation is documented but deliberately not executed.
2. No populated production-like dataset was used; the synthetic fixture covers the committed MVP shape and representative states, not every possible corrupt or ad-hoc legacy row.
3. Neon remains completely undiscovered. Its PostgreSQL version, migration checksums, schema, data, and ad-hoc DDL remain unknown.
4. Admin quota UI defaults still expose the old 876-hour assumption, and the admin API normally edits only the current week. Those product/UI defects were outside seed reconciliation.
5. Resident `currentQuotaYear/currentQuotaWeek` reads society timezone but currently derives from process-local time without applying it. Booking range normalization does apply society timezone. Boundary behavior needs a dedicated repair.
6. The database schema still has a neutral wallet default of ₹0, and the penalty-only missing-wallet edge intentionally creates ₹0. Normal demo/onboarding wallet paths use the approved ₹5,000 policy.
7. Driver login/profile linkage remains phone-based with no database foreign key.
8. Cross-column primary/reassigned overlap remains application-enforced.
9. Existing application integration tests remain potentially destructive/shared-state tests and were not run.
10. Modifying the unreleased V2 migration changed its checksum after the Phase 4A checkpoint. All current Phase 4B rehearsals use the corrected checksum; any other disposable database created with the prior checksum must be recreated rather than resolved.

## 16. Recommended Next Phase

After review, checkpoint the Phase 4B seed, migration-backfill correction, local verification tooling, fixture, helper removals, dependency changes, and this report. Continue excluding `.env.example` and generated output.

Recommended next work is **Recovery Phase 4C — Weekly Quota Cutover & Runtime Boundary Reconciliation**, still local-only:

1. Approve and implement Option C as an explicit, guarded remediation for populated legacy databases.
2. Replace the admin UI’s 876-hour defaults with weekly values and make week selection/provisioning explicit.
3. Fix society-timezone current-week calculation at ISO boundaries.
4. Define ongoing current/next-week provisioning beyond seed data.
5. Rehearse remediation against a fresh copy of the synthetic upgraded database.

After quota cutover is coherent, begin an isolated database-test phase that gives every suite its own disposable database and removes shared/destructive cleanup behavior before running wallet, reserve, maintenance, penalty, recharge, ride, trip-completion, QA, E2E, or concurrency tests.

Phase 4B changes are intentionally **uncommitted** and **unpushed** for review.
