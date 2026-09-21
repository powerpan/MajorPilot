import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadP6Contracts(){
  const original=JSON.parse(readFileSync(new URL('./openapi-p6.json',import.meta.url),'utf8'));
  const api=await SwaggerParser.validate(structuredClone(original),{resolve:{external:false}});
  const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
  const schemas=Object.fromEntries(Object.entries(api.components.schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
  const operations=[];
  for(const [path,methods]of Object.entries(api.paths))for(const [method,operation]of Object.entries(methods)){
    const request=operation.requestBody?.content['application/json']?.schema;
    const responses=Object.fromEntries(Object.entries(operation.responses).map(([status,response])=>[status,response.content?.['application/json']?.schema?ajv.compile(response.content['application/json'].schema):undefined]));
    operations.push({path,method,id:operation.operationId,request:request?ajv.compile(request):undefined,responses});
  }
  return{original,api,ajv,schemas,operations};
}
export async function checkP6(){
  const{original,schemas,operations}=await loadP6Contracts();
  assert.equal(operations.length,15);assert.equal(new Set(operations.map(operation=>operation.id)).size,15);
  for(const{path,method}of operations){
    const operation=original.paths[path][method];
    assert.equal(operation.security.length,1);
    if(path.startsWith('/api/app/')){assert.ok(Object.hasOwn(operation.security[0],'StudentSession'));if(method==='post')assert.ok(Object.hasOwn(operation.security[0],'CsrfHeader'));}
    else {assert.ok(Object.hasOwn(operation.security[0],'AdminBearer'));assert.ok(operation['x-required-permissions'].length);}
    if(method==='post')assert.equal(operation.parameters.some(parameter=>parameter.$ref==='#/components/parameters/IdempotencyKey'),path!=='/api/app/v1/events');
  }
  return{result:'PASS',scope:'P6 static contract only',operations:operations.length,schemas:Object.keys(schemas).length,liveHttpVerified:false,paidCalls:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(await checkP6(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
