import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// Execute the current TypeScript stores, not a reimplementation of their state logic.
// The only substitutes are transport, Vue refs/Pinia registration and browser surfaces.
const sources = Object.fromEntries(['auth', 'intake'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/stores/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));
class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const expiry = new Date(Date.now() + 86400000).toISOString();
const view = { intakeSessionId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', questionnaireVersion: 'decision-profile-v1', status: 'DRAFT', revision: 2, expiresAt: expiry, lastStepKey: 'step-1', answers: { applicationStage: 'EXPLORING', mainQuestion: 'synthetic-private-answer' }, recommendationId: null };
const me = { studentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW', email: 'synthetic-private@example.invalid', status: 'ACTIVE', emailVerified: true, canStartExperience: true };
const recommendation = { recommendationId: '01ARZ3NDEKTSV4RRFFQ69G5FAX', primaryMajor: 'AI' };
const definition = { questionnaireVersion: 'decision-profile-v1', pages: [{ stepKey: 'step-1', fields: [{ key: 'applicationStage' }] }] };
const copy = value => structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const stale = cause => cause instanceof ApiError && cause.code === 'IDENTITY_CHANGED';

function browser({ channels = true } = {}) {
  const tabs = [], shared = new Map(), sent = [];
  function tab() {
    const window = new EventTarget(), own = new Map(), channelListeners = [];
    let handler = (path) => Promise.resolve(copy(path.includes('questionnaires') ? definition : path.endsWith('/me') || path.endsWith('/login') ? me : path.endsWith('/recommendation') || path.endsWith('/submit') ? recommendation : view));
    const calls = [], modules = {};
    const storage = (map, broadcast) => ({
      getItem: key => map.get(key) ?? null,
      setItem(key, value) { map.set(key, String(value)); if (broadcast) notify(key, String(value)); },
      removeItem(key) { const existed = map.delete(key); if (broadcast && existed) notify(key, null); },
    });
    function notify(key, newValue) {
      if (key === 'mp:identity-signal:v1' && newValue) sent.push(JSON.parse(newValue));
      for (const other of tabs) if (other.window !== window) queueMicrotask(() => { const event = new Event('storage'); Object.assign(event, { key, newValue }); other.window.dispatchEvent(event); });
    }
    const localStorage = storage(shared, true), sessionStorage = storage(own, false);
    const api = (path, options = {}) => { calls.push({ path, options }); return handler(path, options); };
    class Channel {
      addEventListener(name, listener) { if (name === 'message') channelListeners.push(listener); }
      postMessage(message) { sent.push(copy(message)); for (const other of tabs) if (other.window !== window) queueMicrotask(() => other.channelListeners.forEach(listener => listener({ data: copy(message) }))); }
    }
    const context = vm.createContext({ window, localStorage, sessionStorage, Event, CustomEvent, AbortController, AbortSignal, crypto: { randomUUID }, BroadcastChannel: channels ? Channel : undefined });
    function load(name) {
      if (modules[name]) return modules[name].exports;
      const module = { exports: {} }; modules[name] = module;
      const require = path => path === 'pinia' ? { defineStore: (_, setup) => { let instance; return () => instance ||= setup(); } } : path === 'vue' ? { ref: value => ({ value }), computed: getter => ({ get value() { return getter(); } }) } : path === './auth' ? load('auth') : path === '../lib/api' ? {
        api, ApiError,
        stableOperation: () => { let previous, key; return body => { const next = JSON.stringify(body); if (next !== previous) { previous = next; key = randomUUID(); } return key; }; },
      } : (() => { throw new Error(`Unexpected test import: ${path}`); })();
      vm.runInContext(`(function(require,module,exports){${sources[name]}\n})`, context)(require, module, module.exports);
      return module.exports;
    }
    const value = { window, channelListeners, localStorage, sessionStorage, calls, setApi(next) { handler = next; }, auth: load('auth').useAuth(), intake: load('intake').useIntake() };
    tabs.push(value);
    return value;
  }
  return { tab, sent };
}
function cache(tab) {
  tab.localStorage.setItem('mp:intake-pointer:v1', JSON.stringify({ id: view.intakeSessionId, expiresAt: expiry, step: 'step-1' }));
  tab.sessionStorage.setItem('mp:intake-draft:v1', JSON.stringify({ view, answers: view.answers, dirty: [], expiresAt: expiry, definition }));
}
function cleared(tab) {
  assert.equal(tab.intake.view.value, null);
  assert.equal(tab.intake.recommendation.value, null);
  assert.equal(tab.sessionStorage.getItem('mp:intake-draft:v1'), null);
  assert.equal(tab.localStorage.getItem('mp:intake-pointer:v1'), null);
}

test('late /me response cannot restore an explicitly cleared identity', async () => {
  const tab = browser().tab(), reply = deferred(); tab.setApi(() => reply.promise);
  const pending = tab.auth.refresh(true); tab.auth.clear(); reply.resolve(copy(me));
  await assert.rejects(pending, stale); assert.equal(tab.auth.me.value, null); assert.equal(tab.calls[0].options.signal.aborted, true);
});
test('late successful login rejects instead of reporting success after identity invalidation', async () => {
  const tab = browser().tab(), reply = deferred(); tab.setApi(() => reply.promise);
  const pending = tab.auth.login('synthetic@example.invalid', 'synthetic passphrase'); tab.auth.clear(); reply.resolve(copy(me));
  await assert.rejects(pending, stale); assert.equal(tab.auth.me.value, null);
});
test('late intake init cannot resurrect a claimed draft or persistent pointer', async () => {
  const tab = browser().tab(), reply = deferred(); cache(tab);
  tab.setApi(path => path.includes('questionnaires') ? Promise.resolve(copy(definition)) : reply.promise);
  const pending = tab.intake.init(); await settle(); tab.intake.claimed(); cleared(tab); reply.resolve(copy(view));
  await assert.rejects(pending, stale); cleared(tab);
});
for (const method of ['loadServer', 'loadRecommendation', 'submit', 'flush']) test(`late ${method} response cannot write into the next identity`, async () => {
  const tab = browser().tab(); await tab.intake.init(true); const reply = deferred();
  if (method === 'flush') tab.intake.setAnswer('step-1', 'applicationStage', 'APPLIED');
  tab.setApi(() => reply.promise); const pending = tab.intake[method](); await settle(); tab.auth.clear(); reply.resolve(copy(method === 'submit' || method === 'loadRecommendation' ? recommendation : view));
  await assert.rejects(pending, stale); cleared(tab);
});
test('successful login followed by claim clears anonymous data but retains the new account', async () => {
  const bus = browser(), tab = bus.tab(); await tab.intake.init(true);
  tab.localStorage.setItem('other-project', 'preserve'); tab.sessionStorage.setItem('other-project', 'preserve');
  await tab.auth.login('synthetic@example.invalid', 'synthetic passphrase'); tab.intake.claimed();
  assert.equal(tab.auth.me.value.studentId, me.studentId); cleared(tab);
  assert.equal(tab.localStorage.getItem('other-project'), 'preserve'); assert.equal(tab.sessionStorage.getItem('other-project'), 'preserve');
  for (const value of bus.sent) assert.deepEqual(Object.keys(value).sort(), ['nonce', 'reason', 'version']);
  assert.equal(JSON.stringify(bus.sent).includes('synthetic-private'), false);
});
for (const channels of [true, false]) test(`cross-tab logout clears memory and per-tab drafts with ${channels ? 'channel plus deduplicated fallback' : 'storage fallback'}`, async () => {
  const bus = browser({ channels }), first = bus.tab(), second = bus.tab();
  await first.intake.init(true); cache(second); await second.intake.init(); second.auth.me.value = copy(me);
  let events = 0; second.window.addEventListener('mp:identity-cleared', event => { if (event.detail.remote) events += 1; });
  first.auth.clear(); await settle(); assert.equal(second.auth.me.value, null); cleared(second); assert.equal(events, 1);
});
test('cross-tab claim clears anonymous state without dropping a valid logged-in account', async () => {
  const bus = browser(), first = bus.tab(), second = bus.tab(); await second.intake.init(true); second.auth.me.value = copy(me);
  first.intake.claimed(); await settle(); cleared(second); assert.equal(second.auth.me.value.studentId, me.studentId);
});
test('409 keeps local edits and only explicit server adoption replaces them', async () => {
  const tab = browser().tab(); await tab.intake.init(true); tab.intake.setAnswer('step-1', 'applicationStage', 'APPLIED');
  tab.setApi(() => Promise.reject(new ApiError(409, 'INTAKE_REVISION_CONFLICT')));
  await assert.rejects(tab.intake.flush()); assert.equal(tab.intake.conflict.value, true); assert.equal(tab.intake.answers.value.applicationStage, 'APPLIED'); assert.equal(tab.intake.dirty.value.length, 1);
  tab.setApi(() => Promise.resolve(copy(view))); await tab.intake.loadServer(); assert.equal(tab.intake.answers.value.applicationStage, 'EXPLORING'); assert.equal(tab.intake.dirty.value.length, 0);
});
test('failed intake authentication clears cached answers instead of displaying them after failure', async () => {
  const tab = browser().tab(); cache(tab); tab.setApi(path => path.includes('questionnaires') ? Promise.resolve(copy(definition)) : Promise.reject(new ApiError(401, 'AUTH_REQUIRED')));
  await assert.rejects(tab.intake.init(), cause => cause.code === 'AUTH_REQUIRED'); cleared(tab);
});
test('failed login never clears or broadcasts before authentication succeeds', async () => {
  const bus = browser(), tab = bus.tab(); await tab.intake.init(true); tab.setApi(() => Promise.reject(new ApiError(401, 'AUTH_INVALID')));
  await assert.rejects(tab.auth.login('synthetic@example.invalid', 'wrong passphrase')); assert.equal(tab.intake.view.value.intakeSessionId, view.intakeSessionId); assert.equal(bus.sent.length, 0);
});
