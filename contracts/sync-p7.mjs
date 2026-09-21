// Mechanical P7 HTTP composition; never reads credentials, accesses a DB or starts a server.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const write=process.argv.includes('--write');
assert.ok(process.argv.slice(2).every(value=>value==='--write'));
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const ref=name=>({$ref:`#/components/schemas/${name}`});
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const array=(items,maxItems,minItems=0)=>({type:'array',items,minItems,...(maxItems===undefined?{}:{maxItems})});
const text=(maxLength=500)=>({type:'string',maxLength});
const integer={type:'integer',minimum:0};
const id={type:'string',pattern:'^[0-7][0-9A-HJKMNP-TV-Z]{25}$'};
const major={enum:['AI','DATA_SCIENCE','BUSINESS_ANALYTICS']};
const instant={type:'string',format:'date-time'};
const ratio={type:'number',minimum:0,maximum:1};
const safeCode={type:'string',pattern:'^[A-Z][A-Z0-9_]{0,79}$'};
const version={type:'string',pattern:'^[A-Za-z0-9._-]{1,80}$'};
const stepKey={type:'string',pattern:'^[a-z][a-z0-9-]{0,39}$'};
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const studentState={enum:['PENDING_VERIFICATION','ACTIVE','LOCKED','DELETION_PENDING','DELETED']};
const runState={enum:['READY','IN_PROGRESS','TASK_COMPLETED','PAUSED','CLOSED','REPLACED']};
const taskState={enum:['DRAFT','REVIEW','PUBLISHED','RETIRED']};
const reportState={enum:['PENDING','GENERATING','READY','FAILED']};
const runMode={enum:['STANDARD','REVIEW_PREVIEW']};
const contentKind={enum:['MAJOR','DEMO']};
const noteList=array(text(2000));
const p5=read('./openapi-p5.json'),p6=read('./openapi-p6.json');
const schemas={Meta:structuredClone(p6.components.schemas.Meta),Error:structuredClone(p6.components.schemas.Error),SourceRevisions:structuredClone(p6.components.schemas.SourceRevisions)};
const api={openapi:'3.1.0',info:{title:'MajorPilot P7 operations, metrics and privacy API',version:'7.0.0',description:'Private local product operations and metrics-v2. Test/Bot/deletion exclusions, source-anchored cohorts, permissioned sensitive access, bounded private exports and account deletion receipts. This contract is not proof of live enforcement, human content review, production readiness or deployment.'},servers:[{url:'http://localhost:18080',description:'Managed local product; no public deployment'}],paths:{},components:{schemas,parameters:structuredClone(p6.components.parameters),securitySchemes:structuredClone(p6.components.securitySchemes)}};
api.components.securitySchemes.DeletionReceipt={type:'apiKey',in:'cookie',name:'MP_DELETION',description:'Read-only host-only HttpOnly receipt cookie, scoped to /api/public/v1/deletion-receipts. Receipt ID alone and Student Cookie alone are insufficient.'};
api.components.parameters.Origin.schema={type:'string',const:'http://localhost:15173'};
api.components.parameters.Origin.description='Exact configured Student origin. Required on all Student writes; no wildcard. The private GET download has its separately declared Fetch Metadata fallback.';
function imported(document,value,prefix){
  if(Array.isArray(value))return value.map(item=>imported(document,item,prefix));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>{
    if(key==='$ref'&&item.startsWith('#/components/schemas/')){
      const original=item.slice('#/components/schemas/'.length),name=prefix+original;
      if(!Object.hasOwn(schemas,name)){schemas[name]={};schemas[name]=imported(document,document.components.schemas[original],prefix);}
      return[key,`#/components/schemas/${name}`];
    }
    return[key,imported(document,item,prefix)];
  }));
  return value;
}
// Reuse existing command/read contracts without changing older milestone artifacts.
for(const [document,prefix] of [[p5,'P5'],[p6,'P6']])for(const [path,methods]of Object.entries(document.paths))if(path.startsWith('/api/admin/')){
  api.paths[path]=imported(document,methods,prefix);
  for(const value of Object.values(api.paths[path]))if(!value['x-required-permissions'])value['x-required-permissions']=[path.includes('recovery-runs')?'majorpilot:recovery:create':value.operationId==='listTaskVersions'?'majorpilot:task:view':'majorpilot:task:publish'];
}

const filterProperties={from:nullable(instant),to:nullable(instant),asOf:nullable(instant),majorCode:nullable(major),taskVersionId:nullable(id),questionnaireVersion:nullable(version),recommendationRuleVersion:nullable(version),reportType:nullable({enum:['EXPERIENCE','COMPARISON']})};
const comparisonFilterGuard={if:{properties:{reportType:{const:'COMPARISON'}},required:['reportType']},then:{properties:{majorCode:{type:'null'},taskVersionId:{type:'null'},questionnaireVersion:{type:'null'},recommendationRuleVersion:{type:'null'}}}};
const filters=object(filterProperties,[]);filters.allOf=[comparisonFilterGuard];
const resolvedFilters=object({...filterProperties,from:instant,to:instant,asOf:instant});resolvedFilters.allOf=[comparisonFilterGuard];
Object.assign(schemas,{
  Empty:object({}),Accepted:object({accepted:{const:true}}),
  EmailChange:object({currentPassword:{type:'string',maxLength:512},newEmail:{type:'string',minLength:3,maxLength:254,description:'ASCII local part and IDN domain normalized/validated on server; no control characters.'}}),
  EmailConfirm:object({token:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$',writeOnly:true}}),
  PasswordChange:object({currentPassword:{type:'string',maxLength:512,writeOnly:true},newPassword:{type:'string',minLength:15,maxLength:128,pattern:'^[^\\u0000-\\u001f\\u007f-\\u009f]*$',writeOnly:true}}),
  DeletionConfirm:object({currentPassword:{type:'string',maxLength:512,writeOnly:true}}),
  PersonalExportRequest:object({scope:{enum:['REPORTS_ONLY','FULL_PERSONAL_EXPORT']}}),
  PersonalExportStatus:object({exportId:id,scope:{enum:['REPORTS_ONLY','FULL_PERSONAL_EXPORT']},status:{enum:['REQUESTED','PROCESSING','READY','FAILED','EXPIRED']},format:{const:'ZIP_JSON_HTML'},requestedAt:instant,completedAt:nullable(instant),expiresAt:nullable(instant),failureCode:nullable(safeCode),fileSizeBytes:nullable(integer)}),
  PersonalExportList:object({items:array(ref('PersonalExportStatus'),20)}),
  DeletionStatus:object({requestId:id,receiptId:id,status:{enum:['REQUESTED','CONFIRMED','PROCESSING','COMPLETED','FAILED','CANCELLED']},requestedAt:instant,confirmedAt:nullable(instant),scheduledFor:nullable(instant),completedAt:nullable(instant),receiptExpiresAt:instant}),
  DeletionReceipt:object({status:{enum:['REQUESTED','PROCESSING','COMPLETED','ACTION_REQUIRED']},requestedAt:instant,confirmedAt:nullable(instant),scheduledFor:nullable(instant),completedAt:nullable(instant),expiresAt:instant}),
  Filters:filters,ResolvedFilters:resolvedFilters,
  StudentRow:object({studentId:id,alias:{type:'string',pattern:'^Student-[a-f0-9]{12}$'},status:studentState,analyticsExclusionCode:nullable({enum:['TEST','BOT']}),revision:integer,createdAt:instant,emailVerifiedAt:nullable(instant),lastLoginAt:nullable(instant),profileCount:integer,startedMajorCount:{type:'integer',minimum:0,maximum:3},closedMajorCount:{type:'integer',minimum:0,maximum:3}}),
  ConsentSummary:object({documentType:{enum:['TERMS','PRIVACY','RESEARCH']},documentVersion:version,decision:{enum:['ACCEPTED','DECLINED','WITHDRAWN']},decidedAt:instant}),
  ProfileSummary:object({decisionProfileId:id,questionnaireVersion:version,versionNo:{type:'integer',minimum:1},status:{enum:['SUBMITTED','CLAIMED','SUPERSEDED']},submittedAt:instant}),
  StudentDetails:object({consents:array(ref('ConsentSummary'),100),profiles:array(ref('ProfileSummary'),100),historyLimit:{const:100}}),
  StudentDetail:object({summary:ref('StudentRow'),details:ref('StudentDetails')}),
  AnalyticsExclusion:object({expectedRevision:integer,exclusionCode:{enum:['NONE','TEST','BOT']},reason:{type:'string',minLength:10,maxLength:500}}),
  SensitiveView:object({purpose:{enum:['SUPPORT_REQUEST','QUALITY_REVIEW','INCIDENT_REVIEW','PRODUCT_ANALYSIS']},reason:{type:'string',minLength:10,maxLength:500}}),
  SensitiveStudent:object({studentId:id,email:text(254)}),
  RunRow:object({experienceRunId:id,studentId:id,studentAlias:{type:'string',pattern:'^Student-[a-f0-9]{12}$'},contentKind,runMode,majorCode:nullable(major),taskVersionId:nullable(id),taskVersionCode:nullable(version),status:runState,currentStepKey:nullable(stepKey),revision:integer,attemptNo:{type:'integer',minimum:1},originRunId:nullable(id),startedAt:nullable(instant),closedAt:nullable(instant),lastActivityAt:nullable(instant)}),
  StepSummary:object({stepKey,status:{enum:['NOT_STARTED','IN_PROGRESS','COMPLETED']},currentRevision:integer,completedAt:nullable(instant)}),
  ExecutionSummary:object({operationKey:text(80),status:{enum:['SUCCEEDED','FAILED','TIMED_OUT','CANCELLED']},trustLevel:{enum:['SERVER_VERIFIED','CLIENT_OBSERVED']},errorCode:nullable(safeCode),count:integer}),
  RunDetails:object({steps:array(ref('StepSummary')),executions:array(ref('ExecutionSummary'))}),
  RunDetail:object({summary:ref('RunRow'),details:ref('RunDetails')}),
  ResponseRevision:object({stepKey,revision:integer,response:{type:'object',description:'Sensitive saved response, validated against its pinned Task Version at write time; never part of ordinary lists/CSV.'},receivedAt:instant}),
  SensitiveRun:object({experienceRunId:id,responses:array(ref('ResponseRevision'),10000),reflection:nullable({type:'object',description:'Sensitive pinned Reflection draft, available only after purpose/permission/owner checks and audit.'})}),
  ReportRow:object({reportId:id,studentId:id,studentAlias:{type:'string',pattern:'^Student-[a-f0-9]{12}$'},reportType:{enum:['EXPERIENCE','COMPARISON']},majorCode:nullable(major),status:reportState,currentVersionId:nullable(id),versionNo:nullable({type:'integer',minimum:1}),generationMode:nullable({enum:['AI','DETERMINISTIC_FALLBACK']}),failureCode:nullable(safeCode),requestedAt:instant,readyAt:nullable(instant),firstReadyAt:nullable(instant),revision:integer}),
  TaskRow:object({taskVersionId:id,contentKind,majorCode:nullable(major),demoKey:nullable({enum:['DEMO_TABLE','DEMO_COMPARE']}),versionCode:version,title:text(300),status:taskState,manifestSha256:sha,dataSha256:sha,reviewedByOperatorId:nullable({type:'integer',minimum:1}),publishedAt:nullable(instant),retiredAt:nullable(instant),revision:integer}),
  TaskReviewContext:object({taskVersionId:id,manifestPath:{type:'string',pattern:'^(?!.*(?:^|/)(?:\\.|\\.\\.)(?:/|$))(?!.*//)[A-Za-z0-9][A-Za-z0-9._/-]{0,240}/manifest\\.json$'},requiredReviewChecks:{...array(safeCode,100,1),uniqueItems:true},status:taskState,revision:integer}),
  AuditRow:object({auditId:id,operatorId:{type:'integer',minimum:1},actionCode:safeCode,targetType:safeCode,targetPublicId:id,studentAlias:nullable({type:'string',pattern:'^Student-[a-f0-9]{12}$'}),reasonCode:safeCode,occurredAt:instant}),
  AdminExportStatus:object({exportId:id,dataset:{enum:['STUDENTS','EXPERIENCE_RUNS','REPORTS','METRICS']},schemaVersion:{const:'admin-csv-v1'},filters:ref('ResolvedFilters'),fields:{...array(text(80),20,1),uniqueItems:true},timeAnchor:{enum:['STUDENT_CREATED_AT','RUN_STARTED_AT','REPORT_FIRST_READY_AT','METRIC_SPECIFIC_ANCHORS']},status:{enum:['REQUESTED','PROCESSING','READY','FAILED','EXPIRED','REVOKED']},rowCount:nullable({type:'integer',minimum:0,maximum:10000}),fileSizeBytes:nullable(integer),requestedAt:instant,completedAt:nullable(instant),expiresAt:nullable(instant),failureCode:nullable(safeCode),revision:integer,scopeNotes:noteList}),
});
schemas.EmailChange.properties.currentPassword.writeOnly=true;
for(const [name,row]of Object.entries({StudentPage:'StudentRow',RunPage:'RunRow',TaskPage:'TaskRow',AuditPage:'AuditRow'}))schemas[name]=object({rows:array(ref(row),100),total:integer});
schemas.ReportPage=object({rows:array(ref('ReportRow'),100),total:integer,scopeNotes:noteList});
const csvFields={STUDENTS:['alias','status','createdAt','emailVerifiedAt','startedMajorCount','closedMajorCount'],EXPERIENCE_RUNS:['studentAlias','experienceRunId','majorCode','taskVersionId','status','startedAt','closedAt','attemptNo'],REPORTS:['studentAlias','reportId','reportType','majorCode','status','firstReadyAt','readyAt','generationMode','versionNo'],METRICS:['metric','majorCode','numerator','denominator','rate','cohortCount','immatureCount','anchor','windowDays']};
schemas.AdminExportCreate={oneOf:Object.entries(csvFields).map(([dataset,fields])=>{
  const scope=structuredClone(filters);if(dataset!=='REPORTS')scope.properties.reportType={type:'null'};
  return object({dataset:{const:dataset},filters:nullable(scope),fields:nullable({...array({enum:fields},fields.length,1),uniqueItems:true}),purpose:{type:'string',minLength:10,maxLength:500}},['dataset','purpose']);
})};
schemas.AdminExportStatus.allOf=Object.entries(csvFields).map(([dataset,fields])=>({if:{properties:{dataset:{const:dataset}},required:['dataset']},then:{properties:{fields:{...array({enum:fields},fields.length,1),uniqueItems:true},timeAnchor:{const:{STUDENTS:'STUDENT_CREATED_AT',EXPERIENCE_RUNS:'RUN_STARTED_AT',REPORTS:'REPORT_FIRST_READY_AT',METRICS:'METRIC_SPECIFIC_ANCHORS'}[dataset]}}}}));

function withRate(properties){const result=object(properties);result.allOf=[{if:{properties:{denominator:{const:0}},required:['denominator']},then:{properties:{rate:{type:'null'}}},else:{properties:{rate:ratio}}}];return result;}
const kpi=withRate({numerator:integer,denominator:integer,rate:nullable(ratio),cohortCount:integer,immatureCount:integer,anchor:text(100),windowDays:{type:'integer',minimum:0,maximum:14}});
for(const[name,days,anchor]of [['FirstCompletionKpi',7,'FIRST_FORMAL_RECOVERY_CHAIN_STARTED_AT'],['ReportInsightKpi',0,'FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT'],['SecondStartKpi',14,'FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT']]){schemas[name]=structuredClone(kpi);schemas[name].properties.windowDays={const:days};schemas[name].properties.anchor={const:anchor};}
Object.assign(schemas,{
  FeedbackCoverage:withRate({numerator:integer,denominator:integer,rate:nullable(ratio),answeredWithoutViewed:integer,unobservedReportCount:integer}),
  SecondStartTiming:object({before:integer,after:integer}),
  CoreMetrics:object({firstExperienceCompletion:ref('FirstCompletionKpi'),reportInsight:ref('ReportInsightKpi'),secondExperienceStart:ref('SecondStartKpi'),feedbackCoverage:ref('FeedbackCoverage'),secondStartTiming:ref('SecondStartTiming')}),
  MajorBreakdown:object({majorCode:major,metrics:ref('CoreMetrics')}),
  FunnelStage:object({key:text(100),count:integer,previousConversion:nullable(ratio),cumulativeConversion:nullable(ratio)}),
  Funnel:object({key:{enum:['FIRST_VALUE','POST_REPORT_COMPARISON','TASK_STEPS']},grain:{enum:['INTAKE_JOURNEY_THEN_UNIQUE_STUDENT','UNIQUE_STUDENT','UNIQUE_STUDENT_PER_TASK_VERSION']},anchor:{enum:['INTAKE_STARTED_AT','FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT','FORMAL_TASK_STARTED_AT']},stages:array(ref('FunnelStage')),coverageNotes:noteList}),
  ComparisonBreakdown:object({firstMajorCode:major,secondMajorCode:nullable(major),funnel:ref('Funnel')}),
  StepDiagnostic:object({stepKey,viewedStudents:integer,completedStudents:integer,errorStudents:integer,recoveryStudents:integer,hintStudents:integer}),
  TaskFunnel:object({taskVersionId:id,majorCode:major,funnel:ref('Funnel'),diagnostics:array(ref('StepDiagnostic'))}),
  MetricExclusions:object({testStudents:integer,botStudents:integer,deletionStudents:integer,nonStandardRuns:integer}),
  MetricDiagnostics:object({eligibleStudents:integer,runsWithActivityObservations:integer,eligibleStartedRuns:integer,observedActiveSeconds:integer,activityObservationCoverage:nullable(ratio)}),
  MetricFilters:object({majorCode:nullable(major),taskVersionId:nullable(id),questionnaireVersion:nullable(version),recommendationRuleVersion:nullable(version)}),
  JobCount:object({jobType:{enum:['EVIDENCE_BUILD','EVIDENCE_REBUILD','REPORT_GENERATE','COMPARISON_GENERATE','STUDENT_EXPORT','ACCOUNT_DELETE','ADMIN_EXPORT','RETENTION_CLEANUP']},status:{enum:['PENDING','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED','CANCELLED']},count:integer}),
  SafeErrorCount:object({source:{enum:['JOB','AI','EXECUTION']},code:safeCode,count:integer}),
  RetentionStatus:object({policyKey:text(80),lastStartedAt:nullable(instant),lastCompletedAt:nullable(instant),lastErrorCode:nullable(safeCode),deletedCount:integer,nextDueAt:nullable(instant)}),
  OperationsHealth:object({checkedAt:instant,jobs:array(ref('JobCount')),safeErrors:array(ref('SafeErrorCount'),150),overdueDeletionCount:integer,reportReadyVersionCount:integer,reportFallbackVersionCount:integer,unknownCostCalls:nullable(integer),knownEstimatedCost:nullable({type:'number',minimum:0}),retention:array(ref('RetentionStatus')),coverageNotes:noteList}),
  Overview:object({metricsVersion:{const:'metrics-v2'},asOf:instant,from:instant,to:instant,filters:ref('MetricFilters'),dataUpdatedAt:nullable(instant),exclusions:ref('MetricExclusions'),metrics:ref('CoreMetrics'),byMajor:array(ref('MajorBreakdown'),3),funnels:array(ref('Funnel')),comparisonByMajorPair:array(ref('ComparisonBreakdown')),taskFunnels:array(ref('TaskFunnel')),diagnostics:ref('MetricDiagnostics'),coverageNotes:noteList,health:ref('OperationsHealth')}),
});
const observationBase={clientEventId:{type:'string',format:'uuid',pattern:'^[a-f0-9-]{36}$'},eventVersion:{const:'v1'},occurredAt:instant,contextPublicId:id,visibleDurationMs:{type:'integer',minimum:1000,maximum:86400000}};
schemas.PageObservation={oneOf:[
  object({...observationBase,eventName:{enum:['recommendation.viewed','next_recommendation.viewed']},contextType:{const:'RECOMMENDATION'},properties:nullable(object({}))},[...Object.keys(observationBase),'eventName','contextType']),
  object({...observationBase,eventName:{enum:['report.viewed','report.printed','comparison_report.viewed']},contextType:{const:'REPORT_VERSION'},properties:nullable(object({}))},[...Object.keys(observationBase),'eventName','contextType']),
  object({...observationBase,eventName:{const:'experience.step.viewed'},contextType:{const:'EXPERIENCE_RUN'},properties:object({stepKey})}),
  object({...observationBase,eventName:{const:'experience.run.resumed'},contextType:{const:'EXPERIENCE_RUN'},properties:object({stepKey,inactivityBucket:{enum:['MINUTES_10_60','HOURS_1_24','DAYS_1_PLUS']}})}),
]};
schemas.PageEvents=object({events:array(ref('PageObservation'),20,1)});
schemas.EventAccepted=object({acceptedCount:{type:'integer',minimum:0,maximum:20},duplicateCount:{type:'integer',minimum:0,maximum:20}});

const param=(name,schema,where='query',required=false)=>({name,in:where,required,schema});
const commonFilters=Object.entries({from:instant,to:instant,asOf:instant,majorCode:major,taskVersionId:id,questionnaireVersion:version,recommendationRuleVersion:version}).map(([key,value])=>param(key,value));
function pageParams(sortFields,extras=[],base=commonFilters){return [...base,param('pageNum',{type:'integer',minimum:1,maximum:100000,default:1}),param('pageSize',{type:'integer',minimum:1,maximum:100,default:20}),param('sortBy',{enum:sortFields}),param('sortOrder',{enum:['asc','desc'],default:'desc'}),...extras];}
const status=param('status',{type:'string',pattern:'^[A-Z_]{1,32}$'}),student=param('studentId',id),excluded=param('exclusionCode',{enum:['NONE','TEST','BOT']});
function operation(path,method,operationId,success,{body,parameters=[],permissions,receipt=false,idempotent=false,download=false,description}={}){
  const admin=path.startsWith('/api/admin/'),mutation=['post','patch'].includes(method);
  const params=[...path.matchAll(/\{([^}]+)\}/g)].map(match=>param(match[1],id,'path',true)).concat(parameters);
  if(idempotent)params.push({$ref:'#/components/parameters/IdempotencyKey'});
  if(!admin&&!receipt&&download){
    params.push({...structuredClone(api.components.parameters.Origin),required:false,description:'Exact Student origin when present; an explicit foreign/null Origin is rejected even with same-origin Fetch Metadata. If omitted, Sec-Fetch-Site must be exactly same-origin. Session-bound CSRF remains mandatory.'});
    params.push(param('Sec-Fetch-Site',{type:'string',description:'Only an absent Origin plus the exact value same-origin is accepted as the browser GET fallback.'},'header'));
  }else if(!admin&&!receipt&&mutation)params.push({$ref:'#/components/parameters/Origin'});
  const responses=Object.fromEntries(Object.entries(success).map(([code,schema])=>[code,schema===null?{description:'No body; all Student sessions revoked and browser cookies cleared.'}:{description:'Validated private response',content:{'application/json':{schema:object({data:schema,meta:ref('Meta')})}}}]));
  if(download)responses['200']={description:admin?'Private UTF-8 CSV with BOM, maximum 10000 rows, 24-hour expiry. No email/free text/model payload.':'Private ZIP of versioned JSON and escaped report HTML, 24-hour expiry. No password/token/hash/Operator data.',headers:{'Cache-Control':{schema:{type:'string',const:'no-store'}},'Content-Disposition':{schema:{type:'string'}}},content:{[admin?'text/csv':'application/zip']:{schema:{type:'string',format:'binary'}}}};
  responses.default={description:'Safe error envelope. No token, password, file path, provider payload or foreign resource detail.',content:{'application/json':{schema:ref('Error')}}};
  const value={operationId,description,security:[receipt?{DeletionReceipt:[]}:admin?{AdminBearer:[]}:{StudentSession:[],...(mutation||download?{CsrfHeader:[]}:{})}],parameters:params,responses};
  if(body)value.requestBody={required:true,content:{'application/json':{schema:body}}};if(admin)value['x-required-permissions']=permissions;
  if(download)value['x-private-download']=true;
  (api.paths[path]??={})[method]=value;
}
const app='/api/app/v1',admin='/api/admin/v1/majorpilot';
operation(app+'/me/email','patch','requestEmailChange',{202:ref('Accepted')},{body:ref('EmailChange'),description:'Current password required. Uniform accepted response for unavailable/already-used email; old address remains until confirmation. New request revokes prior CHANGE_EMAIL token. No idempotency record containing secrets.'});
operation(app+'/me/email/confirm','post','confirmEmailChange',{204:null},{body:ref('EmailConfirm'),description:'Requires same Student Session plus one-time token. Preserves original first verification time; revokes all sessions/tokens on success. Invalid/expired/foreign/conflicting target is EMAIL_TOKEN_INVALID.'});
operation(app+'/me/password','patch','changeStudentPassword',{204:null},{body:ref('PasswordChange'),description:'Current password verification, independent rate limits, revoke all sessions/tokens. Wrong current password is 422 CURRENT_PASSWORD_INVALID, not a session expiry.'});
operation(app+'/data-export-requests','post','createPersonalExport',{202:ref('PersonalExportStatus')},{body:ref('PersonalExportRequest'),idempotent:true});
operation(app+'/data-export-requests','get','listPersonalExports',{200:ref('PersonalExportList')},{description:'Latest 20 own requests in descending internal creation order; not a paginated all-history list.'});
operation(app+'/data-export-requests/{id}','get','readPersonalExport',{200:ref('PersonalExportStatus')});
operation(app+'/data-export-requests/{id}/download','get','downloadPersonalExport',{},{download:true});
operation(app+'/account-deletion-requests','post','createAccountDeletion',{201:ref('DeletionStatus')},{body:ref('Empty'),idempotent:true,description:'Pre-sets read-only MP_DELETION cookie (maximum 127 days); raw receipt secret never enters body or idempotency response.'});
operation(app+'/account-deletion-requests/{id}','get','readAccountDeletion',{200:ref('DeletionStatus')});
operation(app+'/account-deletion-requests/{id}/confirm','post','confirmAccountDeletion',{202:ref('DeletionStatus')},{body:ref('DeletionConfirm'),idempotent:true,description:'Current password/Session/CSRF required. Transaction revokes sessions/tokens/downloads, marks DELETION_PENDING and persists deletion job. Response loss is recoverable only through the already-issued receipt cookie.'});
operation('/api/public/v1/deletion-receipts/{id}','get','readDeletionReceipt',{200:ref('DeletionReceipt')},{receipt:true,description:'Invalid/missing/wrong/expired receipt credential or ID returns the same 404. Returns only safe status/times; successful response tightens cookie expiry. Does not restore Student access.'});
operation(app+'/events','post','observeP7Pages',{202:ref('EventAccepted')},{body:ref('PageEvents'),description:'At most 20 observations/16KiB. Core content visible >=1s; event time within -24h/+5m. Server derives ownership/task/major. Step deduplication is pinned Run+step+version; resume uses client ID plus same-Run receiving-time cooldown <10m, not a permanent once-per-Run key. DEMO/preview are stored under separate prefixes. Not proof of attention.'});
operation(admin+'/overview','get','readOperationsOverview',{200:ref('Overview')},{permissions:['majorpilot:overview:view'],parameters:commonFilters,description:'metrics-v2 uses one asOf snapshot, [from,to) cohort anchors, maximum 366 days, default 90. First anchor chosen before dimension filters. Zero denominators are null. Current technical health is separate from the historical formal cohort.'});
operation(admin+'/students','get','pageStudents',{200:ref('StudentPage')},{permissions:['majorpilot:student:view'],parameters:pageParams(['createdAt','lastLoginAt','status'],[status,student,excluded])});
operation(admin+'/students/{id}','get','readStudentOperations',{200:ref('StudentDetail')},{permissions:['majorpilot:student:view']});
operation(admin+'/students/{id}/analytics-exclusion','patch','setAnalyticsExclusion',{200:ref('StudentRow')},{body:ref('AnalyticsExclusion'),permissions:['majorpilot:analytics:manage'],idempotent:true});
operation(admin+'/students/{id}/sensitive-view','post','readSensitiveStudent',{200:ref('SensitiveStudent')},{body:ref('SensitiveView'),permissions:['majorpilot:student:sensitive'],description:'Explicit purpose/reason and audit commit precede returning email; never an ordinary list field.'});
operation(admin+'/experience-runs','get','pageExperienceRuns',{200:ref('RunPage')},{permissions:['majorpilot:experience:view'],parameters:pageParams(['startedAt','lastActivityAt','status','createdAt'],[status,student,excluded,param('runMode',runMode)])});
operation(admin+'/experience-runs/{id}','get','readRunOperations',{200:ref('RunDetail')},{permissions:['majorpilot:experience:view']});
operation(admin+'/experience-runs/{id}/sensitive-view','post','readSensitiveRun',{200:ref('SensitiveRun')},{body:ref('SensitiveView'),permissions:['majorpilot:experience:sensitive']});
operation(admin+'/reports/page','get','pageReports',{200:ref('ReportPage')},{permissions:['majorpilot:report:view'],parameters:pageParams(['requestedAt','firstReadyAt','status'],[status,student,excluded,param('reportType',{enum:['EXPERIENCE','COMPARISON']})]),description:'Default page anchor is requestedAt. Run filters restrict to EXPERIENCE; explicit COMPARISON plus Run filters is FILTER_CONFLICT. Existing /reports array contract is unchanged.'});
operation(admin+'/task-versions/page','get','pageTaskVersions',{200:ref('TaskPage')},{permissions:['majorpilot:task:view'],parameters:pageParams(['createdAt','publishedAt','status'],[status],[param('majorCode',major),param('taskVersionId',id)])});
operation(admin+'/task-versions/{id}/review-context','get','readTaskReviewContext',{200:ref('TaskReviewContext')},{permissions:['majorpilot:task:view'],description:'Read-only catalogued relative path and actual required checks. Never claims review approval and never permits arbitrary filesystem paths.'});
operation(admin+'/audit-events','get','pageAuditEvents',{200:ref('AuditPage')},{permissions:['majorpilot:audit:view'],parameters:pageParams(['occurredAt','actionCode'],[student],commonFilters.filter(p=>['from','to','asOf'].includes(p.name)))});
operation(admin+'/exports','post','createAdminExport',{202:ref('AdminExportStatus')},{body:ref('AdminExportCreate'),permissions:['majorpilot:export:create'],idempotent:true});
operation(admin+'/exports/{id}','get','readAdminExport',{200:ref('AdminExportStatus')},{permissions:['majorpilot:export:create']});
operation(admin+'/exports/{id}/download','get','downloadAdminExport',{},{permissions:['majorpilot:export:create'],download:true,description:'Checks initiating Operator/current permission and every member Student under locks, audits download, rejects expired/revoked/deleting-member artifacts.'});
const expected=JSON.stringify(api,null,2)+'\n',target=new URL('./openapi-p7.json',import.meta.url);
if(write)writeFileSync(target,expected);else assert.equal(readFileSync(target,'utf8'),expected,'P7 drift: run node contracts/sync-p7.mjs --write');
console.log(JSON.stringify({result:'PASS',scope:'P7 mechanical contract composition',mode:write?'write':'check',paidCalls:0}));
