import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadP3Contracts() {
  const original = JSON.parse(readFileSync(new URL('./openapi-p3.json', import.meta.url), 'utf8'));
  const api = await SwaggerParser.validate(structuredClone(original), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const schemas = Object.fromEntries(Object.entries(api.components.schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
  const operations = [];
  for (const [path, methods] of Object.entries(api.paths)) for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
    const responses = Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => [status, response.content?.['application/json']?.schema ? ajv.compile(response.content['application/json'].schema) : undefined]));
    const request = operation.requestBody?.content['application/json'].schema;
    operations.push({ path, method, id: operation.operationId, request: request ? ajv.compile(request) : undefined, responses });
  }
  return { original, api, ajv, schemas, operations };
}
export async function checkP3() {
  const { original, schemas, operations } = await loadP3Contracts();
  assert.equal(original.openapi, '3.1.0'); assert.equal(operations.length, 27);
  assert.equal(new Set(operations.map(o => o.id)).size, operations.length);
  for (const { path, method } of operations) {
    const operation = original.paths[path][method];
    if (path.startsWith('/api/app/')) {
      assert.ok(operation.security.some(s => Object.hasOwn(s, 'StudentSession')));
      if (method !== 'get') {
        assert.ok(operation.security.some(s => Object.hasOwn(s, 'CsrfHeader')));
        assert.ok(operation.parameters.some(p => p.$ref === '#/components/parameters/Origin'));
        if (method === 'post') assert.ok(operation.parameters.some(p => p.$ref === '#/components/parameters/IdempotencyKey'));
      }
    } else assert.ok(operation.security.some(s => Object.hasOwn(s, 'AdminBearer')));
  }
  return { result: 'PASS', scope: 'p3-static-contract', operations: operations.length, schemas: Object.keys(schemas).length, liveHttpVerified: false, paidModelCalls: 0 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await checkP3(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
