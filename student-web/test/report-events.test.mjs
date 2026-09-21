import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../src/lib/events.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness() {
  const timers = new Map(), documentEvents = new Map(), windowEvents = new Map(), calls = [];
  let time = 0, next = 0, intersect, disconnected = false;
  const document = { visibilityState: 'visible', addEventListener: (key, value) => documentEvents.set(key, value), removeEventListener: key => documentEvents.delete(key) };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, document,
    window: { addEventListener: (key, value) => windowEvents.set(key, value), removeEventListener: key => windowEvents.delete(key) },
    IntersectionObserver: class { constructor(callback) { intersect = callback; } observe() {} disconnect() { disconnected = true; } },
    setTimeout: (callback, duration) => { const id = ++next; timers.set(id, { callback, due: time + duration }); return id; }, clearTimeout: id => timers.delete(id),
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    require: id => id === './api' ? { api: async (path, body) => calls.push({ path, body }) } : { identityRequest: () => ({ signal: new AbortController().signal, finish() {} }) },
  });
  return { api: module.exports, calls,
    intersect: ratio => intersect([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]),
    visibility: state => { document.visibilityState = state; documentEvents.get('visibilitychange')?.(); },
    logout: () => windowEvents.get('mp:logout')?.(),
    advance(ms) { const target = time + ms; for (const [id, item] of [...timers].sort((a,b) => a[1].due - b[1].due)) if (item.due <= target && timers.has(id)) { time = item.due; timers.delete(id); item.callback(); } time = target; },
    disconnected: () => disconnected,
  };
}
test('report observation requires an uninterrupted visible second; hidden time never accumulates', () => {
  const h = harness(); let observed = 0; h.api.observePrivateContent({}, () => observed++);
  h.intersect(1); h.advance(999); assert.equal(observed, 0);
  h.visibility('hidden'); h.advance(4000); assert.equal(observed, 0);
  h.visibility('visible'); h.advance(999); assert.equal(observed, 0); h.advance(1); assert.equal(observed, 1); assert.equal(h.disconnected(), true);
  h.advance(5000); assert.equal(observed, 1);
});
test('scrolling to the matrix before one second cancels the header observation until it is shown again', () => {
  const h = harness(); let observed = 0; h.api.observePrivateContent({}, () => observed++);
  h.intersect(1); h.advance(800); h.intersect(0); h.advance(5000); assert.equal(observed, 0);
  h.intersect(1); h.advance(1000); assert.equal(observed, 1);
});
test('identity/logout disposes a pending observation without emitting a stale private version', () => {
  const h = harness(); let observed = 0; h.api.observePrivateContent({}, () => observed++);
  h.intersect(1); h.logout(); h.advance(1000); assert.equal(observed, 0); assert.equal(h.disconnected(), true);
});
test('private observation submits only the owned context reference and empty properties', async () => {
  const h = harness(); h.api.sendPrivateObservation('report.printed', 'owned-version'); await Promise.resolve();
  assert.equal(h.calls.length, 1); const event = h.calls[0].body.body.events[0];
  assert.equal(event.contextType, 'REPORT_VERSION'); assert.equal(event.contextPublicId, 'owned-version'); assert.equal(event.visibleDurationMs, 1000);
  assert.deepEqual(Object.keys(event.properties), []); assert.equal('studentId' in event, false);
});
