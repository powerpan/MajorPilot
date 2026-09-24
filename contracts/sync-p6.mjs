// P6 HTTP contract composition. Source generation only; no credentials or network.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const write=process.argv.includes('--write');
assert.ok(process.argv.slice(2).every(argument=>argument==='--write'));
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const ref=name=>({$ref:`#/components/schemas/${name}`});
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const array=(items,minItems=0,maxItems=50)=>({type:'array',items,minItems,maxItems});
const text=(maxLength=500)=>({type:'string',maxLength});
const id={type:'string',pattern:'^[0-7][0-9A-HJKMNP-TV-Z]{25}$'};
const major={enum:['AI','BUSINESS_ANALYTICS','DATA_SCIENCE']};
const revision={type:'integer',minimum:0};
const instant={type:'string',format:'date-time'};
const p1=read('./openapi-p1.json'),p5=read('./openapi-p5.json');
const schemas={Meta:structuredClone(p5.components.schemas.Meta),Error:structuredClone(p5.components.schemas.Error),SourceRevisions:structuredClone(p5.components.schemas.SourceRevisions)};
// Namespace the unchanged P1 shapes, including their internal references.
function importP1(value){
  if(Array.isArray(value))return value.map(importP1);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='$ref'&&child.startsWith('#/components/schemas/')?child.replace('#/components/schemas/','#/components/schemas/P1'):importP1(child)]));
  return value;
}
for(const [key,schema] of Object.entries(p1.components.schemas))schemas[`P1${key}`]=importP1(schema);
const report=read('./schemas/report-v1.json');delete report.$id;delete report.$schema;
const methodReport=read('./schemas/method-report-v1.json');delete methodReport.$id;delete methodReport.$schema;
schemas.Report={oneOf:[report,methodReport]};
Object.assign(schemas,{
  Generation:object({status:{enum:['GENERATING','READY','FAILED','SUPERSEDED']},phase:{enum:['WAITING_EVIDENCE','PREPARED','INITIAL_REQUESTED','REPAIR_REQUESTED','DRAFT_READY','REVIEW_REQUESTED','FALLBACK_PENDING','VALIDATED','PUBLISHED']},retryable:{type:'boolean'},safeCode:nullable(text(100))}),
  ReportStatus:object({reportId:id,status:{enum:['PENDING','GENERATING','READY','FAILED']},currentVersionId:nullable(id),generation:nullable(ref('Generation')),revision}),
  ReportSummary:{...object({reportId:id,reportType:{enum:['EXPERIENCE','COMPARISON']},majorCode:nullable(major),status:{enum:['PENDING','GENERATING','READY','FAILED']},currentVersionId:nullable(id),versionNo:nullable({type:'integer',minimum:1}),generation:nullable(ref('Generation')),readyAt:nullable(instant),firstReadyAt:nullable(instant),revision}),properties:{...object({reportId:id,reportType:{enum:['EXPERIENCE','COMPARISON']},majorCode:nullable(major),status:{enum:['PENDING','GENERATING','READY','FAILED']},currentVersionId:nullable(id),versionNo:nullable({type:'integer',minimum:1}),generation:nullable(ref('Generation')),readyAt:nullable(instant),firstReadyAt:nullable(instant),revision}).properties,sourceRunId:id}},
  ReportPage:object({items:array(ref('ReportSummary')),nextCursor:nullable(id)}),
  ComparisonWaiting:object({state:{const:'WAITING'},reason:{enum:['NEED_TWO_MAJORS','WAITING_SOURCE_REPORTS','SOURCE_REPORT_FAILED','COMPARISON_GENERATING','COMPARISON_FAILED']},majors:array(object({majorCode:major,status:{enum:['NOT_REQUESTED','PENDING','GENERATING','READY','FAILED']}}),3,3)}),
  ComparisonReady:object({state:{const:'READY'},report:ref('Report'),generation:nullable(ref('Generation'))}),
  Regenerate:object({expectedRevision:revision,reasonCode:{enum:['CONTENT_CORRECTION','GENERATION_FAILURE','RULE_UPDATE','OPERATOR_REQUEST']},reason:{type:'string',minLength:10,maxLength:500},evidenceMode:{enum:['REUSE_READY_EVIDENCE','REBUILD_EVIDENCE']},targetEvidenceRuleVersion:nullable({enum:['evidence-v3','ds-evidence-v2','ba-evidence-v2']})},['expectedRevision','reasonCode','reason','evidenceMode']),
  RegenerationAccepted:object({reportId:id,reportVersionId:id,status:{const:'GENERATING'},revision}),
  VersionSummary:object({reportVersionId:id,versionNo:{type:'integer',minimum:1},status:{enum:['GENERATING','READY','FAILED','SUPERSEDED']},generationMode:nullable({enum:['AI','DETERMINISTIC_FALLBACK']}),failureCode:nullable(text(100)),createdAt:instant,completedAt:nullable(instant)}),
  FeedbackAnswers:object({insightResponse:{type:'integer',minimum:1,maximum:5},clarityChange:{type:'integer',minimum:1,maximum:5},nextAction:{enum:['TRY_ANOTHER','LEARN_CURRENT','PAUSE_DECISION','OTHER','DECLINED']}},[]),
  Feedback:object({feedbackType:{enum:['GENERAL','TASK','REPORT','TECHNICAL']},contextType:{enum:['EXPERIENCE_RUN','REPORT_VERSION']},contextPublicId:id,rating:{type:'integer',minimum:1,maximum:5},comment:{type:'string',minLength:1,maxLength:1000},surveyVersion:{const:'report-value-v1'},answers:ref('FeedbackAnswers'),diagnosticCode:{enum:['REPORT_GENERATION_FAILED','REPORT_VERSION_CHANGED','NETWORK_ERROR','OFFLINE']}},['feedbackType']),
  FeedbackAccepted:object({feedbackId:id,status:{const:'RECEIVED'}}),
  NextReason:object({code:text(100),reasonType:text(100),text:text(1000)}),
  NextRecommendation:object({recommendationType:{const:'NEXT'},recommendationId:id,sourceRunId:id,decisionProfileId:id,ruleVersion:{const:'next-recommendation-v1'},explanationVersion:text(100),completedMajorCodes:{...array(major,1,2),uniqueItems:true},primaryMajor:major,alternativeMajors:{...array(major,0,1),uniqueItems:true},reasons:array(ref('NextReason'),1,8),differences:array(ref('P1MajorDifference'),3,3),generatedAt:instant}),
  PageObservation:object({clientEventId:{type:'string',format:'uuid'},eventName:{enum:['recommendation.viewed','next_recommendation.viewed','report.viewed','report.printed','comparison_report.viewed']},eventVersion:{const:'v1'},occurredAt:instant,contextType:{enum:['RECOMMENDATION','REPORT_VERSION']},contextPublicId:id,visibleDurationMs:{type:'integer',minimum:1000,maximum:86400000},properties:object({})},['clientEventId','eventName','eventVersion','occurredAt','contextType','contextPublicId','visibleDurationMs']),
});
schemas.FeedbackAnswers.minProperties=1;
schemas.Feedback.dependentRequired={contextType:['contextPublicId'],contextPublicId:['contextType'],surveyVersion:['answers'],answers:['surveyVersion']};
schemas.Feedback.anyOf=['rating','comment','answers'].map(key=>({properties:{[key]:schemas.Feedback.properties[key]},required:[key]}));
schemas.Feedback.allOf=[{if:{properties:{feedbackType:{const:'REPORT'}},required:['feedbackType']},then:{required:['contextType','contextPublicId'],properties:{contextType:{const:'REPORT_VERSION'},contextPublicId:id}}}];
schemas.Regenerate.allOf=[{if:{properties:{evidenceMode:{const:'REBUILD_EVIDENCE'}},required:['evidenceMode']},then:{required:['targetEvidenceRuleVersion'],properties:{targetEvidenceRuleVersion:{enum:['evidence-v3','ds-evidence-v2','ba-evidence-v2']}}},else:{properties:{targetEvidenceRuleVersion:{type:'null'}}}}];
schemas.PageEvents=object({events:array(ref('PageObservation'),1,20)});
schemas.Dashboard=structuredClone(schemas.P1Dashboard);
schemas.Dashboard.properties.nextRecommendation=nullable(ref('NextRecommendation'));
schemas.Dashboard.required.push('nextRecommendation');
schemas.Dashboard.properties.nextStep={enum:['ALL_COMPLETED','SELECT_EXPERIENCE','TASK_CONTENT_PREPARING']};
// Report summaries/comparison status are loaded by their read APIs on Dashboard;
// immutable recommendation/body data is not duplicated into a second projection.
const api={openapi:'3.1.0',info:{title:'MajorPilot P6 private report and comparison API',version:'6.0.0',description:'Versioned evidence-bound reports, NEXT, comparison, feedback and private printing. Real REVIEW_PREVIEW content is excluded. Local automated acceptance uses isolated TEST_FIXTURE content and no paid calls; explicit live provider tests are separate.'},servers:[{url:'http://localhost:18080',description:'Managed local product; engineering preview creates no report'},{url:'http://127.0.0.1:18081',description:'Test-only isolated real-security harness; not a deployment'}],paths:{},components:{schemas,parameters:structuredClone(p5.components.parameters),securitySchemes:structuredClone(p5.components.securitySchemes)}};
api.components.parameters.Origin.schema={type:'string',enum:['http://localhost:15173','http://127.0.0.1:15176']};
api.components.parameters.Origin.description='Each separately guarded server accepts exactly its own origin, never both. Product: localhost:15173; test-only harness: 127.0.0.1:15176.';
const parameter=(name,schema,where='query',required=false)=>({name,in:where,required,schema});
const response=(schema,description='Validated response')=>({description,content:{'application/json':{schema:object({data:schema,meta:ref('Meta')})}}});
function operation(route,method,operationId,success,{body,parameters=[],admin=false,permissions=[],idempotent=true}={}){
  const params=[...route.matchAll(/\{([^}]+)\}/g)].map(match=>parameter(match[1],id,'path',true)).concat(parameters);
  if(method==='post'){if(idempotent)params.push({$ref:'#/components/parameters/IdempotencyKey'});if(!admin)params.push({$ref:'#/components/parameters/Origin'});}
  const responses=Object.fromEntries(Object.entries(success).map(([status,schema])=>[status,response(schema)]));
  responses.default={description:'Safe envelope; no provider text, evidence IDs or foreign resource details',content:{'application/json':{schema:ref('Error')}}};
  const value={operationId,security:[admin?{AdminBearer:[]}:{StudentSession:[],...(method==='post'?{CsrfHeader:[]}:{})}],parameters:params,responses};
  if(body)value.requestBody={required:true,content:{'application/json':{schema:body}}};
  if(admin)value['x-required-permissions']=permissions;
  (api.paths[route]??={})[method]=value;
}
operation('/api/app/v1/reports','get','listReports',{200:ref('ReportPage')},{parameters:[parameter('cursor',id),parameter('limit',{type:'integer',minimum:1,maximum:50})]});
operation('/api/app/v1/reports/{id}','get','readReport',{200:ref('Report'),202:ref('ReportStatus')});
operation('/api/app/v1/reports/{id}/status','get','readReportStatus',{200:ref('ReportStatus')});
operation('/api/app/v1/reports/{id}/print','get','readPrivatePrint',{200:ref('Report'),202:ref('ReportStatus')},{parameters:[parameter('expectedReportVersionId',id)]});
operation('/api/app/v1/comparison-report','get','readComparisonReport',{200:{oneOf:[ref('ComparisonReady'),ref('ComparisonWaiting')]}});
operation('/api/app/v1/feedback','post','submitFeedback',{201:ref('FeedbackAccepted')},{body:ref('Feedback')});
operation('/api/app/v1/recommendations/{id}','get','readInitialOrNextRecommendation',{200:{oneOf:[ref('P1Recommendation'),ref('NextRecommendation')]}});
operation('/api/app/v1/recommendations/{id}/decision','post','decideInitialOrNextRecommendation',{201:ref('P1Decision')},{body:ref('P1DecisionInput')});
operation('/api/app/v1/dashboard','get','readP6Dashboard',{200:ref('Dashboard')});
// Observation deduplication is per clientEventId, not a write receipt header.
operation('/api/app/v1/events','post','observeP6Pages',{202:ref('P1EventAccepted')},{body:ref('PageEvents'),idempotent:false});
operation('/api/admin/v1/majorpilot/reports','get','adminListReports',{200:array(ref('ReportSummary'))},{admin:true,permissions:['majorpilot:report:view']});
operation('/api/admin/v1/majorpilot/reports/{id}','get','adminReadReportSummary',{200:ref('ReportSummary')},{admin:true,permissions:['majorpilot:report:view']});
operation('/api/admin/v1/majorpilot/reports/{id}/regenerations','post','regenerateReport',{202:ref('RegenerationAccepted')},{body:ref('Regenerate'),admin:true,permissions:['majorpilot:report:regenerate']});
operation('/api/admin/v1/majorpilot/reports/{id}/versions','get','adminListReportVersions',{200:array(ref('VersionSummary'))},{admin:true,permissions:['majorpilot:report:history:view']});
operation('/api/admin/v1/majorpilot/reports/{id}/versions/{version}','get','adminReadSensitiveReportVersion',{200:ref('Report')},{admin:true,permissions:['majorpilot:report:history:view','majorpilot:report:sensitive:view']});
const expected=JSON.stringify(api,null,2)+'\n',file=new URL('./openapi-p6.json',import.meta.url);
if(write)writeFileSync(file,expected);else assert.equal(readFileSync(file,'utf8'),expected,'P6 contract drift: run node contracts/sync-p6.mjs --write');
console.log(JSON.stringify({result:'PASS',scope:'P6 mechanical HTTP contract composition',mode:write?'write':'check',paidCalls:0}));
