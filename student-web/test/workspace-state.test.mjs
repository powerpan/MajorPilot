import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

// Current store code with transport/DOM/storage boundaries substituted. Browser
// tests separately exercise real IndexedDB and the isolated Worker.
const source=ts.transpileModule(readFileSync(new URL('../src/stores/workspace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return{promise,resolve}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const clone=value=>structuredClone(value);
class ApiError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
const run={runId:'owned-run',status:'IN_PROGRESS',revision:1,readOnly:false,taskVersionId:'reviewed-v1',currentStepKey:'prepare',steps:[{stepKey:'prepare',status:'IN_PROGRESS',revision:1},{stepKey:'observe',status:'NOT_STARTED',revision:0}]};
const definition={stepKey:'prepare',title:'准备',dependencies:[],inputSchema:{properties:{acknowledged:{type:'boolean'}}},assetKeys:[],operationKey:null,responseSchemaVersion:'v1'};
const step={...definition,status:'IN_PROGRESS',revision:1,response:{acknowledged:true},definition,readOnly:false,executions:[]};
function harness(){
  let epoch=0;const listeners=[],calls=[],drafts=[];let handler=async(path,options)=>path.endsWith('/task')?{steps:[definition],assets:[],versionCode:'1'}:path.includes('/steps/')?clone(step):clone(run);
  const auth={me:{studentId:'owner'},async refresh(){},expire(){identity()}};
  function identity(){epoch++;auth.me=null;listeners.forEach(listener=>listener())}
  const context=vm.createContext({AbortController,AbortSignal,setTimeout,clearTimeout,navigator:{onLine:true}});
  const require=path=>path==='vue'?{ref:value=>({value}),computed:getter=>({get value(){return getter()}})}:path==='pinia'?{defineStore:(_,setup)=>setup}:path==='./auth'?{useAuth:()=>auth,onIdentityChange:listener=>listeners.push(listener),identityRequest:()=>{const issued=epoch;return{signal:new AbortController().signal,assertCurrent(){if(issued!==epoch)throw new ApiError(409,'IDENTITY_CHANGED')},finish(){}}}}:path==='../lib/api'?{ApiError,errorText:error=>error.message,api:(path,options)=>{calls.push({path,options});return handler(path,options)},stableOperation:()=>{let prev,key;return body=>{const next=JSON.stringify(body);if(next!==prev){prev=next;key=randomUUID()}return key}}}:path==='../lib/task-drafts'?{async readTaskDraft(){return undefined},async writeTaskDraft(key,revision,answer){drafts.push({key,revision,answer:clone(answer)})},async removeTaskDraft(){drafts.length=0}}:path==='../execution'?{execute:async()=>({status:'SUCCESS',result:{count:4,sum:52,mean:13}})}:(()=>{throw new Error(`Unexpected import ${path}`)})();
  const module={exports:{}};vm.runInContext(`(function(require,module,exports){${source}\n})`,context)(require,module,module.exports);
  return{store:module.exports.useWorkspace(),identity,auth,calls,drafts,setApi(next){handler=next}};
}
test('late Run load cannot repopulate a cleared identity',async()=>{
  const h=harness(),reply=deferred();h.setApi(()=>reply.promise);
  const pending=h.store.load('owned-run');await settle();h.identity();reply.resolve(clone(run));await pending;
  assert.equal(h.store.run.value,null);assert.equal(h.store.step.value,null);h.store.clear();
});
test('late autosave cannot resurrect cleared input or state',async()=>{
  const h=harness();await h.store.load('owned-run');const reply=deferred();h.setApi(()=>reply.promise);
  h.store.edit({acknowledged:false});const pending=h.store.flush();await settle();h.identity();reply.resolve({revision:2,runRevision:2,invalidatedStepKeys:[]});
  assert.equal(await pending,false);assert.equal(h.store.run.value,null);assert.deepEqual(JSON.parse(JSON.stringify(h.store.answer.value)),{});h.store.clear();
});
test('edits during autosave get the returned revision before a second serialized save',async()=>{
  const h=harness();await h.store.load('owned-run');const reply=deferred();let writes=0;
  h.setApi(async(path,options)=>{if(options.method==='PUT'){writes++;if(writes===1)return reply.promise;return{revision:3,runRevision:3,invalidatedStepKeys:[]}}return clone(run)});
  h.store.edit({acknowledged:false});const pending=h.store.flush();await settle();h.store.edit({acknowledged:true});reply.resolve({revision:2,runRevision:2,invalidatedStepKeys:[]});
  assert.equal(await pending,true);assert.equal(writes,2);const requests=h.calls.filter(call=>call.options.method==='PUT');assert.equal(requests[1].options.body.expectedRevision,2);assert.equal(h.store.dirty.value,false);h.store.clear();
});
test('conflicting autosave keeps the draft and requires explicit adoption',async()=>{
  const h=harness();await h.store.load('owned-run');h.setApi(async()=>{throw new ApiError(409,'STEP_REVISION_CONFLICT')});
  h.store.edit({acknowledged:false});assert.equal(await h.store.flush(),false);assert.equal(h.store.conflict.value,true);assert.equal(h.store.answer.value.acknowledged,false);assert.ok(h.drafts.length);h.store.clear();
});
test('other-tab pause stops writes without silently resuming or deleting local differences',async()=>{
  const h=harness();await h.store.load('owned-run');h.store.edit({acknowledged:false});
  h.setApi(async()=>({...clone(run),status:'PAUSED',readOnly:true,revision:2}));await h.store.checkState();
  assert.equal(h.store.readOnly.value,true);assert.equal(await h.store.flush(),false);assert.equal(h.store.answer.value.acknowledged,false);assert.equal(h.calls.filter(call=>call.options.method==='PUT').length,0);h.store.clear();
});
test('out-of-order step loads cannot attach another step answer to the selected editor',async()=>{
  const h=harness();await h.store.load('owned-run');const first=deferred(),second=deferred();
  h.setApi(path=>path.endsWith('/prepare')?first.promise:second.promise);
  const a=h.store.select('prepare'),b=h.store.select('observe');
  second.resolve({...clone(step),stepKey:'observe',definition:{...definition,stepKey:'observe'},response:{observation:'current-step-answer'}});await b;
  first.resolve(clone(step));await assert.rejects(a,error=>error.code==='IDENTITY_CHANGED');
  assert.equal(h.store.selectedStep.value,'observe');assert.equal(h.store.answer.value.observation,'current-step-answer');h.store.clear();
});
test('a second flush waits for all edits queued during the first save',async()=>{
  const h=harness();await h.store.load('owned-run');const first=deferred(),second=deferred();let writes=0;
  h.setApi(async()=>++writes===1?first.promise:second.promise);
  h.store.edit({acknowledged:false});const initial=h.store.flush();await settle();h.store.edit({acknowledged:true});
  let drained=false;const waiter=h.store.flush().then(value=>{drained=true;return value});
  first.resolve({revision:2,runRevision:2,invalidatedStepKeys:[]});await settle();assert.equal(drained,false,'dependent action must not proceed after only the older save');
  second.resolve({revision:3,runRevision:3,invalidatedStepKeys:[]});assert.equal(await waiter,true);await initial;assert.equal(writes,2);h.store.clear();
});
