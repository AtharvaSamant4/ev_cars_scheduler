# EV Cars Scheduler Demo Runbook

> Local demo only. These accounts and passwords are not for production.

## Start

1. Start the existing local database: `docker start society-ev-recovery-pg`
2. Reconcile demo data: `pnpm db:deploy` then `pnpm db:seed`
3. Start the LAN API: `pnpm --filter @society-ev/api exec next dev -H 0.0.0.0 -p 3000`
4. Start Expo for a phone: `pnpm mobile:start`
5. For a local web demo instead: `pnpm --filter @society-ev/mobile exec expo start --web --offline --port 8081`

Admin portal: `http://localhost:3000/admin`

## Demo accounts

| Role | Login | Password |
| --- | --- | --- |
| Resident | Flat `A101` (society ID `00000000-0000-4000-8000-000000000001`) | `Demo@123` |
| Admin | `admin@greenmeadows.demo` | `Admin@123` |
| Driver | Phone `8000000001` | `Driver@123` |

## Main demo flow

1. Resident: show weekly quota and ₹5,000 wallet, then book an EV and show the debit.
2. Admin: open the booking, assign Driver 1, and show vehicle/booking status.
3. Driver: arrive; resident reads the OTP; driver verifies it and starts the ride.
4. Driver: complete the ride. Show timestamps, any late penalty, wallet ledger, and invoice PDF.
5. Admin: mark a booked EV unavailable, open **Affected Bookings**, and reassign a reserve EV.

## Cancellation scenario

Book a future EV, cancel it from booking details, then show restored weekly quota plus the wallet refund and cancellation-penalty ledger entries.
