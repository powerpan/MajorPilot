import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkP7,loadP7Contracts} from '../check-p7.mjs';
const{schemas,original,operations}=await loadP7Contracts();
const id='01JF1000000000000000000001',time='2026-09-21T00:00:00.000Z';
const meta={requestId:'synthetic-p7',apiVersion:'v1'};
const exportStatus={exportId:id,scope:'FULL_PERSONAL_EXPORT',status:'REQUESTED',format:'ZIP_JSON_HTML',requestedAt:time,completedAt:null,expiresAt:null,failureCode:null,fileSizeBytes:null};
const student={studentId:id,alias:'Student-123456abcdef',status:'ACTIVE',analyticsExclusionCode:null,revision:0,createdAt:time,emailVerifiedAt:time,lastLoginAt:null,profileCount:1,startedMajorCount:0,closedMajorCount:0};
const resolved={from:'2026-08-21T00:00:00Z',to:time,asOf:time,majorCode:null,taskVersionId:null,questionnaireVersion:null,recommendationRuleVersion:null,reportType:null};
const op=name=>operations.find(o=>o.id===name);
const valid=(name,value)=>assert.equal(schemas[name](value),true,name+': '+JSON.stringify(schemas[name].errors));
const invalid=(name,value)=>assert.equal(schemas[name](value),false,name+' unexpectedly accepted invalid shape');

test('P7 composition is reproducible and every route/permission matches real Spring annotations',async()=>{
  assert.equal((await checkP7()).result,'PASS');
  const composed=spawnSync(process.execPath,[new URL('../sync-p7.mjs',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(composed.status,0,composed.stderr);
});
test('settings secrets are not idempotent response data, and success clears sessions with empty 204',()=>{
  valid('EmailChange',{currentPassword:'synthetic current passphrase',newEmail:'new@example.invalid'});
  valid('PasswordChange',{currentPassword:'synthetic current passphrase',newPassword:'synthetic changed passphrase'});
  valid('EmailConfirm',{token:'a'.repeat(43)});
  invalid('PasswordChange',{currentPassword:'example',newPassword:'too-short'});
  invalid('PasswordChange',{currentPassword:'example',newPassword:'synthetic\nchanged passphrase'});
  invalid('EmailChange',{currentPassword:'example',newEmail:'new@example.invalid',studentId:id});
  assert.equal(op('confirmEmailChange').responses['204'],undefined);assert.deepEqual(op('confirmEmailChange').responseMedia['204'],[]);
  assert.equal(op('changeStudentPassword').responses['204'],undefined);
  assert.equal(op('requestEmailChange').responses['202']({data:{accepted:true},meta}),true);
  for(const name of ['requestEmailChange','confirmEmailChange','changeStudentPassword'])assert.ok(!original.paths[op(name).path][op(name).method].parameters.some(p=>p.$ref?.endsWith('/IdempotencyKey')));
});
test('personal list is an items wrapper limited to latest20, never pageable rows or secret storage metadata',()=>{
  valid('PersonalExportStatus',exportStatus);valid('PersonalExportList',{items:[exportStatus]});
  invalid('PersonalExportList',{rows:[exportStatus],total:1});invalid('PersonalExportList',{items:Array(21).fill(exportStatus)});
  for(const extra of [{objectKey:'student/private.zip'},{fileSha256:'a'.repeat(64)},{studentId:id},{downloadUrl:'/private'}])invalid('PersonalExportStatus',{...exportStatus,...extra});
  invalid('PersonalExportStatus',{...exportStatus,status:'REVOKED'});
  assert.equal(op('listPersonalExports').responses['200']({data:{items:[exportStatus]},meta}),true);
});
test('downloads have binary media and reauthentication boundary instead of pretending bytes are JSON',()=>{
  assert.deepEqual(op('downloadPersonalExport').responseMedia['200'],['application/zip']);
  assert.deepEqual(op('downloadAdminExport').responseMedia['200'],['text/csv']);
  assert.equal(op('downloadPersonalExport').responses['200'],undefined);
  const download=original.paths['/api/app/v1/data-export-requests/{id}/download'].get;
  assert.deepEqual(download.security,[{StudentSession:[],CsrfHeader:[]}]);
  assert.equal(download.parameters.find(p=>p.name==='Origin').required,false);
  assert.equal(download.parameters.find(p=>p.name==='Sec-Fetch-Site').required,false);
  assert.match(download.parameters.find(p=>p.name==='Origin').description,/explicit foreign\/null Origin is rejected/);
  for(const path of ['/api/app/v1/me/password','/api/app/v1/data-export-requests']){
    const mutation=original.paths[path][path.endsWith('password')?'patch':'post'];
    assert.ok(mutation.parameters.some(p=>p.$ref==='#/components/parameters/Origin'));
    assert.equal(original.components.parameters.Origin.required,true);
    assert.ok(!mutation.parameters.some(p=>p.name==='Sec-Fetch-Site'));
  }
});
test('receipt is cookie-only and returns safe states/times without identity, internal stage or reason',()=>{
  const receipt={status:'ACTION_REQUIRED',requestedAt:time,confirmedAt:time,scheduledFor:time,completedAt:null,expiresAt:time};valid('DeletionReceipt',receipt);
  for(const extra of [{studentId:id},{receiptId:id},{failureCode:'DELETE_FAILED'},{currentStage:'FILES'},{email:'new@example.invalid'},{receiptSecret:'a'.repeat(43)}])invalid('DeletionReceipt',{...receipt,...extra});
  invalid('DeletionReceipt',{...receipt,status:'FAILED'});
  assert.deepEqual(original.paths['/api/public/v1/deletion-receipts/{id}'].get.security,[{DeletionReceipt:[]}]);
  valid('DeletionStatus',{requestId:id,receiptId:id,status:'REQUESTED',requestedAt:time,confirmedAt:null,scheduledFor:null,completedAt:null,receiptExpiresAt:time});
  invalid('Empty',{receiptSecret:'a'.repeat(43)});
});
test('ordinary pages are strictly safe projections and sensitive content needs its separate operation',()=>{
  valid('StudentPage',{rows:[student],total:1});invalid('StudentRow',{...student,email:'new@example.invalid'});
  invalid('StudentPage',{rows:[student],total:1,passwordHash:'private'});
  invalid('StudentRow',{...student,analyticsExclusionCode:'NONE'});
  valid('AnalyticsExclusion',{expectedRevision:0,exclusionCode:'NONE',reason:'Synthetic analysis reset'});
  invalid('AnalyticsExclusion',{expectedRevision:0.5,exclusionCode:'TEST',reason:'Synthetic test exclusion'});
  valid('SensitiveView',{purpose:'SUPPORT_REQUEST',reason:'Synthetic support request'});
  invalid('SensitiveView',{purpose:'ANYTHING',reason:'Synthetic support request'});
  valid('SensitiveStudent',{studentId:id,email:'new@example.invalid'});
  const page=original.paths['/api/admin/v1/majorpilot/students'].get,sensitive=original.paths['/api/admin/v1/majorpilot/students/{id}/sensitive-view'].post;
  assert.deepEqual(page['x-required-permissions'],['majorpilot:student:view']);assert.deepEqual(sensitive['x-required-permissions'],['majorpilot:student:sensitive']);
});
test('report pages preserve scopeNotes and separate legacy array route',()=>{
  valid('ReportPage',{rows:[],total:0,scopeNotes:['Synthetic scope note']});invalid('ReportPage',{rows:[],total:0});
  assert.equal(op('adminListReports').responses['200']({data:[],meta}),true);
  assert.equal(op('pageReports').responses['200']({data:[],meta}),false);
  valid('Filters',{reportType:'COMPARISON'});invalid('Filters',{reportType:'COMPARISON',majorCode:'AI'});
  valid('Filters',{reportType:'EXPERIENCE',majorCode:'AI'});
});
test('version review projection is read-only and rejects traversal/unknown checks in its metadata shape',()=>{
  valid('TaskReviewContext',{taskVersionId:id,manifestPath:'ai-learning/1.0.0/manifest.json',requiredReviewChecks:['PROFESSIONAL_CORE','TIMING_45_60'],status:'REVIEW',revision:0});
  for(const path of ['/etc/manifest.json','a/../manifest.json','a//manifest.json','https://example.invalid/manifest.json'])invalid('TaskReviewContext',{taskVersionId:id,manifestPath:path,requiredReviewChecks:['TIMING_45_60'],status:'REVIEW',revision:0});
  assert.deepEqual(original.paths['/api/admin/v1/majorpilot/task-versions/{id}/review-context'].get['x-required-permissions'],['majorpilot:task:view']);
});
test('admin CSV requests enforce per-dataset fields, purpose, units and no raw personal data',()=>{
  valid('AdminExportCreate',{dataset:'STUDENTS',purpose:'Synthetic product analysis'});
  valid('AdminExportCreate',{dataset:'METRICS',purpose:'Synthetic product analysis',fields:['numerator','denominator','rate'],filters:{majorCode:'AI'}});
  valid('AdminExportCreate',{dataset:'REPORTS',purpose:'Synthetic product analysis',filters:{reportType:'COMPARISON'}});
  for(const patch of [{fields:['email']},{fields:['alias','alias']},{fields:[]},{purpose:'short'},{filters:{reportType:'COMPARISON'}},{studentId:id}])invalid('AdminExportCreate',{dataset:'STUDENTS',purpose:'Synthetic product analysis',...patch});
  invalid('AdminExportCreate',{dataset:'REPORTS',purpose:'Synthetic product analysis',filters:{reportType:'COMPARISON',taskVersionId:id}});
  const status={exportId:id,dataset:'STUDENTS',schemaVersion:'admin-csv-v1',filters:resolved,fields:['alias','status'],timeAnchor:'STUDENT_CREATED_AT',status:'READY',rowCount:2,fileSizeBytes:123,requestedAt:time,completedAt:time,expiresAt:time,failureCode:null,revision:2,scopeNotes:['Synthetic scope note']};valid('AdminExportStatus',status);
  for(const patch of [{rowCount:10001},{schemaVersion:'latest'},{fields:['email']},{timeAnchor:'RUN_STARTED_AT'},{objectKey:'admin/internal.csv'}])invalid('AdminExportStatus',{...status,...patch});
  valid('AdminExportStatus',{...status,status:'REVOKED'});
});
test('metrics preserve denominator-zero unknown, exact anchors/windows and no guessed targets',()=>{
  const first={numerator:0,denominator:0,rate:null,cohortCount:3,immatureCount:3,anchor:'FIRST_FORMAL_RECOVERY_CHAIN_STARTED_AT',windowDays:7};valid('FirstCompletionKpi',first);
  invalid('FirstCompletionKpi',{...first,rate:0});invalid('FirstCompletionKpi',{...first,windowDays:14});invalid('FirstCompletionKpi',{...first,target:0.8});
  valid('FirstCompletionKpi',{...first,numerator:2,denominator:3,rate:0.666667,immatureCount:0});
  invalid('FirstCompletionKpi',{...first,numerator:2,denominator:3,rate:null});
  valid('FeedbackCoverage',{numerator:0,denominator:0,rate:null,answeredWithoutViewed:1,unobservedReportCount:2});
  invalid('FeedbackCoverage',{numerator:1,denominator:1,rate:1.2,answeredWithoutViewed:0,unobservedReportCount:0});
});
test('current health keeps unknown costs null and does not present the technical cohort as formal KPI',()=>{
  const health={checkedAt:time,jobs:[],safeErrors:[],overdueDeletionCount:0,reportReadyVersionCount:0,reportFallbackVersionCount:0,unknownCostCalls:1,knownEstimatedCost:null,retention:[],coverageNotes:['Synthetic current technical status; not formal KPI population.']};valid('OperationsHealth',health);
  invalid('OperationsHealth',{...health,knownEstimatedCost:-1});invalid('OperationsHealth',{...health,rawProviderResponse:'secret'});
  valid('ExecutionSummary',{operationKey:'ds-profile',status:'TIMED_OUT',trustLevel:'CLIENT_OBSERVED',errorCode:'EXECUTION_TIMEOUT',count:1});
  invalid('ExecutionSummary',{operationKey:'ds-profile',status:'RUNNING',trustLevel:'CLIENT_REPORTED',errorCode:null,count:1});
});
test('step/resume observation properties and receiving-clock semantics cannot be forged into facts',()=>{
  const base={clientEventId:'00000000-0000-4000-8000-000000000001',eventVersion:'v1',occurredAt:time,contextPublicId:id,visibleDurationMs:1000};
  const step={...base,eventName:'experience.step.viewed',contextType:'EXPERIENCE_RUN',properties:{stepKey:'d1-context'}};valid('PageObservation',step);
  valid('PageObservation',{...step,eventName:'experience.run.resumed',properties:{stepKey:'d1-context',inactivityBucket:'MINUTES_10_60'}});
  for(const patch of [{visibleDurationMs:999},{visibleDurationMs:'1000'},{visibleDurationMs:1000.1},{studentId:id},{eventName:'experience.run.started'},{contextType:'REPORT_VERSION'},{properties:{stepKey:'d1-context',majorCode:'DATA_SCIENCE'}},{properties:{}}])invalid('PageObservation',{...step,...patch});
  invalid('PageObservation',{...step,eventName:'experience.run.resumed'});
  valid('PageObservation',{...base,eventName:'report.viewed',contextType:'REPORT_VERSION'});
  invalid('PageEvents',{events:Array(21).fill(step)});valid('PageEvents',{events:[step]});
});
test('schema property inventories track Java public DTO fields, not raw persistence rows',()=>{
  const groups={
    'operations/OperationsDtos.java':{StudentRow:'StudentRow',RunRow:'RunRow',ReportRow:'ReportRow',ReportPage:'ReportPage',TaskRow:'TaskRow',TaskReviewContext:'TaskReviewContext',AuditRow:'AuditRow',Exclusion:'AnalyticsExclusion',SensitiveView:'SensitiveView',ExportStatus:'AdminExportStatus',ConsentSummary:'ConsentSummary',ProfileSummary:'ProfileSummary',StudentDetails:'StudentDetails',StudentDetail:'StudentDetail',StepSummary:'StepSummary',ExecutionSummary:'ExecutionSummary',RunDetails:'RunDetails',RunDetail:'RunDetail',SensitiveStudent:'SensitiveStudent',ResponseRevision:'ResponseRevision',SensitiveRun:'SensitiveRun',JobCount:'JobCount',SafeError:'SafeErrorCount',Retention:'RetentionStatus',Health:'OperationsHealth'},
    'privacy/PrivacyDtos.java':{ExportRequest:'PersonalExportRequest',ExportStatus:'PersonalExportStatus',EmailChange:'EmailChange',EmailConfirm:'EmailConfirm',PasswordChange:'PasswordChange',DeletionConfirm:'DeletionConfirm',DeletionStatus:'DeletionStatus',Receipt:'DeletionReceipt'},
    'analytics/metrics/MetricsModels.java':{Filters:'MetricFilters',Coverage:'FeedbackCoverage',SecondTiming:'SecondStartTiming',Core:'CoreMetrics',MajorBreakdown:'MajorBreakdown',ComparisonBreakdown:'ComparisonBreakdown',Stage:'FunnelStage',Funnel:'Funnel',StepDiagnostic:'StepDiagnostic',TaskFunnel:'TaskFunnel',Exclusions:'MetricExclusions',Diagnostics:'MetricDiagnostics'},
  };
  for(const[file,mapping]of Object.entries(groups)){
    const java=readFileSync(new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/'+file,import.meta.url),'utf8');
    for(const[record,schema]of Object.entries(mapping)){
      const members=java.match(new RegExp('record '+record+'\\(([^)]*)\\)'))?.[1];assert.ok(members,record);
      const names=members.split(',').map(part=>part.trim().split(/\s+/).at(-1)).sort();
      assert.deepEqual(Object.keys(original.components.schemas[schema].properties).sort(),names,file+' '+record);
    }
  }
});
test('safe error permits currentRevision but rejects hidden error context',()=>{
  const error={error:{code:'STUDENT_REVISION_CONFLICT',message:'Request could not be completed',fieldErrors:[],retryable:false,details:{currentRevision:2}},meta:{requestId:'synthetic-p7'}};valid('Error',error);
  invalid('Error',{...error,error:{...error.error,rawSql:'private'}});
  invalid('Error',{...error,error:{...error.error,details:{currentRevision:2,email:'private@example.invalid'}}});
});
