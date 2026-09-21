import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { LocalClient, createFixtureScope, expect, idempotency, localBase, removeFixtureObject } from './lib/local-student-fixture.mjs';
import { loadP7Contracts, checkP7 } from '../contracts/check-p7.mjs';
import { readLocalEnv } from './env.mjs';
import { mysqlCommand } from './infra.mjs';

// Explicit --run only. This probe never publishes REVIEW content, calls a model,
// changes expiry timestamps, or grants permissions to existing identities. One
// unique temporary Operator receives only overview/view + export/create via the
// existing role/user CRUD. Its exact IDs and artefacts are removed afterwards. Actual
// browser and MySQL suites cover those separate gates; denied requests are not
// presented as successful functional coverage.
const app = '/api/app/v1', admin = '/api/admin/v1/majorpilot';
const missingId = '00000000000000000000000000';
const ID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const maxArchive = 64 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function operationFor(operations, path, method = 'GET') {
  const parts = path.split('?')[0].split('/');
  return operations.filter(op => op.method === method.toLowerCase() && op.path.split('/').length === parts.length && op.path.split('/').every((part, index) => part.startsWith('{') || part === parts[index]))
    .sort((a,b)=>(a.path.match(/\{/g)||[]).length-(b.path.match(/\{/g)||[]).length)[0];
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

// Inspect actual ZIP bytes in memory. Nothing is extracted to a filesystem or
// executed. Central-directory lengths support Java's data-descriptor ZIPs.
export function unzipPersonal(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 22 && bytes.length <= maxArchive, 'Invalid private archive size');
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  }
  assert.ok(end >= 0, 'ZIP directory missing');
  assert.equal(bytes.readUInt16LE(end + 4), 0); assert.equal(bytes.readUInt16LE(end + 6), 0);
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  assert.equal(bytes.readUInt16LE(end + 8), count); assert.ok(count > 0 && count <= 1024);
  assert.equal(start + size, end, 'Unexpected ZIP directory bounds');
  const files = new Map(); let at = start, expanded = 0;
  for (let index = 0; index < count; index++) {
    assert.ok(at + 46 <= end); assert.equal(bytes.readUInt32LE(at), 0x02014b50);
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10), crc = bytes.readUInt32LE(at + 16);
    const compressed = bytes.readUInt32LE(at + 20), length = bytes.readUInt32LE(at + 24), nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), local = bytes.readUInt32LE(at + 42);
    assert.ok(!(flags & 1) && [0, 8].includes(method), 'Unsupported encrypted/ZIP64 archive');
    assert.ok(at + 46 + nameLength + extra + comment <= end && local + 30 <= start);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    assert.match(name, /^(?:manifest\.json|personal-data\.json|reports\/[0-7][0-9A-HJKMNP-TV-Z]{25}\.html)$/);
    assert.ok(!files.has(name), 'Duplicate archive entry');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50); assert.equal(bytes.readUInt16LE(local + 8), method);
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    assert.equal(bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8'), name);
    const data = local + 30 + localNameLength + localExtra;
    assert.ok(data + compressed <= start && length <= maxArchive && expanded + length <= maxArchive, 'Unsafe archive expansion');
    const encoded = bytes.subarray(data, data + compressed), value = method === 0 ? encoded : inflateRawSync(encoded, { maxOutputLength: Math.max(1, length) });
    assert.equal(value.length, length); assert.equal(crc32(value), crc, 'ZIP content checksum mismatch');
    files.set(name, value); expanded += length; at += 46 + nameLength + extra + comment;
  }
  assert.equal(at, end); assert.ok(files.has('manifest.json')); return files;
}

export function validatePersonalArchive(bytes, { scope, studentId, email, foreignEmail, password }) {
  const files = unzipPersonal(bytes), manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.equal(manifest.schemaVersion, 'personal-export-v1'); assert.equal(manifest.scope, scope); assert.equal(manifest.studentId, studentId);
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAt))); assert.ok(Array.isArray(manifest.notes) && manifest.notes.length);
  assert.deepEqual([...files.keys()].filter(name => name !== 'manifest.json').sort(), manifest.files.map(file => file.path).sort());
  for (const [name, value] of files) {
    const text = value.toString('utf8');
    for (const secret of [password, foreignEmail].filter(Boolean)) assert.ok(!text.includes(secret), 'Foreign identity or credential entered export');
    if (name.endsWith('.html')) { assert.ok(text.includes('Content-Security-Policy')); assert.ok(!/<script\b|\bon\w+\s*=|(?:src|href)\s*=\s*["']https?:/i.test(text)); }
  }
  if (scope === 'FULL_PERSONAL_EXPORT') {
    const personal = JSON.parse(files.get('personal-data.json').toString('utf8'));
    assert.equal(personal.schemaVersion, 'personal-data-v1'); assert.equal(personal.account.studentId, studentId); assert.ok(personal.account.email === email, 'Export account identity mismatch; address suppressed');
    assert.ok(personal.profiles.length > 0 && personal.recommendations.length > 0 && personal.consents.length >= 3);
    const forbidden = new Set(['password', 'passwordHash', 'password_hash', 'receiptSecretHash', 'receipt_secret_hash', 'analyticsExclusionCode', 'riskFlags', 'prompt', 'sessionSecret', 'emailToken']);
    const visit = value => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), 'Private internal field entered export'); visit(child); } }; visit(personal);
  } else assert.ok(!files.has('personal-data.json'));
  return { entries: files.size, reportVersions: manifest.files.filter(file => file.path.endsWith('.html')).length };
}

export class ProbeClient extends LocalClient {
  constructor({ fetcher = globalThis.fetch, contract, verified = new Map(), afterRegistration } = {}) { super(); this.fetcher = fetcher; this.contract = contract; this.verified = verified; this.afterRegistration = afterRegistration; this.bearer = null; }
  clone() { const client = new ProbeClient({ fetcher: this.fetcher, contract: this.contract, verified: this.verified }); client.cookies = new Map(this.cookies); client.bearer = this.bearer; return client; }
  async call(path, { method = 'GET', body, headers = {}, csrf = !['GET', 'HEAD'].includes(method), invalidRequest = false, omitOrigin = false } = {}) {
    assert.ok(/^\/api\/(?:app|public|admin)\/v1\//.test(path) || ['/login', '/logout', '/getInfo', '/system/role', '/system/user'].includes(path), 'Probe path outside allowed API/auth scope');
    const op = this.contract && operationFor(this.contract.operations, path, method);
    if (op?.request && !invalidRequest) assert.ok(op.request(body), `${op.id}: request contract rejected (payload suppressed)`);
    const cookie = [...this.cookies].filter(([, c]) => c.path === '/' || path === c.path || path.startsWith(`${c.path}/`)).map(([key, c]) => `${key}=${c.value}`).join('; ');
    const operator = path.startsWith('/api/admin/') || path.startsWith('/system/') || ['/login', '/logout', '/getInfo'].includes(path);
    const response = await this.fetcher(localBase + path, { method, redirect: 'error', signal: AbortSignal.timeout(25000), headers: {
      ...(!omitOrigin ? { Origin: operator ? 'http://localhost:15174' : 'http://localhost:15173' } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '' } : {}), ...headers,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const setCookies = response.headers.getSetCookie();
    for (const value of setCookies) {
      const parts = value.split(';').map(part => part.trim()), equal = parts[0].indexOf('='), name = parts[0].slice(0, equal);
      if (parts.some(part => /^Max-Age=0$/i.test(part))) this.cookies.delete(name);
      else this.cookies.set(name, { value: parts[0].slice(equal + 1), path: parts.find(part => /^Path=/i.test(part))?.slice(5) || '/' });
    }
    const bytes = Buffer.from(await response.arrayBuffer()), media = response.headers.get('content-type')?.split(';')[0];
    const text = media === 'application/zip' ? '' : bytes.toString('utf8'); let payload = null;
    if (media === 'application/json') { try { payload = JSON.parse(text); } catch { throw new Error('Malformed HTTP JSON; payload suppressed'); } }
    const result = { status: response.status, body: payload, text, bytes, headers: response.headers, setCookies };
    if (op) {
      const key = Object.hasOwn(op.responses, String(response.status)) ? String(response.status) : 'default', validate = op.responses[key];
      assert.ok(Object.hasOwn(op.responses, key), `${op.id}: undeclared status ${response.status}`);
      if (validate) assert.ok(validate(payload), `${op.id}: HTTP ${response.status} contract mismatch ${JSON.stringify(validate.errors?.map(error => ({ path: error.instancePath, keyword: error.keyword })))}`);
      else if (response.status === 204) assert.equal(bytes.length, 0);
      else assert.ok(op.responseMedia[key]?.includes(media) && bytes.length, `${op.id}: binary media contract mismatch`);
      if (!this.verified.has(op.id)) this.verified.set(op.id, new Set()); this.verified.get(op.id).add(response.status);
      const cache = (response.headers.get('cache-control') || '').split(',').map(value => value.trim().toLowerCase());
      assert.ok(cache.includes('no-store') && !cache.includes('public'), `${op.id}: private/no-store boundary`);
    }
    if (path === '/api/public/v1/auth/register' && result.status === 201 && this.afterRegistration) await this.afterRegistration(this, body, result);
    return result;
  }
  async operator(credentials) {
    const env = readLocalEnv();
    const result = await this.call('/login', { method: 'POST', body: credentials || { username: env.MP_P0_ADMIN_USERNAME || 'admin', password: env.MP_P0_ADMIN_PASSWORD }, csrf: false });
    assert.equal(result.body?.code, 200, `${credentials ? 'Temporary fixture' : 'Local root'} Operator login failed; credentials suppressed`); assert.equal(typeof result.body.token, 'string'); this.bearer = result.body.token;
    const info = await this.call('/getInfo'); assert.equal(info.body?.code, 200); assert.ok(Number.isSafeInteger(info.body?.user?.userId)); this.operatorId = info.body.user.userId; return this;
  }
}

async function until(check, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  do { const result = await check(); if (result) return result; await sleep(750); } while (Date.now() < deadline);
  throw new Error(`${label}: timed out; private payload suppressed`);
}

const query = sql => mysqlCommand(`USE majorpilot; ${sql}`).trim();
const scalar = sql => Number(query(sql));
const safeId = value => { assert.match(value, ID); return value; };
const hash = text => createHash('sha256').update(text).digest('hex');
const post = (client, path, body, headers = idempotency(), options = {}) => client.call(path, { method: 'POST', body, headers, ...options });

function temporaryOperator(root, clientOptions) {
  const tag = randomBytes(8).toString('hex'), username = `p7-${tag}`, roleKey = `p7probe_${tag}`;
  const password = `P7-${randomBytes(8).toString('hex')}`; // Retained RuoYi login precheck allows at most 20 characters.
  let roleId, userId, client;
  const discover = () => {
    const roles = query(`SELECT role_id FROM sys_role WHERE role_key='${roleKey}' AND role_name='${username}';`).split(/\s+/).filter(Boolean);
    const users = query(`SELECT user_id FROM sys_user WHERE user_name='${username}' AND nick_name='${username}';`).split(/\s+/).filter(Boolean);
    assert.ok(roles.length <= 1 && users.length <= 1, 'Ambiguous temporary Operator ownership');
    if (roles.length) { assert.match(roles[0], /^[1-9][0-9]*$/); roleId = Number(roles[0]); assert.ok(roleId > 2); }
    if (users.length) { assert.match(users[0], /^[1-9][0-9]*$/); userId = Number(users[0]); assert.ok(userId > 2); }
  };
  return {
    async create() {
      assert.equal(scalar(`SELECT COUNT(*) FROM sys_role WHERE role_key='${roleKey}' OR role_name='${username}';`), 0);
      assert.equal(scalar(`SELECT COUNT(*) FROM sys_user WHERE user_name='${username}';`), 0);
      const menuIds = query("SELECT menu_id FROM sys_menu WHERE status='0' AND perms IN ('majorpilot:overview:view','majorpilot:export:create') ORDER BY menu_id;").split(/\s+/).filter(Boolean).map(Number);
      assert.equal(menuIds.length, 2); assert.ok(menuIds.every(Number.isSafeInteger));
      const role = await root.call('/system/role', { method: 'POST', csrf: false, body: { roleName: username, roleKey, roleSort: 99, status: '0', dataScope: '1', menuCheckStrictly: true, deptCheckStrictly: true, menuIds, remark: 'P7 temporary API verification fixture' } });
      assert.equal(role.body?.code, 200, 'Temporary role creation rejected; no bypass attempted'); discover(); assert.ok(roleId);
      const user = await root.call('/system/user', { method: 'POST', csrf: false, body: { userName: username, nickName: username, password, status: '0', roleIds: [roleId], postIds: [], remark: 'P7 temporary API verification fixture' } });
      assert.equal(user.body?.code, 200, 'Temporary Operator creation rejected; no bypass attempted'); discover(); assert.ok(userId);
      client = await new ProbeClient(clientOptions).operator({ username, password }); assert.equal(client.operatorId, userId); return client;
    },
    async cleanup() {
      if (client?.bearer) {
        const loggedOut = await client.call('/logout', { method: 'POST', body: {}, csrf: false }); assert.equal(loggedOut.body?.code, 200);
        expect(await client.call(`${admin}/overview`), 401, 'temporary Operator JWT revoked through production logout');
        // Upstream logout writes one asynchronous audit row; wait for that exact
        // account's row before removing its fixture-only login history.
        await until(() => scalar(`SELECT COUNT(*) FROM sys_logininfor WHERE user_name='${username}';`) >= 2, 'temporary Operator login/logout audit', 10000);
      }
      discover(); if (!roleId && !userId) return;
      const user = userId || 0, role = roleId || 0;
      assert.equal(scalar(`SELECT COUNT(*) FROM sys_user_role WHERE (role_id=${role} AND user_id<>${user}) OR (user_id=${user} AND role_id<>${role});`), 0, 'Foreign role association prevents fixture cleanup');
      assert.equal(scalar(`SELECT COUNT(*) FROM mp_admin_export WHERE operator_id=${user};`), 0, 'Fixture Operator still owns an export');
      assert.equal(scalar(`SELECT COUNT(*) FROM mp_background_job WHERE owner_operator_id=${user};`), 0, 'Fixture Operator still owns a job');
      // Only the newly created exact names/IDs are removed. Existing menus and
      // root activity logs/permissions are not changed. Logout removes its known
      // JWT session through the production token service, never a Redis scan.
      query(`START TRANSACTION;
        SELECT user_id FROM sys_user WHERE user_id=${user} AND user_name='${username}' FOR UPDATE;
        DELETE FROM mp_sensitive_audit WHERE operator_id=${user};
        DELETE FROM sys_logininfor WHERE user_name='${username}';
        DELETE FROM sys_oper_log WHERE oper_name='${username}';
        DELETE FROM sys_user_post WHERE user_id=${user};
        DELETE FROM sys_user_role WHERE user_id=${user} AND role_id=${role};
        DELETE FROM sys_role_menu WHERE role_id=${role};
        DELETE FROM sys_role_dept WHERE role_id=${role};
        DELETE FROM sys_user WHERE user_id=${user} AND user_name='${username}' AND nick_name='${username}';
        DELETE FROM sys_role WHERE role_id=${role} AND role_key='${roleKey}' AND role_name='${username}'; COMMIT;`);
      assert.equal(scalar(`SELECT COUNT(*) FROM sys_user WHERE user_name='${username}';`), 0);
      assert.equal(scalar(`SELECT COUNT(*) FROM sys_role WHERE role_key='${roleKey}';`), 0);
    },
  };
}

// Creation keys are captured before HTTP, allowing exact cleanup even when the
// create response is lost. No metadata, object or key from another owner is used.
function adminExportScope(operatorId) {
  assert.ok(Number.isSafeInteger(operatorId) && operatorId > 0);
  const keys = new Set(), ids = new Set();
  const scopeHash = hash(`operator:${operatorId}\0POST\0${admin}/exports`);
  return {
    key() { const headers = idempotency(); keys.add(hash(headers['Idempotency-Key'])); return headers; },
    track(id) { ids.add(safeId(id)); },
    cleanup() {
      for (const key of keys) for (const id of query(`SELECT e.public_id FROM mp_idempotency_record i JOIN mp_admin_export e ON e.id=i.resource_id WHERE i.scope_hash='${scopeHash}' AND i.key_hash='${key}' AND i.resource_type='ADMIN_EXPORT' AND e.operator_id=${operatorId};`).split(/\s+/).filter(Boolean)) ids.add(safeId(id));
      for (const publicId of ids) {
        const internal = query(`SELECT id FROM mp_admin_export WHERE public_id='${publicId}' AND operator_id=${operatorId};`); if (!internal) continue; assert.match(internal, /^[1-9][0-9]*$/);
        // The Student fixture cleanup has already run. Any remaining member
        // cannot be this invocation's Student and must prevent raw cleanup.
        assert.equal(scalar(`SELECT COUNT(*) FROM mp_admin_export_student WHERE export_id=${internal};`), 0, 'Member-bearing export must use formal Student deletion');
        query(`START TRANSACTION; SELECT user_id FROM sys_user WHERE user_id=${operatorId} FOR UPDATE; UPDATE mp_admin_export SET status='REVOKED',expires_at=UTC_TIMESTAMP(3) WHERE id=${internal} AND public_id='${publicId}' AND operator_id=${operatorId}; UPDATE mp_background_job SET status='CANCELLED',lease_version=lease_version+1,lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE job_type='ADMIN_EXPORT' AND owner_operator_id=${operatorId} AND target_type='ADMIN_EXPORT' AND target_id=${internal} AND status IN ('PENDING','RUNNING','RETRY_WAIT'); COMMIT;`);
        const objects = new Set(query(`SELECT object_key FROM mp_admin_export WHERE id=${internal} AND object_key IS NOT NULL;`).split(/\s+/).filter(Boolean));
        for (const raw of query(`SELECT checkpoint_json FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND owner_operator_id=${operatorId} AND target_type='ADMIN_EXPORT' AND target_id=${internal};`).split('\n').filter(Boolean)) {
          const checkpoint = JSON.parse(raw); assert.ok(!checkpoint.artifactKeys || Array.isArray(checkpoint.artifactKeys) && checkpoint.artifactKeys.length <= 3); for (const key of checkpoint.artifactKeys || []) objects.add(key);
        }
        for (const key of objects) {
          assert.match(key, /^admin\/[0-7][0-9A-HJKMNP-TV-Z]{25}\.csv$/);
          assert.equal(scalar(`SELECT COUNT(*) FROM mp_admin_export WHERE object_key='${key}' AND id<>${internal};`), 0);
          assert.equal(scalar(`SELECT COUNT(*) FROM mp_student_data_export WHERE object_key='${key}';`), 0);
          assert.equal(scalar(`SELECT COUNT(*) FROM mp_background_job WHERE JSON_CONTAINS(JSON_EXTRACT(checkpoint_json,'$.artifactKeys'),JSON_QUOTE('${key}'))=1 AND NOT COALESCE(job_type='ADMIN_EXPORT' AND owner_operator_id=${operatorId} AND target_type='ADMIN_EXPORT' AND target_id=${internal},FALSE);`), 0);
        }
        for (const key of objects) removeFixtureObject(key);
        query(`START TRANSACTION; DELETE FROM mp_sensitive_audit WHERE operator_id=${operatorId} AND target_type='ADMIN_EXPORT' AND target_public_id='${publicId}'; DELETE FROM mp_idempotency_record WHERE scope_hash='${scopeHash}' AND resource_type='ADMIN_EXPORT' AND resource_id=${internal}; DELETE FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND owner_operator_id=${operatorId} AND target_type='ADMIN_EXPORT' AND target_id=${internal}; DELETE FROM mp_admin_export WHERE id=${internal} AND public_id='${publicId}' AND operator_id=${operatorId}; COMMIT;`);
        assert.equal(scalar(`SELECT COUNT(*) FROM mp_admin_export WHERE public_id='${publicId}';`), 0);
      }
    },
  };
}

export async function runAcceptance() {
  const contract = await loadP7Contracts(), env = readLocalEnv(), verified = new Map(), checks = [], archives = [];
  assert.equal(env.MP_EXPERIENCE_AI_ENABLED, 'false', 'Probe requires network-free experience mode');
  assert.equal(query('SELECT DATABASE();'), 'majorpilot');
  assert.equal(scalar("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8' AND success=1;"), 1, 'V8 must already be migrated');
  const catalogBefore = query("SELECT CONCAT(public_id,':',status,':',row_version) FROM mp_task_version WHERE content_kind='MAJOR' ORDER BY id;");
  const otherStudentsBefore = query('SELECT public_id FROM mp_student_account ORDER BY id;');
  const clientOptions = { contract, verified };
  let pendingChecks = 0, failure, operator, limitedScope, exportsScope;
  const afterRegistration = async (client, body) => {
    await client.publicCsrf();
    assert.equal(expect(await post(client, '/api/public/v1/auth/login', { email: body.email, password: body.password }), 200, 'pending login').status, 'PENDING_VERIFICATION');
    expect(await client.call(`${app}/auth/csrf`), 200, 'pending CSRF');
    assert.deepEqual(expect(await client.call(`${app}/data-export-requests`), 200, 'pending privacy allowed').items, []);
    expect(await client.call(`${app}/experience-runs`), 403, 'pending task access still denied', 'EMAIL_NOT_VERIFIED');
    expect(await client.call(`${app}/me/password`, { method: 'PATCH', body: { currentPassword: 'Wrong-synthetic-password-123', newPassword: 'Valid-synthetic-password-12345' } }), 422, 'pending password access checks current password', 'CURRENT_PASSWORD_INVALID');
    pendingChecks++;
  };
  const scope = createFixtureScope('p7-api', { clientFactory: () => new ProbeClient({ ...clientOptions, afterRegistration }) });
  try {
    // Each one of the 37 operations is bound to its actual response validator.
    // This matrix is auth coverage only, not a claim to 37 successful workflows.
    const anonymous = new ProbeClient(clientOptions);
    for (const op of contract.operations) {
      const path = op.path.replace(/\{[^}]+\}/g, missingId), method = op.method.toUpperCase();
      expect(await anonymous.call(path, { method, ...(method === 'GET' ? {} : { body: {} }), invalidRequest: true }), op.id === 'readDeletionReceipt' ? 404 : 401, `${op.id} anonymous boundary`);
    }
    operator = await new ProbeClient(clientOptions).operator();
    limitedScope = temporaryOperator(operator, clientOptions); const limited = await limitedScope.create(); exportsScope = adminExportScope(operator.operatorId);
    expect(await limited.call(`${admin}/overview`), 200, 'limited Operator allowed overview');
    expect(await limited.call(`${admin}/students`), 403, 'limited Operator denied Student list', 'PERMISSION_DENIED');
    const first = await scope.student(), second = await scope.student(), client = first.client, foreign = second.client;
    assert.equal(pendingChecks, 2); safeId(first.account.studentId); safeId(second.account.studentId);
    expect(await operator.call(`${app}/data-export-requests`), 401, 'Operator JWT cannot become Student');
    expect(await client.call(`${admin}/overview`), 401, 'Student cookie cannot become Operator');
    for (const student of [first, second]) {
      const detail = expect(await operator.call(`${admin}/students/${student.account.studentId}`), 200, 'pseudonymous Student detail');
      assert.ok(!JSON.stringify(detail).includes(student.email));
      const body = { expectedRevision: detail.summary.revision, exclusionCode: 'TEST', reason: 'Synthetic scoped P7 HTTP acceptance account' }, headers = idempotency();
      const changed = expect(await operator.call(`${admin}/students/${student.account.studentId}/analytics-exclusion`, { method: 'PATCH', body, headers }), 200, 'explicit TEST exclusion');
      assert.equal(changed.analyticsExclusionCode, 'TEST');
      assert.deepEqual(expect(await operator.call(`${admin}/students/${student.account.studentId}/analytics-exclusion`, { method: 'PATCH', body, headers }), 200, 'exclusion receipt replay'), changed);
    }
    checks.push('all 37 contract-bound anonymous boundaries; two real pending-to-verified identities; Student/Operator isolation; explicit TEST exclusion and replay');

    const overview = expect(await operator.call(`${admin}/overview`), 200, 'actual overview');
    assert.equal(overview.metricsVersion, 'metrics-v2');
    for (const metric of Object.values(overview.metrics)) if (metric && Object.hasOwn(metric, 'denominator')) { assert.ok(metric.numerator <= metric.denominator); if (metric.denominator === 0) assert.equal(metric.rate, null); }
    for (const route of ['students', 'experience-runs', 'reports/page', 'task-versions/page', 'audit-events']) {
      const page = expect(await operator.call(`${admin}/${route}?pageNum=1&pageSize=1`), 200, 'bounded operations page'); assert.ok(page.rows.length <= 1 && page.total >= page.rows.length);
      expect(await operator.call(`${admin}/${route}?pageSize=101`), 422, 'page upper bound');
      expect(await operator.call(`${admin}/${route}?sortBy=unsupported_column`), 422, 'sort whitelist');
    }
    expect(await operator.call(`${admin}/reports/page?reportType=COMPARISON&majorCode=AI`), 422, 'comparison cannot inherit Run dimension', 'FILTER_CONFLICT');
    const summary = expect(await operator.call(`${admin}/students/${first.account.studentId}`), 200, 'minimal details');
    assert.ok(!JSON.stringify(summary).includes(first.email));
    const beforeAudit = scalar(`SELECT COUNT(*) FROM mp_sensitive_audit WHERE action_code='STUDENT_SENSITIVE_READ' AND target_public_id='${first.account.studentId}';`);
    const sensitive = expect(await post(operator, `${admin}/students/${first.account.studentId}/sensitive-view`, { purpose: 'QUALITY_REVIEW', reason: 'Synthetic own-fixture identity projection verification' }, {}), 200, 'explicit sensitive read');
    assert.ok(sensitive.email === first.email, 'Sensitive projection identity mismatch; addresses suppressed'); assert.equal(scalar(`SELECT COUNT(*) FROM mp_sensitive_audit WHERE action_code='STUDENT_SENSITIVE_READ' AND target_public_id='${first.account.studentId}';`), beforeAudit + 1);
    expect(await post(limited, `${admin}/students/${first.account.studentId}/sensitive-view`, { purpose: 'QUALITY_REVIEW', reason: 'Synthetic denied sensitive identity verification' }, {}), 403, 'independent sensitive permission', 'PERMISSION_DENIED');
    checks.push('live metrics envelope/null denominators; bounded pagination/sort/filter conflict; minimal identity and transactional sensitive-read audit');

    const tasks = expect(await operator.call(`${admin}/task-versions/page?pageSize=100`), 200, 'task version catalog');
    const review = tasks.rows.find(task => task.contentKind === 'MAJOR' && task.status === 'REVIEW'); assert.ok(review, 'Main REVIEW content must remain reviewable');
    const reviewContext = expect(await operator.call(`${admin}/task-versions/${review.taskVersionId}/review-context`), 200, 'review checklist context');
    assert.ok(reviewContext.requiredReviewChecks.length > 0); assert.ok(!reviewContext.manifestPath.startsWith('/') && !reviewContext.manifestPath.includes('..'));
    expect(await operator.call(`${admin}/task-versions`), 200, 'old task array preserved'); expect(await operator.call(`${admin}/reports`), 200, 'old report array preserved');
    // Missing IDs safely exercise report/Run APIs without writing business state
    // or treating REVIEW as human-reviewed professional content.
    for (const path of [`experience-runs/${missingId}`, `reports/${missingId}`, `reports/${missingId}/versions`, `reports/${missingId}/versions/${missingId}`]) expect(await operator.call(`${admin}/${path}`), 404, 'unknown private admin resource');
    if (env.MP_CONTENT_PREVIEW_ENABLED === 'true') {
      let run = expect(await post(client, `${app}/review-preview-runs`, { taskVersionId: review.taskVersionId }), 201, 'explicit non-production content preview');
      run = expect(await post(client, `${app}/experience-runs/${run.runId}/start`, { expectedRevision: run.revision }), 200, 'start engineering preview');
      assert.equal(run.runMode, 'REVIEW_PREVIEW');
      const task = expect(await client.call(`${app}/experience-runs/${run.runId}/task`), 200, 'preview fixed task');
      const step = task.steps[0].stepKey;
      expect(await client.call(`${app}/experience-runs/${run.runId}/steps/${step}`), 200, 'preview step state');
      const observed = { clientEventId: randomUUID(), eventName: 'experience.step.viewed', eventVersion: 'v1', occurredAt: new Date().toISOString(), visibleDurationMs: 1000, contextType: 'EXPERIENCE_RUN', contextPublicId: run.runId, properties: { stepKey: step } };
      expect(await post(client, `${app}/events`, { events: [observed] }, {}), 202, 'owner step observation');
      expect(await post(client, `${app}/events`, { events: [observed] }, {}), 202, 'duplicate step observation accepted idempotently');
      assert.equal(scalar(`SELECT COUNT(*) FROM mp_product_event WHERE client_event_id='${observed.clientEventId}' AND student_id=(SELECT id FROM mp_student_account WHERE public_id='${first.account.studentId}');`), 1, 'one actual event after duplicate submission');
      expect(await post(foreign, `${app}/events`, { events: [{ ...observed, clientEventId: randomUUID() }] }, {}), 422, 'cross-owner step observation', 'EVENT_BATCH_INVALID');
      const diagnostic = expect(await operator.call(`${admin}/experience-runs/${run.runId}`), 200, 'preview Run diagnosis'); assert.equal(diagnostic.summary.runMode, 'REVIEW_PREVIEW');
      expect(await post(operator, `${admin}/experience-runs/${run.runId}/sensitive-view`, { purpose: 'QUALITY_REVIEW', reason: 'Synthetic own-fixture preview support inspection' }, {}), 200, 'audited scoped Run support');
      checks.push('explicit REVIEW_PREVIEW only, actual owned step observation and duplicate/cross-owner boundary, Run diagnostics and audited support');
    }

    for (const exportScope of ['REPORTS_ONLY', 'FULL_PERSONAL_EXPORT']) {
      const body = { scope: exportScope }, headers = idempotency();
      const request = expect(await post(client, `${app}/data-export-requests`, body, headers), 202, 'personal export accepted'); safeId(request.exportId);
      assert.equal(expect(await post(client, `${app}/data-export-requests`, body, headers), 202, 'personal export replay').exportId, request.exportId);
      const path = `${app}/data-export-requests/${request.exportId}`;
      expect(await foreign.call(path), 404, 'foreign export metadata');
      const ready = await until(async () => { const value = expect(await client.call(path), 200, 'personal export status'); assert.notEqual(value.status, 'FAILED'); return value.status === 'READY' && value; }, 'personal export ready');
      assert.equal(Date.parse(ready.expiresAt) - Date.parse(ready.completedAt), 86400000, 'Private file lifetime is exactly 24h');
      expect(await client.call(`${path}/download`), 403, 'download requires CSRF', 'CSRF_INVALID');
      expect(await client.call(`${path}/download`, { csrf: true, headers: { Origin: 'https://untrusted.invalid' } }), 403, 'download requires exact source', 'CSRF_INVALID');
      expect(await client.call(`${path}/download`, { csrf: true, omitOrigin: true }), 403, 'missing Origin and fetch metadata denied', 'CSRF_INVALID');
      expect(await foreign.call(`${path}/download`, { csrf: true }), 404, 'foreign download denied');
      const download = await client.call(`${path}/download`, { csrf: true }); assert.equal(download.status, 200); assert.equal(download.bytes.length, ready.fileSizeBytes);
      assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await client.call(`${path}/download`, { csrf: true, omitOrigin: true, headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200, 'narrow browser same-origin GET fallback');
      archives.push({ scope: exportScope, ...validatePersonalArchive(download.bytes, { scope: exportScope, studentId: first.account.studentId, email: first.email, foreignEmail: second.email, password: first.password }) });
    }
    const list = expect(await client.call(`${app}/data-export-requests`), 200, 'reload-recoverable export history'); assert.equal(list.items.length, 2);
    checks.push('both actual ZIP scopes/manifest/CRC/ownership; 24h declared lifetime; exact Origin+CSRF and browser fetch-metadata fallback; reload history');

    expect(await post(operator, `${admin}/exports`, { dataset: 'STUDENTS', filters: {}, fields: ['email'], purpose: 'Synthetic export whitelist rejection' }, idempotency(), { invalidRequest: true }), 422, 'CSV forbids email');
    expect(await post(operator, `${admin}/exports`, { dataset: 'STUDENTS', filters: {}, fields: ['alias'], purpose: '' }, idempotency(), { invalidRequest: true }), 422, 'CSV requires purpose');
    expect(await operator.call(`${admin}/exports/${missingId}`), 404, 'unknown private CSV'); expect(await operator.call(`${admin}/exports/${missingId}/download`), 404, 'unknown CSV download');
    // A time window created after both TEST fixtures excludes pre-existing
    // Students, so the real CSV has a validated header and zero data rows. Row
    // counts/formula fixtures are separately covered by MySQL/golden tests.
    const csvAsOf = new Date().toISOString(), csvFrom = new Date(Date.parse(csvAsOf) - 1).toISOString();
    const csvBody = { dataset: 'STUDENTS', filters: { from: csvFrom, to: csvAsOf, asOf: csvAsOf }, fields: ['alias', 'status', 'createdAt'], purpose: 'Synthetic empty-cohort CSV byte and access verification' };
    const csvHeaders = exportsScope.key(), csv = expect(await post(operator, `${admin}/exports`, csvBody, csvHeaders), 202, 'real private CSV accepted'); exportsScope.track(csv.exportId);
    assert.equal(expect(await post(operator, `${admin}/exports`, csvBody, csvHeaders), 202, 'CSV receipt replay').exportId, csv.exportId);
    expect(await limited.call(`${admin}/exports/${csv.exportId}`), 404, 'export permission is not another Operator ownership');
    expect(await limited.call(`${admin}/exports/${csv.exportId}/download`), 404, 'cross-Operator CSV download');
    const csvReady = await until(async () => { const value = expect(await operator.call(`${admin}/exports/${csv.exportId}`), 200, 'CSV job status'); assert.notEqual(value.status, 'FAILED'); return value.status === 'READY' && value; }, 'private CSV ready');
    assert.equal(csvReady.rowCount, 0); assert.equal(Date.parse(csvReady.expiresAt) - Date.parse(csvReady.completedAt), 86400000);
    const csvAuditBefore = scalar(`SELECT COUNT(*) FROM mp_sensitive_audit WHERE target_type='ADMIN_EXPORT' AND target_public_id='${csv.exportId}' AND action_code='ADMIN_EXPORT_DOWNLOADED';`);
    const csvFile = await operator.call(`${admin}/exports/${csv.exportId}/download`); assert.equal(csvFile.status, 200); assert.equal(csvFile.text, '\uFEFF"alias","status","createdAt"\r\n'); assert.equal(csvFile.bytes.length, csvReady.fileSizeBytes);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_sensitive_audit WHERE target_type='ADMIN_EXPORT' AND target_public_id='${csv.exportId}' AND action_code='ADMIN_EXPORT_DOWNLOADED';`), csvAuditBefore + 1);
    checks.push('minimal real Operator permissions; CSV whitelist/purpose/replay; ready 24h private CSV bytes; independent Operator ownership and download audit');

    const issuedReceipt = await post(client, `${app}/account-deletion-requests`, {});
    const receiptRequest = expect(issuedReceipt, 201, 'deletion request and preissued cookie');
    const setReceipt = issuedReceipt.setCookies.find(value => value.startsWith('MP_DELETION='));
    assert.ok(setReceipt && /;\s*HttpOnly(?:;|$)/i.test(setReceipt) && /;\s*SameSite=Lax(?:;|$)/i.test(setReceipt) && !/;\s*Domain=/i.test(setReceipt), 'Deletion receipt must be host-only/HttpOnly/Lax');
    scope.trackReceipt(receiptRequest.receiptId); safeId(receiptRequest.requestId); safeId(receiptRequest.receiptId);
    const receiptPath = `/api/public/v1/deletion-receipts/${receiptRequest.receiptId}`;
    const receiptCookie = client.cookies.get('MP_DELETION'); assert.equal(receiptCookie?.path, '/api/public/v1/deletion-receipts'); assert.ok(/^[A-Za-z0-9_-]{43}$/.test(receiptCookie.value), 'Invalid receipt credential shape; value suppressed');
    assert.ok(!JSON.stringify(receiptRequest).includes(receiptCookie.value));
    assert.ok(query(`SELECT receipt_secret_hash FROM mp_account_deletion_request WHERE public_id='${receiptRequest.requestId}' AND student_id=(SELECT id FROM mp_student_account WHERE public_id='${first.account.studentId}');`) === hash(receiptCookie.value), 'Receipt persists only its hash; credential suppressed');
    assert.equal(expect(await client.call(`${app}/account-deletion-requests/${receiptRequest.requestId}`), 200, 'owned deletion state').status, 'REQUESTED');
    expect(await foreign.call(`${app}/account-deletion-requests/${receiptRequest.requestId}`), 404, 'cross-owner deletion state');
    expect(await new ProbeClient(clientOptions).call(receiptPath), 404, 'receipt ID alone is not a credential');
    const badReceipt = client.clone(); badReceipt.cookies.set('MP_DELETION', { ...receiptCookie, value: randomBytes(32).toString('base64url') });
    expect(await badReceipt.call(receiptPath), 404, 'wrong receipt credential is indistinguishable'); assert.ok(!badReceipt.cookies.has('MP_DELETION'), 'Rejected receipt credential is cleared');
    assert.equal(expect(await client.call(receiptPath), 200, 'preissued receipt before confirmation').status, 'REQUESTED');
    expect(await post(client, `${app}/account-deletion-requests/${receiptRequest.requestId}/confirm`, { currentPassword: 'Wrong-synthetic-password-123' }), 422, 'delete current password', 'CURRENT_PASSWORD_INVALID');
    const priorSession = client.clone(), receiptOnly = new ProbeClient(clientOptions); receiptOnly.cookies.set('MP_DELETION', { ...receiptCookie });
    // A real successful confirmation is issued; its returned body is discarded.
    // The subsequent path uses only the cookie that predated confirmation, as a
    // lost-response client would. No claim to injecting a socket failure.
    const confirmed = await post(client, `${app}/account-deletion-requests/${receiptRequest.requestId}/confirm`, { currentPassword: first.password }); assert.equal(confirmed.status, 202);
    expect(await priorSession.call(`${app}/me`), 401, 'pre-confirmation session revoked');
    expect(await priorSession.call(`${app}/data-export-requests/${list.items[0].exportId}/download`, { csrf: true }), 401, 'old export inaccessible after confirmation');
    const done = await until(async () => { const value = expect(await receiptOnly.call(receiptPath), 200, 'cookie-only deletion recovery'); assert.notEqual(value.status, 'ACTION_REQUIRED'); return value.status === 'COMPLETED' && value; }, 'durable deletion complete', 120000);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_student_account WHERE public_id='${first.account.studentId}';`), 0);
    assert.equal(scalar(`SELECT COUNT(*) FROM mp_account_deletion_request WHERE public_id='${receiptRequest.requestId}' AND status='COMPLETED' AND student_id IS NULL;`), 1);
    assert.ok(Date.parse(done.expiresAt) <= Date.parse(done.confirmedAt) + 120 * 86400000 && Date.parse(done.expiresAt) <= Date.parse(done.completedAt) + 90 * 86400000);
    assert.equal(expect(await foreign.call(`${app}/me`), 200, 'other Student remains usable').studentId, second.account.studentId);
    assert.ok(!JSON.stringify(done).includes(first.email) && !JSON.stringify(done).includes(first.account.studentId));
    checks.push('preseeded path-scoped receipt hash; password recheck; discard-response cookie-only recovery; immediate session/download revocation; durable exact deletion and another Student preserved');
  } catch (error) { failure = error; }
  finally {
    try { await scope.cleanup(); } catch { failure ??= new Error('Exact fixture cleanup failed; private details suppressed'); }
    try { exportsScope?.cleanup(); } catch { failure ??= new Error('Exact admin export cleanup failed; private details suppressed'); }
    try { await limitedScope?.cleanup(); } catch { failure ??= new Error('Exact temporary Operator cleanup failed; private details suppressed'); }
    if (operator?.bearer) try { await operator.call('/logout', { method: 'POST', body: {}, csrf: false }); } catch { failure ??= new Error('Operator logout failed; token suppressed'); }
  }
  assert.equal(query("SELECT CONCAT(public_id,':',status,':',row_version) FROM mp_task_version WHERE content_kind='MAJOR' ORDER BY id;"), catalogBefore, 'Professional publication state changed');
  assert.equal(query('SELECT public_id FROM mp_student_account ORDER BY id;'), otherStudentsBefore, 'Non-fixture Student state changed or fixture remains');
  if (failure) throw failure;
  const operations = Object.fromEntries([...verified].sort().map(([id, statuses]) => [id, [...statuses].sort()]));
  return { result: 'PASS', scope: 'P7 actual local HTTP, not public deployment', checks, archives, operations, operationCount: verified.size, successfulOperationCount: [...verified.values()].filter(statuses => [...statuses].some(status => status >= 200 && status < 300)).length,
    remainingGates: ['24h expiry boundary uses clock-injected MySQL tests; this probe verifies declared 24h lifetime only', 'nonempty CSV/formula/golden metrics use isolated MySQL fixtures', 'nonempty report HTML/archive versions use formal isolated fixtures', 'multi-session settings and actual browser flows', 'JVM restart and concurrent deletion/publication tested separately'], accountsCreated: 2, fixtureAccountsRemaining: 0, temporaryOperatorsCreated: 1, temporaryOperatorsRemaining: 0, reviewContentUnchanged: true, paidCalls: 0 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    assert.ok(process.argv.length === 3 && ['--check', '--run'].includes(process.argv[2]), 'Use --check for zero-I/O preflight or explicitly --run for local HTTP acceptance');
    const result = process.argv[2] === '--check' ? { ...await checkP7(), scope: 'P7 API probe static preflight; no HTTP/DB/account access', plannedAccounts: 2, accountsCreated: 0 } : await runAcceptance();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
