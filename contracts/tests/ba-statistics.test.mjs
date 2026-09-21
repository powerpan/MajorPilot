import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { calculateBa, normalizeParameters, validateRows, validateAction, STAGES, TRANSITIONS, GROUPS } from '../../shared/ba/ba-metrics-v1.mjs';
import { validateBaAssets, SOURCE_SHA256 } from '../../shared/ba/validate-assets.mjs';
import { validateManifest, checkContent } from '../check-content.mjs';
const read = key => JSON.parse(readFileSync(new URL(`../../content/ba-learning/1.0.0/${key}.json`, import.meta.url)));
const rows = read('weekly-funnel'), manifest = read('manifest'), golden = read('golden-private'), metadata = { datasetSha256: golden.datasetSha256 };
const fixture = JSON.parse(readFileSync(new URL('../examples/p5-ba-run.json', import.meta.url)));
const windows = { baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 7, comparisonEndWeek: 12 };
const metric = { ...windows, numerator: 'completed_count', denominator: 'enrolled_count' };
const segment = { ...metric, segmentBy: 'course_track', focusTransitionKey: TRANSITIONS[0] };
const projectAction = a => Object.fromEntries(['targetSegmentKey', 'successMetric', 'targetChangePercentagePoints', 'guardrailMetric', 'guardrailMaximum', 'reviewAfterDays'].map(k => [k, a[k]]));
const action = projectAction(fixture.responses['b6-action']);
const ctx = (data = rows, p = segment, key = 'APPLIED') => ({ parameters: p, prioritySegmentKey: key, result: calculateBa('ba-segments', data, p, metadata) });
const zeroRows = () => rows.map(r => ({ ...r, ...Object.fromEntries([...STAGES, 'support_contact_count'].map(k => [k, 0])) }));
const code = expected => error => error.code === expected && error.message === expected;

test('reproducible BA asset generation, frozen source SHA and all 72 independent cohort groups', () => {
  const sourceBytes = readFileSync(new URL('../../content/ds-learning/1.0.0/canonical-events-private.json', import.meta.url));
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), SOURCE_SHA256);
  const source = JSON.parse(sourceBytes); assert.equal(source.records.length, 359);
  const byKey = new Map();
  for (const { row, events } of source.records) {
    const key = `${row.cohort_week}:${row.course_track}:${row.signup_source}`;
    const sums = byKey.get(key) ?? [0, 0, 0, 0, 0, 0, 0];
    const facts = [1, Number(events.first_lesson), Number(events.week_one_active), Number(events.assignment_started), Number(events.assignment_submitted), Number(row.completed), row.support_contacts];
    facts.forEach((n, i) => { sums[i] += n; }); byKey.set(key, sums);
  }
  for (const r of rows) assert.deepEqual([...STAGES, 'support_contact_count'].map(k => r[k]), byKey.get(`${r.week}:${r.course_track}:${r.signup_source}`) ?? [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(rows.filter(r => r.enrolled_count === 0).length, 1);
  assert.equal(source.records.filter(c => c.events.week_one_active && c.row.days_to_first_lesson > 7).length, 40);
  const assets = new Map(manifest.assets.map(a => [a.assetKey, readFileSync(new URL(`../../content/${a.path}`, import.meta.url))]));
  validateBaAssets(assets, sourceBytes); validateManifest(manifest); assert.equal(checkContent().bundles.length, 5);
  assert.throws(() => validateBaAssets(assets, Buffer.from('{}')));
  assert.match(execFileSync(process.execPath, ['scripts/generate-ba-content.mjs', '--check'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' }), /"result":"PASS"/);
});
test('ten full goldens match every declared schema, fixed units and no input mutation', () => {
  const before = JSON.stringify(rows), ajv = new Ajv2020({ strict: true });
  for (const c of golden.cases) { const result = calculateBa(c.operationKey, rows, c.parameters, metadata); assert.deepEqual(result, c.result, c.name); assert.ok(ajv.compile(manifest.operations.find(o => o.operationKey === c.operationKey).resultSchema)(result), c.name); assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 102400); }
  assert.equal(JSON.stringify(rows), before);
  const r = calculateBa('ba-metric', rows, metric, metadata);
  assert.deepEqual(r.baseline, { numeratorCount: 100, denominatorCount: 180, rate: .555556 }); assert.deepEqual(r.comparison, { numeratorCount: 58, denominatorCount: 179, rate: .324022 }); assert.equal(r.deltaPercentagePoints, -23.153321); assert.equal(r.relativeChange, -.416760);
  const conditional = calculateBa('ba-metric', rows, { ...metric, denominator: 'first_lesson_count' }, metadata);
  assert.equal(conditional.baseline.denominatorCount, 166); assert.equal(conditional.comparison.denominatorCount, 142); assert.equal(conditional.deltaPercentagePoints, -19.395893); assert.equal(conditional.relativeChange, -.321972);
  const s = calculateBa('ba-segments', rows, segment, metadata); assert.equal(s.segments.reduce((n, g) => n + g.comparison.supportContactCount, 0), 269);
});
test('ratios use count-weighted periods, cumulative and adjacent denominators remain separate', () => {
  const data = zeroRows(); Object.assign(data[0], { enrolled_count: 100, first_lesson_count: 20, week_one_active_count: 10, assignment_started_count: 10, assignment_submitted_count: 10, completed_count: 10, support_contact_count: 300 });
  Object.assign(data[6], { enrolled_count: 1, first_lesson_count: 1, week_one_active_count: 1, assignment_started_count: 1, assignment_submitted_count: 1, completed_count: 1 });
  const m = calculateBa('ba-metric', data, metric, metadata); assert.equal(m.baseline.rate, .108911); assert.notEqual(m.baseline.rate, .55);
  const f = calculateBa('ba-funnel', data, windows, metadata); assert.equal(f.stages[2].baseline.cumulativeRate, .108911); assert.equal(f.transitions[1].baseline.conversionRate, .52381); assert.equal(f.transitions[1].baseline.lossCount, 10);
  const s = calculateBa('ba-segments', data, segment, metadata); assert.equal(s.segments[0].baseline.supportContactsPer100Enrolled, 297.029703); assert.equal(s.segments[0].baseline.enrolledShare, 1);
});
test('zero denominators, zero baseline, null deltas and exact half-up ties are honest', () => {
  const data = zeroRows(); const m = calculateBa('ba-metric', data, metric, metadata); assert.equal(m.baseline.rate, null); assert.equal(m.relativeChange, null); assert.equal(m.deltaPercentagePoints, null); assert.ok(m.trend.every(p => p.rate === null));
  const f = calculateBa('ba-funnel', data, windows, metadata); assert.equal(f.stages[0].baseline.cumulativeRate, null); assert.equal(f.transitions[0].baseline.lossCount, 0); assert.equal(f.transitions[0].baseline.conversionRate, null);
  const s = calculateBa('ba-segments', data, segment, metadata); assert.equal(s.segments.length, 2); assert.ok(s.segments.every(g => g.baseline.enrolledShare === null && g.comparison.supportContactsPer100Enrolled === null));
  Object.assign(data[0], { enrolled_count: 128 }); Object.assign(data[36], { enrolled_count: 128, first_lesson_count: 1, week_one_active_count: 1, assignment_started_count: 1, assignment_submitted_count: 1, completed_count: 1 });
  const up = calculateBa('ba-metric', data, metric, metadata); assert.equal(up.comparison.rate, .007813); assert.equal(up.relativeChange, null); assert.equal(up.deltaPercentagePoints, .78125);
  Object.assign(data[0], { first_lesson_count: 1, week_one_active_count: 1, assignment_started_count: 1, assignment_submitted_count: 1, completed_count: 1 }); data[36].completed_count = 0;
  assert.equal(calculateBa('ba-metric', data, metric, metadata).relativeChange, -1);
  data[0].enrolled_count = 512; data[36].enrolled_count = 512;
  assert.equal(calculateBa('ba-metric', data, metric, metadata).deltaPercentagePoints, -.195313);
});
test('strict windows, parameters, rows and aggregate integer overflow reject safely', () => {
  for (const changes of [{ baselineStartWeek: '1' }, { baselineStartWeek: 1.5 }, { baselineStartWeek: 0 }, { baselineEndWeek: 7 }, { comparisonEndWeek: 13 }, { comparisonStartWeek: 6 }, { baselineStartWeek: 6, baselineEndWeek: 1 }, { numerator: 'support_contact_count' }, { denominator: null }, { code: 'SELECT secret' }]) assert.throws(() => normalizeParameters('ba-metric', { ...metric, ...changes }), code('BA_PARAMETERS_INVALID'));
  assert.throws(() => normalizeParameters('ba-funnel', metric), code('BA_PARAMETERS_INVALID')); assert.throws(() => normalizeParameters('ba-segments', { ...segment, segmentBy: 'learner_id' }), code('BA_PARAMETERS_INVALID'));
  assert.deepEqual(normalizeParameters('ba-metric', Object.fromEntries(Object.entries(metric).reverse())), normalizeParameters('ba-metric', metric));
  for (const change of [r => r.pop(), r => { r[1] = { ...r[0] }; }, r => { r[0].completed_count = r[0].enrolled_count + 1; }, r => { r[0].support_contact_count = '1'; }, r => { r[0].extra = 1; }]) { const copy = structuredClone(rows); change(copy); assert.throws(() => validateRows(copy), code('BA_DATA_INVALID')); }
  const overflow = zeroRows(); overflow[0].enrolled_count = Number.MAX_SAFE_INTEGER; overflow[1].enrolled_count = 1; assert.throws(() => validateRows(overflow), code('BA_DATA_INVALID'));
  assert.throws(() => calculateBa('ba-metric', rows, metric, { datasetSha256: 'private/path' }), code('BA_DATA_INVALID'));
});
test('B6 validates selected comparison counts, current sources, goals and guardrails without a fourth operation', () => {
  validateAction(action, ctx()); validateAction({ ...action, guardrailMaximum: 0, reviewAfterDays: 42 }, ctx());
  for (const patch of [{ targetSegmentKey: 'FOUNDATIONS' }, { successMetric: 'STARTER_COMPLETION_RATE' }, { targetChangePercentagePoints: 0 }, { targetChangePercentagePoints: -1 }, { targetChangePercentagePoints: 100 }, { targetChangePercentagePoints: '2' }, { guardrailMetric: 'PERCENT' }, { guardrailMaximum: -1 }, { reviewAfterDays: 7 }, { reviewAfterDays: '28' }, { baseline: 1 }]) assert.throws(() => validateAction({ ...action, ...patch }, ctx()), code('BA_ACTION_INVALID'));
  assert.throws(() => validateAction(action, ctx(zeroRows())), code('BA_ACTION_INVALID'));
  const malformed = ctx(); malformed.result.segments[0] = null; assert.throws(() => validateAction(action, malformed), code('BA_ACTION_INVALID'));
  assert.throws(() => validateAction({ ...action, reviewAfterDays: 4294967324 }, ctx()), code('BA_ACTION_INVALID'));
  const stale = ctx(); stale.parameters = { ...segment, baselineEndWeek: 5, comparisonEndWeek: 11 }; assert.throws(() => validateAction(action, stale), code('BA_ACTION_INVALID'));
  const conditional = { ...segment, denominator: 'first_lesson_count' }; validateAction({ ...action, successMetric: 'STARTER_COMPLETION_RATE' }, ctx(rows, conditional));
  const data = zeroRows(); Object.assign(data[39], { enrolled_count: 3, first_lesson_count: 2 });
  validateAction({ ...action, targetChangePercentagePoints: 33.333333 }, ctx(data)); assert.throws(() => validateAction({ ...action, targetChangePercentagePoints: 33.333334 }, ctx(data)), code('BA_ACTION_INVALID'));
  assert.throws(() => normalizeParameters('ba-action', {}), code('BA_PARAMETERS_INVALID'));
});
test('v4 fixes exact operation bindings, private assets and BA identity; fixture is not product defaults', () => {
  const ajv = new Ajv2020({ strict: true }); for (const step of manifest.steps) assert.ok(ajv.compile(step.inputSchema)(fixture.responses[step.stepKey]), step.stepKey);
  assert.ok(ajv.compile(manifest.reflection.inputSchema)(fixture.reflection.answers)); assert.equal(manifest.steps.at(-1).operationKey, null);
  assert.ok(!JSON.stringify(manifest).includes('"default"'));
  for (const mutate of [m => { m.majorCode = 'AI'; }, m => { m.operations[1].ownResponseBindings.push({ parameterKey: 'numerator', sourceField: 'numerator' }); }, m => { m.operations[2].inputBindings[0].sourceStepKey = 'b6-action'; }, m => { m.operations[0].engineType = 'DATA_ANALYSIS'; }, m => { m.operations[0].maxEvaluations = 5; }, m => { m.assets.find(a => a.assetKey === 'golden-private').visibility = 'PUBLIC'; }, m => { m.operations[0].datasetAssetKey = 'source-provenance-private'; }]) { const modified = structuredClone(manifest); mutate(modified); assert.throws(() => validateManifest(modified, { readAssets: false })); }
  assert.deepEqual(manifest.operations[1].ownResponseBindings, []); assert.deepEqual(manifest.operations.map(o => o.maxEvaluations), [30, 30, 30]);
});
