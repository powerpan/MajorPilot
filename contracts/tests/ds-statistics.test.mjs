import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { calculateDs, normalizeParameters, validateRows, halfUp6, quantile, wilson, pearson } from '../../shared/ds/ds-stats-v1.mjs';
import { validateDsAssets } from '../../shared/ds/validate-assets.mjs';
import { validateManifest } from '../check-content.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
const read = name => JSON.parse(readFileSync(new URL(`../../content/ds-learning/1.0.0/${name}.json`, import.meta.url), 'utf8'));
const rows = read('learner-activity'), golden = read('golden-private'), manifest = read('manifest');
const base = { duplicatePolicy: 'DROP_EXACT', missingPolicy: 'KEEP_NULL', extremePolicy: 'KEEP' };
const metadata = { datasetSha256: golden.datasetSha256 }, scatter = { ...base, relationshipMode: 'SCATTER', xField: 'avg_session_minutes', yField: 'assignment_submit_rate' };
const toy = (index, override = {}) => ({ ...rows[0], learner_id: `learner-${String(index).padStart(3, '0')}`, lessons_started: 1, lessons_completed: 0, completed: false, avg_session_minutes: 0, days_to_first_lesson: 0, assignment_submit_rate: 0, ...override });
test('frozen generator is reproducible and PUBLIC data agrees with complete canonical event facts', () => {
  const assets = new Map(manifest.assets.map(a => [a.assetKey, readFileSync(new URL(`../../content/${a.path}`, import.meta.url))]));
  validateDsAssets(assets); validateManifest(manifest);
  assert.match(execFileSync(process.execPath, ['scripts/generate-learning-content.mjs', '--check'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' }), /"result":"PASS"/);
});
test('read-only Python explanation selects the actual relationship and stratification branch', () => {
  const python = read('python-examples');
  assert.match(python.executionNotice, /不是完整执行器/);
  for (const operationKey of ['ds-relationship', 'ds-stratify']) {
    const snippets = python.snippets.filter(s => s.operationKey === operationKey);
    assert.deepEqual(snippets.map(s => s.relationshipMode), ['GROUP_COMPLETION', 'SCATTER']);
    assert.match(snippets[0].code, /def grouped_completion/);
    assert.match(snippets[0].code, /wilson_95/);
    assert.doesNotMatch(snippets[0].code, /def paired_summary/);
    assert.match(snippets[1].code, /def paired_summary/);
    assert.doesNotMatch(snippets[1].code, /wilson_95/);
  }
  const assets = new Map(manifest.assets.map(a => [a.assetKey, readFileSync(new URL(`../../content/${a.path}`, import.meta.url))]));
  python.snippets = python.snippets.filter(s => s.relationshipMode !== 'GROUP_COMPLETION');
  assets.set('python-examples', Buffer.from(JSON.stringify(python)));
  assert.throws(() => validateDsAssets(assets));
});
test('all ten full dataset goldens match exact JavaScript results and declared result schemas', async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  assert.equal(golden.datasetSha256, createHash('sha256').update(readFileSync(new URL('../../content/ds-learning/1.0.0/learner-activity.json', import.meta.url))).digest('hex'));
  for (const c of golden.cases) {
    const result = await calculateDs(c.operationKey, rows, c.parameters, metadata);
    assert.deepEqual(result, c.result, c.name);
    const schema = manifest.operations.find(o => o.operationKey === c.operationKey).resultSchema;
    const validate = ajv.compile(schema); assert.ok(validate(result), `${c.name}: ${JSON.stringify(validate.errors)}`);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 102400);
  }
});
test('default/median/drop rows, exact duplicate counting and immutable input', async () => {
  const snapshot = JSON.stringify(rows);
  const a = await calculateDs('ds-quality-clean', rows, base, metadata);
  const b = await calculateDs('ds-quality-clean', rows, { ...base, missingPolicy: 'DROP_MISSING' }, metadata);
  const c = await calculateDs('ds-quality-clean', rows, { ...base, missingPolicy: 'MEDIAN_NUMERIC' }, metadata);
  assert.equal(a.retainedRows, 359); assert.equal(a.quality.duplicateRows, 1); assert.equal(b.retainedRows, 335);
  assert.equal(c.retainedRows, 359); assert.equal(c.quality.imputations.reduce((s, f) => s + f.count, 0), 24);
  assert.deepEqual(a.quality.before.map(f => f.missingCount), [10, 8, 6]);
  assert.equal(JSON.stringify(rows), snapshot);
});
test('missing vs not-applicable, pairwise means and mutually exclusive exclusions retain zeros', async () => {
  const data = [toy(1, { avg_session_minutes: 0, assignment_submit_rate: 0 }), toy(2, { avg_session_minutes: 10, assignment_submit_rate: 1 }), toy(3, { avg_session_minutes: null }), toy(4, { lessons_started: 0, avg_session_minutes: null, days_to_first_lesson: null }), toy(5, { lessons_started: 0, avg_session_minutes: null, days_to_first_lesson: null, assignment_submit_rate: null })];
  const r = await calculateDs('ds-relationship', data, scatter, metadata);
  assert.deepEqual(r.exclusions, { missingOnly: 1, notApplicableOnly: 1, both: 1, total: 3 });
  assert.deepEqual(r.relationship.scatter, { n: 2, meanX: 5, meanY: .5, r: 1 });
  assert.deepEqual(r.relationship.points, [{ rowNumber: 1, x: 0, y: 0 }, { rowNumber: 2, x: 10, y: 1 }]);
  const filled = await calculateDs('ds-quality-clean', data, { ...base, missingPolicy: 'MEDIAN_NUMERIC' }, metadata);
  assert.equal(filled.quality.after[0].notApplicableCount, 2); assert.equal(filled.quality.imputations[0].median, 5);
});
test('empty, all-missing, single point and constant axes never fabricate means or r', async () => {
  for (const data of [[], [toy(1, { avg_session_minutes: null })]]) {
    const r = await calculateDs('ds-relationship', data, scatter, metadata); assert.deepEqual(r.relationship.scatter, { n: 0, meanX: null, meanY: null, r: null });
  }
  const empty = await calculateDs('ds-quality-clean', [toy(1, { avg_session_minutes: null })], { ...base, missingPolicy: 'MEDIAN_NUMERIC' }, metadata);
  assert.equal(empty.quality.imputations[0].median, null); assert.equal(empty.quality.imputations[0].count, 0);
  assert.deepEqual(pearson([{ x: 2, y: 3 }]), { n: 1, meanX: 2, meanY: 3, r: null });
  assert.equal(pearson([{ x: 1, y: 0 }, { x: 1, y: 1 }]).r, null);
  assert.equal(pearson([{ x: 0, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 0 }]).r, -1);
});
test('Type7, last histogram edge, Wilson zero and single observation, half-up signs', async () => {
  assert.equal(halfUp6(quantile([30, 0, 10, 20], .95)), 28.5); assert.equal(quantile([], .5), null); assert.equal(quantile([1, 3], .5), 2);
  assert.deepEqual(wilson(0, 0), { lower: null, upper: null }); assert.equal(halfUp6(wilson(1, 1).lower), .206549); assert.equal(halfUp6(wilson(0, 1).upper), .793451);
  assert.equal(halfUp6(-1.2345675), -1.234568); assert.equal(halfUp6(1.2345675), 1.234568);
  const data = [0, 10, 20, 40, 80, 240].map((v, i) => toy(i + 1, { avg_session_minutes: v }));
  const r = await calculateDs('ds-profile', data, { ...base, distributionField: 'avg_session_minutes' }, metadata);
  assert.deepEqual(r.profile.histogram.map(b => b.count), [1, 1, 1, 1, 2]); assert.equal(r.profile.validCount, 6);
  const c = await calculateDs('ds-profile', [0, 10, 20, 30].map((v, i) => toy(i + 1, { avg_session_minutes: v })), { ...base, extremePolicy: 'CAP_P95', distributionField: 'avg_session_minutes' }, metadata);
  assert.equal(c.quality.capValue, 28.5); assert.equal(c.quality.cappedRows, 1); assert.equal(c.profile.mean, 14.625);
});
test('stratification recomputes paired statistics and does not average layer r', async () => {
  const data = [toy(1, { course_track: 'FOUNDATIONS', avg_session_minutes: 0, assignment_submit_rate: .25 }), toy(2, { course_track: 'FOUNDATIONS', avg_session_minutes: 1, assignment_submit_rate: 0 }), toy(3, { course_track: 'APPLIED', avg_session_minutes: 10, assignment_submit_rate: 1 }), toy(4, { course_track: 'APPLIED', avg_session_minutes: 11, assignment_submit_rate: .75 })];
  const r = await calculateDs('ds-stratify', data, { ...scatter, stratifyBy: 'course_track' }, metadata);
  assert.ok(r.stratified.overall.scatter.r > .8); assert.ok(r.stratified.strata.every(s => s.summary.scatter.r === -1));
  assert.ok(!JSON.stringify(r.stratified).includes('points')); assert.equal(r.stratified.strata.reduce((s, v) => s + v.summary.analysisRows, 0), r.analysisRows);
});
test('semantic validator rejects inactive/missing branches, same axes, unknown params and invalid ranges', () => {
  for (const config of [{ ...scatter, xField: scatter.yField }, { ...scatter, groupBy: 'device_group' }, { ...base, relationshipMode: 'SCATTER', xField: 'avg_session_minutes' }, { ...base, relationshipMode: 'GROUP_COMPLETION', groupBy: 'course_track', stratifyBy: 'course_track' }]) assert.throws(() => normalizeParameters(Object.hasOwn(config, 'stratifyBy') ? 'ds-stratify' : 'ds-relationship', config));
  assert.throws(() => normalizeParameters('ds-profile', { ...base, distributionField: 'avg_session_minutes', code: 'x' }));
  assert.throws(() => validateRows([toy(1, { avg_session_minutes: 241 })]));
  assert.deepEqual(normalizeParameters('ds-relationship', Object.fromEntries(Object.entries(scatter).reverse())), normalizeParameters('ds-relationship', scatter));
});
test('v3 own/ancestor bindings strict, v1/v2 hashes unchanged, fixture fields accepted', () => {
  for (const alter of [m => m.operations[0].ownResponseBindings.push(m.operations[0].ownResponseBindings[0]), m => { m.operations[1].inputBindings[0].sourceStepKey = 'd6-conclusion'; }, m => { m.operations[2].parametersSchema.required.push('xField'); }, m => { m.operations[0].datasetAssetKey = 'canonical-events-private'; }]) { const changed = structuredClone(manifest); alter(changed); assert.throws(() => validateManifest(changed, { readAssets: false })); }
  const fixture = JSON.parse(readFileSync(new URL('../examples/p4-ds-run.json', import.meta.url)));
  const ajv = new Ajv2020({ strict: true }); manifest.steps.forEach(s => assert.ok(ajv.compile(s.inputSchema)(fixture.responses[s.stepKey]), s.stepKey));
  for (const [path, expected] of [['ai-support', '813d1ba169586ed56a09fef86caf514c407497668e1f8bb5114a82391cc8e06f'], ['demo-table', '91df4816cae7c7a4e265951ab1ea69c7b02ed5bbf209740eb1ceeeb3595ac97e']]) assert.equal(createHash('sha256').update(readFileSync(new URL(`../../content/${path}/1.0.0/manifest.json`, import.meta.url))).digest('hex'), expected);
});
