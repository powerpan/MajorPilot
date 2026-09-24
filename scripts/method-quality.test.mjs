import test from 'node:test';
import assert from 'node:assert/strict';
import {inputHash,reviewedHash,verifyQualityRecord} from './check-method-quality.mjs';
const expected={caseId:'Q01',promptVersion:'version',model:'model',inputSha256:'input'};
function fixture(){const output={case:'Q01',syntheticOnly:true,structuralResult:'PASS',promptVersion:'version',provider:'BAILIAN',model:'model',inputSha256:'input',reviewed:{summary:'synthetic'},publicAnalysis:{},calls:[{stage:'INITIAL',promptVersion:'version',error:null},{stage:'REVIEW',promptVersion:'version',error:null}]};const review={case:'Q01',result:'PASS',reviewer:'AGENT',promptVersion:'version',model:'model',inputSha256:'input',reviewedSha256:reviewedHash(output.reviewed),notes:'A bounded agent review, not a human comprehension test.'};return {output,review};}
test('quality release gate pins the actual reviewed output and distinguishes bounded agent review from certainty or human testing',()=>{const {output,review}=fixture();const result=verifyQualityRecord(output,review,expected);assert.equal(result.humanComprehension,'NOT_RUN');assert.equal(result.agentCoreExpectationReview,'PASS');assert.equal(result.semanticCertainty,false);});
test('quality release gate cannot reuse old models, prompts, inputs or unreviewed drafts',()=>{
  for(const patch of [{provider:'other'},{model:'other'},{promptVersion:'old'},{inputSha256:'changed'},{structuralResult:'FAIL'},{reviewed:null},{calls:[{stage:'INITIAL',error:null}]},{calls:[{stage:'INITIAL',promptVersion:'version',error:null},{stage:'INITIAL',promptVersion:'version',error:null},{stage:'REVIEW',promptVersion:'version',error:null}]}]){const {output,review}=fixture();assert.throws(()=>verifyQualityRecord({...output,...patch},review,expected));}
  for(const patch of [{result:'FAIL'},{reviewer:'MODEL_SELF_REPORT'},{reviewedSha256:'wrong'},{notes:''}]){const {output,review}=fixture();assert.throws(()=>verifyQualityRecord(output,{...review,...patch},expected));}
  const {output,review}=fixture();assert.throws(()=>verifyQualityRecord(output,review,{...expected,inputSha256:'new fixture'}));
});
test('input hashes preserve array order but canonicalize nested object keys',()=>{
  assert.equal(inputHash({z:{b:2,a:1},a:[1,2]}),inputHash({a:[1,2],z:{a:1,b:2}}));
  assert.notEqual(inputHash({a:[1,2]}),inputHash({a:[2,1]}));
});
test('v6/v7/v8 draft reuse requires an unchanged initial pipeline, exact draft hash and a new v9 independent review',()=>{
  const {output,review}=fixture(),version='method-report-prompt-v9';output.promptVersion=version;review.promptVersion=version;
  output.draft={summary:'retained original draft'};output.calls[0].promptVersion='method-report-prompt-v6';output.calls[1].promptVersion=version;
  output.reusedDraftFrom={promptVersion:'method-report-prompt-v7',initialPromptVersion:'method-report-prompt-v6',initialPipelineSha256:'e04115c8d7ce4b4efff2579a43b6c9438c7ba2cf7bc0ba5e8e34a9ca3c480341',canonicalOutputSha256:'a'.repeat(64),draftSha256:inputHash(output.draft),priorCompletedRequests:2,newRequestBudget:1};
  assert.equal(verifyQualityRecord(output,review,{...expected,promptVersion:version}).newRequests,1);
  for(const patch of [{draftSha256:'other'},{initialPipelineSha256:'other'},{newRequestBudget:0},{promptVersion:'other'},{initialPromptVersion:'other'},{canonicalOutputSha256:'missing'},{priorCompletedRequests:0}])assert.throws(()=>verifyQualityRecord({...output,reusedDraftFrom:{...output.reusedDraftFrom,...patch}},review,{...expected,promptVersion:version}));
  output.calls[1].promptVersion='method-report-prompt-v6';assert.throws(()=>verifyQualityRecord(output,review,{...expected,promptVersion:version}));
});
