import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const result = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/run-observation-state.ts', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result });
test('run observations only resume after an actual departure greater than ten minutes', () => {
  const state = result.createRunObservationState();
  assert.deepEqual(JSON.parse(JSON.stringify(state.visible('run:v1','step-1',0))),{viewed:true,resumed:null});
  assert.equal(state.visible('run:v1','step-1',900000).resumed,null);
  state.leave('run:v1',1000000);
  state.leave('run:v1',1200000);
  assert.equal(state.visible('run:v1','step-1',1600000).resumed,null);
  state.leave('run:v1',2000000);
  assert.equal(state.visible('run:v1','step-1',2600001).resumed,'MINUTES_10_60');
  assert.equal(state.visible('run:v1','step-1',2600002).viewed,false);
});
test('identity reset and pinned version isolate seen steps; bucket boundaries remain precise', () => {
  const state=result.createRunObservationState();
  state.visible('run:v1','step-1',0);
  assert.equal(state.visible('run:v2','step-1',1).viewed,true);
  state.clear(); assert.equal(state.visible('run:v1','step-1',2).viewed,true);
  assert.equal(result.inactivityBucket(3600000),'HOURS_1_24');
  assert.equal(result.inactivityBucket(86400000),'DAYS_1_PLUS');
  assert.equal(result.inactivityBucket(-1),null);
  assert.equal(result.inactivityBucket(Infinity),null);
});
