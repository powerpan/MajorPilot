import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mysqlCommand } from './infra.mjs';
import { loadP1Contracts } from '../contracts/check-p1.mjs';

// Local-only HTTP acceptance. Fixtures are synthetic; credentials and mail tokens
// stay in memory. Cleanup targets only IDs/emails created by this invocation.
const base = 'http://127.0.0.1:18080';
const mailBase = 'http://127.0.0.1:18025';
const fixture = JSON.parse(readFileSync(new URL('../contracts/examples/p1-intake.json', import.meta.url), 'utf8'));
const run = randomBytes(8).toString('hex');
const emails = [0, 1].map(n => `p1-${run}-${n}@example.invalid`);
const password = `Synthetic-${randomBytes(24).toString('hex')}`;
const newPassword = `Changed-${randomBytes(24).toString('hex')}`;
const createdIntakes = new Set();
const capturedMail = new Set();
const checks = [];
const { operations } = await loadP1Contracts();
const validatedOperations = new Set();

class Client {
  cookies = new Map();
  clone() { const c = new Client(); c.cookies = new Map(this.cookies); return c; }
  async call(path, { method = 'GET', body, headers = {}, csrf = method !== 'GET' } = {}) {
    const cookie = [...this.cookies].filter(([, c]) => c.path === '/' || path === c.path || path.startsWith(`${c.path}/`))
      .map(([key, c]) => `${key}=${c.value}`).join('; ');
    const writes = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const response = await fetch(base + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        Origin: 'http://localhost:15173', ...(cookie ? { Cookie: cookie } : {}),
        ...(writes ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '' } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookies = response.headers.getSetCookie();
    for (const value of setCookies) {
      const parts = value.split(';').map(x => x.trim());
      const equal = parts[0].indexOf('=');
      const key = parts[0].slice(0, equal);
      if (parts.some(x => /^Max-Age=0$/i.test(x))) this.cookies.delete(key);
      else this.cookies.set(key, { value: parts[0].slice(equal + 1), path: parts.find(x => /^Path=/i.test(x))?.slice(5) || '/' });
    }
    let result = null;
    try { result = await response.json(); } catch { /* 204 is deliberately empty. */ }
    if (method === 'POST' && path === '/api/public/v1/intake-sessions' && response.status === 201 && result?.data?.intakeSessionId) createdIntakes.add(result.data.intakeSessionId);
    const operation = operations.find(op => op.method === method.toLowerCase() && op.path.split('/').length === path.split('/').length && op.path.split('/').every((part, i) => part.startsWith('{') || part === path.split('/')[i]));
    if (operation) {
      const validator = operation.responses[String(response.status)] ?? operation.responses.default;
      if (response.status === 204) assert.equal(result, null, `${operation.id}: 204 must have no body`);
      else {
        assert.ok(validator, `${operation.id}: no response contract`);
        assert.ok(validator(result), `${operation.id}: response contract violation (values suppressed)`);
      }
      validatedOperations.add(operation.id);
    }
    return { status: response.status, body: result, headers: response.headers, setCookies };
  }
  async publicCsrf() { expect(await this.call('/api/public/v1/auth/csrf'), 200, 'public CSRF bootstrap'); }
}

function expect(response, status, label, errorCode) {
  // Never include complete response bodies, submitted answers or credentials in errors.
  assert.equal(response.status, status, `${label}: HTTP ${response.status}; error=${response.body?.error?.code || 'none'}`);
  if (errorCode) assert.equal(response.body?.error?.code, errorCode, label);
  if (status !== 204) assert.ok(response.body?.meta?.requestId, `${label}: missing request correlation`);
  return response.body?.data;
}
function pass(label) { checks.push(label); }
function idem() { return { 'Idempotency-Key': randomUUID() }; }
function count(sql) { return Number(mysqlCommand(`USE majorpilot; ${sql}`).trim()); }
function idList(ids) {
  assert.ok(ids.every(id => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)), 'Unsafe fixture public ID');
  return ids.length ? ids.map(id => `'${id}'`).join(',') : "'no-fixture'";
}
function sqlEmailList() {
  assert.ok(emails.every(email => /^p1-[a-f0-9]{16}-[01]@example\.invalid$/.test(email)));
  return emails.map(email => `'${email}'`).join(',');
}
async function emailToken(email, route) {
  // SMTP is asynchronous for resend/forgot; wait at most 8 seconds without logging payloads.
  for (let attempt = 0; attempt < 32; attempt++) {
    const list = await (await fetch(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) })).json();
    for (const item of list.messages || []) {
      if (!(item.To || []).some(to => to.Address === email)) continue;
      const detail = await (await fetch(`${mailBase}/api/v1/message/${encodeURIComponent(item.ID)}`)).json();
      capturedMail.add(item.ID);
      const token = detail.Text?.match(new RegExp(`/${route}#token=([A-Za-z0-9_-]{43})`))?.[1];
      if (token) return token;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Synthetic local email was not captured; payload suppressed');
}
async function newIntake() {
  const client = new Client();
  await client.publicCsrf();
  const created = await client.call('/api/public/v1/intake-sessions', { method: 'POST', body: { questionnaireVersion: fixture.questionnaireVersion } });
  const view = expect(created, 201, 'create intake');
  createdIntakes.add(view.intakeSessionId);
  assert.ok(created.setCookies.some(c => c.startsWith('MP_INTAKE=') && c.includes('HttpOnly') && c.includes('Path=/api/public/v1') && c.includes('SameSite=Lax')));
  return { client, view };
}
async function submit(client, view, revision = view.revision) {
  const body = { ...fixture, expectedRevision: revision };
  const headers = idem();
  const path = `/api/public/v1/intake-sessions/${view.intakeSessionId}/submit`;
  const recommendation = expect(await client.call(path, { method: 'POST', body, headers }), 201, 'submit profile');
  return { recommendation, path, body, headers };
}
async function register(client, view, email, research = 'DECLINED') {
  const body = { intakeSessionId: view.intakeSessionId, email, password, consents: [
    { documentType: 'TERMS', documentVersion: 'v1', decision: 'ACCEPTED' },
    { documentType: 'PRIVACY', documentVersion: 'v1', decision: 'ACCEPTED' },
    { documentType: 'RESEARCH', documentVersion: 'v1', decision: research },
  ] };
  const prior = client.clone();
  const headers = idem();
  const account = expect(await client.call('/api/public/v1/auth/register', { method: 'POST', body, headers }), 201, 'registration');
  assert.equal(account.status, 'PENDING_VERIFICATION');
  assert.equal(account.emailDeliveryStatus, 'SENT');
  assert.equal(client.cookies.has('MP_SESSION'), false, 'Registration must not issue a login session');
  assert.equal(client.cookies.has('MP_INTAKE'), false, 'Claimed intake cookie must be cleared');
  return { account, prior, body, headers };
}
async function login(email, candidatePassword = password) {
  const client = new Client(); await client.publicCsrf();
  const result = await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email, password: candidatePassword } });
  const me = expect(result, 200, 'login');
  assert.ok(result.setCookies.some(c => c.startsWith('MP_SESSION=') && c.includes('HttpOnly') && c.includes('Path=/api/app/v1') && c.includes('SameSite=Lax')));
  return { client, me };
}

let completed = false;
try {
  const probe = new Client();
  expect(await probe.call('/api/public/v1/health'), 200, 'local readiness');
  expect(await probe.call('/api/public/v1/p0/intake', { method: 'POST', body: {} }), 404, 'P0 public boundary', 'RESOURCE_NOT_FOUND');
  expect(await probe.call('/api/app/v1/p0/whoami'), 404, 'P0 student boundary', 'RESOURCE_NOT_FOUND');
  const definition = expect(await probe.call('/api/public/v1/questionnaires/current'), 200, 'questionnaire definition');
  assert.ok(JSON.stringify(definition).includes(fixture.questionnaireVersion));
  assert.equal(expect(await probe.call('/api/public/v1/majors'), 200, 'major catalog').length, 3);
  pass('formal local profile excludes synthetic P0 identities');

  const a = await newIntake(), b = await newIntake();
  const draftPath = `/api/public/v1/intake-sessions/${a.view.intakeSessionId}/draft`;
  const draft = { questionnaireVersion: fixture.questionnaireVersion, expectedRevision: 0, stepKey: 'step-1', answers: { applicationStage: fixture.answers.applicationStage } };
  expect(await a.client.call(draftPath, { method: 'PUT', body: draft, csrf: false }), 403, 'missing CSRF', 'CSRF_INVALID');
  expect(await a.client.call(draftPath, { method: 'PUT', body: draft, headers: { Origin: 'https://untrusted.invalid' } }), 403, 'wrong Origin', 'CSRF_INVALID');
  expect(await b.client.call(`/api/public/v1/intake-sessions/${a.view.intakeSessionId}`), 404, 'cross visitor read', 'RESOURCE_NOT_FOUND');
  const saved = expect(await a.client.call(draftPath, { method: 'PUT', body: draft }), 200, 'draft save');
  assert.equal(saved.revision, 1);
  const conflict = await a.client.call(draftPath, { method: 'PUT', body: draft });
  expect(conflict, 409, 'stale revision', 'INTAKE_REVISION_CONFLICT');
  assert.equal(conflict.body.error.details.currentRevision, 1);
  const restored = expect(await a.client.call(`/api/public/v1/intake-sessions/${a.view.intakeSessionId}`), 200, 'restore draft');
  assert.deepEqual(restored.answers, draft.answers);
  pass('cookie, CSRF, Origin, ownership and draft revision enforcement');

  const submitted = await submit(a.client, a.view, saved.revision);
  const rec = submitted.recommendation;
  assert.equal(rec.primaryMajor, 'AI');
  assert.deepEqual(rec.alternativeMajors, ['DATA_SCIENCE', 'BUSINESS_ANALYTICS']);
  assert.ok(rec.reasons.length >= 2 && rec.reasons.length <= 4);
  assert.equal(rec.explanationStatus, 'STRUCTURED_ONLY');
  assert.equal(rec.availability, 'UNAVAILABLE');
  assert.equal(rec.canRegister, true);
  const replay = expect(await a.client.call(submitted.path, { method: 'POST', body: submitted.body, headers: submitted.headers }), 201, 'same-key submit replay');
  assert.equal(replay.recommendationId, rec.recommendationId);
  const revisionReplay = expect(await a.client.call(submitted.path, { method: 'POST', body: submitted.body, headers: idem() }), 201, 'same-revision submit replay');
  assert.equal(revisionReplay.recommendationId, rec.recommendationId);
  expect(await a.client.call(submitted.path, { method: 'POST', body: { ...submitted.body, answers: { ...fixture.answers, mainQuestion: '另一份合成测试问题' } }, headers: submitted.headers }), 409, 'same key different request', 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(count(`SELECT COUNT(*) FROM mp_recommendation WHERE public_id='${rec.recommendationId}';`), 1);
  await submit(b.client, b.view);
  pass('deterministic recommendation, all three majors, idempotency and structured fallback');

  const claimed = await register(a.client, a.view, emails[0], 'ACCEPTED');
  expect(await claimed.prior.call('/api/public/v1/auth/register', { method: 'POST', body: claimed.body, headers: claimed.headers }), 409, 'lost registration response recovery', 'INTAKE_ALREADY_CLAIMED');
  expect(await a.client.call('/api/app/v1/me'), 401, 'registration does not log in', 'AUTH_REQUIRED');
  const pending = await login(emails[0]);
  assert.equal(pending.me.canStartExperience, false);
  expect(await pending.client.call('/api/app/v1/dashboard'), 403, 'unverified account restriction', 'EMAIL_NOT_VERIFIED');
  const verifyClient = new Client(); await verifyClient.publicCsrf();
  const verifyToken = await emailToken(emails[0], 'verify-email');
  expect(await verifyClient.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: verifyToken } }), 204, 'verify email');
  assert.equal(verifyClient.cookies.has('MP_SESSION'), false, 'Email verification must not auto-login');
  expect(await verifyClient.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: verifyToken } }), 422, 'verification token single use', 'EMAIL_TOKEN_INVALID');
  const activeA = (await login(emails[0])).client;
  const activeSecondSession = (await login(emails[0])).client;
  assert.equal(activeA.cookies.has('MP_INTAKE'), false, 'Login must clear the old anonymous credential');
  assert.equal(activeA.cookies.has('MP_PUBLIC_CSRF'), false, 'Login must invalidate the old anonymous CSRF token');
  expect(await activeA.call('/api/app/v1/auth/csrf'), 200, 'authenticated CSRF refresh');
  const dashboard = expect(await activeA.call('/api/app/v1/dashboard'), 200, 'restored account dashboard');
  assert.equal(dashboard.recommendation.recommendationId, rec.recommendationId);
  assert.ok(dashboard.majors.every(m => m.status === 'NOT_STARTED' && m.availability === 'UNAVAILABLE'));
  assert.equal(dashboard.currentDecision, null);
  assert.equal(dashboard.nextStep, 'TASK_CONTENT_PREPARING');
  pass('atomic intake claim, lost-response login recovery, email verification and honest dashboard');

  await register(b.client, b.view, emails[1]);
  await b.client.publicCsrf();
  const bToken = await emailToken(emails[1], 'verify-email');
  expect(await b.client.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: bToken } }), 204, 'second student verify');
  const activeB = (await login(emails[1])).client;
  expect(await activeB.call(`/api/app/v1/recommendations/${rec.recommendationId}`), 404, 'cross-student recommendation', 'RECOMMENDATION_NOT_FOUND');
  const decisionPath = `/api/app/v1/recommendations/${rec.recommendationId}/decision`;
  expect(await activeB.call(decisionPath, { method: 'POST', body: { selectedMajorCode: 'AI' }, headers: idem() }), 404, 'cross-student decision', 'RECOMMENDATION_NOT_FOUND');
  await activeA.publicCsrf();
  expect(await activeA.call(decisionPath, { method: 'POST', body: { selectedMajorCode: 'AI' }, headers: { ...idem(), 'X-CSRF-Token': activeA.cookies.get('MP_PUBLIC_CSRF').value } }), 403, 'public CSRF rejected by student boundary', 'CSRF_INVALID');
  const accepted = expect(await activeA.call(decisionPath, { method: 'POST', body: { selectedMajorCode: 'AI' }, headers: idem() }), 201, 'accept recommendation');
  assert.equal(accepted.decisionType, 'ACCEPTED');
  const overrideHeaders = idem();
  const overridden = expect(await activeA.call(decisionPath, { method: 'POST', body: { selectedMajorCode: 'BUSINESS_ANALYTICS' }, headers: overrideHeaders }), 201, 'override recommendation');
  assert.equal(overridden.decisionType, 'OVERRIDDEN');
  assert.equal(overridden.decisionNo, accepted.decisionNo + 1);
  const choiceReplay = expect(await activeA.call(decisionPath, { method: 'POST', body: { selectedMajorCode: 'BUSINESS_ANALYTICS' }, headers: overrideHeaders }), 201, 'decision replay');
  assert.equal(choiceReplay.decisionId, overridden.decisionId);
  const revised = expect(await activeA.call('/api/app/v1/decision-profiles', { method: 'POST', body: { ...fixture, answers: { ...fixture.answers, mainQuestion: '新的合成问题，不替换历史快照。' } }, headers: idem() }), 201, 'immutable profile revision');
  assert.equal(revised.profileVersion, rec.profileVersion + 1);
  assert.notEqual(revised.decisionProfileId, rec.decisionProfileId);
  assert.equal(expect(await activeA.call('/api/app/v1/decision-profiles'), 200, 'immutable profile list').length, 2);
  assert.equal(expect(await activeA.call(`/api/app/v1/recommendations/${rec.recommendationId}`), 200, 'historical recommendation').recommendationId, rec.recommendationId);
  pass('cross-student denial, immutable profiles and append-only accept/override history');

  expect(await activeA.call('/api/app/v1/consents/research/withdraw', { method: 'POST', body: {} }), 204, 'withdraw research');
  const consents = expect(await activeA.call('/api/app/v1/consents'), 200, 'consent history');
  assert.ok(consents.some(c => c.documentType === 'RESEARCH' && c.decision === 'ACCEPTED'));
  assert.ok(consents.some(c => c.documentType === 'RESEARCH' && c.decision === 'WITHDRAWN'));
  assert.ok(expect(await activeB.call('/api/app/v1/consents'), 200, 'research optional').some(c => c.documentType === 'RESEARCH' && c.decision === 'DECLINED'));
  pass('research consent optional and withdrawal append-only');

  const resetClient = new Client(); await resetClient.publicCsrf();
  const missing = expect(await resetClient.call('/api/public/v1/auth/password/forgot', { method: 'POST', body: { email: `unknown-${run}@example.invalid` } }), 202, 'forgot unknown account');
  const known = expect(await resetClient.call('/api/public/v1/auth/password/forgot', { method: 'POST', body: { email: emails[0] } }), 202, 'forgot known account');
  assert.deepEqual(known, missing, 'Forgot-password response must not identify account existence');
  const resetToken = await emailToken(emails[0], 'reset-password');
  expect(await resetClient.call('/api/public/v1/auth/password/reset', { method: 'POST', body: { token: resetToken, newPassword } }), 204, 'reset password');
  expect(await resetClient.call('/api/public/v1/auth/password/reset', { method: 'POST', body: { token: resetToken, newPassword } }), 422, 'reset token single use', 'EMAIL_TOKEN_INVALID');
  for (const client of [pending.client, activeA, activeSecondSession]) expect(await client.call('/api/app/v1/me'), 401, 'all old sessions revoked');
  expect(await resetClient.call('/api/public/v1/auth/login', { method: 'POST', body: { email: emails[0], password } }), 401, 'old password rejected', 'AUTH_INVALID');
  const renewed = (await login(emails[0], newPassword)).client;
  const copiedSession = renewed.clone();
  expect(await renewed.call('/api/app/v1/auth/logout', { method: 'POST', body: {} }), 204, 'logout');
  expect(await copiedSession.call('/api/app/v1/me'), 401, 'server-side logout revocation');
  expect(await activeB.call('/api/app/v1/me'), 200, 'other student session unaffected');
  pass('existence-neutral reset, single-use tokens, reset-all and logout-one revocation');

  assert.equal(count(`SELECT COUNT(*) FROM mp_student_account WHERE email_normalized IN (${sqlEmailList()}) AND password_hash NOT LIKE '$argon2id$%';`), 0);
  assert.equal(count(`SELECT COUNT(*) FROM mp_email_token t JOIN mp_student_account s ON s.id=t.student_id WHERE s.email_normalized IN (${sqlEmailList()}) AND LENGTH(t.token_hash)<>64;`), 0);
  assert.equal(count(`SELECT COUNT(*) FROM mp_idempotency_record i JOIN mp_student_account s ON s.id=i.owner_student_id WHERE s.email_normalized IN (${sqlEmailList()}) AND (CAST(i.safe_response_json AS CHAR) LIKE '%${password}%' OR CAST(i.safe_response_json AS CHAR) LIKE '%${newPassword}%' OR CAST(i.safe_response_json AS CHAR) LIKE '%${resetToken}%');`), 0);
  pass('Argon2id password storage, hashed email tokens, no credentials in replay payloads');
  completed = true;
} finally {
  const intakeIds = idList([...createdIntakes]);
  const accountSelector = `SELECT id FROM mp_student_account WHERE email_normalized IN (${sqlEmailList()})`;
  const intakeSelector = `SELECT id FROM mp_intake_session WHERE public_id IN (${intakeIds})`;
  const profileSelector = `SELECT id FROM mp_decision_profile WHERE student_id IN (${accountSelector}) OR intake_session_id IN (${intakeSelector})`;
  const recommendationSelector = `SELECT id FROM mp_recommendation WHERE decision_profile_id IN (${profileSelector})`;
  mysqlCommand(`USE majorpilot; START TRANSACTION;
    DELETE FROM mp_product_event WHERE student_id IN (${accountSelector}) OR intake_session_id IN (${intakeSelector}) OR recommendation_id IN (${recommendationSelector});
    DELETE FROM mp_recommendation_decision WHERE recommendation_id IN (${recommendationSelector});
    DELETE FROM mp_recommendation_reason WHERE recommendation_id IN (${recommendationSelector});
    DELETE FROM mp_recommendation WHERE decision_profile_id IN (${profileSelector});
    DELETE FROM mp_decision_answer WHERE decision_profile_id IN (${profileSelector});
    UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE student_id IN (${accountSelector}) OR intake_session_id IN (${intakeSelector});
    DELETE FROM mp_decision_profile WHERE student_id IN (${accountSelector}) OR intake_session_id IN (${intakeSelector});
    DELETE FROM mp_idempotency_record WHERE owner_student_id IN (${accountSelector}) OR owner_intake_session_id IN (${intakeSelector});
    DELETE FROM mp_consent_record WHERE student_id IN (${accountSelector}) OR intake_session_id IN (${intakeSelector});
    DELETE FROM mp_intake_session WHERE public_id IN (${intakeIds});
    DELETE FROM mp_email_token WHERE student_id IN (${accountSelector});
    DELETE FROM mp_student_session WHERE student_id IN (${accountSelector});
    DELETE FROM mp_security_event WHERE student_id IN (${accountSelector});
    DELETE FROM mp_student_account WHERE email_normalized IN (${sqlEmailList()});
    COMMIT;`);
  assert.equal(count(`SELECT COUNT(*) FROM mp_student_account WHERE email_normalized IN (${sqlEmailList()});`), 0, 'Synthetic account cleanup');
  for (const id of capturedMail) {
    assert.match(id, /^[A-Za-z0-9_-]+$/, 'Unsafe local email ID');
    const response = await fetch(`${mailBase}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) });
    assert.ok(response.ok, 'Synthetic mail cleanup failed');
  }
}
console.log(JSON.stringify({ scope: 'synthetic local P1; no provider calls or public deployment', result: completed ? 'PASS' : 'FAIL', checks, responseContractsVerified: validatedOperations.size, fixtureCleanup: true }));
