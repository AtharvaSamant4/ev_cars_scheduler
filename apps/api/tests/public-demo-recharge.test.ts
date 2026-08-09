import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/wallet/public-demo-recharge/route";

describe("Public demo recharge production guard", () => {
  it("is unavailable in production before any recharge is attempted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = await POST(new Request("http://127.0.0.1/api/v1/wallet/public-demo-recharge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000000", amount: 100 }),
      }));
      expect(response.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
