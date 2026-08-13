import "./load-root-env";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({
    connectionString,
    // 15s outlived any caller's patience: a phone gave up long before the
    // request did. Failing at 6s leaves room for the route-level retry to open
    // a fresh connection (which also wakes a suspended serverless database)
    // while still answering well inside a request the user is waiting on.
    connectionTimeoutMillis: 6_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 10,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
