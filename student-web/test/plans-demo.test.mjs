import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = readFileSync(new URL('../src/views/PlansDemoView.vue', import.meta.url), 'utf8');
const descriptor = parse(source).descriptor;
const compiled = ts.transpileModule(compileScript(descriptor, { id: 'payment-demo' }).content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('payment demonstration is an ephemeral local sequence with no business API or payment input', async () => {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, window: { matchMedia: () => ({ matches: true }) }, require: name => {
    if (name === 'vue') return { defineComponent: x => x, ref: value => ({ value }), computed: get => ({ get value() { return get(); } }), nextTick: async () => {} };
    if (name.endsWith('.vue')) return {};
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const state = module.exports.default.setup({}, { expose() {} });
  assert.equal(state.stage.value, 'PLANS');
  await state.advance('REVIEW', 'CONFIRMED');
  assert.equal(state.stage.value, 'PLANS');
  await Promise.all([state.advance('PLANS', 'REVIEW'), state.advance('PLANS', 'REVIEW')]);
  assert.equal(state.stage.value, 'REVIEW');
  await state.advance('REVIEW', 'CONFIRMED');
  await state.advance('CONFIRMED', 'ENDED');
  assert.equal(state.title.value, '演示结束，未产生订单或费用');
  await state.advance('ENDED', 'PLANS');
  assert.equal(state.stage.value, 'PLANS');
  assert.doesNotMatch(descriptor.scriptSetup.content, /\bfetch\s*\(|\bapi\s*[<(]|localStorage|sessionStorage|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(descriptor.template.content, /<(?:input|select|textarea)\b/);
  assert.match(source, /不会扣款、不会创建真实订单、不会增加或消耗报告额度/);
});
