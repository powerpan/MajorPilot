import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { ProbeClient, crc32, unzipPersonal, validatePersonalArchive, operationFor } from './test-p7-api.mjs';
import { loadP7Contracts } from '../contracts/check-p7.mjs';

const id = '01JF1000000000000000000001';
const contract = await loadP7Contracts();
function archive(entries, { compressed = true } = {}) {
  const local = [], directory = []; let offset = 0;
  for (const [name, source] of entries) {
    const raw = Buffer.from(source), data = compressed ? deflateRawSync(raw) : raw, filename = Buffer.from(name);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(compressed ? 8 : 0, 8);
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(compressed ? 8 : 0, 10);
    entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(head, filename, data); directory.push(entry, filename); offset += head.length + filename.length + data.length;
  }
  const table = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(table.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, table, end]);
}
function response(body, { status = 200, media = 'application/json', cookies = [] } = {}) {
  const headers = new Headers({ 'Content-Type': media, 'Cache-Control': 'no-store' }); for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(media === 'application/json' ? JSON.stringify(body) : body, { status, headers });
}
const envelope = data => ({ data, meta: { requestId: 'synthetic-contract-test', apiVersion: 'v1' } });

test('37 operations match query-stripped exact method and full path', () => {
  assert.equal(contract.operations.length, 37);
  assert.equal(operationFor(contract.operations, '/api/app/v1/data-export-requests?limit=10').id, 'listPersonalExports');
  assert.equal(operationFor(contract.operations, `/api/app/v1/data-export-requests/${id}/download`).id, 'downloadPersonalExport');
  assert.equal(operationFor(contract.operations, '/api/app/v1/data-export-requests', 'POST').id, 'createPersonalExport');
  assert.equal(operationFor(contract.operations, '/api/app/v1/data-export-requests/not/an/operation'), undefined);
  assert.equal(operationFor(contract.operations, '/api/admin/v1/majorpilot/reports/page').path, '/api/admin/v1/majorpilot/reports/page');
  assert.equal(operationFor(contract.operations, `/api/admin/v1/majorpilot/reports/${id}`).path, '/api/admin/v1/majorpilot/reports/{id}');
});
test('CRC32 uses the standard ZIP polynomial', () => assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926));
test('stored and DEFLATE archives are parsed as bytes without filesystem extraction', () => {
  for (const compressed of [true, false]) {
    const bytes = archive([['manifest.json', '{"scope":"REPORTS_ONLY"}']], { compressed });
    assert.equal(unzipPersonal(bytes).get('manifest.json').toString(), '{"scope":"REPORTS_ONLY"}');
  }
});
test('directory/file corruption, traversal, duplicate entries and archive bombs fail closed', () => {
  assert.throws(() => unzipPersonal(archive([['../manifest.json', '{}']])));
  assert.throws(() => unzipPersonal(archive([['manifest.json', '{}'], ['manifest.json', '{}']])));
  const corrupt = archive([['manifest.json', '{}']], { compressed: false }); corrupt[30 + 'manifest.json'.length] ^= 1;
  assert.throws(() => unzipPersonal(corrupt), /checksum/);
  const bomb = archive([['manifest.json', '{}']]); const central = bomb.readUInt32LE(bomb.length - 6); bomb.writeUInt32LE(65 * 1024 * 1024, central + 24);
  assert.throws(() => unzipPersonal(bomb), /expansion/);
  assert.throws(() => unzipPersonal(Buffer.from('not an archive')));
});
test('personal archive checks scope, exact identity, complete manifest and forbidden internal fields', () => {
  const personal = { schemaVersion: 'personal-data-v1', account: { studentId: id, email: 'test@example.invalid' }, profiles: [{}], recommendations: [{}], consents: [{}, {}, {}] };
  const manifest = { schemaVersion: 'personal-export-v1', scope: 'FULL_PERSONAL_EXPORT', studentId: id, generatedAt: '2026-09-21T10:00:00Z', notes: ['Synthetic'], files: [{ path: 'personal-data.json' }] };
  const build = () => archive([['personal-data.json', JSON.stringify(personal)], ['manifest.json', JSON.stringify(manifest)]]);
  const input = { scope: 'FULL_PERSONAL_EXPORT', studentId: id, email: 'test@example.invalid', foreignEmail: 'other@example.invalid', password: 'secret-fixture-password' };
  assert.deepEqual(validatePersonalArchive(build(), input), { entries: 2, reportVersions: 0 });
  personal.account.email = input.foreignEmail; assert.throws(() => validatePersonalArchive(build(), input), /Foreign identity/); personal.account.email = input.email;
  personal.passwordHash = 'hash'; assert.throws(() => validatePersonalArchive(build(), input), /Private internal field/); delete personal.passwordHash;
  manifest.files = []; assert.throws(() => validatePersonalArchive(build(), input));
});
test('report-only manifest cannot quietly include personal JSON or active HTML', () => {
  const manifest = { schemaVersion: 'personal-export-v1', scope: 'REPORTS_ONLY', studentId: id, generatedAt: '2026-09-21T10:00:00Z', notes: ['Synthetic'], files: [] };
  assert.deepEqual(validatePersonalArchive(archive([['manifest.json', JSON.stringify(manifest)]]), { scope: 'REPORTS_ONLY', studentId: id }), { entries: 1, reportVersions: 0 });
  manifest.files = [{ path: `reports/${id}.html` }];
  assert.throws(() => validatePersonalArchive(archive([[`reports/${id}.html`, '<meta http-equiv="Content-Security-Policy"><script>alert(1)</script>'], ['manifest.json', JSON.stringify(manifest)]]), { scope: 'REPORTS_ONLY', studentId: id }));
});
test('actual operation validator binds every JSON payload, rejecting private drift', async () => {
  const verified = new Map();
  const client = new ProbeClient({ contract, verified, fetcher: async () => response(envelope({ items: [] })) });
  assert.equal((await client.call('/api/app/v1/data-export-requests')).status, 200); assert.deepEqual([...verified.get('listPersonalExports')], [200]);
  client.fetcher = async () => response(envelope({ items: [], privatePath: '/private/secret' }));
  await assert.rejects(() => client.call('/api/app/v1/data-export-requests'), /contract mismatch/);
});
test('invalid contract requests are rejected before making a network call', async () => {
  let calls = 0; const client = new ProbeClient({ contract, fetcher: async () => { calls++; return response({}); } });
  await assert.rejects(() => client.call('/api/app/v1/data-export-requests', { method: 'POST', body: { scope: 'DATABASE_DUMP' } }), /request contract rejected/);
  assert.equal(calls, 0);
});
test('download preserves raw ZIP and sends path-limited Student credentials', async () => {
  const zip = archive([['manifest.json', '{}']]); let headers;
  const client = new ProbeClient({ contract, fetcher: async (url, init) => { headers = init.headers; return response(zip, { media: 'application/zip' }); } });
  client.cookies.set('MP_SESSION', { path: '/api/app/v1', value: 'session' }); client.cookies.set('MP_CSRF', { path: '/', value: 'csrf' }); client.cookies.set('MP_DELETION', { path: '/api/public/v1/deletion-receipts', value: 'receipt' });
  const result = await client.call(`/api/app/v1/data-export-requests/${id}/download`, { csrf: true, omitOrigin: true, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.deepEqual(result.bytes, zip); assert.equal(result.text, ''); assert.equal(headers.Origin, undefined); assert.equal(headers['X-CSRF-Token'], 'csrf'); assert.ok(!headers.Cookie.includes('receipt'));
});
test('preseeded receipt cookie is isolated from app paths and cloned independently', async () => {
  let sent; const client = new ProbeClient({ fetcher: async (url, init) => { sent = init.headers; return response(envelope({}), { cookies: ['MP_DELETION=synthetic; Path=/api/public/v1/deletion-receipts; HttpOnly; SameSite=Lax'] }); } });
  await client.call('/api/app/v1/account-deletion-requests', { method: 'POST', body: {} });
  const cloned = client.clone(); await cloned.call(`/api/public/v1/deletion-receipts/${id}`); assert.match(sent.Cookie, /MP_DELETION=synthetic/);
  await client.call('/api/app/v1/me'); assert.ok(!sent.Cookie?.includes('MP_DELETION'));
  cloned.cookies.delete('MP_DELETION'); assert.ok(client.cookies.has('MP_DELETION'));
});
test('static import has no execution; CLI requires explicit run/check and forbids professional publication', () => {
  const source = readFileSync(new URL('./test-p7-api.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("['--check', '--run']")); assert.ok(source.includes("operationFor(this.contract.operations"));
  assert.ok(!/post\([^\n]*\/publish/.test(source)); assert.ok(!source.includes('FLUSHDB') && !source.includes('FOREIGN_KEY_CHECKS=0'));
});
