import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadP1Contracts() {
  const original = JSON.parse(readFileSync(new URL('./openapi-p1.json', import.meta.url), 'utf8'));
  const api = await SwaggerParser.validate(structuredClone(original), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schemas = Object.fromEntries(Object.entries(api.components.schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
  const operations = [];
  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
      const responses = Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => {
        const schema = response.content?.['application/json']?.schema;
        return [status, schema ? ajv.compile(schema) : undefined];
      }));
      const request = operation.requestBody?.content['application/json'].schema;
      operations.push({ path, method, id: operation.operationId, request: request ? ajv.compile(request) : undefined, responses });
    }
  }
  return { original, api, ajv, schemas, operations };
}

export async function checkP1() {
  const { original, schemas, operations } = await loadP1Contracts();
  assert.equal(original.openapi, '3.1.0');
  assert.equal(operations.length, 28);
  assert.equal(new Set(operations.map(value => value.id)).size, operations.length);
  for (const { path, method } of operations) {
    const value = original.paths[path][method];
    assert.ok(!path.includes('/p0/'));
    if (path.startsWith('/api/app/')) assert.ok(value.security.some(item => Object.hasOwn(item, 'StudentSession')));
    if (method !== 'get') {
      assert.ok(value.security.some(item => Object.hasOwn(item, 'CsrfHeader')));
      assert.ok(value.parameters.some(item => item.$ref === '#/components/parameters/Origin'));
    }
  }
  const fixture = JSON.parse(readFileSync(new URL('./examples/p1-intake.json', import.meta.url), 'utf8'));
  assert.equal(schemas.ProfileInput(fixture), true, JSON.stringify(schemas.ProfileInput.errors));
  return { scope: 'p1-static-contract-only', operations: operations.length, schemas: Object.keys(schemas).length, result: 'PASS', liveHttpVerified: false, paidModelCalls: 0 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await checkP1(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
