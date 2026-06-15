import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/database";
process.env.JWT_SECRET ??= "test-jwt-secret-0123456789abcdef";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
