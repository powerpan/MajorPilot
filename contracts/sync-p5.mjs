// Mechanical synchronization of shared wire schemas; old request bodies remain valid.
// This is source generation only: no environment, network, database, or model calls.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const write = process.argv.includes('--write');
assert.ok(process.argv.slice(2).every(value => value === '--write'));
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const revision = { type: 'integer', minimum: 1 };
const ratio = { anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'null' }] };
const keys = ['enrolled_count', 'first_lesson_count', 'week_one_active_count', 'assignment_started_count', 'assignment_submitted_count', 'completed_count'];
const transitions = ['ENROLLED_TO_FIRST_LESSON', 'FIRST_LESSON_TO_WEEK_ONE_ACTIVE', 'WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED', 'ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED', 'ASSIGNMENT_SUBMITTED_TO_COMPLETED'];
const shared = {
  BaParameters: object({
    numerator: { const: 'completed_count' }, denominator: { enum: ['enrolled_count', 'first_lesson_count'] },
    ...Object.fromEntries(['baselineStartWeek', 'baselineEndWeek', 'comparisonStartWeek', 'comparisonEndWeek'].map(key => [key, { type: 'integer', minimum: 1, maximum: 12 }])),
    focusTransitionKey: { enum: transitions }, segmentBy: { enum: ['course_track', 'signup_source'] },
  }),
  BaRatio: object({ numeratorCount: integer, denominatorCount: integer, rate: ratio }),
  BaTransition: object({ numeratorCount: integer, denominatorCount: integer, conversionRate: ratio, lossCount: integer }),
  BaSegmentPeriod: object({
    stageCounts: object(Object.fromEntries(keys.map(key => [key, integer]))), enrolledShare: ratio,
    metric: ref('BaRatio'), focusTransition: ref('BaTransition'), supportContactCount: integer,
    supportContactsPer100Enrolled: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] },
  }),
  BaActionSourceRevisions: object(Object.fromEntries(['b2-metric', 'b3-funnel', 'b4-segment'].map(key => [key, revision]))),
  BaActionContext: object({
    parameters: ref('BaParameters'), prioritySegmentKey: { enum: ['FOUNDATIONS', 'APPLIED', 'ORGANIC', 'PARTNER', 'CAMPAIGN'] },
    comparison: ref('BaSegmentPeriod'), sourceRevisions: ref('BaActionSourceRevisions'),
  }),
  StepCompletion: object({ expectedRevision: { type: 'integer', minimum: 0 }, expectedSourceRevisions: ref('SourceRevisions') }, ['expectedRevision']),
};
const apis = new Map();
for (const milestone of [2, 3, 4]) {
  const file = new URL(`./openapi-p${milestone}.json`, import.meta.url);
  const api = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(api.components.schemas, structuredClone(shared));
  api.components.schemas.Run.properties.experienceEdition = {type:'integer',minimum:2,maximum:2};
  api.components.schemas.PublicManifest.properties.schemaVersion.enum = ['task-manifest-v1','task-manifest-v2','task-manifest-v3','task-manifest-v4','task-manifest-v5'];
  // Post-P7 owner-authorized local product flow is an additive wire change.
  // Historical receipts may omit it; explicit null also means no affirmative grant.
  api.components.schemas.Run.properties.productEligible = {
    anyOf: [{ type: 'boolean' }, { type: 'null' }],
    description: 'Server-derived product eligibility. Optional for legacy receipts; only true admits a historical REVIEW_PREVIEW to the product report flow. Does not rewrite runMode or prove expert review/public release.',
  };
  api.components.schemas.Run.properties.reportStatus.enum = ['NOT_APPLICABLE', 'NOT_REQUESTED', 'PENDING', 'GENERATING', 'READY', 'FAILED'];
  api.components.schemas.Step.properties.baActionContext = ref('BaActionContext');
  api.components.schemas.Error.properties.error.properties.details.properties.currentSourceRevisions = ref('SourceRevisions');
  api.components.schemas.PublicManifest.properties.schemaVersion.enum = ['task-manifest-v1', 'task-manifest-v2', 'task-manifest-v3', 'task-manifest-v4'];
  api.paths['/api/app/v1/experience-runs/{id}/steps/{stepKey}/complete'].post.requestBody.content['application/json'].schema = ref('StepCompletion');
  apis.set(milestone, api);
}
const p5 = structuredClone(apis.get(4));
p5.info = {
  title: 'MajorPilot P5 local Business Analytics experience API', version: '5.0.0',
  description: 'AI, DS and BA share one run engine. BA uses saved v4 bindings, three fixed server-verified aggregate operations, 30 successful configurations per operation, and explicit B6 action-context source CAS. REVIEW_PREVIEW is not publication and creates no formal NEXT or reports. Normal validation makes zero paid calls.',
};
p5.components.schemas.ExecuteBA = structuredClone(p5.components.schemas.ExecuteDS);
p5.components.schemas.ExecuteBA.properties.operationKey.enum = ['ba-metric', 'ba-funnel', 'ba-segments'];
p5.components.schemas.ExecuteBA.description = 'Strict v4 BA execution. Saved bindings are authoritative; an empty own binding list is valid for ba-funnel. The shared endpoint preserves legacy request compatibility.';
p5.components.schemas.ExecuteBA.properties.expectedSourceRevisions.description = 'Required for v4, including {} when there are no ancestors. Exactly the saved source revisions consumed by this operation.';
p5.components.schemas.CompleteBAAction = object({ expectedRevision: { type: 'integer', minimum: 1 }, expectedSourceRevisions: ref('BaActionSourceRevisions') });
apis.set(5, p5);
for (const [milestone, api] of apis) {
  const file = new URL(`./openapi-p${milestone}.json`, import.meta.url), expected = JSON.stringify(api, null, 2) + '\n';
  if (write) writeFileSync(file, expected);
  else assert.ok(existsSync(file) && readFileSync(file, 'utf8') === expected, `openapi-p${milestone}.json drift; run contracts/sync-p5.mjs --write`);
}
console.log(JSON.stringify({ result: 'PASS', scope: 'P5 mechanical shared task API synchronization', mode: write ? 'write' : 'check', paidCalls: 0 }));
