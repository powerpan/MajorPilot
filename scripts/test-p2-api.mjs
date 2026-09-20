import assert from 'node:assert/strict';
import { createFixtureScope, LocalClient, expect, idempotency } from './lib/local-student-fixture.mjs';
import { loadP2Contracts } from '../contracts/check-p2.mjs';
import { mysqlCommand } from './infra.mjs';
import { readLocalEnv } from './env.mjs';

// This is real loopback HTTP/MySQL acceptance, not a mocked run engine. No model
// calls, no rate-limit resets, no arbitrary shared data cleanup.
assert.equal(readLocalEnv().MP_EXPERIENCE_AI_ENABLED, 'false', 'Paid task AI must be explicitly off for acceptance');
const scope = createFixtureScope('p2-api');
const { operations } = await loadP2Contracts();
const verified = new Set(); const checks = [];
const root = '/api/app/v1/experience-runs';
function instrument(client) {
  const original = client.call.bind(client);
  client.call = async (path, options = {}) => {
    const result = await original(path, options);
    const method = (options.method || 'GET').toLowerCase();
    const operation = operations.find(op => op.method === method && op.path.split('/').length === path.split('/').length && op.path.split('/').every((part, i) => part.startsWith('{') || part === path.split('/')[i]));
    if (operation) {
      const validate = operation.responses[String(result.status)] || operation.responses.default;
      if (validate) assert.ok(validate(result.body), `${operation.id}: response schema failed, values suppressed; ${JSON.stringify(validate.errors?.map(e => ({ path: e.instancePath, keyword: e.keyword })))}`);
      verified.add(operation.id);
    }
    return result;
  };
  return client;
}
const post = (client, path, body, headers = idempotency()) => client.call(path, { method: 'POST', body, headers });
const getRun = async (client, id) => expect(await client.call(`${root}/${id}`), 200, 'run refresh');
const save = (client, id, step, revision, response) => client.call(`${root}/${id}/steps/${step}/response`, { method: 'PUT', body: { expectedRevision: revision, responseSchemaVersion: 'demo-response-v1', response } });
const completeStep = async (client, id, step, revision) => expect(await post(client, `${root}/${id}/steps/${step}/complete`, { expectedRevision: revision }), 200, `complete ${step}`);
const scalar = sql => Number(mysqlCommand(`USE majorpilot; ${sql}`).trim());
let succeeded = false;
try {
  const outsider = instrument(new LocalClient());
  expect(await outsider.call(`${root}`), 401, 'anonymous run denial');
  const a = await scope.student(), b = await scope.student();
  const c = instrument(a.client), foreign = instrument(b.client);
  const demos = expect(await c.call('/api/app/v1/demo-tasks'), 200, 'explicit local demo catalog');
  assert.deepEqual(demos.map(d => d.demoKey).sort(), ['DEMO_COMPARE', 'DEMO_TABLE']);
  const majors = expect(await c.call('/api/public/v1/majors'), 200, 'formal catalog');
  assert.equal(majors.length, 3);
  const createBody = { demoKey: 'DEMO_TABLE' }, createHeaders = idempotency();
  let run = expect(await post(c, root, createBody, createHeaders), 201, 'create ready');
  const id = run.runId; assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(run.status, 'READY'); assert.equal(run.taskVersionId, null); assert.equal(run.majorCode, null);
  assert.equal(expect(await post(c, root, createBody, createHeaders), 201, 'create replay').runId, id);
  assert.equal(expect(await post(c, root, createBody), 201, 'long-lived current-run uniqueness').runId, id);
  expect(await post(c, root, { demoKey: 'DEMO_COMPARE' }, createHeaders), 409, 'changed idempotency payload', 'IDEMPOTENCY_KEY_REUSED');
  expect(await foreign.call(`${root}/${id}`), 404, 'cross-student read');
  expect(await post(foreign, `${root}/${id}/start`, { expectedRevision: 0 }), 404, 'cross-student mutation');
  expect(await c.call(`${root}/${id}/start`, { method: 'POST', body: { expectedRevision: 0 }, headers: idempotency(), csrf: false }), 403, 'CSRF required');
  expect(await post(c, `${root}/${id}/start`, { expectedRevision: 0 }, { ...idempotency(), Origin: 'https://untrusted.invalid' }), 403, 'exact Origin required');
  expect(await c.call(`${root}/${id}/task`), 409, 'ready does not bind content');
  const startedHeaders = idempotency();
  run = expect(await post(c, `${root}/${id}/start`, { expectedRevision: 0 }, startedHeaders), 200, 'formal start');
  assert.equal(run.status, 'IN_PROGRESS'); assert.ok(run.taskVersionId);
  assert.equal(expect(await post(c, `${root}/${id}/start`, { expectedRevision: 0 }, startedHeaders), 200, 'start replay').taskVersionId, run.taskVersionId);
  const fixedVersion = run.taskVersionId;
  checks.push('authenticated demo isolation, READY/start split, immutable identity, idempotency and CSRF/Origin');

  const manifest = expect(await c.call(`${root}/${id}/task`), 200, 'bound manifest');
  assert.equal(manifest.contentKind, 'DEMO');
  assert.ok(!JSON.stringify(manifest).includes('internal-review'), 'Private asset identifier is not public');
  const sample = await c.call(`${root}/${id}/task/assets/sample`);
  assert.equal(sample.status, 200); assert.match(sample.headers.get('X-Content-SHA256'), /^[a-f0-9]{64}$/);
  expect(await c.call(`${root}/${id}/task/assets/internal-review`), 404, 'private asset rejected');
  expect(await c.call(`${root}/${id}/steps/adjust`), 409, 'future step locked');
  expect(await save(c, id, 'prepare', 0, { acknowledged: true }), 200, 'save first revision');
  expect(await save(c, id, 'prepare', 0, { acknowledged: true }), 409, 'old tab revision rejected', 'STEP_REVISION_CONFLICT');
  await completeStep(c, id, 'prepare', 1);
  expect(await save(c, id, 'read-sample', 0, { acknowledged: true }), 200, 'read sample save');
  await completeStep(c, id, 'read-sample', 1);
  checks.push('pinned public manifest, private asset rejection, dependency gates and append-only response revisions');

  let other = expect(await post(c, root, { demoKey: 'DEMO_COMPARE' }), 201, 'second lane ready');
  expect(await post(c, `${root}/${other.runId}/start`, { expectedRevision: other.revision }), 409, 'single active slot', 'ACTIVE_RUN_EXISTS');
  run = await getRun(c, id);
  expect(await post(c, `${root}/${other.runId}/start`, { expectedRevision: other.revision, pauseActiveRunId: id, expectedActiveRunRevision: run.revision - 1 }), 409, 'stale active revision rolls back');
  assert.equal((await getRun(c, id)).status, 'IN_PROGRESS'); assert.equal((await getRun(c, other.runId)).status, 'READY');
  other = expect(await post(c, `${root}/${other.runId}/start`, { expectedRevision: other.revision, pauseActiveRunId: id, expectedActiveRunRevision: run.revision }), 200, 'atomic switch');
  run = await getRun(c, id); assert.equal(run.status, 'PAUSED');
  expect(await save(c, id, 'adjust', 0, { multiplier: 2, include: 'ALL' }), 409, 'old tab cannot write paused run', 'RUN_PAUSED');
  run = expect(await post(c, `${root}/${id}/resume`, { expectedRevision: run.revision, pauseActiveRunId: other.runId, expectedActiveRunRevision: other.revision }), 200, 'switch back preserving progress');
  assert.equal(run.taskVersionId, fixedVersion); assert.equal(run.steps.find(s => s.stepKey === 'read-sample').status, 'COMPLETED');
  checks.push('one active slot, atomic pause/start rollback and revision-safe resume preserving earlier steps');

  expect(await save(c, id, 'adjust', 0, { multiplier: 2.5, include: 'ALL' }), 422, 'non-enum numeric input');
  expect(await save(c, id, 'adjust', 0, { multiplier: 2, include: 'ALL', url: 'https://untrusted.invalid' }), 422, 'unknown input rejected');
  expect(await save(c, id, 'adjust', 0, { multiplier: 2, include: 'ALL' }), 200, 'save calculation input');
  expect(await post(c, `${root}/${id}/steps/adjust/complete`, { expectedRevision: 1 }), 422, 'required execution cannot be bypassed');
  const executionBody = { operationKey: 'demo-summary-v1', inputRevision: 1, parameters: {} }, executionHeaders = idempotency();
  expect(await post(c, `${root}/${id}/executions`, { ...executionBody, observedResult: { count: 4, sum: 999, mean: 13, multiplier: 2, include: 'ALL' } }), 422, 'forged client result rejected', 'EXECUTION_RESULT_MISMATCH');
  const executed = expect(await post(c, `${root}/${id}/executions`, executionBody, executionHeaders), 200, 'server recomputation');
  assert.equal(executed.trustLevel, 'SERVER_VERIFIED'); assert.deepEqual(executed.result, { count: 4, sum: 52, mean: 13, multiplier: 2, include: 'ALL' });
  run = await getRun(c, id);
  run = expect(await post(c, `${root}/${id}/pause`, { expectedRevision: run.revision }), 200, 'pause after computation');
  assert.equal(expect(await post(c, `${root}/${id}/executions`, executionBody, executionHeaders), 200, 'execution replay after pause').executionId, executed.executionId);
  run = expect(await post(c, `${root}/${id}/resume`, { expectedRevision: run.revision }), 200, 'resume after execution');
  expect(await save(c, id, 'adjust', 1, { multiplier: 3, include: 'ALL' }), 200, 'change computation');
  expect(await post(c, `${root}/${id}/executions`, executionBody), 409, 'stale execution revision');
  expect(await save(c, id, 'adjust', 2, { multiplier: 2, include: 'ALL' }), 200, 'return to earlier configuration');
  const reused = expect(await post(c, `${root}/${id}/executions`, { ...executionBody, inputRevision: 3 }), 200, 'reuse canonical configuration');
  assert.equal(reused.executionId, executed.executionId); assert.equal(reused.reused, true); assert.equal(reused.inputRevision, 1); assert.equal(reused.appliedToRevision, 3);
  const refreshed = expect(await c.call(`${root}/${id}/steps/adjust`), 200, 'refresh execution bindings');
  assert.ok(refreshed.executions.some(e => e.executionId === executed.executionId && e.appliedToRevision === 3));
  assert.ok(refreshed.executions.every(e => e.remainingEvaluations >= 0));
  const hintHeaders = idempotency(), hintBody = { stepKey: 'adjust', hintLevel: 1 };
  const hint = expect(await post(c, `${root}/${id}/hints`, hintBody, hintHeaders), 200, 'reviewed static hint');
  assert.equal(hint.status, 'FALLBACK'); assert.ok(hint.response.hintText);
  assert.equal(expect(await post(c, `${root}/${id}/hints`, hintBody, hintHeaders), 200, 'hint replay').hintId, hint.hintId);
  expect(await c.call(`${root}/${id}/hints/${hint.hintId}`), 200, 'hint recovery read');
  expect(await foreign.call(`${root}/${id}/hints/${hint.hintId}`), 404, 'private hint ownership');
  await completeStep(c, id, 'adjust', 3);
  checks.push('strict allowed parameters, server-verified execution, forged-result denial, immutable reuse binding and hint fallback');

  const observation = '我把倍数调整为二，四行样本的总和与均值都变成原来的两倍；样本数量保持不变。';
  expect(await save(c, id, 'observe', 0, { observation }), 200, 'observation save');
  await completeStep(c, id, 'observe', 1);
  const iterative = expect(await save(c, id, 'adjust', 3, { multiplier: 2, include: 'FIRST_TWO' }), 200, 'reopen completed step');
  assert.ok(iterative.invalidatedStepKeys.includes('observe'));
  expect(await c.call(`${root}/${id}/steps/observe`), 409, 'dependent completed step requires revalidation');
  expect(await post(c, `${root}/${id}/executions`, { ...executionBody, inputRevision: 4 }), 200, 'iterate computation');
  await completeStep(c, id, 'adjust', 4);
  const oldObservation = expect(await c.call(`${root}/${id}/steps/observe`), 200, 'old observation retained');
  assert.equal(oldObservation.response.observation, observation);
  expect(await save(c, id, 'observe', 1, { observation: '这次只保留前两行样本，再把数值乘二；参与计算的数量变为二，总和与均值都随范围改变。' }), 200, 'revise interpretation');
  await completeStep(c, id, 'observe', 2);
  expect(await save(c, id, 'submit', 0, { acknowledged: true }), 200, 'final confirmation');
  run = await completeStep(c, id, 'submit', 1);
  run = expect(await post(c, `${root}/${id}/task-completion`, { expectedRevision: run.revision }), 200, 'task completion');
  assert.equal(run.status, 'TASK_COMPLETED');
  expect(await save(c, id, 'observe', 2, { observation }), 409, 'task phase cannot be edited in reflection');
  checks.push('meaningful iteration invalidates transitive completion without deleting answers or execution history');

  let reflection = expect(await c.call(`${root}/${id}/reflection`), 200, 'reflection definition');
  const answers = { interestingStepKeys: ['adjust'], difficultySources: ['NONE'], continueSimilarWork: 'UNSURE' };
  expect(await post(c, `${root}/${id}/reflection/submission`, { expectedRevision: 0, questionSetVersion: reflection.questionSetVersion, answers: {} }), 422, 'required reflection');
  const follow = expect(await post(c, `${root}/${id}/reflection/follow-up`, { expectedRevision: reflection.revision }), 200, 'optional follow-up can fail safely'); assert.equal(follow.canSkip, true);
  reflection = expect(await c.call(`${root}/${id}/reflection`, { method: 'PUT', body: { expectedRevision: 0, questionSetVersion: reflection.questionSetVersion, answers } }), 200, 'save reflection');
  expect(await c.call(`${root}/${id}/reflection`, { method: 'PUT', body: { expectedRevision: 0, questionSetVersion: reflection.questionSetVersion, answers } }), 409, 'reflection revision conflict');
  run = await getRun(c, id);
  run = expect(await post(c, `${root}/${id}/pause`, { expectedRevision: run.revision }), 200, 'pause reflection');
  assert.equal(run.pausedFromStatus, 'TASK_COMPLETED');
  assert.equal(expect(await c.call(`${root}/${id}/reflection`), 200, 'paused reflection read').readOnly, true);
  run = expect(await post(c, `${root}/${id}/resume`, { expectedRevision: run.revision }), 200, 'resume reflection');
  assert.equal(run.status, 'TASK_COMPLETED');
  const closeBody = { expectedRevision: reflection.revision, questionSetVersion: reflection.questionSetVersion, answers }, closeHeaders = idempotency();
  run = expect(await post(c, `${root}/${id}/reflection/submission`, closeBody, closeHeaders), 200, 'freeze and close');
  assert.equal(run.status, 'CLOSED'); assert.equal(run.reportStatus, 'NOT_APPLICABLE');
  assert.equal(expect(await post(c, `${root}/${id}/reflection/submission`, closeBody, closeHeaders), 200, 'close replay').runId, id);
  assert.equal(expect(await post(c, root, createBody), 201, 'closed cannot create retake').status, 'CLOSED');
  const closedReflection = expect(await c.call(`${root}/${id}/reflection`), 200, 'closed reflection');
  assert.equal(closedReflection.answers.nextWorkStyle, 'SKIPPED'); assert.equal(closedReflection.answers.aiFollowUp, 'SKIPPED');
  assert.equal(scalar(`SELECT COUNT(*) FROM mp_run_closure_request q JOIN mp_experience_run r ON r.id=q.experience_run_id WHERE r.public_id='${id}' AND q.status='DEMO_COMPLETE';`), 1);
  const frozen = mysqlCommand(`USE majorpilot; SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id='${id}';`).trim();
  const frozenHash = mysqlCommand(`USE majorpilot; SELECT closed_input_sha256 FROM mp_experience_run WHERE public_id='${id}';`).trim();
  // MySQL JSON canonicalizes whitespace; compare the immutable stored hash across reads, not its storage formatter.
  assert.match(frozenHash, /^[a-f0-9]{64}$/); assert.equal(JSON.parse(frozen).steps.length, 5);
  assert.equal((await getRun(c, id)).taskVersionId, fixedVersion);
  const dashboard = expect(await c.call('/api/app/v1/dashboard'), 200, 'formal dashboard after demo');
  assert.ok(dashboard.majors.every(m => m.status === 'NOT_STARTED' && m.availability === 'UNAVAILABLE'));
  expect(await c.call(`/api/admin/v1/majorpilot/experience-runs/${id}/recovery-runs`, { method: 'POST', body: { expectedRevision: run.revision, reasonCode: 'TECHNICAL_FAILURE', reasonText: 'Synthetic boundary test' }, headers: idempotency() }), 401, 'student cannot become operator');
  checks.push('reflection CAS, pause/resume phase, closure uniqueness, frozen input and no false professional completion/report');
  succeeded = true;
} finally {
  await scope.cleanup();
}
console.log(JSON.stringify({ result: succeeded ? 'PASS' : 'FAIL', checks, responseContractsVerified: verified.size, operations: [...verified].sort(), fixtureCleanup: true, paidCalls: 0, scope: 'P2 real local HTTP, no public deployment' }, null, 2));
