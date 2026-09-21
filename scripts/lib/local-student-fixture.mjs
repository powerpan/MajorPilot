import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, lstatSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mysqlArguments } from '../infra.mjs';
import { ROOT, TOOL } from '../local-config.mjs';
import { readLocalEnv } from '../env.mjs';

// Real local HTTP identities, never a synthetic authentication bypass. Secrets
// remain in memory; these helpers neither log them nor persist browser state.
export const localBase = 'http://127.0.0.1:18080';
const mailBase = 'http://127.0.0.1:18025';
const fixture = JSON.parse(readFileSync(new URL('../../contracts/examples/p1-intake.json', import.meta.url), 'utf8'));
export const idempotency = () => ({ 'Idempotency-Key': randomUUID() });
const publicId = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
function scopedQuery(sql) {
  try { return execFileSync(`${TOOL}/mysql/bin/mysql`, mysqlArguments(), { input: `USE majorpilot; ${sql}`, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Exact fixture database operation failed; SQL and credentials suppressed'); }
}
export function removeFixtureObject(key, root = path.join(ROOT, 'data/private-exports')) {
  assert.ok(/^(?:student\/[0-7][0-9A-HJKMNP-TV-Z]{25}\.zip|admin\/[0-7][0-9A-HJKMNP-TV-Z]{25}\.csv)$/.test(key), 'Invalid fixture artifact key');
  const base = path.resolve(root), file = path.join(base, key);
  for (let current = file; ; current = path.dirname(current)) {
    let stat; try { stat = lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Fixture artifact inspection failed'); }
    assert.ok(!stat?.isSymbolicLink() && (!stat || (current === file ? stat.isFile() : stat.isDirectory())), 'Unsafe fixture artifact path');
    if (current === path.dirname(current)) break;
  }
  try { unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Exact fixture artifact removal failed'); }
}
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

export function createFixtureScope(prefix = 'p2', dependencies = {}) {
  assert.match(prefix, /^p[2-7](?:-[a-z]+)?$/);
  // Test injection stays in this local acceptance helper, never a product route.
  const query = dependencies.query ?? scopedQuery, request = dependencies.fetch ?? globalThis.fetch;
  const clientFactory = dependencies.clientFactory ?? (() => new LocalClient());
  const sleep = dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const nonce = dependencies.nonce ?? randomBytes(8).toString('hex');
  assert.match(nonce, /^[a-f0-9]{16}$/);
  const emails = new Set(); const intakes = new Set(); const mailIds = new Set(); const identities = []; const receipts = new Map();
  const queryJson = sql => query(sql).split('\n').filter(Boolean).map(value => { try { return JSON.parse(value); } catch { throw new Error('Fixture database projection invalid; payload suppressed'); } });
  const quoted = values => values.size ? [...values].map(value => `'${value}'`).join(',') : "'no-fixture'";
  let nextIndex = 0;
  function trackEmail(email) {
    const match = typeof email === 'string' && email.match(new RegExp(`^${prefix}-${nonce}-([0-9]+)(?:-[a-z][a-z0-9-]{0,30})?@example\\.invalid$`));
    assert.ok(match && Number(match[1]) < nextIndex && String(Number(match[1])) === match[1], 'Email is outside this fixture scope');
    emails.add(email); return email;
  }
  function trackReceipt(id) {
    assert.ok(publicId.test(id), 'Invalid fixture receipt ID'); if (receipts.has(id)) return;
    const owners = new Set(identities.map(value => value.publicId).filter(Boolean));
    assert.ok(owners.size, 'Receipt needs a known fixture Student');
    const rows = queryJson(`SELECT JSON_OBJECT('requestId',d.public_id,'studentId',s.public_id) FROM mp_account_deletion_request d JOIN mp_student_account s ON s.id=d.student_id WHERE d.receipt_id='${id}' AND s.public_id IN (${quoted(owners)});`);
    assert.ok(rows.length === 1 && publicId.test(rows[0].requestId) && owners.has(rows[0].studentId), 'Receipt is not owned by this fixture');
    receipts.set(id, rows[0]);
  }
  async function mailToken(email, route = 'verify-email') {
    trackEmail(email); assert.ok(['verify-email', 'change-email', 'reset-password'].includes(route), 'Unsupported fixture mail purpose');
    for (let attempt = 0; attempt < 32; attempt++) {
      const response = await request(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });assert.ok(response.ok, 'Fixture mailbox unavailable');const list = await response.json();
      for (const item of list.messages || []) {
        if (!(item.To || []).some(to => to.Address === email)) continue;
        assert.match(item.ID, /^[A-Za-z0-9_-]+$/);
        const detailResponse = await request(`${mailBase}/api/v1/message/${item.ID}`, { signal: AbortSignal.timeout(5000) });assert.ok(detailResponse.ok, 'Fixture message unavailable');const detail = await detailResponse.json();
        assert.ok((detail.To || []).some(to => to.Address === email), 'Fixture message recipient changed');mailIds.add(item.ID);
        const token = detail.Text?.match(new RegExp(`/${route}#token=([A-Za-z0-9_-]{43})(?:\\s|$)`))?.[1];
        if (token) return token;
      }
      await sleep(250);
    }
    throw new Error('Local fixture verification mail not delivered (payload suppressed)');
  }
  async function student({ research = 'DECLINED' } = {}) {
    assert.ok(['ACCEPTED', 'DECLINED'].includes(research), 'Invalid fixture research consent');
    const email = `${prefix}-${nonce}-${nextIndex++}@example.invalid`;
    const password = `Synthetic-${randomBytes(24).toString('hex')}`;
    trackEmail(email); // Track before a possibly lost registration response.
    const client = clientFactory(); const returned = { client, email, password };const identity = { returned, originalEmail: email, publicId: null, intakeId: null };identities.push(identity);await client.publicCsrf();
    const intake = expect(await client.call('/api/public/v1/intake-sessions', { method: 'POST', body: { questionnaireVersion: fixture.questionnaireVersion } }), 201, 'fixture intake');
    assert.ok(publicId.test(intake.intakeSessionId), 'Invalid fixture Intake identity');intakes.add(intake.intakeSessionId);identity.intakeId = intake.intakeSessionId;
    const recommendation = expect(await client.call(`/api/public/v1/intake-sessions/${intake.intakeSessionId}/submit`, { method: 'POST', body: { ...fixture, expectedRevision: intake.revision }, headers: idempotency() }), 201, 'fixture profile');
    const registered = expect(await client.call('/api/public/v1/auth/register', { method: 'POST', body: { intakeSessionId: intake.intakeSessionId, email, password, consents: [
      { documentType: 'TERMS', documentVersion: 'v1', decision: 'ACCEPTED' },
      { documentType: 'PRIVACY', documentVersion: 'v1', decision: 'ACCEPTED' },
      { documentType: 'RESEARCH', documentVersion: 'v1', decision: research },
    ] }, headers: idempotency() }), 201, 'fixture registration');
    assert.ok(publicId.test(registered.studentId), 'Invalid registered fixture identity');identity.publicId = registered.studentId;
    await client.publicCsrf();
    expect(await client.call('/api/public/v1/auth/verify-email', { method: 'POST', body: { token: await mailToken(email) } }), 204, 'fixture email verification');
    const account = expect(await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email, password } }), 200, 'fixture login');
    expect(await client.call('/api/app/v1/auth/csrf'), 200, 'fixture student CSRF');
    assert.equal(account.studentId, identity.publicId, 'Fixture login owner mismatch');
    Object.assign(returned, { account, recommendation });return returned;
  }
  function current(identity) {
    // Lost registration responses can be recovered only through their original
    // claimed Intake and exact nonce email, never an unscoped email lookup.
    const selector = identity.publicId ? `s.public_id='${identity.publicId}'` : `s.email_normalized='${identity.originalEmail}' AND EXISTS(SELECT 1 FROM mp_intake_session i WHERE i.claimed_student_id=s.id AND i.public_id='${identity.intakeId}')`;
    if (!identity.publicId && !identity.intakeId) return null;
    const rows = queryJson(`SELECT JSON_OBJECT('publicId',s.public_id,'email',s.email_normalized,'status',s.status) FROM mp_student_account s WHERE ${selector};`);
    assert.ok(rows.length <= 1, 'Ambiguous fixture Student');if (!rows.length) return null;
    const row = rows[0];assert.ok(publicId.test(row.publicId), 'Invalid fixture Student projection');trackEmail(row.email);
    if (identity.publicId) assert.equal(row.publicId, identity.publicId, 'Fixture owner changed');else identity.publicId = row.publicId;
    return row;
  }
  async function waitDeleted(identity) {
    for (let attempt = 0; attempt < 90; attempt++) { if (!current(identity)) return true;await sleep(1000); }
    return false;
  }
  async function formalDelete(identity, row) {
    if (row.status === 'DELETION_PENDING') return waitDeleted(identity);
    if (!['ACTIVE', 'PENDING_VERIFICATION'].includes(row.status)) return false;
    try {
      const client = clientFactory();await client.publicCsrf();
      const account = expect(await client.call('/api/public/v1/auth/login', { method: 'POST', body: { email: row.email, password: identity.returned.password } }), 200, 'fixture cleanup login');
      assert.equal(account.studentId, identity.publicId, 'Fixture cleanup login owner mismatch');
      expect(await client.call('/api/app/v1/auth/csrf'), 200, 'fixture cleanup CSRF');
      const issued = expect(await client.call('/api/app/v1/account-deletion-requests', { method: 'POST', body: {}, headers: idempotency() }), 201, 'fixture cleanup deletion request');
      assert.ok(publicId.test(issued.requestId) && publicId.test(issued.receiptId), 'Invalid fixture deletion response');trackReceipt(issued.receiptId);
      // The cookie is preissued. A lost confirm response is resolved by the
      // exact persisted owner/receipt, not by retrying with an expired Session.
      try { expect(await client.call(`/api/app/v1/account-deletion-requests/${issued.requestId}/confirm`, { method: 'POST', body: { currentPassword: identity.returned.password }, headers: idempotency() }), 202, 'fixture cleanup confirmation'); } catch { if (current(identity)?.status !== 'DELETION_PENDING') return false; }
      return waitDeleted(identity);
    } catch { return false; }
  }
  function collectReceipts(owners) {
    if (!owners.size) return;
    for (const row of queryJson(`SELECT JSON_OBJECT('receiptId',d.receipt_id,'requestId',d.public_id,'studentId',s.public_id) FROM mp_account_deletion_request d JOIN mp_student_account s ON s.id=d.student_id WHERE s.public_id IN (${quoted(owners)});`)) {
      assert.ok(publicId.test(row.receiptId) && publicId.test(row.requestId) && owners.has(row.studentId), 'Invalid fixture receipt ownership');receipts.set(row.receiptId, row);
    }
  }
  function removeOwnedArtifacts(accounts) {
    const adminIds = query(`SELECT DISTINCT e.id FROM mp_admin_export e JOIN mp_admin_export_student m ON m.export_id=e.id WHERE m.student_id IN (${accounts});`).split(/\s+/).filter(Boolean);
    adminIds.forEach(id => assert.match(id, /^[1-9][0-9]*$/));const admins = adminIds.join(',') || '0';
    assert.equal(query(`SELECT COUNT(*) FROM mp_admin_export_student WHERE export_id IN (${admins}) AND student_id NOT IN (${accounts});`), '0', 'Shared admin artifact requires formal deletion, not raw fixture fallback');
    const keys = new Map();
    function add(key, kind) { if (key == null) return;assert.ok(typeof key === 'string' && new RegExp(`^${kind}/[0-7][0-9A-HJKMNP-TV-Z]{25}\\.${kind === 'student' ? 'zip' : 'csv'}$`).test(key), 'Invalid owned fixture artifact');keys.set(key, kind); }
    for (const row of queryJson(`SELECT JSON_OBJECT('key',object_key) FROM mp_student_data_export WHERE student_id IN (${accounts});`)) add(row.key, 'student');
    for (const row of queryJson(`SELECT JSON_OBJECT('key',object_key) FROM mp_admin_export WHERE id IN (${admins});`)) add(row.key, 'admin');
    for (const row of queryJson(`SELECT JSON_OBJECT('kind',IF(job_type='STUDENT_EXPORT','student','admin'),'checkpoint',checkpoint_json) FROM mp_background_job WHERE (job_type='STUDENT_EXPORT' AND owner_student_id IN (${accounts})) OR (job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id IN (${admins}));`)) {
      const list = row.checkpoint?.artifactKeys;assert.ok(Array.isArray(list) && list.length <= 3, 'Invalid fixture artifact checkpoint');for (const key of list) add(key, row.kind);
    }
    // Check every pointer before removing even one byte. Corrupt pointers are
    // not authority to remove another Student's or Operator's artifact.
    for (const [key, kind] of keys) {
      assert.equal(query(`SELECT COUNT(*) FROM mp_student_data_export WHERE object_key='${key}' AND ${kind === 'student' ? `student_id NOT IN (${accounts})` : '1=1'};`), '0', 'Foreign fixture artifact reference');
      assert.equal(query(`SELECT COUNT(*) FROM mp_admin_export WHERE object_key='${key}' AND ${kind === 'admin' ? `id NOT IN (${admins})` : '1=1'};`), '0', 'Foreign fixture artifact reference');
      assert.equal(query(`SELECT COUNT(*) FROM mp_background_job WHERE JSON_CONTAINS(JSON_EXTRACT(checkpoint_json,'$.artifactKeys'),JSON_QUOTE('${key}'))=1 AND NOT COALESCE(${kind === 'student' ? `(job_type='STUDENT_EXPORT' AND owner_student_id IN (${accounts}))` : `(job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id IN (${admins}))`},FALSE);`), '0', 'Foreign fixture job artifact reference');
    }
    if (keys.size) {
      const root = path.join(ROOT, 'data/private-exports');
      if (!dependencies.removeObject) { const configured = process.env.MP_PRIVATE_EXPORT_ROOT || readLocalEnv().MP_PRIVATE_EXPORT_ROOT;assert.ok(!configured || path.resolve(configured) === root, 'Custom export root requires separate exact cleanup authorization'); }
      for (const key of keys.keys()) (dependencies.removeObject ?? removeFixtureObject)(key);
    }
    return admins;
  }
  async function cleanMail() {
    // Includes verification/change messages emitted just before a lost response.
    const response = await request(`${mailBase}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });assert.ok(response.ok, 'Fixture mailbox cleanup unavailable');const list = await response.json();
    for (const item of list.messages || []) if ((item.To || []).some(to => emails.has(to.Address))) { assert.match(item.ID, /^[A-Za-z0-9_-]+$/);mailIds.add(item.ID); }
    for (const id of mailIds) assert.ok((await request(`${mailBase}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [id] }), signal: AbortSignal.timeout(5000) })).ok, 'Exact fixture mail cleanup failed');
  }
  async function cleanup() {
    if (!emails.size && !intakes.size) return;
    let failure;try { await cleanupData(); } catch { failure = new Error('Exact fixture data cleanup failed; details suppressed'); }
    try { await cleanMail(); } catch { failure ??= new Error('Exact fixture mail cleanup failed; details suppressed'); }
    if (failure) throw failure;
  }
  async function cleanupData() {
    for (const email of emails) trackEmail(email);
    for (const id of intakes) assert.ok(publicId.test(id), 'Invalid fixture Intake');
    assert.equal(query('SELECT DATABASE();'), 'majorpilot', 'Fixture database identity mismatch');
    const hasPrivacy = query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='majorpilot' AND table_name='mp_student_data_export';") === '1';
    const present = identities.map(identity => ({ identity, row: current(identity) })).filter(value => value.row);
    const owners = new Set(identities.map(value => value.publicId).filter(Boolean));
    if (hasPrivacy) collectReceipts(owners);
    let fallback = 0;
    if (hasPrivacy) for (const { identity, row } of present) if (!await formalDelete(identity, row)) fallback++;
    const mysqlCommand = query;
    const list = values => values.size ? [...values].map(v => `'${v}'`).join(',') : "'no-fixture'";
    const accounts = `SELECT id FROM mp_student_account WHERE public_id IN (${list(owners)})`;
    const intakeIds = `SELECT id FROM mp_intake_session WHERE public_id IN (${list(intakes)})`;
    // A claimed Intake must still belong to this invocation, or already be gone.
    assert.equal(query(`SELECT COUNT(*) FROM mp_intake_session WHERE public_id IN (${list(intakes)}) AND claimed_student_id IS NOT NULL AND claimed_student_id NOT IN (${accounts});`), '0', 'Foreign claimed Intake prevents cleanup');
    let adminIds = '0';
    if (hasPrivacy && query(`SELECT COUNT(*) FROM mp_student_account WHERE public_id IN (${list(owners)});`) !== '0') {
      // Fence asynchronous publishers before examining file pointers. This is
      // only a failure fallback, not evidence that the deletion API succeeded.
      query(`START TRANSACTION; SELECT id FROM mp_student_account WHERE public_id IN (${list(owners)}) ORDER BY id FOR UPDATE; UPDATE mp_student_account SET status='DELETION_PENDING' WHERE public_id IN (${list(owners)}); UPDATE mp_background_job SET status='CANCELLED',lease_version=lease_version+1,lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE owner_student_id IN (${accounts}) AND status IN ('PENDING','RUNNING','RETRY_WAIT'); COMMIT;`);
      adminIds = removeOwnedArtifacts(accounts);
    }
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
      SELECT id FROM mp_student_account WHERE public_id IN (${list(owners)}) ORDER BY id FOR UPDATE;
      ${hasPrivacy ? `DELETE FROM mp_idempotency_record WHERE resource_type='ADMIN_EXPORT' AND resource_id IN (${adminIds}); DELETE FROM mp_sensitive_audit WHERE (target_type='ADMIN_EXPORT' AND target_public_id IN (SELECT public_id FROM mp_admin_export WHERE id IN (${adminIds}))) OR owner_student_id IN (${accounts}); DELETE FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id IN (${adminIds}); DELETE FROM mp_admin_export_student WHERE export_id IN (${adminIds}); DELETE FROM mp_admin_export WHERE id IN (${adminIds}); DELETE FROM mp_student_data_export WHERE student_id IN (${accounts}); DELETE FROM mp_account_deletion_request WHERE student_id IN (${accounts});` : ''}
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
      DELETE FROM mp_student_account WHERE public_id IN (${list(owners)});
      COMMIT;`);
    assert.equal(mysqlCommand(`USE majorpilot; SELECT COUNT(*) FROM mp_student_account WHERE public_id IN (${list(owners)});`).trim(), '0', 'Fixture accounts removed');
    if (hasPrivacy) for (const [receiptId, value] of receipts) {
      query(`DELETE FROM mp_account_deletion_request WHERE receipt_id='${receiptId}' AND public_id='${value.requestId}' AND student_id IS NULL AND status='COMPLETED';`);
      assert.equal(query(`SELECT COUNT(*) FROM mp_account_deletion_request WHERE receipt_id='${receiptId}' AND public_id='${value.requestId}';`), '0', 'Fixture receipt cleanup incomplete');
    }
    assert.equal(query(`SELECT COUNT(*) FROM mp_intake_session WHERE public_id IN (${list(intakes)});`), '0', 'Fixture Intake cleanup incomplete');
    if (prefix.startsWith('p7') && fallback) throw new Error('P7 required raw fixture fallback; formal deletion acceptance did not pass');
  }
  return { student, cleanup, trackEmail, mailToken, trackReceipt };
}
