import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadContracts() {
  const original = JSON.parse(readFileSync(new URL('./openapi-p0.json', import.meta.url), 'utf8'));
  const api = await SwaggerParser.validate(structuredClone(original), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const aiSchema = JSON.parse(readFileSync(new URL('./schemas/p0-ai-result.schema.json', import.meta.url), 'utf8'));
  const aiValidator = ajv.compile(aiSchema);
  const operations = [];
  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'delete', 'put', 'patch'].includes(method)) continue;
      const responseSchema = operation.responses['200'].content['application/json'].schema;
      const requestSchema = operation.requestBody?.content['application/json'].schema;
      operations.push({ path, method, id: operation.operationId, response: ajv.compile(responseSchema), request: requestSchema ? ajv.compile(requestSchema) : undefined });
    }
  }
  return { api, original, ajv, aiValidator, operations };
}

export async function check() {
  const { original, operations, aiValidator } = await loadContracts();
  assert.equal(original.openapi, '3.1.0');
  assert.equal(new Set(operations.map(item => item.id)).size, operations.length);
  for (const { path, method } of operations) {
    const operation = original.paths[path][method];
    if (path.startsWith('/api/app/')) assert.ok(operation.security.some(item => Object.hasOwn(item, 'StudentSession')));
    if (path.startsWith('/api/admin/')) assert.deepEqual(operation.security, [{ OperatorToken: [] }]);
    if (['post', 'delete', 'put', 'patch'].includes(method)) {
      assert.ok(operation.security.some(item => Object.hasOwn(item, 'CsrfHeader')));
      assert.ok(operation.parameters.some(item => item.$ref === '#/components/parameters/Origin'));
    }
  }
  assert.equal(aiValidator({ schemaVersion: 'p0-ai-v1', major: 'DATA_SCIENCE', evidenceIds: ['synthetic_ev_1'], explanation: '合成数据测试。' }), true);
  return { scope: 'static-contract-only', openapiVersion: original.openapi, operations: operations.length, jsonSchemas: 1, result: 'PASS', liveHttpVerified: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await check(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
