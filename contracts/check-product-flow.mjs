import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadProductFlowContracts() {
  const original = JSON.parse(readFileSync(new URL('./openapi-product-flow.json', import.meta.url), 'utf8'));
  const api = await SwaggerParser.validate(structuredClone(original), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const schemas = Object.fromEntries(Object.entries(api.components.schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
  const operations = Object.entries(api.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({
    path, method, id: operation.operationId,
    request: ajv.compile(operation.requestBody.content['application/json'].schema),
    responses: Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => [status, ajv.compile(response.content['application/json'].schema)])),
  })));
  return { original, api, schemas, operations };
}
export async function checkProductFlow() {
  const { original, schemas, operations } = await loadProductFlowContracts();
  assert.equal(operations.length, 2);
  assert.equal(new Set(operations.map(value => value.id)).size, 2);
  const controller = readFileSync(new URL('../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/experience/ProductAdoptionController.java', import.meta.url), 'utf8');
  assert.match(controller, /@Profile\("local"\)/);
  const base = controller.match(/@RequestMapping\("([^"]+)"\)/)[1];
  const annotations = [...controller.matchAll(/@PostMapping\("([^"]+)"\)/g)];
  assert.deepEqual(annotations.map(match => base + match[1]).sort(), operations.map(value => value.path).sort());
  for (let index = 0; index < annotations.length; index++) {
    const annotation = annotations[index], path = base + annotation[1];
    const source = controller.slice(annotation.index, annotations[index + 1]?.index || controller.length);
    const permissions = [...source.matchAll(/hasPermi\('([^']+)'\)/g)].map(match => match[1]).sort();
    const operation = original.paths[path].post;
    assert.deepEqual(operation.security, [{ AdminBearer: [] }]);
    assert.deepEqual([...operation['x-required-permissions']].sort(), permissions);
    if (permissions.length > 1) assert.match(source, / and /);
    assert.equal(operation['x-permission-combination'], 'ALL');
    assert.equal(operation['x-spring-profile'], 'local');
    assert.equal(operation['x-feature-flag'], 'MP_LOCAL_PRODUCT_ENABLED');
    assert.ok(!operation.parameters.some(parameter => parameter.name === 'Idempotency-Key'));
  }
  const run = original.components.schemas.Run;
  assert.ok(!run.required.includes('productEligible'));
  assert.deepEqual(run.properties.productEligible.anyOf, [{ type: 'boolean' }, { type: 'null' }]);
  for (const stage of [2, 3, 4, 5, 7]) {
    const contract = JSON.parse(readFileSync(new URL(`./openapi-p${stage}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(contract.components.schemas[stage === 7 ? 'P5Run' : 'Run'].properties.productEligible, run.properties.productEligible);
  }
  return { result: 'PASS', scope: 'post-P7 local product flow static contract; not P8', operations: operations.length, schemas: Object.keys(schemas).length, liveHttpVerified: false, paidCalls: 0 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await checkProductFlow(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
