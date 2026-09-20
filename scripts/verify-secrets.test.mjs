import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './local-config.mjs';

test('secret scanner includes nested source data directories', () => {
  const fixture = mkdtempSync(path.join(ROOT, 'secret-scan-fixture-'));
  const directory = path.join(fixture, 'src', 'data');
  try {
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'synthetic-canary.txt');
    writeFileSync(file, ['MAJORPILOT', 'TEST_SECRET_DO_NOT_SHIP_91d370'].join('_'));
    const result = spawnSync(process.execPath, ['scripts/verify-secrets.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 1, 'Nested source canary must block delivery');
    const report = JSON.parse(result.stdout);
    assert.ok(report.leakedFiles.includes(path.relative(ROOT, file)));
  } finally {
    // This exact mkdtemp directory contains only this test's synthetic fixture.
    rmSync(fixture, { recursive: true });
  }
});
