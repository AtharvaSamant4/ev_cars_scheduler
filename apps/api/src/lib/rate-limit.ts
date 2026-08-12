import { NextRequest } from "next/server";

import { AppError } from "./errors";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Best-effort, in-process brute-force guard for login endpoints. It resets on
// deploy/restart and isn't shared across instances, but it's enough to stop
// naive password-guessing scripts on a single-instance deployment, which is
// strictly better than the previous state of no limit at all.
function consume(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;

  if (existing.count > limit) {
    throw new AppError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }
}

function clientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function enforceLoginRateLimit(
  request: NextRequest,
  scope: string,
  limit = 10,
  windowMs = 5 * 60 * 1000,
) {
  consume(`${scope}:${clientIp(request)}`, limit, windowMs);

  // Opportunistically clear expired buckets so the map doesn't grow forever
  // on a long-lived server process.
  if (buckets.size > 5_000) {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }
}
