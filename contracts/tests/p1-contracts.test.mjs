import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadP1Contracts, checkP1 } from '../check-p1.mjs';
const contracts = await loadP1Contracts();
const fixture = JSON.parse(readFileSync(new URL('../examples/p1-intake.json', import.meta.url), 'utf8'));
const valid = (name, value) => { const validator = contracts.schemas[name]; assert.equal(validator(value), true, JSON.stringify(validator.errors)); };
const invalid = (name, value) => assert.equal(contracts.schemas[name](value), false);

test('all P1 operations and JSON schemas compile without external references', async () => { assert.equal((await checkP1()).result, 'PASS'); });
test('P1 method and path inventory matches its local domain and identity controllers', () => {
  const root = new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/', import.meta.url);
  const sources = ['auth', 'intake', 'recommendation', 'analytics', 'shared'].flatMap(directory => {
    const path = new URL(`${directory}/`, root);
    // P7 owns this later controller and checks its complete route/permission inventory.
    return readdirSync(path).filter(file => file.endsWith('Controller.java') && !['AccountSettingsController.java', 'ProfileController.java'].includes(file)).map(file => readFileSync(new URL(file, path), 'utf8'));
  });
  const implemented = sources.flatMap(source => {
    const base = source.match(/@RequestMapping\("([^"]*)"\)/u)?.[1] ?? '';
    return [...source.matchAll(/@(Get|Post|Delete|Put|Patch)Mapping\("([^"]+)"\)/gu)].map(match => `${match[1].toLowerCase()} ${base}${match[2]}`);
  }).sort();
  assert.deepEqual(contracts.operations.map(item => `${item.method} ${item.path}`).sort(), implemented);
});
test('thirteen camelCase answers support tied scenarios and do not restrict majors by background', () => {
  valid('ProfileInput', fixture);
  const answers = structuredClone(fixture.answers);
  answers.scenarioPreference.forEach(item => { item.rank = 1; });
  answers.consideredMajors = ['AI', 'DATA_SCIENCE', 'BUSINESS_ANALYTICS'];
  valid('Answers', answers);
  delete answers.acquisitionChannel; delete answers.mainQuestion; delete answers.currentFieldText;
  valid('Answers', answers);
  invalid('Answers', { ...answers, application_stage: 'EXPLORING' });
  invalid('Answers', { ...answers, consideredMajors: ['DS'] });
});
test('drafts allow partial page work but submissions require complete matrices and scenario coverage', () => {
  valid('DraftAnswers', { majorFamiliarity: { AI: 'UNFAMILIAR' }, workElements: [], scenarioPreference: [] });
  invalid('Answers', { ...fixture.answers, majorFamiliarity: { AI: 'UNFAMILIAR' } });
  invalid('Answers', { ...fixture.answers, scenarioPreference: [] });
  invalid('Answers', { ...fixture.answers, workElements: ['CHECK_ERRORS', 'ADJUST_EXPERIMENTS', 'CLEAN_DATA', 'DEFINE_METRICS'] });
});
test('revision conflict details are explicit and unknown error properties are rejected', () => {
  const failure = { error: { code: 'INTAKE_REVISION_CONFLICT', message: 'Request could not be completed', fieldErrors: [], retryable: false, details: { currentRevision: 2 } }, meta: { requestId: 'fixture-request' } };
  valid('Error', failure);
  invalid('Error', { ...failure, error: { ...failure.error, details: { revision: 2 } } });
  delete failure.error.details; valid('Error', failure);
});
test('page observations cannot spoof backend facts, answers or actor IDs', () => {
  const event = { clientEventId: 'd53014cc-2eb2-4f9d-82de-e31a7118caac', eventName: 'recommendation.viewed', eventVersion: 'v1', occurredAt: '2026-09-20T00:00:00Z', contextType: 'RECOMMENDATION', contextPublicId: '01K5HZ4Y110000000000000000', visibleDurationMs: 1000, properties: {} };
  valid('PageEvents', { events: [event] });
  invalid('PageEvents', { events: [{ ...event, eventName: 'student.registration.completed' }] });
  invalid('PageEvents', { events: [{ ...event, properties: { primaryMajor: 'AI' } }] });
  invalid('PageEvents', { events: [{ ...event, studentId: event.contextPublicId }] });
  invalid('PageEvents', { events: [{ ...event, visibleDurationMs: 999 }] });
  invalid('PageEvents', { events: [{ ...event, visibleDurationMs: 1000.5 }] });
  const missingDuration = { ...event }; delete missingDuration.visibleDurationMs;
  invalid('PageEvents', { events: [missingDuration] });
});
test('event acknowledgement matches controller duplicateCount and P1 has no task-start request', () => {
  valid('EventAccepted', { acceptedCount: 1, duplicateCount: 0 });
  invalid('EventAccepted', { acceptedCount: 1, deduplicatedCount: 0 });
  assert.ok(contracts.operations.every(item => !item.path.includes('/runs')));
});
test('health dependency failure is a typed 503 success envelope, not a generic safe error', () => {
  const operation = contracts.operations.find(item => item.id === 'readLocalHealth');
  const body = { data: { scope: 'local-only', database: 'UP', redis: 'DOWN', migration: 'UP', model: 'NOT_CHECKED', mail: 'NOT_CHECKED' }, meta: { requestId: 'fixture-request', apiVersion: 'v1' } };
  assert.equal(operation.responses['503'](body), true);
  assert.equal(operation.responses['503']({ data: { status: 'UP' }, meta: body.meta }), false);
});
test('P3 publication projection accepts formal availability and run states without preview status leakage', () => {
  const majors = ['AI', 'DATA_SCIENCE', 'BUSINESS_ANALYTICS'].map(majorCode => ({ majorCode, name: majorCode, status: 'NOT_STARTED', availability: 'UNAVAILABLE' }));
  const dashboard = { recommendation: null, majors, currentDecision: null, nextStep: 'TASK_CONTENT_PREPARING', profile: null };
  valid('Dashboard', dashboard);
  for (const status of ['READY', 'IN_PROGRESS', 'PAUSED', 'TASK_COMPLETED', 'CLOSED']) {
    dashboard.majors[0] = { ...majors[0], availability: 'AVAILABLE', status };
    dashboard.nextStep = 'SELECT_EXPERIENCE'; valid('Dashboard', dashboard);
  }
  dashboard.majors.forEach(major => { major.status = 'CLOSED'; });
  dashboard.nextStep = 'ALL_COMPLETED'; valid('Dashboard', dashboard);
  dashboard.majors[0].status = 'REVIEW_PREVIEW'; invalid('Dashboard', dashboard);
});
