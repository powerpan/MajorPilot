import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkProfileContracts, loadProfileContracts } from '../check-profile-flow.mjs';
import { loadP1Contracts } from '../check-p1.mjs';
import { loadP2Contracts } from '../check-p2.mjs';

const { schemas, original } = await loadProfileContracts();
const p1 = await loadP1Contracts(), p2 = await loadP2Contracts();
const valid = (name, value) => assert.equal(schemas[name](value), true, JSON.stringify(schemas[name].errors));
const invalid = (name, value) => assert.equal(schemas[name](value), false);
const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const change = { questionnaireVersion: 'decision-profile-v1', expectedRevision: 0, baseProfileVersion: 0, answers: {}, lastStepKey: 'step-1', mode: 'EDIT' };

test('profile amendment compiles with required ownership, CSRF and submit idempotency', async () => assert.equal((await checkProfileContracts()).result, 'PASS'));
test('partial answers distinguish missing, explicit skips and uncertainty without inventing defaults', () => {
  valid('ProfileChange', change);
  valid('ProfileChange', { ...change, answers: { applicationStage: null, targetIntakeWindow: 'UNSURE', majorFamiliarity: { AI: 'UNFAMILIAR' } } });
  invalid('ProfileChange', { ...change, answers: { abilityScore: 99 } });
  invalid('ProfileChange', { ...change, answers: { currentField: 'UNSURE' } });
  invalid('ProfileChange', { ...change, answers: { consideredMajors: ['DS'] } });
});
test('draft and base-profile revisions are independent, required and never coerced', () => {
  valid('ProfileChange', { ...change, expectedRevision: 8, baseProfileVersion: 2, mode: 'RESTART' });
  for (const field of ['expectedRevision', 'baseProfileVersion']) {
    invalid('ProfileChange', { ...change, [field]: -1 });
    invalid('ProfileChange', { ...change, [field]: '0' });
    const copy = { ...change }; delete copy[field]; invalid('ProfileChange', copy);
  }
  invalid('ProfileChange', { ...change, mode: 'OVERWRITE' });
  invalid('ProfileChange', { ...change, lastStepKey: 'step-13' });
});
test('cleared draft still exposes its monotonic revision and cannot leak another owner', () => {
  valid('ProfileState', { profile: null, draft: null, draftRevision: 8 });
  invalid('ProfileState', { profile: null, draft: null });
  invalid('ProfileState', { profile: null, draft: null, draftRevision: 8, studentId: id });
});
test('submitted profile retains full answer-state projection and nullable recommendation', () => {
  const states = Object.fromEntries(Object.keys(schemas.ProfileAnswerStates.schema.properties).map(key => [key, 'MISSING']));
  const profile = { decisionProfileId: id, profileVersion: 2, questionnaireVersion: change.questionnaireVersion, submittedAt: '2026-11-14T00:00:00Z', answers: { targetIntakeWindow: 'UNSURE', currentField: null }, answerStates: { ...states, targetIntakeWindow: 'UNSURE', currentField: 'SKIPPED' }, complete: false, recommendationReady: false };
  valid('ProfileSubmitted', { profile, recommendation: null, draftRevision: 4 });
  valid('IntakeFinished', { profile, recommendation: null });
  invalid('IntakeFinished', { profile, recommendation: null, draftRevision: 4 });
  invalid('ProfileView', { ...profile, fitScore: 97 });
  const absent = structuredClone(profile); delete absent.answerStates.currentField; invalid('ProfileView', absent);
});
test('conflicts expose only relevant revision metadata', () => {
  const error = { error: { code: 'PROFILE_VERSION_CONFLICT', message: 'Request could not be completed', fieldErrors: [], retryable: false, details: { currentProfileVersion: 3 } }, meta: { requestId: 'fixture' } };
  valid('Error', error);
  invalid('Error', { ...error, error: { ...error.error, details: { answers: {} } } });
});
test('partial finish does not weaken the existing full-submit input', () => {
  assert.equal(p1.schemas.IntakeFinishInput({ questionnaireVersion: change.questionnaireVersion, expectedRevision: 0, answers: {} }), true);
  assert.equal(p1.schemas.SubmitInput({ questionnaireVersion: change.questionnaireVersion, expectedRevision: 0, answers: {} }), false);
  const operation = p1.operations.find(item => item.id === 'finishIntakeWithOptionalAnswers');
  assert.equal(operation.path, '/api/public/v1/intake-sessions/{id}/finish');
});
test('self-directed creation accepts a major but rejects empty, ambiguous or spoofed starts', () => {
  for (const input of [{ majorCode: 'AI' }, { decisionId: id }, { demoKey: 'DEMO_TABLE' }]) assert.equal(p2.schemas.CreateRun(input), true, JSON.stringify(p2.schemas.CreateRun.errors));
  for (const input of [{}, { majorCode: 'DS' }, { majorCode: 'AI', decisionId: id }, { majorCode: 'AI', demoKey: 'DEMO_TABLE' }, { majorCode: null }, { majorCode: 'AI', decisionProfileId: id }]) assert.equal(p2.schemas.CreateRun(input), false);
});
test('profile controller route inventory matches all four documented operations', () => {
  const source = readFileSync(new URL('../../backend/ruoyi-majorpilot/src/main/java/com/ruoyi/majorpilot/intake/ProfileController.java', import.meta.url), 'utf8');
  const prefix = source.match(/@RequestMapping\("([^"]+)"\)/u)?.[1] || '';
  const implemented = [...source.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping(?:\("([^"]*)"\))?/gu)].map(match => `${match[1].toLowerCase()} ${prefix}${match[2] || ''}`).sort();
  const documented = Object.entries(original.paths).flatMap(([path, methods]) => Object.keys(methods).map(method => `${method} ${path}`)).sort();
  assert.deepEqual(documented, implemented);
});
