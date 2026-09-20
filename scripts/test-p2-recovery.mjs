import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createFixtureScope, expect, idempotency } from './lib/local-student-fixture.mjs';
import { ROOT, TOOL, JAVA_HOME, PORTS } from './local-config.mjs';
import { readLocalEnv, runtimeEnv } from './env.mjs';
import { start, stop, waitFor, record } from './processes.mjs';

// Scope: one project-owned backend, one previously empty project Redis DB15.
// DB0 (ordinary sessions/rate limits) is never flushed or reset. Run only after
// other browser/API acceptances finish; finally restores the original backend.
const before = record('backend'), redisProcess = record('redis');
assert.ok(before && redisProcess, 'Requires verified project-managed backend and Redis; no process changed');
const artifact = before.identity.match(/-jar (\S+\/data\/runtime\/ruoyi-admin-([a-f0-9]{64})\.jar) /);
assert.ok(artifact && artifact[1].startsWith(`${ROOT}/data/runtime/`), 'Expected current content-addressed runtime JAR');
assert.ok(before.identity.endsWith(`${JAVA_HOME}/bin/java -jar ${artifact[1]} --spring.profiles.active=local`), 'Requires the standard local launch command; custom arguments cannot be silently discarded');
assert.equal(createHash('sha256').update(readFileSync(artifact[1])).digest('hex'), artifact[2]);
const env = readLocalEnv(); assert.equal(env.MP_EXPERIENCE_AI_ENABLED, 'false');
const launchEnv = runtimeEnv({ secrets: true });
const redis = (database, ...args) => {
  assert.ok(database === 0 || database === 15);
  if (database === 0) assert.ok(args[0] === 'DBSIZE' || args[0] === 'CONFIG', 'Ordinary Redis DB is read-only');
  try { return execFileSync(`${TOOL}/redis/src/redis-cli`, ['-h', '127.0.0.1', '-p', String(PORTS.redis), '-n', String(database), '--raw', ...args], { env: { ...runtimeEnv(), REDISCLI_AUTH: env.MP_REDIS_PASSWORD }, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Project Redis check failed; credentials suppressed'); }
};
assert.equal(redis(15, 'DBSIZE'), '0', 'DB15 already contains data; refusing any mutation');
assert.equal(redis(15, 'CONFIG', 'GET', 'dir').split('\n')[1], `${ROOT}/data/redis`, 'Unexpected Redis data directory');
const originalDbSize = Number(redis(0, 'DBSIZE'));
const scope = createFixtureScope('p2-recovery');
let switched = false, restored = false, proof, primaryError, canaryAttempted = false;
const canary = `mp:p2-recovery:${randomUUID()}`;
const cleanupErrors = [];
async function boot(extra = []) {
  await start('backend', `${JAVA_HOME}/bin/java`, ['-jar', artifact[1], '--spring.profiles.active=local', ...extra], launchEnv, { port: PORTS.backend });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${PORTS.backend}/api/public/v1/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch { return false; } }, 45000);
}
try {
  const { client } = await scope.student();
  const post = (path, body) => client.call(path, { method: 'POST', body, headers: idempotency() });
  const base = '/api/app/v1/experience-runs';
  let run = expect(await post(base, { demoKey: 'DEMO_TABLE' }), 201, 'recovery ready');
  run = expect(await post(`${base}/${run.runId}/start`, { expectedRevision: run.revision }), 200, 'recovery start');
  const stepPath = `${base}/${run.runId}/steps/prepare`;
  expect(await client.call(`${stepPath}/response`, { method: 'PUT', body: { expectedRevision: 0, responseSchemaVersion: 'demo-response-v1', response: { acknowledged: true } } }), 200, 'commit response before restart');
  const prior = expect(await client.call(stepPath), 200, 'before restart response');
  // Prove an empty cache after a real clear without deleting normal DB0 limits.
  canaryAttempted = true;
  assert.equal(redis(15, 'SET', canary, 'synthetic'), 'OK');
  assert.equal(redis(15, 'DBSIZE'), '1');
  assert.equal(redis(15, 'FLUSHDB'), 'OK');
  assert.equal(redis(15, 'DBSIZE'), '0');
  switched = true;
  await stop('backend'); await boot(['--spring.data.redis.database=15']);
  assert.notEqual(record('backend').pid, before.pid);
  const after = expect(await client.call(stepPath), 200, 'MySQL-backed session and progress survive JVM and empty cache');
  assert.deepEqual(after.response, prior.response); assert.equal(after.revision, prior.revision);
  const refreshed = expect(await client.call(`${base}/${run.runId}`), 200, 'version after recovery');
  assert.equal(refreshed.taskVersionId, run.taskVersionId);
  const hint = expect(await post(`${base}/${run.runId}/hints`, { stepKey: 'prepare', hintLevel: 1 }), 200, 'static hint writes only the isolated cache rate namespace');
  assert.equal(hint.status, 'FALLBACK');
  assert.ok(redis(15, 'KEYS', 'mp:p1:rate:*').split('\n').filter(Boolean).length > 0, 'Must prove the application is actually using Redis DB15');
  expect(await post(`${stepPath}/complete`, { expectedRevision: after.revision }), 200, 'continue after recovery');
  proof = { result: 'PASS', actualJvmRestart: true, sameSessionRecoveredFromMySql: true, committedResponsePreserved: true, taskVersionPreserved: true, canContinue: true, emptyCacheDatabase: 15, isolatedCacheRoutingVerified: true, ordinaryRedisDatabaseNotFlushedOrReset: true, ordinaryDatabaseSizeBefore: originalDbSize, artifactSha256: artifact[2], paidModelCalls: 0 };
} catch (error) {
  primaryError = error;
} finally {
  if (switched) {
    try { await stop('backend'); } catch (error) { cleanupErrors.push(error); }
    // DB15 was verified empty and reserved exclusively for this local rehearsal.
    // Do not clear it if a failed stop left the temporary backend using it.
    try {
      const current = record('backend');
      assert.ok(!current || !current.identity.includes('--spring.data.redis.database=15'), 'Temporary backend is still active; refusing cache cleanup');
      redis(15, 'FLUSHDB'); assert.equal(redis(15, 'DBSIZE'), '0');
    } catch (error) { cleanupErrors.push(error); }
    try {
      assert.ok(!record('backend'), 'Cannot restore over a still-running backend');
      await boot();
      assert.ok(record('backend')?.identity.endsWith(`${JAVA_HOME}/bin/java -jar ${artifact[1]} --spring.profiles.active=local`));
      restored = true;
    } catch (error) { cleanupErrors.push(error); }
  }
  if (canaryAttempted) {
    try { redis(15, 'DEL', canary); } catch (error) { cleanupErrors.push(error); }
  }
  try { await scope.cleanup(); } catch (error) { cleanupErrors.push(error); }
}
if (primaryError || cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors].filter(Boolean), 'Recovery rehearsal failed; all independent restore and precise fixture cleanup paths were attempted');
assert.ok(proof && restored);
console.log(JSON.stringify({ ...proof, originalBackendConfigurationRestored: restored, fixtureCleanup: true, scope: 'Real JVM restart into a cleared isolated Redis namespace; ordinary DB0 never flushed or reset; other projects untouched' }, null, 2));
