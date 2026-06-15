# Resident Mobile App

Expo Router application for society residents to view quota, reserve an EV,
review bookings, cancel future reservations, and log out.

## Configure

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL="http://192.168.1.10:3000/api/v1"
```

Use the backend machine's LAN IP for a physical phone. `127.0.0.1` works only
for Expo web running on the same machine. A deployed API URL is recommended for
stakeholder demos.

## Run

From the repository root:

```powershell
pnpm install
pnpm dev
pnpm mobile:start
```

Scan the Expo QR code with Expo Go. Android emulator and web commands:

```powershell
pnpm --filter @society-ev/mobile android
pnpm mobile:web
```

Demo resident:

```text
Flat: A101
Password: Demo@123
```

## Screens

- Resident login
- Dashboard with annual quota and upcoming bookings
- Book vehicle with availability check
- Upcoming and historical bookings
- Booking details with cancellation
- Logout confirmation

## API Integrations

- `POST /auth/resident/login`
- `GET /dashboard`
- `GET /availability`
- `POST /bookings`
- `GET /bookings`
- `GET /bookings/{bookingId}`
- `POST /bookings/{bookingId}/cancel`

TanStack Query owns server state and cache invalidation. Zustand owns the local
session. Native tokens are stored with Expo SecureStore; Expo web uses browser
storage for local verification only.

## Verify

```powershell
pnpm --filter @society-ev/mobile typecheck
pnpm --filter @society-ev/mobile lint
pnpm dlx expo-doctor@latest apps/mobile
pnpm --filter @society-ev/mobile export:web
```
