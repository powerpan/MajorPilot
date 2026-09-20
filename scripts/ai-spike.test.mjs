import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, parseEnvironment, loadConfig, validateEndpoint, validateResult, buildRequest, createBudget, callSynthetic } from './ai-spike.mjs';

const config = { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, apiKey: 'local-probe-test-placeholder' };
const valid = { schemaVersion: 'p0-ai-v1', major: 'DATA_SCIENCE', evidenceIds: ['synthetic_ev_1'], explanation: '先尝试数据清理；这只是体验顺序建议。' };
const completion = (result = valid) => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } });

async function stub(t, handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, body: JSON.parse(body), headers: request.headers });
    handler(response, requests.length);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return {
    requests,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${DEFAULT_BASE_URL}/chat/completions`);
      assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
      return fetch(`http://127.0.0.1:${server.address().port}/stub`, options);
    }
  };
}

test('environment parser never evaluates shell content and rejects ambiguous duplicates', () => {
  assert.equal(parseEnvironment('BAILIAN_API_KEY="$(do-not-run)"').BAILIAN_API_KEY, '$(do-not-run)');
  assert.equal(parseEnvironment('# sample\nBAILIAN_MODEL=\n').BAILIAN_MODEL, '');
  assert.throws(() => parseEnvironment('BAILIAN_API_KEY=x\nBAILIAN_API_KEY=y'), { code: 'CONFIG_INVALID' });
  assert.throws(() => parseEnvironment('not a variable'), { code: 'CONFIG_INVALID' });
});

test('local file permissions and secret-safe config errors', t => {
  const directory = mkdtempSync(join(tmpdir(), 'majorpilot-ai-config-'));
  const file = join(directory, '.env.local');
  t.after(() => rmSync(directory, { recursive: true }));
  writeFileSync(file, 'BAILIAN_API_KEY=local-probe-test-placeholder\nBAILIAN_BASE_URL=\nBAILIAN_MODEL=\n', { mode: 0o600 });
  assert.equal(loadConfig(file, {}).model, DEFAULT_MODEL);
  chmodSync(file, 0o644);
  assert.throws(() => loadConfig(file, {}), { message: 'CONFIG_INVALID' });
});

test('only official Beijing HTTPS endpoints, no credentials/query/redirect origins', () => {
  assert.equal(validateEndpoint(DEFAULT_BASE_URL), DEFAULT_BASE_URL);
  assert.equal(validateEndpoint('https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/'), 'https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  for (const url of ['http://dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope.aliyuncs.com.evil.invalid/compatible-mode/v1', 'https://evil.invalid/compatible-mode/v1', 'https://dashscope.aliyuncs.com/compatible-mode/v1?key=bad', 'https://user:pass@dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'https://dashscope.aliyuncs.com:444/compatible-mode/v1']) {
    assert.throws(() => validateEndpoint(url), { code: 'CONFIG_INVALID' });
  }
});

test('request is synthetic, bounded, non-streaming, schema-strict', () => {
  const request = buildRequest(DEFAULT_MODEL, 'json_schema');
  assert.equal(request.max_tokens, 512);
  assert.equal(request.stream, false);
  assert.equal(request.enable_thinking, false);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(buildRequest(DEFAULT_MODEL, 'json_object').response_format.type, 'json_object');
});

test('output whitelist rejects unknown fields/evidence/recommendations and active content', () => {
  assert.equal(validateResult(valid), true);
  for (const value of [{ ...valid, fitScore: 99 }, { ...valid, evidenceIds: ['nonexistent'] }, { ...valid, major: 'AI' }, { ...valid, explanation: '<script>x</script>' }, { ...valid, explanation: 'https://example.com' }, { ...valid, explanation: '适配度 99%' }, { ...valid, explanation: 'a'.repeat(161) }, { ...valid, explanation: '' }]) assert.equal(validateResult(value), false);
});

test('success returns allowlisted metadata only, never body/credentials', async t => {
  const local = await stub(t, response => response.end(completion()));
  const result = await callSynthetic(config, local);
  assert.equal(result.ok, true);
  assert.equal(result.localSchemaAndBoundaryValid, true);
  assert.equal(local.requests.length, 1);
  const logged = JSON.stringify(result);
  for (const forbidden of [config.apiKey, valid.explanation, 'Authorization', 'content']) assert.equal(logged.includes(forbidden), false);
});

test('429 gets bounded retry with local jitter; never exercise provider limits', async t => {
  const local = await stub(t, (response, number) => { response.statusCode = number === 1 ? 429 : 200; response.end(number === 1 ? 'DO-NOT-LOG-provider-error' : completion()); });
  const sleeps = [];
  const result = await callSynthetic(config, { ...local, maxAttempts: 2, sleep: async ms => sleeps.push(ms), random: () => 0.5 });
  assert.equal(result.attempts, 2);
  assert.deepEqual(sleeps, [150]);
});

test('repeated 429 stops exactly at maximum attempts and sanitizes supplier body', async t => {
  const local = await stub(t, response => { response.statusCode = 429; response.end('DO-NOT-LOG-provider-error'); });
  await assert.rejects(callSynthetic(config, { ...local, maxAttempts: 3, sleep: async () => {} }), { code: 'RATE_LIMITED', status: 429, message: 'RATE_LIMITED' });
  assert.equal(local.requests.length, 3);
});

test('authentication failure never retries', async t => {
  const local = await stub(t, response => { response.statusCode = 401; response.end(config.apiKey); });
  await assert.rejects(callSynthetic(config, { ...local, maxAttempts: 3 }), { code: 'AUTH_FAILED', message: 'AUTH_FAILED' });
  assert.equal(local.requests.length, 1);
});

test('request timeout aborts transport and retries only within attempt bound', async t => {
  const local = await stub(t, () => {});
  await assert.rejects(callSynthetic(config, { ...local, maxAttempts: 2, timeoutMs: 30, sleep: async () => {} }), { code: 'TIMEOUT' });
  assert.equal(local.requests.length, 2);
});

test('global deadline bounds retry sleep', async t => {
  const local = await stub(t, response => { response.statusCode = 429; response.end(); });
  await assert.rejects(callSynthetic(config, { ...local, maxAttempts: 3, deadlineMs: 80, random: () => 1 }), { code: 'TIMEOUT' });
  assert.equal(local.requests.length, 1);
});

test('oversized provider response rejected before processing', async t => {
  const local = await stub(t, response => response.end('x'.repeat(40000)));
  await assert.rejects(callSynthetic(config, local), { code: 'OUTPUT_LIMIT' });
});

test('malformed or domain-invalid JSON never accepted', async t => {
  const local = await stub(t, response => response.end(completion({ ...valid, evidenceIds: ['invented'] })));
  await assert.rejects(callSynthetic(config, local), { code: 'INVALID_OUTPUT' });
});

test('shared request budget caps multiple format probes', async t => {
  const local = await stub(t, response => response.end(completion()));
  const budget = createBudget(1);
  await callSynthetic(config, { ...local, budget });
  await assert.rejects(callSynthetic(config, { ...local, budget }), { code: 'BUDGET_EXHAUSTED' });
  assert.equal(local.requests.length, 1);
});
