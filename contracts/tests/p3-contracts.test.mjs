import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkP3, loadP3Contracts } from '../check-p3.mjs';
const { original, schemas, operations } = await loadP3Contracts();
const id = '01JDEM00000000000000000001';

test('P3 contract compiles strictly with authenticated preview boundaries', async () => assert.equal((await checkP3()).result, 'PASS'));
test('full P3 route inventory includes every existing and new task controller method', () => {
  const root = new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/', import.meta.url);
  const implemented = [];
  for (const file of ['content/TaskContentController.java', 'experience/RunController.java', 'experience/RunAdminController.java']) {
    const source = readFileSync(new URL(file, root), 'utf8');
    const prefix = source.match(/@RequestMapping\("([^"]+)"\)/u)?.[1] ?? '';
    for (const m of source.matchAll(/@(Get|Post|Delete|Put|Patch)Mapping(?:\("([^"]+)"\))?/gu)) {
      const path = prefix + (m[2] ?? '');
      if (path.includes('{operation:start|pause|resume}')) for (const operation of ['start', 'pause', 'resume']) implemented.push(`${m[1].toLowerCase()} ${path.replace('{operation:start|pause|resume}', operation)}`);
      else implemented.push(`${m[1].toLowerCase()} ${path}`);
    }
  }
  assert.deepEqual(operations.map(o => `${o.method} ${o.path}`).sort(), implemented.sort());
});
test('P2 and P3 common schemas cannot drift across old and new clients', () => {
  const p2 = JSON.parse(readFileSync(new URL('../openapi-p2.json', import.meta.url), 'utf8'));
  for (const [name, schema] of Object.entries(p2.components.schemas)) assert.deepEqual(original.components.schemas[name], schema, name);
});
test('preview requests cannot claim publication, student ownership or a formal recommendation', () => {
  assert.ok(schemas.CreatePreview({ taskVersionId: id }), JSON.stringify(schemas.CreatePreview.errors));
  for (const extra of [{ studentId: id }, { runMode: 'STANDARD' }, { reviewStatus: 'PUBLISHED' }, { decisionId: id }]) assert.equal(schemas.CreatePreview({ taskVersionId: id, ...extra }), false);
  const task = { taskVersionId: id, majorCode: 'AI', title: '支持请求分类', versionCode: '1.0.0', runMode: 'REVIEW_PREVIEW', reviewStatus: 'REVIEW', warning: '工程预览；尚待专业审核与真实用户计时' };
  assert.ok(schemas.PreviewTask(task), JSON.stringify(schemas.PreviewTask.errors));
  assert.equal(schemas.PreviewTask({ ...task, reviewStatus: 'PUBLISHED' }), false);
  assert.equal(schemas.PreviewTask({ ...task, privateEvaluationUrl: '/answers' }), false);
});
test('source revision vectors and bindings preserve exact noncoerced provenance', () => {
  assert.ok(schemas.SourceRevisions({ 'a4-configure': 2 }));
  assert.equal(schemas.SourceRevisions({ 'a4-configure': '2' }), false);
  assert.equal(schemas.SourceRevisions({ 'a4-configure': 0 }), false);
  assert.equal(schemas.SourceRevisions({ '../private': 2 }), false);
  const binding = { parameterKey: 'confidenceThreshold', sourceStepKey: 'a4-configure', sourceField: 'confidenceThreshold', sourceRevision: 2, value: 0.55 };
  assert.ok(schemas.InputBinding(binding));
  assert.equal(schemas.InputBinding({ ...binding, studentId: id }), false);
});
test('public JSON assets support model objects and message arrays, not scalar text', () => {
  const validate = operations.find(operation => operation.id === 'getPublicTaskAsset').responses['200'];
  assert.ok(validate({ schemaVersion: 'classifier-model-v1' }));
  assert.ok(validate([{ sampleId: 'evaluation-01', messageText: '合成消息' }]));
  assert.equal(validate('unstructured text'), false);
});
