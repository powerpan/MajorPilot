import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export async function loadP7Contracts(){
  const original=JSON.parse(readFileSync(new URL('./openapi-p7.json',import.meta.url),'utf8'));
  const api=await SwaggerParser.validate(structuredClone(original),{resolve:{external:false}});
  const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
  const schemas=Object.fromEntries(Object.entries(api.components.schemas).map(([name,schema])=>[name,ajv.compile(schema)]));
  const operations=[];
  for(const[path,methods]of Object.entries(api.paths))for(const[method,operation]of Object.entries(methods)){
    const request=operation.requestBody?.content['application/json']?.schema;
    const responses=Object.fromEntries(Object.entries(operation.responses).map(([status,response])=>[status,response.content?.['application/json']?.schema?ajv.compile(response.content['application/json'].schema):undefined]));
    const responseMedia=Object.fromEntries(Object.entries(operation.responses).map(([status,response])=>[status,Object.keys(response.content??{})]));
    operations.push({path,method,id:operation.operationId,request:request?ajv.compile(request):undefined,responses,responseMedia});
  }
  return{original,api,ajv,schemas,operations};
}
export function controllerInventory(){
  const result=[];
  for(const file of ['auth/AccountSettingsController.java','privacy/PrivacyController.java','operations/OperationsController.java','operations/AdminExportController.java','report/ReportAdminController.java','content/TaskContentController.java','experience/RunAdminController.java','analytics/PageEventController.java']){
    const raw=readFileSync(new URL('../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/'+file,import.meta.url),'utf8');
    const source=raw.replaceAll('RECEIPT_PATH+"/{id}"','"/api/public/v1/deletion-receipts/{id}"');
    const base=source.match(/@RequestMapping\("([^"]*)"\)/)?.[1]??'';
    const classPart=source.slice(0,source.indexOf('public class'));
    const classPermissions=[...classPart.matchAll(/hasPermi\('([^']+)'\)/g)].map(match=>match[1]);
    const matches=[...source.matchAll(/@(Get|Post|Patch)Mapping(?:\("([^"]*)"\))?/g)];
    for(let index=0;index<matches.length;index++){
      const match=matches[index],path=base+(match[2]??'');
      if(path==='/api/public/v1/events')continue; // unchanged anonymous P1 contract
      const part=source.slice(match.index,matches[index+1]?.index??source.length);
      const permissions=[...new Set(classPermissions.concat([...part.matchAll(/hasPermi\('([^']+)'\)/g)].map(value=>value[1])))].sort();
      result.push({path,method:match[1].toLowerCase(),permissions});
    }
  }
  return result;
}
export async function checkP7(){
  const{original,schemas,operations}=await loadP7Contracts();
  assert.equal(operations.length,37);assert.equal(new Set(operations.map(o=>o.id)).size,37);
  const idempotent=new Set(['createPersonalExport','createAccountDeletion','confirmAccountDeletion','setAnalyticsExclusion','createAdminExport','createRecoveryRun','regenerateReport']);
  for(const{path,method,id}of operations){
    const operation=original.paths[path][method];assert.equal(operation.security.length,1);
    const security=operation.security[0];
    if(path.startsWith('/api/admin/')){assert.deepEqual(security,{AdminBearer:[]});assert.ok(operation['x-required-permissions']?.length);}
    else if(path.startsWith('/api/public/')){assert.deepEqual(security,{DeletionReceipt:[]});assert.equal(method,'get');}
    else{
      const csrf=method!=='get'||operation['x-private-download']===true;
      assert.deepEqual(security,{StudentSession:[],...(csrf?{CsrfHeader:[]}:{})});
      const origin=operation.parameters.find(p=>p.$ref==='#/components/parameters/Origin'||p.name==='Origin');
      assert.equal(Boolean(origin),csrf);
      if(origin){
        const definition=origin.$ref?original.components.parameters.Origin:origin;
        assert.equal(definition.required,operation['x-private-download']!==true);
      }
    }
    assert.equal(operation.parameters.some(p=>p.$ref==='#/components/parameters/IdempotencyKey'),idempotent.has(id),id+' idempotency');
  }
  const declared=operations.map(o=>o.method+' '+o.path).sort(),implemented=controllerInventory();
  assert.deepEqual(implemented.map(o=>o.method+' '+o.path).sort(),declared,'P7 Spring endpoint inventory drift');
  for(const item of implemented)if(item.path.startsWith('/api/admin/'))assert.deepEqual([...original.paths[item.path][item.method]['x-required-permissions']].sort(),item.permissions,item.path+' permissions');
  assert.equal(original.components.securitySchemes.DeletionReceipt.name,'MP_DELETION');
  assert.equal(original.components.schemas.PersonalExportList.properties.items.maxItems,20);
  return{result:'PASS',scope:'P7 static contracts and Spring inventory only',operations:operations.length,schemas:Object.keys(schemas).length,liveHttpVerified:false,databaseMigrated:false,paidCalls:0};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(await checkP7(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
