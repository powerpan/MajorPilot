import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mysqlCommand } from '../infra.mjs';

// Real local HTTP identities, never a synthetic authentication bypass. Secrets
// remain in memory; these helpers neither log them nor persist browser state.
export const localBase = 'http://127.0.0.1:18080';
const mailBase = 'http://127.0.0.1:18025';
const fixture = JSON.parse(readFileSync(new URL('../../contracts/examples/p1-intake.json', import.meta.url), 'utf8'));
export const idempotency = () => ({ 'Idempotency-Key': randomUUID() });
export function expect(response, status, label, code) {
  assert.equal(response.status, status, `${label}: HTTP ${response.status}; code=${response.body?.error?.code || 'none'} (payload suppressed)`);
  if (code) assert.equal(response.body?.error?.code, code, label);
  if (status !== 204) assert.ok(response.body?.meta?.requestId, `${label}: correlation missing`);
  return response.body?.data;
}
export class LocalClient {
  cookies = new Map();
  clone() { const client = new LocalClient(); client.cookies = new Map(this.cookies); return client; }
  async call(path, { method = 'GET', body, headers = {}, csrf = !['GET', 'HEAD'].includes(method) } = {}) {
    assert.match(path, /^\/api\/(?:app|public|admin)\/v1\//, 'Only scoped local API paths are allowed');
    const cookie = [...this.cookies].filter(([, c]) => c.path === '/' || path === c.path || path.startsWith(`${c.path}/`)).map(([key, c]) => `${key}=${c.value}`).join('; ');
    const response = await fetch(localBase + path, { method, redirect: 'error', signal: AbortSignal.timeout(25000), headers: {
      Origin: 'http://localhost:15173', ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '' } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const setCookies = response.headers.getSetCookie();
    for (const value of setCookies) {
      const parts = value.split(';').map(x => x.trim()); const equal = parts[0].indexOf('='); const name = parts[0].slice(0, equal);
      if (parts.some(x => /^Max-Age=0$/i.test(x))) this.cookies.delete(name);
      else this.cookies.set(name, { value: parts[0].slice(equal + 1), path: parts.find(x => /^Path=/i.test(x))?.slice(5) || '/' });
    }
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { /* Fixed public CSV/text assets are not JSON envelopes. */ }
    return { status: response.status, body: payload, text, headers: response.headers, setCookies };
  }
  async publicCsrf() { expect(await this.call('/api/public/v1/auth/csrf'), 200, 'public CSRF'); }
}

export function createFixtureScope(prefix = 'p2') {
  assert.match(prefix, /^p[2-6](?:-[a-z]+)?$/);
  const nonce = randomBytes(8).toString('hex');
  const emails = new Set(); const intakes = new Set(); const mailIds = new Set();
  let nextIndex = 0;
  async function tokenFor(email) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const list = await (await fetch(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) })).json();
      for (const item of list.messages || []) {
        if (!(item.To || []).some(to => to.Address === email)) continue;
        assert.match(item.ID, /^[A-Za-z0-9_-]+$/);
        const detail = await (await fetch(`${mailBase}/api/v1/message/${item.ID}`, { signal: AbortSignal.timeout(5000) })).json();
        mailIds.add(item.ID);
        const token = detail.Text?.match(/\/verify-email#token=([A-Za-z0-9_-]{43})/)?.[1];
        if (token) return token;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Local fixture verification mail not delivered (payload suppressed)');
  }
  async function student() {
    const email = `${prefix}-${nonce}-${nextIndex++}@example.invalid`;
    const password = `Synthetic-${randomBytes(24).toString('hex')}`;
    emails.add(email); // Track before a possibly lost registration response.
    const client = new LocalClient(); await client.publicCsrf();
    const intake = expect(await client.call('/api/public/v1/intake-sessions', { method: 'POST', body: { questionnaireVersion: fixture.questionnaireVersion } }), 201, 'fixture intake');
    intakes.add(intake.intakeSessionId);
    const recommendation = expect(await client.call(`/api/public/v1/intake-sessions/${intake.intakeSessionId}/submit`, { method: 'POST', body: { ...fixture, expectedRevision: intake.revision }, headers: idempotency() }), 201, 'fixture profile');
    expect(await client.call('/api/public/v1/auth/register', { method: 'POST', body: { intakeSessionId: intake.intakeSessionId, email, password, consents: [
      { documentType: 'TERMS', documentVersion: 'v1', decision: 'ACCEPTED' },
      { documentType: 'PRIVACY', documentVersion: 'v1', decision: 'ACCEPTED' },
      { documentType: 'RESEARCH', documentVersion: 'v1', decision: 'DECLINED' },
    ] }, headers: idempotency() }), 201, 'fixture registration');
    await client.publicCsrf();
    expect(await client.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: await tokenFor(email) } }), 204, 'fixture email verification');
    const account = expect(await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email, password } }), 200, 'fixture login');
    expect(await client.call('/api/app/v1/auth/csrf'), 200, 'fixture student CSRF');
    return { client, account, recommendation, email, password };
  }
  async function cleanup() {
    if (!emails.size && !intakes.size) return;
    for (const email of emails) assert.match(email, new RegExp(`^${prefix}-${nonce}-[0-9]+@example\\.invalid$`));
    for (const id of intakes) assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    const list = values => values.size ? [...values].map(v => `'${v}'`).join(',') : "'no-fixture'";
    const accounts = `SELECT id FROM mp_student_account WHERE email_normalized IN (${list(emails)})`;
    const intakeIds = `SELECT id FROM mp_intake_session WHERE public_id IN (${list(intakes)})`;
    const profiles = `SELECT id FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds})`;
    const recommendations = `SELECT id FROM mp_recommendation WHERE decision_profile_id IN (${profiles})`;
    const runs = `SELECT id FROM mp_experience_run WHERE student_id IN (${accounts})`;
    const steps = `SELECT id FROM mp_step_state WHERE experience_run_id IN (${runs})`;
    const responses = `SELECT id FROM mp_step_response_revision WHERE step_state_id IN (${steps})`;
    const reflections = `SELECT id FROM mp_reflection WHERE experience_run_id IN (${runs})`;
    const hasEvidence = mysqlCommand("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='majorpilot' AND table_name='mp_evidence_snapshot';").trim() === '1';
    const hasReportVersions = mysqlCommand("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='majorpilot' AND table_name='mp_report_version';").trim() === '1';
    const versions = `SELECT v.id FROM mp_report_version v JOIN mp_report p ON p.id=v.report_id WHERE p.student_id IN (${accounts})`;
    const versionCleanup = hasReportVersions ? `
      DELETE FROM mp_sensitive_audit WHERE (target_type='REPORT' AND target_public_id IN (SELECT public_id FROM mp_report WHERE student_id IN (${accounts}))) OR (target_type='REPORT_VERSION' AND target_public_id IN (SELECT public_id FROM mp_report_version WHERE id IN (${versions})));
      UPDATE mp_report SET current_version_id=NULL,generation_target_version_id=NULL WHERE student_id IN (${accounts});
      DELETE FROM mp_comparison_source WHERE comparison_report_version_id IN (${versions});
      DELETE FROM mp_report_claim_evidence WHERE report_claim_id IN (SELECT id FROM mp_report_claim WHERE report_version_id IN (${versions}));
      DELETE FROM mp_report_claim WHERE report_version_id IN (${versions});
      DELETE FROM mp_student_feedback WHERE student_id IN (${accounts});
      DELETE FROM mp_report_version WHERE report_id IN (SELECT id FROM mp_report WHERE student_id IN (${accounts}));` : '';
    const evidenceCleanup = hasEvidence ? `
      DELETE FROM mp_ai_call WHERE student_id IN (${accounts});
      ${versionCleanup}
      DELETE FROM mp_report WHERE student_id IN (${accounts});
      DELETE FROM mp_evidence_item WHERE evidence_snapshot_id IN (SELECT id FROM mp_evidence_snapshot WHERE student_id IN (${accounts}));
      DELETE FROM mp_evidence_snapshot WHERE student_id IN (${accounts});
      DELETE FROM mp_background_job WHERE owner_student_id IN (${accounts});
      UPDATE mp_recommendation SET source_run_id=NULL WHERE student_id IN (${accounts}) AND source_run_id IN (${runs});` : '';
    // Fail closed on new dependencies: FK errors roll back rather than disabling
    // checks or deleting anything outside this invocation's exact owner set.
    const ownedRuns = mysqlCommand(`USE majorpilot; SELECT id FROM mp_experience_run WHERE student_id IN (${accounts}) ORDER BY attempt_no DESC,id DESC;`).trim().split(/\s+/).filter(Boolean);
    ownedRuns.forEach(id => assert.match(id, /^[0-9]+$/));
    mysqlCommand(`USE majorpilot; START TRANSACTION;
      SELECT id FROM mp_student_account WHERE email_normalized IN (${list(emails)}) ORDER BY id FOR UPDATE;
      DELETE FROM mp_product_event WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds}) OR recommendation_id IN (${recommendations});
      ${evidenceCleanup}
      DELETE FROM mp_sensitive_audit WHERE target_type='EXPERIENCE_RUN' AND target_public_id IN (SELECT public_id FROM mp_experience_run WHERE student_id IN (${accounts}));
      DELETE FROM mp_response_execution WHERE response_revision_id IN (${responses});
      DELETE FROM mp_execution_record WHERE experience_run_id IN (${runs});
      DELETE FROM mp_hint_request WHERE experience_run_id IN (${runs});
      DELETE FROM mp_reflection_answer WHERE reflection_id IN (${reflections});
      DELETE FROM mp_reflection WHERE experience_run_id IN (${runs});
      DELETE FROM mp_step_completion WHERE step_state_id IN (${steps});
      DELETE FROM mp_step_response_revision WHERE step_state_id IN (${steps});
      DELETE FROM mp_step_state WHERE experience_run_id IN (${runs});
      DELETE FROM mp_run_closure_request WHERE experience_run_id IN (${runs});
      ${ownedRuns.map(id => `DELETE FROM mp_experience_run WHERE id=${id} AND student_id IN (${accounts});`).join('\n')}
      DELETE FROM mp_recommendation_decision WHERE recommendation_id IN (${recommendations});
      DELETE FROM mp_recommendation_reason WHERE recommendation_id IN (${recommendations});
      DELETE FROM mp_recommendation WHERE decision_profile_id IN (${profiles});
      DELETE FROM mp_decision_answer WHERE decision_profile_id IN (${profiles});
      UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds});
      DELETE FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds});
      DELETE FROM mp_idempotency_record WHERE owner_student_id IN (${accounts}) OR owner_intake_session_id IN (${intakeIds});
      DELETE FROM mp_consent_record WHERE student_id IN (${accounts}) OR intake_session_id IN (${intakeIds});
      DELETE FROM mp_intake_session WHERE public_id IN (${list(intakes)});
      DELETE FROM mp_email_token WHERE student_id IN (${accounts});
      DELETE FROM mp_student_session WHERE student_id IN (${accounts});
      DELETE FROM mp_security_event WHERE student_id IN (${accounts});
      DELETE FROM mp_student_account WHERE email_normalized IN (${list(emails)});
      COMMIT;`);
    assert.equal(mysqlCommand(`USE majorpilot; SELECT COUNT(*) FROM mp_student_account WHERE email_normalized IN (${list(emails)});`).trim(), '0', 'Fixture accounts removed');
    for (const id of mailIds) {
      const response = await fetch(`${mailBase}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }), signal: AbortSignal.timeout(5000) });
      assert.ok(response.ok, 'Exact fixture mail cleanup failed');
    }
  }
  return { student, cleanup };
}
