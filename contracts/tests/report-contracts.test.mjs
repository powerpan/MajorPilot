import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
const report = ajv.compile(read('../schemas/report-v1.json'));
const proposal = ajv.compile(read('../schemas/report-proposal-v1.json'));
const examples = new Map(readdirSync(new URL('../examples/reports/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => [f, read(`../examples/reports/${f}`)]));
const sections = ['OVERVIEW','WHAT_YOU_DID','EXPERIENCE_PREFERENCE','CURRENT_PREPARATION','TASK_PERFORMANCE','WORK_STYLE_CONNECTION','EVIDENCE_BOUNDARIES','OTHER_MAJOR_DIFFERENCES','NEXT_EXPERIENCE'];
const dimensions = ['PROBLEM_INTEREST','QUANTITATIVE_COMFORT','UNCERTAINTY_HANDLING','WORK_FOCUS','HELP_AND_ITERATION','EXPLANATION_INTEREST','CONTINUATION_WILLINGNESS'];
test('eight actual Java rendered report goldens satisfy the public contract and size bound', () => {
  assert.equal(examples.size, 8);
  for (const [name, value] of examples) {
    assert.ok(report(value), `${name}: ${JSON.stringify(report.errors)}`);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 131072);
    if (value.reportType === 'EXPERIENCE') { assert.deepEqual(value.sections.map(s => s.sectionKey), sections); const actions = value.sections[1].claims; assert.ok(actions.length >= 3 && actions.length <= 5); }
    for (const section of value.sections) for (const claim of section.claims) {
      assert.ok([...claim.text].length <= 400); assert.ok([...claim.basisSummary].length <= 300);
      assert.equal(claim.confidence, { OBSERVED_FACT:'DIRECT',STUDENT_SELF_REPORT:'SELF_REPORTED',BOUNDED_INTERPRETATION:'BOUNDED',LIMITATION:'RULE_BASED',NEXT_STEP:'RULE_BASED' }[claim.claimType]);
    }
    const raw = JSON.stringify(value); for (const denied of ['PRIVATE_SENTINEL','snapshotId','evidenceIds','statementKey','profileSha256','<script>','https://']) assert.ok(!raw.includes(denied), `${name}: ${denied}`);
  }
});
test('bounded has a positive normal path while fallback excludes it; 7×source dimensions remain complete', () => {
  for (const [name, value] of examples) {
    const claims = value.sections.flatMap(s => s.claims);
    if (name.includes('fallback')) { assert.ok(!claims.some(c => c.claimType === 'BOUNDED_INTERPRETATION')); assert.ok(value.limitations.some(t => t.includes('部分个性化解释暂不可用'))); }
    else assert.ok(claims.some(c => c.claimType === 'BOUNDED_INTERPRETATION'));
    if (value.reportType === 'COMPARISON') {
      const majors = value.sources.map(s => s.majorCode); const cells = value.sections.find(s => s.sectionKey === 'COMMON_DIMENSIONS').claims;
      assert.deepEqual(cells.map(c => [c.dimensionKey,c.majorCode]), dimensions.flatMap(d => majors.map(m => [d,m])));
      assert.ok(cells.some(c => c.claimType === 'LIMITATION' && c.text.includes('尚无足够证据')));
      assert.ok(value.sources.every(s => s.sourceReport && !('currentReadable' in s.sourceReport) && !('isCurrent' in s.sourceReport)));
    }
  }
});
test('report schema rejects unknown fields, numeric coercion, invalid enum and overlength text', () => {
  const base = examples.get('ai.json');
  for (const mutate of [v => { v.versionNo = '1'; }, v => { v.versionNo = 1.5; }, v => { v.hidden = 'raw'; }, v => { v.sections[0].claims[0].evidenceIds = ['internal']; }, v => { v.sections[0].claims[0].confidence = 'HIGH'; }, v => { v.sections[0].claims[0].text = '字'.repeat(401); }, v => { v.nextRecommendation.primaryMajor = 'UNKNOWN'; }]) { const value = structuredClone(base); mutate(value); assert.equal(report(value), false); }
});
test('proposal schema has only section and whitelisted selection identifiers, not student visible prose', () => {
  const value = { schemaVersion:'report-proposal-v1', reportType:'EXPERIENCE', sections:sections.map(sectionKey => ({sectionKey,selections:[{statementKey:`AI:${sectionKey}:slot`,phrasingKey:'standard'}]})) };
  assert.ok(proposal(value));
  for (const mutate of [v => { v.text = 'fiction'; }, v => { v.sections[0].selections[0].text = 'fiction'; }, v => { v.sections[0].selections[0].evidenceIds = []; }, v => { v.sections[0].selections[0].statementKey = '<script>'; }, v => { v.sections[0].selections[0].phrasingKey = 1; }]) { const changed=structuredClone(value); mutate(changed); assert.equal(proposal(changed),false); }
});
