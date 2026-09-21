// Post-P7 user-feedback contract overlay. Mechanical generation only; no runtime writes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const write = process.argv.includes('--write');
assert.ok(process.argv.slice(2).every(argument => argument === '--write'));
const p5 = JSON.parse(readFileSync(new URL('./openapi-p5.json', import.meta.url), 'utf8'));
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const id = { type: 'string', pattern: '^[0-7][0-9A-HJKMNP-TV-Z]{25}$' };
const sha = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 0 };
const authorizationReference = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$' };
const reasonText = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' };
const schemas = {};
function inherit(name) {
  if (Object.hasOwn(schemas, name)) return;
  schemas[name] = structuredClone(p5.components.schemas[name]);
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.$ref) inherit(node.$ref.replace('#/components/schemas/', ''));
    for (const child of Object.values(node)) visit(child);
  };
  visit(schemas[name]);
}
for (const name of ['Meta', 'Error', 'Run']) inherit(name);
Object.assign(schemas, {
  LocalProductRelease: object({ expectedRevision: revision, manifestSha256: sha, authorizationReference, reasonText }),
  LocalProductReleaseAccepted: object({ authorizationId: id, taskVersionId: id, reviewStatus: { const: 'REVIEW' }, availability: { const: 'AVAILABLE' } }),
  ProductAdoption: object({ expectedRevision: revision, closedInputSha256: sha, evidenceSnapshotId: id, authorizationReference, reasonText }),
  ProductAdoptionAccepted: object({ authorizationId: id, runId: id, originalRunMode: { const: 'REVIEW_PREVIEW' }, productEligible: { const: true }, reportId: id, reportStatus: { enum: ['PENDING', 'GENERATING', 'READY', 'FAILED'] } }),
});
const api = {
  openapi: '3.1.0',
  info: {
    title: 'MajorPilot post-P7 local product flow amendment', version: '7.1.0',
    description: 'Explicit project-owner-authorized local acceptance only, not P8 or public deployment. Exact version release keeps REVIEW and missing human checks unchanged. Exact CLOSED preview adoption preserves original Run, answers, timestamps and immutable evidence; a separate audited grant admits only that Run into reports/recommendations. No blanket preview conversion.',
  },
  servers: [{ url: 'http://localhost:18080', description: 'Managed local profile; MP_LOCAL_PRODUCT_ENABLED must be explicitly enabled' }],
  paths: {}, components: { schemas, securitySchemes: { AdminBearer: structuredClone(p5.components.securitySchemes.AdminBearer) } },
};
function operation(path, operationId, request, response, permissions, description, errors) {
  api.paths[path] = { post: {
    operationId, description, security: [{ AdminBearer: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: id }],
    requestBody: { required: true, content: { 'application/json': { schema: ref(request) } } },
    responses: {
      '200': { description: 'Audited local authorization; same matching authorization may be retried without creating a second grant.', content: { 'application/json': { schema: object({ data: ref(response), meta: ref('Meta') }) } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 422, 500, 503].map(status => [String(status), { description: 'Safe error envelope; schema validity does not establish runtime enforcement.', content: { 'application/json': { schema: ref('Error') } } }])),
    },
    'x-required-permissions': permissions,
    'x-permission-combination': 'ALL',
    'x-spring-profile': 'local',
    'x-feature-flag': 'MP_LOCAL_PRODUCT_ENABLED',
    'x-retry-policy': 'Pinned revision, digest and authorizationReference must still match; no Idempotency-Key requirement.',
    'x-safe-error-codes': ['LOCAL_PRODUCT_DISABLED', 'VALIDATION_ERROR', 'AUTHORIZATION_REQUIRED', 'AUTHORIZATION_CONFLICT', ...errors],
  } };
}
operation('/api/admin/v1/majorpilot/task-versions/{id}/local-product-release', 'authorizeLocalProductRelease', 'LocalProductRelease', 'LocalProductReleaseAccepted', ['majorpilot:task:publish'], 'Pin the exact ACTIVE Major REVIEW version and manifest hash for owner-authorized local product starts. Does not mark PUBLISHED, fill review checks or authorize public deployment.', ['CONTENT_UNAVAILABLE', 'REVISION_CONFLICT', 'CONTENT_STATE_CONFLICT', 'CONTENT_VERSION_IMMUTABLE']);
operation('/api/admin/v1/majorpilot/experience-runs/{id}/product-adoption', 'adoptClosedPreviewForProduct', 'ProductAdoption', 'ProductAdoptionAccepted', ['majorpilot:recovery:create', 'majorpilot:report:regenerate'], 'Accept only the exact ACTIVE Student-owned CLOSED MAJOR REVIEW_PREVIEW, valid Decision Profile and READY owned Evidence Snapshot with matching frozen closure digest and released Task Version. Preserves original runMode and source facts, refuses another active product Run of the same Major, and initializes the actual private report/next pipeline. A new adoption is refused with HTTP409 PRODUCT_ADOPTION_ORDER_CONFLICT if that Student already has another CLOSED product Run, preventing retroactive distortion of immutable NEXT chronology. An existing matching adoption remains retryable after later Major completions; this chronology guard applies only when creating a new grant.', ['RESOURCE_NOT_FOUND', 'ACCOUNT_LOCKED', 'RUN_REVISION_CONFLICT', 'PRODUCT_ADOPTION_INVALID', 'PRODUCT_ADOPTION_ORDER_CONFLICT', 'EVIDENCE_SOURCE_INVALID', 'LOCAL_RELEASE_REQUIRED', 'MAJOR_ALREADY_STARTED']);
const target = new URL('./openapi-product-flow.json', import.meta.url), expected = JSON.stringify(api, null, 2) + '\n';
if (write) writeFileSync(target, expected);
else assert.equal(readFileSync(target, 'utf8'), expected, 'Post-P7 drift: run node contracts/sync-product-flow.mjs --write');
console.log(JSON.stringify({ result: 'PASS', scope: 'post-P7 local product flow contract composition; not P8', mode: write ? 'write' : 'check', paidCalls: 0 }));
