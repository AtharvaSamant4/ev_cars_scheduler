import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgresql://society_ev_recovery:test@127.0.0.1:55432/society_ev_recovery_static_test";
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
    fileParallelism: false,
    setupFiles: ["tests/helpers/database.ts"],
  },
});
