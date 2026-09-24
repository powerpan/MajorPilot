import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import '../sync-method-report.mjs';
import '../sync-method-flow.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../openapi-method-flow.json',import.meta.url),'utf8'));
const api=await SwaggerParser.validate(structuredClone(raw),{resolve:{external:false}});const ajv=new Ajv({strict:true,allErrors:true});formats(ajv);const schemas=Object.fromEntries(Object.entries(api.components.schemas).map(([k,v])=>[k,ajv.compile(v)]));
test('five method routes match controllers, authenticated writes require CSRF and idempotency',()=>{
 const implemented=[];for(const file of ['GuidedLearningController','MethodEditionController']){const text=fs.readFileSync(new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/experience/'+file+'.java',import.meta.url),'utf8');const prefix=text.match(/@RequestMapping\("([^"]+)"\)/)[1];for(const m of text.matchAll(/@(Get|Post)Mapping(?:\("([^"]+)"\))?/g))implemented.push(m[1].toLowerCase()+' '+prefix+(m[2]||''));}
 const declared=Object.entries(raw.paths).flatMap(([p,methods])=>Object.keys(methods).map(m=>m+' '+p));assert.deepEqual(declared.sort(),implemented.sort());
 for(const methods of Object.values(raw.paths))if(methods.post){assert.ok(methods.post.security[0].CsrfHeader);assert.ok(methods.post.parameters.some(p=>p.$ref?.endsWith('/IdempotencyKey')));}
});
test('method requests cannot submit answers, clocks, score or ownership as learning evidence',()=>{const base={expectedSequence:0,stepKey:'b1-context',kind:'SUPPORT_PROVIDED',checkpointId:'BA-C1',supportId:'ba-c1-basic'};assert.ok(schemas.LearningChange(base));for(const extra of [{answer:'invented'},{acceptedAt:'2026-01-01'},{studentId:'fake'},{score:100},{expectedSequence:'0'}])assert.equal(schemas.LearningChange({...base,...extra}),false);assert.ok(schemas.LocalCheck({stepKey:'b2-metric',expectedStepRevision:1,assistance:false}));assert.equal(schemas.LocalCheck({stepKey:'b2-metric',expectedStepRevision:1,assistance:false,values:{}}),false);});
test('method report retains strict source-independent public schema',()=>{const schema=JSON.parse(fs.readFileSync(new URL('../schemas/method-report-v1.json',import.meta.url),'utf8'));assert.doesNotThrow(()=>ajv.compile(schema));assert.equal(schema.properties.generationMode.const,'AI');assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.methodAnalysis.additionalProperties,false);});
