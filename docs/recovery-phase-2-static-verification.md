STATIC BASELINE STATUS: **FAILING**

- TypeScript errors: **43**
- Lint errors: **88**
- Build errors: **1 surfaced before fail-fast**
- Mobile build errors: **0**
- Prisma errors: **0**

# Recovery Phase 2 — Static Verification

Verification date: 2026-08-08 (Asia/Kolkata)

Repository: `D:\ATHARVA_DATA\EV_CAR_SCHEDULER\ev_cars_scheduler`

The source baseline is installable, Prisma's target schema parses, and Expo can produce a web bundle. It is not compile-clean: repository-wide static checking found 43 TypeScript errors and 88 lint errors, and the Next.js production build stops at its first TypeScript error. No application code, dependency version, migration, database, or production environment value was changed during this phase.

The one backend build error above is the single error Next.js surfaced before its fail-fast exit. It does not replace the complete API `tsc` result of 30 errors. Likewise, the mobile export has zero bundling errors but the independent mobile typecheck has 13 errors.

## 1. Git Baseline

### Initial verification

| Check | Observed result |
|---|---|
| Starting branch | `main` |
| `HEAD` | `c9a8305` |
| `main` | `c9a8305` |
| `origin/main` | `c9a8305` |
| Ahead / behind | `0 / 0` |
| Latest commit | `c9a8305 feat: implement trip completion, penalty logic and pdf invoice generation` |

The working tree contained only the two expected audit-era items:

- Modified `.env.example`: content-identical except for its previously removed final newline. This predated both recovery phases and remains untouched.
- Untracked `docs/current-project-audit.md`: the requested Phase 1 deliverable.

There were no unexpected changes, so the requested branch was created:

```text
recovery/v2-reconciliation -> c9a8305
main                       -> c9a8305, tracking origin/main
origin/main                -> c9a8305
```

`main` was not modified or moved. Generated/install/build paths (`node_modules`, Prisma generated client, `.next`, and Expo `dist`) are ignored and do not alter the tracked source baseline. This Phase 2 report is the only new workspace deliverable from this phase.

## 2. Toolchain

| Tool | Observed version | Assessment |
|---|---:|---|
| Git | `2.55.0.windows.3` | Present |
| Node.js | `24.19.0` LTS | Installed in this phase; supported by Next 16 and Prisma 7.8 |
| npm | `11.17.0` | Installed with Node |
| Corepack | `0.35.0` | Installed with Node |
| pnpm | `10.33.0` | Exact repository-pinned version |

Repository evidence:

- Root `package.json` pins `packageManager: pnpm@10.33.0`.
- Lockfile format is `9.0`.
- Lockfile resolves Next `16.2.7`, Prisma/client `7.8.0`, Expo `54.0.35`, React Native `0.81.5`, and React 19.
- Prisma 7.8 accepts Node `^20.19`, `^22.12`, or `>=24`; Node 24.19.0 satisfies that constraint and Next 16's lower requirement.

The machine-wide Corepack shim attempt could not write `C:\Program Files\nodejs\yarn` and returned `EPERM`. No elevated retry was made. Corepack's pnpm shim was instead installed in the user-writable directory `C:\Users\root\AppData\Local\pnpm-corepack`, added to the user PATH, and verified as pnpm 10.33.0. A newly opened terminal will naturally pick up the Node installer and user-PATH changes.

## 3. Dependency Install

Command:

```powershell
pnpm install --frozen-lockfile
```

Result: **PASSED**.

- All five workspace projects were included.
- The lockfile was already current; resolution changes were skipped.
- 1,127 packages were installed.
- No package version, `package.json`, or `pnpm-lock.yaml` change was made.
- No upgrade and no `npm audit fix` was run.

pnpm 10.33.0 reported that dependency build scripts were ignored for:

- `@prisma/engines@7.8.0`
- `prisma@7.8.0`
- `esbuild@0.27.7`
- `sharp@0.34.5`
- `unrs-resolver@1.12.2`

This warning did not prevent Prisma generation, Prisma validation, TypeScript, lint, Next compilation, or Expo export. It should be reviewed deliberately before native/runtime verification; `pnpm approve-builds` was not run because it can change install policy and this phase forbids dependency/config repair.

## 4. Environment Status

No secret value was printed, copied into the repository, or used from Neon.

| Variable | Status | Evidence / effect |
|---|---|---|
| `DATABASE_URL` | **MISSING** | Root `.env` exists but is zero bytes. API runtime requires a pooled PostgreSQL/Neon URL. |
| `DIRECT_URL` | **MISSING** | Root `.env` is empty. Prisma config requires it to parse commands. |
| `JWT_SECRET` | **MISSING** | Root `.env` is empty. API authentication requires at least 32 characters. |
| `JWT_EXPIRES_IN` | **MISSING, OPTIONAL** | Code defaults to `7d`; explicit configuration remains preferable. |
| `EXPO_PUBLIC_API_URL` | **INVALID/UNKNOWN FOR THIS LAPTOP** | Present in ignored `apps/mobile/.env`, but that file exactly matches `.env.example` and points at an unverified private-LAN address. No reachability check was made. |

Environment use confirmed from source:

- `packages/db/prisma.config.ts` reads `DIRECT_URL` for Prisma administration.
- `packages/db/src/client.ts` requires `DATABASE_URL` and constructs the Neon adapter.
- `apps/api/src/lib/auth.ts` requires `JWT_SECRET` and defaults `JWT_EXPIRES_IN` to `7d`.
- `apps/mobile/src/lib/api.ts` reads `EXPO_PUBLIC_API_URL` and otherwise falls back to loopback.
- Mobile booking/PDF and QR code also contain separate hardcoded/fallback API hosts, so one valid environment value does not yet eliminate all networking drift.

For generate, validate, and build only, the commands received process-local dummy URLs pointing to `127.0.0.1` and a process-local dummy JWT secret. These values were not written to `.env`. Prisma generate/validate do not connect to a database, and no command in this phase attempted a Neon connection.

## 5. Prisma Generation/Validation

| Check | Command | Result | Errors |
|---|---|---|---:|
| Client generation | `pnpm db:generate` | **PASSED**; Prisma Client 7.8.0 generated to `packages/db/src/generated/prisma` | 0 |
| Schema validation | `pnpm --filter @society-ev/db exec prisma validate` | **PASSED**; “schema is valid” | 0 |

Both commands loaded `packages/db/prisma.config.ts` and `packages/db/prisma/schema.prisma` using the process-only localhost dummy `DIRECT_URL`. They performed no migration, introspection, query, seed, or database write.

What this proves:

- Prisma 7.8 can parse the configuration and target schema.
- The client generator can emit the configured client under the installed toolchain.

What this does **not** prove:

- The sole committed migration matches the target schema.
- Any Neon database has these 15 models or constraints.
- Runtime queries, the seed, or migration deployment work.

The Phase 1 schema/migration drift remains a separate critical recovery gate.

## 6. TypeScript Results

The official root command, `pnpm typecheck`, failed after the mobile workspace reported errors. pnpm's recursive fail-fast meant the API workspace did not run in that root invocation, so `pnpm --filter @society-ev/api typecheck` was run separately to obtain the complete baseline.

| Workspace | Result | Error count |
|---|---|---:|
| `@society-ev/contracts` | Passed | 0 |
| `@society-ev/db` | Passed | 0 |
| `@society-ev/mobile` | Failed | 13 |
| `@society-ev/api` | Failed | 30 |
| **Repository total** | **Failed** | **43** |

### Errors by requested domain

| Domain | Errors |
|---|---:|
| Booking | 7 |
| Wallet | 1 |
| Driver | 4 |
| Recharge | 6 |
| Penalty | 1 |
| Invoice/PDF | 6 |
| Admin UI | 11 |
| Resident Mobile | 7 |
| Shared Contracts | 0 |
| Prisma package/generated client | 0 |
| Other | 0 |
| **Total** | **43** |

### Booking — 7 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/src/modules/bookings/service.ts` | 763:114 | `TS2339`: `name` does not exist on `LockedVehicle`. | The raw lock-row type declares only `id` and `hourlyRate`, while reassignment notification uses `vehicle.name`. |
| `apps/api/tests/maintenance-impact.test.ts` | 83:7 | `TS2322`: booking create data is not assignable; required quota/relations are missing. | Fixture predates required `quotaYear`/`quotaWeek` and current Prisma create shape. |
| `apps/api/tests/maintenance-impact.test.ts` | 97:7 | `TS2322`: booking create data is not assignable; required quota/relations are missing. | Same stale fixture shape for the future booking. |
| `apps/api/tests/reserve-vehicles.test.ts` | 76:19 | `TS2339`: `booking` does not exist on reassignment result. | Service returns a booking response directly; test expects an obsolete `{ booking: ... }` wrapper. |
| `apps/api/tests/reserve-vehicles.test.ts` | 77:19 | `TS2339`: `booking` does not exist on reassignment result. | Same stale response expectation. |
| `apps/api/tests/reserve-vehicles.test.ts` | 92:19 | `TS2339`: `booking` does not exist on reassignment result. | Same stale response expectation on second reassignment. |
| `apps/api/tests/reserve-vehicles.test.ts` | 93:19 | `TS2339`: `booking` does not exist on reassignment result. | Same stale response expectation. |

### Wallet — 1 error

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/scripts/qa-runner.ts` | 151:60 | `TS2322`: `"PAYMENT"` is not assignable to `TransactionType`. | QA script uses a removed/never-defined ledger enum member; current equivalent would require a deliberate business mapping, not a cast. |

### Driver — 4 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/mobile/app/(driver)/index.tsx` | 26:29 | `TS2339`: `styles.center` does not exist. | Driver dashboard JSX references a style never declared in its StyleSheet. |
| `apps/mobile/app/(driver)/index.tsx` | 27:29 | `TS2339`: `styles.loading` does not exist. | Missing local style definition. |
| `apps/mobile/app/(driver)/index.tsx` | 61:27 | `TS2339`: `styles.header` does not exist. | Driver screen appears to have copied resident header markup without copying its styles. |
| `apps/mobile/app/(driver)/index.tsx` | 62:29 | `TS2339`: `styles.headerCopy` does not exist. | Same incomplete style transfer. |

### Recharge — 6 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/app/api/v1/admin/recharge-requests/[id]/process/route.ts` | 10:30 | `TS2345`: handler context with synchronous `{ id }` is incompatible with `RouteHandler`. | Next 16/API wrapper defines `params` as a Promise; this route uses the old synchronous shape and then reads `params.id`. |
| `apps/api/app/demo-payment/page.tsx` | 34:56 | `TS2322`: lowercase `onclick` is not a React button prop. | Static HTML-style string handler was pasted into JSX; React requires a function-valued `onClick`. |
| `apps/api/app/demo-payment/page.tsx` | 35:56 | `TS2322`: lowercase `onclick` is not a React button prop. | Same issue on the ₹500 preset. |
| `apps/api/app/demo-payment/page.tsx` | 36:56 | `TS2322`: lowercase `onclick` is not a React button prop. | Same issue on the ₹1,000 preset. |
| `apps/mobile/app/qr-recharge.tsx` | 153:26 | `TS2339`: `radius.full` does not exist. | Theme exports `sm`, `md`, `lg`, and `pill`; screen uses an undefined token. |
| `apps/mobile/app/show-qr.tsx` | 97:27 | `TS2339`: `spacing.xxxl` does not exist. | Theme exports spacing only through `xl`; screen uses an undefined token. |

### Penalty — 1 error

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/scripts/qa-runner.ts` | 128:40 | `TS2367`: `TransactionType` and `"CANCELLATION_PENALTY"` have no overlap. | QA script uses a nonexistent legacy enum label; current schema has `PENALTY`. |

### Invoice/PDF — 6 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/app/api/v1/bookings/[bookingId]/invoice/pdf/route.ts` | 19:39 | `TS2345`: Node `Buffer` is not assignable to Next `BodyInit`. | Next 16's response typing requires a compatible byte body such as an accepted array/view; raw generic Buffer no longer satisfies this constructor signature. |
| `apps/api/src/modules/invoices/service.ts` | 76:29 | `TS2339`: `phoneNumber` does not exist on User. | Prisma User field is `phone`; the PDF generator uses the Driver-profile field name. |
| `apps/api/src/modules/invoices/service.ts` | 83:25 | `TS18047`: `booking.invoice` is possibly null. | Narrowing performed before entering the Promise callback is not retained for the captured mutable object. |
| `apps/api/src/modules/invoices/service.ts` | 124:23 | `TS18047`: `booking.invoice` is possibly null. | Same closure/narrowing issue for subtotal. |
| `apps/api/src/modules/invoices/service.ts` | 130:23 | `TS18047`: `booking.invoice` is possibly null. | Same closure/narrowing issue for penalty amount. |
| `apps/api/src/modules/invoices/service.ts` | 140:23 | `TS18047`: `booking.invoice` is possibly null. | Same closure/narrowing issue for total amount. |

### Admin UI — 11 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/api/src/admin/admin-portal.tsx` | 332:57 | `TS2367`: status union has no overlap with `BREAKDOWN`. | Admin-local `VehicleStatus` still contains only AVAILABLE/MAINTENANCE/INACTIVE. |
| `apps/api/src/admin/admin-portal.tsx` | 376:37 | `TS2367`: status union has no overlap with `BREAKDOWN`. | Same stale local enum while the UI offers BREAKDOWN. |
| `apps/api/src/admin/booking-detail.tsx` | 302:27 | `TS2339`: `actualRideStartTime` missing from `Booking`. | Admin-local Booking type predates ride lifecycle fields. |
| `apps/api/src/admin/booking-detail.tsx` | 303:78 | `TS2339`: `actualRideStartTime` missing from `Booking`. | Same stale type in value rendering. |
| `apps/api/src/admin/booking-detail.tsx` | 308:27 | `TS2339`: `otpVerifiedAt` missing from `Booking`. | Admin-local Booking type predates OTP lifecycle. |
| `apps/api/src/admin/booking-detail.tsx` | 309:76 | `TS2339`: `otpVerifiedAt` missing from `Booking`. | Same stale type in value rendering. |
| `apps/api/src/admin/booking-detail.tsx` | 311:27 | `TS2339`: `driver` missing from `Booking`. | Admin-local type and admin detail response omit the driver relation. |
| `apps/api/src/admin/booking-detail.tsx` | 312:70 | `TS2339`: `driver` missing from `Booking`. | Same mismatch for driver name. |
| `apps/api/src/admin/booking-detail.tsx` | 312:103 | `TS2339`: `driver` missing from `Booking`. | Same mismatch for driver phone. |
| `apps/api/src/admin/booking-detail.tsx` | 317:13 | `TS2367`: `BookingStatus` has no overlap with `IN_PROGRESS`. | Admin-local status union contains only BOOKED/COMPLETED/CANCELLED. |
| `apps/api/src/admin/booking-detail.tsx` | 317:63 | `TS2367`: `BookingStatus` has no overlap with `ACTIVE`. | Same stale status union. |

### Resident Mobile — 7 errors

| File | Line:column | Error | Likely cause |
|---|---:|---|---|
| `apps/mobile/app/(tabs)/index.tsx` | 74:47 | `TS18048`: `user.flat` is possibly undefined. | Session type permits DRIVER as well as RESIDENT and makes `flat` optional; resident tab guard/type narrowing is insufficient. |
| `apps/mobile/app/(tabs)/notifications.tsx` | 58:13 | `TS2322`: `icon/message/description` props do not match `EmptyState`. | Shared component accepts only required `title` and `message`; screen uses a different component API. |
| `apps/mobile/app/booking/[id].tsx` | 115:23 | `TS2339`: `driver` missing from mobile `Booking`. | Mobile API type predates returned driver relation. |
| `apps/mobile/app/booking/[id].tsx` | 116:66 | `TS2339`: `driver` missing from mobile `Booking`. | Same stale type for driver name. |
| `apps/mobile/app/booking/[id].tsx` | 116:99 | `TS2339`: `driver` missing from mobile `Booking`. | Same stale type for driver phone. |
| `apps/mobile/app/booking/[id].tsx` | 121:23 | `TS2339`: `actualRideStartTime` missing from mobile `Booking`. | Mobile Booking type contains legacy `startedAt` but not the current lifecycle field. |
| `apps/mobile/app/booking/[id].tsx` | 122:77 | `TS2339`: `actualRideStartTime` missing from mobile `Booking`. | Same stale type in time formatting. |

### Shared Contracts, Prisma, and Other

The shared-contracts and database workspaces typechecked with zero errors. That does not mean contracts are semantically current: many failing UI types are app-local duplicates rather than inferred from the shared contract package. No unclassified TypeScript errors remained after the domain grouping above.

## 7. Lint Results

The official `pnpm lint` command failed on mobile first and stopped before API lint. The API package's official lint command was therefore run separately.

| Workspace | Errors | Warnings | Result |
|---|---:|---:|---|
| Mobile | 3 | 4 | Failed |
| API/admin/tests/scripts | 85 | 26 | Failed |
| **Total** | **88** | **30** | **Failed** |

Error-rule distribution:

| Rule | Count | Assessment |
|---|---:|---|
| `@typescript-eslint/no-explicit-any` | 83 | Configured lint blocker across API routes, services, admin UI, tests, and scripts; mostly type-quality debt rather than a distinct runtime failure. |
| `react/no-unescaped-entities` | 3 | Mobile JSX apostrophes; style/content escaping errors. |
| `prefer-const` | 1 | Booking cancellation local `wallet` is never reassigned; style-only. |
| `react-hooks/set-state-in-effect` | 1 | Cancellation settings synchronously copies query data into state inside an effect; potential cascading-render/design issue. |

All 30 warnings are `@typescript-eslint/no-unused-vars` (26 API and 4 mobile). They do not independently fail lint, but the 88 configured errors do. No automatic lint fix was run; ESLint reported that only one error was potentially auto-fixable.

## 8. Backend Build Results

Command:

```powershell
pnpm build
```

Result: **FAILED**, exit code 1.

Observed build sequence:

1. Next.js 16.2.7 Turbopack created the optimized production bundle successfully in 33.5 seconds.
2. The build entered its TypeScript gate.
3. It stopped at the first error: `app/api/v1/admin/recharge-requests/[id]/process/route.ts:10:30`, where synchronous route params are incompatible with the Promise-based `RouteHandler` context.

Build error count is therefore **1 surfaced before fail-fast**. The separately observed API typecheck has 30 errors that must be treated as the underlying repair set; Next did not continue far enough to enumerate them.

The build used only process-local localhost/dummy environment values. No database call or mutation occurred.

Next build rewrote its tracked generated declaration `apps/api/next-env.d.ts` from the development route-types reference to the build route-types reference. Final verification restored the original `c9a8305` content; no generated rewrite was retained as a source change.

## 9. Mobile Build Results

Command:

```powershell
pnpm --filter @society-ev/mobile export:web
```

Result: **PASSED**, exit code 0.

| Item | Result |
|---|---|
| Metro modules | 1,243 bundled |
| Assets | 37 emitted |
| JavaScript bundle | One web entry, approximately 2 MB |
| Output | `apps/mobile/dist` |
| Missing assets/modules | None reported |
| Expo configuration errors | None reported |
| Route/bundle errors | None reported |
| Mobile build errors | 0 |

Expo export transpiles/bundles without enforcing `tsc --noEmit`, so this success does not cancel the 13 mobile TypeScript errors. The emitted bundle also embeds the current example-derived `EXPO_PUBLIC_API_URL`, whose reachability is unknown.

## 10. Confirmed Audit Defects

| Suspected Phase 1 issue | Classification | Current evidence |
|---|---|---|
| Invoice PDF uses `phoneNumber` while User has `phone`. | **CONFIRMED** | API typecheck `TS2339` at `src/modules/invoices/service.ts:76:29`. |
| Recharge process route misuses Next 16 params. | **CONFIRMED** | API typecheck and production build both fail at route line 10; shared `RouteContext.params` is a Promise. |
| Admin/mobile types lag OTP, driver, invoice and ride fields. | **CONFIRMED** | 14 compiler errors across admin/mobile booking screens for driver, actual start, OTP and statuses. Admin Booking type remains the old three-status shape; admin response also omits driver/invoice, while `any` masks some invoice typing. |
| Demo page uses lowercase JSX `onclick`. | **CONFIRMED** | Three `TS2322` errors at demo-payment lines 34–36; React suggests `onClick`. |
| QA scripts reference nonexistent transaction enum values. | **CONFIRMED** | `CANCELLATION_PENALTY` produces `TS2367`; `PAYMENT` produces `TS2322`. |
| UI calls `/driver/vehicle/report-issue` and `/admin/penalty-rules`, but routes are absent. | **CONFIRMED** | Call sites remain in mobile hooks and admin booking detail; both corresponding route paths are absent. String endpoint existence is not checked by TypeScript, so this was confirmed by route inventory rather than compiler output. |

None of the six suspected findings was already fixed or attributable to a different root cause.

## 11. New Defects Found

| Priority signal | Newly observed defect | Evidence / consequence |
|---|---|---|
| Compile | Invoice route passes Node `Buffer` directly to `NextResponse`, incompatible with current `BodyInit` typing. | `TS2345` at invoice PDF route line 19; PDF route remains unbuildable after the phone fix alone. |
| Compile | Invoice relation null narrowing is lost inside the PDF Promise callback. | Four `TS18047` errors; a stable non-null local or structural refactor is required. |
| Compile/runtime | Reassignment notification reads `vehicle.name`, but locked raw row/type selects only `id` and `hourlyRate`. | `TS2339` at booking service line 763; notification construction cannot compile. |
| Compile/UI | Driver dashboard references four undeclared styles. | Four mobile errors for center/loading/header/headerCopy. |
| Compile/UI | Notifications screen and `EmptyState` component APIs have diverged. | Screen supplies icon/message/description but component requires title/message. |
| Compile/UI | Two QR screens reference nonexistent theme tokens. | `radius.full` and `spacing.xxxl` do not exist. |
| Compile/auth boundary | Resident dashboard dereferences optional `user.flat`. | Type model allows Driver/flatless session; resident layout does not establish a safe narrow. |
| Compile | Admin vehicle status type lacks `BREAKDOWN` while the UI and backend use it. | Two `TS2367` errors. |
| Test drift | Maintenance fixtures omit required weekly quota fields; reserve tests expect an obsolete response wrapper. | Six API test compilation errors even before any database execution. |
| Tooling | Frozen install ignores five dependency build scripts by default. | Not an immediate failure here, but must be intentionally reviewed before native/runtime claims. |
| Environment | Mobile `.env` is byte-for-byte equivalent in content to the example and targets an unverified private address. | Export succeeds, but the bundle is not proof that a phone/browser can reach this laptop. |

### Safe test boundary observed

Only the provably pure range suite was executed, with a process-local unreachable localhost DB URL:

```powershell
pnpm --filter @society-ev/api exec vitest run tests/booking-range.test.ts
```

Result: **1 file passed, 8 tests passed, 0 failed**. It made no Prisma call or network request.

No database-backed test was run. In particular:

- `booking-buffer.test.ts` has an `afterAll` that deletes all bookings.
- Wallet, quota, penalty, reserve, recharge, maintenance, ride and concurrency suites/scripts create or mutate database state.
- QA/E2E/concurrency helpers were not executed.

## 12. Blockers

1. **Repository typecheck is failed:** 43 errors across API and mobile; shared/db passing does not make the application compile-clean.
2. **Backend production build is failed:** optimized compilation succeeds, but the Next TypeScript gate stops immediately on recharge params.
3. **Lint gate is failed:** 88 configured errors and 30 warnings.
4. **Backend runtime environment is absent:** `DATABASE_URL`, `DIRECT_URL`, and `JWT_SECRET` remain missing by design.
5. **Mobile network environment is not trustworthy:** the installed value is the example private-LAN address and was not contacted.
6. **Database/runtime verification remains intentionally blocked:** no disposable test database exists, actual Neon state is unknown, and migration history still cannot reproduce the target schema.
7. **Database test suite is unsafe:** destructive/global cleanup and seeded-record mutation must be isolated before any full test command.
8. **Dependency build-script policy is unresolved:** current static tasks work, but Prisma/native/image packages reported ignored scripts and require explicit review rather than blanket approval.

The mobile web bundle and pure range tests are the only green application-level checks. They are insufficient for a runnable-system claim.

## 13. Recommended Fix Order

No repair below was performed in this phase. This queue is the proposed order for a separately approved implementation phase.

### P0 — prevents application from compiling/running

1. Fix the recharge process route to await Promise params using the existing route-context helper/pattern; rerun Next build to reveal the next build-gating error.
2. Align admin and mobile Booking/Vehicle/BookingStatus types with actual service responses and schema, preferably by reducing duplicated local types rather than adding `any` casts.
3. Repair invoice compilation as one unit: User `phone`, stable non-null invoice value, and a Next-compatible PDF response body.
4. Correct the locked reassignment vehicle projection/type so `name` is genuinely selected, not asserted.
5. Resolve all remaining mobile type blockers: resident flat narrowing, EmptyState contract, driver styles, and valid theme tokens.
6. Update stale API test fixtures and reassignment expectations so `pnpm typecheck` can pass without executing tests.
7. Re-run, in order: Prisma validate, workspace typecheck, backend build, mobile typecheck/export. Do not start database runtime until the migration/actual-schema recovery gate is separately approved.

### P1 — breaks core business flows

1. Implement or deliberately remove the active driver Report Issue UI/call and define its data/admin flow.
2. Provide a real penalty-rule list endpoint/contract or remove the unusable manual-penalty selector.
3. Make admin booking detail actually load the driver and invoice relations it renders.
4. Reconcile driver assignment, reassigned vehicle, OTP/start/completion and effective-vehicle behavior end to end.
5. Complete weekly quota provisioning and define `AT_RISK` cancellation/recovery before resident runtime testing.

### P2 — security/data-integrity

1. Disable or development-gate unauthenticated public demo recharge before any server is exposed.
2. Require Admin authorization for reserve reassignment.
3. Society/role-scope wallet listing/adjustment and invoice access; validate target identity and transaction semantics.
4. Enforce the ride state machine so completion cannot bypass assigned driver and OTP/start.
5. Establish a snapshotted/disposable test database with fail-closed URL guards and fixture-scoped cleanup.
6. Reconcile actual database, schema, migrations, constraints, wallet/ledger rules and seed in the dedicated database-recovery phase before deploy/seed.

### P3 — UI/cleanup

1. Address the React effect-state error and the 83 explicit-`any` lint failures with real types.
2. Fix three unescaped mobile strings, one `prefer-const`, and 30 unused-variable warnings.
3. Consolidate mobile design tokens and shared state components so screens do not invent token/prop names.
4. Replace hardcoded/fallback QR/API hosts with one validated environment-driven URL and clear configuration error reporting.

### P4 — documentation/tooling

1. Add a supported Node version declaration and document Node 24 LTS, pnpm 10.33.0, Corepack/user-shim setup, and new-terminal PATH refresh on Windows.
2. Review and explicitly allow only required pnpm dependency build scripts; do not blanket-approve them.
3. Add CI gates for frozen install, Prisma generate/validate, typecheck, lint, Next build, mobile export and the pure unit suite.
4. Add isolated test configuration before CI ever runs DB-backed suites.
5. Update current docs only after compile and database recovery behavior is verified.

Static verification should now stop. The next action requires explicit approval to modify application code; database commands remain prohibited until a separate recovery plan is reviewed.
