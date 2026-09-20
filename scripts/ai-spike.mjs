#!/usr/bin/env node
/** P0-only synthetic probe. No application or production report traffic. */
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_MODEL = 'qwen3.7-plus';
export const RESULT_SCHEMA = JSON.parse(readFileSync(new URL('../contracts/schemas/p0-ai-result.schema.json', import.meta.url), 'utf8'));
const SAFE_CODES = new Set(['CONFIG_INVALID', 'AUTH_FAILED', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_REJECTED', 'TIMEOUT', 'TRANSPORT_FAILED', 'INVALID_OUTPUT', 'OUTPUT_LIMIT', 'BUDGET_EXHAUSTED']);

export class ProbeError extends Error {
  constructor(code, status) {
    super(SAFE_CODES.has(code) ? code : 'TRANSPORT_FAILED');
    this.code = this.message;
    if (Number.isInteger(status)) this.status = status;
  }
}

// Never evaluate shell interpolation or execute file contents.
export function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || Object.hasOwn(values, match[1])) throw new ProbeError('CONFIG_INVALID');
    let value = match[2];
    if (/^["']/u.test(value)) {
      if (value.at(-1) !== value[0]) throw new ProbeError('CONFIG_INVALID');
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function validateEndpoint(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new ProbeError('CONFIG_INVALID'); }
  const official = url.hostname === 'dashscope.aliyuncs.com' || /^[a-z0-9][a-z0-9-]{0,62}\.cn-beijing\.maas\.aliyuncs\.com$/u.test(url.hostname);
  if (!official || url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/u, '') !== '/compatible-mode/v1') throw new ProbeError('CONFIG_INVALID');
  return `${url.origin}/compatible-mode/v1`;
}

export function loadConfig(envFile = resolve(root, '.env.local'), processEnvironment = process.env) {
  let file = {};
  try {
    const stat = lstatSync(envFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new ProbeError('CONFIG_INVALID');
    file = parseEnvironment(readFileSync(envFile, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new ProbeError('CONFIG_INVALID');
  }
  const values = { ...file, ...processEnvironment };
  const apiKey = values.BAILIAN_API_KEY?.trim();
  const model = values.BAILIAN_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey || /[\r\n\s]/u.test(apiKey) || !/^qwen[a-z0-9.-]{0,80}$/u.test(model)) throw new ProbeError('CONFIG_INVALID');
  return { apiKey, model, baseUrl: validateEndpoint(values.BAILIAN_BASE_URL?.trim() || DEFAULT_BASE_URL) };
}

export function validateResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'evidenceIds,explanation,major,schemaVersion') return false;
  return value.schemaVersion === 'p0-ai-v1' && value.major === 'DATA_SCIENCE' && Array.isArray(value.evidenceIds) && value.evidenceIds.length === 1 && value.evidenceIds[0] === 'synthetic_ev_1' && typeof value.explanation === 'string' && [...value.explanation].length > 0 && [...value.explanation].length <= 160 && !/[<>]|https?:\/\/|!\[|适配度|录取概率|人格|百分之|%/iu.test(value.explanation);
}

export function buildRequest(model, format) {
  if (!['json_schema', 'json_object'].includes(format)) throw new ProbeError('CONFIG_INVALID');
  // Keep provider schema small. The full local schema and domain checks still run.
  const { $schema, $id, title, ...schema } = RESULT_SCHEMA;
  return {
    model,
    messages: [
      { role: 'system', content: '这是合成数据接口测试，不是学生报告。返回 JSON 对象，字段只有 schemaVersion、major、evidenceIds、explanation。不能给适配分数、录取概率、人格判断或外部链接。' },
      { role: 'user', content: '规则已决定 DATA_SCIENCE。唯一合成证据 synthetic_ev_1：测试用户想先尝试数据清理。返回 schemaVersion=p0-ai-v1，major=DATA_SCIENCE，evidenceIds=[synthetic_ev_1]。explanation 用一句简短中文说明这是一次体验顺序建议，不是适合程度判断，不要添加未提供的事实。' }
    ],
    stream: false,
    enable_thinking: false,
    temperature: 0,
    max_tokens: 512,
    response_format: format === 'json_schema' ? { type: format, json_schema: { name: 'p0_synthetic_result', strict: true, schema } } : { type: format }
  };
}

export function createBudget(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new ProbeError('CONFIG_INVALID');
  let used = 0;
  return { take() { if (used >= limit) throw new ProbeError('BUDGET_EXHAUSTED'); used += 1; }, get used() { return used; } };
}

async function limitedJson(response, maxBytes = 32768) {
  if (!response.body) throw new ProbeError('INVALID_OUTPUT');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ProbeError('OUTPUT_LIMIT'); }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ProbeError('INVALID_OUTPUT'); }
  } finally { reader.releaseLock(); }
}

function classify(status) {
  if ([401, 403].includes(status)) return 'AUTH_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_UNAVAILABLE';
  return 'UPSTREAM_REJECTED';
}

/** fetchImpl is injected only by local tests; CLI always uses native fetch. */
export async function callSynthetic(config, { format = 'json_schema', fetchImpl = fetch, timeoutMs = 15000, deadlineMs = 30000, maxAttempts = 1, budget = createBudget(), sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)), random = Math.random } = {}) {
  const baseUrl = validateEndpoint(config.baseUrl);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 || timeoutMs <= 0 || deadlineMs <= 0 || deadlineMs > 45000) throw new ProbeError('CONFIG_INVALID');
  const started = performance.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = deadlineMs - (performance.now() - started);
    if (remaining <= 0) throw new ProbeError('TIMEOUT');
    budget.take();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    let failure;
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequest(config.model, format))
      });
      if (!response.ok) {
        // Never read/print supplier error text: it can contain request or account data.
        await response.body?.cancel();
        throw new ProbeError(classify(response.status), response.status);
      }
      const raw = await limitedJson(response);
      const choice = raw.choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new ProbeError('INVALID_OUTPUT');
      let result;
      try { result = JSON.parse(choice.message.content); } catch { throw new ProbeError('INVALID_OUTPUT'); }
      if (!validateResult(result)) throw new ProbeError('INVALID_OUTPUT');
      const usage = {};
      for (const field of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
        if (Number.isSafeInteger(raw.usage?.[field]) && raw.usage[field] >= 0) usage[field] = raw.usage[field];
      }
      // Return only allowlisted metadata. Do not persist raw prompts/results or vendor IDs.
      return { ok: true, format, model: config.model, status: response.status, elapsedMs: Math.round(performance.now() - started), attempts: attempt, localSchemaAndBoundaryValid: true, usage };
    } catch (error) {
      failure = error instanceof ProbeError ? error : new ProbeError(controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT_FAILED');
    } finally { clearTimeout(timer); }
    const retryable = ['TIMEOUT', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE'].includes(failure.code);
    if (!retryable || attempt >= maxAttempts) throw failure;
    const delayMs = Math.floor(100 + Math.max(0, Math.min(1, random())) * 100) * attempt;
    if (performance.now() - started + delayMs >= deadlineMs) throw new ProbeError('TIMEOUT');
    await sleep(delayMs);
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--live') {
    console.log('P0 synthetic Bailian probe. Explicit paid opt-in: node scripts/ai-spike.mjs --live (2 calls; <=512 output tokens each; no automatic live retries).');
    return;
  }
  const config = loadConfig();
  const budget = createBudget(2);
  const results = [];
  for (const format of ['json_schema', 'json_object']) {
    try { results.push(await callSynthetic(config, { format, budget })); }
    catch (error) {
      results.push({ ok: false, format, code: error instanceof ProbeError ? error.code : 'TRANSPORT_FAILED', ...(Number.isInteger(error.status) ? { status: error.status } : {}) });
      if (['AUTH_FAILED', 'RATE_LIMITED', 'TIMEOUT', 'TRANSPORT_FAILED'].includes(error.code)) break;
    }
  }
  console.log(JSON.stringify({ scope: 'synthetic-capability-only', region: 'cn-beijing', model: config.model, requests: budget.used, results, liveQuotaStressTested: false, productionModelApproved: false }, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(JSON.stringify({ ok: false, code: error instanceof ProbeError ? error.code : 'TRANSPORT_FAILED' })); process.exitCode = 1; });
}
