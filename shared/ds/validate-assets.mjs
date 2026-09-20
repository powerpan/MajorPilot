// Publication-time validation only; never bundled into the browser executor.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { calculateDsPrepared, validateRows, NUMERIC_FIELDS, GROUPS } from './ds-stats-v1.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
export function validateDsAssets(assets) {
  const read = key => JSON.parse(assets.get(key));
  const rows = read('learner-activity'), source = read('canonical-events-private'), golden = read('golden-private');
  validateRows(rows); assert.equal(rows.length, 360); assert.equal(source.records.length, 359);
  assert.equal(new Set(rows.map(r => r.learner_id)).size, 359);
  const canonical = source.records.map(r => r.row); validateRows(canonical);
  assert.equal(new Set(canonical.map(r => r.learner_id)).size, 359);
  assert.equal(source.seed, 271828); assert.equal(source.generatorVersion, 'learning-synthetic-v1');
  const csv = assets.get('learner-activity-csv').toString('utf8').trimEnd().split('\n'), columns = Object.keys(rows[0]);
  assert.equal(csv[0], columns.join(',')); assert.equal(csv.length, 361);
  rows.forEach((r, i) => assert.equal(csv[i + 1], columns.map(k => r[k] === null ? '' : typeof r[k] === 'boolean' ? Number(r[k]) : r[k]).join(',')));
  const injected = new Set();
  NUMERIC_FIELDS.forEach((field, index) => { const ids = source.injectedMissing[field]; assert.equal(ids.length, [10, 8, 6][index]); ids.forEach(id => { assert.ok(!injected.has(id)); injected.add(id); }); });
  assert.equal(injected.size, 24); assert.ok(!injected.has(source.duplicateLearnerId));
  for (const row of rows) {
    const original = canonical.find(r => r.learner_id === row.learner_id); assert.ok(original);
    for (const key of columns) assert.deepEqual(row[key], source.injectedMissing[key]?.includes(row.learner_id) ? null : original[key]);
  }
  assert.equal(rows.filter(r => r.learner_id === source.duplicateLearnerId).length, 2);
  for (const original of source.records) {
    const r = original.row, e = original.events;
    assert.equal(r.completed, r.lessons_completed === 8 && r.assignment_submit_rate === 1);
    assert.equal(e.first_lesson, r.lessons_started > 0); assert.equal(e.assignment_submitted, r.assignment_submit_rate > 0);
    assert.ok(!e.week_one_active || e.first_lesson); assert.ok(!e.assignment_started || e.week_one_active); assert.ok(!e.assignment_submitted || e.assignment_started); assert.ok(!r.completed || e.assignment_submitted);
  }
  assert.equal(source.futureWeeklyFunnel.length, 72);
  for (let week = 1; week <= 12; week++) {
    assert.equal(canonical.filter(r => r.cohort_week === week).length, week === 12 ? 29 : 30);
    for (const course_track of GROUPS.course_track) for (const signup_source of GROUPS.signup_source) {
      const entries = source.records.filter(c => c.row.cohort_week === week && c.row.course_track === course_track && c.row.signup_source === signup_source);
      const actual = source.futureWeeklyFunnel.filter(f => f.week === week && f.course_track === course_track && f.signup_source === signup_source); assert.equal(actual.length, 1);
      assert.deepEqual(actual[0], { week, course_track, signup_source, enrolled_count: entries.length, first_lesson_count: entries.filter(c => c.events.first_lesson).length, week_one_active_count: entries.filter(c => c.events.week_one_active).length, assignment_started_count: entries.filter(c => c.events.assignment_started).length, assignment_submitted_count: entries.filter(c => c.events.assignment_submitted).length, completed_count: entries.filter(c => c.row.completed).length, support_contact_count: entries.reduce((s, c) => s + c.row.support_contacts, 0) });
    }
  }
  assert.equal(golden.datasetSha256, sha(assets.get('learner-activity'))); assert.equal(golden.cases.length, 10);
  for (const c of golden.cases) {
    const cleaning = Object.fromEntries(['duplicatePolicy', 'extremePolicy', 'missingPolicy'].map(k => [k, c.parameters[k]]));
    assert.deepEqual(c.result, calculateDsPrepared(c.operationKey, rows, c.parameters, { datasetSha256: golden.datasetSha256, cleaningConfigSha256: sha(JSON.stringify(cleaning)) }));
  }
  assert.equal(read('review-private').professionalReview, 'PENDING'); assert.equal(read('review-private').targetUserTiming, 'PENDING');
  const dictionary = read('data-dictionary'); assert.deepEqual(dictionary.fields.map(f => f.fieldKey), columns);
  const python = read('python-examples');
  assert.equal(python.schemaVersion, 'ds-python-examples-v1');
  assert.match(python.executionNotice, /不.*执行Python/);
  assert.match(python.executionNotice, /不是完整执行器/);
  const expectedSnippets = ['ds-quality-clean:', 'ds-profile:', 'ds-relationship:GROUP_COMPLETION', 'ds-relationship:SCATTER', 'ds-stratify:GROUP_COMPLETION', 'ds-stratify:SCATTER'];
  assert.deepEqual(python.snippets.map(s => `${s.operationKey}:${s.relationshipMode ?? ''}`).sort(), expectedSnippets.sort());
  for (const snippet of python.snippets) {
    assert.deepEqual(Object.keys(snippet).sort(), ['operationKey', 'title', 'code', ...(snippet.relationshipMode ? ['relationshipMode'] : [])].sort());
    assert.ok(typeof snippet.title === 'string' && snippet.title.length > 0 && typeof snippet.code === 'string' && snippet.code.length > 0);
  }
}
