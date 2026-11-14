import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadProfileContracts() {
  const original = JSON.parse(readFileSync(new URL('./openapi-profile-flow.json', import.meta.url), 'utf8'));
  const api = await SwaggerParser.validate(structuredClone(original), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const schemas = Object.fromEntries(Object.entries(api.components.schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
  return { original, api, schemas };
}
export async function checkProfileContracts() {
  const { original, schemas } = await loadProfileContracts();
  assert.equal(Object.keys(original.paths).length, 4);
  for (const [path, methods] of Object.entries(original.paths)) for (const [method, operation] of Object.entries(methods)) {
    assert.ok(operation.security.some(security => Object.hasOwn(security, 'StudentSession')));
    if (method !== 'get') {
      assert.ok(operation.security.some(security => Object.hasOwn(security, 'CsrfHeader')));
      assert.ok(operation.parameters.some(parameter => parameter.$ref === '#/components/parameters/Origin'));
    }
    if (path.endsWith('/submit')) assert.ok(operation.parameters.some(parameter => parameter.$ref === '#/components/parameters/IdempotencyKey'));
  }
  return { result: 'PASS', scope: 'profile-static-contract-only', operations: 4, schemas: Object.keys(schemas).length, liveHttpVerified: false, paidModelCalls: 0 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await checkProfileContracts(), null, 2));
