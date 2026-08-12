# Master Bug Sweep

**Status: PARTIAL** — the hardened code and all local gates pass. The previously reported Neon wallet/ledger mismatch is now **RESOLVED** (see below); other remaining risks are still open.

## Outcome

- 28 root-cause groups were confirmed: 27 code, contract, safety, concurrency, or presentation defects were fixed; 1 remote data inconsistency was isolated and left read-only.
- The local API suite now passes **115/115 tests in 27 files** (up from the 52-test recovery baseline).
- Real loopback HTTP E2E passes booking, wallet, cancellation, maintenance, reserve reassignment, driver issue reporting, OTP, completion, late penalty, invoice/PDF, and guarded demo recharge.
- No Prisma schema or migration change was required.

## Principal fixes

- Enforced booking `driverId`, society ownership, active account/profile state, and effective reassigned vehicle across every driver action.
- Removed resident password hashes and OTP secrets from driver responses; made OTP generation cryptographic, locked, expiring, regenerable only after expiry, attempt-limited, and single-use.
- Made driver completion server-timestamped and exactly-once; retained strictly validated admin correction while blocking driver timestamp spoofing.
- Closed invoice ownership, bearer-query leakage, and cross-role access with a short-lived booking-scoped download token.
- Closed cross-column primary/reassigned vehicle conflicts in availability, booking, and reassignment, including concurrent reserve claims and exact +29/+30-minute boundaries.
- Corrected maintenance/breakdown impact selection, OTP cleanup, effective-vehicle issue reporting, notifications, and duplicate-click behavior.
- Made booking, cancellation, recharge approval, wallet adjustment, penalties, late completion, and first-wallet creation atomic under their relevant races.
- Restored the signed wallet-ledger invariant; constrained manual adjustment types, amounts, overflow, and role/society scope.
- Disabled both demo recharge paths outside the guarded local recovery database; the demo seed now also fails closed before Prisma connects.
- Corrected ISO-week/year rollover, society-timezone quota provisioning, concurrent quota creation, and admin week targeting.
- Prevented automatic penalty rules from the generic manual path and linearized manual penalties with cancellation/completion.
- Hardened malformed JSON/UUID/query handling and sanitized database-busy/internal error responses.
- Fixed inactive-flat sessions, driver login/profile lifecycle, cross-account mobile query caches, notification ownership/read semantics, and stale mobile mutation state.
- Aligned admin/mobile contracts, effective-vehicle/status presentation, loading/pending/error states, repeated taps, invoice download, QR behavior, and LAN phone configuration.
- Removed obsolete destructive QA/concurrency helpers and the stale validation artifact after confirming there were no callers.
- Rejected the known JWT placeholder and rotated the ignored local development secret without changing tracked environment files.

## Final verification

| Gate | Result |
| --- | --- |
| Prisma generate / validate | PASS |
| Local migration status | PASS — 3 migrations, current |
| Local Prisma drift | PASS — no difference detected |
| Catalog constraints | PASS — 15 tables, 6 enums, 8 checks, 2 exclusions, `btree_gist` |
| Booking buffer probes | PASS — +29 rejected, +30 accepted for both DB exclusion columns |
| Demo seed verification | PASS |
| Local wallet signed-ledger invariant | PASS — 0 mismatches |
| Typecheck | PASS — 0 errors |
| Lint | PASS — 0 errors / 0 warnings |
| Backend production build | PASS |
| Mobile web export | PASS |
| Database/unit/concurrency tests | PASS — 115/115 |
| Real HTTP E2E | PASS |
| Admin rendered-page HTTP smoke | PASS |
| Git diff check | PASS |
| Neon migration status / Prisma drift | PASS — read-only |

## Resolved since this sweep

- **RESOLVED — Neon wallet/ledger mismatch.** Wallet `f13ea16f-aabd-4461-bbdc-7315e52cf18b` had `Wallet.balance` = ₹2,000 against a signed `WalletTransaction` ledger total of ₹1,500 (a ₹500 difference). The full transaction history was inspected manually; no `RechargeRequest` existed for the user that could explain a legitimate missing ₹500 credit. Conclusion: the stored balance was stale historical data, and the ledger was treated as authoritative. The Neon wallet was repaired from ₹2,000 → ₹1,500 using a conditional update that only applied if the balance was still ₹2,000. The wallet now matches the verified ledger. Going forward, `Wallet.balance` must equal the signed `WalletTransaction` ledger total.

## Remaining known risks

- **DEFERRED until the payment gateway is added — penalty debits can drive a wallet negative.** `adjustWalletBalance` refuses a manual admin `DEBIT` that would take the balance below zero (`INSUFFICIENT_FUNDS`), and `createBooking` refuses a booking the balance cannot cover. The two penalty paths apply no such floor: `completeTrip` decrements an unbounded late-return penalty (`ceil(delayMinutes / 60) × rule.amount`), and `cancelBooking` applies `increment: deduction − penaltyAmount`, which is negative when the cancellation penalty exceeds the original charge. A resident driven negative cannot book again until an admin credits the wallet. The `Wallet.balance` = signed-ledger-total invariant is **not** violated: balance and ledger move together in every path, and there is no `CHECK` constraint on `Wallet.balance`, so the database permits the negative value. This is deliberately left open because it is a money-policy decision, not a defect — clamping penalties at zero would silently forgive money genuinely owed, whereas a payment gateway makes a negative balance a collectable invoice ("settle ₹800 to book again"). Decide the policy alongside the gateway, then make all four paths consistent.
- The Neon credential was shared outside the ignored environment file during recovery; rotate it in Neon and update local/deployment secrets.
- Interactive browser automation was unavailable in this execution environment. Production build, mobile export, rendered-page HTTP smoke, and real HTTP E2E passed, but the four-device presentation should still receive a short physical-device rehearsal.
- PostgreSQL cannot express the cross-column primary-versus-reassigned exclusion as the existing pair of exclusion constraints; application transactions and regression tests enforce that remaining invariant.

Confidence: **HIGH** for the hardened repository and guarded local demo. Production confidence remains below very high until the exposed database credential is reconciled.
