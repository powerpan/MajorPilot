import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateComparison} from '../../shared/classifier/classifier-v1.mjs';
const source=readFileSync(new URL('../dist/classifier-worker.js',import.meta.url),'utf8');
const model=JSON.parse(readFileSync(new URL('../../content/ai-support/1.0.0/classifier-model.json',import.meta.url),'utf8'));
const samples=JSON.parse(readFileSync(new URL('../../content/ai-support/1.0.0/practice-public.json',import.meta.url),'utf8'));
function execute(data){let result;const self={postMessage:value=>{result=value}};new vm.Script(source).runInContext(vm.createContext({self,TextEncoder}));self.onmessage({data});return JSON.parse(JSON.stringify(result));}
const input=()=>({template:'classifier-practice-v1',model,config:model.baselineConfig,samples});
test('P3 bundle is pinned and contains code only, not private or public content assets',()=>{const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));assert.equal(createHash('sha256').update(source).digest('hex'),manifest.classifierWorkerSha256);assert.doesNotMatch(source,/evaluation-private|training-private|sampleId:\s*['"](?:practice|evaluation)-/);assert.doesNotMatch(source,/\beval\s*\(|\bfetch\s*\(|\bimport\s*\(/);});
test('isolated practice worker matches shared reviewed algorithm and changes with configuration',()=>{const first=execute(input());assert.equal(first.status,'SUCCESS');assert.equal(first.engine,'classifier-v1');assert.deepEqual(first.result,evaluateComparison(model,model.baselineConfig,samples));const config={...model.baselineConfig,lowConfidencePolicy:'AUTO_ROUTE'};const next=execute({...input(),config});assert.equal(next.status,'SUCCESS');assert.deepEqual(next.result,evaluateComparison(model,config,samples));assert.notDeepEqual(first.result,next.result);});
test('practice worker rejects hidden samples, arbitrary source, oversized payload and unreviewed config',()=>{assert.equal(execute({...input(),samples:samples.map(value=>({...value,sampleId:value.sampleId.replace('practice','evaluation')}))}).status,'ERROR');assert.equal(execute({...input(),code:'fetch(1)'}).code,'INPUT_LIMIT_OR_SCHEMA');assert.equal(execute({...input(),config:{...model.baselineConfig,confidenceThreshold:0.9}}).code,'CLASSIFIER_CONFIG_INVALID');assert.equal(execute({...input(),samples:[...samples,...samples]}).code,'CLASSIFIER_SAMPLES_INVALID');assert.equal(execute({...input(),config:{...model.baselineConfig,extra:'x'.repeat(1048576)}}).code,'INPUT_LIMIT_OR_SCHEMA');});
