const RECOVERY_DATABASE_PREFIX = "society_ev_recovery_";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isGuardedRecoveryDatabaseUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const suffix = databaseName.startsWith(RECOVERY_DATABASE_PREFIX)
      ? databaseName.slice(RECOVERY_DATABASE_PREFIX.length)
      : "";
    const nameSegments = suffix.split("_");

    return (
      LOCAL_DATABASE_HOSTS.has(url.hostname) &&
      url.port === "55432" &&
      decodeURIComponent(url.username) === "society_ev_recovery" &&
      /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(suffix) &&
      nameSegments.some((segment) => segment === "test" || segment === "demo")
    );
  } catch {
    return false;
  }
}

/**
 * Demo payment endpoints are intentionally unavailable unless every configured
 * database URL points at the guarded, disposable recovery PostgreSQL instance.
 */
export function isSafeLocalDemoDatabase() {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return false;
  }

  if (!isGuardedRecoveryDatabaseUrl(process.env.DATABASE_URL)) {
    return false;
  }

  return !process.env.DIRECT_URL || isGuardedRecoveryDatabaseUrl(process.env.DIRECT_URL);
}
