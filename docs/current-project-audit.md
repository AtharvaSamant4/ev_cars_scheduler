Here is where the project currently stands.

# Current Project Audit and Recovery Assessment

Audit date: 2026-08-08 (Asia/Kolkata)

Repository audited: `D:\ATHARVA_DATA\EV_CAR_SCHEDULER\ev_cars_scheduler`

The GitHub clone definitely contains the original MVP and substantial later/V2 source code. Two pushed commits explicitly added drivers, wallets, reserve vehicles, trip completion, penalties, recharge flows, notifications, and PDF invoices. The clone is therefore **not** only the early MVP.

However, the project is not currently a reproducible or verified runnable system on this laptop. The largest blocker is database recovery: the current Prisma schema defines 15 models, but Git contains only the original six-table migration. A fresh `prisma migrate deploy` would create a database that does not match the code or seed. Node.js, pnpm, dependencies, generated Prisma code, and backend secrets are also absent, so compile, lint, build, test, and runtime claims cannot be verified yet.

In plain English:

- **Definitely present in pushed source:** resident/admin authentication, resident and admin interfaces, booking CRUD, a seven-day booking window, application-level 30-minute buffer, weekly quota code, wallets and ledger code, reserve reassignment, maintenance impact notifications, driver screens, OTP/start/completion logic, mock recharge flows, and invoice/PDF code.
- **Partial or known broken:** migration history, the annual-to-weekly quota conversion, reserve vehicle propagation, driver-account provisioning and assignment enforcement, maintenance cancellation, QR/demo payments, manual penalties, late penalties, invoice compilation, and several UI/API connections.
- **Missing:** reproducible V2 migrations, real payment gateway/UPI, current documentation, CI, isolated test infrastructure, automatic server-side EV assignment, a resident recharge-request UI, `GET /admin/penalty-rules`, and `POST /driver/vehicle/report-issue`.
- **What was pushed:** all four commits through `c9a8305` dated 2026-06-29, including the two later feature commits described above.
- **Can development continue from this clone?** Yes, this is the only evidenced pushed baseline and is suitable for a recovery branch. It is **not safe to deploy, migrate, seed, or assume operational** until schema/migration drift is reconciled and verification is run against a disposable database.

No application code, migration, or database was changed during this audit. The only file created by the audit is this report.

## 1. Executive Summary

### Overall conclusion

| Question | Answer |
|---|---|
| Is later/V2 work in GitHub? | **Yes.** Commits `a688055` and `c9a8305` contain it. |
| Is the checkout synchronized with GitHub? | **Yes.** `main` is 0 ahead / 0 behind `origin/main`. |
| Are there recovery branches, tags, PR refs, stashes, or dangling commits? | **No evidence of any.** Only `main` exists. |
| Can this clone reveal old-laptop-only changes? | **No.** Uncommitted or unpushed work never reached GitHub. |
| Is the database reproducible from Git? | **No.** One old migration does not represent the current schema. |
| Is the application verified on the new laptop? | **No.** The required Node/pnpm toolchain and environment are absent. |
| Is it safe to run migrations or seed now? | **No.** Preserve/inspect the actual database first and repair migration history in a recovery branch. |

### Highest-priority findings

1. **Critical migration drift.** `packages/db/prisma/schema.prisma` has 15 models and expanded enums; `packages/db/prisma/migrations/20260609070000_initial_mvp/migration.sql` still has six tables and the original enums.
2. **The later work really was pushed.** Git history explicitly records driver/wallet/reserve work on 2026-06-16 and trip completion/penalty/PDF work on 2026-06-29.
3. **The current source has known cross-layer breaks.** Examples include a driver UI calling a deleted endpoint, an admin UI calling a nonexistent endpoint, reserve reassignment not being honored by resident/driver reads, and strict TypeScript types lagging the schema.
4. **Database tests are unsafe against a shared database.** `booking-buffer.test.ts` deletes all bookings in `afterAll`, and several other suites mutate seeded records or penalty rules.
5. **Documentation describes the old MVP.** It still says annual quota, automatic vehicle assignment, no wallet/OTP/payment/penalties, and in places no admin UI.
6. **No real payments exist.** All payment/recharge screens are administrative or mock/demo flows; there is no gateway SDK, webhook, verified provider transaction, or UPI integration.

## 2. Git State

### Current repository state

| Item | Finding |
|---|---|
| Current branch | `main` |
| Current HEAD | `c9a83054f308708afa7317081abe3093ba6e5110` (`c9a8305`) |
| Author/commit date | 2026-06-29 09:55:45 +05:30 |
| Commit message | `feat: implement trip completion, penalty logic and pdf invoice generation` |
| Upstream | `origin/main` |
| Ahead / behind | `0 / 0` |
| Remote fetch/push | `https://github.com/AtharvaSamant4/ev_cars_scheduler.git` |
| Default remote branch | `main` |
| Local branches | `main` only |
| Remote branches | `origin/main` only; `origin/HEAD -> origin/main` |
| Tags | None |
| Stashes | None |
| Pull-request refs | None returned by `git ls-remote` |
| Shallow clone | No |
| Unreachable/dangling Git objects | None returned by `git fsck` |
| Reflog | One event: this fresh clone on 2026-08-08 |

At audit start, `git status --porcelain=v2 --branch` showed `main...origin/main` and one tracked working-tree modification: `.env.example`. Its content is unchanged except that its final newline was removed. This was already present before the audit and was preserved. The root `.env` and `apps/mobile/.env` are ignored and therefore do not appear in Git status.

After this requested deliverable is created, `docs/current-project-audit.md` is an additional intentional audit file; it was not present at HEAD.

### Complete commit history

| Commit | Date (+05:30) | Message | Recovery significance |
|---|---:|---|---|
| `20c3282` | 2026-06-15 14:46:59 | `Initial commit of EV Cars Scheduler` | Original MVP arrived as one large 112-file commit. |
| `ca6ce9a` | 2026-06-15 14:48:06 | `docs: add comprehensive README.md` | Latest narrative documentation update. |
| `a688055` | 2026-06-16 20:46:08 | `feat: complete ev cars scheduler with driver app, resident wallet, and reserve vehicle management` | Pushed driver, wallet, reserve/reassignment, mobile UI, scripts, and tests. |
| `c9a8305` | 2026-06-29 09:55:45 | `feat: implement trip completion, penalty logic and pdf invoice generation` | Pushed arrival/OTP refinements, completion, penalties, recharge/notifications, maintenance tests, and PDF invoice work. |

There is no feature branch to compare with `main`; `main` is the only important branch and its latest commit is `c9a8305`. Remote heads were verified read-only with `git ls-remote`, not inferred only from stale local refs.

### Recovery limits

Git can prove only what was committed and pushed. This fresh clone's reflog begins with the clone operation, and `git fsck` found no detached recovery objects. If the previous laptop contained uncommitted files, commits never pushed to GitHub, IDE local history, patches, or stashes that were never transferred, this clone cannot contain or reconstruct them. Possible external recovery sources are the old disk/laptop, another clone, cloud backup/sync, editor local history, exported patches, or database/provider backups.

## 3. Current Architecture

| Area | Actual code-derived architecture |
|---|---|
| Workspace | pnpm workspaces (`apps/*`, `packages/*`); despite the README, there is no Turborepo dependency or `turbo.json`. |
| Backend + admin | Next.js 16.2.7 App Router and React 19.2.7 in `apps/api`; JSON route handlers and the admin portal share one application/deployment. |
| Admin styling/state | Handwritten `app/globals.css`, React hooks/local state, and a small custom fetch layer. There is no Tailwind dependency/config. |
| Mobile | Expo 54, React Native 0.81.5, Expo Router 6, React 19.1; resident and driver interfaces live in one app. |
| Mobile state | TanStack Query for server state/cache; Zustand for authentication; Expo SecureStore on native and web storage on web. |
| API | Versioned Next route handlers under `/api/v1`; route handler -> service module -> Prisma/raw SQL. |
| Shared validation | Zod 4 contracts in `packages/contracts`. Contracts cover many request bodies but have fallen behind newer statuses/fields in places. |
| Database | PostgreSQL (designed for Neon) through Prisma 7.8 and `@prisma/adapter-neon`; application uses pooled `DATABASE_URL`, Prisma operations use direct `DIRECT_URL`. |
| Authentication | bcrypt password hashes and HS256 JWTs via `jose`; resident logs in by flat/password, admin by email/password, driver by phone/password. |
| Session transport | Bearer tokens for mobile; an HTTP-only `ev_session` cookie for admin; token query parameters are also accepted, mainly used for mobile PDF download. |
| Booking | Resident explicitly chooses a normal vehicle; service validates range/quota/wallet, locks quota/vehicle/wallet rows in a serializable transaction, creates booking, debits wallet, and consumes quota. |
| Quota | Current service/schema use one quota per flat + ISO year + ISO week. The conversion from annual quota is incomplete and inconsistent. |
| Wallet | Integer-rupee balance plus transaction ledger; fares, refunds, penalties, admin adjustment, recharge request, and mock recharge code. |
| Driver | A `Driver` profile plus a separate `User` with role `DRIVER`, associated only by matching phone number. Driver operations mostly use the profile's vehicle, not `Booking.driverId`. |
| Notifications | In-database, in-app notifications only. No push, SMS, email, or external notification provider exists. |
| Payment/recharge | Admin wallet adjustment, admin-approved requests, authenticated mock recharge, resident/demo QR pages, and an unauthenticated demo credit endpoint. No real provider. |
| Invoice | `Invoice` row created during completion and an A4 PDF generated with PDFKit. Known type/data mismatches currently make this path broken/unverified. |

### Documentation currency

| Document | Status | Evidence |
|---|---|---|
| `README.md` | **PARTIALLY OUTDATED** | Core folder layout is broadly right, but it incorrectly says Turborepo/Tailwind, permits Node 18, mentions nonexistent `pnpm db:push`, and omits later features. |
| `apps/api/README.md` | **PARTIALLY OUTDATED** | Core environment and base URL remain useful; endpoint/UI lists stop at the original MVP and its migration instructions are unsafe under current drift. |
| `apps/mobile/README.md` | **PARTIALLY OUTDATED** | Expo/TanStack/Zustand/SecureStore notes remain useful; it calls quota annual and omits driver, wallet, notifications, QR, and invoices. |
| `docs/mvp-technical-design.md` | **OUTDATED as current-state documentation** | It labels itself design-only, specifies annual quota/automatic allocation, and explicitly excludes payments, OTP, notifications, and penalties. |
| `docs/project-handover-and-demo-guide.md` | **OUTDATED** | It describes the original MVP, including annual quota, automatic assignment, adjacent bookings, no penalties/payment/notifications, and no complete admin UI. |

All narrative documents predate both later feature commits. No narrative document is fully current.

## 4. Repository Structure

There are 173 tracked files. Generated/install/build directories are absent and excluded below.

```text
/
├── apps/
│   ├── api/                         # Next.js backend, admin portal, demo payment
│   │   ├── app/
│   │   │   ├── admin/               # Admin web routes
│   │   │   ├── api/v1/              # 46 route files / 60 method-path operations
│   │   │   └── demo-payment/        # Public mock payment page
│   │   ├── src/
│   │   │   ├── admin/               # Admin components, API client, types
│   │   │   ├── lib/                 # Auth, HTTP, time, errors, pagination
│   │   │   └── modules/             # Admin/auth/booking/driver/etc. services
│   │   ├── tests/                   # 10 Vitest files
│   │   └── scripts/                 # QA, E2E, late-penalty helper
│   └── mobile/                      # Expo resident + driver app
│       ├── app/
│       │   ├── (auth)/              # Shared resident/driver login
│       │   ├── (tabs)/              # Resident dashboard/bookings/wallet/etc.
│       │   ├── (driver)/            # Driver dashboard/history
│       │   ├── booking/[id].tsx
│       │   ├── qr-recharge.tsx
│       │   ├── scan-qr.tsx
│       │   └── show-qr.tsx
│       ├── src/{api,components,lib,providers,store,types}/
│       ├── assets/
│       └── scripts/
├── packages/
│   ├── contracts/                   # Shared Zod contracts and inferred types
│   └── db/
│       ├── prisma/
│       │   ├── schema.prisma        # Current 15-model target schema
│       │   ├── seed.ts              # Current demo seed; requires target schema
│       │   └── migrations/          # One original six-table migration only
│       ├── src/                     # Prisma/Neon client and env loader
│       └── fix-constraint.ts        # Unregistered raw-SQL helper
├── docs/
│   ├── mvp-technical-design.md
│   ├── project-handover-and-demo-guide.md
│   └── current-project-audit.md      # This audit
├── scripts/
│   ├── concurrency.ts               # DB/API mutation script, not package-wired
│   └── e2e-validation.ts            # Obsolete endpoint shapes
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
└── ev society cars.mp3              # 45 MB tracked binary, no code use found
```

Notable absences: `.github` workflows, Docker files, EAS config, Tailwind config, Turborepo config, a dedicated test-database configuration, `node_modules`, `.next`, generated Prisma client, and build artifacts.

## 5. Database Inventory

### Critical schema/migration mismatch

The **target schema** in `packages/db/prisma/schema.prisma` defines 15 models and six enums. The **only committed migration**, dated 2026-06-09, creates six tables and three old enums:

- Migration tables: `Society`, `Flat`, `User`, `Vehicle`, `FlatQuota`, `Booking`.
- Migration roles: `RESIDENT`, `ADMIN` only.
- Migration vehicle states: `AVAILABLE`, `MAINTENANCE`, `INACTIVE` only.
- Migration booking states: `BOOKED`, `COMPLETED`, `CANCELLED` only.
- Migration quota key: flat + year (annual), with no `weekNumber`.

The later commits changed `schema.prisma` by more than 200 lines without adding a migration. Therefore:

- A fresh `pnpm db:deploy` would not create wallets, drivers, penalties, notifications, recharge requests, invoices, reassignment logs, OTP fields, reserve fields, or weekly quota columns.
- The old `User_role_flat_check` accepts only resident-with-flat or admin-without-flat and is incompatible with `DRIVER` users.
- The current seed and most V2 services would fail against a database created only from committed migrations.
- The actual schema of any previously used Neon database is **UNKNOWN**. It may have been changed manually or via schema push/ad-hoc scripts, but this clone has no credentials or evidence sufficient to prove that state.

Do not run `db:deploy`, `db:migrate`, `db:seed`, `db push`, or raw helpers until the production/demo database is identified and backed up.

### Current schema entities

| Entity | Purpose | In current Prisma schema | Reproducible from migrations |
|---|---|---:|---:|
| `Society` | Tenant/society root, name and timezone; owns users, fleet, bookings, drivers, penalty rules. | Yes | Yes, old shape |
| `Flat` | Residence; one optional resident, quotas, and bookings; unique number per society. | Yes | Yes |
| `User` | Authentication/account record for resident, admin, or driver; wallet/booking/notification ownership. | Yes | **No for DRIVER-compatible shape** |
| `Vehicle` | EV identity, rate, operational status, reserve flag, maintenance reason/return date. | Yes | **Only old fields** |
| `FlatQuota` | Allocated and used minutes for a flat and ISO week. | Yes | **No; migration is annual** |
| `Booking` | Reservation plus quota period, vehicle/resident, statuses, driver, OTP, actual times, reassignment, penalties, invoice. | Yes | **Only original fields/statuses** |
| `Driver` | Driver profile, licence/contact/activity, society and assigned vehicle. | Yes | No |
| `Wallet` | One integer balance per user. | Yes | No |
| `WalletTransaction` | Append-style credit/debit/fare/refund/penalty/recharge ledger. | Yes | No |
| `ReassignmentLog` | Audit row from original vehicle to new reserve vehicle, actor, reason, time. | Yes | No |
| `PenaltyRule` | Society-scoped named/code-based monetary rule and active flag. | Yes | No |
| `Penalty` | A rule application to a booking, with amount, notes, and creating user. | Yes | No |
| `Notification` | In-app title/message/read state for a user. | Yes | No |
| `RechargeRequest` | Resident top-up request and pending/approved/rejected audit data. | Yes | No |
| `Invoice` | One final stored subtotal, penalty amount, and total per booking. | Yes | No |

### Requested database concepts: actual presence

| Requested concept | Actual finding |
|---|---|
| Society / Flat / User / Vehicle / Booking | Present in schema and original migration, though several current fields/enums are not migrated. |
| FlatQuota | Present; current schema is weekly, sole migration is annual. |
| Wallet / WalletTransaction | Present in schema only; services/UI exist; no migration. |
| Driver | Present in schema only; separate from `User` and linked operationally by phone, not FK. |
| Penalty / cancellation configuration | `PenaltyRule` and `Penalty` are present in schema only. Cancellation uses rule code `CANCELLATION`; late return uses `LATE_RETURN_PER_HOUR`. |
| Notifications | `Notification` present in schema only. No external delivery entity/provider. |
| Reserve vehicle fields | `Vehicle.isReserve`; `Booking.reassignedVehicleId/reassignedAt/reassignedReason/reassignedByUserId`. Schema only. |
| Reassignment/audit records | `ReassignmentLog` present in schema only. |
| OTP / ride lifecycle | Stored directly on `Booking`: OTP timestamps/attempts/verified flag plus actual start/end and legacy `startedAt`. No separate Ride entity. |
| Recharge/payment | `RechargeRequest` exists; no provider Payment, PaymentAttempt, webhook, UPI, or settlement entity. |
| Invoice/bill | `Invoice` exists; no separate line-item or bill entity. |

### Enums in the target schema

- `UserRole`: `RESIDENT`, `ADMIN`, `DRIVER`.
- `VehicleStatus`: `AVAILABLE`, `MAINTENANCE`, `INACTIVE`, `BREAKDOWN`.
- `BookingStatus`: `BOOKED`, `DRIVER_ASSIGNED`, `OTP_PENDING`, `IN_PROGRESS`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `REASSIGNED`, `AT_RISK`.
- `TransactionType`: `CREDIT`, `DEBIT`, `BOOKING_DEBIT`, `REFUND`, `PENALTY`, `RECHARGE`.
- `ReassignReason`: `LATE_RETURN`, `BREAKDOWN`, `MAINTENANCE`, `EMERGENCY`.
- `RechargeRequestStatus`: `PENDING`, `APPROVED`, `REJECTED`.

### Relations, indexes, and constraints

The target schema includes unique keys/indexes for society-flat number, user flat/email/phone, society-registration number, flat-year-week quota, booking lookup dimensions, driver phone/licence, wallet user, society-rule code, booking-rule penalty, invoice booking, and chronological wallet/reassignment/notification/recharge queries.

The original SQL migration adds useful checks and PostgreSQL `btree_gist`, but those checks describe the old model:

- `User_role_flat_check` permits only resident-with-flat or admin-without-flat.
- `FlatQuota_year_check` and allocation bounds are annual and have no week.
- `Booking_valid_interval_check`, positive duration, and cancelled-at consistency exist.
- `Booking_vehicle_no_overlap` prevents direct interval overlap on `vehicleId`, but has no 30-minute buffer and knows nothing about `reassignedVehicleId`.

Later database intent exists only in unregistered helpers:

- `apps/api/update-constraint.ts` drops/recreates the vehicle exclusion constraint with `endTime + 30 minutes`.
- `packages/db/fix-constraint.ts` adds an exclusion constraint for `reassignedVehicleId`, but without the same 30-minute buffer.
- `apps/api/scripts/seed-late-penalty.ts` creates a ₹100/hour late rule but is not part of the main seed or package scripts.
- `apps/api/drop-drivers.ts` deletes all drivers and is explicitly destructive.

These scripts are evidence of manual database evolution, not a safe or complete migration chain.

### Seed audit

The main seed currently creates one society, 50 flats/residents, five normal vehicles, five driver users/profiles, wallets, current-week quotas, and demo bookings. Important inconsistencies:

- It allocates 16 hours only for the current ISO week; it does not provision future weeks in the seven-day horizon when a week boundary is crossed.
- It groups booking usage by flat + year, not week, then writes that annual sum into the current week's `usedMinutes`.
- It resets existing seeded wallet balances to ₹1,000 without reconciling ledger history; lazy wallet paths use ₹5,000 and the schema default is ₹0.
- It seeds no reserve vehicle, cancellation rule, or late-return rule.
- It creates matching driver `User` and `Driver` records by phone, but the admin create-driver workflow does not do this.
- It deletes/recreates fixed demo bookings, so it is not a read-only operation.

## 6. Feature Inventory

Legend:

- ✅ **COMPLETE**: the requested behavior is coherently present in the relevant source layers.
- 🟡 **PARTIAL**: meaningful implementation exists, but a requested layer or rule is missing/inconsistent.
- ❌ **NOT IMPLEMENTED**: no implementation was found, or current behavior directly contradicts the requested feature.
- ⚠️ **IMPLEMENTED BUT BROKEN/UNVERIFIED**: code exists but has a known break or could not be executed in this environment.

These are source-level classifications. The unreproducible V2 database migration and missing local toolchain remain global runtime blockers.

### Original MVP

| Feature | Status | Concrete evidence and finding |
|---|---|---|
| Resident authentication | ⚠️ | Route/service/UI/seed exist: `auth/resident/login`, `src/modules/auth/service.ts`, mobile login, resident `User`. JWT/password flow is coherent but was not run. |
| Admin authentication | ⚠️ | Admin login/logout routes, bcrypt/JWT service, HTTP-only cookie, login UI and shell guard exist; not run. |
| Resident dashboard | 🟡 | `/dashboard` and resident home show quota/upcoming bookings. Missing-quota display fabricates 16h that booking creation cannot use; reassigned vehicle is not shown. |
| Booking availability | ⚠️ | `/availability`, range validation, quota check, normal-EV list, buffer logic, and mobile UI exist; DB/runtime unverified. |
| Booking creation | ⚠️ | Serializable service locks quota, selected vehicle and wallet; creates booking, debits fare and increments quota. It depends on unmigrated V2 fields/tables. |
| Automatic EV assignment | ❌ | Current contract requires `vehicleId`; service accepts it and the resident UI explicitly asks the resident to select a vehicle. |
| Annual quota | ❌ | The current schema/service are per ISO week. Annual documentation/defaults remain only as inconsistent leftovers. |
| Booking history | ⚠️ | Resident upcoming/history service and segmented mobile UI exist; not run. |
| Cancellation | 🟡 | Future raw `BOOKED` cancellation, wallet refund/penalty, quota restore and resident button exist. `AT_RISK` residents cannot cancel and tests are unsafe/unrun. |
| Admin dashboard | ⚠️ | Metrics API and dashboard UI exist; status metrics lag the expanded lifecycle and were not run. |
| Flats management | ⚠️ | List/create/update/deactivate APIs and UI exist; quota defaults are inconsistent and runtime is unverified. |
| Residents management | ⚠️ | List/create/update/deactivate APIs and UI exist; not run. |
| Vehicle management | 🟡 | Fleet CRUD/deactivation/status/reserve/maintenance UI exist. Hourly price is not in the admin contract/UI despite being used for billing. |
| Quota management | 🟡 | Admin current-week screen/API exist, but UI/defaults still use 876h, URL exposes only year, and future-week rows are not provisioned. |
| Booking monitoring | 🟡 | Admin list/filter/detail exist. Filters accept only old statuses; detail omits driver/invoice relations while UI expects them. |

### Booking enhancements

| Feature | Status | Concrete evidence and finding |
|---|---|---|
| Rolling seven-day window | ✅ | Enforced in Zod and `normalizeBookingRange`; boundary cases exist in `booking-range.test.ts`. It is a rolling 168 hours from now, not end-of-day based. |
| Mandatory 30-minute buffer | 🟡 | Availability and creation hardcode 30 minutes and exact 30-minute gaps are allowed. The committed DB constraint has no buffer; the replacement is only an ad-hoc script. |
| Reserve/spare EV support | ⚠️ | `Vehicle.isReserve`, admin toggle, reassignment fields/service and tests exist; no migration and no reserve EV in the main seed. |
| Reserve excluded from normal bookings | ✅ | Availability and booking SQL require `isReserve = false`. |
| Manual reserve EV reassignment | ⚠️ | Admin UI/service/log/notification exist, but any authenticated user can call the route, and resident/driver operational reads keep using original `vehicleId`. |
| Reassignment reason/history | ⚠️ | Enum, Booking fields, `ReassignmentLog`, admin audit display and test exist; migration/runtime absent. |
| Maintenance mode | 🟡 | Status/reason/expected-return fields and admin UI exist. Only future raw `BOOKED` rows on original vehicle are marked at risk. |
| Breakdown handling | 🟡 | `BREAKDOWN` shares the maintenance path, but the driver report-issue endpoint was deleted while its UI remains, and notification text always says maintenance. |
| Affected-booking detection | 🟡 | `AT_RISK` query/admin screen exist. It ignores driver-assigned/OTP/in-progress and reassigned-vehicle bookings and does not auto-clear stale risk. |
| Resident maintenance notifications | 🟡 | Database notification writes, GET/mark-read routes, and mobile screen exist. It is in-app only and depends on an unmigrated table. |

Additional maintenance conflict: changing a future booking to `AT_RISK` makes resident cancellation impossible because cancellation accepts only `BOOKED`.

### Wallet and financial features

| Feature | Status | Concrete evidence and finding |
|---|---|---|
| Wallet | ⚠️ | Schema/service/API/UI exist, but no migration; `GET /wallet` accepts any authenticated role and initial balances conflict (schema 0, seed 1000, lazy paths 5000). |
| Booking fare calculation | ✅ | `round(durationMinutes / 60 * vehicle.hourlyRate)` is calculated inside booking transaction. Amounts are integer rupees. |
| EV hourly pricing | 🟡 | `Vehicle.hourlyRate` exists with default 100 and seed rates 100/150; vehicle contracts/admin service/UI cannot change it. |
| Booking wallet deduction | ⚠️ | Fare and `BOOKING_DEBIT` are written in the booking transaction; requires unmigrated wallet tables and unrun DB verification. |
| Cancellation refund | ⚠️ | Original `BOOKING_DEBIT` is ledgered as `REFUND` and credited back; unrun. |
| Configurable cancellation penalty | ⚠️ | `PenaltyRule` code `CANCELLATION`, admin GET/POST and settings UI exist; table is unmigrated and main seed has no rule. |
| Cancellation penalty deduction | ⚠️ | Active fixed penalty is ledgered and netted from refund. It may exceed fare and make the net balance decrease. |
| Wallet transaction ledger | ⚠️ | Model/service/resident transaction list exist; migration absent and re-seeding can make balance diverge from ledger. |
| Resident wallet screen | ⚠️ | Balance, ledger and Add Money UI exist; QR flow is broken/unsafe as described below. |
| Admin wallet management | ⚠️ | List/credit/debit/refund UI/API exist, but listing is not society-scoped and adjustment does not validate target society/role. |

### Recharge and payment: exact version present

| Version | Status | Finding |
|---|---|---|
| Admin manually credits wallet | ⚠️ | Implemented through admin wallet adjustment UI/API; runtime unverified and tenant checks are incomplete. |
| Recharge request workflow | 🟡 | Resident GET/POST APIs, database model, admin list/approve/reject service and UI exist. There is no resident submit/history UI, and process-route params are broken. |
| Mock QR recharge | ⚠️ | Authenticated mock recharge screen/endpoint and a separate resident QR/public demo flow exist, but navigation/network/security are inconsistent. |
| Demo payment page | ⚠️ | `/demo-payment` exists and calls a public credit endpoint. Admin society QR omits required `userId`; mobile discovery uses hardcoded localhost. |
| Real payment gateway | ❌ | No provider SDK, order/payment intent, webhook/signature validation, provider transaction ID, reconciliation, or settlement logic. |
| UPI integration | ❌ | No UPI URI/provider integration or verified UPI transaction handling. |

The public demo endpoint has no authentication, no society authorization, no ₹10,000 cap, and directly credits any supplied resident ID by any positive numeric amount. It must never be treated as a real payment flow.

### Driver and ride lifecycle

| Feature | Status | Concrete evidence and finding |
|---|---|---|
| Driver entity | ⚠️ | `Driver` and `Booking.driverId` exist in target schema; no migration. |
| Driver admin management | 🟡 | List/create/update/vehicle assignment UI/API exist. Creating a Driver profile does not create the required `UserRole.DRIVER` login User/password. |
| Driver assignment | ⚠️ | Admin action writes `Booking.driverId`; dashboard/actions ignore it and authorize by Driver.vehicleId versus Booking.vehicleId. Vehicle compatibility is not validated at assignment. |
| Driver UI/interface | ⚠️ | Driver dashboard/history/actions exist in Expo. Driver layout has no auth/role guard and Report Issue calls a nonexistent endpoint. |
| Ride-start OTP | 🟡 | Arrival regenerates a six-digit OTP, 15-minute expiry and max-five attempts; resident sees it and driver enters it. No scheduled-time gate or assigned-driver check. |
| OTP verification | 🟡 | Wrong attempts increment; success marks verified and starts ride. OTP is plaintext and generated with `Math.random`, not a cryptographic RNG. |
| Actual ride start timestamp | ⚠️ | `actualRideStartTime` is written on OTP verification; migration/runtime absent. |
| Ride completion | ⚠️ | Driver/admin endpoints and buttons exist. Backend allows any state except already completed/cancelled, so OTP/start can be bypassed. |
| Actual ride end timestamp | ⚠️ | `actualEndTime` is persisted; input is not checked against start or for invalid/future chronology. |
| Delay calculation | ✅ | Delay is max(0, actual end - scheduled end) in minutes. |
| Late-return penalty | ⚠️ | Any positive lateness is rounded up to hours and multiplied by DB rule. Main seed omits the rule, `isActive` is ignored, and four completion tests are placeholders. |

### Billing

| Feature | Status | Concrete evidence and finding |
|---|---|---|
| Final ride bill | ⚠️ | One `Invoice` row is created at completion with scheduled fare subtotal + late penalty; no migration and lifecycle can be bypassed. |
| Invoice generation | ⚠️ | Completion service creates invoice data, but meaningful invoice tests are absent and admin detail does not load it. |
| Downloadable PDF invoice | ⚠️ | PDFKit generator, API and resident/admin links exist. Generator reads nonexistent `User.phoneNumber`, while User has `phone`, so strict type/build and PDF path are broken. |

## 7. API Inventory

There are **46 route files and 60 actual method/path operations**. “Effective role” includes service-level checks where a route itself calls generic `requireAuth`.

### Public, authentication and account

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/resident/login` | Public | Resident flat-number/password login; returns JWT/session user. |
| POST | `/api/v1/auth/driver/login` | Public | Driver phone/password login against a `User` with role DRIVER. |
| POST | `/api/v1/auth/admin/login` | Public | Admin email/password login; returns data and sets HTTP-only cookie. |
| POST | `/api/v1/auth/admin/logout` | Public | Clears admin auth cookie; no authentication check. |
| GET | `/api/v1/health` | Public | Executes `SELECT 1`; database liveness, not only process liveness. |
| GET | `/api/v1/ip` | Public | Returns the first external IPv4 address for local QR demo construction. |
| GET | `/api/v1/me` | Any authenticated active User | Current user, society and optional flat. |

### Resident booking and quota

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/dashboard` | Resident | Current weekly quota plus up to five upcoming bookings. |
| GET | `/api/v1/quota/current` | Resident | Current weekly quota/fallback. |
| GET | `/api/v1/availability` | Resident | Validate range and list selectable available non-reserve vehicles. |
| GET | `/api/v1/bookings` | Resident | Paginated `upcoming` or `history` list for own flat. |
| POST | `/api/v1/bookings` | Resident | Create booking for explicit `vehicleId`, debit wallet and consume quota. |
| GET | `/api/v1/bookings/[bookingId]` | Resident, own flat | Booking detail including driver/invoice, but not reassigned vehicle. |
| POST | `/api/v1/bookings/[bookingId]/cancel` | Resident, own flat | Cancel future raw `BOOKED`; refund/net penalty and restore quota. |

### Notifications

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/notifications` | Any authenticated User | Latest 50 notifications for current user. |
| POST | `/api/v1/notifications` | Any authenticated User | Mark all current user's unread notifications read. |

### Wallet, recharge and demo payment

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/wallet` | **Any authenticated User** | Return or lazily create a ₹5,000 wallet; should likely be Resident-only. |
| GET | `/api/v1/wallet/recharge` | Resident | List current resident's recharge requests. |
| POST | `/api/v1/wallet/recharge` | Resident | Create a pending positive-amount recharge request. |
| POST | `/api/v1/wallet/mock-recharge` | Resident | Immediate mock recharge, capped at ₹10,000. |
| POST | `/api/v1/wallet/public-demo-recharge` | **Public** | Directly credit supplied resident `userId`; intentionally mock but dangerously unrestricted. |

### Driver and ride lifecycle

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/driver/dashboard` | Driver | Vehicle-based today/upcoming work list. |
| GET | `/api/v1/driver/bookings/history` | Driver | Vehicle-based past/completed/cancelled history. |
| POST | `/api/v1/driver/bookings/[id]/arrive` | Driver | Generate/reset OTP and set `OTP_PENDING`. |
| POST | `/api/v1/driver/bookings/[id]/verify-otp` | Driver | Verify OTP; set `IN_PROGRESS` and actual start. |
| POST | `/api/v1/driver/bookings/[id]/complete` | Driver | Set actual end, charge late penalty if rule exists, create invoice, complete. |

### Invoice and billing

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/bookings/[bookingId]/invoice/pdf` | Any authenticated; resident limited to own, other roles society-wide | Generate/download PDF invoice. Known field error currently breaks it. |

### Admin dashboard and bookings

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/dashboard` | Admin | Society flat/resident/fleet/booking metrics. |
| GET | `/api/v1/admin/bookings` | Admin | Filtered/paginated booking monitoring. |
| GET | `/api/v1/admin/bookings/[id]` | Admin | Booking detail and reassignment history; currently omits driver/invoice. |
| GET | `/api/v1/admin/bookings/affected` | Admin | List `AT_RISK` bookings. |
| POST | `/api/v1/admin/bookings/[id]/assign-driver` | Admin | Write driver and usually set `DRIVER_ASSIGNED`. |
| POST | `/api/v1/admin/bookings/[id]/complete` | Admin | Complete booking with optional actual-end input. |
| POST | `/api/v1/admin/bookings/[id]/penalties` | Effective Admin | Apply an existing penalty rule and debit wallet; service enforces role. |
| POST | `/api/v1/admin/bookings/[id]/reassign` | **Any authenticated User (bug)** | Reassign to reserve EV; route and service both omit admin-role enforcement. |

### Admin penalty configuration

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/cancellation-penalty` | Admin | Read fixed cancellation amount, defaulting to zero if absent. |
| POST | `/api/v1/admin/cancellation-penalty` | Admin | Upsert the `CANCELLATION` rule amount. |

### Admin drivers

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/drivers` | Admin | List active/all driver profiles. |
| POST | `/api/v1/admin/drivers` | Admin | Create driver profile only; does not provision login User. |
| PATCH | `/api/v1/admin/drivers/[id]` | Admin | Update profile, activity or assigned vehicle. |

### Admin flats and quota

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/flats` | Admin | Paginated flats with current-week quota. |
| POST | `/api/v1/admin/flats` | Admin | Create flat and one current/default quota row. |
| GET | `/api/v1/admin/flats/[id]` | Admin | Flat/resident/quota detail. |
| PATCH | `/api/v1/admin/flats/[id]` | Admin | Update number/activity. |
| DELETE | `/api/v1/admin/flats/[id]` | Admin | Soft-deactivate flat and resident. |
| PUT | `/api/v1/admin/flats/[id]/quota/[year]` | Admin | Upsert supplied year **and current week** allocation. |

### Admin recharge requests

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/recharge-requests` | Admin | Paginated/status-filtered society recharge requests. |
| POST | `/api/v1/admin/recharge-requests/[id]/process` | Admin | Approve/reject and credit on approval; currently reads Promise params incorrectly. |

### Admin residents

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/residents` | Admin | Paginated residents. |
| POST | `/api/v1/admin/residents` | Admin | Create resident for a flat. |
| GET | `/api/v1/admin/residents/[id]` | Admin | Resident detail. |
| PATCH | `/api/v1/admin/residents/[id]` | Admin | Update name/phone/password/activity. |
| DELETE | `/api/v1/admin/residents/[id]` | Admin | Soft-deactivate resident. |

### Admin vehicles

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/vehicles` | Admin | Paginated fleet. |
| POST | `/api/v1/admin/vehicles` | Admin | Create EV; hourly rate cannot be supplied. |
| GET | `/api/v1/admin/vehicles/[id]` | Admin | Vehicle detail. |
| PATCH | `/api/v1/admin/vehicles/[id]` | Admin | Update EV/reserve/status/maintenance metadata. |
| DELETE | `/api/v1/admin/vehicles/[id]` | Admin | Soft-deactivate by setting `INACTIVE`. |

### Admin wallets

| Method | Path | Auth role | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/wallets` | Effective Admin | List residents and balances; service checks role but not society scope. |
| POST | `/api/v1/admin/wallets/[id]/adjust` | Effective Admin | Manual positive credit/debit/refund; target identity/society not validated. |

### Dead routes, missing counterparts, and unfinished endpoints

**UI calls with no API route:**

- `POST /api/v1/driver/vehicle/report-issue` is called by the active driver dashboard but was deleted in `c9a8305`.
- `GET /api/v1/admin/penalty-rules` is called by the admin booking penalty form; no such route exists, so the rule dropdown cannot load.

**Present but without a first-party UI consumer:**

- `GET /api/v1/quota/current`; dashboard obtains quota from `/dashboard`.
- Resident `GET/POST /api/v1/wallet/recharge`; no resident request/history screen.
- Admin GET detail endpoints for flats/residents/vehicles; current forms reuse list objects and consume only PATCH/DELETE.
- `GET /api/v1/health`, intentionally operational rather than UI-driven.

**Obsolete script calls:**

- Root `scripts/e2e-validation.ts` calls nonexistent `/auth/login`, uses wrong availability field names, and attempts DELETE cancellation that no longer exists.
- `apps/api/scripts/e2e-validation.ts` still attempts DELETE cancellation.

**Known endpoint defects:**

- Reassignment authorization is missing.
- Recharge-process route treats Next 16 `params` synchronously even though `apiRoute` defines it as a Promise.
- Public demo recharge bypasses auth, request approval, amount cap and tenant checks.
- Wallet GET is not role-restricted; admin wallet queries are not tenant-safe.
- Invoice PDF has a `phoneNumber`/`phone` mismatch and over-broad non-resident access.
- Completion does not require an OTP-verified/in-progress ride.

## 8. UI Inventory

### Resident mobile app

| File-system route | What it does | Current assessment |
|---|---|---|
| `app/index.tsx` | Redirects by session/role to login, resident tabs or driver tabs. | Present |
| `app/(auth)/login.tsx` | Combined resident/driver login toggle and demo credentials. | Present; auth layout redirects any authenticated role toward resident tabs before root correction. |
| `app/(tabs)/index.tsx` | Resident dashboard, quota, upcoming bookings, logout. | Present; quota fallback issue. |
| `app/(tabs)/book.tsx` | Range entry, availability, explicit vehicle selection and booking. | Present; confirms automatic assignment is absent. |
| `app/(tabs)/bookings.tsx` | Upcoming/history segmented list. | Present |
| `app/(tabs)/wallet.tsx` | Balance, ledger and Add Money. | Present; Add Money opens broken/unsafe QR flow. |
| `app/(tabs)/notifications.tsx` | Latest in-app notifications; marks all read. | Present |
| `app/booking/[id].tsx` | Detail, cancellation, OTP, driver, actual time, invoice link. | Partial; types lag fields and reassigned vehicle omitted. |
| `app/show-qr.tsx` | Resident-specific demo-payment QR. | Broken on typical physical phone because it fetches API IP from hardcoded localhost and falls back to invalid `192.168.0.x`. |
| `app/scan-qr.tsx` | Camera scanner. | Orphan; any QR triggers local recharge and scanned content is ignored. |
| `app/qr-recharge.tsx` | Authenticated direct mock recharge. | Orphan/deep-link only from scanner; not normal wallet navigation. |

Resident tab guard checks for a token but not Resident role.

### Driver interface

The driver interface **does exist** inside the mobile app.

| Route | What it does | Current assessment |
|---|---|---|
| `app/(driver)/index.tsx` | Assigned vehicle, today's/upcoming work, arrive, OTP, complete, report issue. | Partial/broken: work is vehicle-based, not booking-driver-based; Report Issue endpoint missing. |
| `app/(driver)/history.tsx` | Past trip list for driver's assigned vehicle. | Present but ignores `Booking.driverId` and reserve reassignment. |

The driver layout has no authentication or DRIVER-role redirect guard.

### Admin web portal

| Route | Purpose |
|---|---|
| `/` | Basic API landing text. |
| `/admin` | Redirect to `/admin/dashboard`. |
| `/admin/login` | Admin login. |
| `/admin/dashboard` | Society metrics/utilization summary. |
| `/admin/vehicles` | Fleet CRUD/status/reserve/maintenance. |
| `/admin/flats` | Flat create/edit/deactivate. |
| `/admin/residents` | Resident create/edit/deactivate. |
| `/admin/quota` | Current-week quota table/editor, despite annual leftovers. |
| `/admin/bookings` | Booking filters/table. |
| `/admin/bookings/[id]` | Detail, reassignment, penalty, driver assignment, completion, invoice/audit UI. Several data/API seams are broken. |
| `/admin/vehicle-status` | Operational vehicle/status overview. |
| `/admin/drivers` | Driver profiles and vehicle linkage. |
| `/admin/wallets` | Resident balance list and adjustments. |
| `/admin/society-qr` | QR to mock payment page; generated URL lacks required resident `userId`. |
| `/admin/recharge-requests` | Request review/approve/reject; process route broken. |
| `/admin/cancellation-settings` | Fixed cancellation penalty setting. |
| `/admin/affected-bookings` | `AT_RISK` bookings. Also has a redundant static page beside dynamic section route. |
| `/demo-payment` | Public mock gateway, not a real payment page. |

Unknown `/admin/[section]` values silently render the dashboard instead of returning 404.

### Backend/UI coverage summary

| Capability | Coverage |
|---|---|
| Resident/admin auth, dashboard, booking, history, cancellation | **BACKEND + UI** |
| Weekly quota | **BACKEND + UI**, internally inconsistent |
| Reserve/maintenance/affected notifications | **BACKEND + RESIDENT/ADMIN UI**, partial/broken |
| Wallet and admin adjustment | **BACKEND + RESIDENT/ADMIN UI**, security/default issues |
| Recharge request | **BACKEND + ADMIN UI**; resident UI missing |
| Authenticated mock recharge | **BACKEND + orphan RESIDENT UI** |
| Public QR demo recharge | **BACKEND + RESIDENT/ADMIN/WEB UI**, broken/insecure |
| Driver management/assignment/lifecycle | **BACKEND + ADMIN/DRIVER/RESIDENT UI**, assignment model inconsistent |
| Driver issue reporting | **UI ONLY**; endpoint missing |
| Penalty-rule listing | **UI ONLY consumer**; endpoint missing |
| Manual penalty application | **BACKEND + ADMIN UI shell**, unusable because rule list is missing |
| Invoice record/PDF | **BACKEND + RESIDENT/ADMIN UI**, known data/type breaks |
| Real gateway/UPI | **NEITHER** |

## 9. Current Business Rules

The following rules come from current service and schema code, not from the older design documents. “Database configurable” means a value can exist in a database row but has no supported admin control unless stated otherwise.

| Area | Rule actually enforced by current source | Classification | Important qualification |
|---|---|---|---|
| Booking horizon | Start must be in the future and no more than exactly `7 * 24` hours ahead for a non-admin caller. | **HARDCODED** | The shared validator contains an admin bypass, but there is no admin create-booking endpoint. |
| Minimum duration | 60 minutes. | **HARDCODED** | Enforced in `apps/api/src/modules/bookings/service.ts`. |
| Maximum duration | 1,440 minutes (24 hours). | **HARDCODED** | A booking may cross an ISO week, but not the society-local calendar-year boundary. |
| Slot granularity | Both start and end must fall on `:00` or `:30` in the society timezone. | **HARDCODED** | Client validation is not the only check; the service repeats it. |
| Vehicle selection | Resident submits a specific `vehicleId`. | **HARDCODED WORKFLOW** | There is no server-side automatic EV assignment despite the original design. |
| Normal availability | Vehicle must belong to the society, be `AVAILABLE`, not be reserve, and have no non-cancelled conflict. | **HARDCODED + DATABASE STATE** | Vehicle status and reserve flag are admin editable. |
| Vehicle buffer | 30 minutes on both sides; a gap of exactly 30 minutes is allowed. | **HARDCODED** | Service checks it, but the only committed migration has no buffer. A manual, unregistered DDL helper attempts to add it. |
| Quota model | Per flat, ISO year and ISO week; scheduled duration is charged wholly to the booking's start week. | **HARDCODED MODEL; ADMIN-CONFIGURABLE ALLOCATION** | The application allows a cross-week booking but does not split usage. Missing quota rows reject booking. |
| Quota default | Seed and resident display fallback use 960 minutes (16 hours) for the current week. | **CONFLICTING HARDCODED DEFAULTS** | Flat creation contract/admin UI still default to 52,560 minutes/876 hours. The display fallback does not create a usable row. |
| Quota administration | Admin can upsert minutes for the supplied year and silently selected current ISO week. | **ADMIN CONFIGURABLE, PARTIAL** | The route has no week parameter and there is no next-week provisioning or rollover job. |
| Vehicle hourly charge | Schema default is ₹100/hour; seed uses ₹100 or ₹150. | **DATABASE CONFIGURABLE ONLY** | Vehicle contracts, admin service and admin UI omit `hourlyRate`, so an admin cannot configure it through the product. |
| Booking fare | `round(scheduledMinutes / 60 * originalVehicle.hourlyRate)`. | **HARDCODED FORMULA** | No booking-time rate/fare snapshot is stored; invoice calculation can diverge after a rate change. |
| Wallet requirement | An existing wallet with balance at least the full fare is required before booking. | **HARDCODED** | Schema default is ₹0, seed is ₹1,000, and lazy wallet creation uses ₹5,000. Admin-created residents receive no wallet. |
| Cancellation eligibility | Only a future booking whose persisted status is exactly `BOOKED`. | **HARDCODED** | `AT_RISK`, `DRIVER_ASSIGNED`, `OTP_PENDING`, and other non-final states cannot be resident-cancelled. |
| Cancellation money/quota | Credit the original `BOOKING_DEBIT`, subtract a fixed active cancellation rule if present, and restore scheduled quota minutes. | **HARDCODED FLOW + ADMIN-CONFIGURABLE PENALTY** | Cancellation creates wallet ledger entries but no `Penalty` record. Net balance can fall if penalty exceeds refund. |
| Cancellation penalty | One fixed amount under rule code `CANCELLATION`; zero when missing/inactive. | **ADMIN CONFIGURABLE** | There is no time-based slab or percentage rule. Main seed does not create it. |
| Reserve EV | `isReserve` vehicles are excluded from ordinary availability. Reassignment is manual to an `AVAILABLE` reserve vehicle with a reason. | **ADMIN-CONFIGURABLE FLAG; HARDCODED FLOW** | Reassignment logs and notifies, but the endpoint is not admin-protected and downstream resident/driver reads still use the original vehicle. |
| Reassignment conflicts | Service checks a 30-minute window against primary and reassigned vehicle references. | **HARDCODED** | The separate reassigned-vehicle SQL helper has no 30-minute buffer or cross-column protection and is not a migration. |
| Maintenance/breakdown | Admin may set status, reason and expected return. Future raw `BOOKED` rows on the original vehicle become `AT_RISK` and trigger in-app notifications. | **ADMIN CONFIGURABLE + HARDCODED IMPACT** | No automatic reserve reassignment, restoration job, push notification, or expected-return processing exists. The notification text always describes maintenance. |
| Driver identity | Login uses a `User` with role DRIVER; operations locate a separate `Driver` profile by matching phone. | **DATABASE STATE** | There is no User↔Driver foreign key. Admin driver creation creates only the profile, not a login account. |
| Driver assignment | Admin may attach any active same-society Driver to a non-final booking. | **ADMIN CONFIGURABLE, WEAKLY ENFORCED** | No schedule collision or vehicle compatibility check. Driver work/actions ignore `booking.driverId` and use the driver's static vehicle against the original booking vehicle. |
| OTP generation | Six decimal digits from `Math.random`, stored as plaintext, valid for 15 minutes, maximum five failed attempts. | **HARDCODED** | Arrival may occur at any time; creation also writes an earlier OTP without expiry and arrival overwrites it. |
| Ride start | Correct OTP changes `OTP_PENDING` to `IN_PROGRESS`, sets verification time and actual start. | **HARDCODED TRANSITION** | No assigned-driver or scheduled-time enforcement. |
| Ride completion/end | Driver or admin supplies an optional end timestamp, otherwise server time; completion is rejected only for already completed/cancelled rows. | **HARDCODED, BROKEN LIFECYCLE** | OTP/start can be bypassed. End is not validated against start, scheduled time, current time, or chronology. |
| Passive past status | A past raw `BOOKED` row is presented as effectively completed in some responses. | **HARDCODED PRESENTATION ONLY** | The database status, timestamps, wallet, penalty and invoice are not finalized. |
| Late return | `max(0, actualEnd - scheduledEnd)` minutes; any positive delay is rounded up with `ceil(minutes/60)` and multiplied by `LATE_RETURN_PER_HOUR`. | **HARDCODED FORMULA + DATABASE-CONFIGURABLE RATE** | Main seed omits the rule, no normal admin editor exists, `isActive` is ignored, and a missing wallet does not prevent invoice completion. |
| Final invoice | One invoice per booking: scheduled fare subtotal plus automatic late penalty. | **HARDCODED FORMULA** | It uses the current original-vehicle rate, not a booking-time price snapshot; manual penalties are not included. |

### Rule conflicts that materially affect behavior

- The code has moved from annual quota to ISO-week quota, while the only migration, contracts, defaults, utilization calculations, and all narrative documentation retain annual assumptions in places.
- Marking a booking `AT_RISK` makes it ineligible for the only resident cancellation path.
- `Booking.driverId` is an assignment record, but the driver workload and action authorization model is actually vehicle-based.
- `reassignedVehicleId` is written, but the normal resident detail, driver schedule/actions, fare, invoice and several conflict paths continue to treat the original vehicle as operational truth.
- `ACTIVE`/`startedAt` legacy state coexists with `IN_PROGRESS`/`actualRideStartTime`; there is no single coherent lifecycle state machine.
- Business configuration is fragmented: cancellation amount has an admin control, while rate, late penalty, horizon, buffer, OTP limits and most defaults are hardcoded or database-only.

## 10. Tests & Verification Results

### Automated test inventory

There are **10 Vitest files containing 40 declared test cases**. They are not a safe single test suite against a shared or production-like database.

| Suite | Type | What it attempts to validate | Safety/reliability assessment |
|---|---|---|---|
| `apps/api/tests/booking-range.test.ts` | Unit, pure | Future/past ranges, 30-minute alignment, calendar-year boundary, seven-day edge and admin exception. | Meaningful and non-destructive. It could not run because the test runner/dependencies are absent. |
| `apps/api/tests/booking-buffer.test.ts` | Integration + concurrency | Exactly 30-minute gap, zero/29-minute gap, different EV and concurrent duplicate booking. | **Destructive on a shared DB:** `afterAll` calls `prisma.booking.deleteMany({})` and deletes every booking, not only fixtures. |
| `apps/api/tests/wallet-booking.test.ts` | Integration | Fare deduction, insufficient balance and cancellation refund. | Uses the first seeded resident, modifies wallet/quota/bookings/ledger, and has no complete cleanup. |
| `apps/api/tests/reserve-vehicles.test.ts` | Integration + concurrency | Reserve exclusion, reassignment/audit, repeated reassignment and concurrent reassignment. | Mutates seeded data. Its concurrency case targets a non-reserve vehicle, so current rules should make both calls fail rather than exactly one succeed. |
| `apps/api/tests/maintenance-impact.test.ts` | Integration | Future-versus-past impact, `AT_RISK` transition and notification. | Creates an isolated society and is comparatively contained, but still requires and mutates a real DB. |
| `apps/api/tests/penalties.test.ts` | Integration | Read/update cancellation-rule settings. | Deletes/upserts the first real admin society's `CANCELLATION` rule; does not test actual cancellation deduction. |
| `apps/api/tests/recharge-workflow.test.ts` | Integration | Create/list request, approve credit, prevent duplicate processing and reject. | Uses an isolated test society but requires a disposable database. |
| `apps/api/tests/mock-recharge.test.ts` | Integration | Mock credit/request/ledger and amount boundaries. | Uses an isolated test society but requires a disposable database. |
| `apps/api/tests/ride-start-workflow.test.ts` | Integration | Assignment, arrival OTP, bad attempt, correct verification/start and duplicate verification. | Uses an isolated test society; does not prove the driverId/reassignment authorization model. |
| `apps/api/tests/trip-completion.test.ts` | Placeholder | Purports to cover completion, delay, penalties and invoice. | **No coverage:** all four tests are only `expect(true).toBe(true)`. |

### Other validation and E2E scripts

| File | Finding |
|---|---|
| `apps/api/scripts/e2e-validation.ts` | Live API/DB harness; mutates quota and deletes bookings, and still calls obsolete DELETE cancellation. |
| `scripts/e2e-validation.ts` | Older stale duplicate; calls nonexistent `/auth/login`, uses wrong availability fields, and obsolete DELETE cancellation. |
| `scripts/concurrency.ts` | Directly debits the first seeded resident's wallet/quota and creates bookings without cleanup. |
| `apps/api/scripts/qa-runner.ts` | Overwrites a real wallet/quota and runs cancellation/concurrency mutations; also references nonexistent transaction enum values `CANCELLATION_PENALTY` and `PAYMENT`. |
| `apps/api/validation-results.json` | Old artifact, not current proof: its core flow is recorded failed, and its “successful” concurrency record has zero successes with `doubleBookingPrevented: false`. It predates the last feature commit. |

Coverage by requested category:

| Category | Current coverage |
|---|---|
| Unit tests | One meaningful pure range-validator suite. |
| Integration tests | Eight substantive DB/service suites, all currently unrun and several unsafe. |
| Concurrency tests | Booking buffer and reserve suites plus an unsafe standalone script. |
| E2E API tests | Only stale/manual mutation scripts; no dependable current route-level E2E suite. |
| Mobile tests | None. |
| Admin UI tests | None. |
| Driver UI tests | None. |
| Invoice/PDF tests | None. |
| Completion/late penalty tests | Four placeholders; no meaningful coverage. |
| Authorization/cross-tenant tests | None for reassignment, wallets, public recharge, invoice access or driver assignment. |

### Commands attempted and observed on this laptop

| Check | Result | Meaning |
|---|---|---|
| `git diff --check` | **Passed** | No whitespace-error report in the current diff. This is not an application verification. |
| `node --version` | **Could not run: command not found** | Node.js is not installed/available in `PATH`. |
| `pnpm --version` | **Could not run: command not found** | pnpm/Corepack is not installed/available. |
| Dependency presence | **Absent** | No `node_modules`, generated Prisma client, `.next`, or build output was present. |
| TypeScript (`pnpm typecheck`) | **Not runnable** | Toolchain/dependencies absent. |
| Lint (`pnpm lint`) | **Not runnable** | Toolchain/dependencies absent. |
| Production API build (`pnpm build`) | **Not runnable** | Toolchain/dependencies absent. |
| Mobile web export | **Not runnable** | Toolchain/dependencies absent. |
| Prisma schema validation | **Not runnable** | Prisma/dependencies and required root environment are absent. |
| Unit/integration tests | **Not run** | Runner absent; DB suites must also be isolated before execution. |

Static source inspection already exposes likely strict-type/build failures even before commands can run:

- PDF invoice code reads nonexistent `User.phoneNumber`; the model field is `phone`.
- Recharge processing reads Next 16 Promise route params synchronously.
- Admin/mobile response types lag driver, invoice, OTP and ride lifecycle fields used by UI code.
- `/demo-payment` contains lowercase JSX `onclick` rather than React's `onClick`.
- QA tooling references transaction enum members that do not exist.

These are source-level findings, not a substitute for an observed compiler report. The correct status is **unverified with known defects**, not “tests pass” or “application works.”

## 11. Environment Setup Requirements

### Toolchain and platform

| Requirement | Repository requirement / recommendation | New-laptop status |
|---|---|---|
| Git | Any current Git capable of this normal non-shallow clone. | **PRESENT** |
| Node.js | Next 16 requires at least Node 20.9; Prisma 7.8 requires `^20.19`, `^22.12`, or `>=24`. Use a current LTS satisfying Prisma, preferably Node 24 LTS. | **MISSING** |
| pnpm | Root `packageManager` pins `pnpm@10.33.0`. | **MISSING** |
| Dependencies | Install exactly from `pnpm-lock.yaml`. | **MISSING** |
| Prisma client | Generate with the pinned Prisma 7.8 package after environment setup. | **MISSING** |
| PostgreSQL/Neon | Runtime uses pooled Neon URL; Prisma administration uses direct URL. `btree_gist` and constraint creation require suitable DB permissions. | **UNKNOWN**; not contacted |
| Expo | Expo SDK 54; no global Expo CLI is required when using workspace scripts. Physical Expo Go must support SDK 54 and reach the API over LAN. | **UNKNOWN** |
| Android/iOS tooling | Expo Go is sufficient for a basic device demo; Android Studio/emulator or macOS/Xcode is optional for native simulator/build work. | **UNKNOWN** |

The repository has no `.nvmrc`, Volta/asdf file or `engines` declaration. The lockfile and pinned package engines are therefore the reliable compatibility evidence; README advice to use Node 18 is outdated.

### Environment variables

Secret values were not printed or copied during this audit.

| Variable | Required by | Status | Notes |
|---|---|---|---|
| `DATABASE_URL` | API runtime and Neon Prisma adapter | **MISSING** | Root `.env` exists but is empty. Use the pooled application URL. |
| `DIRECT_URL` | Prisma config, migration/administration and seed | **MISSING** | Use the direct database URL, only after the actual DB is identified and backed up. |
| `JWT_SECRET` | JWT signing/verification | **MISSING** | Use a new strong random secret of at least 32 bytes; changing it invalidates old sessions. |
| `JWT_EXPIRES_IN` | JWT lifetime | **MISSING / OPTIONAL** | Code defaults to `7d`; set explicitly for clarity. |
| `EXPO_PUBLIC_API_URL` | Mobile API client | **PRESENT; CORRECTNESS UNKNOWN** | An ignored `apps/mobile/.env` exists, but its endpoint was not disclosed or assumed reachable. It appears demo/local in nature and must be verified for this laptop/LAN. |
| Payment/provider credentials | Real payments | **NOT APPLICABLE / MISSING FEATURE** | No gateway or UPI integration exists, so there are no provider credentials to configure. |

### Exact non-destructive laptop bootstrap

Run these later from PowerShell. They install the toolchain and perform only local dependency/code verification; they do not migrate or seed a database.

```powershell
winget install --exact --id OpenJS.NodeJS.LTS

# Close and reopen PowerShell so PATH is refreshed, then verify the installed LTS.
node --version
npm --version

# Install/enable Corepack and activate the repository-pinned package manager.
npm install --global corepack@latest
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm --version

Set-Location 'D:\ATHARVA_DATA\EV_CAR_SCHEDULER\ev_cars_scheduler'
pnpm install --frozen-lockfile
```

Then edit the existing root `.env` and ignored `apps/mobile/.env` without echoing values into terminal history:

```dotenv
# .env
DATABASE_URL="<pooled-neon-url>"
DIRECT_URL="<direct-neon-url>"
JWT_SECRET="<new-long-random-secret>"
JWT_EXPIRES_IN="7d"

# apps/mobile/.env
EXPO_PUBLIC_API_URL="http://<this-laptop-lan-ip>:3000/api/v1"
```

Once the variables refer to an identified, safely backed-up environment, these are the intended non-mutating source checks:

```powershell
pnpm db:generate
pnpm --filter @society-ev/db exec prisma validate
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @society-ev/mobile export:web
```

Do **not** run `pnpm db:migrate`, `pnpm db:deploy`, `pnpm db:seed`, `pnpm test`, `apps/api/update-constraint.ts`, `packages/db/fix-constraint.ts`, any QA/E2E/concurrency script, or the driver-drop script at this stage. Migration history is incomplete and the tests/scripts can change or delete shared data. Establish a disposable test database and repair/review the migration plan first.

After the recovery gates in section 15 are complete, the normal local launch commands are:

```powershell
pnpm dev
pnpm mobile:start
```

For a physical phone, the API must bind to/reach a LAN-accessible address, Windows Firewall must permit the selected port, laptop and phone must share a network, and `EXPO_PUBLIC_API_URL` must not use `localhost`.

## 12. GitHub Recovery Assessment

### Direct answer

> **Does this GitHub clone appear to contain the work we did near the end of the previous development session?**

**Yes—substantial near-end V2 work is definitely in this clone.** It is not merely the early MVP. GitHub contains pushed commits whose messages and diffs explicitly add the driver application, resident wallets, reserve vehicles, reassignment, trip completion, penalties and PDF invoices.

| Evidence | What it proves |
|---|---|
| `a688055` on 2026-06-16 | Driver app/services, wallet flows, reserve/reassignment features, UI, tests and scripts were committed and pushed. |
| `c9a8305` on 2026-06-29 | Arrival/OTP changes, trip completion, late-penalty/invoice work, recharge/notification/maintenance additions were committed and pushed. |
| `HEAD == main == origin/main == c9a8305` | This checkout contains the latest commit currently advertised by the remote and has no ahead/behind gap. |
| Remote has only `main`, no tags or PR refs | There is no visible later feature branch or pull request to merge/recover. |
| Fresh-clone reflog has one clone event; `git fsck` found nothing unreachable | This checkout has no old local commit, stash or dangling object to recover. |
| All narrative docs last changed on 2026-06-15 | Documentation was not updated with the later pushed implementation and cannot be used as proof that V2 is absent. |

### Signs that the pushed V2 session ended in an unfinished state

- The Prisma schema gained 214 net lines and now defines 15 models—nine more than the initial six—but **no migration was added** after the original MVP migration.
- Manual database helpers exist outside migration history, suggesting local database state may have been changed ad hoc.
- Active UI calls exist for two nonexistent API endpoints: driver issue reporting and admin penalty-rule listing.
- Several source seams are visibly half-integrated: assignment is stored but ignored by driver authorization, reassignment is stored but ignored downstream, and admin detail expects relations its backend does not load.
- Completion test names were committed, but their four bodies are placeholders.
- Main seed omits reserve vehicles and penalty rules needed by later code and is inconsistent with weekly quota.
- Documentation predates both V2 commits and still describes the old annual/automatic-assignment design.
- No source-code TODO/FIXME marker provides a reliable continuation checklist; the unfinished work is visible through cross-layer mismatches instead.

There is no suspicious feature branch or migration newer than `main`; absence is itself useful evidence. The later work was concentrated directly on `main` in two large commits rather than staged through branches/PRs.

### What cannot be concluded

This clone cannot answer whether additional work happened **after 2026-06-29** on the previous laptop but was never pushed. GitHub cannot contain uncommitted files or commits never sent to it, and a fresh clone cannot inherit the old laptop's reflog, stashes or editor history. Search the old laptop/disk, cloud backups, another clone, IDE local history and exported patches before declaring that later local work lost.

### Recovery verdict

This clone is the correct, evidenced **pushed source baseline** from which to create a recovery branch. Development can continue from it, but it is not yet a safe deployment/database baseline. Preserve and compare the actual Neon database first; do not replay the sole migration, run the seed, or execute the DB-backed tests against it.

## 13. Missing/Partial Work

### Master project-status table

Legend: ✅ Complete in that layer; 🟡 Partial; ❌ Missing; ⚠️ Present but broken or runtime-unverified; — Not applicable. A database ⚠️ usually means the target Prisma model/field exists but has no replayable migration. “Complete” describes repository implementation, not a successful run on this laptop.

| Feature | Backend | Database | Resident UI | Admin UI | Driver UI | Tests | Overall Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Resident authentication | ✅ | ✅ | ✅ | — | — | ❌ | 🟡 Partial/unverified |
| Admin authentication/session | ✅ | ✅ | — | ✅ | — | ❌ | 🟡 Partial/unverified |
| Driver authentication | ✅ | ⚠️ | 🟡 | 🟡 | 🟡 | ❌ | ⚠️ Migration/account provisioning broken |
| Resident dashboard | ✅ | ⚠️ | ✅ | — | — | ❌ | ⚠️ Missing-quota fallback inconsistent |
| Booking availability | ✅ | ⚠️ | ✅ | — | — | ⚠️ | ⚠️ DB buffer not reproducible |
| Explicit-vehicle booking creation | ✅ | ⚠️ | ✅ | — | — | ⚠️ | ⚠️ Depends on unmigrated wallet/weekly quota |
| Automatic EV assignment | ❌ | — | ❌ | ❌ | — | ❌ | ❌ Missing; explicit choice replaced it |
| Annual quota model | ❌ | ⚠️ | ❌ | ❌ | — | ❌ | ❌ Superseded but old migration/docs remain |
| Weekly quota model | 🟡 | ⚠️ | 🟡 | 🟡 | — | ⚠️ | ⚠️ Incomplete conversion/provisioning |
| Booking history/detail | ✅ | ✅ | 🟡 | ✅ | 🟡 | ❌ | 🟡 Present; types/reassignment lag |
| Resident cancellation | ✅ | ⚠️ | ✅ | — | — | ⚠️ | ⚠️ Non-BOOKED states stranded |
| Admin dashboard | ✅ | ✅ | — | ✅ | — | ❌ | 🟡 Present but unverified |
| Flats management | ✅ | ✅ | — | ✅ | — | ❌ | 🟡 Present but unverified |
| Residents management | 🟡 | ✅ | — | ✅ | — | ❌ | 🟡 New residents lack wallet provisioning |
| Vehicle management | 🟡 | ⚠️ | — | 🟡 | — | ⚠️ | ⚠️ Hourly price not manageable |
| Quota management | 🟡 | ⚠️ | 🟡 | 🟡 | — | ❌ | ⚠️ Current-week-only and legacy defaults |
| Booking monitoring | ✅ | ✅ | — | ✅ | — | ❌ | 🟡 Present but unverified |
| Rolling seven-day window | ✅ | — | ✅ | — | — | ✅ | ✅ Complete in source/test design |
| Mandatory 30-minute buffer | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ DB protection/manual test safety unresolved |
| Reserve vehicle support/exclusion | ✅ | ⚠️ | ✅ | ✅ | — | ⚠️ | ⚠️ Schema-only and seed omits reserves |
| Manual reserve reassignment | ⚠️ | ⚠️ | 🟡 | ✅ | ❌ | ⚠️ | ⚠️ Authorization/downstream propagation broken |
| Reassignment reason/history | ✅ | ⚠️ | 🟡 | ✅ | ❌ | ⚠️ | ⚠️ Audit exists; operational model incomplete |
| Maintenance mode | 🟡 | ⚠️ | 🟡 | ✅ | ❌ | ⚠️ | ⚠️ No recovery/auto-reassignment path |
| Breakdown handling | 🟡 | ⚠️ | 🟡 | ✅ | ❌ | ⚠️ | ⚠️ Same incomplete impact flow |
| Affected-booking detection | ✅ | ⚠️ | 🟡 | ✅ | ❌ | ⚠️ | ⚠️ AT_RISK becomes uncancellable |
| Resident in-app notifications | ✅ | ⚠️ | ✅ | — | — | ⚠️ | ⚠️ DB-only delivery; no push/SMS/email |
| Wallet/balance | ⚠️ | ⚠️ | ✅ | ✅ | — | ⚠️ | ⚠️ Defaults, role and tenancy conflict |
| Booking fare calculation | ✅ | ⚠️ | 🟡 | 🟡 | — | ⚠️ | ⚠️ No price snapshot/runtime verification |
| EV hourly pricing | 🟡 | ⚠️ | 🟡 | ❌ | — | 🟡 | ⚠️ Database/seed configurable only |
| Booking wallet deduction | ✅ | ⚠️ | 🟡 | — | — | ⚠️ | ⚠️ Unmigrated and unsafe test setup |
| Cancellation refund | ✅ | ⚠️ | ✅ | — | — | ⚠️ | ⚠️ Unmigrated and lifecycle-limited |
| Cancellation penalty configuration | ✅ | ⚠️ | 🟡 | ✅ | — | 🟡 | ⚠️ Main seed omits rule |
| Cancellation penalty deduction | ✅ | ⚠️ | 🟡 | 🟡 | — | 🟡 | ⚠️ No applied Penalty audit row |
| Wallet transaction ledger | ✅ | ⚠️ | ✅ | 🟡 | — | ⚠️ | ⚠️ Seed can desynchronize it |
| Admin wallet management/manual credit | ⚠️ | ⚠️ | — | ✅ | — | ❌ | ⚠️ Cross-society/target validation missing |
| Manual booking penalty | 🟡 | ⚠️ | 🟡 | ⚠️ | — | ❌ | ⚠️ UI cannot load nonexistent rule-list API |
| Recharge request workflow | 🟡 | ⚠️ | ❌ | ✅ | — | ⚠️ | ⚠️ Resident UI missing; process route broken |
| Authenticated mock recharge | ✅ | ⚠️ | 🟡 | — | — | ⚠️ | ⚠️ Orphan/inconsistent QR navigation |
| Public demo QR/payment page | ⚠️ | ⚠️ | ⚠️ | ⚠️ | — | ❌ | ⚠️ Broken URLs and critical authorization flaw |
| Real payment gateway | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ Missing |
| UPI integration | ❌ | ❌ | ❌ | ❌ | — | ❌ | ❌ Missing |
| Driver entity/profile | 🟡 | ⚠️ | 🟡 | ✅ | 🟡 | ⚠️ | ⚠️ No User relation/reproducible migration |
| Driver admin management/account creation | 🟡 | ⚠️ | — | ✅ | 🟡 | ❌ | ⚠️ Profile creation does not create login |
| Booking driver assignment | ⚠️ | ⚠️ | 🟡 | ✅ | ⚠️ | ⚠️ | ⚠️ Stored assignment is not enforced |
| Driver dashboard/history | ⚠️ | ⚠️ | — | 🟡 | ✅ | ❌ | ⚠️ Vehicle-based, no role guard, report API absent |
| Ride-start OTP/verification | 🟡 | ⚠️ | ✅ | 🟡 | ✅ | ⚠️ | ⚠️ Weak generation/timing/assignment rules |
| Actual ride start | ✅ | ⚠️ | ✅ | 🟡 | ✅ | ⚠️ | ⚠️ Schema-only and assignment not enforced |
| Ride completion/actual end | ⚠️ | ⚠️ | 🟡 | ✅ | ✅ | ❌ | ⚠️ OTP/start bypass; tests are placeholders |
| Delay calculation | ✅ | ⚠️ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 Formula exists; lifecycle unverified |
| Late-return penalty | ⚠️ | ⚠️ | 🟡 | 🟡 | 🟡 | ❌ | ⚠️ Rule not seeded/admin-managed; active ignored |
| Final invoice record/bill | ⚠️ | ⚠️ | 🟡 | ⚠️ | — | ❌ | ⚠️ Lifecycle/data-loading/fare issues |
| Downloadable PDF invoice | ⚠️ | ⚠️ | 🟡 | ⚠️ | — | ❌ | ⚠️ Known field/type error |

### Work that is wholly missing

- Reproducible migrations for every V2 schema change and both intended overlap constraints.
- Automatic EV allocation, if the original requirement still applies.
- Real payment gateway, UPI initiation/verification, webhook validation, provider transaction IDs, idempotency and reconciliation.
- Resident recharge-request/history UI.
- Driver issue-reporting backend, data model and admin workflow.
- Supported general penalty-rule listing/management for the manual penalty form and late-return rate.
- Automated quota-row provisioning/rollover for the rolling booking horizon.
- CI, isolated test database configuration, UI tests, current E2E tests, meaningful completion/invoice tests and authorization/tenant tests.
- Push/SMS/email notification delivery.
- Current operational/architecture documentation.

### Work present but needing reconciliation before feature expansion

1. **Database:** schema, migration history, manual constraints, seed and actual Neon state must become one reproducible definition.
2. **Quota:** choose annual versus weekly as the product rule, then align schema, migration, APIs, contracts, defaults, seed, UI copy and year/week boundaries.
3. **Driver lifecycle:** unify User and Driver identity, provision logins, make `booking.driverId` authoritative, account for reassigned vehicles, and enforce a state machine.
4. **Reserve/maintenance:** secure reassignment, show the effective vehicle everywhere, define cancellation/recovery behavior and handle late-return impact on subsequent bookings.
5. **Financial integrity:** choose one wallet opening-balance policy, snapshot booking price, make ledger operations idempotent/auditable and scope every admin operation to society.
6. **Recharge/payment:** decide whether mock flows remain development-only or are removed before any real integration.
7. **Cross-layer contracts:** align service includes, shared/mobile/admin types, route params and endpoint consumers.

## 14. Current Risks

### Critical

| ID | Risk | Evidence and potential impact |
|---|---|---|
| C1 | **Migration history cannot produce the application schema.** | Deploying the sole migration creates six old-shape tables, while current code expects 15 models and expanded enums. Fresh deploy/seed/runtime will fail; applying guessed migrations to an existing DB could lose or corrupt data. |
| C2 | **Actual database state is unknown and may contain ad-hoc DDL.** | Two unregistered constraint scripts and later schema-only commits mean the live Neon schema may differ from both Git definitions. Running migrate/seed before snapshot/diff is unsafe. |
| C3 | **Public endpoint can create money.** | `POST /wallet/public-demo-recharge` accepts arbitrary resident `userId` and any positive amount without authentication, tenant authorization, cap, provider proof or idempotency. |
| C4 | **Admin reassignment is not admin-only.** | Any authenticated active user can call the reserve-reassignment route and service, changing booking/vehicle allocation and audit data. |
| C5 | **Existing tests/scripts can destroy or corrupt shared data.** | One suite deletes all bookings; others overwrite balances/quotas/rules or leave ledger/booking mutations. Accidental use with real credentials is a direct data-loss risk. |

### High

| ID | Risk | Evidence and potential impact |
|---|---|---|
| H1 | Driver assignment and ride authorization disagree. | Stored `booking.driverId` is ignored; static original-vehicle matching controls actions, reassignment is ignored, and completion bypasses OTP/start. Wrong drivers could access or finalize rides. |
| H2 | Financial records are not reliably auditable. | Conflicting opening balances, seed/ledger divergence, no price snapshot, penalties can drive negative balance, no ledger FK/idempotency, and invoice may recompute a different fare. |
| H3 | Tenant/role boundaries are incomplete. | Wallet listing/adjustment is not society-safe, wallet GET is any-role, non-resident invoice access is society-wide, and target roles are not consistently validated. |
| H4 | Weekly quota can mislead and block bookings. | Dashboard fabricates a row, booking requires a real one, next week is not provisioned, seed aggregates annual usage into a weekly row, and year/week handling can fail near New Year. |
| H5 | Maintenance/reassignment can strand users. | `AT_RISK` cannot be cancelled; no automatic recovery; effective reserve vehicle does not propagate to resident/driver/fare/invoice flows. |
| H6 | Known source mismatches may block strict compilation or active flows. | Invoice field mismatch, Promise params misuse, stale types, lowercase JSX handler, missing APIs and omitted admin relations are visible without executing a build. |
| H7 | There is no verified baseline. | Node/dependencies/secrets are absent, no checks ran, no CI exists, latest validation artifact is stale/failed, and actual DB was intentionally not contacted. |

### Medium

| ID | Risk | Evidence and potential impact |
|---|---|---|
| M1 | Documentation can cause incorrect recovery actions. | README/handover describe Node 18, annual quota, automatic assignment, missing features, Turborepo/Tailwind and a nonexistent DB command. |
| M2 | Authentication/session guarding is inconsistent in mobile layouts. | Resident tabs check token rather than Resident role; driver layout lacks an auth/role guard. |
| M3 | Mock QR networking is brittle. | Hardcoded localhost/fallback IP, QR payload ignored by scanner, admin QR omits user ID; physical-device demos commonly fail or credit incorrectly. |
| M4 | Operational rules are hardcoded and fragmented. | Horizon, duration, buffer, OTP and most lifecycle rules require code changes; late price is DB-only and cancellation price alone has supported admin UI. |
| M5 | Repository hygiene/operations are weak. | No CI, Docker/EAS config or release tags; a 45 MB unused MP3 is tracked without LFS; four coarse commits and no PR history reduce traceability. |
| M6 | Notifications are local-only. | Maintenance and reassignment messages live in the DB/mobile screen; no external delivery exists, so residents may not see urgent changes. |

## 15. Exact Recommended Next Steps

These steps are deliberately ordered to preserve recoverability. Do not begin feature work or database repair in the middle of the sequence.

1. **Preserve the current evidence.** Keep `c9a8305` as the immutable pushed reference, retain this audit, and do not include the pre-existing newline-only `.env.example` change in an audit commit. Record `git status --short --branch` before any other work.

2. **Search external recovery sources before assuming GitHub is complete.** Inspect the previous laptop/disk, recycle bin, VS Code/JetBrains local history, cloud-sync folders, backups, other clones, emailed patches and shell history for work after 2026-06-29. Copy recoverable material read-only; do not merge it blindly.

3. **Create a dedicated recovery branch and commit only the audit after review.** Suggested commands, to run only when ready:

   ```powershell
   git switch -c recovery/v2-reconciliation
   git add -- docs/current-project-audit.md
   git commit -m "docs: add current project recovery audit"
   ```

4. **Install the pinned toolchain and dependencies using section 11.** Generate the Prisma client and run schema validation, typecheck, lint, API build and mobile web export. Do not supply a shared database URL to tests. Capture every failure as the initial recovery checklist.

5. **Identify the real database before touching it.** From the Neon dashboard/password manager, establish which project/branch/environment was used previously. Record only non-secret project identifiers. Confirm whether it is production/demo/disposable and whether another person/system uses it.

6. **Create a provider snapshot/branch and schema-only backup first.** Preserve the current database and obtain a schema-only export plus migration-table contents. Do not run Prisma deploy/dev, seed, constraint helpers, QA scripts or tests against the original. If a safe snapshot cannot be made, stop database work.

7. **Compare all three database states.** Produce a reviewed diff among (a) the sole SQL migration replayed from zero, (b) current `schema.prisma`, and (c) the schema-only export from the actual database. Include enums, role/quota checks, every table/column/FK/index, both overlap constraints and migration metadata.

8. **Choose and document a migration-recovery strategy.** The likely goal is a baseline representing the real preserved DB plus forward migrations that can also construct a clean equivalent schema. Do not use `migrate resolve`, edit applied migration history, or generate/apply production DDL until the actual-state diff is understood and reviewed.

9. **Prove database reproducibility on a disposable branch/database.** From an empty database, replay the repaired migration chain, generate the client, seed only safe fixtures, compare resulting schema to the intended target, and test upgrade from a copy of the preserved prior state. Verify `btree_gist`, 30-minute primary/reassigned/cross-column conflicts and DRIVER role checks explicitly.

10. **Create hard test isolation before running the current suite.** Introduce a dedicated `TEST_DATABASE_URL`, fail closed when it resembles development/production, create per-suite societies/fixtures, scope cleanup to owned IDs, and remove global `deleteMany({})`/first-seeded-user behavior. Keep tests serial where they mutate shared constraints; then run the pure suite first and DB suites selectively.

11. **Repair security and data-integrity blockers before demos.** In order: disable or strongly dev-gate public demo credit; require Admin for reassignment; society/role-scope wallet and invoice access; validate recharge target/amount/idempotency; prevent unsafe admin transaction types; protect mobile layouts by role; prevent completion without the required lifecycle.

12. **Resolve the core product decisions rather than patching symptoms.** Confirm weekly versus annual quota, explicit versus automatic vehicle assignment, whether reserve reassignment changes the operational/fare vehicle, cancellation behavior for `AT_RISK`, authoritative driver assignment, wallet opening balance, rate snapshot semantics, and whether mock recharge remains at all.

13. **Align each decided domain end to end.** Update schema/migrations, services, shared contracts, resident/admin/driver types and screens, seeds and tests together. In particular, unify Driver↔User provisioning, enforce `booking.driverId`, model a single ride state machine, provision future weekly quotas, propagate effective vehicle, and snapshot charge inputs.

14. **Fix known cross-layer breaks.** Correct invoice fields/data loading and Next route params; either implement or remove `report-issue` and penalty-rule consumers; add resident recharge-request UI if the workflow is retained; replace hardcoded QR networking; ensure admin detail receives driver/invoice.

15. **Build meaningful verification.** Replace trip-completion placeholders with lifecycle, timestamp, penalty, wallet and invoice/PDF assertions. Add authz/cross-tenant tests, migration-from-zero/upgrade tests, API E2E tests and focused resident/admin/driver UI tests. Run typecheck, lint, builds, Prisma validation and the isolated suite in CI.

16. **Update operational documentation last, from verified behavior.** Correct Node/pnpm/setup commands; publish the final schema/migration model, environment separation, seed/test safety, API/UI inventory, product rules and recovery history. Remove claims of Turborepo, Tailwind, annual quota and automatic assignment unless they become true again.

17. **Only then stage a deployment.** Use a copied/staging database first, execute a reviewed migration plan with rollback/snapshot, run smoke tests for all three roles and financial invariants, and deploy to the original environment only after reconciliation results are signed off.

### Decision gates

| Gate | Required evidence before proceeding |
|---|---|
| Source gate | Old-laptop recovery search complete; recovery branch protects the GitHub baseline. |
| Static gate | Clean install succeeds; Prisma validate, typecheck, lint and both builds have observed results. |
| Database gate | Provider snapshot exists; actual-vs-migration-vs-schema diff is reviewed; empty and upgrade rehearsals succeed. |
| Test gate | Dedicated DB enforced; no global/shared cleanup; meaningful lifecycle/security/migration tests pass. |
| Demo gate | Public credit/reassignment authorization fixed; three-role smoke test and wallet/quota/invoice reconciliation pass. |
| Deployment gate | Staging migration and rollback rehearsal completed with a current backup and explicit approval. |

Until the database gate is met, the safest next activity is **read-only recovery and local static verification**, not implementation, migration, seeding or demo payment testing.
