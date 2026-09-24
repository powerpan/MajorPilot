// Offline release evidence check. It does not call a provider or certify human comprehension.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROOT} from './local-config.mjs';
export const reviewedHash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const inputHash=input=>reviewedHash(canonical(input));
export function verifyQualityRecord(output,review,{caseId,promptVersion,model,inputSha256}){
  assert.equal(output.case,caseId);assert.equal(output.syntheticOnly,true);assert.equal(output.structuralResult,'PASS');
  assert.equal(output.promptVersion,promptVersion);assert.equal(output.provider,'BAILIAN');assert.equal(output.model,model);assert.ok(output.reviewed&&output.publicAnalysis);
  assert.equal(output.inputSha256,inputSha256,'Quality output must match the current synthetic input');
  assert.ok(output.calls.length>=2&&output.calls.length<=3);assert.equal(output.calls[0].stage,'INITIAL');assert.equal(output.calls.at(-1).stage,'REVIEW');
  if(output.calls.length===3)assert.equal(output.calls[1].stage,'REPAIR');
  assert.ok(output.calls.every(c=>c.error===null));
  if(output.reusedDraftFrom){
    const reused=output.reusedDraftFrom;
    assert.equal(promptVersion,'method-report-prompt-v9');assert.ok(['method-report-prompt-v6','method-report-prompt-v7','method-report-prompt-v8'].includes(reused.promptVersion));
    assert.ok(['method-report-prompt-v6','method-report-prompt-v7','method-report-prompt-v8'].includes(reused.initialPromptVersion));
    assert.equal(reused.initialPipelineSha256,'e04115c8d7ce4b4efff2579a43b6c9438c7ba2cf7bc0ba5e8e34a9ca3c480341');
    assert.match(reused.canonicalOutputSha256,/^[a-f0-9]{64}$/);assert.equal(reused.draftSha256,inputHash(output.draft));
    assert.equal(reused.newRequestBudget,1);assert.ok(reused.priorCompletedRequests>=output.calls.length-1&&reused.priorCompletedRequests<=3);
    assert.ok(output.calls.slice(0,-1).every(c=>c.promptVersion===reused.initialPromptVersion));
    assert.equal(output.calls.at(-1).promptVersion,promptVersion);
  }else assert.ok(output.calls.every(c=>c.promptVersion===promptVersion));
  assert.equal(review.result,'PASS');assert.equal(review.reviewer,'AGENT');assert.equal(review.case,caseId);
  assert.equal(review.promptVersion,promptVersion);assert.equal(review.model,model);assert.equal(review.inputSha256,output.inputSha256);
  assert.equal(review.reviewedSha256,reviewedHash(output.reviewed));assert.ok(typeof review.notes==='string'&&review.notes.length>=20);
  return {case:caseId,requests:output.calls.length,newRequests:output.reusedDraftFrom?1:output.calls.length,reusedDraft:Boolean(output.reusedDraftFrom),structural:'PASS',agentCoreExpectationReview:'PASS',semanticCertainty:false,humanComprehension:'NOT_RUN'};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  assert.equal(process.argv.length,2,'No alternate provider or case omissions accepted for the local release gate');
  const contract=readFileSync(`${ROOT}/backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/learning/MethodReportContract.java`,'utf8');
  const promptVersion=contract.match(/PROMPT="([^"]+)"/)?.[1];assert.ok(promptVersion);
  const read=p=>JSON.parse(readFileSync(`${ROOT}/data/method-quality/${p}`,'utf8'));
  const results=Array.from({length:15},(_,index)=>{const caseId='Q'+String(index+1).padStart(2,'0'),fixture=read(`cases/${caseId}.json`);assert.equal(fixture.syntheticOnly,true);return verifyQualityRecord(read(`outputs/${caseId}.json`),read(`agent-reviews/${caseId}.json`),{caseId,promptVersion,model:'qwen3.8-max-0902',inputSha256:inputHash(fixture.input)});});
  console.log(JSON.stringify({result:'PASS',promptVersion,model:'qwen3.8-max-0902',cases:results,humanReview:false,paidCalls:0}));
}
