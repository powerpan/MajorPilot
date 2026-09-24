import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const spec = JSON.parse(read('../openapi-workbooks.json'));
const catalog = JSON.parse(read('../../content/workbooks/catalog.json'));
const validate = new Ajv({ strict: true, allErrors: true }).compile(spec.components.schemas.WorkbookMetadata);
test('workbook metadata is strictly typed and contains no private paths', () => {
  for (const { path, manifestSha256, sources, ...metadata } of catalog.workbooks) {
    assert(validate(metadata), JSON.stringify(validate.errors));
    assert(!validate({ ...metadata, path }));
    assert(!validate({ ...metadata, byteLength: 5242881 }));
    assert(!validate({ ...metadata, filename: '../secret.xlsx' }));
    assert(!validate({ ...metadata, assetKey: 'golden-private' }));
  }
});
test('only authenticated read-only workbook routes and binary success are declared', () => {
  assert.equal(Object.keys(spec.paths).length, 2);
  for (const methods of Object.values(spec.paths)) {
    assert.deepEqual(Object.keys(methods), ['get']);
    assert.deepEqual(methods.get.security, [{ StudentCookie: [] }]);
    for (const status of [401, 403, 404, 503]) assert(methods.get.responses[status].content['application/json']);
    assert.equal(methods.get.responses[200].headers['Cache-Control'].schema.const, 'no-store');
  }
  const source = read('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/experience/WorkbookController.java');
  assert(source.includes('/api/app/v1/experience-runs/{id}/workbooks'));
  assert(source.includes('runs.store().owned(student, id)'));
  assert(source.includes('runs.store().activeStudent(student)'));
});
test('workspace replaces raw full tables with the run-bound workbook component', () => {
  const ds = read('../../student-web/src/components/workspace/DsDataReferences.vue');
  const ba = read('../../student-web/src/components/workspace/BaWorkspace.vue');
  assert(!ds.includes('ds-raw-table')); assert(!ba.includes('ba-raw-table'));
  const view = read('../../student-web/src/views/WorkspaceView.vue');
  assert(view.includes('<WorkbookDownload'));
  assert(view.includes(':task-version-id="workspace.run.taskVersionId"'));
});
