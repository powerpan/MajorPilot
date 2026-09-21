import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
import { runtimeEnv } from './env.mjs';
const run = args => spawnSync(process.execPath, ['scripts/report-spike.mjs', ...args], { cwd: ROOT, env: runtimeEnv(), encoding: 'utf8', timeout: 10000 });

test('report probe static check is network-free and declares finite attempts', () => {
  const result = run(['--check']); assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout); assert.equal(report.paidCalls, 0); assert.equal(report.maxHttpAttemptsPerRun, 2); assert.equal(report.maxDurationMs, 45000);
});
test('malformed probe arguments fail before environment loading or provider work', () => {
  for (const args of [[], ['--live', '--provider', 'OTHER', '--run-id', 'unit-only'], ['--live', '--provider', 'BAILIAN', '--run-id', '../escape']]) assert.equal(run(args).status, 1);
});
test('an existing durable report attempt is refused without loading a provider key', () => {
  const runId = `unit-${randomUUID()}`, directory = path.join(ROOT, 'data/report-probes');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const marker = path.join(directory, `bailian-${runId}.attempt`);
  writeFileSync(marker, 'unit-owned-marker', { mode: 0o600, flag: 'wx' });
  try {
    const result = run(['--live', '--provider', 'BAILIAN', '--run-id', runId]);
    assert.equal(result.status, 1); assert.match(result.stderr, /This run was already attempted/);
    assert.equal(readFileSync(marker, 'utf8'), 'unit-owned-marker');
  } finally { unlinkSync(marker); }
});
