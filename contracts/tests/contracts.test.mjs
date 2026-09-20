import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadContracts, check } from '../check.mjs';
import { validateResult } from '../../scripts/ai-spike.mjs';

const contracts = await loadContracts();
const id = 'b4fcb148-3554-4da8-835c-52d40cd761f2';
const meta = { requestId: id, apiVersion: 'v1' };
const operation = name => contracts.operations.find(item => item.id === name);

test('OpenAPI 3.1 is valid, schemas compile, and security requirements are explicit', async () => {
  const result = await check();
  assert.equal(result.result, 'PASS');
  assert.equal(result.operations, 16);
});

test('contract path and method inventory matches annotated P0 controllers', () => {
  const directory = new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/p0/', import.meta.url);
  const source = readdirSync(directory).filter(file => file.endsWith('Controller.java')).map(file => readFileSync(new URL(file, directory), 'utf8')).join('\n');
  const implemented = [...source.matchAll(/@(Get|Post|Delete|Put|Patch)Mapping\("([^"]+)"\)/gu)].map(match => `${match[1].toLowerCase()} ${match[2]}`).sort();
  const declared = contracts.operations.map(item => `${item.method} ${item.path}`).sort();
  assert.deepEqual(declared, implemented);
});

test('success envelopes require correlation metadata and reject unknown outer fields', () => {
  const validate = operation('p0StudentWhoami').response;
  assert.equal(validate({ data: { studentId: id, subjectType: 'P0_STUDENT' }, meta }), true);
  assert.equal(validate({ data: { studentId: id, subjectType: 'P0_STUDENT' } }), false);
  assert.equal(validate({ data: { studentId: id, subjectType: 'P0_STUDENT', password: 'not-allowed' }, meta }), false);
  assert.equal(validate({ data: { studentId: id, subjectType: 'P0_STUDENT' }, meta, token: 'not-allowed' }), false);
});

test('health responses retain all current controller fields in both ready and degraded reports', () => {
  const ready = operation('p0Health').response;
  const healthOperation = contracts.api.paths['/api/public/v1/p0/health'].get;
  const degraded = contracts.ajv.compile(healthOperation.responses['503'].content['application/json'].schema);
  const data = { scope: 'p0-local-only', database: 'UP', redis: 'UP', migration: 'UP', model: 'NOT_CHECKED', mail: 'NOT_CHECKED' };
  assert.equal(ready({ data, meta }), true);
  assert.equal(degraded({ data: { ...data, redis: 'DOWN' }, meta }), true);
  assert.equal(degraded({ data: { ...data, database: 'DOWN', migration: 'DOWN' }, meta }), true);
  for (const field of ['redis', 'migration', 'model', 'mail']) {
    const incomplete = { ...data };
    delete incomplete[field];
    assert.equal(ready({ data: incomplete, meta }), false);
  }
  assert.equal(ready({ data: { ...data, model: 'UP' }, meta }), false);
  assert.equal(degraded({ error: { code: 'INTERNAL_ERROR' }, meta }), false);
});

test('login and example requests reject overlong and undeclared input', () => {
  const login = operation('p0Login').request;
  assert.equal(login({ studentId: id, password: 'synthetic-password-only' }), true);
  assert.equal(login({ studentId: id, password: 'synthetic-password-only', admin: true }), false);
  const example = operation('p0CreateExample').request;
  assert.equal(example({ label: 'P0 persistence probe' }), true);
  assert.equal(example({ label: 'x'.repeat(81) }), false);
  assert.equal(example({ label: 'ok', actorId: id }), false);
  const mail = operation('p0Mail').request;
  assert.equal(mail({ kind: 'verify' }), true);
  assert.equal(mail({ kind: 'reset', to: 'user@example.invalid' }), false);
  assert.equal(mail({ kind: null }), false);
});

test('receipt response exposes status only, not student identity or credentials', () => {
  const validate = operation('deletionReceipt').response;
  assert.equal(validate({ data: { status: 'REQUESTED' }, meta }), true);
  assert.equal(validate({ data: { status: 'COMPLETED' }, meta }), true);
  assert.equal(validate({ data: { status: 'COMPLETED', studentId: id }, meta }), false);
});

test('operator and student identities cannot be conflated in the declared schema', () => {
  assert.equal(operation('p0OperatorWhoami').response({ data: { subjectType: 'RUOYI_OPERATOR', userId: 1 }, meta }), true);
  assert.equal(operation('p0StudentWhoami').response({ data: { subjectType: 'RUOYI_OPERATOR', userId: 1 }, meta }), false);
});

test('strict AI JSON schema and zero-dependency validator agree on synthetic cases', () => {
  const valid = { schemaVersion: 'p0-ai-v1', major: 'DATA_SCIENCE', evidenceIds: ['synthetic_ev_1'], explanation: '体验顺序建议。' };
  const values = [valid, { ...valid, major: 'AI' }, { ...valid, evidenceIds: ['missing'] }, { ...valid, fitScore: 50 }, { ...valid, explanation: 'a'.repeat(161) }, { ...valid, explanation: '' }];
  for (const value of values) assert.equal(validateResult(value), contracts.aiValidator(value));
  // Additional business safety checks intentionally go beyond structural JSON Schema.
  const active = { ...valid, explanation: '<script>unsafe</script>' };
  assert.equal(contracts.aiValidator(active), true);
  assert.equal(validateResult(active), false);
});
