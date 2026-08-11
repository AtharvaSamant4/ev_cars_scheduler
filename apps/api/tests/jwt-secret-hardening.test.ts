import { UserRole } from "@society-ev/db";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthUser } from "@/src/lib/auth";
import { issueToken } from "@/src/lib/auth";

const originalJwtSecret = process.env.JWT_SECRET;
const fixtureUser: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  societyId: "00000000-0000-4000-8000-000000000002",
  flatId: null,
  role: UserRole.ADMIN,
  name: "JWT Secret Fixture",
};

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe("JWT secret hardening", () => {
  it("rejects the documented placeholder even though it is longer than 32 characters", async () => {
    process.env.JWT_SECRET = "replace-with-at-least-32-random-characters";

    await expect(issueToken(fixtureUser)).rejects.toThrow(
      "JWT_SECRET must be a non-placeholder secret",
    );
  });

  it("continues to accept a non-placeholder secret of sufficient length", async () => {
    process.env.JWT_SECRET = "test-only-custom-secret-0123456789abcdef";

    const token = await issueToken(fixtureUser);
    expect(token.split(".")).toHaveLength(3);
  });
});
