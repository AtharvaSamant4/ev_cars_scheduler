export type LocalDatabaseTarget = {
  databaseName: string;
  hostname: string;
  port: string;
  username: string;
};

export function assertLocalDatabaseUrl(
  rawUrl: string | null | undefined,
): LocalDatabaseTarget;
