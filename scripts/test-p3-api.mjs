import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFixtureScope, LocalClient, expect, idempotency } from './lib/local-student-fixture.mjs';
import { loadP3Contracts } from '../contracts/check-p3.mjs';
import { normalizeConfig, isBaseline } from '../shared/classifier/classifier-v1.mjs';
import { mysqlCommand } from './infra.mjs';
import { readLocalEnv } from './env.mjs';

// --check only reads source/contracts: no environment, HTTP, account, or database
// access. The normal invocation is an explicitly authorized real local test.
// It never resets rate limits, calls a paid model, or publishes REVIEW content.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Only --check is supported');
const fixture = JSON.parse(readFileSync(new URL('../contracts/examples/p3-ai-run.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../content/ai-support/1.0.0/manifest.json', import.meta.url), 'utf8'));
const model = JSON.parse(readFileSync(new URL('../content/ai-support/1.0.0/classifier-model.json', import.meta.url), 'utf8'));
const { operations, ajv } = await loadP3Contracts();
const routes = '/api/app/v1/experience-runs';
const expectedOperations = [
  'listDemoTasks', 'listExperienceRuns', 'createExperienceRun', 'getExperienceRun',
  'startExperienceRun', 'pauseExperienceRun', 'resumeExperienceRun', 'getPinnedTask',
  'getPublicTaskAsset', 'getStep', 'saveStep', 'completeStep', 'completeTask',
  'executeOperation', 'requestHint', 'getHint', 'getReflection', 'saveReflection',
  'submitReflection', 'createRecoveryRun', 'listTaskVersions', 'validateTaskContent',
  'publishTaskContent', 'retireTaskContent', 'requestOptionalReflectionFollowUp',
  'listReviewPreviewTasks', 'createReviewPreviewRun',
];
assert.deepEqual(operations.map(o => o.id).sort(), [...expectedOperations].sort());
assert.equal(fixture.taskVersionId, manifest.taskVersionId);
for (const step of manifest.steps) {
  assert.equal(step.responseSchemaVersion, fixture.responseSchemaVersion);
  assert.ok(ajv.compile(step.inputSchema)(fixture.responses[step.stepKey]), `Invalid synthetic fixture: ${step.stepKey}`);
}
assert.ok(ajv.compile(manifest.reflection.inputSchema)(fixture.reflection.answers), 'Invalid reflection fixture');
const baseline = fixture.responses['a4-configure'];
const configurations = [
  { ...baseline, confidenceThreshold: 0.4 },
  { ...baseline, confidenceThreshold: 0.7 },
  { ...baseline, lowConfidencePolicy: 'AUTO_ROUTE' },
  { ...baseline, confidenceThreshold: 0.4, lowConfidencePolicy: 'AUTO_ROUTE' },
  { ...baseline, exampleIds: ['example-technical-1', 'example-concept-1'] },
  { ...baseline, exampleIds: ['example-schedule-1'] },
];
// Only the four declared parameters enter the model, never rationale/free text.
const parameters = response => Object.fromEntries(['definitionVariantIds', 'exampleIds', 'confidenceThreshold', 'lowConfidencePolicy'].map(key => [key, response[key]]));
assert.equal(isBaseline(model, parameters(baseline)), true);
assert.equal(new Set(configurations.map(c => JSON.stringify(normalizeConfig(model, parameters(c))))).size, 6);
configurations.forEach(c => {
  assert.equal(isBaseline(model, parameters(c)), false);
  assert.ok(ajv.compile(manifest.steps.find(s => s.stepKey === 'a4-configure').inputSchema)(c));
});
// The asset endpoint must describe arrays as well as JSON objects. This catches
// a v1-only contract before spending any real registration allowance.
const assetContract = operations.find(o => o.id === 'getPublicTaskAsset').responses['200'];
for (const asset of manifest.assets.filter(a => a.visibility === 'PUBLIC')) {
  const value = JSON.parse(readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8'));
  assert.ok(assetContract(value), `Public asset contract excludes ${asset.assetKey}`);
}
if (args.includes('--check')) {
  console.log(JSON.stringify({ result: 'PASS', scope: 'P3 acceptance script static preflight', plannedOperations: operations.length, fixtureSteps: manifest.steps.length, distinctNonBaselineConfigurations: configurations.length, liveHttpVerified: false, accountsCreated: 0, paidCalls: 0 }, null, 2));
} else {
  await runAcceptance();
}

async function runAcceptance() {
  const env = readLocalEnv();
  assert.equal(env.MP_EXPERIENCE_AI_ENABLED, 'false', 'Paid task AI must be explicitly off');
  assert.equal(env.MP_CONTENT_PREVIEW_ENABLED, 'true', 'Explicit local REVIEW preview must be on');
  const scope = createFixtureScope('p3-api');
  const verified = new Map(); const checks = [];
  const instrument = client => {
    const original = client.call.bind(client);
    client.call = async (path, options = {}) => {
      const method = (options.method || 'GET').toLowerCase();
      const pieces = path.split('/');
      const op = operations.find(candidate => candidate.method === method && candidate.path.split('/').length === pieces.length && candidate.path.split('/').every((part, i) => part.startsWith('{') || part === pieces[i]));
      if (op?.request) assert.ok(op.request(options.body), `${op.id}: request schema invalid (values suppressed)`);
      const result = await original(path, options);
      if (op) {
        assert.ok(Object.hasOwn(op.responses, String(result.status)) || Object.hasOwn(op.responses, 'default'), `${op.id}: undeclared HTTP ${result.status}`);
        const validate = op.responses[String(result.status)] || op.responses.default;
        if (validate) assert.ok(validate(result.body), `${op.id}: response schema invalid (values suppressed): ${JSON.stringify(validate.errors?.map(e => ({ path: e.instancePath, keyword: e.keyword })))}`);
        if (!verified.has(op.id)) verified.set(op.id, new Set());
        verified.get(op.id).add(result.status);
      }
      return result;
    };
    return client;
  };
  const post = (client, path, body, headers = idempotency()) => client.call(path, { method: 'POST', body, headers });
  const scalar = sql => Number(mysqlCommand(`USE majorpilot; ${sql}`).trim());
  let failure;
  try {
    const anonymous = instrument(new LocalClient());
    expect(await anonymous.call('/api/app/v1/review-preview-tasks'), 401, 'anonymous preview forbidden');
    const primary = await scope.student(); const other = await scope.student();
    const client = instrument(primary.client); const foreign = instrument(other.client);
    const previews = expect(await client.call('/api/app/v1/review-preview-tasks'), 200, 'local REVIEW catalog');
    const preview = previews.find(p => p.taskVersionId === fixture.taskVersionId);
    assert.ok(preview, 'Expected immutable AI REVIEW version');
    assert.equal(preview.runMode, 'REVIEW_PREVIEW'); assert.equal(preview.reviewStatus, 'REVIEW');
    assert.match(preview.warning, /审核.*计时/);
    const demos = await client.call('/api/app/v1/demo-tasks');
    expect(demos, env.MP_P2_DEMO_ENABLED === 'true' ? 200 : 404, 'separate demo feature gate');
    // The STANDARD create endpoint is exercised as a denial, never a fake
    // professional decision or artificial publication to obtain a success.
    expect(await post(client, routes, { decisionId: fixture.taskVersionId }), 404, 'unrelated content ID is not a decision');
    const createBody = { taskVersionId: fixture.taskVersionId }; const createKey = idempotency();
    let run = expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'create REVIEW preview');
    const id = run.runId; assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.equal(run.status, 'READY'); assert.equal(run.runMode, 'REVIEW_PREVIEW');
    assert.equal(run.contentKind, 'MAJOR'); assert.equal(run.majorCode, 'AI'); assert.equal(run.demoKey, null);
    assert.equal(run.taskVersionId, fixture.taskVersionId);
    assert.equal(expect(await post(client, '/api/app/v1/review-preview-runs', createBody, createKey), 201, 'preview create replay').runId, id);
    assert.equal(expect(await post(client, '/api/app/v1/review-preview-runs', createBody), 201, 'current preview uniqueness').runId, id);
    expect(await foreign.call(`${routes}/${id}`), 404, 'cross-owner run denied');
    expect(await post(foreign, `${routes}/${id}/start`, { expectedRevision: run.revision }), 404, 'cross-owner write denied');
    expect(await client.call(`${routes}/${id}/start`, { method: 'POST', body: { expectedRevision: run.revision }, headers: idempotency(), csrf: false }), 403, 'CSRF required');
    expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }, { ...idempotency(), Origin: 'https://untrusted.invalid' }), 403, 'exact Origin required');
    const listed = expect(await client.call(routes), 200, 'private run list');
    assert.deepEqual(listed.map(r => r.runId), [id]);
    assert.deepEqual(expect(await foreign.call(routes), 200, 'other owner run list'), []);
    const refresh = async () => expect(await client.call(`${routes}/${id}`), 200, 'refresh run');
    const dashboardIsSeparate = async () => {
      const dashboard = expect(await client.call('/api/app/v1/dashboard'), 200, 'formal dashboard');
      assert.equal(dashboard.majors.length, 3);
      assert.ok(dashboard.majors.every(m => m.status === 'NOT_STARTED' && m.availability === 'UNAVAILABLE'), 'REVIEW cannot count as formal experience');
    };
    await dashboardIsSeparate();
    run = expect(await post(client, `${routes}/${id}/start`, { expectedRevision: run.revision }), 200, 'start pinned preview');
    assert.equal(run.status, 'IN_PROGRESS');
    const task = expect(await client.call(`${routes}/${id}/task`), 200, 'projected manifest');
    assert.equal(task.taskVersionId, fixture.taskVersionId);
    assert.deepEqual(task.steps.map(s => s.stepKey), Object.keys(fixture.responses));
    const taskJson = JSON.stringify(task);
    for (const asset of manifest.assets.filter(a => a.visibility === 'PRIVATE')) {
      assert.ok(!taskJson.includes(asset.assetKey) && !taskJson.includes(asset.sha256) && !taskJson.includes(asset.path), 'Private asset identifiers/hashes omitted');
      expect(await client.call(`${routes}/${id}/task/assets/${asset.assetKey}`), 404, 'private resource inaccessible');
    }
    assert.ok(task.assets.every(a => !Object.hasOwn(a, 'path') && !Object.hasOwn(a, 'visibility')));
    assert.ok(task.operations.every(o => !Object.hasOwn(o, 'datasetAssetKey') && !Object.hasOwn(o, 'modelAssetKey')));
    for (const asset of manifest.assets.filter(a => a.visibility === 'PUBLIC')) {
      const response = await client.call(`${routes}/${id}/task/assets/${asset.assetKey}`);
      assert.equal(response.status, 200, `Public asset ${asset.assetKey}`);
      assert.equal(response.headers.get('X-Content-SHA256'), asset.sha256);
      assert.deepEqual(response.body, JSON.parse(readFileSync(new URL(`../content/${asset.path}`, import.meta.url), 'utf8')));
      if (asset.assetKey === 'evaluation-public') {
        assert.equal(response.body.length, 48);
        assert.ok(response.body.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['messageText', 'sampleId'])));
      }
    }
    expect(await foreign.call(`${routes}/${id}/task/assets/evaluation-public`), 404, 'public content still run-owner gated');
    checks.push('registered verified owners, authenticated REVIEW isolation, CSRF/Origin, immutable projection and private asset 404');

    const stepRevision = new Map(task.steps.map(s => [s.stepKey, 0]));
    const save = async (step, response) => {
      const saved = expect(await client.call(`${routes}/${id}/steps/${step}/response`, { method: 'PUT', body: { expectedRevision: stepRevision.get(step), responseSchemaVersion: fixture.responseSchemaVersion, response } }), 200, `save ${step}`);
      stepRevision.set(step, saved.revision); return saved;
    };
    const complete = async step => expect(await post(client, `${routes}/${id}/steps/${step}/complete`, { expectedRevision: stepRevision.get(step) }), 200, `complete ${step}`);
    const readStep = async step => expect(await client.call(`${routes}/${id}/steps/${step}`), 200, `read ${step}`);
    expect(await client.call(`${routes}/${id}/steps/a5-evaluate`), 409, 'future evaluation is locked');
    for (const step of ['a1-task', 'a2-metrics', 'a3-errors']) { await save(step, fixture.responses[step]); await complete(step); }
    await save('a4-configure', baseline); await complete('a4-configure');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id WHERE r.public_id='${id}';`), 0, 'A4 configuration alone cannot run the formal evaluator');
    await save('a5-evaluate', fixture.responses['a5-evaluate']);
    const evaluate = extra => post(client, `${routes}/${id}/executions`, { operationKey: 'ai-evaluate', inputRevision: stepRevision.get('a5-evaluate'), parameters: {}, ...extra });
    expect(await post(client, `${routes}/${id}/steps/a5-evaluate/complete`, { expectedRevision: stepRevision.get('a5-evaluate') }), 422, 'A5 needs server-verified result', 'EXECUTION_NOT_ALLOWED');
    const bound = await readStep('a5-evaluate');
    assert.equal(bound.inputBindings.length, 4);
    assert.ok(bound.inputBindings.every(b => b.sourceStepKey === 'a4-configure' && b.sourceRevision === 1));
    expect(await evaluate({ parameters: { confidenceThreshold: 0.4 } }), 422, 'client cannot override the bound A4 config', 'EXECUTION_NOT_ALLOWED');
    const baselineResult = expect(await evaluate(), 200, 'baseline server evaluation');
    assert.equal(baselineResult.remainingEvaluations, 5); assert.equal(baselineResult.trustLevel, 'SERVER_VERIFIED');
    assert.deepEqual(baselineResult.sourceRevisions, { 'a4-configure': 1 });
    assert.deepEqual(baselineResult.appliedSourceRevisions, baselineResult.sourceRevisions);
    assert.deepEqual(baselineResult.result.baseline, baselineResult.result.candidate);
    for (const [key, value] of Object.entries(fixture.baselineExpected)) assert.equal(baselineResult.result.baseline[key], value);
    assert.ok(!JSON.stringify(baselineResult.result).includes('sample-'), 'Formal evaluation returns only aggregate results');
    const forged = structuredClone(baselineResult.result); forged.candidate.coverage = 0;
    expect(await evaluate({ observedResult: forged }), 422, 'forged Worker result rejected', 'EXECUTION_RESULT_MISMATCH');
    const oldRevision = stepRevision.get('a5-evaluate');
    await save('a5-evaluate', fixture.responses['a5-evaluate']);
    expect(await evaluate({ inputRevision: oldRevision }), 409, 'stale A5 response revision rejected', 'EXECUTION_REVISION_STALE');
    const reboundBaseline = expect(await evaluate(), 200, 'baseline reuses without quota');
    assert.equal(reboundBaseline.executionId, baselineResult.executionId); assert.equal(reboundBaseline.reused, true);
    assert.equal(reboundBaseline.inputRevision, oldRevision); assert.equal(reboundBaseline.appliedToRevision, stepRevision.get('a5-evaluate'));
    await complete('a5-evaluate');
    const changed = await save('a4-configure', configurations[0]);
    assert.deepEqual(changed.invalidatedStepKeys, ['a4-configure', 'a5-evaluate', 'a6-decision']);
    await complete('a4-configure');
    const invalidated = await readStep('a5-evaluate');
    assert.deepEqual(invalidated.response, fixture.responses['a5-evaluate']);
    assert.ok(invalidated.executions.every(e => e.appliedToRevision === null && e.appliedSourceRevisions === null), 'Old source bindings cannot appear current');
    expect(await post(client, `${routes}/${id}/steps/a5-evaluate/complete`, { expectedRevision: stepRevision.get('a5-evaluate') }), 422, 'old A4 result cannot complete A5', 'EXECUTION_NOT_ALLOWED');
    const quotaResults = [];
    for (let index = 0; index < 5; index++) {
      if (index > 0) { await save('a4-configure', configurations[index]); await complete('a4-configure'); }
      const evaluated = expect(await evaluate(), 200, `distinct configuration ${index + 1}`);
      assert.equal(evaluated.remainingEvaluations, 4 - index); assert.equal(evaluated.reused, false);
      assert.deepEqual(evaluated.appliedSourceRevisions, { 'a4-configure': stepRevision.get('a4-configure') });
      quotaResults.push(evaluated);
    }
    const canonical = { ...configurations[4], exampleIds: [...configurations[4].exampleIds].reverse(), definitionVariantIds: Object.fromEntries(Object.entries(configurations[4].definitionVariantIds).reverse()) };
    await save('a4-configure', canonical); await complete('a4-configure');
    const reused = expect(await evaluate(), 200, 'canonical config is free at exhausted quota');
    assert.equal(reused.executionId, quotaResults[4].executionId); assert.equal(reused.reused, true); assert.equal(reused.remainingEvaluations, 0);
    assert.deepEqual(reused.sourceRevisions, quotaResults[4].sourceRevisions);
    assert.deepEqual(reused.appliedSourceRevisions, { 'a4-configure': stepRevision.get('a4-configure') });
    await save('a4-configure', configurations[5]); await complete('a4-configure');
    expect(await evaluate(), 429, 'sixth distinct nonbaseline config blocked', 'EVALUATION_LIMIT_REACHED');
    await save('a4-configure', baseline); await complete('a4-configure');
    const freeBaseline = expect(await evaluate(), 200, 'baseline remains free after five configurations');
    assert.equal(freeBaseline.executionId, baselineResult.executionId); assert.equal(freeBaseline.remainingEvaluations, 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id WHERE r.public_id='${id}' AND e.status='SUCCEEDED' AND e.counts_against_quota=TRUE;`), 5);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id WHERE r.public_id='${id}' AND e.status='SUCCEEDED' AND e.counts_against_quota=FALSE;`), 1);
    const hint = expect(await post(client, `${routes}/${id}/hints`, { stepKey: 'a4-configure', hintLevel: 1 }), 200, 'AI-off static assistance');
    assert.equal(hint.status, 'FALLBACK'); assert.ok(hint.response.hintText);
    expect(await client.call(`${routes}/${id}/hints/${hint.hintId}`), 200, 'read own hint');
    expect(await foreign.call(`${routes}/${id}/hints/${hint.hintId}`), 404, 'cross-owner hint denied');
    await complete('a5-evaluate');
    await save('a6-decision', fixture.responses['a6-decision']); run = await complete('a6-decision');
    assert.ok(run.steps.every(s => s.status === 'COMPLETED'));
    checks.push('A1-A6, A4 bound provenance, stale-response/source rejection, baseline-free max-five quota, canonical reuse and forged-result denial');

    run = expect(await post(client, `${routes}/${id}/task-completion`, { expectedRevision: run.revision }), 200, 'enter reflection');
    assert.equal(run.status, 'TASK_COMPLETED');
    let reflection = expect(await client.call(`${routes}/${id}/reflection`), 200, 'reflection definition');
    const reflectionBody = { ...fixture.reflection, expectedRevision: reflection.revision };
    reflection = expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: reflectionBody }), 200, 'save reflection');
    expect(await client.call(`${routes}/${id}/reflection`, { method: 'PUT', body: reflectionBody }), 409, 'reflection CAS conflict', 'REFLECTION_REVISION_CONFLICT');
    const follow = expect(await post(client, `${routes}/${id}/reflection/follow-up`, { expectedRevision: reflection.revision }), 200, 'AI-off follow-up is optional');
    assert.equal(follow.status, 'FAILED'); assert.equal(follow.response, null); assert.equal(follow.canSkip, true);
    run = await refresh();
    run = expect(await post(client, `${routes}/${id}/pause`, { expectedRevision: run.revision }), 200, 'pause reflection');
    assert.equal(run.pausedFromStatus, 'TASK_COMPLETED');
    assert.equal(expect(await client.call(`${routes}/${id}/reflection`), 200, 'paused reflection read').readOnly, true);
    run = expect(await post(client, `${routes}/${id}/resume`, { expectedRevision: run.revision }), 200, 'resume reflection');
    const closeBody = { ...fixture.reflection, expectedRevision: reflection.revision }; const closeKey = idempotency();
    run = expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close preview');
    assert.equal(run.status, 'CLOSED'); assert.equal(run.runMode, 'REVIEW_PREVIEW'); assert.equal(run.reportStatus, 'NOT_APPLICABLE');
    assert.equal(expect(await post(client, `${routes}/${id}/reflection/submission`, closeBody, closeKey), 200, 'close idempotency').runId, id);
    assert.equal(expect(await post(client, '/api/app/v1/review-preview-runs', createBody), 201, 'no silent preview retake').status, 'CLOSED');
    const closed = expect(await client.call(`${routes}/${id}/reflection`), 200, 'closed reflection');
    assert.equal(closed.answers.aiFollowUp, 'SKIPPED'); assert.equal(closed.readOnly, true);
    const runSql = `SELECT id FROM mp_experience_run WHERE public_id='${id}'`;
    const evidenceReady = () => scalar(`SELECT COUNT(*) FROM mp_evidence_snapshot WHERE experience_run_id IN (${runSql}) AND status='READY' AND run_mode='REVIEW_PREVIEW';`);
    const deadline = Date.now() + 55000;
    while (evidenceReady() === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(evidenceReady(), 1, 'Durable evidence job must finish READY');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_background_job WHERE target_type='EXPERIENCE_RUN' AND target_id IN (${runSql}) AND job_type='EVIDENCE_BUILD' AND status='SUCCEEDED';`), 1);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_run_closure_request WHERE experience_run_id IN (${runSql}) AND status='READY';`), 1);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_report WHERE experience_run_id IN (${runSql});`), 0, 'Preview must not request a formal report');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_recommendation WHERE source_run_id IN (${runSql});`), 0, 'Preview must not generate NEXT');
    const snapshot = JSON.parse(mysqlCommand(`USE majorpilot; SELECT JSON_OBJECT('snapshotSha256',snapshot_sha256,'closedInputSha256',closed_input_sha256,'ruleVersion',evidence_rule_version) FROM mp_evidence_snapshot WHERE experience_run_id IN (${runSql}) AND status='READY';`).trim());
    assert.match(snapshot.snapshotSha256, /^[a-f0-9]{64}$/); assert.match(snapshot.closedInputSha256, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.ruleVersion, 'evidence-v2');
    const frozen = JSON.parse(mysqlCommand(`USE majorpilot; SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id='${id}';`).trim());
    assert.equal(frozen.schemaVersion, 'closed-input-v3'); assert.equal(frozen.evidenceRuleVersion, snapshot.ruleVersion); assert.equal(frozen.runMode, 'REVIEW_PREVIEW'); assert.equal(frozen.steps.length, 6);
    assert.ok(frozen.executions.length > 0 && frozen.executions.every(e => e.sourceRevisions['a4-configure'] === stepRevision.get('a4-configure')));
    const evidenceRows = mysqlCommand(`USE majorpilot; SELECT JSON_OBJECT('key',e.evidence_key,'type',e.evidence_type,'source',e.source_type,'claims',e.allowed_claim_types_json,'value',e.structured_value_json,'ruleVersion',e.rule_version,'sensitivity',e.sensitivity_class) FROM mp_evidence_item e JOIN mp_evidence_snapshot s ON s.id=e.evidence_snapshot_id WHERE s.experience_run_id IN (${runSql}) AND s.status='READY' ORDER BY e.id;`).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.ok(evidenceRows.some(e => e.type === 'VERIFIED_EXECUTION'));
    assert.ok(evidenceRows.some(e => e.key === 'reflection:continueSimilarWork' && e.claims.includes('STUDENT_SELF_REPORT')));
    assert.ok(evidenceRows.every(e => e.sensitivity === 'INTERNAL' && !e.key.includes('reflectionNote') && !e.key.includes('aiFollowUp')));
    assert.ok(evidenceRows.every(e => e.ruleVersion === frozen.evidenceRuleVersion), 'Every item uses the frozen extraction rule');
    const analysisRows = evidenceRows.filter(e => e.type === 'STUDENT_ANALYSIS');
    assert.equal(analysisRows.length, 4, 'A3-A6 analysis remains traceable but unverified');
    assert.ok(analysisRows.every(e => e.claims.length === 0 && e.value.verificationStatus === 'UNVERIFIED' && e.value.attribution === 'STUDENT_AUTHORED_ANALYSIS'));
    const analysisFields = ['errorPatterns', 'modificationReason', 'expectedEffect', 'comparisonNotes', 'tradeoff', 'decisionReason', 'monitoringItems', 'residualRisk'];
    assert.ok(evidenceRows.filter(e => e.type === 'STEP_RESPONSE').every(e => e.claims.includes('OBSERVED_FACT') && analysisFields.every(key => !(key in e.value))), 'Saved student analysis must not be licensed as observed facts');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_ai_call WHERE experience_run_id IN (${runSql}) AND (http_attempts IS NULL OR http_attempts<>0);`), 0, 'Disabled AI metadata must prove zero HTTP attempts');
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_ai_call WHERE experience_run_id IN (${runSql});`), 2, 'Hint and optional follow-up metadata recorded');
    await dashboardIsSeparate();
    assert.equal((await refresh()).taskVersionId, fixture.taskVersionId);
    checks.push('reflection CAS and pause/resume, honest AI-off skip, immutable closure, real background Evidence READY, no formal report/NEXT');

    // All operator-only routes are denial tests using only the Student cookie.
    // No operator token, fabricated human review, or lifecycle mutation occurs.
    const admin = '/api/admin/v1/majorpilot';
    expect(await client.call(`${admin}/task-versions`), 401, 'student cannot list operator content');
    expect(await post(client, `${admin}/task-versions/validate`, { manifestPath: 'ai-support/1.0.0/manifest.json' }), 401, 'student cannot validate operator content');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/publish`, { expectedRevision: 0, reviewChecks: {}, reasonText: 'Synthetic denied request; no human review is claimed.' }), 401, 'student cannot publish REVIEW');
    expect(await post(client, `${admin}/task-versions/${fixture.taskVersionId}/retire`, { expectedRevision: 0, reasonText: 'Synthetic denied request; do not change content.' }), 401, 'student cannot retire content');
    expect(await post(client, `${admin}/experience-runs/${id}/recovery-runs`, { expectedRevision: run.revision, reasonCode: 'TECHNICAL_FAILURE', reasonText: 'Synthetic denied request; do not replace the run.' }), 401, 'student cannot create recovery run');
    assert.deepEqual([...verified.keys()].sort(), [...expectedOperations].sort(), 'Every P3 endpoint has a contract-validated actual response');
    checks.push('all five operator routes reject student cookies; no publication or recovery privilege escalation');
  } catch (error) {
    failure = error;
  } finally {
    try { await scope.cleanup(); } catch (cleanupError) { failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and exact fixture cleanup both failed; values suppressed') : cleanupError; }
  }
  if (failure) throw failure;
  const denialOnlyOperations = [...verified].filter(([, statuses]) => ![...statuses].some(status => status >= 200 && status < 300)).map(([id]) => id).sort();
  console.log(JSON.stringify({ result: 'PASS', scope: 'P3 real local HTTP + MySQL acceptance; not human review, timing trial, or deployment', checks, responseContractsVerified: verified.size, operationStatuses: Object.fromEntries([...verified].map(([id, statuses]) => [id, [...statuses].sort()])), denialOnlyOperations, fixtureAccounts: 2, fixtureCleanup: true, rateLimitsReset: false, paidCalls: 0 }, null, 2));
}
