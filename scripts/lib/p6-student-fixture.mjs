import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, TOOL } from '../local-config.mjs';
import { parseEnv, runtimeEnv } from '../env.mjs';

export const p6Base = 'http://127.0.0.1:18081';
export const p6Origin = 'http://127.0.0.1:15176';
const mailBase = 'http://127.0.0.1:18025';
const fixture = JSON.parse(readFileSync(new URL('../../contracts/examples/p1-intake.json', import.meta.url), 'utf8'));
export const idempotency = () => ({ 'Idempotency-Key': randomUUID() });
export function p6Secrets() {
  const file = `${ROOT}/.env.p6-test.local`, stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077), 'Test secrets must be a mode-600 regular file');
  const values = parseEnv(readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{16}$/.test(values.MP_P6_RUN_TAG || '') || !/^[a-f0-9]{64}$/.test(values.MP_DB_PASSWORD || '') || !/^[a-f0-9]{64}$/.test(values.MP_P0_ADMIN_PASSWORD || '')) throw new Error('P6 scoped secret metadata is invalid; values suppressed');
  return values;
}
export function p6Query(sql) {
  assert.ok(!/\b(?:USE|DROP|TRUNCATE|CREATE|GRANT|ALTER)\b/i.test(sql), 'Acceptance SQL must stay in the selected test schema');
  assert.ok(!/\bmajorpilot\b/i.test(sql), 'Main schema is outside this harness');
  try {
    return execFileSync(`${TOOL}/mysql/bin/mysql`, ['--no-defaults', '--no-login-paths', '--protocol=TCP', '-h127.0.0.1', '-P13306', '-umajorpilot_p6_test', '--batch', '--skip-column-names', 'majorpilot_test', '-e', sql],
      { env: { ...runtimeEnv(), MYSQL_PWD: p6Secrets().MP_DB_PASSWORD }, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { throw new Error('P6 scoped MySQL operation failed; SQL and credentials suppressed'); }
}
export function expect(response, status, label, code) {
  assert.equal(response.status, status, `${label}: HTTP ${response.status}; code=${response.body?.error?.code || 'none'} (payload suppressed)`);
  if (code) assert.equal(response.body?.error?.code, code, label);
  if (status !== 204) assert.ok(response.body?.meta?.requestId, `${label}: correlation missing`);
  return response.body?.data;
}
export class P6Client {
  cookies = new Map();
  token;
  clone() { const next = new P6Client(); next.cookies = new Map(this.cookies); next.token = this.token; return next; }
  async call(path, { method = 'GET', body, headers = {}, csrf = !['GET', 'HEAD'].includes(method) } = {}) {
    assert.ok(/^\/api\/(?:app|public|admin)\/v1\//.test(path) || ['/login', '/logout', '/captchaImage'].includes(path), 'Only harness product/auth paths are allowed');
    const pathname = path.split('?')[0];
    const origin = path.startsWith('/api/admin/') || ['/login', '/logout', '/captchaImage'].includes(pathname) ? 'http://localhost:15174' : p6Origin;
    const cookie = [...this.cookies].filter(([, c]) => c.path === '/' || pathname === c.path || pathname.startsWith(`${c.path}/`)).map(([k, c]) => `${k}=${c.value}`).join('; ');
    const response = await fetch(p6Base + path, { method, redirect: 'error', signal: AbortSignal.timeout(50000), headers: {
      Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf && path.startsWith('/api/') ? { 'X-CSRF-Token': this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '' } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const value of response.headers.getSetCookie()) {
      const parts = value.split(';').map(v => v.trim()), equal = parts[0].indexOf('='), name = parts[0].slice(0, equal);
      if (parts.some(v => /^Max-Age=0$/i.test(v))) this.cookies.delete(name);
      else this.cookies.set(name, { value: parts[0].slice(equal + 1), path: parts.find(v => /^Path=/i.test(v))?.slice(5) || '/' });
    }
    const text = await response.text(); let payload = null;
    try { payload = JSON.parse(text); } catch { /* Only explicit assets can be text. */ }
    return { status: response.status, body: payload, text, headers: response.headers };
  }
  async publicCsrf() { expect(await this.call('/api/public/v1/auth/csrf'), 200, 'public CSRF'); }
  async operator(kind) {
    assert.ok(['full', 'limited'].includes(kind)); const secrets = p6Secrets();
    const response = await this.call('/login', { method: 'POST', body: { username: `p6-${kind}-${secrets.MP_P6_RUN_TAG.slice(0, 8)}`, password: secrets.MP_P0_ADMIN_PASSWORD.slice(0, 20) } });
    assert.equal(response.status, 200, 'Real operator login HTTP'); assert.equal(response.body?.code, 200, 'Real operator login failed (details suppressed)');
    assert.equal(typeof response.body?.token, 'string', 'Operator JWT missing'); this.token = response.body.token; return this;
  }
}

export function createP6FixtureScope() {
  const tag = p6Secrets().MP_P6_RUN_TAG, nonce = randomBytes(6).toString('hex'), prefix = `p6-http-${tag}-${nonce}`;
  const emails = new Set(), intakes = new Set(), mailIds = new Set(); let count = 0;
  async function tokenFor(email) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const messages = await (await fetch(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) })).json();
      for (const message of messages.messages || []) {
        if (!(message.To || []).some(to => to.Address === email)) continue;
        assert.match(message.ID, /^[A-Za-z0-9_-]+$/); mailIds.add(message.ID);
        const detail = await (await fetch(`${mailBase}/api/v1/message/${message.ID}`, { signal: AbortSignal.timeout(5000) })).json();
        const token = detail.Text?.match(/\/verify-email#token=([A-Za-z0-9_-]{43})/)?.[1]; if (token) return token;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('P6 verification mail missing; payload suppressed');
  }
  async function student({ pendingCheck } = {}) {
    assert.ok(count < 2, 'This acceptance scope is limited to two Student accounts');
    const email = `${prefix}-${count++}@example.invalid`, password = `P6-${randomBytes(24).toString('hex')}`;
    emails.add(email); const client = new P6Client(); await client.publicCsrf();
    const intake = expect(await client.call('/api/public/v1/intake-sessions', { method: 'POST', body: { questionnaireVersion: fixture.questionnaireVersion } }), 201, 'real intake'); intakes.add(intake.intakeSessionId);
    const recommendation = expect(await client.call(`/api/public/v1/intake-sessions/${intake.intakeSessionId}/submit`, { method: 'POST', body: { ...fixture, expectedRevision: intake.revision }, headers: idempotency() }), 201, 'real questionnaire');
    expect(await client.call('/api/public/v1/auth/register', { method: 'POST', body: { intakeSessionId: intake.intakeSessionId, email, password, consents: [
      { documentType: 'TERMS', documentVersion: 'v1', decision: 'ACCEPTED' }, { documentType: 'PRIVACY', documentVersion: 'v1', decision: 'ACCEPTED' }, { documentType: 'RESEARCH', documentVersion: 'v1', decision: 'DECLINED' },
    ] }, headers: idempotency() }), 201, 'real registration');
    await client.publicCsrf();
    if (pendingCheck) { expect(await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email, password } }), 200, 'pending login'); await pendingCheck(client); await client.publicCsrf(); }
    expect(await client.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: await tokenFor(email) } }), 204, 'real mail verification');
    const account = expect(await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email, password } }), 200, 'real student login');
    expect(await client.call('/api/app/v1/auth/csrf'), 200, 'student CSRF'); return { client, account, recommendation, email, password };
  }
  async function cleanup() {
    if (!emails.size && !intakes.size) return;
    assert.equal(p6Query('SELECT DATABASE();'), 'majorpilot_test');
    for (const email of emails) assert.match(email, new RegExp(`^${prefix}-[01]@example\\.invalid$`)); for (const id of intakes) assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const quoted = values => values.size ? [...values].map(v => `'${v}'`).join(',') : "'no-fixture'";
    const accounts = `SELECT id FROM mp_student_account WHERE email_normalized IN (${quoted(emails)})`, intakeIds = `SELECT id FROM mp_intake_session WHERE public_id IN (${quoted(intakes)})`;
    const profiles = `SELECT id FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds})`, recommendations = `SELECT id FROM mp_recommendation WHERE decision_profile_id IN (${profiles})`;
    const runs = `SELECT id FROM mp_experience_run WHERE student_id IN (${accounts})`, steps = `SELECT id FROM mp_step_state WHERE experience_run_id IN (${runs})`;
    const versions = `SELECT v.id FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id IN (${accounts})`;
    const ownedRuns = p6Query(`SELECT id FROM mp_experience_run WHERE student_id IN (${accounts}) ORDER BY attempt_no DESC,id DESC;`).split(/\s+/).filter(Boolean); ownedRuns.forEach(id => assert.match(id, /^[0-9]+$/));
    p6Query(`START TRANSACTION;
      SELECT id FROM mp_student_account WHERE email_normalized IN (${quoted(emails)}) ORDER BY id FOR UPDATE;
      DELETE FROM mp_product_event WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds}) OR recommendation_id IN (${recommendations});
      DELETE FROM mp_ai_call WHERE student_id IN (${accounts});
      DELETE FROM mp_sensitive_audit WHERE (target_type='REPORT' AND target_public_id IN (SELECT public_id FROM mp_report WHERE student_id IN (${accounts}))) OR (target_type='REPORT_VERSION' AND target_public_id IN (SELECT public_id FROM mp_report_version WHERE id IN (${versions}))) OR (target_type='EXPERIENCE_RUN' AND target_public_id IN (SELECT public_id FROM mp_experience_run WHERE student_id IN (${accounts})));
      UPDATE mp_report SET current_version_id=NULL,generation_target_version_id=NULL WHERE student_id IN (${accounts});
      DELETE FROM mp_comparison_source WHERE comparison_report_version_id IN (${versions});
      DELETE FROM mp_report_claim_evidence WHERE report_claim_id IN (SELECT id FROM mp_report_claim WHERE report_version_id IN (${versions}));
      DELETE FROM mp_report_claim WHERE report_version_id IN (${versions});
      DELETE FROM mp_student_feedback WHERE student_id IN (${accounts});
      DELETE FROM mp_report_version WHERE report_id IN (SELECT id FROM mp_report WHERE student_id IN (${accounts}));
      DELETE FROM mp_report WHERE student_id IN (${accounts});
      DELETE FROM mp_evidence_item WHERE evidence_snapshot_id IN (SELECT id FROM mp_evidence_snapshot WHERE student_id IN (${accounts}));
      DELETE FROM mp_evidence_snapshot WHERE student_id IN (${accounts});
      DELETE FROM mp_background_job WHERE owner_student_id IN (${accounts});
      UPDATE mp_recommendation SET source_run_id=NULL WHERE student_id IN (${accounts});
      DELETE FROM mp_response_execution WHERE response_revision_id IN (SELECT id FROM mp_step_response_revision WHERE step_state_id IN (${steps}));
      DELETE FROM mp_execution_record WHERE experience_run_id IN (${runs}); DELETE FROM mp_hint_request WHERE experience_run_id IN (${runs});
      DELETE FROM mp_reflection_answer WHERE reflection_id IN (SELECT id FROM mp_reflection WHERE experience_run_id IN (${runs})); DELETE FROM mp_reflection WHERE experience_run_id IN (${runs});
      DELETE FROM mp_step_completion WHERE step_state_id IN (${steps}); DELETE FROM mp_step_response_revision WHERE step_state_id IN (${steps}); DELETE FROM mp_step_state WHERE experience_run_id IN (${runs}); DELETE FROM mp_run_closure_request WHERE experience_run_id IN (${runs});
      ${ownedRuns.map(id => `DELETE FROM mp_experience_run WHERE id=${id} AND student_id IN (${accounts});`).join('\n')}
      DELETE FROM mp_recommendation_decision WHERE recommendation_id IN (${recommendations}); DELETE FROM mp_recommendation_reason WHERE recommendation_id IN (${recommendations}); DELETE FROM mp_recommendation WHERE decision_profile_id IN (${profiles});
      DELETE FROM mp_decision_answer WHERE decision_profile_id IN (${profiles}); UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds}); DELETE FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds});
      DELETE FROM mp_idempotency_record WHERE owner_student_id IN (${accounts}) OR owner_intake_session_id IN (${intakeIds}); DELETE FROM mp_consent_record WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds}); DELETE FROM mp_intake_session WHERE public_id IN (${quoted(intakes)});
      DELETE FROM mp_email_token WHERE student_id IN (${accounts}); DELETE FROM mp_student_session WHERE student_id IN (${accounts}); DELETE FROM mp_security_event WHERE student_id IN (${accounts}); DELETE FROM mp_student_account WHERE email_normalized IN (${quoted(emails)}); COMMIT;`);
    assert.equal(p6Query(`SELECT COUNT(*) FROM mp_student_account WHERE email_normalized IN (${quoted(emails)});`), '0');
    // A lost registration response can still have produced an email. Discover
    // only this invocation's exact recipients before removing captured messages.
    const messages = await (await fetch(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) })).json();
    for (const message of messages.messages || []) if ((message.To || []).some(to => emails.has(to.Address))) { assert.match(message.ID, /^[A-Za-z0-9_-]+$/); mailIds.add(message.ID); }
    for (const id of mailIds) assert.ok((await fetch(`${mailBase}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }), signal: AbortSignal.timeout(5000) })).ok, 'Exact captured mail cleanup');
  }
  return { student, cleanup };
}
