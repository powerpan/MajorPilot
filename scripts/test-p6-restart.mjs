import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { ROOT } from './local-config.mjs';
import { startHarness } from './p6-harness.mjs';
import { record, processInspectionAvailable, waitFor } from './processes.mjs';
import { createP6FixtureScope, P6Client, p6Query, idempotency, expect } from './lib/p6-student-fixture.mjs';

// R08: real process crashes of only the guarded test JVM. No SQL business-state
// injection, no shortened lease, no authentication bypass, no model network.
const arguments_ = process.argv.slice(2);
assert.ok(arguments_.length === 0 || arguments_.length === 1 && arguments_[0] === '--check');
const directory = `${ROOT}/data/p6-harness`;
const material = JSON.parse(readFileSync(new URL('../content/ai-support/1.0.0/manifest.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../contracts/examples/p3-ai-run.json', import.meta.url), 'utf8'));
const stages = ['AFTER_CLAIM', 'DURING_REPAIR', 'BEFORE_PUBLISH'];
if (arguments_.includes('--check')) console.log(JSON.stringify({ result: 'PASS', scope: 'R08 static plan; not actual process recovery evidence', stages, plannedStudents: 1, actualJvmRestarts: 0, shortenedLeases: false, paidCalls: 0 }));
else await acceptance();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function control(name, value) {
  assert.ok(['checkpoint-control.json', 'checkpoint-old-lease.json', 'gateway-control.json'].includes(name));
  const file = `${directory}/${name}`; if (existsSync(file)) assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
  const pending = `${file}.pending-${randomUUID()}`; writeFileSync(pending, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); renameSync(pending, file);
}
function remove(names) { for (const name of names) { assert.ok(/^checkpoint-[a-z-]+\.json$|^(?:checkpoint|gateway)-release$|^gateway-entered\.json$/.test(name)); const file = `${directory}/${name}`; if (existsSync(file)) { assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()); unlinkSync(file); } } }
function read(name) { const file = `${directory}/${name}`; assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && lstatSync(file).size <= 8192); return JSON.parse(readFileSync(file, 'utf8')); }
function releaseAll() { for (const name of ['checkpoint-release', 'gateway-release']) { const file = `${directory}/${name}`; if (!existsSync(file)) writeFileSync(file, 'release\n', { flag: 'wx', mode: 0o600 }); } }
async function until(check, label, timeout = 105000) { const deadline = Date.now() + timeout; do { const result = await check(); if (result) return result; await sleep(2000); } while (Date.now() < deadline); throw new Error(`${label}: bounded timeout; payload suppressed`); }
function descriptor() { const bytes = readFileSync(`${directory}/current.json`); const data = JSON.parse(bytes); assert.match(data.identity, /^[a-f0-9]{64}$/); assert.match(data.backendSha256, /^[a-f0-9]{64}$/); return { ...data, descriptorSha256: createHash('sha256').update(bytes).digest('hex') }; }

async function acceptance() {
  assert.ok(processInspectionAvailable(), 'Managed process identity inspection is required');
  assert.equal(p6Query('SELECT DATABASE();'), 'majorpilot_test');
  const artifact = descriptor(), original = record('p6-test-backend'), main = record('backend');
  const signingFileHash = createHash('sha256').update(readFileSync(`${ROOT}/.env.p6-test.local`)).digest('hex');
  assert.ok(original && original.port === 18081 && original.identity.includes(`${artifact.directory}/p6-test-only.jar`) && original.identity.includes('majorpilot.harness.P6HarnessApplication'));
  const scope = createP6FixtureScope(), results = []; let primary, operator, failure;
  const runRoot = '/api/app/v1/experience-runs';
  const post = (client, route, body) => client.call(route, { method: 'POST', body, headers: idempotency() });
  let reportId;
  function state(lease) {
    for (const field of ['job', 'student', 'report', 'version', 'leaseVersion']) assert.ok(Number.isSafeInteger(lease[field]) && lease[field] > 0);
    return JSON.parse(p6Query(`SELECT JSON_OBJECT('phase',v.generation_phase,'retryNo',v.retry_no,'httpAttempts',v.http_attempt_count,'status',v.status,'versionId',v.public_id,'reportId',r.public_id,'requestSha',v.request_manifest_sha256,'sourceSha',v.source_manifest_sha256,'bodySha',v.report_body_sha256,'leaseVersion',j.lease_version,'jobStatus',j.status,'jobAttempts',j.attempt_count,'unknownCalls',(SELECT COUNT(*) FROM mp_ai_call a WHERE a.report_version_id=v.id AND a.status='UNKNOWN')) FROM mp_background_job j JOIN mp_report_version v ON v.id=j.target_id JOIN mp_report r ON r.id=v.report_id WHERE j.id=${lease.job} AND j.owner_student_id=${lease.student} AND r.id=${lease.report} AND v.id=${lease.version};`));
  }
  async function interruptAndRecover(stage, lease) {
    const before = state(lease); assert.equal(before.status, 'GENERATING'); assert.equal(before.jobStatus, 'RUNNING');
    const expected = { AFTER_CLAIM: ['PREPARED', 0, 0], DURING_REPAIR: ['REPAIR_REQUESTED', 1, 2], BEFORE_PUBLISH: ['VALIDATED', 0, 1] }[stage];
    assert.deepEqual([before.phase, before.retryNo, before.httpAttempts], expected);
    reportId = before.reportId;
    control('checkpoint-old-lease.json', lease); control('checkpoint-control.json', { stage: 'PASS' }); control('gateway-control.json', { mode: 'PASS' });
    const processBefore = record('p6-test-backend'); assert.ok(processBefore && processBefore.identity.includes(`${artifact.directory}/p6-test-only.jar`));
    assert.equal(record('p6-test-backend')?.identity, processBefore.identity, 'Recheck exact process identity immediately before signal');
    process.kill(processBefore.pid, 'SIGKILL'); // Deliberate crash, not an orderly shutdown that could mutate retry state.
    await waitFor(() => !record('p6-test-backend'), 10000);
    const crashed = state(lease); assert.deepEqual([crashed.phase, crashed.retryNo, crashed.httpAttempts], expected, 'Crash must not reset persisted phase/budgets');
    assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256, 'Never reprepare or replace the test artifact during a restart');
    await startHarness({ backendOnly: true });
    assert.equal(createHash('sha256').update(readFileSync(`${ROOT}/.env.p6-test.local`)).digest('hex'), signingFileHash, 'Keep the same signing secrets across all crashes');
    assert.notEqual(record('p6-test-backend').pid, processBefore.pid);
    assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256);
    console.log(JSON.stringify({ checkpoint: stage, actualJvmRestart: true, naturalLeaseWait: true, oldPid: processBefore.pid, newPid: record('p6-test-backend').pid, artifact: artifact.identity }));
    // Reuse the same authenticated session and normal read endpoint after restart.
    await until(async () => { const status = expect(await primary.client.call(`/api/app/v1/reports/${reportId}/status`), 200, 'status after actual restart'); assert.notEqual(status.status, 'FAILED', 'Recovered report may not become permanently failed'); return status.currentVersionId === before.versionId; }, `${stage} report publication`);
    const after = state(lease), probe = read('checkpoint-old-lease-result.json');
    assert.equal(after.status, 'READY'); assert.equal(after.jobStatus, 'SUCCEEDED'); assert.equal(after.leaseVersion, before.leaseVersion + 1); assert.equal(after.jobAttempts, before.jobAttempts + 1);
    assert.equal(after.retryNo, before.retryNo); assert.equal(after.httpAttempts, stage === 'AFTER_CLAIM' ? 1 : before.httpAttempts);
    assert.equal(after.requestSha, before.requestSha); assert.equal(after.sourceSha, before.sourceSha); if (stage === 'BEFORE_PUBLISH') assert.equal(after.bodySha, before.bodySha);
    assert.equal(probe.job, lease.job); assert.equal(probe.oldLeaseVersion, before.leaseVersion); assert.equal(probe.newLeaseVersion, after.leaseVersion);
    assert.equal(probe.heartbeatAccepted, false); assert.equal(probe.publishAccepted, false); assert.equal(probe.stateUnchanged, true);
    const body = expect(await primary.client.call(`/api/app/v1/reports/${reportId}`), 200, 'recovered report body'); assert.equal(body.reportVersionId, before.versionId);
    assert.equal(body.generationMode, stage === 'DURING_REPAIR' ? 'DETERMINISTIC_FALLBACK' : 'AI');
    if (stage === 'DURING_REPAIR') assert.equal(after.unknownCalls, 1, 'Interrupted repair must become UNKNOWN, not a second repair');
    results.push({ stage, phaseAtCrash: before.phase, retryNoBefore: before.retryNo, retryNoAfter: after.retryNo, attemptsBefore: before.httpAttempts, attemptsAfter: after.httpAttempts, oldLeaseRejected: true, ready: true, bodyShaPreserved: stage === 'BEFORE_PUBLISH' });
    remove(['checkpoint-old-lease.json', 'checkpoint-old-lease-result.json', 'checkpoint-entered.json', 'checkpoint-latest-lease.json', 'checkpoint-release', 'gateway-entered.json', 'gateway-release']);
  }
  try {
    control('gateway-control.json', { mode: 'PASS' }); control('checkpoint-control.json', { stage: 'AFTER_CLAIM' });
    remove(['checkpoint-entered.json', 'checkpoint-latest-lease.json', 'checkpoint-old-lease.json', 'checkpoint-old-lease-result.json', 'checkpoint-release', 'gateway-entered.json', 'gateway-release']);
    primary = await scope.student(); operator = await new P6Client().operator('full');
    const decision = expect(await post(primary.client, `/api/app/v1/recommendations/${primary.recommendation.recommendationId}/decision`, { selectedMajorCode: 'AI', ...(primary.recommendation.primaryMajor === 'AI' ? {} : { overrideReasonCode: 'DECLINED' }) }), 201, 'real AI recommendation decision');
    let run = expect(await post(primary.client, runRoot, { decisionId: decision.decisionId }), 201, 'real formal fixture run');
    run = expect(await post(primary.client, `${runRoot}/${run.runId}/start`, { expectedRevision: run.revision }), 200, 'start actual run'); assert.equal(run.taskVersionId, '01JF1000000000000000000001');
    for (const step of material.steps) {
      const current = expect(await primary.client.call(`${runRoot}/${run.runId}/steps/${step.stepKey}`), 200, 'read actual step');
      const saved = expect(await primary.client.call(`${runRoot}/${run.runId}/steps/${step.stepKey}/response`, { method: 'PUT', body: { expectedRevision: current.revision, responseSchemaVersion: current.responseSchemaVersion, response: fixture.responses[step.stepKey] } }), 200, 'save real task response');
      if (step.operationKey) assert.equal(expect(await post(primary.client, `${runRoot}/${run.runId}/executions`, { operationKey: step.operationKey, inputRevision: saved.revision, parameters: {} }), 200, 'actual fixed classifier').trustLevel, 'SERVER_VERIFIED');
      run = expect(await post(primary.client, `${runRoot}/${run.runId}/steps/${step.stepKey}/complete`, { expectedRevision: saved.revision }), 200, 'complete actual step');
    }
    run = expect(await post(primary.client, `${runRoot}/${run.runId}/task-completion`, { expectedRevision: run.revision }), 200, 'task completion');
    const reflection = expect(await primary.client.call(`${runRoot}/${run.runId}/reflection`), 200, 'actual reflection');
    expect(await post(primary.client, `${runRoot}/${run.runId}/reflection/submission`, { ...fixture.reflection, expectedRevision: reflection.revision }), 200, 'actual closed input');
    await until(async () => existsSync(`${directory}/checkpoint-entered.json`), 'claimed checkpoint', 30000);
    const first = read('checkpoint-entered.json'); assert.equal(first.stage, 'AFTER_CLAIM'); await interruptAndRecover('AFTER_CLAIM', first.lease);
    for (const stage of ['DURING_REPAIR', 'BEFORE_PUBLISH']) {
      control('checkpoint-control.json', { stage: stage === 'BEFORE_PUBLISH' ? stage : 'PASS' }); control('gateway-control.json', { mode: stage === 'DURING_REPAIR' ? 'HOLD_REPAIR' : 'PASS' });
      const current = expect(await primary.client.call(`/api/app/v1/reports/${reportId}/status`), 200, 'current regeneration revision');
      expect(await post(operator, `/api/admin/v1/majorpilot/reports/${reportId}/regenerations`, { expectedRevision: current.revision, reasonCode: 'OPERATOR_REQUEST', reason: `Synthetic R08 actual JVM crash at ${stage}`, evidenceMode: 'REUSE_READY_EVIDENCE' }), 202, 'normal authorized regeneration');
      const file = stage === 'DURING_REPAIR' ? 'gateway-entered.json' : 'checkpoint-entered.json';
      await until(async () => existsSync(`${directory}/${file}`), `${stage} checkpoint`, 30000);
      if (stage === 'DURING_REPAIR') assert.equal(read(file).stage, 'REPAIR'); else assert.equal(read(file).stage, 'BEFORE_PUBLISH');
      await interruptAndRecover(stage, stage === 'DURING_REPAIR' ? read('checkpoint-latest-lease.json') : read(file).lease);
    }
    assert.equal(p6Query(`SELECT COUNT(*) FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.public_id='${reportId}' AND v.status='GENERATING';`), '0');
  } catch (error) { failure = error; }
  finally {
    try {
      releaseAll(); control('checkpoint-control.json', { stage: 'PASS' }); control('gateway-control.json', { mode: 'PASS' });
      assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256);
      if (!record('p6-test-backend')) await startHarness({ backendOnly: true });
      if (operator) await operator.call('/logout', { method: 'POST' });
      await scope.cleanup(); await sleep(250);
      remove(['checkpoint-entered.json', 'checkpoint-latest-lease.json', 'checkpoint-old-lease.json', 'checkpoint-old-lease-result.json', 'checkpoint-release', 'gateway-entered.json', 'gateway-release']);
      assert.deepEqual(record('backend'), main, 'Main runtime must remain unchanged');
      assert.ok(record('p6-test-backend'), 'Restore the isolated harness after the test');
    } catch (cleanup) { failure = failure ? new AggregateError([failure, cleanup], 'R08 acceptance/restore failed; payloads suppressed') : cleanup; }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ result: 'PASS', scope: 'R08 actual JVM crash and same immutable artifact recovery', actualJvmRestarts: 3, fixtureStudents: 1, stages: results, fixtureCleanup: true, sameSigningSecretsAndRedis: true, naturalLeaseExpiry: true, sqlBusinessStateInjection: false, mainRuntimeUnchanged: true, paidCalls: 0 }, null, 2));
}
