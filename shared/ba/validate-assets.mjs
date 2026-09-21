import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { calculateBa, validateRows, STAGES, TRANSITIONS, GROUPS } from './ba-metrics-v1.mjs';
export const SOURCE_SHA256 = '9f09364c467d56256b66c9a2da25bf051f0c784bad22795418fd541a7f199cf6';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateBaAssets(assets, canonicalBytes) {
  const expectedKeys = ['weekly-funnel', 'weekly-funnel-csv', 'data-dictionary', 'business-brief', 'sql-examples', 'source-provenance-private', 'golden-private', 'review-private'];
  assert.deepEqual([...assets.keys()].sort(), expectedKeys.sort());
  const read = key => JSON.parse(assets.get(key)), rows = read('weekly-funnel'), provenance = read('source-provenance-private'), golden = read('golden-private');
  validateRows(rows); assert.equal(sha(canonicalBytes), SOURCE_SHA256);
  const source = JSON.parse(canonicalBytes); assert.equal(source.records.length, 359);
  const aggregate = [];
  for (let week = 1; week <= 12; week++) for (const course_track of GROUPS.course_track) for (const signup_source of GROUPS.signup_source) {
    const group = source.records.filter(c => c.row.cohort_week === week && c.row.course_track === course_track && c.row.signup_source === signup_source);
    aggregate.push({ week, course_track, signup_source, enrolled_count: group.length, first_lesson_count: group.filter(c => c.events.first_lesson).length, week_one_active_count: group.filter(c => c.events.week_one_active).length, assignment_started_count: group.filter(c => c.events.assignment_started).length, assignment_submitted_count: group.filter(c => c.events.assignment_submitted).length, completed_count: group.filter(c => c.row.completed).length, support_contact_count: group.reduce((sum, c) => sum + c.row.support_contacts, 0) });
  }
  assert.deepEqual(rows, aggregate); assert.deepEqual(rows, source.futureWeeklyFunnel);
  const columns = ['week', 'course_track', 'signup_source', ...STAGES, 'support_contact_count'];
  assert.equal(assets.get('weekly-funnel-csv').toString('utf8'), [columns.join(','), ...rows.map(r => columns.map(k => r[k]).join(','))].join('\n') + '\n');
  assert.equal(provenance.schemaVersion, 'ba-provenance-v1'); assert.equal(provenance.sourceCanonicalSha256, SOURCE_SHA256); assert.equal(provenance.uniqueLearners, 359); assert.equal(provenance.aggregateRows, 72);
  const datasetSha256 = sha(assets.get('weekly-funnel')); assert.equal(provenance.datasetSha256, datasetSha256); assert.equal(golden.schemaVersion, 'ba-golden-v1'); assert.equal(golden.datasetSha256, datasetSha256); assert.equal(golden.cases.length, 10);
  assert.equal(new Set(golden.cases.map(c => c.name)).size, 10);
  for (const c of golden.cases) assert.deepEqual(c.result, calculateBa(c.operationKey, rows, c.parameters, { datasetSha256 }), c.name);
  const dictionary = read('data-dictionary'); assert.equal(dictionary.schemaVersion, 'ba-dictionary-v1'); assert.deepEqual(dictionary.fields.map(f => f.fieldKey), columns); assert.deepEqual(dictionary.groupOrder, GROUPS); assert.deepEqual(dictionary.stageOrder, STAGES); assert.deepEqual(dictionary.transitions.map(t => t.transitionKey), TRANSITIONS);
  assert.match(dictionary.fields.find(f => f.fieldKey === 'week_one_active_count').description, /首次开课后7天/);
  const sql = read('sql-examples'); assert.equal(sql.schemaVersion, 'ba-sql-examples-v1'); assert.match(sql.executionNotice, /不在浏览器或服务器执行学生SQL/); assert.deepEqual(sql.snippets.map(s => s.operationKey), ['ba-metric', 'ba-funnel', 'ba-segments']);
  for (const s of sql.snippets) { assert.deepEqual(Object.keys(s).sort(), ['code', 'operationKey', 'title']); assert.ok(s.code.length > 0 && s.title.length > 0); }
  assert.equal(read('business-brief').schemaVersion, 'ba-brief-v1');
  const review = read('review-private'); assert.equal(review.status, 'REVIEW'); assert.equal(review.professionalReview, 'PENDING'); assert.equal(review.targetUserTiming, 'PENDING');
}
