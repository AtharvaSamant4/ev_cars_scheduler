# Society Shared EV Booking System

## Project Handover and Stakeholder Demo Guide

**Status:** MVP implemented and verified  
**Prepared:** June 9, 2026  
**Primary audience:** Society trustees, faculty, builders, technical reviewers, and future maintainers

This document explains what the project proves, how it works, which decisions were
made where requirements were incomplete, and how to present and defend the MVP.
It deliberately describes the system by business capability and architecture, not
file by file.

## Executive Summary

The system gives residents a fair and auditable way to reserve a limited pool of
shared electric vehicles. Each flat receives an annual usage quota. Residents can
see their balance, check a time slot, book an available EV, review their history,
and cancel a future reservation to recover the exact quota used.

The main engineering risk was not the interface. It was preventing two residents
from receiving the same vehicle at the same time while keeping quota accounting
correct under simultaneous requests. The implementation handles this with
database transactions, row locking, transaction retries, and a PostgreSQL
constraint that independently rejects overlapping active bookings.

The current product is a focused MVP. It proves booking, quota, availability,
history, cancellation, administration APIs, and concurrency protection. It does
not claim production readiness or include broader mobility, payment, tracking,
notification, analytics, or multi-society features.

# 1. Problem Statement

## What business problem does this solve?

A residential society may own a small number of shared EVs for a much larger
number of flats. Without a controlled system, residents typically depend on
phone calls, messaging groups, paper registers, spreadsheets, or a security desk
to request a vehicle.

Those methods make it difficult to answer basic operational questions:

- Is a vehicle actually available at the requested time?
- Has another resident already reserved it?
- How much usage is each flat entitled to?
- Has a flat exceeded its fair allocation?
- Who booked or cancelled a vehicle?
- Can management review the history without reconciling messages manually?

## Why would a builder or society need this?

Shared EVs can be offered as a society amenity without assigning one vehicle to
every flat. This reduces capital cost, parking demand, and idle capacity.
However, the amenity is only credible if residents trust the allocation and can
book without administrative friction.

The system gives a builder or society:

- A demonstrable digital amenity for residents.
- Controlled access to a limited shared resource.
- A repeatable and transparent allocation policy.
- Central records for residents, flats, quotas, vehicles, and bookings.
- A base that can later support society-specific rules after those rules are
  approved.

## Pain points addressed

- **Double-booking:** One vehicle must not be promised to two residents.
- **Unfair usage:** A small number of residents should not consume the entire
  fleet without accounting.
- **Manual coordination:** Residents should not need an administrator for every
  booking.
- **Unclear availability:** Availability is calculated for the requested period.
- **Quota disputes:** Allocated, used, and remaining usage is visible.
- **Cancellation accounting:** A valid cancellation restores the precise booking
  duration.
- **Poor traceability:** Booking and cancellation history remains in the system.
- **Administrative maintenance:** Backend APIs support managing flats, residents,
  vehicles, quotas, and booking records.

# 2. Project Overview

## Simple explanation

The society owns a pool of EVs. Each flat receives a yearly allowance measured
in minutes and displayed as hours. A resident signs in using the flat number and
password, chooses a future date and time, and asks the system to check
availability.

If the flat has enough quota and at least one EV is free, the resident confirms
the booking. The backend selects the vehicle, records the reservation, and
deducts the duration from the flat's quota in one protected operation.

If the resident cancels before the booking begins, the reservation is marked
cancelled and the full duration is restored to the flat.

## Resident journey

```text
Resident login
    ->
Dashboard shows annual quota and upcoming bookings
    ->
Resident enters date, start time, and end time
    ->
System shows whether the slot can be booked
    ->
Resident confirms
    ->
Backend assigns an available EV and deducts quota
    ->
Booking appears in details and booking history
    ->
Resident may cancel before the start time
    ->
Booking becomes cancelled and quota is restored
```

## How fairness is achieved

The current fairness model has two parts:

1. **Quota fairness:** Every seeded flat receives an annual allocation. Every
   successful booking consumes the exact duration from that flat's allocation.
2. **First-confirmed, first-served allocation:** For a valid slot, successful
   transactions receive available vehicles. The system does not use personal
   preference, social status, or manual favoritism.

This is a clear and defensible MVP policy, but it is not a complete policy
engine. The current version does not limit the number of active future bookings,
prevent the same flat from reserving multiple vehicles at overlapping times, or
prioritize any resident category. Those rules require explicit stakeholder
approval before implementation.

# 3. Core Assumptions Made

Requirements were incomplete, so the following assumptions were made to deliver
a coherent MVP quickly.

| Assumption | Why it was made | Impact on system behavior | How it can be changed later |
|---|---|---|---|
| The MVP operates for one configured society. | The demo concerns one residential society and multi-tenant SaaS was excluded. | Users, flats, vehicles, and bookings are scoped to the seeded society; there is no society selector. | Add tenant onboarding, tenant-aware authentication, stricter tenant isolation, and society administration. |
| The seed contains 50 flats and 5 EVs. | These figures match the demonstration scenario and make scarcity visible. | The demo can show more residents than vehicles and demonstrate contention. | Both are database records, not hard-coded business limits; admins can add or deactivate records through APIs. |
| One resident account represents one flat. | The requested login was a flat number and password, not individual family accounts. | Quota and booking ownership are attached to the flat; one active resident user is linked to each flat. | Support multiple users per flat while retaining one shared flat quota. |
| Quota belongs to the flat, not an individual person. | Shared society entitlement is usually allocated per residence. | All usage by the flat reduces the same annual balance. | Add user-level allowances or sub-allocations within a flat. |
| The seeded annual allocation is 876 hours per flat. | No formal quota formula was provided, so a stable demonstration allocation was required. | The seeded 2026 quota is 52,560 minutes and can be changed by an admin API. | Replace with a board-approved formula, flat-type rules, paid packages, or annual batch allocation. |
| Quota is stored in integer minutes. | Decimal hours can introduce rounding errors. | A six-hour booking always consumes exactly 360 minutes. | Keep minutes internally even if future interfaces display days, credits, or mixed units. |
| Quota is per calendar year and does not carry forward. | Carry-forward rules were not approved and add policy complexity. | Unused quota has no automatic effect on the next year. Bookings cannot cross a year boundary. | Add an annual rollover job and an approved cap or expiry policy. |
| A booking consumes quota immediately when confirmed. | Immediate accounting is simple, visible, and prevents over-commitment. | Future bookings reduce the displayed remaining balance at once. | Introduce reserved versus consumed balances if operations require usage-based settlement. |
| A future cancellation restores the full duration. | No cancellation fee or notice-period policy was provided. | Cancellation before the start time returns all booking minutes. | Add cutoff windows, partial refunds, penalties, or trustee-approved exceptions. |
| A booking cannot be cancelled after it starts. | Restoring quota after usage begins would create ambiguity and abuse risk. | Started, completed, or already-cancelled reservations are not cancellable. | Add an admin override with audit logging if required. |
| Bookings must be between 1 and 24 hours. | This prevents accidental zero-length and excessively long reservations. | Requests shorter than one hour or longer than one day are rejected. | Make minimum and maximum duration configurable per society. |
| Start and end times use 30-minute boundaries. | Half-hour slots are easy to explain and operate. | Times such as 2:15 PM are rejected; 2:00 PM and 2:30 PM are valid. | Change the validation rule to 15-minute, hourly, or policy-defined increments. |
| Bookings must begin in the future. | The product is a reservation system, not a retroactive usage ledger. | Past or currently-started requests are rejected. | Add an admin-only manual booking or correction workflow. |
| A booking must stay inside one society-local calendar year. | Each booking must map unambiguously to one annual quota row. | A December 31 to January 1 booking is rejected. | Split the duration across yearly quota accounts in a future policy engine. |
| Residents do not select a specific vehicle. | Automatic allocation is faster and reduces preference-driven contention. | The backend assigns any operationally available EV. | Add vehicle choice with the same conflict and quota protections. |
| Only vehicles marked `AVAILABLE` can be assigned. | Maintenance and inactive vehicles must be removed from circulation. | `MAINTENANCE` and `INACTIVE` vehicles never enter the candidate pool. | Add richer maintenance schedules and temporary blocks. |
| Availability checking is advisory, not a temporary hold. | Holding inventory requires expiry timers and more state. | A slot can be available during the check but lost before confirmation; confirmation repeats every check. | Add short-lived reservation holds if user research proves they are needed. |
| Allocation is first-confirmed, first-served. | No approved seniority, priority, lottery, or emergency policy exists. | The first transactions that can safely commit receive the vehicles. | Add a documented priority or request-approval mechanism. |
| The same flat may currently hold overlapping bookings on different EVs. | No rule prohibited this, and the core constraint was vehicle conflict rather than flat conflict. | A sufficiently funded flat can reserve more than one vehicle for the same period. | Add a flat-based PostgreSQL exclusion constraint or service validation. |
| There is no cap on the number of future bookings beyond quota and availability. | No anti-hoarding rule was specified. | A resident can create multiple future reservations while quota remains. | Add maximum active bookings, rolling windows, or lead-time limits. |
| Adjacent bookings are allowed. | A car becoming free at 2:00 PM should be bookable from 2:00 PM. | Time ranges use `[start, end)`, so touching intervals do not overlap. | Add turnaround or charging buffers between reservations. |
| Society time is `Asia/Kolkata`; storage uses UTC. | The demonstrated society is in India, while UTC storage prevents timezone ambiguity. | Residents see local dates and times; database timestamps remain consistent. | Store a timezone per society and use it automatically for future tenants. |
| Completed status can be calculated from the end time. | A background job was unnecessary for the demo. | An expired `BOOKED` record is returned to users as effectively completed. | Add scheduled status updates and operational workflows. |
| Historical entities are deactivated rather than deleted. | Deleting a flat, user, or vehicle could destroy booking traceability. | Old records remain relationally valid while inactive records cannot participate normally. | Add retention, archival, and anonymization policies. |
| Resident authentication uses flat number and password. | OTP and external identity providers were explicitly excluded. | Residents must know shared demo credentials; there is no password recovery flow. | Add per-user identity, password reset, OTP, SSO, or society directory integration. |
| Admin authentication uses email and password. | Administrators need a separate role and credential pattern. | Admin API requests require an admin JWT; resident tokens cannot use admin routes. | Add stronger MFA and session administration for production. |
| JWT access tokens last seven days by default. | A refresh-token system was unnecessary for the MVP. | Users sign in again after expiry; there is no refresh-token rotation. | Add short-lived access tokens, refresh tokens, revocation, and device management. |
| No weekend, holiday, charging, or operating-hour restrictions exist. | These policies were not defined. | Any valid future slot may be requested if quota and a vehicle are available. | Add a configurable booking policy layer after trustee approval. |
| No no-show, damage, or late-return penalties exist. | The MVP proves reservation logic, not fleet operations. | Quota changes only through booking and valid cancellation. | Add trip lifecycle, check-in/out, penalties, and admin dispute handling. |

# 4. System Architecture

## Mobile App

The resident application is built with Expo and React Native. It provides the
login, dashboard, booking, history, details, cancellation, and logout journey.
Expo Router controls navigation. TanStack Query manages API data and refreshes
affected screens after booking or cancellation. Zustand holds the current
session. Native devices store the token through Expo SecureStore.

The mobile app never connects directly to PostgreSQL. It sends authenticated
HTTPS JSON requests to the backend.

## Backend API

The backend uses Next.js Route Handlers under `/api/v1`. It is the authoritative
layer for:

- Authentication and role enforcement.
- Request validation.
- Society and ownership checks.
- Booking rules.
- Vehicle assignment.
- Quota deduction and restoration.
- Administrative CRUD and reporting APIs.

Client-side validation improves usability, but the backend repeats and enforces
every business-critical rule.

## Database

Neon PostgreSQL stores all durable business data. Prisma supplies typed database
access and migrations. Custom PostgreSQL constraints provide protections that an
application check alone cannot guarantee, especially the no-overlap rule.

## Authentication

Passwords are hashed with bcrypt. A successful login returns a signed JWT. The
backend verifies the signature, expiration, current database user, active state,
and required role on protected requests.

Resident mobile requests send the token in the `Authorization: Bearer` header.
The backend also supports an HTTP-only cookie pattern for admin sessions.

## Booking Engine

The booking engine normalizes time ranges, verifies annual quota, selects and
locks an available vehicle, writes the booking, and updates quota inside a
serializable database transaction. It retries recognized database conflicts and
relies on a database exclusion constraint as the final no-double-booking guard.

## Architecture flow

```text
+---------------------------+
| Expo Resident Mobile App  |
|                           |
| Expo Router               |
| TanStack Query            |
| Zustand + SecureStore     |
+-------------+-------------+
              |
              | HTTPS JSON + JWT
              v
+-------------+-------------+
| Next.js Backend API       |
|                           |
| Validation and auth       |
| Resident/admin services   |
| Booking engine            |
| Error and response rules  |
+-------------+-------------+
              |
              | Prisma typed queries and transactions
              v
+-------------+-------------+
| Neon PostgreSQL           |
|                           |
| Business tables           |
| Foreign keys and checks   |
| Row locks                 |
| No-overlap constraint     |
+---------------------------+
```

The admin capability currently ends at authenticated backend APIs. A visual
admin dashboard has not been implemented.

# 5. Database Design

## Society

**Purpose:** Represents the residential society that owns the flats, users,
vehicles, and bookings.

**Key fields:** Name and timezone.

**Relationships:** One society has many flats, users, vehicles, and bookings.

**Business meaning:** It is the ownership boundary for all operational data.
The MVP contains one society, but retaining the relationship prevents records
from becoming globally unscoped.

## Flat

**Purpose:** Represents a residence and the owner of the annual quota.

**Key fields:** Society, flat number, and active status.

**Relationships:** A flat belongs to one society, may have one resident account
in the MVP, has annual quota records, and has many bookings.

**Business meaning:** Booking fairness is measured per flat. Deactivating a flat
also deactivates its resident access while preserving history.

## User

**Purpose:** Represents a resident or administrator who can authenticate.

**Key fields:** Role, name, optional flat, email or phone, password hash, and
active status.

**Relationships:** A user belongs to one society. A resident is linked to one
flat. A user can create many bookings.

**Business meaning:** Roles separate resident actions from administrative
actions. Passwords are never stored in plain text.

## Vehicle

**Purpose:** Represents a shared EV that may be assigned to bookings.

**Key fields:** Name, registration number, society, and operational status.

**Relationships:** A vehicle belongs to a society and has many historical and
future bookings.

**Business meaning:** Only vehicles marked available are considered for a new
reservation. Registration numbers are unique within the society.

## FlatQuota

**Purpose:** Stores one flat's allocation and used amount for one calendar year.

**Key fields:** Flat, year, allocated minutes, and used minutes.

**Relationships:** Each row belongs to one flat. The combination of flat and
year is unique.

**Business meaning:** Remaining quota is calculated as allocated minus used.
Database checks prevent negative values and prevent used quota from exceeding
the allocation.

## Booking

**Purpose:** Records a reservation, the assigned vehicle, the responsible flat
and user, the time period, duration, quota year, and lifecycle status.

**Key fields:** Society, vehicle, flat, user, start time, end time, duration,
status, quota year, and cancellation timestamp.

**Relationships:** A booking belongs to one society, one vehicle, one flat, and
one user.

**Business meaning:** A booking is the auditable record connecting entitlement
to a specific EV and time range. Cancelled records remain in history but stop
blocking the vehicle.

## Database-level rules

- Flat numbers are unique within a society.
- Vehicle registration numbers are unique within a society.
- One quota row exists per flat and year.
- A booking end must be after its start.
- Booking duration must be positive.
- Cancelled bookings must have a cancellation timestamp.
- Quota usage must remain between zero and the allocation.
- A vehicle cannot have overlapping non-cancelled bookings.
- Foreign keys prevent orphaned operational records.
- Query indexes support availability, history, status, and society filters.

# 6. Booking Logic

## What happens when a resident books a vehicle?

1. **The resident authenticates.**  
   The backend verifies the JWT, confirms that the user is active, confirms the
   `RESIDENT` role, and identifies the resident's flat and society.

2. **The requested interval is normalized.**  
   The server parses the ISO timestamps and calculates the duration itself. It
   does not trust a duration sent by the mobile app.

3. **Time rules are validated.**  
   The start must be in the future. The end must be after the start. The
   duration must be between 1 and 24 hours. Both times must fall on 30-minute
   boundaries, and the booking must stay within one local calendar year.

4. **The transaction begins at serializable isolation.**  
   This is PostgreSQL's strictest normal transaction isolation level. It
   prevents simultaneous operations from silently producing a result that
   could not have happened in a safe serial order.

5. **The annual quota row is locked.**  
   The flat's quota row for the booking year is read with `FOR UPDATE`. Other
   simultaneous bookings for the same flat cannot update that quota row until
   the first transaction finishes.

6. **Quota is validated.**  
   Remaining minutes are calculated. If the requested duration is greater than
   the remaining amount, the transaction returns `409 QUOTA_EXCEEDED`.

7. **An available vehicle is selected and locked.**  
   The query considers only society vehicles marked `AVAILABLE` with no
   overlapping non-cancelled reservation. It locks one candidate vehicle and
   skips vehicles already locked by another booking transaction.

8. **No-vehicle behavior is handled.**  
   If no candidate can be locked, the transaction returns
   `409 NO_VEHICLE_AVAILABLE`. No booking is created and no quota is consumed.

9. **The booking is created.**  
   The database records the society, vehicle, flat, user, quota year, time
   range, server-calculated duration, and `BOOKED` status.

10. **Quota is deducted.**  
    The same transaction increments used minutes by the exact duration.

11. **The transaction commits.**  
    Booking creation and quota deduction become visible together. Neither can
    succeed without the other.

12. **The mobile app refreshes affected views.**  
    Dashboard, upcoming bookings, history, and booking details are refreshed
    through TanStack Query cache invalidation.

The earlier availability screen is intentionally not authoritative. The final
`POST /bookings` repeats all checks because another resident may confirm during
the gap between checking and booking.

# 7. Cancellation Logic

## What happens when a resident cancels?

1. The backend verifies the JWT and identifies the resident's flat.
2. A serializable transaction begins.
3. The booking row is locked with `FOR UPDATE`.
4. The system confirms the booking exists and belongs to the resident's flat.
5. It confirms the stored status is `BOOKED`.
6. It confirms the start time is still in the future.
7. If any rule fails, the system returns either `404 NOT_FOUND` or
   `409 BOOKING_NOT_CANCELLABLE`.
8. The booking status changes to `CANCELLED`.
9. The cancellation timestamp is recorded.
10. The matching annual quota row is reduced by the booking duration.
11. The transaction commits the status change and quota restoration together.
12. The mobile app refreshes dashboard, history, and booking details.

## Why quota cannot be restored twice

The first cancellation locks and updates the booking. A second cancellation sees
that the status is no longer `BOOKED` and is rejected. The quota database check
also prevents usage from becoming negative. A failed cancellation transaction
does not partially update either record.

# 8. Conflict Prevention

## Simple explanation

Imagine five physical keys on a desk, one for each EV.

When six residents confirm the same period at the same time, the database lets
five transactions safely take five different keys. The sixth transaction finds
no key left and receives a clear "no vehicle available" response.

The booking and quota change are treated as one indivisible action. The system
cannot permanently deduct quota without creating the booking, and it cannot
create the booking without deducting quota.

There is also a final rule inside PostgreSQL itself: two active bookings for the
same vehicle may not overlap. Even if an application mistake tried to write an
invalid reservation, the database would refuse to commit it.

## Technical explanation

### 1. Serializable transactions

Booking and cancellation run at `SERIALIZABLE` isolation. PostgreSQL detects
unsafe concurrent transaction histories. Recognized serialization conflicts are
retried up to five times with a small randomized backoff.

### 2. Quota row locking

The flat's annual quota row is selected `FOR UPDATE`. Two simultaneous booking
requests from the same flat cannot both read an outdated quota balance and
overspend it.

### 3. Vehicle locking with `SKIP LOCKED`

The candidate query:

- Filters to the correct society.
- Filters to vehicles with operational status `AVAILABLE`.
- Excludes vehicles with overlapping non-cancelled bookings.
- Locks the selected vehicle row.
- Uses `SKIP LOCKED` so another request moves to a different EV rather than
  selecting the same locked candidate.

### 4. Half-open overlap logic

The application treats intervals as `[start, end)`.

Two intervals conflict when:

```text
existing.start < requested.end
AND
existing.end > requested.start
```

This correctly rejects genuine overlaps while allowing:

```text
Booking A: 10:00 AM -> 2:00 PM
Booking B:  2:00 PM -> 4:00 PM
```

### 5. PostgreSQL exclusion constraint

The database has a GiST exclusion constraint over:

```text
vehicleId
and
tstzrange(startTime, endTime, '[)')
```

It applies to every booking whose status is not `CANCELLED`. Therefore, two
overlapping active records for the same vehicle cannot both be committed.

### 6. Atomic quota accounting

Booking creation and quota increment happen in the same transaction.
Cancellation and quota decrement also happen in one transaction. Any error
rolls back the complete operation.

## Six users attempting to book five vehicles

On June 9, 2026, a live concurrency rehearsal sent six booking requests in
parallel for June 11, 2026, from 2:00 PM to 8:00 PM in `Asia/Kolkata`.

| Outcome | Result |
|---|---:|
| Successful bookings | 5 |
| Unique vehicles assigned | 5 |
| Rejected requests | 1 |
| Rejection | HTTP 409 `NO_VEHICLE_AVAILABLE` |
| Double-bookings | 0 |
| Test duration | 3,959 ms |
| Cleanup cancellations | 5 of 5 succeeded |

The five successes received EV 1 through EV 5 exactly once each. The rejected
resident's quota was not changed. All five test bookings were cancelled after
the test and their quota was restored.

## Why double-booking cannot occur under the current schema

The normal application path avoids the conflict through locks and serializable
transactions. The PostgreSQL exclusion constraint is independent of that path
and refuses any overlapping active rows that still reach the write stage.

Under the deployed migration, a conflicting pair cannot both commit. This
guarantee would be weakened only if someone removed or disabled the database
constraint, wrote to a different database without the migration, or bypassed
the system with unsupported administrative database changes.

# 9. Features Implemented

## Resident Features

- Flat-number and password login.
- Secure native token storage through Expo SecureStore.
- Authenticated and guarded navigation.
- Dashboard with allocated, used, and remaining annual quota.
- Upcoming booking summary.
- Date, start time, and end time entry.
- Availability check with available vehicle count.
- Quota sufficiency and post-booking quota preview.
- Automatic EV assignment.
- Booking confirmation.
- Booking details with vehicle name and registration.
- Upcoming bookings list.
- Completed and cancelled history.
- Effective completion display based on end time.
- Future booking cancellation.
- Exact quota restoration after cancellation.
- Pull-to-refresh and query cache refresh.
- Loading, empty, validation, and error states.
- Logout confirmation and local session clearing.

## Admin Features

These are implemented as protected backend APIs. A visual admin interface is not
part of the current build.

- Admin email and password login.
- Dashboard counts for active flats, active residents, vehicle status, total
  bookings, and upcoming bookings.
- List, create, update, and deactivate vehicles.
- Mark vehicles available, under maintenance, or inactive.
- List, create, update, and deactivate flats.
- Create or update annual flat quota.
- Prevent an allocation from being lowered below already-used quota.
- List, create, update, reset password, and deactivate resident accounts.
- List and filter society bookings by date, status, flat, and vehicle.
- View full admin booking details.
- Role checks that reject resident access to admin endpoints.

## Backend Features

- Versioned JSON API under `/api/v1`.
- Health endpoint.
- Standard success and error envelopes.
- Shared Zod request validation.
- Stable business error codes.
- JWT authentication and role authorization.
- Active account checks on protected requests.
- Society scoping and resident ownership checks.
- Pagination for list endpoints.
- Server-side duration and timezone rules.
- Advisory availability checks.
- Serializable booking and cancellation transactions.
- Retry handling for serialization and overlap conflicts.
- Automatic vehicle selection.
- Atomic quota changes.
- CORS and preflight support for mobile/web clients.

## Database Features

- Prisma 7 schema and generated typed client.
- Repeatable PostgreSQL migration.
- Neon serverless adapter.
- Seed for one society, 50 flats, 50 resident accounts, 50 annual quotas, 5
  EVs, one administrator, and sample booking history.
- Unique constraints for flat numbers, vehicle registrations, users, and annual
  quotas.
- Foreign-key integrity.
- Role-to-flat consistency check.
- Quota boundary checks.
- Booking interval and cancellation consistency checks.
- GiST no-overlap constraint.
- Indexes for availability, booking history, status, and society queries.
- Deactivation rather than destructive deletion of historical entities.

# 10. Demo Walkthrough

## Three-minute presentation script

### 0:00-0:25 - Resident login

**Open:** Resident Login screen.

**Say:**

> "This is the resident-facing mobile experience. For the demo, every flat has
> a seeded account. In production, these credentials would be issued and
> changed securely."

**Action:** Enter:

```text
Flat: A101
Password: Demo@123
```

Tap **Login**.

**Highlight:** The resident does not see administrative functions or another
flat's records.

### 0:25-0:55 - Dashboard and fairness

**Open:** Dashboard.

**Say:**

> "The system makes the allocation transparent. This flat has 876 allocated
> hours, 6 used hours, and 870 remaining hours. Usage is stored precisely in
> minutes, even though the screen displays hours."

**Action:** Point to allocated, used, and remaining figures.

**Highlight:** The quota belongs to the flat and is reduced only through a
successful booking.

### 0:55-1:35 - Book a vehicle

**Open:** Book tab or tap **Book a vehicle**.

**Say:**

> "The resident chooses only the required time. The backend assigns the actual
> EV so residents do not compete over preferred vehicles."

**Action:** Choose tomorrow relative to the demo date:

```text
Start: 2:00 PM
End:   8:00 PM
```

Tap **Check availability**.

**Highlight:** Show the available EV count, six-hour duration, and quota impact.

**Action:** Tap **Confirm booking**.

**Say:**

> "Confirmation repeats all checks inside a protected database transaction.
> The availability check alone never reserves a vehicle."

### 1:35-2:05 - Booking details and history

**Open:** Booking Details, then My Bookings.

**Say:**

> "The system has assigned a specific EV, recorded the registration, duration,
> and booking ID, and deducted six hours from the flat's balance."

**Action:** Show the booking in Upcoming.

**Highlight:** The booking is now a durable, auditable record.

### 2:05-2:35 - Cancellation

**Open:** Booking Details.

**Say:**

> "Because this booking has not started, the resident may cancel it. The
> booking remains in history, but it stops blocking the vehicle."

**Action:** Tap **Cancel booking** and confirm.

**Highlight:** Status changes to Cancelled and the app confirms quota
restoration.

### 2:35-3:00 - Restored quota and closing point

**Open:** Dashboard.

**Say:**

> "The quota has returned to 870 hours. Booking status and quota restoration
> were committed together, so the system cannot leave one updated without the
> other. The same database protection also prevents two residents from
> receiving the same EV for overlapping times."

**Closing statement:**

> "The MVP proves the core business idea: residents can fairly reserve a
> limited shared fleet, while the society retains accurate control of
> availability, quota, and history."

## Demo preparation notes

- Use a future open slot. The verified rehearsal used June 10, 2026, from 2:00
  PM to 8:00 PM.
- Start with the seeded baseline of 876 allocated, 6 used, and 870 remaining
  hours for A101.
- Cancel the demonstration booking at the end so the next rehearsal starts from
  the same quota.
- Keep a screen recording and screenshots as fallback evidence.
- Do not expose the database connection string during the presentation.

# 11. Testing Evidence

## Manual resident workflow

The live resident journey was tested on June 9, 2026 against the Neon database:

| Step | Result |
|---|---|
| Login with A101 / Demo@123 | Passed; JWT returned |
| Dashboard quota | Passed |
| Availability for June 10, 2026, 2:00 PM-8:00 PM | Passed; 5 EVs available |
| Booking creation | Passed; EV 1 assigned |
| Booking history | Passed; booking present |
| Cancellation | Passed |
| Quota debit | 360 minutes |
| Quota restoration | Returned from 51,840 to 52,200 remaining minutes |
| Logout | Passed |

## Mobile UI rehearsal

The full Expo application journey was automated at a 390 x 844 phone viewport:

- Login passed.
- Dashboard quota labels and values passed.
- Availability passed.
- Booking detail passed.
- Cancellation dialog and cancellation passed.
- Cancelled booking appeared in history.
- Dashboard visibly returned to 870 hours remaining.
- Logout passed.
- Browser console errors: zero.

Evidence screenshots are stored under:

```text
apps/mobile/test-artifacts/
```

This verifies the rendered Expo web experience. It does not replace a physical
Android and iOS test. No Android SDK, emulator, or connected device was
available during verification.

## Concurrency testing

Six residents submitted the same six-hour slot concurrently against five EVs:

- Five requests returned HTTP 201.
- Each success received a distinct EV.
- One request returned HTTP 409 `NO_VEHICLE_AVAILABLE`.
- No overlapping duplicate assignment was created.
- All five test reservations were cancelled successfully.
- Quota balances were checked after cleanup.

The concurrency rehearsal was executed as a live test script. A permanent
database integration test for this six-request case is not yet committed to the
repository and should be added before production release.

## Validation tests

The committed Vitest suite contains four booking-range tests:

- Accepts a future half-hour-aligned booking.
- Rejects a past booking.
- Rejects times outside 30-minute boundaries.
- Rejects a booking that crosses a calendar-year boundary.

Result on June 9, 2026:

```text
Test files: 1 passed
Tests:      4 passed
```

## Build verification

| Verification | Result |
|---|---|
| Workspace TypeScript checks | Passed |
| Mobile Expo lint | Passed |
| Backend ESLint | Passed |
| Backend Vitest | 4 of 4 passed |
| Expo Doctor | 21 of 21 checks passed |
| Expo web export | Passed; 1,250 modules bundled |
| Next.js production build | Passed with required environment variables supplied |
| API health check | Passed |
| API CORS preflight | Passed |

The backend production build requires `DATABASE_URL` and `JWT_SECRET` to be
present because API modules initialize database and authentication dependencies.
That configuration requirement is expected and must be reflected in deployment.

# 12. Current Limitations

## Intentionally excluded product features

- Payments, billing, subscriptions, and refunds.
- OTP login and password recovery.
- Push notifications, SMS, email, and reminders.
- Maps, GPS, live location, and vehicle tracking.
- Remote lock or unlock.
- Vehicle telemetry, battery status, and charging integration.
- AI recommendations or conversational features.
- Analytics dashboards and utilization forecasting.
- Waitlists and automatic reassignment.
- Recurring bookings.
- Booking modification; residents cancel and create a new booking.
- Weekend, holiday, peak-hour, or emergency policy rules.
- Senior citizen or other priority allocation.
- Carry-forward of unused annual quota.
- Resident selection of a specific vehicle.
- Calendar-style slot visualization.
- Multi-society SaaS onboarding and tenant administration.
- Native or web admin user interface.

## MVP operational limitations

- Physical Android and iOS verification is still required.
- The mobile app needs a deployed HTTPS API URL or correct LAN URL for a phone.
- The current date and time controls are validated text inputs rather than
  polished native pickers.
- There is one resident account per flat.
- There is no maximum active-booking rule.
- A flat can currently hold overlapping reservations on different vehicles.
- There is no charging or turnaround buffer between adjacent reservations.
- Completed status is derived at read time rather than updated by a scheduler.
- There is no offline booking mode.
- There is no trip start, trip end, key handover, damage, or no-show workflow.

## Production-readiness limitations

- The Neon credential previously shared during development must be rotated.
- Demo resident and admin passwords must be changed.
- API CORS currently permits all origins and must be restricted.
- There is no API rate limiting or brute-force login protection.
- JWTs use a simple access-token model without refresh rotation or a revocation
  list.
- There is no formal audit event log beyond operational records and timestamps.
- There is no monitoring, alerting, tracing, or production incident process.
- Backup, point-in-time recovery, and restore drills have not been documented.
- The live concurrency scenario is not yet a committed repeatable integration
  test.
- Security testing, penetration testing, accessibility testing, and load testing
  are not complete.
- Store-distributed Android and iOS builds have not been produced.

# 13. Future Enhancements

All future features should begin with an approved business rule. They should not
be added during the MVP demo freeze.

## Phase 2: Stakeholder-validated product rules

- Simple admin dashboard UI with total flats, total vehicles, active bookings,
  and operational vehicle counts.
- Calendar view of available slots.
- Optional resident selection of a specific vehicle.
- Quota carry-forward with an approved cap and expiry rule.
- Weekend, holiday, peak-hour, and maximum-duration policies.
- Priority rules for senior citizens, emergencies, or approved resident groups.
- Maximum future bookings and anti-hoarding limits.
- Prevention of overlapping bookings by the same flat.
- Booking modification with safe vehicle and quota recalculation.
- Charging and turnaround buffers.
- Better native date and time pickers.

## Phase 3: Operational management

- Waitlist and automatic assignment after cancellation.
- Push, SMS, or email reminders.
- Vehicle maintenance scheduling.
- Trip check-in and check-out.
- Key handover or remote-access integration.
- No-show, late return, damage, and penalty workflows.
- Detailed admin audit history.
- Resident support and dispute workflows.
- Fleet utilization and quota reports.
- Multiple authorized users within one flat.

## Production Version

- Multi-society tenant onboarding and isolation.
- Tenant-specific branding, policies, quotas, and timezones.
- Production identity, MFA, password recovery, token rotation, and device
  session management.
- Restricted CORS, rate limiting, abuse prevention, and security headers.
- CI/CD with migration gates and rollback procedures.
- Automated API, database integration, concurrency, mobile, and end-to-end test
  suites.
- Monitoring, logs, alerts, traces, and service-level objectives.
- Backup, disaster recovery, retention, privacy, and compliance policies.
- EAS production builds, app-store release management, and signed updates.
- Capacity and performance testing at expected society scale.
- Payments, GPS, telemetry, or analytics only if an approved business case
  requires them.

# 14. Technical Deep Dive

## Prisma

Prisma 7.8 provides the typed data-access layer between the Next.js services and
PostgreSQL.

Its role is to:

- Define the core relational models.
- Generate a TypeScript-safe database client.
- Create and deploy schema migrations.
- Express normal reads, writes, relations, pagination, and transactions.
- Reduce mismatches between database fields and application types.

Prisma does not natively express every PostgreSQL feature used by this project.
The migration therefore includes custom SQL for the GiST exclusion constraint
and business check constraints. This is intentional: Prisma supplies developer
productivity, while PostgreSQL remains responsible for the strongest data
integrity guarantee.

## Neon PostgreSQL

Neon is the durable source of truth. The backend uses a pooled runtime connection
through the Neon serverless adapter. Migrations and seeding can use a direct
connection.

PostgreSQL is particularly important here because it provides:

- ACID transactions.
- Serializable isolation.
- Row-level locks.
- `SKIP LOCKED` candidate allocation.
- Timestamp range types.
- GiST exclusion constraints.
- Check constraints and foreign keys.

These database capabilities are the reason the system can make a stronger claim
than "we checked availability in application code."

## Next.js APIs

Next.js 16 Route Handlers expose the versioned `/api/v1` interface.

The backend follows this request pipeline:

```text
HTTP request
  -> parse and validate input
  -> authenticate JWT
  -> enforce role and ownership
  -> execute business service
  -> execute Prisma query or transaction
  -> return standard JSON response
```

The API is stateless with respect to server memory. Durable state lives in
PostgreSQL, and authentication state is represented by signed tokens plus a
fresh active-user database check.

Business errors use stable codes such as:

- `AUTH_INVALID`
- `FORBIDDEN`
- `INVALID_TIME_RANGE`
- `QUOTA_NOT_ALLOCATED`
- `QUOTA_EXCEEDED`
- `NO_VEHICLE_AVAILABLE`
- `BOOKING_NOT_CANCELLABLE`

This gives mobile and future admin clients predictable behavior.

## Expo Mobile App

The resident client uses Expo SDK 56, React Native, TypeScript, and Expo Router.

- **Expo Router** maps screens and navigation through route structure.
- **TanStack Query** owns server state, loading states, mutations, and cache
  invalidation.
- **Zustand** owns the small local authentication state.
- **Expo SecureStore** stores JWT and session data on native devices.
- **date-fns and date-fns-tz** convert local booking fields to precise API
  timestamps and format responses in the society timezone.

After a successful booking or cancellation, the app invalidates dashboard and
booking queries. This prevents stale quota and history views without forcing the
user to restart the app.

The web target uses browser local storage only for development verification.
Native deployments use SecureStore.

## JWT Authentication

The backend signs JWTs with HS256 and a server-only secret of at least 32
characters. The token includes:

- User identifier as the subject.
- Society identifier.
- Flat identifier where applicable.
- Role.
- Display name.
- Issue time and expiration.

The backend does not trust token claims alone for account status. It loads the
user by token subject and checks that the account is still active. A deactivated
user therefore loses access even if an older token has not yet expired.

Passwords are hashed with bcrypt using a cost factor of 12. The database stores
only the hash.

For production, the token model should be strengthened with shorter access-token
lifetimes, refresh-token rotation, session revocation, rate limiting, and MFA
for administrators.

# 15. Possible Questions and Answers

## 1. What happens if all vehicles are booked?

The confirmation request returns HTTP 409 with
`NO_VEHICLE_AVAILABLE`. No booking is created and no quota is deducted. The
resident can choose another time.

## 2. How is fairness maintained?

Every flat has an annual quota, and every successful booking consumes the exact
duration. Vehicle allocation is first-confirmed, first-served without manual
preference. More advanced priority policies are not assumed without trustee
approval.

## 3. Can residents choose a specific car?

Not in the MVP. The server assigns any available operational EV, which keeps the
flow simple and reduces competition over preferred cars. Specific selection can
be added later without removing the existing conflict controls.

## 4. Can unused hours carry forward?

Not currently. Quota is tied to a calendar year and bookings cannot cross the
year boundary. Carry-forward requires an approved cap, expiry rule, and annual
rollover process.

## 5. What happens when a resident cancels?

If the booking is still in the future and has status `BOOKED`, it becomes
`CANCELLED` and the full duration is restored in the same transaction. The
record remains visible in history.

## 6. Can a resident cancel after the trip starts?

No. The current policy only allows future bookings to be cancelled. An
admin-override workflow could be added later if the society wants exceptions.

## 7. What happens if six residents book five cars simultaneously?

Five receive five distinct vehicles. The sixth receives
`NO_VEHICLE_AVAILABLE`. This exact scenario was tested live with no duplicate
vehicle assignment.

## 8. How can you claim double-booking is prevented?

The application uses serializable transactions and vehicle row locks. More
importantly, PostgreSQL has an exclusion constraint that refuses overlapping
non-cancelled bookings for the same vehicle, even if application logic makes a
mistake.

## 9. What if the database goes down during a booking?

The API request fails and the transaction cannot commit. PostgreSQL will not
leave a partial booking or partial quota update. The resident must retry after
service is restored.

## 10. What if the resident loses internet connectivity?

The mobile app cannot confirm a booking without reaching the backend. It should
show a request error and allow retry. Offline booking is intentionally not
supported because availability must be globally authoritative.

## 11. Can multiple societies use the system?

The data model already associates records with a society, but the product is
configured and tested as a single-society MVP. Multi-society SaaS requires
tenant onboarding, stronger isolation, administration, billing decisions, and
operational support.

## 12. Can trustees change a flat's quota?

Yes, an authenticated admin API can create or update annual allocation. It
refuses to lower the allocation below quota already used. A visual admin screen
has not yet been built.

## 13. What happens when a vehicle goes for maintenance?

An admin can mark it `MAINTENANCE`. It is then excluded from new vehicle
assignment. Existing bookings would require an operational reassignment policy,
which is not part of the current MVP.

## 14. What booking durations are allowed?

Bookings must last from 1 to 24 hours and use 30-minute start and end
boundaries. These are current assumptions and can be made configurable.

## 15. How are timezones handled?

The society is configured as `Asia/Kolkata`. The database stores timestamps in
UTC, while validation and display use society-local time. This avoids ambiguity
and supports future per-society timezones.

## 16. Are passwords stored securely?

Passwords are hashed with bcrypt and are not stored in plain text. JWT signing
secrets and database credentials remain backend-only. Demo passwords must be
changed before real use.

## 17. Can a resident see another flat's bookings?

No. Resident booking queries and details are filtered by the authenticated
flat. A booking ID belonging to another flat is returned as not found.

## 18. Can quota become negative or exceed the allocation?

The service validates remaining quota while holding a lock on the quota row.
PostgreSQL also enforces that used minutes stay between zero and allocated
minutes. Invalid updates roll back.

## 19. What if a resident presses the booking button twice?

The requests compete through the same transaction and database constraints.
They cannot create overlapping reservations on the same vehicle. The MVP does
not yet include a client-generated idempotency key, so two non-conflicting
bookings could be created if two valid requests both succeed; production should
add idempotency protection.

## 20. Can the same flat reserve two cars for the same time?

The current MVP does not prohibit this if the flat has enough quota and two
vehicles are available. If trustees reject that policy, a flat-overlap
constraint can be added at both service and database levels.

## 21. Can a booking be edited?

Not directly. The resident cancels the future booking and creates a new one.
Direct editing would need to revalidate quota and vehicle availability
atomically.

## 22. Are back-to-back bookings allowed?

Yes. A booking ending at 2:00 PM does not conflict with one starting at 2:00
PM. If charging or handover time is required, a buffer policy can be added.

## 23. How does a booking become completed?

The API reports an expired booked reservation as effectively completed once its
end time passes. A production operations system may add a scheduler and actual
trip completion events.

## 24. Why were Expo, Next.js, Prisma, and Neon selected?

They allow one TypeScript stack, fast iteration, typed contracts, native mobile
delivery, managed PostgreSQL, and strong database transactions. This combination
minimizes MVP delivery time without weakening the booking core.

## 25. Is the system production ready?

No, and it should not be presented as such. The core business workflow and
concurrency protections are strong for an MVP, but physical-device validation,
credential rotation, security hardening, monitoring, committed integration
tests, production deployment, and operational procedures remain.

## Final Positioning for Stakeholders

The correct claim is:

> "The MVP demonstrates that residents can fairly reserve a limited pool of
> society EVs, with reliable availability, quota accounting, conflict
> prevention, booking history, and cancellation."

The incorrect claim would be:

> "This is already a production mobility platform for multiple societies."

The current build has completed the risky proof: scarce vehicles and quota can
be allocated correctly under concurrent demand. Future work should now be driven
by approved stakeholder policy, not speculative feature development.
