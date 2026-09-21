// Explicit bounded synthetic provider probe. Never invoked by ordinary tests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
import { readLocalEnv, runtimeEnv } from './env.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--check') {
  console.log(JSON.stringify({ result: 'PASS', scope: 'live report probe static limits only', providers: ['BAILIAN', 'DEEPSEEK'], maxHttpAttemptsPerRun: 2, maxDurationMs: 45000, paidCalls: 0 }));
} else {
  assert.equal(args.length, 5, 'Use --live --provider BAILIAN|DEEPSEEK --run-id a-new-descriptive-id');
  assert.equal(args[0], '--live'); assert.equal(args[1], '--provider'); assert.equal(args[3], '--run-id');
  const provider = args[2], runId = args[4];
  assert.ok(['BAILIAN', 'DEEPSEEK'].includes(provider)); assert.match(runId, /^[a-z0-9][a-z0-9-]{2,79}$/);
  const directory = path.join(ROOT, 'data/report-probes');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory); assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && !(stat.mode & 0o077));
  const guard = path.join(directory, `${provider.toLowerCase()}-${runId}.attempt`);
  assert.ok(!existsSync(guard), 'This run was already attempted; it is never automatically resent');
  const local = readLocalEnv();
  assert.ok(local[`${provider}_API_KEY`]?.length, 'The selected provider key is missing; value suppressed');
  const env = { ...runtimeEnv(), MP_RUN_BAILIAN_TEST: 'false', MP_RUN_LIVE_REPORT_TESTS: 'true', MP_LIVE_REPORT_PROVIDER: provider, MP_REPORT_LIVE_GUARD_FILE: guard, MAVEN_USER_HOME: path.join(ROOT, 'data/maven-user') };
  for (const suffix of ['_API_KEY', '_BASE_URL', '_MODEL']) if (local[provider + suffix]) env[provider + suffix] = local[provider + suffix];
  execFileSync(path.join(ROOT, 'backend/mvnw'), [`-Dmaven.repo.local=${ROOT}/.local/m2`, '-Dtest=ReportLiveTest', '-Dsurefire.failIfNoSpecifiedTests=false', 'test'], { cwd: path.join(ROOT, 'backend'), env, stdio: 'inherit' });
}
