// Focused print regression. --mock is UI-only and intercepts every API request.
// --actual creates ONE scoped Student through real auth, completes actual test-source
// STANDARD tasks via the shared HTTP helper, and reuses it in Chrome and Edge.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createP6FixtureScope, p6Origin } from '../../scripts/lib/p6-student-fixture.mjs';
import { materials, gateway, releaseGateway, completeTask, reportFor, comparisonFor } from './p6.mjs';
const mode = process.argv[2]; assert.ok(['--mock', '--actual', '--check'].includes(mode));
if (mode === '--check') console.log('PASS: focused P6 print syntax/preconditions; no accounts or HTTP');
else await run();
function canonical(text) { return text.normalize('NFC').replace(/\s+/gu, ''); }
function count(text, needle) { let n = 0, from = 0; while ((from = text.indexOf(needle, from)) >= 0) { n++; from += needle.length; } return n; }
export function assertPdfText(text, report) {
  const all = canonical(text), required = new Map();
  for (const section of report.sections) {
    assert.ok(all.includes(canonical(section.title)), `PDF missing section ${section.sectionKey}`);
    for (const claim of section.claims) for (const value of [claim.text, claim.basisSummary]) {
      const key = canonical(value); if (key) required.set(key, (required.get(key) || 0) + 1);
    }
  }
  for (const [value, needed] of required) assert.ok(count(all, value) >= needed, `PDF lost a claim/basis occurrence: need ${needed}, got ${count(all, value)}; content suppressed`);
  assert.ok(all.includes(report.reportVersionId), 'Print version ID absent');
  assert.ok(all.includes('体验总结，不是适配度测试或录取判断。'));
}
async function run() {
  const mock = mode === '--mock', output = `/tmp/majorpilot-p6-print-${mock ? 'mock' : 'actual'}`;
  await mkdir(output, { recursive: true });
  let scope, account, reports, failure;
  const results = [];
  try {
    if (mock) reports = ['ai', 'comparison-3'].map(name => JSON.parse(readFileSync(new URL(`../../contracts/examples/reports/${name}.json`, import.meta.url), 'utf8')));
    else {
      scope = createP6FixtureScope(); account = await scope.student(); gateway('PASS');
      const experiences = [];
      for (const material of materials) { await completeTask(account, material); experiences.push(await reportFor(account, material.major)); }
      reports = [experiences[0], await comparisonFor(account, 3)];
    }
    for (const channel of ['chrome', 'msedge']) {
      const browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true });
      const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, reducedMotion: 'reduce' });
      context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
      const page = await context.newPage(), errors = [], unknown = [];
      const deadline = setTimeout(() => void browser.close(), 180000);
      page.on('pageerror', error => errors.push(error.message));
      let current;
      if (mock) await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname; let data;
        if (path === '/api/app/v1/me') data = { studentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', email: 'print-ui-only@example.invalid', status: 'ACTIVE', emailVerified: true, canStartExperience: true };
        else if (path.endsWith('/auth/csrf')) data = { csrfToken: 'ui-only' };
        else if (path === `/api/app/v1/reports/${current.reportId}/print`) data = current;
        else if (path.endsWith('/status')) data = { reportId: path.split('/').at(-2), status: 'READY', currentVersionId: current.sources.find(source => source.sourceReport?.reportId === path.split('/').at(-2))?.sourceReport?.reportVersionId || current.reportVersionId, generation: null, revision: 1 };
        else { unknown.push(path); await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND' } }) }); return; }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId: 'ui-only', apiVersion: 'v1' } }) });
      });
      try {
        if (!mock) {
          await page.goto(`${p6Origin}/login`); await page.locator('#auth-email').fill(account.email); await page.locator('#auth-password').fill(account.password);
          await page.locator('.auth-form button[type=submit]').click(); await page.waitForURL(p6Origin + '/app');
        }
        for (const report of reports) {
          current = report; const type = report.reportType.toLowerCase(), path = `${output}/${channel}-${type}.pdf`;
          await page.goto(`${mock ? 'http://localhost:15173' : p6Origin}/app/reports/${report.reportId}/print?expectedVersion=${report.reportVersionId}`);
          await page.locator('.report-section').first().waitFor(); assert.equal(await page.locator('.report-section').count(), report.sections.length);
          await page.emulateMedia({ media: 'print' });
          // A4's CSS width also activates unqualified width media queries. Measure
          // the print geometry itself, not only a 1536px screen-emulated DOM.
          await page.setViewportSize({ width: 794, height: 1123 });
          const geometry = await page.locator('.report-dimensions').count() ? await page.locator('.report-dimensions').evaluate(table => ({
            table: table.getBoundingClientRect().toJSON(), first: table.querySelector('th').getBoundingClientRect().toJSON(),
            last: table.querySelector('tbody tr td:last-child').getBoundingClientRect().toJSON(), firstWidth: getComputedStyle(table.querySelector('th')).width,
          })) : null;
          const dimensionLabels = await page.locator('.report-dimensions tbody th').allTextContents();
          const majorLabels = await page.locator('.report-dimensions thead th:not(:first-child)').allTextContents();
          if (report.reportType === 'COMPARISON') {
            assert.equal(dimensionLabels.length, 7); assert.equal(majorLabels.length, 3);
            assert.equal(await page.locator('.report-dimensions td').count(), 21);
          }
          await page.screenshot({ path: `${output}/${channel}-${type}-print-dom.png`, fullPage: false });
          await page.pdf({ path, format: 'A4', printBackground: true });
          const text = execFileSync('/opt/homebrew/bin/pdftotext', ['-raw', path, '-'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
          const info = execFileSync('/opt/homebrew/bin/pdfinfo', [path], { encoding: 'utf8' });
          const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
          await writeFile(`${output}/${channel}-${type}-text.txt`, text);
          await writeFile(`${output}/${channel}-${type}-geometry.json`, JSON.stringify({ geometry, pages }, null, 2));
          console.log(JSON.stringify({ scope: mock ? 'MOCK UI ONLY' : 'REAL isolated test-source reports', channel, type, pages, firstColumnWidth: geometry?.first.width, tableWidth: geometry?.table.width, lastCellRight: geometry?.last.right }));
          assertPdfText(text, report);
          for (const label of [...dimensionLabels, ...majorLabels]) assert.ok(canonical(text).includes(canonical(label)), 'PDF lost a dimension or major heading');
          if (geometry) { assert.ok(geometry.first.width < geometry.table.width * 0.5); assert.ok(geometry.last.right <= geometry.table.right + 1); }
          const perPage = text.split('\f').slice(0, pages).map(part => canonical(part).length);
          assert.ok(perPage.every(length => length >= 40), 'A nearly blank intermediate page indicates print fragmentation');
          const lastPage = canonical(text.split('\f')[pages - 1]);
          assert.ok(report.sections.some(section => section.claims.some(claim => lastPage.includes(canonical(claim.text)))), 'Version footer orphaned on a page without report content');
          execFileSync('/opt/homebrew/bin/pdftoppm', ['-r', '80', '-png', path, `${output}/${channel}-${type}-page`], { stdio: 'pipe', timeout: 30000 });
          results.push({ channel, type, pages, claims: report.sections.reduce((total, section) => total + section.claims.length, 0), comparisonCells: report.reportType === 'COMPARISON' ? 21 : 0, everyClaimAndBasisInPdf: true, pageTextLengths: perPage });
          await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1536, height: 1024 });
        }
        assert.deepEqual(errors, []); assert.deepEqual(unknown, []);
      } finally { clearTimeout(deadline); await browser.close(); }
    }
  } catch (error) { failure = error; }
  finally { if (scope) { try { releaseGateway(); await scope.cleanup(); gateway('PASS'); } catch (error) { failure = failure ? new AggregateError([failure, error], 'Print regression/cleanup failed') : error; } } }
  if (failure) throw failure;
  await writeFile(`${output}/results.json`, JSON.stringify({ result: 'PASS', mock, accountsCreated: mock ? 0 : 1, exactCleanup: true, paidCalls: 0, results }, null, 2));
  console.log(`PASS: ${mock ? 'UI-only' : 'actual isolated'} two-browser PDF text and geometry; rendered pages require visual review.`);
}
