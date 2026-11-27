import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkProductFlow, loadProductFlowContracts } from '../check-product-flow.mjs';
const { schemas, original, operations } = await loadProductFlowContracts();
const id = '01JF1000000000000000000001', sha = 'a'.repeat(64);
const authority = { authorizationReference: 'PROJECT_OWNER:local-acceptance-20260921', reasonText: 'Synthetic exact local acceptance authorization, not expert review.' };
const release = { expectedRevision: 0, manifestSha256: sha, ...authority };
const adoption = { expectedRevision: 8, closedInputSha256: sha, evidenceSnapshotId: id, ...authority };
const accepted = { authorizationId: id, runId: id, originalRunMode: 'REVIEW_PREVIEW', productEligible: true, reportId: id, reportStatus: 'PENDING' };
const run = { runId: id, contentKind: 'MAJOR', majorCode: 'BUSINESS_ANALYTICS', demoKey: null, status: 'CLOSED', revision: 8, taskVersionId: id, currentStepKey: null, pausedFromStatus: null, activeRunId: null, replacementRunId: null, readOnly: true, steps: [], startedAt: '2026-09-21T00:00:00Z', closedAt: '2026-09-21T01:00:00Z', reportStatus: 'NOT_APPLICABLE', runMode: 'REVIEW_PREVIEW' };
const valid = (name, value) => assert.equal(schemas[name](value), true, name + ': ' + JSON.stringify(schemas[name].errors));
const invalid = (name, value) => assert.equal(schemas[name](value), false, name + ' accepted invalid fixture');

test('post-P7 overlay compiles, is reproducible and matches exact local controller routes/permission conjunction', async () => {
  assert.equal((await checkProductFlow()).result, 'PASS');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../sync-product-flow.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Object.keys(original.paths).length, 2);
  assert.match(original.info.description, /not P8 or public deployment/);
});
test('local release requires pinned revision, exact digest and explicit bounded authorization metadata', () => {
  valid('LocalProductRelease', release);
  for (const key of Object.keys(release)) { const value = { ...release }; delete value[key]; invalid('LocalProductRelease', value); }
  for (const change of [{ expectedRevision: -1 }, { expectedRevision: 0.5 }, { manifestSha256: 'a'.repeat(63) }, { manifestSha256: 'A'.repeat(64) }, { authorizationReference: '' }, { authorizationReference: 'owner request' }, { authorizationReference: 'x'.repeat(121) }, { reasonText: ' ' }, { reasonText: 'x'.repeat(1001) }, { reviewedBy: 1 }]) invalid('LocalProductRelease', { ...release, ...change });
});
test('adoption is exact scoped authorization, not an option to rewrite source evidence or change all previews', () => {
  valid('ProductAdoption', adoption);
  for (const key of Object.keys(adoption)) { const value = { ...adoption }; delete value[key]; invalid('ProductAdoption', value); }
  for (const change of [{ evidenceSnapshotId: 'foreign-or-invalid' }, { closedInputSha256: 'unverified' }, { expectedRevision: null }, { runMode: 'STANDARD' }, { studentId: id }, { adoptAll: true }, { answers: {} }, { passedReviewChecks: ['ALL'] }]) invalid('ProductAdoption', { ...adoption, ...change });
});
test('release acknowledgement cannot imply expert review or formal publication', () => {
  const value = { authorizationId: id, taskVersionId: id, reviewStatus: 'REVIEW', availability: 'AVAILABLE' };
  valid('LocalProductReleaseAccepted', value);
  invalid('LocalProductReleaseAccepted', { ...value, reviewStatus: 'PUBLISHED' });
  invalid('LocalProductReleaseAccepted', { ...value, humanReviewCompleted: true });
});
test('new historical adoption rejects an existing CLOSED product chronology without breaking matching retries', () => {
  const path = '/api/admin/v1/majorpilot/experience-runs/{id}/product-adoption';
  const definition = original.paths[path].post;
  const operation = operations.find(value => value.path === path);
  assert.ok(definition['x-safe-error-codes'].includes('PRODUCT_ADOPTION_ORDER_CONFLICT'));
  assert.match(definition.description, /new adoption.*HTTP409 PRODUCT_ADOPTION_ORDER_CONFLICT.*another CLOSED product Run/);
  assert.match(definition.description, /existing matching adoption remains retryable after later Major completions/);
  assert.match(definition.description, /guard applies only when creating a new grant/);
  assert.equal(operation.responses['409']({ error: { code: 'PRODUCT_ADOPTION_ORDER_CONFLICT', message: 'Safe chronology conflict', fieldErrors: [], retryable: false }, meta: { requestId: 'synthetic-product-order' } }), true);
});
test('adoption acknowledgement preserves historical mode and reports actual asynchronous state', () => {
  for (const reportStatus of ['PENDING', 'GENERATING', 'READY', 'FAILED']) valid('ProductAdoptionAccepted', { ...accepted, reportStatus });
  for (const change of [{ originalRunMode: 'STANDARD' }, { productEligible: false }, { reportStatus: 'NOT_APPLICABLE' }, { reportId: null }, { studentEmail: 'private@example.invalid' }, { rawEvidence: {} }]) invalid('ProductAdoptionAccepted', { ...accepted, ...change });
});
test('shared Run remains backward-compatible while strictly typing additive eligibility and real report states', () => {
  valid('Run', run);
  for (const productEligible of [null, false, true]) valid('Run', { ...run, productEligible });
  for (const reportStatus of ['NOT_APPLICABLE', 'NOT_REQUESTED', 'PENDING', 'GENERATING', 'READY', 'FAILED']) valid('Run', { ...run, productEligible: true, reportStatus });
  for (const productEligible of ['true', 1, {}, []]) invalid('Run', { ...run, productEligible });
  invalid('Run', { ...run, productEligible: true, authorizationReference: authority.authorizationReference });
  assert.ok(!original.components.schemas.Run.required.includes('productEligible'));
});
test('responses use actual HTTP200 envelope and preserve safe error schemas without credentials or raw answers', () => {
  const op = operations.find(value => value.id === 'adoptClosedPreviewForProduct');
  const meta = { requestId: 'synthetic-product-flow', apiVersion: 'v1' };
  assert.equal(op.responses['200']({ data: accepted, meta }), true);
  assert.equal(op.responses['200']({ ...accepted, meta }), false);
  const failure = { error: { code: 'EVIDENCE_SOURCE_INVALID', message: 'Safe failure', fieldErrors: [], retryable: false }, meta: { requestId: 'synthetic-product-flow' } };
  assert.equal(op.responses['409'](failure), true);
  assert.equal(op.responses['409']({ ...failure, rawInput: {} }), false);
  assert.ok(!Object.hasOwn(op.responses, '201'));
});
test('request DTO fields match current service and the grant is profile plus feature gated', () => {
  const service = readFileSync(new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/experience/ProductAdoptionService.java', import.meta.url), 'utf8');
  for (const [record, schema] of [['Release', 'LocalProductRelease'], ['Adopt', 'ProductAdoption']]) {
    const fields = service.match(new RegExp(`record ${record}\\(([^)]+)\\)`))[1].split(',').map(value => value.trim().split(/\s+/).at(-1)).sort();
    assert.deepEqual(fields, Object.keys(original.components.schemas[schema].properties).sort());
  }
  assert.match(service, /@Service @Profile\("local"\)/);
  assert.equal((service.match(/access\.requireEnabled\(\)/g) || []).length, 2);
  const gate = readFileSync(new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/acceptance/LocalProductAccess.java', import.meta.url), 'utf8');
  assert.match(gate, /MP_LOCAL_PRODUCT_ENABLED:false/);
});
