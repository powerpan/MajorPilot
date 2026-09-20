import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadP1Contracts } from '../contracts/check-p1.mjs';
import { mysqlCommand } from './infra.mjs';

// Synthetic loopback acceptance only. At most two anonymous Intakes, no registration,
// mail or provider request. Cookies remain in memory; no rejected payload is logged.
const base = 'http://127.0.0.1:18080';
const fixture = JSON.parse(readFileSync(new URL('../contracts/examples/p1-intake.json', import.meta.url), 'utf8'));
const { operations } = await loadP1Contracts();
const created = new Set();
const checks = [];
let complete = false;
const idPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function operation(path, method) {
  const match = operations.find(item => item.method === method.toLowerCase() && new RegExp(`^${item.path.replaceAll('{id}', '[^/]+')}$`).test(path));
  assert.ok(match, 'Missing P1 contract operation');
  return match;
}
class Client {
  cookies = new Map();
  async call(path, { method = 'GET', body, headers = {}, origin = 'http://localhost:15173', csrf = true } = {}) {
    const write = method !== 'GET';
    const cookie = [...this.cookies].filter(([, value]) => value.path === '/' || path === value.path || path.startsWith(`${value.path}/`)).map(([key, value]) => `${key}=${value.value}`).join('; ');
    const response = await fetch(base + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
        ...(write ? { 'Content-Type': 'application/json' } : {}),
        ...(write && csrf ? { 'X-CSRF-Token': this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '' } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookies = response.headers.getSetCookie();
    for (const value of setCookies) {
      const parts = value.split(';').map(item => item.trim()), equal = parts[0].indexOf('='), key = parts[0].slice(0, equal);
      if (parts.some(item => /^Max-Age=0$/i.test(item))) this.cookies.delete(key);
      else this.cookies.set(key, { value: parts[0].slice(equal + 1), path: parts.find(item => /^Path=/i.test(item))?.slice(5) || '/' });
    }
    const value = response.status === 204 ? null : await response.json();
    // Capture the exact server-assigned ID before schema assertions, so failure cleanup
    // still covers a successfully created fixture with an unexpectedly shaped response.
    if (path === '/api/public/v1/intake-sessions' && method === 'POST' && idPattern.test(value?.data?.intakeSessionId)) created.add(value.data.intakeSessionId);
    const op = operation(path, method), validate = op.responses[String(response.status)] ?? op.responses.default;
    if (validate) {
      assert.equal(validate(value), true, `${op.id}: response schema mismatch (${validate.errors?.map(error => error.instancePath + ':' + error.keyword).join(',') || 'unknown'})`);
    } else assert.equal(response.status, 204, 'Missing response validator');
    return { status: response.status, body: value, setCookies };
  }
  async csrf() { expect(await this.call('/api/public/v1/auth/csrf'), 200, 'public CSRF bootstrap'); }
}
function expect(response, status, label, code) {
  assert.equal(response.status, status, `${label}: HTTP ${response.status}; error=${response.body?.error?.code || 'none'}`);
  if (code) assert.equal(response.body?.error?.code, code, label);
  return response.body?.data;
}
function sqlIds(ids = [...created]) {
  assert.ok(ids.length <= 2 && ids.every(id => idPattern.test(id)), 'Unsafe synthetic Intake scope');
  return ids.length ? ids.map(id => `'${id}'`).join(',') : "'no-fixture'";
}
function query(sql) { return mysqlCommand(`USE majorpilot; ${sql}`).trim(); }
function viewCount(id) { return Number(query(`SELECT COUNT(*) FROM mp_product_event e JOIN mp_intake_session i ON i.id=e.intake_session_id WHERE i.public_id IN (${sqlIds([id])}) AND e.event_name='recommendation.viewed';`)); }
function expiry(id) { return query(`SELECT CAST(expires_at AS CHAR) FROM mp_intake_session WHERE public_id IN (${sqlIds([id])});`); }
function observation(recommendationId, overrides = {}) {
  return { clientEventId: randomUUID(), eventName: 'recommendation.viewed', eventVersion: 'v1', occurredAt: new Date().toISOString(), contextType: 'RECOMMENDATION', contextPublicId: recommendationId, visibleDurationMs: 1000, properties: {}, ...overrides };
}
async function createIntake() {
  assert.ok(created.size < 2, 'Only two synthetic Intakes are permitted');
  const client = new Client(); await client.csrf();
  const intake = expect(await client.call('/api/public/v1/intake-sessions', { method: 'POST', body: { questionnaireVersion: fixture.questionnaireVersion } }), 201, 'create synthetic Intake');
  const recommendation = expect(await client.call(`/api/public/v1/intake-sessions/${intake.intakeSessionId}/submit`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: { ...fixture, expectedRevision: intake.revision } }), 201, 'submit synthetic Intake');
  return { client, intakeId: intake.intakeSessionId, recommendationId: recommendation.recommendationId };
}
async function events(client, items, options = {}) { return client.call('/api/public/v1/events', { method: 'POST', body: { events: items }, ...options }); }
async function rejectedWithoutRenewal(actor, items, status, label, code = 'EVENT_BATCH_INVALID', options = {}) {
  const before = expiry(actor.intakeId), beforeCount = viewCount(actor.intakeId);
  const response = await events(actor.client, items, options);
  expect(response, status, label, code);
  assert.equal(expiry(actor.intakeId), before, `${label}: failure renewed Intake expiry`);
  assert.equal(viewCount(actor.intakeId), beforeCount, `${label}: failure wrote an event`);
  assert.ok(!response.setCookies.some(value => value.startsWith('MP_INTAKE=')), `${label}: failure renewed Intake cookie`);
}
function cleanup() {
  if (!created.size) return;
  const intakeSelector = `SELECT id FROM mp_intake_session WHERE public_id IN (${sqlIds()})`;
  assert.equal(Number(query(`SELECT COUNT(*) FROM mp_intake_session WHERE public_id IN (${sqlIds()}) AND (claimed_student_id IS NOT NULL OR status='CLAIMED');`)), 0, 'Refusing to delete claimed data');
  const profileSelector = `SELECT id FROM mp_decision_profile WHERE intake_session_id IN (${intakeSelector})`;
  const recommendationSelector = `SELECT id FROM mp_recommendation WHERE decision_profile_id IN (${profileSelector})`;
  query(`START TRANSACTION;
    DELETE FROM mp_product_event WHERE student_id IS NULL AND (intake_session_id IN (${intakeSelector}) OR recommendation_id IN (${recommendationSelector}));
    DELETE FROM mp_recommendation_reason WHERE recommendation_id IN (${recommendationSelector});
    DELETE FROM mp_recommendation WHERE student_id IS NULL AND decision_profile_id IN (${profileSelector});
    DELETE FROM mp_decision_answer WHERE decision_profile_id IN (${profileSelector});
    DELETE FROM mp_decision_profile WHERE student_id IS NULL AND intake_session_id IN (${intakeSelector});
    DELETE FROM mp_idempotency_record WHERE owner_student_id IS NULL AND owner_intake_session_id IN (${intakeSelector});
    DELETE FROM mp_consent_record WHERE student_id IS NULL AND intake_session_id IN (${intakeSelector});
    DELETE FROM mp_intake_session WHERE claimed_student_id IS NULL AND public_id IN (${sqlIds()});
    COMMIT;`);
  assert.equal(Number(query(`SELECT COUNT(*) FROM mp_intake_session WHERE public_id IN (${sqlIds()});`)), 0, 'Synthetic Intake cleanup failed');
}
try {
  expect(await new Client().call('/api/public/v1/health'), 200, 'local readiness');
  const one = await createIntake(), two = await createIntake();
  const valid = observation(one.recommendationId), second = observation(two.recommendationId, { clientEventId: valid.clientEventId });
  const anonymous = new Client(); await anonymous.csrf();
  expect(await events(anonymous, [valid]), 401, 'no Intake credential', 'AUTH_REQUIRED');
  expect(await one.client.call('/api/app/v1/events', { method: 'POST', body: { events: [valid] } }), 401, 'Intake cookie cannot act as student', 'AUTH_REQUIRED');
  await rejectedWithoutRenewal(one, [valid], 403, 'missing CSRF', 'CSRF_INVALID', { csrf: false });
  await rejectedWithoutRenewal(one, [valid], 403, 'foreign origin', 'CSRF_INVALID', { origin: 'https://example.invalid' });
  checks.push('anonymous and student authentication, signed CSRF and exact Origin');

  for (const duration of [null, 0, 999, 86400001]) await rejectedWithoutRenewal(one, [observation(one.recommendationId, { visibleDurationMs: duration })], 422, 'visibility duration boundary');
  const missingDuration = { ...valid }; delete missingDuration.visibleDurationMs;
  await rejectedWithoutRenewal(one, [missingDuration], 422, 'missing visibility duration');
  for (const duration of [1000.5, '1000']) await rejectedWithoutRenewal(one, [observation(one.recommendationId, { visibleDurationMs: duration })], 400, 'visibility duration must be JSON integer', 'VALIDATION_ERROR');
  checks.push('minimum one-second client-observed visibility with strict bounded integer shape');

  for (const name of ['recommendation.generated', 'student.registration.completed', 'student.email.verified']) await rejectedWithoutRenewal(one, [observation(one.recommendationId, { eventName: name })], 422, 'client cannot invent a backend fact');
  for (const properties of [{ primaryMajor: 'AI' }, { email: 'synthetic@example.invalid' }, { answers: fixture.answers }]) await rejectedWithoutRenewal(one, [observation(one.recommendationId, { properties })], 422, 'client properties whitelist');
  await rejectedWithoutRenewal(one, [observation(one.recommendationId, { studentId: 'synthetic-untrusted-subject' })], 400, 'unknown client actor field', 'VALIDATION_ERROR');
  for (const occurredAt of [new Date(Date.now() - 86401000).toISOString(), new Date(Date.now() + 600000).toISOString()]) await rejectedWithoutRenewal(one, [observation(one.recommendationId, { occurredAt })], 422, 'stale or future observation');
  await rejectedWithoutRenewal(one, [], 422, 'empty batch');
  await rejectedWithoutRenewal(one, Array.from({ length: 21 }, () => valid), 422, 'oversized batch');
  checks.push('business facts, PII, forged actor and unsupported timestamps/batches rejected without renewal');

  await rejectedWithoutRenewal(one, [observation(two.recommendationId)], 422, 'cross-Intake ownership');
  await rejectedWithoutRenewal(one, [valid, observation(two.recommendationId)], 422, 'mixed-owner batch atomicity');
  assert.equal(viewCount(one.intakeId), 0); assert.equal(viewCount(two.intakeId), 0);
  checks.push('cross-Intake rejection and whole-batch rollback before first insertion');

  assert.deepEqual(expect(await events(one.client, [valid]), 202, 'own Intake first observation'), { acceptedCount: 1, duplicateCount: 0 });
  assert.deepEqual(expect(await events(one.client, [valid]), 202, 'same client event replay'), { acceptedCount: 0, duplicateCount: 1 });
  assert.deepEqual(expect(await events(one.client, [observation(one.recommendationId)]), 202, 'new UUID same context first-view dedupe'), { acceptedCount: 0, duplicateCount: 1 });
  assert.deepEqual(expect(await events(two.client, [second]), 202, 'client UUID namespace is actor scoped'), { acceptedCount: 1, duplicateCount: 0 });
  assert.equal(viewCount(one.intakeId), 1); assert.equal(viewCount(two.intakeId), 1);
  const badProperties = Number(query(`SELECT COUNT(*) FROM mp_product_event e JOIN mp_intake_session i ON i.id=e.intake_session_id JOIN mp_recommendation r ON r.id=e.recommendation_id WHERE i.public_id IN (${sqlIds()}) AND e.event_name='recommendation.viewed' AND (e.source<>'STUDENT_WEB' OR e.student_id IS NOT NULL OR JSON_LENGTH(e.properties_json)<>1 OR JSON_UNQUOTE(JSON_EXTRACT(e.properties_json,'$.primaryMajor'))<>r.primary_major_code);`));
  assert.equal(badProperties, 0, 'Stored observation must contain only server-derived primaryMajor');
  checks.push('actor UUID namespace, first-context dedupe and server-derived properties');
  complete = true;
} finally { cleanup(); }
console.log(JSON.stringify({ scope: 'synthetic local P1 page observations; not proof of browser visibility', result: complete ? 'PASS' : 'FAIL', checks, contractsValidated: true, syntheticIntakesRemoved: created.size, registrationCalls: 0, paidModelCalls: 0, fixtureCleanup: true }));
