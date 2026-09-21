// Actual Chrome/Edge P6 acceptance against the isolated test-source harness.
// Normal auth/CSRF, STANDARD Run lifecycle, algorithms and report jobs are real.
// Only professionally published preconditions and model transport are TEST_FIXTURE /
// TEST_REPLAY. No production publication, Worker-origin relaxation, or paid call.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, lstatSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../scripts/local-config.mjs';
import { createP6FixtureScope, P6Client, expect, idempotency, p6Query, p6Origin } from '../../scripts/lib/p6-student-fixture.mjs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const materials = [
  { major: 'AI', id: '01JF1000000000000000000001', manifest: read('../../content/ai-support/1.0.0/manifest.json'), fixture: read('../../contracts/examples/p3-ai-run.json') },
  { major: 'DATA_SCIENCE', id: '01JF2000000000000000000001', manifest: read('../../content/ds-learning/1.0.0/manifest.json'), fixture: read('../../contracts/examples/p4-ds-run.json') },
  { major: 'BUSINESS_ANALYTICS', id: '01JF3000000000000000000001', manifest: read('../../content/ba-learning/1.0.0/manifest.json'), fixture: read('../../contracts/examples/p5-ba-run.json') },
];
const { loadP6Contracts } = await import('../../contracts/check-p6.mjs');
const contract = await loadP6Contracts();
for (const material of materials) for (const step of material.manifest.steps)
  assert.ok(contract.ajv.compile(step.inputSchema)(material.fixture.responses[step.stepKey]), `Invalid ${material.major} fixture ${step.stepKey}`);
const invoked = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const args = invoked ? process.argv.slice(2) : [];
const reportRoot = '/api/app/v1/reports', runRoot = '/api/app/v1/experience-runs';
assert.ok(args.length === 0 || args.length === 1 && ['--check', '--chrome-only'].includes(args[0]));

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function until(check, label, timeout = 60000, interval = 2000) {
  const deadline = Date.now() + timeout;
  do { const result = await check(); if (result) return result; await sleep(interval); } while (Date.now() < deadline);
  throw new Error(`${label}: timed out; private payload suppressed`);
}
function gateway(mode) {
  assert.ok(['PASS', 'HOLD_INITIAL', 'INVALID_INITIAL', 'INVALID_ALWAYS'].includes(mode));
  const directory = `${ROOT}/data/p6-harness`;
  for (const name of ['gateway-entered.json', 'gateway-release']) {
    const path = `${directory}/${name}`;
    if (existsSync(path)) { assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()); unlinkSync(path); }
  }
  const temporary = `${directory}/browser-control-${randomUUID()}.json`;
  writeFileSync(temporary, JSON.stringify({ mode }) + '\n', { flag: 'wx', mode: 0o600 });
  renameSync(temporary, `${directory}/gateway-control.json`);
}
function releaseGateway() {
  const path = `${ROOT}/data/p6-harness/gateway-release`;
  if (!existsSync(path)) writeFileSync(path, 'release\n', { flag: 'wx', mode: 0o600 });
}
const post = (client, path, body) => client.call(path, { method: 'POST', body, headers: idempotency() });
async function completeTask(account, material, run) {
  const client = account.client;
  if (!run) {
    const dashboard = expect(await client.call('/api/app/v1/dashboard'), 200, 'fixture recommendation');
    const recommendation = dashboard.nextRecommendation || dashboard.recommendation;
    const decision = expect(await post(client, `/api/app/v1/recommendations/${recommendation.recommendationId}/decision`, {
      selectedMajorCode: material.major, ...(recommendation.primaryMajor === material.major ? {} : { overrideReasonCode: 'DECLINED' }),
    }), 201, 'fixture explicit decision');
    run = expect(await post(client, runRoot, { decisionId: decision.decisionId }), 201, 'fixture formal run');
    run = expect(await post(client, `${runRoot}/${run.runId}/start`, { expectedRevision: run.revision }), 200, 'fixture explicit start');
  }
  assert.equal(run.taskVersionId, material.id); assert.equal(run.runMode, 'STANDARD');
  const task = expect(await client.call(`${runRoot}/${run.runId}/task`), 200, 'fixture task');
  assert.ok(task.title.startsWith('TEST_FIXTURE'));
  for (const definition of material.manifest.steps) {
    const step = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}`), 200, 'fixture step');
    const saved = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}/response`, { method: 'PUT', body: {
      expectedRevision: step.revision, responseSchemaVersion: step.responseSchemaVersion, response: material.fixture.responses[definition.stepKey],
    } }), 200, 'fixture save');
    const current = expect(await client.call(`${runRoot}/${run.runId}/steps/${definition.stepKey}`), 200, 'fixture source bindings');
    if (definition.operationKey) {
      const execution = expect(await post(client, `${runRoot}/${run.runId}/executions`, {
        operationKey: definition.operationKey, inputRevision: saved.revision, parameters: {},
        ...(material.major === 'AI' ? {} : { expectedSourceRevisions: Object.fromEntries(current.inputBindings.map(binding => [binding.sourceStepKey, binding.sourceRevision])) }),
      }), 200, 'fixture actual algorithm');
      assert.equal(execution.status, 'SUCCEEDED'); assert.equal(execution.trustLevel, 'SERVER_VERIFIED');
    }
    run = expect(await post(client, `${runRoot}/${run.runId}/steps/${definition.stepKey}/complete`, {
      expectedRevision: saved.revision, ...(current.baActionContext ? { expectedSourceRevisions: current.baActionContext.sourceRevisions } : {}),
    }), 200, 'fixture complete step');
  }
  run = expect(await post(client, `${runRoot}/${run.runId}/task-completion`, { expectedRevision: run.revision }), 200, 'fixture task completion');
  const reflection = expect(await client.call(`${runRoot}/${run.runId}/reflection`), 200, 'fixture reflection');
  run = expect(await post(client, `${runRoot}/${run.runId}/reflection/submission`, { ...material.fixture.reflection, expectedRevision: reflection.revision }), 200, 'fixture closure');
  assert.equal(run.status, 'CLOSED'); return run;
}
async function reportFor(account, major, ready = true) {
  const summary = await until(async () => expect(await account.client.call(`${reportRoot}?limit=50`), 200, 'report list').items.find(item => item.reportType === 'EXPERIENCE' && item.majorCode === major), 'logical report');
  if (!ready) return summary;
  await until(async () => {
    const status = expect(await account.client.call(`${reportRoot}/${summary.reportId}/status`), 200, 'report status');
    assert.notEqual(status.status, 'FAILED'); return status.currentVersionId;
  }, 'published report');
  return expect(await account.client.call(`${reportRoot}/${summary.reportId}`), 200, 'real report body');
}
async function comparisonFor(account, count) {
  return await until(async () => {
    const value = expect(await account.client.call('/api/app/v1/comparison-report'), 200, 'comparison status');
    return value.state === 'READY' && value.report.sources.length === count && value.report;
  }, 'comparison publication');
}
async function run() {
  const output = '/tmp/majorpilot-p6-evidence'; await mkdir(output, { recursive: true });
  assert.equal(p6Query('SELECT DATABASE();'), 'majorpilot_test');
  const scope = createP6FixtureScope(), results = [], previousReports = [];
  const channels = args.includes('--chrome-only') ? ['chrome'] : ['chrome', 'msedge'];
  let full, failure;
  try {
    gateway('PASS'); full = await new P6Client().operator('full');
    for (const channel of channels) {
      const account = await scope.student(), client = account.client;
      const browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true });
      const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, reducedMotion: 'reduce' });
      context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
      const deadline = setTimeout(() => { console.error(`${channel}: bounded 12-minute deadline; browser closing before exact cleanup`); void browser.close(); }, 720000);
      const page = await context.newPage(), errors = [], events = [], feedback = [], mutations = [], readers = [], responses = [];
      context.on('page', observe);
      function observe(tab) {
        tab.on('pageerror', error => errors.push(error.message));
        tab.on('console', message => {
          if (['error', 'warning'].includes(message.type()) && !message.text().startsWith('Failed to load resource')) errors.push(message.text());
        });
        tab.on('dialog', dialog => void dialog.accept());
        tab.on('request', request => {
          const path = new URL(request.url()).pathname;
          if (request.method() === 'POST' && path === '/api/app/v1/events') events.push(...request.postDataJSON().events);
          if (request.method() === 'POST' && path === '/api/app/v1/feedback') feedback.push(request.postDataJSON());
          if (!['GET', 'HEAD'].includes(request.method()) && /\/experience-runs|\/decision$/.test(path)) mutations.push(path);
        });
        tab.on('response', response => {
          const path = new URL(response.url()).pathname;
          if (path === '/api/app/v1/events' && response.request().method() === 'POST') responses.push(response.json().then(body => {
            assert.equal(response.status(), 202, 'Browser observation must be server accepted');
            assert.equal(typeof body.data.acceptedCount, 'number');
          }).catch(error => error));
          if (response.status() === 200 && (path.startsWith(reportRoot) || path.endsWith('/comparison-report'))) responses.push(response.json().then(body => {
            assert.doesNotMatch(JSON.stringify(body), /"(?:evidenceIds|snapshotSha256|studentId|prompt|rawAnalysis)"/);
            assert.equal(response.headers()['cache-control'], 'no-store');
          }).catch(error => error));
        });
      }
      observe(page);
      const shot = (name, tab = page) => tab.screenshot({ path: `${output}/${channel}-${name}.png` });
      const uiData = async (path, method = 'GET', body) => page.evaluate(async ({ path, method, body }) => {
        const headers = body ? { 'Content-Type': 'application/json' } : {};
        if (method !== 'GET') {
          const csrf = await fetch('/api/app/v1/auth/csrf').then(response => response.json()); headers['X-CSRF-Token'] = csrf.data.csrfToken;
        }
        const response = await fetch(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, body: response.status === 204 ? null : await response.json() };
      }, { path, method, body });
      async function login(tab = page, returnTo = '/app') {
        await tab.bringToFront(); await tab.goto(`${p6Origin}/login?returnTo=${encodeURIComponent(returnTo)}`);
        await tab.locator('#auth-email').fill(account.email); await tab.locator('#auth-password').fill(account.password);
        await tab.locator('.auth-form button[type=submit]').click(); await tab.waitForURL(p6Origin + returnTo);
      }
      async function view(body, tab = page, path = `/app/reports/${body.reportId}`) {
        await tab.bringToFront(); await tab.goto(p6Origin + path); await tab.locator('.report-section').first().waitFor();
        assert.equal(await tab.locator('.report-section').count(), body.sections.length);
        assert.deepEqual(await tab.locator('.report-claim-text').allTextContents(), body.sections.flatMap(section => section.claims.map(claim => claim.text)));
        readers.push(body.reportVersionId);
      }
      async function responsive(name, tab = page) {
        for (const width of [1536, 1366, 768, 390]) {
          await tab.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
          await tab.evaluate(() => window.scrollTo(0, 0)); await tab.waitForTimeout(100);
          const geometry = await tab.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
            headerTop: document.querySelector('.report-header').getBoundingClientRect().top,
            bodySize: parseFloat(getComputedStyle(document.querySelector('.report-claim-text')).fontSize),
            controls: [...document.querySelectorAll('.report-header button,.report-form-field select,.report-form-field textarea')].map(node => parseFloat(getComputedStyle(node).fontSize)),
          }));
          assert.equal(geometry.overflow, false); assert.ok(Math.abs(geometry.headerTop) <= 1); assert.ok(geometry.bodySize >= 16); assert.ok(geometry.controls.every(size => size >= 16));
          await shot(`${name}-${width}`, tab);
        }
        await tab.setViewportSize({ width: 1536, height: 1024 }); await tab.evaluate(() => window.scrollTo(0, 0));
      }
      try {
        await login(); await page.locator('.dashboard-page').waitFor();
        await page.goto(p6Origin + '/app/comparison'); await page.locator('.report-empty').waitFor();
        assert.equal(await page.locator('.report-claim').count(), 0); await shot('comparison-waiting');
        gateway('HOLD_INITIAL'); await completeTask(account, materials[0]);
        await until(() => existsSync(`${ROOT}/data/p6-harness/gateway-entered.json`), 'held initial attempt', 20000, 250);
        const pending = await reportFor(account, 'AI', false);
        await page.goto(`${p6Origin}/app/reports/${pending.reportId}`); await page.getByText('体验已完成，报告正在准备。你可以安全离开，稍后回来查看。', { exact: true }).waitFor();
        assert.equal(await page.locator('.report-claim').count(), 0); await shot('report-pending');
        releaseGateway(); const ai = await reportFor(account, 'AI');
        await page.locator('.report-section').first().waitFor({ timeout: 30000 }); await view(ai); await responsive('ai-report');
        await until(() => events.some(event => event.eventName === 'report.viewed' && event.contextPublicId === ai.reportVersionId), 'visible report event', 5000, 100);
        const basis = page.locator('.report-basis summary').first(); await basis.focus(); await page.keyboard.press('Space');
        assert.equal(await basis.evaluate(node => node.parentElement.open), true); await shot('basis-open');
        await page.getByRole('button', { name: '打印', exact: true }).click(); await page.waitForURL('**/print?expectedVersion=*');
        await page.waitForFunction(() => { const button = document.querySelector('.report-print-button'); return button && !button.disabled; });
        assert.equal(await page.locator('.report-basis').count(), 0);
        assert.equal(await page.locator('.report-basis-copy').count(), ai.sections.reduce((total, section) => total + section.claims.length, 0));
        await page.evaluate(() => { window.print = () => { window.__p6PrintInvoked = true; }; });
        await page.getByRole('button', { name: '打印此版本', exact: true }).click();
        await until(() => events.some(event => event.eventName === 'report.printed' && event.contextPublicId === ai.reportVersionId), 'print trigger observation', 5000, 100);
        assert.equal(await page.evaluate(() => window.__p6PrintInvoked), true);
        await page.emulateMedia({ media: 'print' }); await shot('print-css');
        await page.pdf({ path: `${output}/${channel}-experience-print.pdf`, format: 'A4', printBackground: true });
        await page.emulateMedia({ media: 'screen' });
        console.log(JSON.stringify({ channel, stage: 'AI real report, continuous-visible events and same-version print PASS' }));
        await view(ai); const nextId = ai.nextRecommendation.recommendationId;
        assert.ok(nextId); const next = expect(await client.call(`/api/app/v1/recommendations/${nextId}`), 200, 'independent NEXT'); assert.equal(next.recommendationType, 'NEXT');
        await page.locator('.report-next-panel').scrollIntoViewIfNeeded();
        await page.locator('.report-next-panel h3').waitFor();
        await until(() => events.some(event => event.eventName === 'next_recommendation.viewed' && event.contextPublicId === nextId), 'visible NEXT event', 5000, 100);
        await page.getByRole('button', { name: '选择其他专业', exact: true }).click(); await shot('next-alternatives');
        const before = expect(await client.call(runRoot), 200, 'runs before read-only introduction').length, mutationCount = mutations.length;
        await page.goto(`${p6Origin}/app/experiences/DATA_SCIENCE?recommendationId=${nextId}`);
        await page.locator('.formal-description').waitFor(); assert.equal(mutations.length, mutationCount, 'Reading an introduction must never create a decision/Run');
        assert.equal(expect(await client.call(runRoot), 200, 'runs after read-only introduction').length, before);
        await shot('formal-introduction');
        const decisionResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/recommendations/${nextId}/decision`));
        await page.getByRole('button', { name: '确认并保存选择', exact: true }).click(); assert.equal((await decisionResponse).status(), 201);
        assert.equal(expect(await client.call(runRoot), 200, 'choice is not start').length, before);
        await page.getByRole('button', { name: '开始正式体验', exact: true }).click(); await page.waitForURL('**/app/runs/*');
        const dsRunId = new URL(page.url()).pathname.split('/').at(-1); assert.match(dsRunId, /^[0-9A-Z]{26}$/);
        let dsRun = expect(await client.call(`${runRoot}/${dsRunId}`), 200, 'UI started pinned DS');
        dsRun = expect(await post(client, `${runRoot}/${dsRunId}/pause`, { expectedRevision: dsRun.revision }), 200, 'prepare paused continuation');
        await page.goto(`${p6Origin}/app/experiences/DATA_SCIENCE?recommendationId=${nextId}`); await page.getByRole('button', { name: '恢复原体验进度', exact: true }).click();
        await page.waitForURL(`**/app/runs/${dsRunId}`); dsRun = expect(await client.call(`${runRoot}/${dsRunId}`), 200, 'UI resumed pinned run'); assert.equal(dsRun.status, 'IN_PROGRESS');
        await view(ai); gateway('INVALID_INITIAL'); await completeTask(account, materials[1], dsRun);
        const ds = await reportFor(account, 'DATA_SCIENCE'); assert.equal(ds.generationMode, 'AI');
        const comparison = await comparisonFor(account, 2); await view(ds); await responsive('ds-report');
        const compareTab = await context.newPage(); await view(comparison, compareTab, '/app/comparison');
        assert.equal(await compareTab.locator('.report-dimensions tbody tr').count(), 7); assert.equal(await compareTab.locator('.report-dimensions tbody td').count(), 14);
        await responsive('comparison-two', compareTab);
        assert.equal(await compareTab.evaluate(() => document.visibilityState), 'visible');
        await until(() => events.some(event => event.eventName === 'comparison_report.viewed'), 'comparison observation', 5000, 100);
        await compareTab.locator('#section-COMMON_DIMENSIONS').evaluate(node => node.scrollIntoView()); await shot('comparison-two-dimensions', compareTab);
        await compareTab.locator(`.report-sources a[href*="${ai.reportId}"]`).waitFor();
        console.log(JSON.stringify({ channel, stage: 'NEXT explicit start/resume, DS and two-source comparison PASS' }));
        await view(ai); const feedbackForm = page.locator('.report-feedback'); await feedbackForm.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => !document.querySelector('textarea[name=reportComment]').disabled);
        assert.equal(await feedbackForm.locator('input:checked').count(), 0); assert.equal(await feedbackForm.locator('input[type=radio]').count(), 10);
        assert.equal(await feedbackForm.locator('select[name=nextAction]').inputValue(), '');
        const comment = '合成验收评论：反馈绑定实际阅读的旧版本，不包含个人资料。';
        await page.locator('textarea[name=reportComment]').fill(comment); await shot('feedback-unsubmitted');
        // An actual authorized regeneration leaves this old reader intact.
        gateway('HOLD_INITIAL'); const status = expect(await client.call(`${reportRoot}/${ai.reportId}/status`), 200, 'regen revision');
        const newer = expect(await post(full, `/api/admin/v1/majorpilot/reports/${ai.reportId}/regenerations`, {
          expectedRevision: status.revision, reasonCode: 'OPERATOR_REQUEST', reason: 'Isolated browser version-race acceptance', evidenceMode: 'REUSE_READY_EVIDENCE',
        }), 202, 'authorized regeneration');
        await until(() => existsSync(`${ROOT}/data/p6-harness/gateway-entered.json`), 'held regeneration', 20000, 250);
        await page.getByText('新版本正在准备；当前已发布报告仍可阅读。', { exact: true }).waitFor();
        assert.equal(await page.locator('textarea[name=reportComment]').inputValue(), comment); releaseGateway();
        await until(async () => expect(await client.call(`${reportRoot}/${ai.reportId}/status`), 200, 'new publication').currentVersionId === newer.reportVersionId, 'new report current');
        await page.getByText('报告已有新版本。当前页面仍保留你正在阅读的版本。', { exact: false }).waitFor({ timeout: 20000 });
        // A simulated transport loss sends no fake success, then the real POST succeeds.
        await page.route('**/api/app/v1/feedback', route => route.abort('internetdisconnected'), { times: 1 });
        await page.getByRole('button', { name: '提交反馈', exact: true }).click(); await page.locator('.report-feedback .error-notice').waitFor();
        assert.equal(await page.locator('textarea[name=reportComment]').inputValue(), comment);
        const receipt = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/app/v1/feedback'));
        await page.getByRole('button', { name: '提交反馈', exact: true }).click(); assert.equal((await receipt).status(), 201);
        await page.getByText('反馈已收到，谢谢你。你的选择与报告不会因此改变。', { exact: true }).waitFor();
        assert.equal(feedback.at(-1).contextPublicId, ai.reportVersionId); assert.equal(feedback.at(-1).comment, comment); assert.equal('answers' in feedback.at(-1), false);
        await page.getByRole('button', { name: '打印', exact: true }).click(); await page.waitForURL('**/print?expectedVersion=*');
        await page.locator('.report-empty').waitFor(); assert.equal(await page.locator('.report-claim').count(), 0); await shot('print-version-conflict');
        // Link was checked before regeneration; expected-version read rejects the race.
        await compareTab.bringToFront(); await compareTab.locator(`.report-sources a[href*="${ai.reportId}"]`).click(); await compareTab.locator('.report-empty').waitFor();
        assert.equal(await compareTab.locator('.report-claim').count(), 0); await shot('source-version-race', compareTab); await compareTab.close();
        console.log(JSON.stringify({ channel, stage: 'old-current feedback, print conflict and source-link race PASS' }));
        gateway('INVALID_ALWAYS'); await completeTask(account, materials[2]); const ba = await reportFor(account, 'BUSINESS_ANALYTICS');
        assert.equal(ba.generationMode, 'DETERMINISTIC_FALLBACK'); assert.ok(ba.sections.every(section => section.claims.every(claim => claim.claimType !== 'BOUNDED_INTERPRETATION')));
        const three = await comparisonFor(account, 3); await view(ba); await page.getByText('部分个性化解释暂不可用；事实、自述和本次成果仍可查看。', { exact: true }).waitFor(); await responsive('fallback-report');
        await view(three, page, '/app/comparison'); assert.equal(await page.locator('.report-dimensions tbody td').count(), 21); await responsive('comparison-three');
        await page.locator('#section-COMMON_DIMENSIONS').evaluate(node => node.scrollIntoView()); await shot('comparison-three-dimensions');
        await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#section-COMMON_DIMENSIONS').evaluate(node => node.scrollIntoView()); await shot('comparison-three-dimension-mobile');
        assert.equal(await page.locator('.report-dimensions').evaluate(node => node.scrollWidth <= innerWidth), true); await page.setViewportSize({ width: 1536, height: 1024 });
        await page.getByRole('button', { name: '打印', exact: true }).click(); await page.waitForURL('**/print?expectedVersion=*');
        await page.waitForFunction(() => { const button = document.querySelector('.report-print-button'); return button && !button.disabled; });
        assert.equal(await page.locator('.report-dimensions tbody td').count(), 21);
        assert.equal(await page.locator('.report-basis-copy').count(), three.sections.reduce((total, section) => total + section.claims.length, 0));
        await page.emulateMedia({ media: 'print' }); await shot('comparison-three-print-css');
        await page.pdf({ path: `${output}/${channel}-comparison-three-print.pdf`, format: 'A4', printBackground: true }); await page.emulateMedia({ media: 'screen' });
        await page.goto(p6Origin + '/app'); await page.locator('.dashboard-reports').waitFor();
        // ALL_COMPLETED deliberately reuses the NEXT section's spacing class;
        // assert semantic children, not absence of that presentation container.
        await page.getByRole('heading', { name: '三个方向，都留下了你的体验。', exact: true }).waitFor();
        assert.equal(await page.locator('.report-next-panel').count(), 0);
        assert.equal(await page.locator('.dashboard-recommendation').count(), 0);
        console.log(JSON.stringify({ channel, stage: 'fallback, 21-cell comparison/print and ALL_COMPLETED without INITIAL PASS' }));
        await page.goto(`${p6Origin}/app/experiences/AI`); await page.getByText('这个正式专业体验已经完成。你可以在个人主页读取报告，不会重复创建本次方向的体验。', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '开始正式体验', exact: true }).count(), 0);
        if (previousReports.length) {
          await page.goto(`${p6Origin}/app/reports/${previousReports[0]}`); await page.locator('.report-empty').waitFor(); assert.equal(await page.locator('.report-claim').count(), 0);
        }
        // Storage contains only scoped comment text, never report bodies.
        await view(ba); await page.locator('.report-feedback').scrollIntoViewIfNeeded(); await page.waitForFunction(() => !document.querySelector('textarea[name=reportComment]').disabled);
        const draft = '仅保存在当前合成账户中的待提交评论。'; await page.locator('textarea[name=reportComment]').fill(draft);
        const storage = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('mp:feedback-comment:v1:')).map(([, value]) => JSON.parse(value)));
        assert.ok(storage.some(item => item.comment === draft)); assert.ok(storage.every(item => Object.keys(item).sort().join(',') === 'comment,expiresAt,owner,versionId'));
        const reportTab = await context.newPage(); await view(ba, reportTab);
        await page.bringToFront(); await page.goto(p6Origin + '/app'); await page.getByRole('button', { name: '退出', exact: true }).click();
        await reportTab.waitForURL('**/login'); assert.equal(await reportTab.locator('.report-claim').count(), 0);
        assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('mp:feedback-comment:v1:'))), false);
        await reportTab.close();
        const finalRead = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/app/v1/events') && response.request().postDataJSON().events.some(event => event.eventName === 'report.viewed' && event.contextPublicId === ba.reportVersionId));
        await login(page, `/app/reports/${ba.reportId}`); await page.locator('.report-section').first().waitFor();
        assert.equal((await finalRead).status(), 202);
        // Revoke only this actual browser Session via the real endpoint, then let
        // reader's next status read detect the missing identity and destroy memory.
        assert.equal((await uiData('/api/app/v1/auth/logout', 'POST', {})).status, 204);
        await page.waitForFunction(() => !document.querySelector('.report-claim'), null, { timeout: 20000 });
        assert.equal(await page.locator('.report-claim').count(), 0);
        await Promise.all(responses).then(values => assert.deepEqual(values.filter(value => value instanceof Error), []));
        assert.deepEqual(errors, []); assert.ok(events.every(event => event.visibleDurationMs >= 1000 && Object.keys(event.properties).length === 0 && !('studentId' in event)));
        assert.ok(events.some(event => event.eventName === 'report.viewed')); assert.ok(events.some(event => event.eventName === 'report.printed')); assert.ok(events.some(event => event.eventName === 'comparison_report.viewed')); assert.ok(events.some(event => event.eventName === 'next_recommendation.viewed'));
        previousReports.push(ai.reportId);
        results.push({ channel, result: 'PASS', reportSections: 9, comparisonSections: 8, dimensionCells: [14, 21], formalTasks: 3, paidCalls: 0,
          scope: 'Real isolated auth/APIs/lifecycle/report jobs; TEST_FIXTURE publication and TEST_REPLAY transport only',
          checks: ['pending→ready; exact real claims', '9/8 sections; 14/21 cells; desktop/tablet/mobile', 'NEXT read-only introduction→choice→explicit start→resume', 'native basis keyboard and same-version private print', 'old-current regeneration; source race and print409', 'optional feedback empty defaults/transport-loss recovery/old version', 'fallback and all-completed no INITIAL fallback', 'cross-account denial; cross-tab logout; live session expiry; comment-only storage'],
        }); console.log(JSON.stringify(results.at(-1)));
      } catch (error) {
        await shot('failure').catch(() => {});
        await writeFile(`${output}/${channel}-failure.json`, JSON.stringify({ name: error.name, message: error.message, urlPath: new URL(page.url()).pathname, pageErrors: errors }, null, 2));
        throw error;
      } finally { releaseGateway(); clearTimeout(deadline); await browser.close(); }
    }
  } catch (error) { failure = error; }
  finally {
    try { releaseGateway(); if (full) await full.call('/logout', { method: 'POST' }); await scope.cleanup(); gateway('PASS'); }
    catch (error) { failure = failure ? new AggregateError([failure, error], 'P6 browser or exact cleanup failed') : error; }
  }
  if (failure) throw failure;
  await writeFile(`${output}/results.json`, JSON.stringify({ result: 'PASS', results, exactCleanup: true, accountsCreated: channels.length, rateLimitsReset: false, paidCalls: 0 }, null, 2));
  console.log('PASS: P6 actual isolated Chrome/Edge business regression; all exact synthetic fixtures cleaned.');
}
export { materials, gateway, releaseGateway, completeTask, reportFor, comparisonFor };
if (invoked) {
  if (args[0] === '--check') console.log('PASS: P6 browser syntax/contract preflight; no accounts or HTTP calls.');
  else await run();
}
