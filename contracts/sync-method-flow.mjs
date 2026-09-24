// Additive method-edition HTTP surface. No network, credentials or database writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const p5=read('./openapi-p5.json'),books=read('./openapi-workbooks.json');
const ref=name=>({$ref:'#/components/schemas/'+name});
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const arr=(items,maxItems)=>({type:'array',items,maxItems});
const id={type:'string',pattern:'^[0-7][0-9A-HJKMNP-TV-Z]{25}$'},sha={type:'string',pattern:'^[a-f0-9]{64}$'},key={type:'string',pattern:'^[a-z][a-z0-9-]{0,79}$'},revision={type:'integer',minimum:0};
const checkpoint={type:'string',pattern:'^(AI|DS|BA)-C[1-3]$'};
const schemas={...structuredClone(p5.components.schemas),WorkbookMetadata:books.components.schemas.WorkbookMetadata};
Object.assign(schemas,{
  Edition:obj({majorCode:{enum:['AI','DATA_SCIENCE','BUSINESS_ANALYTICS']},experienceEdition:{const:2},taskVersionId:id,versionCode:{const:'2.0.0'}}),
  LearningChange:obj({expectedSequence:{type:'integer',minimum:0,maximum:28},expectedStepRevision:revision,stepKey:key,kind:{enum:['SUPPORT_PROVIDED','ATTEMPT_SUBMITTED','BASELINE_SELECTED','CONTINUE_WITH_SUPPORT']},checkpointId:checkpoint,supportId:key,role:{enum:['INITIAL','REVISION','TRANSFER']}},['expectedSequence','stepKey','kind','checkpointId']),
  LocalCheck:obj({stepKey:key,expectedStepRevision:revision,assistance:{type:'boolean'}}),
  LearningEvent:obj({sequence:{type:'integer',minimum:1,maximum:28},kind:{enum:['SUPPORT_PROVIDED','ATTEMPT_SUBMITTED','BASELINE_SELECTED','CONTINUE_WITH_SUPPORT']},checkpointId:checkpoint,acceptedAt:{type:'string',format:'date-time'},payload:{type:'object'},previousSha256:sha,sha256:sha}),
  LearningState:obj({guide:{type:'object',description:'Immutable method-guide-v1 bound to the pinned task; supports and schemas are PUBLIC teaching content.'},sequence:{type:'integer',minimum:0,maximum:28},events:arr(ref('LearningEvent'),28),localResults:arr({type:'object'},40),workbooks:arr(ref('WorkbookMetadata'),1)}),
  LocalCheckResult:obj({record:{type:'object',description:'Immutable server-generated local-result record, not a client score or proof of Excel activity.'}}),
});
const api={openapi:'3.1.0',info:{title:'MajorPilot method-led experience edition',version:'7.3.0',description:'Additive post-P7 quality revision; old runs remain pinned. No public deployment or expert review implied.'},paths:{},components:{schemas,securitySchemes:p5.components.securitySchemes,parameters:p5.components.parameters}};
function route(path,method,name,output,body,status='200'){
 const parameters=[...(path.includes('{id}')?[{name:'id',in:'path',required:true,schema:id}]:[]),...(method==='post'?[{$ref:'#/components/parameters/Origin'},{$ref:'#/components/parameters/IdempotencyKey'}]:[])];
 const operation={operationId:name,security:[method==='get'?{StudentSession:[]}:{StudentSession:[],CsrfHeader:[]}],parameters,responses:{[status]:{description:'Owned active Student; no-store; source-bound immutable state.',content:{'application/json':{schema:obj({data:output,meta:ref('Meta')})}}},...Object.fromEntries([400,401,403,404,409,422,503].map(status=>[status,{description:'Safe error; original draft remains available.',content:{'application/json':{schema:ref('Error')}}}]))}};
 if(body)operation.requestBody={required:true,content:{'application/json':{schema:ref(body)}}};api.paths[path]={[method]:operation};
}
route('/api/app/v1/experience-editions','get','listAvailableMethodEditions',arr(ref('Edition'),3));
route('/api/app/v1/experience-runs/{id}/new-edition','post','startSeparateMethodEdition',ref('Run'),'Revision','201');
route('/api/app/v1/experience-runs/{id}/learning','get','readOwnedLearningState',ref('LearningState'));
route('/api/app/v1/experience-runs/{id}/learning/events','post','appendExplicitLearningEvent',ref('LearningState'),'LearningChange');
route('/api/app/v1/experience-runs/{id}/learning/local-results','post','checkOwnedLocalResults',ref('LocalCheckResult'),'LocalCheck');
const output=JSON.stringify(api,null,2)+'\n',file=new URL('./openapi-method-flow.json',import.meta.url);assert.ok(process.argv.slice(2).every(x=>x==='--write'));if(process.argv.includes('--write'))fs.writeFileSync(file,output);else assert.equal(fs.readFileSync(file,'utf8'),output);
console.log('Method flow contract synchronized; five owned routes, zero paid calls.');
