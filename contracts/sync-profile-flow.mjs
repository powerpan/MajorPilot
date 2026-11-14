// Additive November 2026 profile/skip contract. Static composition only; no service or model calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const write = process.argv.includes('--write');
assert.ok(process.argv.slice(2).every(argument => argument === '--write'));
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const p1 = read('./openapi-p1.json');
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const revision = { type: 'integer', minimum: 0 };
const id = { type: 'string', pattern: '^[0-7][0-9A-HJKMNP-TV-Z]{25}$' };
const step = { type: 'string', pattern: '^step-([1-9]|1[0-2])$' };
const schemas = {};
function inherit(name) {
  if (schemas[name]) return;
  assert.ok(p1.components.schemas[name], `Unknown P1 schema ${name}`);
  schemas[name] = structuredClone(p1.components.schemas[name]);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) inherit(value.$ref.replace('#/components/schemas/', ''));
    for (const child of Object.values(value)) visit(child);
  };
  visit(schemas[name]);
}
for (const name of ['Meta', 'Error', 'DraftAnswers', 'QuestionnaireVersion', 'Recommendation']) inherit(name);
schemas.Error.properties.error.properties.details.properties.currentProfileVersion = revision;
const profileFields = Object.keys(p1.components.schemas.Answers.properties);
Object.assign(schemas, {
  ProfileAnswerStates: object(Object.fromEntries(profileFields.map(key => [key, { enum: ['ANSWERED', 'MISSING', 'SKIPPED', 'UNSURE'] }]))),
  ProfileView: object({
    decisionProfileId: id, profileVersion: { type: 'integer', minimum: 1 },
    questionnaireVersion: ref('QuestionnaireVersion'), submittedAt: { type: 'string', format: 'date-time' },
    answers: ref('DraftAnswers'), answerStates: ref('ProfileAnswerStates'), complete: { type: 'boolean' }, recommendationReady: { type: 'boolean' },
  }),
  ProfileDraft: object({ revision, baseProfileVersion: revision, questionnaireVersion: ref('QuestionnaireVersion'), answers: ref('DraftAnswers'), lastStepKey: step, mode: { enum: ['EDIT', 'RESTART'] } }),
  ProfileState: object({ profile: nullable(ref('ProfileView')), draft: nullable(ref('ProfileDraft')), draftRevision: revision }),
  ProfileChange: object({ questionnaireVersion: ref('QuestionnaireVersion'), expectedRevision: revision, baseProfileVersion: revision, answers: ref('DraftAnswers'), lastStepKey: step, mode: { enum: ['EDIT', 'RESTART'] } }),
  ProfileDiscard: object({ expectedRevision: revision }),
  ProfileSubmitted: object({ profile: ref('ProfileView'), recommendation: nullable(ref('Recommendation')), draftRevision: revision }),
  IntakeFinishInput: object({ questionnaireVersion: ref('QuestionnaireVersion'), expectedRevision: revision, answers: ref('DraftAnswers') }),
  IntakeFinished: object({ profile: ref('ProfileView'), recommendation: nullable(ref('Recommendation')) }),
});
const api = {
  openapi: '3.1.0',
  info: { title: 'MajorPilot background profile and questionnaire skip amendment', version: '7.4.0', description: 'Four-change scope dated 2026-11-14. Drafts and submitted versions are separate; missing answers never become defaults. Security prerequisites remain authoritative. Payment demonstration is frontend-only and has no API.' },
  paths: {}, components: { schemas, securitySchemes: structuredClone(p1.components.securitySchemes), parameters: structuredClone(p1.components.parameters) },
};
function route(path, method, operationId, response, request, status = '200', description = '') {
  const mutation = method !== 'get';
  api.paths[path] ??= {};
  api.paths[path][method] = {
    operationId, description,
    security: [mutation ? { StudentSession: [], CsrfHeader: [] } : { StudentSession: [] }],
    parameters: mutation ? [{ $ref: '#/components/parameters/Origin' }, ...(path.endsWith('/submit') ? [{ $ref: '#/components/parameters/IdempotencyKey' }] : [])] : [],
    responses: {
      [status]: { description: 'Owned active Student profile state; no-store.', content: { 'application/json': { schema: object({ data: ref(response), meta: ref('Meta') }) } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 503].map(code => [code, { description: 'Safe failure; revisions may identify a newer draft or submitted profile. No silent overwrite.', content: { 'application/json': { schema: ref('Error') } } }])),
    },
    ...(request ? { requestBody: { required: true, content: { 'application/json': { schema: ref(request) } } } } : {}),
  };
}
route('/api/app/v1/profile', 'get', 'readBackgroundProfile', 'ProfileState', null, '200', 'Latest submitted profile and independent draft. draftRevision remains monotonic even when draft is absent.');
route('/api/app/v1/profile/draft', 'put', 'saveBackgroundProfileDraft', 'ProfileState', 'ProfileChange', '200', 'Full replacement of this draft under draft and base-profile revisions. Does not mutate the submitted profile or historical experience bindings.');
route('/api/app/v1/profile/submit', 'post', 'submitBackgroundProfile', 'ProfileSubmitted', 'ProfileChange', '201', 'Freeze a new profile version; recommend only with enough real preference inputs. An identical Idempotency-Key retry creates no additional version.');
route('/api/app/v1/profile/draft/discard', 'post', 'discardBackgroundProfileDraft', 'ProfileState', 'ProfileDiscard', '200', 'Discard only the expected draft revision; retain all submitted profiles and monotonically advance draftRevision.');

// Keep the original complete-submit endpoint for compatibility; finish is explicitly partial.
for (const name of ['ProfileAnswerStates', 'ProfileView', 'IntakeFinishInput', 'IntakeFinished']) p1.components.schemas[name] = structuredClone(schemas[name]);
p1.components.schemas.Error.properties.error.properties.details.properties.currentProfileVersion = revision;
p1.components.schemas.Dashboard.properties.profile = nullable(ref('ProfileView'));
p1.components.schemas.Dashboard.required = [...new Set([...p1.components.schemas.Dashboard.required, 'profile'])];
const finish = structuredClone(p1.paths['/api/public/v1/intake-sessions/{id}/submit'].post);
finish.operationId = 'finishIntakeWithOptionalAnswers';
finish.description = 'Freeze the actual partial or empty answers. Omitted keys remain missing; null is an explicit skip. Recommendation is null unless real preferences are sufficient. Allows the existing registration and email-verification flow without fabricated answers.';
finish.requestBody.content['application/json'].schema = ref('IntakeFinishInput');
finish.responses['201'].content['application/json'].schema.properties.data = ref('IntakeFinished');
p1.paths['/api/public/v1/intake-sessions/{id}/finish'] = { post: finish };

const output = (name, value) => {
  const file = new URL(name, import.meta.url), expected = JSON.stringify(value, null, 2) + '\n';
  if (write) writeFileSync(file, expected);
  else assert.equal(readFileSync(file, 'utf8'), expected, `Profile contract drift: run node contracts/sync-profile-flow.mjs --write (${name})`);
};
output('./openapi-p1.json', p1);
output('./openapi-profile-flow.json', api);
for (const name of ['p2', 'p3', 'p4']) {
  const content = read(`./openapi-${name}.json`), create = content.components.schemas.CreateRun;
  assert.ok(create, `Missing CreateRun ${name}`);
  create.properties.majorCode = nullable({ type: 'string', enum: ['AI', 'DATA_SCIENCE', 'BUSINESS_ANALYTICS'] });
  create.description = 'Choose exactly one non-null decisionId, demoKey, or majorCode. majorCode supports self-directed starts without requiring a recommendation; identity, consent, content availability and run-state checks still apply.';
  create.oneOf = ['decisionId', 'demoKey', 'majorCode'].map(key => ({ properties: { [key]: { type: 'string' } }, required: [key] }));
  output(`./openapi-${name}.json`, content);
}
console.log(JSON.stringify({ result: 'PASS', mode: write ? 'write' : 'check', scope: 'profile drafts, immutable partial submissions, self-directed experience creation', paidCalls: 0 }));
