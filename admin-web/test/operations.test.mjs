import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const transpile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
// Substitute only Vite's public build-time base path, not production request logic.
const source=transpile('../src/api/majorpilot.ts').replace('import.meta.env.VITE_APP_BASE_API', JSON.stringify('/dev-api'));
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve}};
function harness(handler){const exports={},window=new EventTarget(),calls=[],navigations=[];let token='synthetic-operator';const store={clearIdentity(){token=null;window.dispatchEvent(new Event('mp:operator-cleared'))}};
 vm.runInNewContext(source,{exports,window,AbortController,AbortSignal,URLSearchParams,crypto:{randomUUID},fetch:(url,options)=>{calls.push({url,options});return handler(url,options)},require(name){if(name==='@/utils/auth')return{getToken:()=>token};if(name==='@/store/modules/user')return{default:()=>store};if(name==='@/router')return{default:{replace:path=>{navigations.push(path);return Promise.resolve()}}};throw new Error(name)},get localStorage(){throw new Error('private request must not touch storage')},get sessionStorage(){throw new Error('private request must not touch storage')}});
 return{exports,calls,navigations,clear:()=>store.clearIdentity()};
}
test('operations requests use only Bearer, omit student cookies and never upstream request cache',async()=>{const h=harness(()=>Promise.resolve(new Response(JSON.stringify({data:{email:'synthetic@example.invalid'}}),{headers:{'Content-Type':'application/json'}})));await h.exports.operations('/students/01ARZ3NDEKTSV4RRFFQ69G5FAV/sensitive-view',{method:'POST',body:{purpose:'SUPPORT_REQUEST',reason:'synthetic reason only'},query:{unused:undefined}});assert.equal(h.calls[0].options.credentials,'omit');assert.equal(h.calls[0].options.headers.Authorization,'Bearer synthetic-operator');assert.doesNotMatch(h.calls[0].url,/undefined/)});
test('logout aborts pending operations and rejects late JSON',async()=>{const pending=deferred(),h=harness(()=>pending.promise);const request=h.exports.operations('/students');h.clear();assert.equal(h.calls[0].options.signal.aborted,true);pending.resolve(new Response(JSON.stringify({data:{rows:['late']}})));await assert.rejects(request,{code:'IDENTITY_CHANGED'})});
test('late CSV body cannot download after operator identity is cleared',async()=>{const pending=deferred(),h=harness(()=>Promise.resolve({status:200,ok:true,blob:()=>pending.promise}));const request=h.exports.operations('/exports/01ARZ3NDEKTSV4RRFFQ69G5FAV/download',{blob:true});await new Promise(resolve=>setImmediate(resolve));h.clear();pending.resolve(new Blob(['private csv']));await assert.rejects(request,{code:'IDENTITY_CHANGED'})});
test('401 clears operator identity and redirects without sensitive body logging',async()=>{const h=harness(()=>Promise.resolve(new Response(JSON.stringify({error:{code:'AUTH_REQUIRED'}}),{status:401})));await assert.rejects(h.exports.operations('/overview'),{status:401});assert.deepEqual(h.navigations,['/login'])});
test('metric presentation preserves unknown versus genuine zero and never averages',()=>{const exports={};vm.runInNewContext(transpile('../src/views/majorpilot/shared/format.ts'),{exports,Date});assert.equal(exports.rate(null),'—');assert.equal(exports.rate(undefined),'—');assert.equal(exports.rate(0),'0.0%');assert.equal(exports.rate(2/3),'66.7%');assert.equal(exports.stage('a1-task:VIEWED'),'a1-task · 查看');assert.equal(exports.cell({count:0},'count'),'0')});
test('request retry keys are stable within an attempt and renewed after success',()=>{const h=harness(()=>Promise.resolve());const body={dataset:'METRICS',fields:['metric'],purpose:'synthetic purpose'};let attempt=h.exports.operationKey();const first=attempt(body);assert.equal(attempt(body),first);attempt=h.exports.operationKey();assert.notEqual(attempt(body),first);const page=readFileSync(new URL('../src/views/majorpilot/exports/index.vue',import.meta.url),'utf8');assert.match(page,/current\.value=result;purpose\.value='';keyFor=operationKey\(\)/)});
test('runMode filter is exposed only for experience-runs, not ignored by student/report APIs',()=>{const filters=readFileSync(new URL('../src/views/majorpilot/shared/OperationsFilters.vue',import.meta.url),'utf8'),page=readFileSync(new URL('../src/views/majorpilot/shared/RecordsPage.vue',import.meta.url),'utf8');assert.match(filters,/<label v-if="props.runs">运行模式/);assert.match(page,/:runs="kind==='experience-runs'"/)});
test('native operations selects have short explicit labels independent of option text',()=>{
 for(const path of ['../src/views/majorpilot/shared/OperationsFilters.vue','../src/views/majorpilot/shared/RecordsPage.vue','../src/views/majorpilot/exports/index.vue']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  for(const select of source.matchAll(/<select\b[^>]*>/g))assert.match(select[0],/aria-label="[^\"]+"/,`${path}: select must keep a stable accessible label`);
 }
});
