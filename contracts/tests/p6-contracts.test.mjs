import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkP6,loadP6Contracts } from '../check-p6.mjs';
const {schemas,original,operations}=await loadP6Contracts();
const id='01JF1000000000000000000001';
test('P6 exposes fifteen private operations with exact Student/Operator permission boundary',async()=>{
  assert.equal((await checkP6()).result,'PASS');
  assert.ok(operations.every(operation=>operation.path.startsWith('/api/app/v1/')||operation.path.startsWith('/api/admin/v1/majorpilot/')));
  const sensitive=original.paths['/api/admin/v1/majorpilot/reports/{id}/versions/{version}'].get;
  assert.deepEqual(sensitive['x-required-permissions'],['majorpilot:report:history:view','majorpilot:report:sensitive:view']);
  assert.ok(!Object.keys(original.paths).some(path=>path.startsWith('/api/app/')&&path.includes('/versions/')));
  const events=original.paths['/api/app/v1/events'].post;
  assert.ok(!events.parameters.some(parameter=>parameter.$ref?.endsWith('/IdempotencyKey')));
  assert.deepEqual(events.security,[{StudentSession:[],CsrfHeader:[]}]);
});
test('published Java golden, pending and comparison are distinct strict response shapes',()=>{
  const report=JSON.parse(readFileSync(new URL('../examples/reports/ai.json',import.meta.url)));
  assert.ok(schemas.Report(report),JSON.stringify(schemas.Report.errors));
  assert.ok(schemas.ReportStatus({reportId:id,status:'PENDING',currentVersionId:null,generation:null,revision:0}));
  assert.equal(schemas.ReportStatus(report),false);
  assert.equal(schemas.ComparisonReady({state:'READY',report,generation:null,rawEvidence:[]}),false);
  assert.equal(schemas.Report({...report,internalId:1}),false);
});
test('feedback rejects fractional ratings, unknown properties, foreign shapes and empty survey',()=>{
  const base={feedbackType:'REPORT',contextType:'REPORT_VERSION',contextPublicId:id,surveyVersion:'report-value-v1',answers:{insightResponse:5}};
  assert.ok(schemas.Feedback(base),JSON.stringify(schemas.Feedback.errors));
  for(const value of [{...base,rating:1.5},{...base,rating:'5'},{...base,answers:{}},{...base,contextType:'EXPERIENCE_RUN'},{...base,studentId:id},{...base,comment:'字'.repeat(1001)},{feedbackType:'GENERAL'}])assert.equal(schemas.Feedback(value),false);
  assert.ok(schemas.Feedback({feedbackType:'GENERAL',comment:'可选反馈'}));
});
test('explicit evidence rebuilding requires a registered new rule and reuse cannot smuggle one',()=>{
  const base={expectedRevision:0,reasonCode:'RULE_UPDATE',reason:'这是一条明确的合成重生成理由。',evidenceMode:'REBUILD_EVIDENCE',targetEvidenceRuleVersion:'evidence-v3'};
  assert.ok(schemas.Regenerate(base));
  assert.equal(schemas.Regenerate({...base,targetEvidenceRuleVersion:undefined}),false);
  assert.equal(schemas.Regenerate({...base,targetEvidenceRuleVersion:'latest'}),false);
  assert.equal(schemas.Regenerate({...base,evidenceMode:'REUSE_READY_EVIDENCE'}),false);
  assert.ok(schemas.Regenerate({...base,evidenceMode:'REUSE_READY_EVIDENCE',targetEvidenceRuleVersion:null}));
});
