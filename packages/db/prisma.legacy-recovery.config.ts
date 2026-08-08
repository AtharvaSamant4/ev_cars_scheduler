import "./src/load-root-env";

import { defineConfig, env } from "prisma/config";

const recoveryMigrationsPath = process.env.RECOVERY_MIGRATIONS_PATH;

if (!recoveryMigrationsPath) {
  throw new Error(
    "RECOVERY_MIGRATIONS_PATH is required for the legacy recovery config",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: recoveryMigrationsPath,
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
