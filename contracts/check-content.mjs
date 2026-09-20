import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
const root=fileURLToPath(new URL('../content/',import.meta.url));
const schema=JSON.parse(readFileSync(new URL('./schemas/task-manifest-v1.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:true,allErrors:true});
const validate=ajv.compile(schema);
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputKeys=new Set(['type','properties','required','additionalProperties','items','enum','const','minimum','maximum','minLength','maxLength','minItems','maxItems','uniqueItems']);
function safePath(path){assert.match(path,/^[a-z0-9][a-z0-9./-]{0,200}$/);assert.ok(!path.includes('..')&&!path.includes('//')&&!path.endsWith('/'));}
function resource(path){safePath(path);const full=resolve(root,path);assert.ok(full.startsWith(root+sep)||full.startsWith(root));let current=root;for(const piece of path.split('/')){current=resolve(current,piece);assert.ok(!lstatSync(current).isSymbolicLink(),'Symlink is not immutable content');}assert.ok(realpathSync(full).startsWith(realpathSync(root)+sep));return readFileSync(full);}
function scan(value){if(typeof value==='string')assert.ok(!/(https?:\/\/|file:|javascript:|<script|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(value),'External references or PII marker');else if(value&&typeof value==='object')Object.values(value).forEach(scan);}
function inputSchema(s,depth=0){assert.ok(depth<=8);for(const key of Object.keys(s))assert.ok(inputKeys.has(key),`Unsupported input schema keyword: ${key}`);assert.ok(['object','array','string','integer','number','boolean'].includes(s.type));if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.ok(Array.isArray(s.required));s.required.forEach(key=>assert.ok(Object.hasOwn(s.properties,key)));Object.values(s.properties).forEach(child=>inputSchema(child,depth+1));}if(s.type==='array')inputSchema(s.items,depth+1);ajv.compile(s);}
export function validateManifest(manifest,{readAssets=true}={}){
 assert.equal(validate(manifest),true,JSON.stringify(validate.errors));scan(manifest);assert.ok(manifest.estimatedMinutes.minimum<=manifest.estimatedMinutes.maximum);
 const assets=new Map();for(const a of manifest.assets){assert.ok(!assets.has(a.assetKey));assets.set(a.assetKey,a);safePath(a.path);if(readAssets){const raw=resource(a.path);assert.equal(raw.length,a.byteLength);assert.equal(hash(raw),a.sha256);assert.ok(!/(https?:\/\/|file:|javascript:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<![0-9])1[3-9][0-9]{9}(?![0-9]))/i.test(raw.toString('utf8')));if(a.mediaType==='application/json')JSON.parse(raw);}}
 const refs=(values,visibility)=>{assert.equal(new Set(values).size,values.length);for(const k of values)assert.equal(assets.get(k)?.visibility,visibility);};
 const steps=new Map();for(const step of manifest.steps){assert.ok(!steps.has(step.stepKey));step.dependencies.forEach(key=>assert.ok(steps.has(key),'Forward/cyclic/missing step'));steps.set(step.stepKey,step);inputSchema(step.inputSchema);refs(step.assetKeys,'PUBLIC');assert.deepEqual(step.hints.map(h=>h.level).sort(),[1,2,3]);for(const key of [...step.hintContextFields,...step.evidenceFields])assert.ok(Object.hasOwn(step.inputSchema.properties,key));}
 const operations=new Set();for(const o of manifest.operations){assert.ok(!operations.has(o.operationKey));operations.add(o.operationKey);assert.equal(steps.get(o.stepKey)?.operationKey,o.operationKey);inputSchema(o.parametersSchema);inputSchema(o.resultSchema);refs(o.publicAssetKeys,'PUBLIC');refs(o.privateAssetKeys,'PRIVATE');assert.ok(assets.has(o.datasetAssetKey));if(manifest.contentKind==='DEMO')assert.equal(o.engineType,'DEMO_SUMMARY');}
 for(const step of steps.values())if(step.operationKey!==null)assert.ok(operations.has(step.operationKey));inputSchema(manifest.reflection.inputSchema);
 if(manifest.contentKind==='MAJOR')for(const check of ['PROFESSIONAL_CORE','BEGINNER_ACCESS','DATA_CORRECTNESS','EVIDENCE_SOURCES','HINT_NO_FINAL_ANSWER','FAIRNESS','CHROME_EDGE','TIMING_45_60','RECOVERY','VERSION_CONSISTENCY'])assert.ok(manifest.review.checkKeys.includes(check));return manifest;
}
export function checkContent(){const catalog=JSON.parse(resource('catalog.json'));assert.equal(catalog.schemaVersion,'content-catalog-v1');assert.deepEqual(Object.keys(catalog).sort(),['manifests','schemaVersion']);const ids=new Set(),lanes=new Set();const bundles=catalog.manifests.map(path=>{const raw=resource(path),m=validateManifest(JSON.parse(raw));assert.ok(!ids.has(m.taskVersionId));ids.add(m.taskVersionId);const lane=`${m.contentKind}:${m.majorCode}:${m.demoKey}:${m.versionCode}`;assert.ok(!lanes.has(lane));lanes.add(lane);return{path,taskVersionId:m.taskVersionId,contentKind:m.contentKind,manifestSha256:hash(raw),dataSha256:hash(m.assets.map(a=>`${a.assetKey}:${a.sha256}`).sort().join('\n'))};});return{result:'PASS',scope:'immutable-content-static-validation',bundles,paidModelCalls:0};}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(checkContent(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
