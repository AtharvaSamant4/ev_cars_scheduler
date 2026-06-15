# Backend API

Next.js Route Handlers for the Society Shared EV Booking MVP.

## Local setup

From the repository root:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Required environment variables:

- `DATABASE_URL`: pooled Neon connection used by the API.
- `DIRECT_URL`: direct Neon connection used by Prisma migrations and seeding.
- `JWT_SECRET`: at least 32 characters.

The API base path is `/api/v1`. Health check: `GET /api/v1/health`.

The admin portal is available at `/admin/login`.

## Seeded demo credentials

- Resident: `A101` / `Demo@123`
- Admin: `admin@greenmeadows.demo` / `Admin@123`

Change all demo passwords before a real deployment.

## Verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Resident endpoints:

- `POST /auth/resident/login`
- `GET /me`
- `GET /dashboard`
- `GET /quota/current`
- `GET /availability`
- `GET|POST /bookings`
- `GET /bookings/{bookingId}`
- `POST /bookings/{bookingId}/cancel`

Admin endpoints:

- `POST /auth/admin/login`
- `POST /auth/admin/logout`
- `GET /admin/dashboard`
- CRUD/deactivation under `/admin/vehicles`, `/admin/flats`, and `/admin/residents`
- `PUT /admin/flats/{id}/quota/{year}`
- `GET /admin/bookings` and `/admin/bookings/{id}`

Admin portal screens:

- Dashboard
- Vehicles
- Flats
- Residents
- Quota
- Bookings
- Booking details
- Vehicle status
