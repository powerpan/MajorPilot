import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JAVA_HOME, ROOT } from './local-config.mjs';
import { mysqlCommand } from './infra.mjs';

// Requires explicit task authorization for temporary schema/account creation.
// No server is started/stopped and no provider/application credentials are copied.
// Usage: node scripts/test-fresh-migrations.mjs [validated-ruoyi-admin.jar]
const artifact = path.resolve(process.argv[2] || path.join(ROOT, 'backend/ruoyi-admin/target/ruoyi-admin.jar'));
assert.ok(existsSync(artifact) && lstatSync(artifact).isFile() && !lstatSync(artifact).isSymbolicLink(), 'Expected a regular validated build JAR');
const scratch = mkdtempSync('/tmp/majorpilot-fresh-migrations-');
const classes = path.join(scratch, 'classes');mkdirSync(classes);
const java = path.join(JAVA_HOME, 'bin/java'), javac = path.join(JAVA_HOME, 'bin/javac'), jar = path.join(JAVA_HOME, 'bin/jar');
const env = Object.fromEntries(['HOME', 'USER', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { JAVA_HOME, PATH: `${JAVA_HOME}/bin:/usr/bin:/bin` });
function command(binary, args, stage, extraEnv = {}) {
  try { return execFileSync(binary, args, { cwd: scratch, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error(`${stage} failed; connection identity, SQL and credentials suppressed`); }
}
// The artifact is project-produced, but still reject archive path traversal.
const entries = command(jar, ['--list', '--file', artifact], 'Archive inventory').split(/\r?\n/).filter(Boolean);
assert.ok(entries.every(entry => !entry.startsWith('/') && !entry.split('/').includes('..')), 'Unsafe archive entry');
assert.ok(entries.some(entry => entry.startsWith('BOOT-INF/lib/ruoyi-majorpilot-')), 'MajorPilot module missing from artifact');
command(jar, ['--extract', '--file', artifact, 'BOOT-INF/lib'], 'Dependency extraction');
const classpath = path.join(scratch, 'BOOT-INF/lib/*');
command(javac, ['--release', '21', '-cp', classpath, '-d', classes, path.join(ROOT, 'scripts/java/FreshMigrationCheck.java')], 'Standalone checker compilation');

// Verify the socket-owned instance before creating any resource. Never use shell
// defaults, a global database service, majorpilot, or majorpilot_test as a target.
const [port, datadir] = mysqlCommand('SELECT @@port,@@datadir;').trim().split('\t');
assert.equal(port, '13306', 'Unexpected project MySQL port');
assert.equal(realpathSync(datadir), realpathSync(path.join(ROOT, 'data/mysql')), 'Unexpected project MySQL data directory');
const nonce = randomBytes(8).toString('hex');
// Use an alphanumeric schema name: underscore is a MySQL GRANT wildcard even
// inside a database identifier, so omitting it keeps privileges strictly exact.
const schema = `majorpilotmigration${nonce}`, account = `mp_mig_${nonce}`, password = randomBytes(32).toString('hex');
assert.match(schema, /^majorpilotmigration[0-9a-f]{16}$/);assert.match(account, /^mp_mig_[0-9a-f]{16}$/);
assert.notEqual(schema, 'majorpilot');assert.notEqual(schema, 'majorpilot_test');
const absent = () => Number(mysqlCommand(`SELECT (SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${schema}')+(SELECT COUNT(*) FROM mysql.user WHERE User='${account}');`).trim()) === 0;
assert.ok(absent(), 'Temporary resource already exists; refusing any mutation');
let creationAttempted = false, result, failure, cleaned = false;
try {
  creationAttempted = true;
  // Each grant is limited to this new schema; no global, main or test-schema rights.
  mysqlCommand(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    CREATE USER '${account}'@'127.0.0.1' IDENTIFIED BY '${password}';
    GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES ON \`${schema}\`.* TO '${account}'@'127.0.0.1';`);
  const output = command(java, ['-cp', `${classes}${path.delimiter}${classpath}`, 'FreshMigrationCheck'], 'Empty-schema Flyway V1-V3 check', { MP_MIGRATION_SCHEMA: schema, MP_MIGRATION_ACCOUNT: account, MP_MIGRATION_PASSWORD: password });
  const line = output.split(/\r?\n/).find(value => value.startsWith('MAJORPILOT_MIGRATION_RESULT='));
  assert.ok(line, 'Missing sanitized migration evidence');
  result = JSON.parse(line.slice('MAJORPILOT_MIGRATION_RESULT='.length));assert.equal(result.result, 'PASS');
} catch (error) { failure = error; }
finally {
  if (creationAttempted) {
    // Both names were absent before this run and generated locally. Only this exact
    // pair is eligible for cleanup, including after a partially failed creation.
    // Attempt both independently so a failed schema cleanup cannot skip account revocation.
    for (const statement of [`DROP DATABASE IF EXISTS \`${schema}\`;`, `DROP USER IF EXISTS '${account}'@'127.0.0.1';`]) {
      try { mysqlCommand(statement); } catch { failure ??= new Error('Temporary migration cleanup failed; resource identity suppressed'); }
    }
    try { cleaned = absent(); } catch { cleaned = false; }
    if (!cleaned) failure ??= new Error('Temporary migration resource absence could not be verified');
  }
}
const evidence = { scope: 'new empty schema on the existing isolated project MySQL; standalone Flyway, no service startup', ...(result || {}), result: failure ? 'FAIL' : 'PASS', artifactSha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'), leastPrivilegeSchemaOnly: true, fixtureCleanup: cleaned, servicesStarted: false, paidModelCalls: 0 };
const evidenceFile = path.join(scratch, 'migration-evidence.json');writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ ...evidence, evidenceFile }));
if (failure) throw failure;
