const rawUrl = process.argv[2] ?? process.env.DIRECT_URL;

function fail(message) {
  console.error(`LOCAL_DATABASE_GUARD=FAIL: ${message}`);
  process.exit(1);
}

if (!rawUrl) {
  fail("DIRECT_URL or a database URL argument is required");
}

let databaseUrl;
try {
  databaseUrl = new URL(rawUrl);
} catch {
  fail("database URL is not a valid URL");
}

if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
  fail("only PostgreSQL URLs are allowed");
}

const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!allowedHosts.has(databaseUrl.hostname)) {
  fail(`host ${databaseUrl.hostname || '<empty>'} is not explicitly local`);
}

if (databaseUrl.port !== '55432') {
  fail(`port ${databaseUrl.port || '<default>'} is not the isolated recovery port 55432`);
}

if (databaseUrl.username !== 'society_ev_recovery') {
  fail("database user must be the recovery-only society_ev_recovery account");
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
if (!/^society_ev_recovery_[a-z0-9_]+$/.test(databaseName)) {
  fail("database name must use the society_ev_recovery_ prefix");
}

const forbiddenConnectionOverrides = ['host', 'hostaddr', 'port', 'user', 'dbname'];
for (const parameter of forbiddenConnectionOverrides) {
  if (databaseUrl.searchParams.has(parameter)) {
    fail(`connection parameter ${parameter} may not override the guarded URL target`);
  }
}

console.log(
  `LOCAL_DATABASE_GUARD=PASS host=${databaseUrl.hostname} port=${databaseUrl.port} database=${databaseName} user=${databaseUrl.username}`,
);
