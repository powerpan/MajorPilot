import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/lib/report-display.ts',import.meta.url),'utf8');
const {generationExplanation,reportSelectionLabel}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('report preparation explains actual phases without claiming publication or an exact deadline',()=>{
  assert.match(generationExplanation('INITIAL_REQUESTED'),/答案、修改/);
  assert.match(generationExplanation('REVIEW_REQUESTED'),/复核/);
  assert.match(generationExplanation('REPAIR_REQUESTED'),/通过后才会展示/);
  assert.match(generationExplanation(undefined),/无需停留/);
  for(const phase of ['INITIAL_REQUESTED','REPAIR_REQUESTED','REVIEW_REQUESTED',undefined])assert.doesNotMatch(generationExplanation(phase),/已发布|保证|[0-9]+秒/);
});
test('report selections use the exact public option labels of each method guide',()=>{
  for(const [major,folder]of [['AI','ai-support'],['DATA_SCIENCE','ds-learning'],['BUSINESS_ANALYTICS','ba-learning']]){
    const guide=JSON.parse(readFileSync(new URL(`../../content/${folder}/2.0.0/method-guide.json`,import.meta.url),'utf8'));
    for(const step of guide.steps)for(const field of step.fields.filter(f=>f.options))for(const [value,label]of Object.entries(field.options))for(const prefix of [step.title,'初次提交','修订提交','新情境提交']){
      assert.equal(reportSelectionLabel(major,{label:`${prefix} · ${field.label}`,quote:value}),label);
    }
  }
});
test('selection display does not rewrite open-text, unknown labels or partial excerpts',()=>{
  for(const quote of [{label:'初次提交 · 你怀疑的原因',quote:'INFORMATION'},{label:'初次提交 · 这一步你选择',quote:'我选择 INFORMATION，因为还缺信息。'},{label:'未知 · 这一步你选择',quote:'INFORMATION'},{label:'初次提交 · 这一步你选择 · 额外标签',quote:'INFORMATION'}])assert.equal(reportSelectionLabel('BUSINESS_ANALYTICS',quote),null);
  assert.equal(reportSelectionLabel('AI',{label:'初次提交 · 这一步你选择',quote:'INFORMATION'}),null);
  for(const value of ['UNKNOWN','__proto__','toString'])assert.equal(reportSelectionLabel('BUSINESS_ANALYTICS',{label:'初次提交 · 这一步你选择',quote:value}),null);
});
