import os from "node:os";

import { ok } from "@/src/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const addresses = Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);

  return ok({
    ip: addresses[0] ?? "127.0.0.1",
    addresses,
  });
}
