// Design-only checks. This does not test the future Java/Vue application or MySQL.
// Run from any directory: node /path/to/MajorPilot/docs/validation/check-design.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist'].includes(entry.name)) return [];
  const name = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(name) : [name];
});
const files = walk(path.join(root, 'docs')).filter(name => name.endsWith('.md'));
files.push(path.join(root, 'CONTEXT.md'));
let links = 0;
let jsonExamples = 0;
for (const name of files) {
  const body = fs.readFileSync(name, 'utf8');
  assert.equal((body.match(/^```/gm) ?? []).length % 2, 0, `Unclosed fence: ${name}`);
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert(fs.existsSync(path.resolve(path.dirname(name), decodeURIComponent(target))), `Missing link: ${name} -> ${target}`);
    links++;
  }
  for (const match of body.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    JSON.parse(match[1]);
    jsonExamples++;
  }
}

const recommendationDoc = read('docs/08-intake-and-recommendation-design.md');
const majors = ['AI', 'DS', 'BA'];
const fixedOrder = ['DS', 'AI', 'BA'];
// Extract the mapping from the reviewed document instead of duplicating its values.
const mapping = Object.fromEntries([...recommendationDoc.matchAll(/^\| ([^|]+) \| (强|中|弱) \| (强|中|弱) \| (强|中|弱) \|$/gm)]
  .map(match => [match[1], match.slice(2, 5)]));
assert.equal(Object.keys(mapping).length, 7);
function validateInput(input) {
  assert.equal(input.ranks.length, 3);
  assert(input.ranks.every(rank => Number.isInteger(rank) && rank >= 1 && rank <= 3));
  const levels = [...new Set(input.ranks)].sort();
  assert(levels.every((rank, i) => rank === i + 1));
  assert(input.considered.length > 0 && input.considered.length <= 3);
  assert.equal(new Set(input.considered).size, input.considered.length);
  assert(input.considered.every(major => majors.includes(major)));
  assert(input.elements.length > 0 && input.elements.length <= 3);
  assert.equal(new Set(input.elements).size, input.elements.length);
  assert(input.elements.every(element => Object.hasOwn(mapping, element)));
  assert.equal(input.familiarity.length, 3);
  assert(input.familiarity.every(value => Number.isInteger(value) && value >= 0 && value <= 3));
}
function rank(input) {
  validateInput(input);
  const tuples = majors.map((major, index) => ({
    major,
    values: [input.ranks[index], input.considered.includes(major) ? 0 : 1,
      -input.elements.filter(element => mapping[element][index] === '强').length,
      -input.elements.filter(element => mapping[element][index] === '中').length,
      input.considered.includes(major) ? input.familiarity[index] : 4,
      fixedOrder.indexOf(major)],
  }));
  tuples.sort((a, b) => {
    for (let i = 0; i < a.values.length; i++) {
      if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
    }
    return 0;
  });
  const difference = tuples[0].values.findIndex((value, i) => value !== tuples[1].values[i]);
  return { order: tuples.map(item => item.major), key: ['rank', 'considered', 'strongCount', 'mediumCount', 'familiarity', 'fixedOrder'][difference] };
}
const initialRows = recommendationDoc.split('\n').filter(line => /^\| I\d\d \|/.test(line));
assert.equal(initialRows.length, 9);
for (const row of initialRows) {
  const [id, ranks, considered, elements, familiarity, order, key] = row.split('|').slice(1, -1).map(value => value.trim());
  const input = { ranks: ranks.split(',').map(Number), considered: considered === '全部' ? majors : considered.split(','), elements: elements.split('、'), familiarity: familiarity.split(',').map(Number) };
  const result = rank(input);
  assert.equal(result.order.join(','), order, id);
  assert.equal(result.key, key, id);
  assert.deepEqual(rank({ ...input, currentField: '其他', freeText: '不影响排序', codingFoundation: 0 }), result, `${id}: non-ranking fields`);
}
const subsets = values => Array.from({ length: 2 ** values.length - 1 }, (_, i) => values.filter((_, bit) => (i + 1) & (1 << bit)));
const elementSets = subsets(Object.keys(mapping)).filter(items => items.length <= 3);
const consideredSets = subsets(majors);
let rankingCombinations = 0;
for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (let c = 1; c <= 3; c++) {
  const ranks = [a, b, c];
  if (![...new Set(ranks)].sort().every((value, i) => value === i + 1)) continue;
  for (const considered of consideredSets) for (const elements of elementSets) {
    for (let f = 0; f < 64; f++) {
      const input = { ranks, considered, elements, familiarity: [f % 4, Math.floor(f / 4) % 4, Math.floor(f / 16)] };
      const order = rank(input).order;
      for (let i = 1; i < order.length; i++) assert(ranks[majors.indexOf(order[i - 1])] <= ranks[majors.indexOf(order[i])]);
      rankingCombinations++;
    }
  }
}
const valid = { ranks: [1, 1, 1], considered: majors, elements: ['表达结论'], familiarity: [1, 1, 1] };
for (const invalid of [{ ranks: [1, 3, 3] }, { ranks: [1, 2] }, { considered: ['AI', 'AI'] }, { elements: [] }, { elements: Object.keys(mapping).slice(0, 4) }]) assert.throws(() => rank({ ...valid, ...invalid }));

const styles = { MODEL_ITERATION: 'AI', DATA_REASONING: 'DS', BUSINESS_ACTION: 'BA' };
const adjacent = { AI: 'DS', DS: 'BA', BA: 'DS' };
function next(completed, last, style) {
  const candidates = majors.filter(major => !completed.includes(major));
  if (!candidates.length) return ['ALL_COMPLETED', null];
  if (candidates.length === 1) return [candidates[0], 'ONLY_REMAINING'];
  if (candidates.includes(styles[style])) return [styles[style], 'EXPLICIT_NEXT_STYLE'];
  return [candidates.includes(adjacent[last]) ? adjacent[last] : fixedOrder.find(major => candidates.includes(major)), 'ADJACENT_BASELINE'];
}
const nextCases = [
  ['N01', ['AI'], 'AI', 'BUSINESS_ACTION', 'BA', 'EXPLICIT_NEXT_STYLE'],
  ['N02', ['AI'], 'AI', 'UNSURE', 'DS', 'ADJACENT_BASELINE'],
  ['N03', ['DS'], 'DS', 'MODEL_ITERATION', 'AI', 'EXPLICIT_NEXT_STYLE'],
  ['N04', ['BA'], 'BA', 'SKIPPED', 'DS', 'ADJACENT_BASELINE'],
  ['N05', ['AI', 'DS'], 'DS', 'MODEL_ITERATION', 'BA', 'ONLY_REMAINING'],
  ['N06', ['AI', 'BA'], 'BA', 'BUSINESS_ACTION', 'DS', 'ONLY_REMAINING'],
  ['N07', majors, 'BA', 'UNSURE', 'ALL_COMPLETED', null],
  ['N08', ['AI'], 'AI', 'DATA_REASONING', 'DS', 'EXPLICIT_NEXT_STYLE'],
  ['N09', ['AI'], 'AI', 'UNSURE', 'DS', 'ADJACENT_BASELINE'],
];
for (const [id, completed, last, style, major, reason] of nextCases) {
  const row = recommendationDoc.split('\n').find(line => line.startsWith(`| ${id} |`));
  assert(row?.split('|')[4].includes(major), `${id}: document expectation drift`);
  assert.deepEqual(next(completed, last, style), [major, reason], id);
}

const api = read('docs/12-api-contract-design.md');
const publicApi = api.split('## 6. 公开与匿名 API')[1].split('## 7. 学生账户与主页 API')[0];
const studentApi = api.split('## 7. 学生账户与主页 API')[1].split('## 8. Experience Run API')[0];
assert(!publicApi.includes('`/auth/logout`'));
assert(publicApi.includes('`/auth/register`') && studentApi.includes('`/auth/logout`'));
const intakePath = api.match(/host-only，`Path=([^`]+)`，同时覆盖 Intake/)[1];
const studentPath = api.match(/host-only，`Path=([^`]+)`，退出登录/)[1];
function cookieMatches(cookiePath, requestPath) {
  return requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'));
}
for (const [cookiePath, request, expected] of [
  [intakePath, '/api/public/v1/auth/register', true], [intakePath, '/api/public/v1/intake-sessions/example', true],
  [studentPath, '/api/app/v1/auth/logout', true], [studentPath, '/api/admin/v1/majorpilot/overview', false],
  [studentPath, '/api/public/v1/auth/login', false], [studentPath, '/api/app/v10/me', false],
  ['/api/public/v1/deletion-receipts', '/api/public/v1/deletion-receipts/example', true],
  ['/api/public/v1/deletion-receipts', '/api/app/v1/me', false],
]) assert.equal(cookieMatches(cookiePath, request), expected, request);

const model = read('docs/11-logical-data-model.md');
const tables = [...model.matchAll(/^### (?:\d+\.\d+ )?`(mp_[a-z_]+)`/gm)].map(match => match[1]);
assert.equal(tables.length, new Set(tables).size);
assert(model.includes('UNIQUE(experience_run_id, snapshot_version_no)'));
assert(model.includes('`active_guard`：仅 IN_PROGRESS／TASK_COMPLETED 为1'));
assert(!model.includes('`REFLECTION_COMPLETED`'));
assert(model.includes('`mp_background_job`') && model.includes('`mp_idempotency_record`'));
const active = status => ['IN_PROGRESS', 'TASK_COMPLETED'].includes(status);
assert.equal(['PAUSED', 'IN_PROGRESS', 'READY'].filter(active).length, 1);
assert.equal(['CLOSED', 'PAUSED', 'READY'].filter(active).length, 0);
assert.equal(['REPLACED', 'READY'].filter(status => status !== 'REPLACED').length, 1);

console.log(JSON.stringify({ scope: 'design-only; no application, browser, MySQL or provider validation', markdownFiles: files.length, localLinks: links, validJsonExamples: jsonExamples, logicalTables: tables.length, initialGoldenRows: initialRows.length, nextGoldenRows: nextCases.length, rankingCombinations, invalidInputChecks: 5, cookiePathChecks: 8, result: 'PASS' }, null, 2));
