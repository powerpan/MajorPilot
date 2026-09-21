import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkP5, loadP5Contracts } from '../check-p5.mjs';
const { original, schemas } = await loadP5Contracts();
const vector = { 'b2-metric': 1, 'b3-funnel': 2, 'b4-segment': 3 };
test('P5 strictly compiles and keeps common P4 routes and schemas aligned', async () => {
  assert.equal((await checkP5()).result, 'PASS');
  const p4 = JSON.parse(readFileSync(new URL('../openapi-p4.json', import.meta.url), 'utf8'));
  assert.deepEqual(original.paths, p4.paths);
  for (const [name, schema] of Object.entries(p4.components.schemas)) assert.deepEqual(original.components.schemas[name], schema, name);
});
test('BA execution is fixed, saved-source-only, while legacy execution stays valid', () => {
  const value = { operationKey: 'ba-metric', inputRevision: 1, parameters: {}, expectedSourceRevisions: {} };
  assert.ok(schemas.ExecuteBA(value));
  assert.ok(schemas.ExecuteBA({ ...value, operationKey: 'ba-funnel', expectedSourceRevisions: { 'b2-metric': 1 } }));
  assert.equal(schemas.ExecuteBA({ ...value, parameters: { denominator: 'enrolled_count' } }), false);
  assert.equal(schemas.ExecuteBA({ ...value, operationKey: 'ba-action' }), false);
  const { expectedSourceRevisions, ...legacy } = value;
  assert.equal(schemas.ExecuteBA(legacy), false); assert.ok(schemas.Execute(legacy));
});
test('B6 action completion has an exact typed vector without changing run revision commands', () => {
  assert.ok(schemas.CompleteBAAction({ expectedRevision: 1, expectedSourceRevisions: vector }));
  assert.ok(schemas.StepCompletion({ expectedRevision: 1 }), 'Old step requests stay valid');
  assert.equal(schemas.CompleteBAAction({ expectedRevision: 1 }), false);
  for (const invalid of [{ ...vector, 'b5-hypothesis': 1 }, { ...vector, 'b2-metric': '1' }, { ...vector, 'b2-metric': 0 }, { 'b2-metric': 1 }, null, []]) {
    assert.equal(schemas.CompleteBAAction({ expectedRevision: 1, expectedSourceRevisions: invalid }), false);
  }
  assert.equal(schemas.Revision({ expectedRevision: 1, expectedSourceRevisions: vector }), false, 'Not added to pause/resume/task completion');
});
test('B6 context exposes only selected aggregate data and preserves units/null', () => {
  const stageCounts = { enrolled_count: 10, first_lesson_count: 8, week_one_active_count: 7, assignment_started_count: 6, assignment_submitted_count: 5, completed_count: 4 };
  const context = { parameters: { numerator: 'completed_count', denominator: 'enrolled_count', baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 7, comparisonEndWeek: 12, segmentBy: 'course_track', focusTransitionKey: 'ENROLLED_TO_FIRST_LESSON' }, prioritySegmentKey: 'FOUNDATIONS', sourceRevisions: vector, comparison: { stageCounts, enrolledShare: 0.5, metric: { numeratorCount: 4, denominatorCount: 10, rate: 0.4 }, focusTransition: { numeratorCount: 8, denominatorCount: 10, conversionRate: 0.8, lossCount: 2 }, supportContactCount: 30, supportContactsPer100Enrolled: 300 } };
  assert.ok(schemas.BaActionContext(context), JSON.stringify(schemas.BaActionContext.errors));
  assert.equal(schemas.BaActionContext({ ...context, allGroups: [] }), false);
  assert.equal(schemas.BaActionContext({ ...context, executionInternalId: 1 }), false);
  assert.ok(schemas.BaRatio({ numeratorCount: 0, denominatorCount: 0, rate: null }));
  assert.equal(schemas.BaRatio({ numeratorCount: 0, denominatorCount: 0 }), false);
});
