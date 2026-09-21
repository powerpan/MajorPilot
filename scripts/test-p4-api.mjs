import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixtureScope, LocalClient, expect, idempotency } from './lib/local-student-fixture.mjs';
import { loadP4Contracts } from '../contracts/check-p4.mjs';
import { calculateDs, normalizeParameters, NUMERIC_FIELDS, GROUPS } from '../shared/ds/ds-stats-v1.mjs';
import { mysqlCommand } from './infra.mjs';
import { readLocalEnv } from './env.mjs';

// Static preflight uses no environment, account, database or HTTP. The live path
// uses real local auth, never publishes REVIEW, never resets limits or calls AI.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'));
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fixture = json('../contracts/examples/p4-ds-run.json');
const manifest = json('../content/ds-learning/1.0.0/manifest.json');
const dataset = manifest.assets.find(a => a.assetKey === 'learner-activity');
const rows = json(`../content/${dataset.path}`);
const { original, operations, ajv, schemas } = await loadP4Contracts();
const routes = '/api/app/v1/experience-runs';
const cleanKeys = ['duplicatePolicy', 'missingPolicy', 'extremePolicy'];
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const initialClean = pick(fixture.responses['d2-quality'], cleanKeys);
const relationshipKeys = ['relationshipMode', 'groupBy', 'xField', 'yField'];
const relationVariants = [
  pick(fixture.responses['d4-relationship'], relationshipKeys),
  ...Object.keys(GROUPS).map(groupBy => ({ relationshipMode: 'GROUP_COMPLETION', groupBy })),
  ...NUMERIC_FIELDS.flatMap(xField => NUMERIC_FIELDS.filter(yField => yField !== xField).map(yField => ({ relationshipMode: 'SCATTER', xField, yField }))),
].filter((value, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(value)) === index);
const cleaningVariants = [initialClean, { ...initialClean, extremePolicy: 'CAP_P95' }, { ...initialClean, missingPolicy: 'DROP_MISSING' }];
const configurations = cleaningVariants.flatMap(cleaning => relationVariants.map(relation => ({ cleaning, relation }))).slice(0, 31);
assert.equal(configurations.length, 31);
assert.equal(new Set(configurations.map(({ cleaning, relation }) => JSON.stringify(normalizeParameters('ds-relationship', { ...cleaning, ...relation })))).size, 31);
assert.equal(fixture.taskVersionId, manifest.taskVersionId);
for (const step of manifest.steps) assert.ok(ajv.compile(step.inputSchema)(fixture.responses[step.stepKey]), `Invalid synthetic fixture: ${step.stepKey}`);
assert.ok(ajv.compile(manifest.reflection.inputSchema)(fixture.reflection.answers));
assert.ok(schemas.ExecuteDS({ operationKey: 'ds-quality-clean', inputRevision: 1, parameters: {}, expectedSourceRevisions: {} }));
for (const asset of manifest.assets.filter(a => a.visibility === 'PUBLIC')) {
  const shape = original.paths['/api/app/v1/experience-runs/{id}/task/assets/{assetKey}'].get.responses['200'].content[asset.mediaType].schema;
  const body = readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8');
  assert.ok(ajv.compile(shape)(asset.mediaType === 'application/json' ? JSON.parse(body) : body));
}
if (args.includes('--check')) console.log(JSON.stringify({ result: 'PASS', scope: 'P4 static acceptance preflight', steps: manifest.steps.length, plannedDistinctRelationshipConfigs: 31, accountsCreated: 0, liveHttpVerified: false, paidCalls: 0 }, null, 2));
else await runAcceptance();

async function runAcceptance() {
  const env = readLocalEnv();
  assert.equal(env.MP_EXPERIENCE_AI_ENABLED, 'false');
  assert.equal(env.MP_CONTENT_PREVIEW_ENABLED, 'true');
  const scope = createFixtureScope('p4-api'), verified = new Map(), checks = [];
  const instrument = client => {
    const originalCall = client.call.bind(client);
    client.call = async (path, options = {}) => {
      const pieces = path.split('/'), method = (options.method || 'GET').toLowerCase();
      const op = operations.find(o => o.method === method && o.path.split('/').length === pieces.length && o.path.split('/').every((part, i) => part.startsWith('{') || part === pieces[i]));
      if (op?.request) assert.ok(op.request(options.body), `${op.id}: request contract rejected (payload suppressed)`);
      const response = await originalCall(path, options);
      if (op) {
        let validate = op.responses[String(response.status)] || op.responses.default;
        let value = response.body;
        if (op.id === 'getPublicTaskAsset' && response.status === 200 && !response.headers.get('content-type')?.startsWith('application/json')) {
          const media = response.headers.get('content-type').split(';')[0];
          const shape = original.paths[op.path][method].responses['200'].content[media]?.schema;
          assert.ok(shape, 'Undeclared asset media type'); validate = ajv.compile(shape); value = response.text;
        }
        assert.ok(validate && validate(value), `${op.id}: HTTP ${response.status} response contract rejected: ${JSON.stringify(validate?.errors?.map(e => ({ path: e.instancePath, keyword: e.keyword })))}`);
        if (!verified.has(op.id)) verified.set(op.id, new Set());
        verified.get(op.id).add(response.status);
      }
      return response;
    };
    return client;
  };
  const post = (client, path, body, headers = idempotency()) => client.call(path, { method: 'POST', body, headers });
  const scalar = sql => Number(mysqlCommand(`USE majorpilot; ${sql}`).trim());
  let failure;
  try {
    expect(await instrument(new LocalClient()).call('/api/app/v1/review-preview-tasks'), 401, 'anonymous preview forbidden');
    const primary = await scope.student(), other = await scope.student();
    const client = instrument(primary.client), foreign = instrument(other.client);
    const previews = expect(await client.call('/api/app/v1/review-preview-tasks'), 200, 'preview catalog');
    assert.equal(previews.find(p => p.taskVersionId === fixture.taskVersionId)?.majorCode, 'DATA_SCIENCE');
    expect(await client.call('/api/app/v1/demo-tasks'), env.MP_P2_DEMO_ENABLED === 'true' ? 200 : 404, 'independent demo gate');
    expect(await post(client, routes, { decisionId: fixture.taskVersionId }), 404, 'content ID is not formal decision');
    const createKey = idempotency(), createBody = { taskVersionId: fixture.taskVersionId };
    let run = expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'create DS preview');
    const id = run.runId; assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.equal(run.runMode, 'REVIEW_PREVIEW'); assert.equal(run.majorCode, 'DATA_SCIENCE');
    assert.equal(expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'create replay').runId, id);
    expect(await foreign.call(`${routes}/${id}`), 404, 'cross-owner run denied');
    expect(await client.call(`${routes}/${id}/start`, { method: 'POST', body: { expectedRevision: run.revision }, headers: idempotency(), csrf: false }), 403, 'CSRF required');
    expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }, { ...idempotency(), Origin: 'https://untrusted.invalid' }), 403, 'exact Origin required');
    assert.deepEqual(expect(await client.call(routes), 200, 'own run list').map(r => r.runId), [id]);
    assert.deepEqual(expect(await foreign.call(routes), 200, 'other run list'), []);
    const refresh = async () => expect(await client.call(`${routes}/${id}`), 200, 'refresh run');
    run = expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }), 200, 'start DS');
    const task = expect(await client.call(`${routes}/${id}/task`), 200, 'public v3 manifest');
    assert.equal(task.schemaVersion, 'task-manifest-v3');
    assert.deepEqual(task.steps.map(s => s.stepKey), Object.keys(fixture.responses));
    assert.ok(task.operations.every(op => op.maxEvaluations === 30 && op.ownResponseBindings.length > 0 && !Object.hasOwn(op, 'datasetAssetKey')));
    for (const asset of manifest.assets) {
      const path = `${routes}/${id}/task/assets/${asset.assetKey}`;
      if (asset.visibility === 'PRIVATE') {
        assert.ok(!JSON.stringify(task).includes(asset.path) && !JSON.stringify(task).includes(asset.sha256) && !JSON.stringify(task).includes(asset.assetKey));
        expect(await client.call(path), 404, 'private asset inaccessible');
      } else {
        const response = await client.call(path);
        assert.equal(response.status, 200); assert.equal(response.headers.get('X-Content-SHA256'), asset.sha256);
        assert.equal(response.text, readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8'));
        expect(await foreign.call(path), 404, 'public task asset still owner gated');
      }
    }
    checks.push('v3 projection, real identities, CSRF/Origin, public JSON/CSV hash equality and private asset denial');
    const revisions = new Map(task.steps.map(s => [s.stepKey, 0])), answers = new Map();
    const save = async (step, response) => {
      const saved = expect(await client.call(`${routes}/${id}/steps/${step}/response`, { method: 'PUT', body: { expectedRevision: revisions.get(step), responseSchemaVersion: fixture.responseSchemaVersion, response } }), 200, `save ${step}`);
      revisions.set(step, saved.revision); answers.set(step, response); return saved;
    };
    const readStep = async step => expect(await client.call(`${routes}/${id}/steps/${step}`), 200, `read ${step}`);
    const complete = async step => expect(await post(client, `${routes}/${id}/steps/${step}/complete`, { expectedRevision: revisions.get(step) }), 200, `complete ${step}`);
    const sourceVector = operation => Object.fromEntries(operation.inputBindings.map(b => [b.sourceStepKey, revisions.get(b.sourceStepKey)]));
    const boundParams = operation => {
      const value = {};
      for (const b of operation.ownResponseBindings) if (Object.hasOwn(answers.get(operation.stepKey), b.sourceField)) value[b.parameterKey] = answers.get(operation.stepKey)[b.sourceField];
      for (const b of operation.inputBindings) if (Object.hasOwn(answers.get(b.sourceStepKey), b.sourceField)) value[b.parameterKey] = answers.get(b.sourceStepKey)[b.sourceField];
      return value;
    };
    // Independent request rate limit is 30/min/student; do not confuse this
    // with the per-operation successful unique configuration quota.
    let nextExecutionAt = 0;
    const executeRequest = async (key, extra = {}) => {
      const delay = Math.max(0, nextExecutionAt - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      nextExecutionAt = Date.now() + 2100;
      const operation = manifest.operations.find(o => o.operationKey === key);
      return post(client, `${routes}/${id}/executions`, { operationKey: key, inputRevision: revisions.get(operation.stepKey), parameters: {}, expectedSourceRevisions: sourceVector(operation), ...extra });
    };
    const execute = async key => {
      const operation = manifest.operations.find(o => o.operationKey === key);
      const result = expect(await executeRequest(key), 200, `execute ${key}`);
      assert.equal(result.trustLevel, 'SERVER_VERIFIED');
      assert.deepEqual(result.appliedSourceRevisions, sourceVector(operation));
      assert.deepEqual(result.result, await calculateDs(key, rows, boundParams(operation), { datasetSha256: dataset.sha256 }), 'HTTP Java result must equal deterministic JS for actual bound parameters');
      return result;
    };
    await save('d1-context', fixture.responses['d1-context']); await complete('d1-context');
    await save('d2-quality', fixture.responses['d2-quality']);
    expect(await executeRequest('ds-quality-clean', { expectedSourceRevisions: undefined }), 422, 'v3 expected source vector required', 'VALIDATION_ERROR');
    expect(await executeRequest('ds-quality-clean', { expectedSourceRevisions: { 'd1-context': 1 } }), 409, 'only actually consumed ancestors permitted', 'EXECUTION_REVISION_STALE');
    expect(await executeRequest('ds-quality-clean', { parameters: initialClean }), 422, 'client cannot inject saved parameters', 'EXECUTION_NOT_ALLOWED');
    const quality = await execute('ds-quality-clean');
    assert.equal(quality.remainingEvaluations, 29); assert.equal(quality.reused, false);
    assert.equal(quality.result.retainedRows, 359); assert.equal(quality.result.quality.removedDuplicateRows, 1);
    const forged = structuredClone(quality.result); forged.retainedRows = 0;
    expect(await executeRequest('ds-quality-clean', { observedResult: forged }), 422, 'forged browser result denied', 'EXECUTION_RESULT_MISMATCH');
    await complete('d2-quality');
    await save('d3-profile', fixture.responses['d3-profile']);
    await execute('ds-profile'); await complete('d3-profile');
    await save('d4-relationship', fixture.responses['d4-relationship']);
    const firstRelationship = await execute('ds-relationship'); assert.equal(firstRelationship.remainingEvaluations, 29);
    await complete('d4-relationship');
    await save('d5-stratify', fixture.responses['d5-stratify']);
    const firstStratify = await execute('ds-stratify');
    assert.ok(firstStratify.result.stratified.strata.every(s => !Object.hasOwn(s.summary, 'points')));
    await complete('d5-stratify');
    const oldSource = sourceVector(manifest.operations.find(o => o.operationKey === 'ds-relationship'));
    const invalidated = await save('d2-quality', fixture.responses['d2-quality']);
    assert.ok(['d2-quality', 'd3-profile', 'd4-relationship', 'd5-stratify', 'd6-conclusion'].every(k => invalidated.invalidatedStepKeys.includes(k)));
    await execute('ds-quality-clean'); await complete('d2-quality');
    await execute('ds-profile'); await complete('d3-profile');
    expect(await executeRequest('ds-relationship', { expectedSourceRevisions: oldSource }), 409, 'request arrival source CAS', 'EXECUTION_REVISION_STALE');
    assert.ok((await readStep('d4-relationship')).executions.every(e => e.appliedToRevision === null), 'old ancestor results are historical only');
    const rebound = await execute('ds-relationship');
    assert.equal(rebound.executionId, firstRelationship.executionId); assert.equal(rebound.reused, true);
    assert.notDeepEqual(rebound.appliedSourceRevisions, rebound.sourceRevisions);
    await save('d4-relationship', { ...fixture.groupAlternative, xField: 'avg_session_minutes' });
    expect(await executeRequest('ds-relationship'), 422, 'inactive branch field rejected');
    expect(await post(client, `${routes}/${id}/steps/d4-relationship/complete`, { expectedRevision: revisions.get('d4-relationship') }), 422, 'completion shares branch validation');
    await save('d4-relationship', { ...fixture.responses['d4-relationship'], yField: fixture.responses['d4-relationship'].xField });
    expect(await executeRequest('ds-relationship'), 422, 'identical axes rejected');
    let currentClean = initialClean, lastSuccess;
    for (let i = 0; i < configurations.length; i++) {
      const { cleaning, relation } = configurations[i];
      if (JSON.stringify(cleaning) !== JSON.stringify(currentClean)) {
        await save('d2-quality', { ...fixture.responses['d2-quality'], ...cleaning });
        await execute('ds-quality-clean'); await complete('d2-quality');
        await execute('ds-profile'); await complete('d3-profile'); currentClean = cleaning;
      }
      await save('d4-relationship', { ...relation, observation: fixture.responses['d4-relationship'].observation });
      if (i < 30) {
        lastSuccess = await execute('ds-relationship');
        assert.equal(lastSuccess.remainingEvaluations, 29 - i);
        assert.equal(lastSuccess.reused, i === 0);
      } else expect(await executeRequest('ds-relationship'), 429, '31st successful unique configuration is blocked', 'EVALUATION_LIMIT_REACHED');
    }
    await save('d2-quality', fixture.responses['d2-quality']);
    await execute('ds-quality-clean'); await complete('d2-quality');
    await execute('ds-profile'); await complete('d3-profile');
    await save('d4-relationship', { observation: fixture.responses['d4-relationship'].observation, ...Object.fromEntries(Object.entries(configurations[0].relation).reverse()) });
    const free = await execute('ds-relationship'); assert.equal(free.reused, true); assert.equal(free.remainingEvaluations, 0); assert.equal(free.executionId, firstRelationship.executionId);
    await complete('d4-relationship');
    await execute('ds-stratify'); await complete('d5-stratify');
    await save('d6-conclusion', fixture.responses['d6-conclusion']); run = await complete('d6-conclusion');
    const runSql = `SELECT id FROM mp_experience_run WHERE public_id='${id}'`;
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_execution_record WHERE experience_run_id IN (${runSql}) AND operation_key='ds-relationship' AND status='SUCCEEDED' AND counts_against_quota=TRUE;`), 30);
    checks.push('D1-D6 exact JS/Java results, current/ancestor bindings, stale source denial, invalid branch and equal-axis denial, 30-success quota and free reuse after exhaustion');
    const hint = expect(await post(client, `${routes}/${id}/hints`, { stepKey: 'd5-stratify', hintLevel: 1 }), 200, 'static DS hint');
    assert.equal(hint.status, 'FALLBACK');
    expect(await client.call(`${routes}/${id}/hints/${hint.hintId}`), 200, 'own hint');
    expect(await foreign.call(`${routes}/${id}/hints/${hint.hintId}`), 404, 'foreign hint denied');
    run = expect(await post(client, `${routes}/${id}/task-completion`, { expectedRevision: run.revision }), 200, 'independent reflection');
    let reflection = expect(await client.call(`${routes}/${id}/reflection`), 200, 'reflection definition');
    const saveReflection = { ...fixture.reflection, expectedRevision: reflection.revision };
    reflection = expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: saveReflection }), 200, 'save reflection');
    expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: saveReflection }), 409, 'reflection CAS');
    const follow = expect(await post(client, `${routes}/${id}/reflection/follow-up`, { expectedRevision: reflection.revision }), 200, 'optional AI-off follow-up');
    assert.equal(follow.canSkip, true); assert.equal(follow.status, 'FAILED');
    run = await refresh();
    run = expect(await post(client, `${routes}/${id}/pause`, { expectedRevision: run.revision }), 200, 'pause reflection');
    assert.equal(run.pausedFromStatus, 'TASK_COMPLETED');
    run = expect(await post(client, `${routes}/${id}/resume`, { expectedRevision: run.revision }), 200, 'resume reflection');
    const closeKey = idempotency(), closeBody = { ...fixture.reflection, expectedRevision: reflection.revision };
    run = expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close DS preview');
    assert.equal(run.status, 'CLOSED'); assert.equal(run.reportStatus, 'NOT_APPLICABLE');
    assert.equal(expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close replay').runId, id);
    const deadline = Date.now() + 55000;
    const ready = () => scalar(`SELECT COUNT(*) FROM mp_evidence_snapshot WHERE experience_run_id IN (${runSql}) AND status='READY';`);
    while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(ready(), 1, 'durable DS evidence must be READY');
    const frozen = JSON.parse(mysqlCommand(`USE majorpilot; SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id='${id}';`).trim());
    assert.equal(frozen.schemaVersion, 'closed-input-v3'); assert.equal(frozen.evidenceRuleVersion, 'ds-evidence-v2');
    assert.equal(frozen.steps.length, 6); assert.equal(frozen.executions.length, 4);
    const evidence = mysqlCommand(`USE majorpilot; SELECT JSON_OBJECT('type',e.evidence_type,'claims',e.allowed_claim_types_json,'value',e.structured_value_json,'rule',e.rule_version) FROM mp_evidence_item e JOIN mp_evidence_snapshot s ON s.id=e.evidence_snapshot_id WHERE s.experience_run_id IN (${runSql}) AND s.status='READY' ORDER BY e.id;`).trim().split('\n').filter(Boolean).map(JSON.parse);
    const analysis = evidence.filter(e => e.type === 'STUDENT_ANALYSIS');
    assert.equal(analysis.length, 5);
    assert.ok(analysis.every(e => e.claims.length === 0 && e.value.verificationStatus === 'UNVERIFIED'));
    assert.ok(evidence.every(e => e.rule === frozen.evidenceRuleVersion));
    assert.equal(evidence.filter(e => e.type === 'VERIFIED_EXECUTION').length, 4);
    const analysisFields = ['duplicateReason', 'missingReason', 'sampleInterpretation', 'observation', 'uncertaintyComment', 'findings', 'unsupportedCausalClaim', 'limitations', 'nextQuestion'];
    assert.ok(evidence.filter(e => e.type === 'STEP_RESPONSE').every(e => analysisFields.every(key => !(key in e.value))));
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report WHERE experience_run_id IN (${runSql});`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_recommendation WHERE source_run_id IN (${runSql});`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_ai_call WHERE experience_run_id IN (${runSql}) AND (http_attempts IS NULL OR http_attempts<>0);`), 0);
    const dashboard = expect(await client.call('/api/app/v1/dashboard'), 200, 'formal dashboard');
    assert.ok(dashboard.majors.every(m => m.status === 'NOT_STARTED' && m.availability === 'UNAVAILABLE'));
    checks.push('Reflection save/pause/close replay, DS frozen evidence rule, unverified analysis separated from computed facts, no formal report/NEXT and zero paid calls');
    const admin = '/api/admin/v1/majorpilot';
    expect(await client.call(`${admin}/task-versions`), 401, 'operator content list denied');
    expect(await post(client, `${admin}/task-versions/validate`, { manifestPath: 'ds-learning/1.0.0/manifest.json' }), 401, 'operator validate denied');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/publish`, { expectedRevision: 0, reviewChecks: {}, reasonText: 'Synthetic denial; not human review.' }), 401, 'operator publish denied');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/retire`, { expectedRevision: 0, reasonText: 'Synthetic denial; no lifecycle change.' }), 401, 'operator retire denied');
    expect(await post(client, `${admin}/experience-runs/${id}/recovery-runs`, { expectedRevision: run.revision, reasonCode: 'TECHNICAL_FAILURE', reasonText: 'Synthetic denial; no recovery mutation.' }), 401, 'operator recovery denied');
    assert.deepEqual([...verified.keys()].sort(), operations.map(op => op.id).sort());
  } catch (error) { failure = error; }
  finally {
    try { await scope.cleanup(); } catch (cleanupError) { failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and exact fixture cleanup failed; values suppressed') : cleanupError; }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ result: 'PASS', scope: 'P4 actual local HTTP/MySQL; not human content review or timing', checks, responseContractsVerified: verified.size, operationStatuses: Object.fromEntries([...verified].map(([id, statuses]) => [id, [...statuses].sort()])), denialOnlyOperations: [...verified].filter(([, statuses]) => ![...statuses].some(s => s >= 200 && s < 300)).map(([id]) => id), fixtureAccounts: 2, fixtureCleanup: true, rateLimitsReset: false, paidCalls: 0 }, null, 2));
}
