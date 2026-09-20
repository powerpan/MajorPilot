import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkP4, loadP4Contracts } from '../check-p4.mjs';
const { original, schemas, operations } = await loadP4Contracts();

test('P4 compiles strictly and reuses the complete P3 endpoint inventory', async () => {
  assert.equal((await checkP4()).result, 'PASS');
  const p3 = JSON.parse(readFileSync(new URL('../openapi-p3.json', import.meta.url), 'utf8'));
  assert.deepEqual(original.paths, p3.paths);
  for (const [name, schema] of Object.entries(p3.components.schemas)) assert.deepEqual(original.components.schemas[name], schema, name);
  assert.equal(operations.length, 27);
});
test('v3 execution requires exact typed ancestor expectation while legacy requests stay compatible', () => {
  const request = { operationKey: 'ds-quality-clean', inputRevision: 1, parameters: {}, expectedSourceRevisions: {} };
  assert.ok(schemas.ExecuteDS(request));
  const { expectedSourceRevisions, ...missing } = request;
  assert.equal(schemas.ExecuteDS(missing), false);
  assert.ok(schemas.Execute(missing), 'Legacy wire compatibility; v3 task policy is enforced at runtime');
  assert.ok(schemas.ExecuteDS({ ...request, operationKey: 'ds-profile', expectedSourceRevisions: { 'd2-quality': 1 } }));
  for (const invalid of [null, [], { 'd2-quality': 0 }, { 'd2-quality': '1' }, { '../d2-quality': 1 }]) {
    assert.equal(schemas.ExecuteDS({ ...request, expectedSourceRevisions: invalid }), false);
  }
  assert.equal(schemas.ExecuteDS({ ...request, parameters: { duplicatePolicy: 'KEEP' } }), false, 'Server owns saved bindings');
  assert.equal(schemas.ExecuteDS({ ...request, operationKey: 'arbitrary-python' }), false);
});
test('DS manifest projection admits own bindings but not private server input identifiers', () => {
  const schema = original.components.schemas.PublicManifest.properties.operations.items;
  // Compile through the dereferenced schema so references remain local.
  const resolved = schemas.PublicManifest.schema.properties.operations.items;
  const manifestValidator = schemas.PublicManifest;
  assert.ok(schema.properties.ownResponseBindings);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.ownResponseBindings.items.required, ['parameterKey', 'sourceField']);
  assert.equal(schema.properties.ownResponseBindings.items.additionalProperties, false);
  assert.equal(schema.properties.datasetAssetKey, undefined);
  assert.equal(schema.properties.modelAssetKey, undefined);
  assert.ok(manifestValidator && resolved);
});
