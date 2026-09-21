import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/workspace-attention.ts', import.meta.url), 'utf8');
const attention = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: attention });
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const schema = { properties: { text: { type: 'string', minLength: 5, maxLength: 10 } }, required: ['text'] };

test('required missing input and too-short Unicode text identify the precise field without mutating answers', () => {
  const value = { text: '你好🙂' };
  assert.equal(attention.answerIssue(schema, {}).field, 'text');
  assert.match(attention.answerIssue(schema, value).message, /目前 3 字/);
  assert.deepEqual(value, { text: '你好🙂' });
  assert.equal(attention.answerIssue(schema, { text: '你好世界🙂' }), null);
});
test('a partial run permits absent commentary but still guides a present invalid local draft', () => {
  assert.equal(attention.answerIssue(schema, {}, false), null);
  assert.equal(attention.answerIssue(schema, { text: '短' }, false).field, 'text');
});
test('checkbox acknowledgement false, numeric bounds, enum and array constraints are actionable', () => {
  for (const [definition, value] of [
    [{ type: 'boolean', const: true }, false],
    [{ type: 'integer', minimum: 1, maximum: 12 }, 1.2],
    [{ type: 'integer', minimum: 1, maximum: 12 }, 13],
    [{ type: 'number', exclusiveMinimum: 0 }, 0],
    [{ type: 'number' }, Infinity],
    [{ type: 'string', enum: ['YES', 'NO'] }, 'OLD'],
    [{ type: 'array', minItems: 2, items: { type: 'string' } }, ['one']],
    [{ type: 'array', uniqueItems: true, items: { type: 'string' } }, ['one', 'one']],
  ]) assert.equal(attention.answerIssue({ properties: { field: definition } }, { field: value }).field, 'field');
});

for (const [major, fixtureName] of [['ai-support', 'p3-ai-run'], ['ds-learning', 'p4-ds-run'], ['ba-learning', 'p5-ba-run']]) {
  const manifest = json(`../../content/${major}/1.0.0/manifest.json`);
  const fixture = json(`../../contracts/examples/${fixtureName}.json`);
  test(`${major} current valid contract examples all pass client guidance without substituting answers`, () => {
    for (const step of manifest.steps) assert.equal(attention.answerIssue(step.inputSchema, fixture.responses[step.stepKey]), null, step.stepKey);
    assert.equal(attention.answerIssue(manifest.reflection.inputSchema, fixture.reflection.answers), null);
  });
  test(`${major} each missing required top-level field produces a guidance target`, () => {
    for (const step of manifest.steps) for (const key of step.inputSchema.required) {
      const answer = structuredClone(fixture.responses[step.stepKey]);
      delete answer[key];
      assert.ok(attention.answerIssue(step.inputSchema, answer)?.field.startsWith(key), `${step.stepKey}:${key}`);
    }
  });
}

test('nested AI patterns and DS findings point to the precise editor, including initially absent rows', () => {
  const field = { type: 'array', minItems: 2, items: { type: 'object', properties: { statement: { type: 'string', minLength: 5 }, verdict: { type: 'string' } }, required: ['statement', 'verdict'] } };
  const nested = { properties: { findings: field }, required: ['findings'] };
  assert.equal(attention.answerIssue(nested, {}).field, 'findings.0.statement');
  assert.equal(attention.answerIssue(nested, { findings: [{ statement: '第一条发现', verdict: 'YES' }, { statement: '短' }] }).field, 'findings.1.statement');
  assert.deepEqual(plain(attention.fieldNames('findings.1.statement')), ['finding-1-statement']);
  assert.deepEqual(plain(attention.fieldNames('errorPatterns.1.explanation')), ['explanation-1']);
  assert.deepEqual(plain(attention.fieldNames('errorPatterns.0.sampleIds.0')), ['pattern-sample-0']);
  assert.deepEqual(plain(attention.fieldNames('definitionVariantIds.technical_issue')), ['definition-technical_issue']);
});
test('DS conditional and BA period relationships identify the precise parameter', () => {
  assert.equal(attention.taskIssue('d4-relationship', { relationshipMode: 'SCATTER' }).field, 'xField');
  assert.equal(attention.taskIssue('d4-relationship', { relationshipMode: 'SCATTER', xField: 'a' }).field, 'yField');
  assert.equal(attention.taskIssue('d4-relationship', { relationshipMode: 'SCATTER', xField: 'a', yField: 'a' }).field, 'yField');
  assert.equal(attention.taskIssue('d4-relationship', { relationshipMode: 'GROUP_COMPLETION' }).field, 'groupBy');
  assert.equal(attention.taskIssue('d5-stratify', { stratifyBy: 'cohort' }, { relationshipMode: 'GROUP_COMPLETION', groupBy: 'cohort' }).field, 'stratifyBy');
  assert.equal(attention.taskIssue('b2-metric', { baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 6, comparisonEndWeek: 12 }).field, 'comparisonStartWeek');
  assert.equal(attention.taskIssue('b2-metric', { baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 7, comparisonEndWeek: 11 }).field, 'comparisonEndWeek');
  assert.equal(attention.taskIssue('reflection', { difficultySources: ['NONE', 'TOOLS'] }).field, 'difficultySources');
});
test('view binds complete/execution guidance, identity fencing and native validity without weakening server validation', () => {
  const view = readFileSync(new URL('../src/views/WorkspaceView.vue', import.meta.url), 'utf8');
  assert.match(view, /onIdentityChange\(clearAttention\)/);
  assert.match(view, /issuedAt === attentionGeneration/);
  assert.match(view, /@click="completeWithGuidance"/);
  assert.match(view, /@invalid.capture="nativeInvalid"/);
  assert.match(view, /await workspace.complete\(\)/);
  assert.match(view, /!isProductRun\(workspace.run\)/);
  assert.match(view, /!isProductRun\(run\)/);
  assert.match(view, /ticket.current\(\).*issuedAt !== reportGeneration/);
  assert.match(view, /查看体验报告/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /control.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /notice.textContent = message/);
  assert.match(source, /previousDescription/);
  assert.match(source, /region\.scrollHeight > region\.clientHeight/);
  assert.match(source, /region\.prepend\(notice\)/);
  assert.match(source, /region\.scrollTo\(\{ top: 0, behavior: reducedMotion/);
  assert.match(source, /notice\.style\.gridColumn = "1 \/ -1"/);
});
