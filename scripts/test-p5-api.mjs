import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixtureScope, LocalClient, expect, idempotency } from './lib/local-student-fixture.mjs';
import { loadP5Contracts } from '../contracts/check-p5.mjs';
import { calculateBa, normalizeParameters } from '../shared/ba/ba-metrics-v1.mjs';
import { mysqlCommand } from './infra.mjs';
import { readLocalEnv } from './env.mjs';

// All identities use the real local registration/email/session path. No REVIEW
// publication, paid requests, rate reset, test-auth bypass or forged HTTP result.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'));
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixture = json('../contracts/examples/p5-ba-run.json');
const manifest = json('../content/ba-learning/1.0.0/manifest.json');
const dataset = manifest.assets.find(a => a.assetKey === 'weekly-funnel');
const rows = json(`../content/${dataset.path}`);
const { original, operations, ajv, schemas } = await loadP5Contracts();
const routes = '/api/app/v1/experience-runs';
const metricKeys = ['numerator', 'denominator', 'baselineStartWeek', 'baselineEndWeek', 'comparisonStartWeek', 'comparisonEndWeek'];
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const metric = pick(fixture.responses['b2-metric'], metricKeys);
const configs = [metric, { ...metric, denominator: 'first_lesson_count' }];
for (let first = 1; first < 12 && configs.length < 31; first++) {
  for (let next = first + 1; next <= 12 && configs.length < 31; next++) {
    configs.push({ ...metric, baselineStartWeek: first, baselineEndWeek: first, comparisonStartWeek: next, comparisonEndWeek: next });
  }
}
assert.equal(new Set(configs.map(value => JSON.stringify(normalizeParameters('ba-metric', value)))).size, 31);
assert.equal(fixture.taskVersionId, manifest.taskVersionId);
for (const step of manifest.steps) assert.ok(ajv.compile(step.inputSchema)(fixture.responses[step.stepKey]), `Invalid synthetic fixture: ${step.stepKey}`);
assert.ok(ajv.compile(manifest.reflection.inputSchema)(fixture.reflection.answers));
assert.ok(schemas.ExecuteBA({ operationKey: 'ba-metric', inputRevision: 1, parameters: {}, expectedSourceRevisions: {} }));
for (const asset of manifest.assets.filter(a => a.visibility === 'PUBLIC')) {
  const shape = original.paths['/api/app/v1/experience-runs/{id}/task/assets/{assetKey}'].get.responses['200'].content[asset.mediaType].schema;
  const body = readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8');
  assert.ok(ajv.compile(shape)(asset.mediaType === 'application/json' ? JSON.parse(body) : body));
}
if (args.includes('--check')) console.log(JSON.stringify({ result: 'PASS', scope: 'P5 static acceptance preflight', steps: manifest.steps.length, plannedDistinctMetricConfigs: configs.length, accountsCreated: 0, liveHttpVerified: false, paidCalls: 0 }, null, 2));
else await runAcceptance();

async function runAcceptance() {
  const env = readLocalEnv();
  assert.equal(env.MP_EXPERIENCE_AI_ENABLED, 'false'); assert.equal(env.MP_CONTENT_PREVIEW_ENABLED, 'true');
  const scope = createFixtureScope('p5-api'), verified = new Map(), checks = [];
  const instrument = client => {
    const originalCall = client.call.bind(client);
    client.call = async (path, options = {}) => {
      const pieces = path.split('/'), method = (options.method || 'GET').toLowerCase();
      const op = operations.find(o => o.method === method && o.path.split('/').length === pieces.length && o.path.split('/').every((part, i) => part.startsWith('{') || part === pieces[i]));
      if (op?.request) assert.ok(op.request(options.body), `${op.id}: request contract rejected (payload suppressed)`);
      const response = await originalCall(path, options);
      if (op) {
        let validate = op.responses[String(response.status)] || op.responses.default, value = response.body;
        if (op.id === 'getPublicTaskAsset' && response.status === 200 && !response.headers.get('content-type')?.startsWith('application/json')) {
          const media = response.headers.get('content-type').split(';')[0];
          const shape = original.paths[op.path][method].responses['200'].content[media]?.schema;
          assert.ok(shape, 'Undeclared media type'); validate = ajv.compile(shape); value = response.text;
        }
        assert.ok(validate && validate(value), `${op.id}: HTTP ${response.status} contract rejected: ${JSON.stringify(validate?.errors?.map(e => ({ path: e.instancePath, keyword: e.keyword })))}`);
        if (!verified.has(op.id)) verified.set(op.id, new Set()); verified.get(op.id).add(response.status);
      }
      return response;
    };
    return client;
  };
  const post = (client, path, body, headers = idempotency()) => client.call(path, { method: 'POST', body, headers });
  const scalar = sql => Number(mysqlCommand(`USE majorpilot; ${sql}`).trim());
  let failure;
  try {
    expect(await instrument(new LocalClient()).call('/api/app/v1/review-preview-tasks'), 401, 'anonymous preview denied');
    const primary = await scope.student(), other = await scope.student();
    const client = instrument(primary.client), foreign = instrument(other.client);
    const catalog = expect(await client.call('/api/app/v1/review-preview-tasks'), 200, 'preview catalog');
    assert.equal(catalog.find(value => value.taskVersionId === fixture.taskVersionId)?.majorCode, 'BUSINESS_ANALYTICS');
    expect(await client.call('/api/app/v1/demo-tasks'), env.MP_P2_DEMO_ENABLED === 'true' ? 200 : 404, 'independent demo gate');
    expect(await post(client, routes, { decisionId: fixture.taskVersionId }), 404, 'content is not formal recommendation');
    const createKey = idempotency(), createBody = { taskVersionId: fixture.taskVersionId };
    let run = expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'create BA preview');
    const id = run.runId; assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.equal(run.runMode, 'REVIEW_PREVIEW'); assert.equal(run.majorCode, 'BUSINESS_ANALYTICS');
    assert.equal(expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'create replay').runId, id);
    expect(await foreign.call(`${routes}/${id}`), 404, 'foreign run');
    expect(await client.call(`${routes}/${id}/start`, { method: 'POST', body: { expectedRevision: run.revision }, headers: idempotency(), csrf: false }), 403, 'CSRF');
    expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }, { ...idempotency(), Origin: 'https://untrusted.invalid' }), 403, 'exact Origin');
    assert.deepEqual(expect(await client.call(routes), 200, 'own runs').map(value => value.runId), [id]);
    assert.deepEqual(expect(await foreign.call(routes), 200, 'foreign own list'), []);
    const refresh = async () => expect(await client.call(`${routes}/${id}`), 200, 'refresh run');
    run = expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }), 200, 'start BA');
    const task = expect(await client.call(`${routes}/${id}/task`), 200, 'public v4 manifest');
    assert.equal(task.schemaVersion, 'task-manifest-v4'); assert.deepEqual(task.steps.map(step => step.stepKey), Object.keys(fixture.responses));
    assert.deepEqual(task.operations.find(op => op.operationKey === 'ba-funnel').ownResponseBindings, []);
    assert.ok(task.operations.every(op => op.maxEvaluations === 30 && !Object.hasOwn(op, 'datasetAssetKey')));
    for (const asset of manifest.assets) {
      const path = `${routes}/${id}/task/assets/${asset.assetKey}`;
      if (asset.visibility === 'PRIVATE') {
        assert.ok(!JSON.stringify(task).includes(asset.path) && !JSON.stringify(task).includes(asset.sha256) && !JSON.stringify(task).includes(asset.assetKey));
        expect(await client.call(path), 404, 'private asset denied');
      } else {
        const response = await client.call(path); assert.equal(response.status, 200);
        assert.equal(response.headers.get('X-Content-SHA256'), asset.sha256);
        assert.equal(response.text, readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8'));
        expect(await foreign.call(path), 404, 'public asset is still run owner gated');
      }
    }
    checks.push('real identity/CSRF/Origin/ownership, public v4/empty own binding, exact JSON/CSV/hash and no private provenance');
    const revisions = new Map(task.steps.map(step => [step.stepKey, 0])), answers = new Map();
    const save = async (step, response) => {
      const saved = expect(await client.call(`${routes}/${id}/steps/${step}/response`, { method: 'PUT', body: { expectedRevision: revisions.get(step), responseSchemaVersion: fixture.responseSchemaVersion, response } }), 200, `save ${step}`);
      revisions.set(step, saved.revision); answers.set(step, response); return saved;
    };
    const readStep = async step => expect(await client.call(`${routes}/${id}/steps/${step}`), 200, `read ${step}`);
    const completeRequest = (step, extra = {}, headers = idempotency()) => post(client, `${routes}/${id}/steps/${step}/complete`, { expectedRevision: revisions.get(step), ...extra }, headers);
    const complete = async (step, extra = {}) => expect(await completeRequest(step, extra), 200, `complete ${step}`);
    const sourceVector = operation => Object.fromEntries(operation.inputBindings.map(b => [b.sourceStepKey, revisions.get(b.sourceStepKey)]));
    const params = operation => Object.fromEntries([
      ...operation.ownResponseBindings.map(b => [b.parameterKey, answers.get(operation.stepKey)[b.sourceField]]),
      ...operation.inputBindings.map(b => [b.parameterKey, answers.get(b.sourceStepKey)[b.sourceField]]),
    ]);
    let nextExecutionAt = 0;
    const executeRequest = async (key, extra = {}, headers = idempotency()) => {
      const delay = Math.max(0, nextExecutionAt - Date.now()); if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      nextExecutionAt = Date.now() + 2100; // The independent 30/min rate limit remains intact.
      const operation = manifest.operations.find(op => op.operationKey === key);
      return post(client, `${routes}/${id}/executions`, { operationKey: key, inputRevision: revisions.get(operation.stepKey), parameters: {}, expectedSourceRevisions: sourceVector(operation), ...extra }, headers);
    };
    const execute = async key => {
      const operation = manifest.operations.find(op => op.operationKey === key), result = expect(await executeRequest(key), 200, `execute ${key}`);
      assert.equal(result.trustLevel, 'SERVER_VERIFIED'); assert.deepEqual(result.appliedSourceRevisions, sourceVector(operation));
      assert.deepEqual(result.result, calculateBa(key, rows, params(operation), { datasetSha256: dataset.sha256 }), 'Actual Java HTTP result must match deterministic JS');
      return result;
    };
    await save('b1-context', fixture.responses['b1-context']); await complete('b1-context');
    await save('b2-metric', fixture.responses['b2-metric']);
    expect(await executeRequest('ba-metric', { expectedSourceRevisions: undefined }), 422, 'v4 source map required');
    expect(await executeRequest('ba-metric', { expectedSourceRevisions: { 'b1-context': 1 } }), 409, 'only consumed ancestors', 'EXECUTION_REVISION_STALE');
    expect(await executeRequest('ba-metric', { parameters: metric }), 422, 'server saved params authority', 'EXECUTION_NOT_ALLOWED');
    const firstMetric = await execute('ba-metric'); assert.equal(firstMetric.remainingEvaluations, 29);
    assert.equal(firstMetric.result.baseline.denominatorCount, 180); assert.equal(firstMetric.result.comparison.denominatorCount, 179);
    const forged = structuredClone(firstMetric.result); forged.comparison.numeratorCount = 179;
    expect(await executeRequest('ba-metric', { observedResult: forged }), 422, 'forged observed result', 'EXECUTION_RESULT_MISMATCH');
    await complete('b2-metric');
    await save('b3-funnel', {}); const firstFunnel = await execute('ba-funnel');
    assert.equal(firstFunnel.remainingEvaluations, 29); assert.equal(firstFunnel.result.stages.length, 6); assert.equal(firstFunnel.result.transitions.length, 5);
    expect(await completeRequest('b3-funnel'), 422, 'can calculate empty own draft but must choose/justify before completion');
    await save('b3-funnel', fixture.responses['b3-funnel']);
    assert.equal((await execute('ba-funnel')).executionId, firstFunnel.executionId); await complete('b3-funnel');
    await save('b4-segment', { segmentBy: 'course_track' }); const firstSegments = await execute('ba-segments');
    expect(await completeRequest('b4-segment'), 422, 'priority reasoning not prefilled');
    await save('b4-segment', fixture.responses['b4-segment']);
    assert.equal((await execute('ba-segments')).executionId, firstSegments.executionId); await complete('b4-segment');
    const oldFunnelSources = sourceVector(manifest.operations.find(op => op.operationKey === 'ba-funnel'));
    const invalidated = await save('b2-metric', { ...fixture.responses['b2-metric'], denominator: 'first_lesson_count' });
    assert.deepEqual(invalidated.invalidatedStepKeys, ['b2-metric', 'b3-funnel', 'b4-segment', 'b5-hypothesis', 'b6-action']);
    const conditional = await execute('ba-metric'); assert.equal(conditional.remainingEvaluations, 28);
    assert.equal(conditional.result.baseline.denominatorCount, 166); assert.equal(conditional.result.comparison.denominatorCount, 142);
    await complete('b2-metric');
    expect(await executeRequest('ba-funnel', { expectedSourceRevisions: oldFunnelSources }), 409, 'same-window changed saved source', 'EXECUTION_REVISION_STALE');
    const rebound = await execute('ba-funnel'); assert.equal(rebound.executionId, firstFunnel.executionId); assert.equal(rebound.reused, true);
    assert.notDeepEqual(rebound.appliedSourceRevisions, rebound.sourceRevisions); await complete('b3-funnel');
    await save('b4-segment', { ...fixture.responses['b4-segment'], segmentBy: 'signup_source' });
    await execute('ba-segments'); expect(await completeRequest('b4-segment'), 422, 'old course priority invalid in source dimension');
    await save('b4-segment', { ...fixture.responses['b4-segment'], segmentBy: 'signup_source', prioritySegmentKey: 'ORGANIC' });
    await execute('ba-segments'); await complete('b4-segment');
    await save('b2-metric', { ...fixture.responses['b2-metric'], comparisonStartWeek: 6 });
    expect(await executeRequest('ba-metric'), 422, 'overlapping/unequal windows denied');
    for (let index = 0; index < configs.length; index++) {
      await save('b2-metric', { ...fixture.responses['b2-metric'], ...configs[index] });
      if (index < 30) {
        const result = await execute('ba-metric'); assert.equal(result.remainingEvaluations, index < 2 ? 28 : 29 - index);
        assert.equal(result.reused, index < 2);
      } else expect(await executeRequest('ba-metric'), 429, '31st distinct successful config denied', 'EVALUATION_LIMIT_REACHED');
    }
    await save('b2-metric', fixture.responses['b2-metric']); const exhaustedReuse = await execute('ba-metric');
    assert.equal(exhaustedReuse.remainingEvaluations, 0); assert.equal(exhaustedReuse.reused, true); assert.equal(exhaustedReuse.executionId, firstMetric.executionId);
    await complete('b2-metric'); await execute('ba-funnel'); await complete('b3-funnel');
    await save('b4-segment', fixture.responses['b4-segment']); await execute('ba-segments'); await complete('b4-segment');
    await save('b5-hypothesis', fixture.responses['b5-hypothesis']); await complete('b5-hypothesis');
    await save('b6-action', fixture.responses['b6-action']);
    const context = (await readStep('b6-action')).baActionContext;
    assert.ok(schemas.BaActionContext(context)); assert.equal(context.prioritySegmentKey, 'APPLIED');
    assert.deepEqual(context.comparison, firstSegments.result.segments.find(group => group.segmentKey === 'APPLIED').comparison);
    expect(await completeRequest('b6-action'), 422, 'B6 explicit source confirmation required', 'STEP_VALIDATION_FAILED');
    expect(await completeRequest('b6-action', { expectedSourceRevisions: { 'b2-metric': revisions.get('b2-metric') } }), 422, 'B6 exact source set required', 'STEP_VALIDATION_FAILED');
    await save('b4-segment', { ...fixture.responses['b4-segment'], priorityReason: fixture.responses['b4-segment'].priorityReason + ' 重新核对来源版本。' });
    await execute('ba-segments'); await complete('b4-segment'); await complete('b5-hypothesis');
    expect(await completeRequest('b6-action', { expectedSourceRevisions: context.sourceRevisions }), 409, 'other tab recompleted same group but new source', 'STEP_SOURCE_REVISION_CONFLICT');
    const confirmed = (await readStep('b6-action')).baActionContext;
    assert.notDeepEqual(confirmed.sourceRevisions, context.sourceRevisions);
    for (const invalid of [
      { targetSegmentKey: 'FOUNDATIONS' }, { successMetric: 'STARTER_COMPLETION_RATE' },
      { targetChangePercentagePoints: 100 },
    ]) {
      await save('b6-action', { ...fixture.responses['b6-action'], ...invalid });
      expect(await completeRequest('b6-action', { expectedSourceRevisions: confirmed.sourceRevisions }), 422, 'B6 context/denominator/target rules', 'BA_ACTION_INVALID');
    }
    await save('b6-action', { ...fixture.responses['b6-action'], reviewAfterDays: 42, guardrailMaximum: 200 });
    const completeKey = idempotency(), completion = { expectedSourceRevisions: confirmed.sourceRevisions };
    run = expect(await completeRequest('b6-action', completion, completeKey), 200, 'B6 source-confirmed action');
    assert.equal(expect(await completeRequest('b6-action', completion, completeKey), 200, 'B6 complete receipt replay').runId, id);
    expect(await completeRequest('b6-action', { expectedSourceRevisions: context.sourceRevisions }, completeKey), 409, 'same key different vector');
    const runSql = `SELECT id FROM mp_experience_run WHERE public_id='${id}'`;
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_execution_record WHERE experience_run_id IN (${runSql}) AND operation_key='ba-metric' AND status='SUCCEEDED' AND counts_against_quota=TRUE;`), 30);
    checks.push('B1-B6 exact Java/JS, empty own B3 draft, denominator/windows/groups, 30/31 successful configs and free reuse; B6 current context/old source CAS/action units');
    const hint = expect(await post(client, `${routes}/${id}/hints`, { stepKey: 'b6-action', hintLevel: 1 }), 200, 'static BA hint');
    assert.equal(hint.status, 'FALLBACK'); expect(await client.call(`${routes}/${id}/hints/${hint.hintId}`), 200, 'own hint'); expect(await foreign.call(`${routes}/${id}/hints/${hint.hintId}`), 404, 'foreign hint');
    run = expect(await post(client, `${routes}/${id}/task-completion`, { expectedRevision: run.revision }), 200, 'independent reflection');
    let reflection = expect(await client.call(`${routes}/${id}/reflection`), 200, 'reflection');
    const reflectionBody = { ...fixture.reflection, expectedRevision: reflection.revision };
    reflection = expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: reflectionBody }), 200, 'save reflection');
    expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: reflectionBody }), 409, 'reflection CAS');
    const follow = expect(await post(client, `${routes}/${id}/reflection/follow-up`, { expectedRevision: reflection.revision }), 200, 'AI-off optional follow-up');
    assert.equal(follow.canSkip, true); assert.equal(follow.status, 'FAILED');
    run = await refresh(); run = expect(await post(client, `${routes}/${id}/pause`, { expectedRevision: run.revision }), 200, 'pause reflection');
    assert.equal(run.pausedFromStatus, 'TASK_COMPLETED'); run = expect(await post(client, `${routes}/${id}/resume`, { expectedRevision: run.revision }), 200, 'resume reflection');
    const closeKey = idempotency(), closeBody = { ...fixture.reflection, expectedRevision: reflection.revision };
    run = expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close BA preview');
    assert.equal(run.status, 'CLOSED'); assert.equal(run.reportStatus, 'NOT_APPLICABLE');
    assert.equal(expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close replay').runId, id);
    const deadline = Date.now() + 55000;
    const ready = () => scalar(`SELECT COUNT(*) FROM mp_evidence_snapshot WHERE experience_run_id IN (${runSql}) AND status='READY';`);
    while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(ready(), 1, 'durable BA evidence ready');
    const frozen = JSON.parse(mysqlCommand(`USE majorpilot; SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id='${id}';`).trim());
    assert.equal(frozen.schemaVersion, 'closed-input-v3'); assert.equal(frozen.evidenceRuleVersion, 'ba-evidence-v2'); assert.equal(frozen.steps.length, 6); assert.equal(frozen.executions.length, 3);
    const evidence = mysqlCommand(`USE majorpilot; SELECT JSON_OBJECT('type',e.evidence_type,'claims',e.allowed_claim_types_json,'value',e.structured_value_json,'rule',e.rule_version) FROM mp_evidence_item e JOIN mp_evidence_snapshot s ON s.id=e.evidence_snapshot_id WHERE s.experience_run_id IN (${runSql}) AND s.status='READY' ORDER BY e.id;`).trim().split('\n').filter(Boolean).map(JSON.parse);
    const analysis = evidence.filter(item => item.type === 'STUDENT_ANALYSIS');
    assert.equal(analysis.length, 6, 'Every BA step retains its student-authored analysis separately');
    assert.ok(analysis.every(item => item.claims.length === 0 && item.value.verificationStatus === 'UNVERIFIED'));
    assert.ok(evidence.every(item => item.rule === frozen.evidenceRuleVersion)); assert.equal(evidence.filter(item => item.type === 'VERIFIED_EXECUTION').length, 3);
    const analysisFields = ['businessQuestion', 'decisionScope', 'metricReason', 'focusReason', 'priorityReason', 'observation', 'evidenceStepKey', 'hypothesis', 'unknownInformation', 'actionKey', 'actionDescription', 'actionReason', 'targetSegmentKey', 'successMetric', 'targetChangePercentagePoints', 'guardrailMetric', 'guardrailMaximum', 'reviewAfterDays', 'testPlan'];
    assert.ok(evidence.filter(item => item.type === 'STEP_RESPONSE').every(item => analysisFields.every(key => !(key in item.value))));
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report WHERE experience_run_id IN (${runSql});`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_recommendation WHERE source_run_id IN (${runSql});`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_ai_call WHERE experience_run_id IN (${runSql}) AND (http_attempts IS NULL OR http_attempts<>0);`), 0);
    const dashboard = expect(await client.call('/api/app/v1/dashboard'), 200, 'formal dashboard');
    assert.ok(dashboard.majors.every(major => major.status === 'NOT_STARTED' && major.availability === 'UNAVAILABLE'));
    checks.push('Reflection CAS/pause/close; newly frozen ba-evidence-v2 with three verified calculations, unverified goals/claims[] and no formal report/NEXT/paid calls');
    const admin = '/api/admin/v1/majorpilot';
    expect(await client.call(`${admin}/task-versions`), 401, 'operator list denied');
    expect(await post(client, `${admin}/task-versions/validate`, { manifestPath: 'ba-learning/1.0.0/manifest.json' }), 401, 'operator validate denied');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/publish`, { expectedRevision: 0, reviewChecks: {}, reasonText: 'Synthetic denial; not human review.' }), 401, 'publish denied');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/retire`, { expectedRevision: 0, reasonText: 'Synthetic denial; no lifecycle mutation.' }), 401, 'retire denied');
    expect(await post(client, `${admin}/experience-runs/${id}/recovery-runs`, { expectedRevision: run.revision, reasonCode: 'TECHNICAL_FAILURE', reasonText: 'Synthetic denial; no recovery mutation.' }), 401, 'recovery denied');
    assert.deepEqual([...verified.keys()].sort(), operations.map(op => op.id).sort());
  } catch (error) { failure = error; }
  finally { try { await scope.cleanup(); } catch (cleanupError) { failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and exact fixture cleanup failed; values suppressed') : cleanupError; } }
  if (failure) throw failure;
  console.log(JSON.stringify({ result: 'PASS', scope: 'P5 actual local HTTP/MySQL; not human content review or timing', checks, responseContractsVerified: verified.size, operationStatuses: Object.fromEntries([...verified].map(([id, statuses]) => [id, [...statuses].sort()])), denialOnlyOperations: [...verified].filter(([, statuses]) => ![...statuses].some(status => status >= 200 && status < 300)).map(([id]) => id), fixtureAccounts: 2, fixtureCleanup: true, rateLimitsReset: false, paidCalls: 0 }, null, 2));
}
