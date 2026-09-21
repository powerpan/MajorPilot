import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { ROOT } from './local-config.mjs';
import { startHarness, stopHarness } from './p6-harness.mjs';
import { record, processInspectionAvailable, waitFor } from './processes.mjs';
import { createP6FixtureScope, p6Query, idempotency, expect } from './lib/p6-student-fixture.mjs';

// M03/M05: two actual crashes of the isolated, immutable test JVM. Production
// work/leases are unchanged. Never inject SQL business state or a provider key.
const arguments_ = process.argv.slice(2);
assert.ok(arguments_.length === 0 || arguments_.length === 1 && arguments_[0] === '--check');
const directory = `${ROOT}/data/p6-harness`, stages = ['EXPORT_RESERVED', 'DELETE_FILES_COMMITTED'];
const files = ['privacy-checkpoint-entered.json', 'privacy-checkpoint-latest-lease.json', 'privacy-checkpoint-old-lease.json', 'privacy-checkpoint-old-lease-result.json', 'privacy-checkpoint-release'];
if (arguments_.includes('--check')) console.log(JSON.stringify({ result: 'PASS', scope: 'P7 static restart plan; not runtime evidence', stages, plannedStudents: 1, plannedJvmCrashes: 2, shortenedLeases: false, sqlBusinessStateInjection: false, paidCalls: 0 }));
else await acceptance();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function controlled(name) { assert.ok(/^privacy-checkpoint-[a-z-]+\.json$|^privacy-checkpoint-release$/.test(name)); return `${directory}/${name}`; }
function write(name, value) {
  const file = controlled(name); if (existsSync(file)) assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
  const pending = `${file}.pending-${randomUUID()}`; writeFileSync(pending, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); renameSync(pending, file);
}
function remove(names) { for (const name of names) { const file = controlled(name); if (existsSync(file)) { assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()); unlinkSync(file); } } }
function read(name) { const file = controlled(name); assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && lstatSync(file).size <= 8192); return JSON.parse(readFileSync(file, 'utf8')); }
function release() { const file = controlled('privacy-checkpoint-release'); if (!existsSync(file)) writeFileSync(file, 'release\n', { flag: 'wx', mode: 0o600 }); }
function descriptor() {
  const file = `${directory}/current.json`; assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
  const bytes = readFileSync(file), data = JSON.parse(bytes); assert.match(data.identity, /^[a-f0-9]{64}$/); assert.match(data.backendSha256, /^[a-f0-9]{64}$/);
  assert.equal(data.directory, `${directory}/runtime-${data.identity}`); return { ...data, descriptorSha256: createHash('sha256').update(bytes).digest('hex') };
}
async function until(check, label, timeout = 115000) {
  const deadline = Date.now() + timeout; let progress = Date.now();
  do { const result = await check(); if (result) return result; if (Date.now() - progress > 15000) { console.log(JSON.stringify({ waiting: label, naturalLeaseExpiry: true })); progress = Date.now(); } await sleep(1000); } while (Date.now() < deadline);
  throw new Error(`${label}: bounded timeout; payload suppressed`);
}
function leaseValues(lease) {
  for (const field of ['job', 'student', 'target', 'generation']) assert.ok(Number.isSafeInteger(lease[field]) && lease[field] > 0);
  assert.ok(['STUDENT_EXPORT', 'ACCOUNT_DELETE'].includes(lease.type)); assert.match(lease.worker, /^privacy-[a-f0-9-]{36}$/);
}
function state(lease) {
  leaseValues(lease);
  const query = lease.type === 'STUDENT_EXPORT'
    ? `SELECT JSON_OBJECT('status',e.status,'exportId',e.public_id,'objectKey',e.object_key,'fileSha',e.file_sha256,'size',e.file_size_bytes,'generation',j.lease_version,'jobStatus',j.status,'attempts',j.attempt_count,'artifactKeys',JSON_EXTRACT(j.checkpoint_json,'$.artifactKeys')) FROM mp_background_job j JOIN mp_student_data_export e ON e.id=j.target_id AND e.student_id=j.owner_student_id WHERE j.id=${lease.job} AND j.owner_student_id=${lease.student} AND e.id=${lease.target};`
    : `SELECT JSON_OBJECT('status',d.status,'requestId',d.public_id,'stage',d.current_stage,'generation',j.lease_version,'jobStatus',j.status,'attempts',j.attempt_count,'exports',(SELECT COUNT(*) FROM mp_student_data_export WHERE student_id=d.student_id),'profiles',(SELECT COUNT(*) FROM mp_decision_profile WHERE student_id=d.student_id)) FROM mp_background_job j JOIN mp_account_deletion_request d ON d.id=j.target_id AND d.student_id=j.owner_student_id WHERE j.id=${lease.job} AND j.owner_student_id=${lease.student} AND d.id=${lease.target};`;
  const result = p6Query(query); assert.ok(result, 'Expected durable job and owned target'); return JSON.parse(result);
}
function artifactPath(key) { assert.match(key, /^student\/[0-7][0-9A-HJKMNP-TV-Z]{25}\.zip$/); return `${directory}/private-exports/${key}`; }

async function acceptance() {
  assert.ok(processInspectionAvailable(), 'Managed process identity inspection is required');
  assert.equal(p6Query('SELECT DATABASE();'), 'majorpilot_test');
  assert.equal(p6Query("SELECT MAX(CAST(version AS UNSIGNED)) FROM flyway_schema_history WHERE success=1;"), '8', 'Prepare the V8-only isolated runtime first');
  assert.equal(p6Query('SELECT COUNT(*) FROM mp_student_account;'), '0', 'A restart probe needs an exclusive Student fixture window');
  const artifact = descriptor(), original = record('p6-test-backend'), main = record('backend');
  assert.ok(original && original.port === 18081 && original.identity.includes(`${artifact.directory}/p6-test-only.jar`) && original.identity.includes('majorpilot.harness.P6HarnessApplication'));
  const signingFileHash = createHash('sha256').update(readFileSync(`${ROOT}/.env.p6-test.local`)).digest('hex');
  const scope = createP6FixtureScope(), results = []; let primary, failure, exportKey;
  const post = (route, body) => primary.client.call(route, { method: 'POST', body, headers: idempotency() });
  async function crashAndRestart(stage, lease) {
    const before = state(lease); assert.equal(before.status, 'PROCESSING'); assert.equal(before.jobStatus, 'RUNNING'); assert.equal(before.generation, lease.generation);
    if (stage === 'EXPORT_RESERVED') { assert.equal(before.artifactKeys.length, 1); assert.equal(before.objectKey, null); assert.ok(!existsSync(artifactPath(before.artifactKeys[0])), 'Reservation precedes bytes'); }
    else { assert.equal(before.stage, 'METADATA'); assert.equal(before.exports, 0); assert.ok(before.profiles > 0, 'FILES committed, later data stages have not run'); assert.ok(!existsSync(artifactPath(exportKey))); }
    write('privacy-checkpoint-old-lease.json', lease); write('privacy-checkpoint-control.json', { stage: 'PASS' });
    const processBefore = record('p6-test-backend'); assert.ok(processBefore && processBefore.identity.includes(`${artifact.directory}/p6-test-only.jar`));
    assert.equal(record('p6-test-backend')?.identity, processBefore.identity, 'Recheck PID and process start identity immediately before signal');
    process.kill(processBefore.pid, 'SIGKILL');
    await waitFor(() => !record('p6-test-backend'), 10000);
    assert.deepEqual(state(lease), before, 'Actual process crash must preserve durable reservation/stage and lease counters');
    assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256);
    await startHarness({ backendOnly: true });
    assert.equal(createHash('sha256').update(readFileSync(`${ROOT}/.env.p6-test.local`)).digest('hex'), signingFileHash);
    assert.notEqual(record('p6-test-backend').pid, processBefore.pid); assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256);
    console.log(JSON.stringify({ checkpoint: stage, actualJvmRestart: true, oldPid: processBefore.pid, newPid: record('p6-test-backend').pid, naturalLeaseWait: true, artifact: artifact.identity }));
    await until(() => existsSync(controlled('privacy-checkpoint-old-lease-result.json')), `${stage} old lease rejection`);
    const probe = read('privacy-checkpoint-old-lease-result.json');
    assert.equal(probe.job, lease.job); assert.equal(probe.oldGeneration, lease.generation); assert.equal(probe.newGeneration, lease.generation + 1); assert.equal(probe.heartbeatAccepted, false); assert.equal(probe.stateUnchanged, true);
    return before;
  }
  try {
    remove(files); write('privacy-checkpoint-control.json', { stage: 'EXPORT_RESERVED' });
    primary = await scope.student();
    const requested = expect(await post('/api/app/v1/data-export-requests', { scope: 'FULL_PERSONAL_EXPORT' }), 202, 'durable export request');
    await until(() => existsSync(controlled('privacy-checkpoint-entered.json')), 'export reservation checkpoint', 30000);
    const checkpoint = read('privacy-checkpoint-entered.json'); assert.equal(checkpoint.stage, 'EXPORT_RESERVED');
    const before = await crashAndRestart(checkpoint.stage, checkpoint.lease); assert.equal(before.exportId, requested.exportId);
    await until(async () => { const value = expect(await primary.client.call(`/api/app/v1/data-export-requests/${requested.exportId}`), 200, 'same session export after restart'); assert.notEqual(value.status, 'FAILED'); return value.status === 'READY'; }, 'recovered personal export');
    const after = state(checkpoint.lease); assert.equal(after.jobStatus, 'SUCCEEDED'); assert.equal(after.generation, before.generation + 1); assert.equal(after.attempts, before.attempts + 1); assert.equal(after.artifactKeys.length, 2);
    exportKey = after.objectKey; assert.equal(exportKey, after.artifactKeys[1]); assert.notEqual(exportKey, before.artifactKeys[0]); assert.ok(!existsSync(artifactPath(before.artifactKeys[0])));
    const download = await primary.client.call(`/api/app/v1/data-export-requests/${requested.exportId}/download`, { csrf: true }); assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/zip');
    assert.equal(download.bytes.readUInt32LE(0), 0x04034b50); assert.equal(download.bytes.length, after.size); assert.equal(createHash('sha256').update(download.bytes).digest('hex'), after.fileSha);
    assert.deepEqual(readFileSync(artifactPath(exportKey)), download.bytes);
    results.push({ stage: checkpoint.stage, freshArtifactAfterRestart: true, oldLeaseRejected: true, readyZipBytesVerified: true });
    remove(files); write('privacy-checkpoint-control.json', { stage: 'DELETE_FILES_COMMITTED' });
    const activeSession = primary.client.clone(), deletion = expect(await post('/api/app/v1/account-deletion-requests', {}), 201, 'preissued deletion receipt');
    scope.trackReceipt(deletion.receiptId);
    assert.equal(primary.client.cookies.get('MP_DELETION')?.path, '/api/public/v1/deletion-receipts');
    expect(await post(`/api/app/v1/account-deletion-requests/${deletion.requestId}/confirm`, { currentPassword: primary.password }), 202, 'confirm real deletion');
    expect(await activeSession.call('/api/app/v1/me'), 401, 'old session revoked immediately');
    await until(() => existsSync(controlled('privacy-checkpoint-entered.json')), 'committed FILES checkpoint', 30000);
    const deletionCheckpoint = read('privacy-checkpoint-entered.json'); assert.equal(deletionCheckpoint.stage, 'DELETE_FILES_COMMITTED');
    await crashAndRestart(deletionCheckpoint.stage, deletionCheckpoint.lease);
    const receipt = await until(async () => { const value = expect(await primary.client.call(`/api/public/v1/deletion-receipts/${deletion.receiptId}`), 200, 'preissued receipt after restart'); assert.notEqual(value.status, 'ACTION_REQUIRED'); return value.status === 'COMPLETED' ? value : false; }, 'resumed staged deletion');
    assert.ok(receipt.completedAt); assert.equal(Object.hasOwn(receipt, 'studentId'), false);
    const id = deletionCheckpoint.lease.student;
    for (const [table, field] of [['mp_student_account', 'id'], ['mp_background_job', 'owner_student_id'], ['mp_student_data_export', 'student_id'], ['mp_decision_profile', 'student_id'], ['mp_student_session', 'student_id'], ['mp_email_token', 'student_id'], ['mp_intake_session', 'claimed_student_id'], ['mp_security_event', 'student_id']]) assert.equal(p6Query(`SELECT COUNT(*) FROM ${table} WHERE ${field}=${id};`), '0', `No surviving ${table} fixture identity`);
    assert.equal(p6Query(`SELECT COUNT(*) FROM mp_account_deletion_request WHERE receipt_id='${deletion.receiptId}' AND student_id IS NULL AND status='COMPLETED' AND current_stage='COMPLETED';`), '1');
    assert.ok(!existsSync(artifactPath(exportKey))); expect(await activeSession.call('/api/app/v1/me'), 401, 'old session still revoked after restarted completion');
    results.push({ stage: deletionCheckpoint.stage, committedStagePreserved: true, oldLeaseRejected: true, deidentifiedReceiptCompleted: true, capturedAccountDependenciesRemoved: true });
  } catch (error) { failure = error; }
  finally {
    try {
      release(); write('privacy-checkpoint-control.json', { stage: 'PASS' });
      assert.equal(descriptor().descriptorSha256, artifact.descriptorSha256);
      // Only this managed test JVM is stopped. Exact fallback cleanup is never
      // reported as product deletion success and cannot race async file writers.
      if (record('p6-test-backend')) await stopHarness({ backendOnly: true });
      await scope.cleanup(); remove(files); await startHarness({ backendOnly: true });
      assert.deepEqual(record('backend'), main, 'Main runtime must remain unchanged'); assert.ok(record('p6-test-backend'));
    } catch (cleanup) { failure = failure ? new AggregateError([failure, cleanup], 'P7 restart acceptance/restore failed; payloads suppressed') : cleanup; }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ result: 'PASS', scope: 'P7 actual JVM crashes and same immutable artifact recovery', actualJvmRestarts: 2, fixtureStudents: 1, stages: results, fixtureCleanup: true, sameSigningSecretsAndRedis: true, naturalLeaseExpiry: true, sqlBusinessStateInjection: false, mainRuntimeUnchanged: true, paidCalls: 0 }, null, 2));
}
