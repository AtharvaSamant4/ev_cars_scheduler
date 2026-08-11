import { describe, expect, it, vi } from "vitest";

import { createGuardedSeedClient } from "../../../packages/db/src/seed-safety";

describe("demo seed database safety", () => {
  it("rejects a Neon-like target before constructing a Prisma client", () => {
    const clientFactory = vi.fn();

    expect(() =>
      createGuardedSeedClient(
        {
          DATABASE_URL:
            "postgresql://owner@ep-example-pooler.aws.neon.tech/neondb?sslmode=require",
          DIRECT_URL:
            "postgresql://owner@ep-example.aws.neon.tech/neondb?sslmode=require",
        },
        clientFactory,
      ),
    ).toThrow(/not explicitly local/);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("accepts the isolated recovery target before constructing the client", () => {
    const connectionString =
      "postgresql://society_ev_recovery@127.0.0.1:55432/society_ev_recovery_demo_ready";
    const client = { guarded: true };
    const clientFactory = vi.fn(() => client);

    expect(
      createGuardedSeedClient(
        {
          DATABASE_URL: connectionString,
          DIRECT_URL: connectionString,
        },
        clientFactory,
      ),
    ).toBe(client);
    expect(clientFactory).toHaveBeenCalledOnce();
    expect(clientFactory).toHaveBeenCalledWith(connectionString);
  });
});
