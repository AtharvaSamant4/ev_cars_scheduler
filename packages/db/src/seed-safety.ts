import { assertLocalDatabaseUrl } from "../scripts/assert-local-database.mjs";

type SeedDatabaseEnvironment = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

export function createGuardedSeedClient<T>(
  environment: SeedDatabaseEnvironment,
  clientFactory: (connectionString: string) => T,
) {
  const connectionString =
    environment.DIRECT_URL ?? environment.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required to seed the database");
  }

  assertLocalDatabaseUrl(connectionString);

  return clientFactory(connectionString);
}
