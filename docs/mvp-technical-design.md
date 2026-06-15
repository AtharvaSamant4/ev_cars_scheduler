# Society Shared EV Booking System - MVP Technical Design

Status: Design only. No application code or database changes are included.

## 1. Executive Decision

Build one TypeScript monorepo with:

- A React Native mobile app using Expo and Expo Router.
- A Next.js application that hosts both the JSON API and a basic admin web UI.
- Prisma ORM connected to the existing Neon PostgreSQL database.
- Shared Zod request/response contracts.
- One deployment for the backend/admin and one Expo preview build for the mobile demo.

This is the fastest path because the API and admin UI share one Next.js deployment, while Expo provides the shortest path to an installable Android/iOS demo. The mobile app never connects directly to Neon.

High-level flow:

```text
Resident Expo App ----\
                       > HTTPS JSON API -> Services -> Repositories -> Prisma -> Neon PostgreSQL
Admin Next.js UI -----/
```

All quota checks, vehicle assignment, cancellation, and conflict prevention happen on the backend. Client-side checks are only for user experience and are never trusted.

## 2. Recommended Stack

| Area | Choice | Reason |
|---|---|---|
| Monorepo | pnpm workspaces | Minimal setup and shared packages without needing Turborepo |
| Mobile | Expo, React Native, TypeScript, Expo Router | Fast native demo, file-based navigation, Expo Go/EAS support |
| Admin and API | Next.js App Router and Route Handlers | One project and deployment for API plus basic admin UI |
| Database | Existing Neon PostgreSQL | Already provisioned |
| ORM | Prisma ORM 7 with Neon adapter | Typed queries, migrations, current Neon integration |
| Validation | Zod | Shared validation and API contracts |
| Server state | TanStack Query | Fetching, mutations, loading states, and cache invalidation |
| Local state | Zustand | Authentication session and small UI-only state |
| Forms | React Hook Form plus Zod | Quick validated mobile/admin forms |
| Dates | date-fns | Parsing, formatting, duration, and timezone-facing UI helpers |
| Authentication | Signed JWT, bcryptjs, Expo SecureStore | No OTP or third-party auth dependency |
| Tests | Vitest plus database integration tests | Fast testing of critical booking behavior |
| Deployment | Vercel for Next.js; Expo Go or EAS preview for mobile | Lowest demo friction |

Use the standard Node.js runtime for API routes, not an Edge runtime. Use the Neon pooled URL at runtime and a separate direct Neon URL for Prisma migrations.

## 3. Scope Boundaries

### First stakeholder demo must include

1. Seeded society, 50 flats, 5 available vehicles, and several resident accounts.
2. Resident login with flat number and password.
3. Dashboard with allocated, used, and remaining quota.
4. Availability check for a date/time range.
5. Automatic assignment of an available vehicle.
6. Atomic quota deduction when a booking succeeds.
7. Upcoming and historical booking lists.
8. Cancellation before start time with quota restoration.
9. A repeatable demonstration where five concurrent requests succeed and the sixth receives `NO_VEHICLE_AVAILABLE`.
10. Basic admin login and read-only views of vehicles, flats, quotas, residents, and all bookings.

### Complete MVP immediately after the demo

- Admin create/edit/deactivate for vehicles, flats, and residents.
- Admin annual quota allocation.
- Basic dashboard counts.

### Explicitly excluded

Payments, OTP, password recovery, GPS, maps, push notifications, vehicle telemetry, remote unlocking, penalties, waitlists, recurring bookings, analytics, AI, subscriptions, multi-society selection, and SaaS tenant management.

## 4. Assumptions

1. The MVP database contains one society. `societyId` is retained as a core ownership field, but there is no tenant selector, tenant middleware, or SaaS administration.
2. The society timezone is `Asia/Kolkata`. PostgreSQL stores timestamps in UTC; the app displays them in society local time.
3. There is one resident login account per flat for the MVP. The quota belongs to the flat, not the person.
4. Resident login uses `flatNumber + password`. Admin login uses `email + password`.
5. JWT access tokens are stored in Expo SecureStore. No refresh-token system is required for the demo; expired users log in again.
6. Quota is per calendar year, does not roll over, and is stored in integer minutes to avoid decimal-hour errors.
7. The 2026 sample allocation is 876 hours, or 52,560 minutes, per flat. Admin allocation is authoritative rather than recalculating it on every request.
8. A booking consumes quota immediately. Completed bookings continue to consume quota. Cancelling a future booking restores the exact duration.
9. Bookings must start in the future, use 30-minute boundaries, last between 1 and 24 hours, and remain inside one society-local calendar year.
10. Residents do not choose a specific vehicle. The server assigns one available `AVAILABLE` vehicle.
11. A booking may be cancelled only while its stored status is `BOOKED` and before its start time.
12. Time ranges use half-open intervals `[start, end)`, so a booking ending at 2:00 PM does not conflict with one starting at 2:00 PM.
13. `COMPLETED` can be returned as an effective status whenever `endTime <= now`; the demo does not need a background scheduler.
14. Deleting an entity that has booking history means deactivating it, not physically deleting it.

## 5. Database Design

### Entities

| Entity | Purpose | Important rules |
|---|---|---|
| Society | Single configured residential society | Stores timezone |
| Flat | Residence and quota owner | Flat number unique within society |
| User | Resident or admin login | Resident has one unique flat; admin has no flat |
| Vehicle | Bookable EV | Registration unique within society; only `AVAILABLE` is bookable |
| FlatQuota | Annual allocation and usage counter | One row per flat/year; usage cannot exceed allocation |
| Booking | Reservation and assigned vehicle | Positive interval; non-cancelled bookings cannot overlap on one vehicle |

### Database-enforced constraints

- Unique `(societyId, flatNumber)`.
- Unique `(societyId, registrationNumber)`.
- Unique `(flatId, year)` quota.
- `endTime > startTime`.
- `durationMinutes > 0`.
- `0 <= usedMinutes <= allocatedMinutes`.
- PostgreSQL GiST exclusion constraint on vehicle plus `tstzrange(startTime, endTime, '[)')` for every status except `CANCELLED`.
- Indexes for society/status queries, vehicle/time availability, flat history, and user history.

The GiST exclusion constraint is added in a custom Prisma SQL migration because Prisma Schema Language cannot represent it directly. It is the final database guard against double booking.

### Booking transaction

`POST /bookings` runs in one short `SERIALIZABLE` transaction:

1. Validate the requested interval and calculate `durationMinutes` on the server.
2. Lock/read the flat's quota row for the local calendar year.
3. Reject if `allocatedMinutes - usedMinutes < durationMinutes`.
4. Select one `AVAILABLE` society vehicle with no overlapping non-cancelled booking. Lock the candidate vehicle row so concurrent requests choose different vehicles.
5. Create the booking.
6. Increment `FlatQuota.usedMinutes`.
7. Commit and return the booking plus updated quota.

On a serialization conflict, retry the entire transaction up to five times. The exclusion constraint remains the last defense if an unexpected code path bypasses the normal lock order.

Cancellation also uses one transaction: lock the booking, verify it is cancellable, mark it `CANCELLED`, decrement the matching quota row, and commit.

## 6. Prisma Schema

This schema targets Prisma ORM 7. Runtime and migration connection URLs belong in `prisma.config.ts` and environment variables, not in this file.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  RESIDENT
  ADMIN
}

enum VehicleStatus {
  AVAILABLE
  MAINTENANCE
  INACTIVE
}

enum BookingStatus {
  BOOKED
  COMPLETED
  CANCELLED
}

model Society {
  id        String    @id @default(uuid()) @db.Uuid
  name      String    @db.VarChar(150)
  timezone  String    @default("Asia/Kolkata") @db.VarChar(64)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @db.Timestamptz(3)
  flats     Flat[]
  users     User[]
  vehicles  Vehicle[]
  bookings  Booking[]
}

model Flat {
  id        String      @id @default(uuid()) @db.Uuid
  societyId String      @db.Uuid
  number    String      @db.VarChar(30)
  isActive  Boolean     @default(true)
  createdAt DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt DateTime    @updatedAt @db.Timestamptz(3)
  society   Society     @relation(fields: [societyId], references: [id], onDelete: Restrict)
  resident  User?
  quotas    FlatQuota[]
  bookings  Booking[]

  @@unique([societyId, number])
  @@index([societyId, isActive])
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  societyId    String    @db.Uuid
  flatId       String?   @unique @db.Uuid
  role         UserRole
  name         String    @db.VarChar(120)
  email        String?   @unique @db.VarChar(255)
  phone        String?   @unique @db.VarChar(20)
  passwordHash String    @db.VarChar(255)
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(3)
  society      Society   @relation(fields: [societyId], references: [id], onDelete: Restrict)
  flat         Flat?     @relation(fields: [flatId], references: [id], onDelete: Restrict)
  bookings     Booking[]

  @@index([societyId, role, isActive])
}

model Vehicle {
  id                 String        @id @default(uuid()) @db.Uuid
  societyId          String        @db.Uuid
  name               String        @db.VarChar(80)
  registrationNumber String        @db.VarChar(32)
  status             VehicleStatus @default(AVAILABLE)
  createdAt          DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime      @updatedAt @db.Timestamptz(3)
  society            Society       @relation(fields: [societyId], references: [id], onDelete: Restrict)
  bookings           Booking[]

  @@unique([societyId, registrationNumber])
  @@index([societyId, status])
}

model FlatQuota {
  id               String   @id @default(uuid()) @db.Uuid
  flatId           String   @db.Uuid
  year             Int      @db.SmallInt
  allocatedMinutes Int
  usedMinutes      Int      @default(0)
  createdAt        DateTime @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime @updatedAt @db.Timestamptz(3)
  flat             Flat     @relation(fields: [flatId], references: [id], onDelete: Cascade)

  @@unique([flatId, year])
  @@index([year])
}

model Booking {
  id              String        @id @default(uuid()) @db.Uuid
  societyId       String        @db.Uuid
  vehicleId       String        @db.Uuid
  flatId          String        @db.Uuid
  userId          String        @db.Uuid
  quotaYear       Int           @db.SmallInt
  startTime       DateTime      @db.Timestamptz(3)
  endTime         DateTime      @db.Timestamptz(3)
  durationMinutes Int
  status          BookingStatus @default(BOOKED)
  cancelledAt     DateTime?     @db.Timestamptz(3)
  createdAt       DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime      @updatedAt @db.Timestamptz(3)
  society         Society       @relation(fields: [societyId], references: [id], onDelete: Restrict)
  vehicle         Vehicle       @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  flat            Flat          @relation(fields: [flatId], references: [id], onDelete: Restrict)
  user            User          @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([societyId, status, startTime])
  @@index([vehicleId, startTime, endTime])
  @@index([flatId, createdAt])
  @@index([userId, createdAt])
}
```

Required custom migration SQL, to be implemented later:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_valid_interval"
  CHECK ("endTime" > "startTime"),
  ADD CONSTRAINT "booking_positive_duration"
  CHECK ("durationMinutes" > 0);

ALTER TABLE "FlatQuota"
  ADD CONSTRAINT "flat_quota_bounds"
  CHECK (
    "allocatedMinutes" >= 0
    AND "usedMinutes" >= 0
    AND "usedMinutes" <= "allocatedMinutes"
  );

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_vehicle_no_overlap"
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE ("status" <> 'CANCELLED');
```

## 7. API Conventions

- Base URL: `/api/v1`.
- JSON request and response bodies.
- Mobile authentication: `Authorization: Bearer <token>`.
- Admin authentication: the same JWT contract, preferably delivered in an HTTP-only cookie by the admin login route.
- Timestamps: ISO 8601 with an offset or `Z`.
- Durations and quotas: integer minutes.
- Pagination: `page` and `pageSize`, default `1` and `20`, maximum `100`.
- Successful envelope: `{ "data": ... }`.
- Error envelope: `{ "error": { "code": "...", "message": "...", "details": {} } }`.

Primary errors:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_TIME_RANGE` | End is not after start or slot rules fail |
| 401 | `AUTH_INVALID` | Missing, expired, or invalid credentials |
| 403 | `FORBIDDEN` | Role or ownership check failed |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `QUOTA_EXCEEDED` | Flat lacks enough quota |
| 409 | `NO_VEHICLE_AVAILABLE` | No vehicle can serve the slot |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking started, completed, or was cancelled |
| 422 | `VALIDATION_ERROR` | Zod validation failed |

## 8. API Specification

### Authentication and resident endpoints

| Method | Endpoint | Request | Response/purpose |
|---|---|---|---|
| POST | `/auth/resident/login` | `flatNumber`, `password` | JWT and resident/flat summary |
| POST | `/auth/admin/login` | `email`, `password` | Admin session/JWT |
| GET | `/me` | - | Current user, role, flat, society |
| GET | `/dashboard` | - | Current quota plus next five bookings |
| GET | `/quota/current` | - | `year`, allocated/used/remaining minutes |
| GET | `/availability?startTime=&endTime=` | Query interval | Advisory `available`, count, duration, quota sufficiency |
| POST | `/bookings` | `startTime`, `endTime` | Creates booking and returns assigned vehicle plus updated quota |
| GET | `/bookings?view=upcoming|history&page=&pageSize=` | Filters | Paginated resident booking list |
| GET | `/bookings/{bookingId}` | - | Owned booking detail |
| POST | `/bookings/{bookingId}/cancel` | Empty body | Cancelled booking plus restored quota |

`GET /availability` never reserves a vehicle. `POST /bookings` repeats every check inside the transaction and is the only authoritative result.

### Admin endpoints

All routes below require `ADMIN`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | Total active flats, vehicles by status, resident count, booking counts |
| GET, POST | `/admin/vehicles` | List or create vehicles |
| GET, PATCH, DELETE | `/admin/vehicles/{id}` | Read, edit, or deactivate a vehicle |
| GET, POST | `/admin/flats` | List or create flats |
| GET, PATCH, DELETE | `/admin/flats/{id}` | Read, edit, or deactivate a flat |
| PUT | `/admin/flats/{id}/quota/{year}` | Create/update annual allocation; cannot set below used minutes |
| GET, POST | `/admin/residents` | List or create resident accounts |
| GET, PATCH, DELETE | `/admin/residents/{id}` | Read, edit, reset password, or deactivate |
| GET | `/admin/bookings?from=&to=&status=&flatId=&vehicleId=&page=` | Filtered booking list |
| GET | `/admin/bookings/{id}` | Booking detail |

Admin `DELETE` routes perform deactivation when history exists. The admin dashboard contains operational counts only, not an analytics engine or utilization reporting.

## 9. Mobile Screens and Navigation

```text
Root
|- Auth Stack
|  `- Resident Login
`- Resident Tabs
   |- Home
   |- Book Vehicle
   `- My Bookings
      `- Booking Details (stack/modal)
```

### Resident Login

- Flat number.
- Password.
- Submit, loading state, inline error.
- Successful login stores token securely and opens Home.

### Home

- Allocated, used, and remaining hours.
- Next few upcoming bookings.
- Primary `Book a Vehicle` action.
- Pull to refresh and logout action.

### Book Vehicle

- Date, start time, and end time.
- Calculated duration and quota impact.
- `Check Availability` action.
- Availability result with available vehicle count.
- `Confirm Booking` action.
- Success opens Booking Details and invalidates dashboard/quota/bookings queries.

### My Bookings

- Segmented control: Upcoming and History.
- Cards showing date, time, duration, vehicle, and effective status.
- Tap to open details.

### Booking Details

- Assigned vehicle and registration.
- Local date/time, duration, status, and booking ID.
- Cancel action only when cancellable.
- Confirmation dialog before cancellation.

### Admin web routes

- `/admin/login`
- `/admin`
- `/admin/vehicles`
- `/admin/flats`
- `/admin/residents`
- `/admin/bookings`

Use plain responsive tables and modal/drawer forms. No design system beyond a small shared component set is needed.

## 10. Folder Structure

```text
/
|- apps/
|  |- mobile/
|  |  |- app/
|  |  |  |- (auth)/login.tsx
|  |  |  |- (tabs)/index.tsx
|  |  |  |- (tabs)/book.tsx
|  |  |  |- (tabs)/bookings.tsx
|  |  |  `- booking/[id].tsx
|  |  `- src/
|  |     |- api/
|  |     |- components/
|  |     |- features/
|  |     |- hooks/
|  |     |- store/
|  |     `- utils/
|  `- web/
|     |- app/
|     |  |- api/v1/
|     |  `- admin/
|     `- src/
|        |- auth/
|        |- lib/
|        |- middleware/
|        `- modules/
|           |- bookings/
|           |- quotas/
|           |- vehicles/
|           |- flats/
|           `- residents/
|- packages/
|  |- contracts/src/
|  `- db/
|     |- prisma/
|     |  |- migrations/
|     |  |- schema.prisma
|     |  `- seed.ts
|     `- src/
|- tests/
|  `- booking-concurrency/
|- pnpm-workspace.yaml
`- package.json
```

Each backend module contains a route-facing controller/handler, Zod schemas, a service with business rules, and a small repository for Prisma access. Avoid generic base repositories and unnecessary dependency injection.

## 11. Phased Implementation Roadmap

### Phase 1: Database

1. Rotate the exposed Neon credential and create separate pooled runtime and direct migration URLs.
2. Initialize Prisma 7 configuration and the schema above.
3. Create the initial migration and custom constraints.
4. Add seed data: one society, 50 flats, 50 annual quotas, 5 vehicles, resident demo users, one admin, and historical bookings.
5. Verify indexes, quota checks, adjacent slots, and overlap rejection directly against a disposable Neon branch.

Exit criterion: a repeatable seed creates a usable demo database and the database itself rejects overlapping active bookings.

### Phase 2: Backend APIs

1. Scaffold Next.js, shared contracts, Prisma client, environment validation, and standard error handling.
2. Implement password hashing, JWT issuance, resident/admin authorization, and ownership checks.
3. Implement dashboard, quota, availability, booking list/detail, and cancellation routes.
4. Implement basic admin reads, then simple create/edit/deactivate operations.
5. Add integration tests for authentication, validation, authorization, and quota behavior.

Exit criterion: all resident workflows work through HTTP and return stable error codes.

### Phase 3: Mobile App

1. Scaffold Expo Router, TanStack Query, Zustand auth state, and SecureStore.
2. Build login and guarded navigation.
3. Build Home, Book Vehicle, My Bookings, and Booking Details.
4. Add loading, empty, error, success, and confirmation states.
5. Test on at least one physical Android device using Expo Go or an EAS preview build.

Exit criterion: a resident can complete the full happy path without using Postman or the admin UI.

### Phase 4: Booking Logic

1. Implement the serializable booking transaction, quota-row handling, candidate vehicle locking, and retry policy.
2. Implement transactional cancellation and exact quota restoration.
3. Add database integration tests for overlapping, adjacent, cancelled, maintenance, insufficient-quota, and year-boundary cases.
4. Run six parallel booking requests against five cars and assert five unique assignments plus one `409 NO_VEHICLE_AVAILABLE`.
5. Re-run the same test repeatedly to detect race conditions.

Exit criterion: concurrency tests are deterministic and quota remains correct after failures and cancellations.

### Phase 5: Demo Readiness

1. Deploy Next.js to a region near the Neon `ap-southeast-1` database and configure secrets.
2. Produce an Expo preview build or verify Expo Go access against the deployed API.
3. Reseed stable named demo accounts and prepare credentials without exposing production secrets.
4. Rehearse login, booking, quota deduction, five-success/one-failure concurrency, cancellation, and admin history.
5. Add a short demo script, health endpoint, database backup/branch, and fallback screen recording.
6. Freeze features, fix only blockers, and avoid visual polish that risks booking correctness.

Exit criterion: the complete demonstration can be repeated from a clean seeded state in under ten minutes.

## 12. Acceptance Checklist

- Resident cannot access another flat's bookings.
- Admin-only endpoints reject residents.
- Maintenance/inactive vehicles are never assigned.
- Five cars produce at most five overlapping non-cancelled bookings.
- A sixth simultaneous request returns `409 NO_VEHICLE_AVAILABLE`.
- Adjacent bookings do not conflict.
- Failed bookings do not consume quota.
- Successful bookings consume the exact server-calculated duration.
- Cancellation restores quota once and cannot be repeated.
- Used quota never becomes negative or exceeds allocation.
- All displayed times use the society timezone.
- Secrets are absent from source control, logs, API responses, and documentation.

## 13. Credential Security

The Neon connection string supplied in chat contains a live username and password. It must be treated as exposed and rotated before implementation. Do not commit it, paste it into documentation, or reuse it in a mobile build.

After rotation:

- `DATABASE_URL`: pooled Neon hostname for deployed application traffic.
- `DIRECT_URL`: non-pooler Neon hostname for Prisma migrations and admin tooling.
- Only the backend receives these values.

## 14. Reference Decisions

- Expo Router is the official file-based router for Expo: https://docs.expo.dev/router/introduction/
- Next.js Route Handlers provide the API surface inside the App Router: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Prisma 7 uses the `prisma-client` generator and Prisma Config for datasource URLs: https://www.prisma.io/docs/orm/reference/prisma-schema-reference
- Prisma recommends pooled Neon runtime connections and a direct migration connection: https://www.prisma.io/docs/orm/overview/databases/neon
- Prisma supports serializable transactions and retrying `P2034` conflicts: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- PostgreSQL range exclusion constraints are designed for non-overlapping reservations: https://www.postgresql.org/docs/current/rangetypes.html
