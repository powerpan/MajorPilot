import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/lib/local-result-state.ts',import.meta.url),'utf8');
const {currentLocalResult}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const local={workbookVersion:'1.0.0',method:'SUPPORTED',reason:'按组相除',specification:{range:[1,6]},values:{count:'10'}};
const record={stepKey:'step',revision:3,assistance:false,result:{status:'MATCHED',original:local}};
test('editing a local number, reason, range, method or workbook invalidates the old displayed check',()=>{
  assert.equal(currentLocalResult([record],'step',structuredClone(local)),record);
  for(const patch of [{values:{count:'11'}},{reason:'另一个理由'},{specification:{range:[6,1]}},{method:'OTHER'},{workbookVersion:'2.0.0'}])assert.equal(currentLocalResult([record],'step',{...local,...patch}),undefined);
});
test('checks bind the step and original submission, not assistance or a later unrelated step revision',()=>{
  assert.equal(currentLocalResult([{...record,stepKey:'other'}, {...record,assistance:true}, {...record,result:{status:'MATCHED'}}],'step',local),undefined);
  assert.equal(currentLocalResult([record],'step',{values:local.values,specification:local.specification,reason:local.reason,method:local.method,workbookVersion:local.workbookVersion}),record);
  assert.equal(currentLocalResult([record],'step',undefined),undefined);
});
test('restoring earlier exact local input can use its last matching check without changing any saved record',()=>{
  const changed={...record,revision:4,result:{status:'MISMATCHED',original:{...local,values:{count:'11'}}}};
  const rows=[record,changed],before=JSON.stringify(rows);
  assert.equal(currentLocalResult(rows,'step',local),record);assert.equal(currentLocalResult(rows,'step',changed.result.original),changed);assert.equal(JSON.stringify(rows),before);
});
