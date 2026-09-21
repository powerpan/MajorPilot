import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { ROOT } from './local-config.mjs';
import { createP6FixtureScope, P6Client, expect, idempotency, p6Query } from './lib/p6-student-fixture.mjs';

// This is an actual HTTP acceptance test, not an auth bypass or professional
// publication. Its test-source-only server uses scoped TEST_FIXTURE content and
// a network-free replay gateway; production model calls are never made here.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 1 && args[0] === '--check');
const { loadP6Contracts } = await import('../contracts/check-p6.mjs');
const contract = await loadP6Contracts();
const read = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const materials = [
  { major: 'AI', id: '01JF1000000000000000000001', manifest: read('../content/ai-support/1.0.0/manifest.json'), fixture: read('../contracts/examples/p3-ai-run.json'), mode: 'HOLD_INITIAL', reportMode: 'AI' },
  { major: 'DATA_SCIENCE', id: '01JF2000000000000000000001', manifest: read('../content/ds-learning/1.0.0/manifest.json'), fixture: read('../contracts/examples/p4-ds-run.json'), mode: 'INVALID_INITIAL', reportMode: 'AI' },
  { major: 'BUSINESS_ANALYTICS', id: '01JF3000000000000000000001', manifest: read('../content/ba-learning/1.0.0/manifest.json'), fixture: read('../contracts/examples/p5-ba-run.json'), mode: 'INVALID_ALWAYS', reportMode: 'DETERMINISTIC_FALLBACK' },
];
for (const material of materials) {
  for (const step of material.manifest.steps) assert.ok(contract.ajv.compile(step.inputSchema)(material.fixture.responses[step.stepKey]), `Invalid ${material.major} fixture: ${step.stepKey}`);
  assert.ok(contract.ajv.compile(material.manifest.reflection.inputSchema)(material.fixture.reflection.answers));
}
if (args.includes('--check')) console.log(JSON.stringify({ result: 'PASS', scope: 'P6 static HTTP acceptance preflight', fixtureMajors: materials.map(m => m.major), plannedAccounts: 2, accountsCreated: 0, liveHttpVerified: false, paidCalls: 0 }, null, 2));
else await acceptance();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function gateway(mode) {
  assert.ok(['PASS', 'INVALID_INITIAL', 'INVALID_ALWAYS', 'HOLD_INITIAL'].includes(mode));
  const base = `${ROOT}/data/p6-harness`, file = `${base}/gateway-control.json`, temporary = `${base}/control-${randomUUID()}.json`;
  for (const artifact of ['gateway-entered.json', 'gateway-release']) if (existsSync(`${base}/${artifact}`)) unlinkSync(`${base}/${artifact}`);
  writeFileSync(temporary, JSON.stringify({ mode }) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, file);
}
function releaseGateway() { const file = `${ROOT}/data/p6-harness/gateway-release`; if (!existsSync(file)) writeFileSync(file, 'release\n', { flag: 'wx', mode: 0o600 }); }
async function until(check, label, timeout = 55000) {
  const deadline = Date.now() + timeout;
  do { const result = await check(); if (result) return result; await sleep(2000); } while (Date.now() < deadline);
  throw new Error(`${label}: timed out; no fixture payload emitted`);
}

async function acceptance() {
  assert.equal(p6Query('SELECT DATABASE();'), 'majorpilot_test');
  assert.equal(p6Query("SELECT COUNT(*) FROM mp_task_version WHERE public_id IN ('01JF1000000000000000000001','01JF2000000000000000000001','01JF3000000000000000000001') AND status='PUBLISHED' AND JSON_EXTRACT(review_checks_json,'$.TEST_FIXTURE')=TRUE;"), '3');
  const scope = createP6FixtureScope(), verified = new Map(), checks = [], adminClients = [];
  const instrumented = new WeakSet();
  const instrument = client => {
    if (instrumented.has(client)) return client; instrumented.add(client);
    const call = client.call.bind(client);
    client.call = async (path, options = {}) => {
      const pieces = path.split('?')[0].split('/'), method = (options.method || 'GET').toLowerCase();
      const op = contract.operations.find(o => o.method === method && o.path.split('/').length === pieces.length && o.path.split('/').every((p, i) => p.startsWith('{') || p === pieces[i]));
      if (op?.request && !options.invalidRequest) assert.ok(op.request(options.body), `${op.id}: request contract mismatch (payload suppressed)`);
      const response = await call(path, options);
      if (op) {
        const validate = op.responses[String(response.status)] || op.responses.default;
        assert.ok(validate && validate(response.body), `${op.id}: HTTP ${response.status} response contract mismatch ${JSON.stringify(validate?.errors?.map(e => ({ path: e.instancePath, keyword: e.keyword })))}`);
        if (!verified.has(op.id)) verified.set(op.id, new Set()); verified.get(op.id).add(response.status);
        assert.equal(response.headers.get('cache-control'), 'no-store', 'Report/feedback reads and errors must not be cached');
      }
      return response;
    };
    return client;
  };
  const post = (client, path, body, headers = idempotency(), extra = {}) => client.call(path, { method: 'POST', body, headers, ...extra });
  const scalar = sql => Number(p6Query(sql));
  const reportRoot = '/api/app/v1/reports', runRoot = '/api/app/v1/experience-runs', adminRoot = '/api/admin/v1/majorpilot/reports';
  const reportRows = email => { assert.match(email, /^p6-http-[a-f0-9-]+-[01]@example\.invalid$/); return `SELECT id FROM mp_report WHERE student_id IN (SELECT id FROM mp_student_account WHERE email_normalized='${email}')`; };
  let failure, primary, full;
  try {
    gateway('PASS');
    const anonymous = instrument(new P6Client());
    expect(await anonymous.call(reportRoot), 401, 'anonymous report list', 'AUTH_REQUIRED');
    expect(await anonymous.call('/api/app/v1/comparison-report'), 401, 'anonymous comparison', 'AUTH_REQUIRED');
    primary = await scope.student({ pendingCheck: async client => expect(await instrument(client).call(reportRoot), 403, 'unverified report denial', 'EMAIL_NOT_VERIFIED') });
    const other = await scope.student(); const client = instrument(primary.client), foreign = instrument(other.client);
    full = instrument(await new P6Client().operator('full')); const limited = instrument(await new P6Client().operator('limited')); adminClients.push(full, limited);
    expect(await full.call('/api/app/v1/reports'), 401, 'operator JWT does not become Student session', 'AUTH_REQUIRED');
    expect(await client.call(adminRoot), 401, 'Student session does not become operator JWT', 'AUTH_REQUIRED');
    assert.deepEqual(expect(await client.call(reportRoot), 200, 'empty report list').items, []);
    assert.equal(expect(await client.call('/api/app/v1/comparison-report'), 200, 'comparison waits').reason, 'NEED_TWO_MAJORS');
    expect(await client.call('/api/app/v1/review-preview-tasks'), 404, 'test harness does not open previews');
    checks.push('real mail-verified identities, pending/anonymous/Student-Operator isolation, no preview bypass');

    async function readyReport(runId) {
      const summary = await until(async () => expect(await client.call(`${reportRoot}?limit=50`), 200, 'report list while queued').items.find(item => item.reportType === 'EXPERIENCE' && scalar(`SELECT COUNT(*) FROM mp_report p JOIN mp_experience_run r ON r.id=p.experience_run_id WHERE p.public_id='${item.reportId}' AND r.public_id='${runId}';`) === 1), 'logical report appears');
      await until(async () => { const status = expect(await client.call(`${reportRoot}/${summary.reportId}/status`), 200, 'report readiness'); assert.notEqual(status.status, 'FAILED', 'Report generation must not fail'); return status.currentVersionId && status; }, 'report ready');
      const body = expect(await client.call(`${reportRoot}/${summary.reportId}`), 200, 'current report body'); assert.equal(body.sources[0].experienceRunId, runId); return body;
    }
    const reports = [];
    let recommendation = primary.recommendation;
    for (const material of materials) {
      gateway(material.mode);
      const decision = expect(await post(client, `/api/app/v1/recommendations/${recommendation.recommendationId}/decision`, { selectedMajorCode: material.major, ...(recommendation.primaryMajor === material.major ? {} : { overrideReasonCode: 'DECLINED' }) }), 201, 'real recommendation choice');
      let run = expect(await post(client, runRoot, { decisionId: decision.decisionId }), 201, 'formal fixture run');
      assert.equal(run.runMode, 'STANDARD'); assert.equal(run.contentKind, 'MAJOR');
      run = expect(await post(client, `${runRoot}/${run.runId}/start`, { expectedRevision: run.revision }), 200, 'start formal fixture'); assert.equal(run.taskVersionId, material.id);
      const task = expect(await client.call(`${runRoot}/${run.runId}/task`), 200, 'read formal published TEST_FIXTURE'); assert.ok(task.title.startsWith('TEST_FIXTURE'));
      for (const definition of material.manifest.steps) {
        const step = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}`), 200, 'current task step');
        const saved = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}/response`, { method: 'PUT', body: { expectedRevision: step.revision, responseSchemaVersion: step.responseSchemaVersion, response: material.fixture.responses[definition.stepKey] } }), 200, 'save synthetic task answer');
        const current = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}`), 200, 'saved bindings');
        if (definition.operationKey) {
          const sourceRevisions = Object.fromEntries(current.inputBindings.map(b => [b.sourceStepKey, b.sourceRevision]));
          const execution = expect(await post(client, `${runRoot}/${run.runId}/executions`, { operationKey: definition.operationKey, inputRevision: saved.revision, parameters: {}, ...(material.major === 'AI' ? {} : { expectedSourceRevisions: sourceRevisions }) }), 200, 'real server-verified algorithm');
          assert.equal(execution.status, 'SUCCEEDED'); assert.equal(execution.trustLevel, 'SERVER_VERIFIED');
        }
        run = expect(await post(client, `${runRoot}/${run.runId}/steps/${definition.stepKey}/complete`, { expectedRevision: saved.revision, ...(current.baActionContext ? { expectedSourceRevisions: current.baActionContext.sourceRevisions } : {}) }), 200, 'complete required step');
      }
      run = expect(await post(client, `${runRoot}/${run.runId}/task-completion`, { expectedRevision: run.revision }), 200, 'complete task, reflection still required');
      const reflection = expect(await client.call(`${runRoot}/${run.runId}/reflection`), 200, 'reflection');
      const closeBody = { ...material.fixture.reflection, expectedRevision: reflection.revision }, key = idempotency();
      run = expect(await post(client, `${runRoot}/${run.runId}/reflection/submission`, closeBody, key), 200, 'close formal task'); assert.equal(run.status, 'CLOSED'); assert.equal(run.reportStatus, 'PENDING');
      assert.equal(expect(await post(client, `${runRoot}/${run.runId}/reflection/submission`, closeBody, key), 200, 'close receipt replay').runId, run.runId);
      if (material.major === 'AI') {
        await until(async () => existsSync(`${ROOT}/data/p6-harness/gateway-entered.json`), 'first controlled generation entered', 20000);
        const pending = expect(await client.call(reportRoot), 200, 'pending logical report').items.find(item => item.reportType === 'EXPERIENCE'); assert.ok(pending);
        assert.equal(expect(await client.call(`${reportRoot}/${pending.reportId}`), 202, 'initial body remains pending').currentVersionId, null);
        assert.equal(expect(await client.call(`${reportRoot}/${pending.reportId}/print`), 202, 'initial print remains pending').currentVersionId, null);
        releaseGateway();
      }
      const body = await readyReport(run.runId); reports.push(body); assert.equal(body.reportType, 'EXPERIENCE'); assert.equal(body.majorCode, material.major); assert.equal(body.generationMode, material.reportMode);
      assert.equal(p6Query(`SELECT CONCAT(retry_no,':',http_attempt_count) FROM mp_report_version WHERE public_id='${body.reportVersionId}';`), material.major === 'AI' ? '0:1' : '1:2', 'Durable initial/repair budget must match simulated attempts');
      assert.ok(!JSON.stringify(body).includes('evidenceIds')); assert.ok(!JSON.stringify(body).includes('snapshotSha256'));
      expect(await foreign.call(`${reportRoot}/${body.reportId}`), 404, 'cross-student report', 'RESOURCE_NOT_FOUND'); expect(await foreign.call(`${reportRoot}/${body.reportId}/status`), 404, 'cross-student status', 'RESOURCE_NOT_FOUND');
      const peek = expect(await client.call('/api/app/v1/dashboard'), 200, 'NEXT dashboard');
      if (material.major !== 'BUSINESS_ANALYTICS') {
        assert.ok(peek.nextRecommendation); recommendation = expect(await client.call(`/api/app/v1/recommendations/${peek.nextRecommendation.recommendationId}`), 200, 'owned NEXT'); assert.equal(recommendation.recommendationType, 'NEXT'); assert.equal(recommendation.sourceRunId, run.runId); assert.ok(recommendation.differences); assert.ok(!recommendation.completedMajorCodes.includes(recommendation.primaryMajor));
        expect(await foreign.call(`/api/app/v1/recommendations/${recommendation.recommendationId}`), 404, 'cross-student NEXT');
        expect(await post(client, '/api/app/v1/events', { events: [{ clientEventId: randomUUID(), eventName: 'next_recommendation.viewed', eventVersion: 'v1', occurredAt: new Date().toISOString(), visibleDurationMs: 1000, contextType: 'RECOMMENDATION', contextPublicId: recommendation.recommendationId, properties: {} }] }), 202, 'NEXT page observation');
      } else { assert.equal(peek.nextStep, 'ALL_COMPLETED'); assert.equal(peek.nextRecommendation, null); assert.equal(body.nextRecommendation.state, 'ALL_COMPLETED'); }
      if (reports.length >= 2) await until(async () => { const result = expect(await client.call('/api/app/v1/comparison-report'), 200, 'comparison ready branch'); return result.state === 'READY' && result.report.sources.length === reports.length && result; }, 'comparison publication');
    }
    checks.push('three complete STANDARD TEST_FIXTURE runs, actual AI/DS/BA engines, frozen closure, valid AI/one repair/fallback, 2→3 comparison and independent NEXT');
    gateway('PASS');
    const comparison = expect(await client.call('/api/app/v1/comparison-report'), 200, 'three-source comparison'); assert.equal(comparison.state, 'READY'); assert.equal(comparison.report.nextRecommendation.state, 'ALL_COMPLETED');
    assert.equal(comparison.report.sources.length, 3); assert.equal(new Set(comparison.report.sources.map(s => s.majorCode)).size, 3);
    const list = expect(await client.call(`${reportRoot}?limit=2`), 200, 'report pagination'); assert.equal(list.items.length, 2); assert.ok(list.nextCursor);
    const nextPage = expect(await client.call(`${reportRoot}?limit=2&cursor=${list.nextCursor}`), 200, 'next report page'); assert.equal(nextPage.items.length, 2); assert.ok(!nextPage.items.some(item => list.items.some(first => first.reportId === item.reportId)));
    expect(await client.call(`${reportRoot}?limit=51`), 422, 'bounded report pagination');
    const original = reports[0], path = `${reportRoot}/${original.reportId}`;
    assert.equal(expect(await client.call(`${path}/print?expectedReportVersionId=${original.reportVersionId}`), 200, 'authorized current print').reportVersionId, original.reportVersionId);
    expect(await client.call(`${path}/print?expectedReportVersionId=01JF1000000000000000000001`), 409, 'stale print rejected', 'REPORT_VERSION_CHANGED');
    expect(await foreign.call(`${path}/print?expectedReportVersionId=${original.reportVersionId}`), 404, 'cross-student print', 'RESOURCE_NOT_FOUND');
    expect(await client.call(`${adminRoot}/${original.reportId}`), 401, 'Student cannot query admin metadata');
    expect(await full.call(adminRoot), 200, 'operator report list'); expect(await full.call(`${adminRoot}/${original.reportId}`), 200, 'operator report metadata'); expect(await limited.call(`${adminRoot}/${original.reportId}`), 200, 'least-privileged metadata');
    expect(await limited.call(`${adminRoot}/${original.reportId}/versions`), 403, 'history needs independent permission', 'PERMISSION_DENIED');
    expect(await limited.call(`${adminRoot}/${original.reportId}/versions/${original.reportVersionId}`), 403, 'sensitive body needs independent permission', 'PERMISSION_DENIED');
    expect(await full.call(`${adminRoot}/${original.reportId}/versions`), 200, 'operator history'); expect(await full.call(`${adminRoot}/${original.reportId}/versions/${original.reportVersionId}`), 200, 'audited sensitive historical read');
    const regen = { expectedRevision: expect(await client.call(`${path}/status`), 200, 'current revision').revision, reasonCode: 'OPERATOR_REQUEST', reason: 'Synthetic isolated HTTP regeneration acceptance', evidenceMode: 'REUSE_READY_EVIDENCE' };
    expect(await post(limited, `${adminRoot}/${original.reportId}/regenerations`, regen), 403, 'regeneration requires permission', 'PERMISSION_DENIED');
    gateway('HOLD_INITIAL'); const regenKey = idempotency();
    const accepted = expect(await post(full, `${adminRoot}/${original.reportId}/regenerations`, regen, regenKey), 202, 'accepted regeneration');
    await until(async () => existsSync(`${ROOT}/data/p6-harness/gateway-entered.json`), 'held fake call entered', 20000);
    assert.equal(expect(await post(full, `${adminRoot}/${original.reportId}/regenerations`, regen, regenKey), 202, 'regeneration receipt replay').reportVersionId, accepted.reportVersionId);
    const ongoing = expect(await client.call(`${path}/status`), 200, 'old ready plus generation'); assert.equal(ongoing.currentVersionId, original.reportVersionId); assert.equal(ongoing.generation.status, 'GENERATING');
    assert.equal(expect(await client.call(path), 200, 'old body remains readable').reportVersionId, original.reportVersionId);
    expect(await post(full, `${adminRoot}/${original.reportId}/regenerations`, { ...regen, expectedRevision: ongoing.revision }), 409, 'duplicate active target', 'REPORT_REGENERATION_IN_PROGRESS');
    expect(await post(full, `${adminRoot}/${original.reportId}/regenerations`, { ...regen, reason: 'Changed request body must never reuse this key' }, regenKey), 409, 'key/body conflict', 'IDEMPOTENCY_KEY_REUSED');
    releaseGateway();
    await until(async () => expect(await client.call(`${path}/status`), 200, 'regenerated status').currentVersionId === accepted.reportVersionId, 'regeneration publication');
    expect(await client.call(`${path}/print?expectedReportVersionId=${original.reportVersionId}`), 409, 'printed version changed after regeneration', 'REPORT_VERSION_CHANGED');
    assert.equal(expect(await full.call(`${adminRoot}/${original.reportId}/versions/${original.reportVersionId}`), 200, 'superseded sensitive history').reportVersionId, original.reportVersionId);
    checks.push('read/status/pagination/print CAS; true operator JWT and split permissions; regeneration receipt/body/active-target boundaries, old current retained and audited history');

    const feedback = { feedbackType: 'REPORT', contextType: 'REPORT_VERSION', contextPublicId: original.reportVersionId, surveyVersion: 'report-value-v1', answers: { insightResponse: 5, clarityChange: 4, nextAction: 'TRY_ANOTHER' }, comment: 'Synthetic report feedback bound to the version actually read' };
    expect(await post(client, '/api/app/v1/feedback', feedback, idempotency(), { csrf: false }), 403, 'feedback CSRF');
    expect(await post(client, '/api/app/v1/feedback', feedback, { ...idempotency(), Origin: 'https://untrusted.invalid' }), 403, 'feedback Origin');
    expect(await post(foreign, '/api/app/v1/feedback', feedback), 422, 'foreign report feedback', 'FEEDBACK_INVALID');
    const feedbackKey = idempotency(), submitted = expect(await post(client, '/api/app/v1/feedback', feedback, feedbackKey), 201, 'own superseded report feedback');
    assert.equal(expect(await post(client, '/api/app/v1/feedback', feedback, feedbackKey), 201, 'feedback replay').feedbackId, submitted.feedbackId);
    expect(await post(client, '/api/app/v1/feedback', { ...feedback, rating: 1 }, feedbackKey), 409, 'feedback key cannot accept a changed survey', 'IDEMPOTENCY_KEY_REUSED');
    expect(await post(client, '/api/app/v1/feedback', { feedbackType: 'GENERAL', rating: 4, comment: 'Synthetic optional global feedback' }), 201, 'global feedback independent of reports');
    expect(await post(client, '/api/app/v1/feedback', { ...feedback, answers: { clarityChange: 2 }, comment: undefined }), 201, 'subsequent feedback appends');
    const ownerReports = reportRows(primary.email);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_student_feedback WHERE report_id IN (${ownerReports}) AND first_valid_survey=TRUE;`), 1);
    const observation = (name, id) => ({ clientEventId: randomUUID(), eventName: name, eventVersion: 'v1', occurredAt: new Date().toISOString(), contextType: 'REPORT_VERSION', contextPublicId: id, visibleDurationMs: 1000, properties: {} });
    const seen = observation('report.viewed', original.reportVersionId);
    const eventPath = '/api/app/v1/events';
    expect(await post(foreign, eventPath, { events: [seen] }), 422, 'foreign page event');
    assert.equal(expect(await post(client, eventPath, { events: [seen] }), 202, 'report viewed event').acceptedCount, 1);
    assert.equal(expect(await post(client, eventPath, { events: [{ ...seen, clientEventId: randomUUID() }] }), 202, 'report view deduplication').duplicateCount, 1);
    expect(await post(client, eventPath, { events: [observation('report.printed', original.reportVersionId), observation('comparison_report.viewed', comparison.report.reportVersionId)] }), 202, 'print and comparison observations');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_ai_call WHERE report_version_id IN (SELECT id FROM mp_report_version WHERE report_id IN (${ownerReports})) AND provider<>'TEST_REPLAY';`), 0, 'No real model supplier used');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report_version WHERE report_id IN (${ownerReports}) AND (http_attempt_count>3 OR retry_no>1);`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report_version WHERE report_id IN (${ownerReports}) AND JSON_SEARCH(input_manifest_json,'one','STUDENT_ANALYSIS') IS NOT NULL;`), 0, 'Unverified analysis is not copied to report input');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report_claim c JOIN mp_report_claim_evidence x ON x.report_claim_id=c.id JOIN mp_evidence_item e ON e.id=x.evidence_item_id WHERE c.report_version_id IN (SELECT id FROM mp_report_version WHERE report_id IN (${ownerReports})) AND e.evidence_type='STUDENT_ANALYSIS';`), 0);
    checks.push('feedback optional/owned/superseded/first-survey/replay, observed page attribution and dedupe, no raw student-analysis claims or paid supplier calls');
    const missing = contract.operations.filter(op => !verified.has(op.id)); assert.deepEqual(missing.map(op => op.id), [], 'Every declared P6 operation must be exercised');
  } catch (error) { failure = error; }
  finally {
    try {
      releaseGateway();
      // Leave release present while an in-flight fake may be unwinding. Account
      // locks in cleanup fence publication; only then reset the shared mode.
      for (const admin of adminClients) await admin.call('/logout', { method: 'POST' });
      await scope.cleanup(); await sleep(250); gateway('PASS');
    }
    catch (cleanup) { failure = failure ? new AggregateError([failure, cleanup], 'P6 acceptance/cleanup failed; payloads suppressed') : cleanup; }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ result: 'PASS', scope: 'P6 real isolated HTTP/MySQL with test-source-only published preconditions; not human review', checks, responseContractsVerified: verified.size, operationStatuses: Object.fromEntries([...verified].map(([id, statuses]) => [id, [...statuses].sort()])), fixtureAccounts: 2, fixtureCleanup: true, rateLimitsReset: false, simulatedGatewayOnly: true, paidCalls: 0 }, null, 2));
}
