import { pathToFileURL } from "node:url";

export function assertLocalDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("DIRECT_URL or a database URL argument is required");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(rawUrl);
  } catch {
    throw new Error("database URL is not a valid URL");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("only PostgreSQL URLs are allowed");
  }

  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!allowedHosts.has(databaseUrl.hostname)) {
    throw new Error(
      `host ${databaseUrl.hostname || "<empty>"} is not explicitly local`,
    );
  }

  if (databaseUrl.port !== "55432") {
    throw new Error(
      `port ${databaseUrl.port || "<default>"} is not the isolated recovery port 55432`,
    );
  }

  if (databaseUrl.username !== "society_ev_recovery") {
    throw new Error(
      "database user must be the recovery-only society_ev_recovery account",
    );
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!/^society_ev_recovery_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("database name must use the society_ev_recovery_ prefix");
  }

  const forbiddenConnectionOverrides = [
    "host",
    "hostaddr",
    "port",
    "user",
    "dbname",
  ];
  for (const parameter of forbiddenConnectionOverrides) {
    if (databaseUrl.searchParams.has(parameter)) {
      throw new Error(
        `connection parameter ${parameter} may not override the guarded URL target`,
      );
    }
  }

  return {
    databaseName,
    hostname: databaseUrl.hostname,
    port: databaseUrl.port,
    username: databaseUrl.username,
  };
}

function runCli() {
  try {
    const target = assertLocalDatabaseUrl(
      process.argv[2] ?? process.env.DIRECT_URL,
    );
    console.log(
      `LOCAL_DATABASE_GUARD=PASS host=${target.hostname} port=${target.port} database=${target.databaseName} user=${target.username}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`LOCAL_DATABASE_GUARD=FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entryPoint === import.meta.url) {
  runCli();
}
