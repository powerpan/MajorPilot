import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { mysqlArguments } from './infra.mjs';
import { ROOT } from './local-config.mjs';
import { ensureVerifiedArchive } from './install-tools.mjs';

// Argument-only regression: never opens a DB, reads user option files, or exposes credentials.
test('normal MySQL commands isolate project option file and force project Unix socket', () => {
  assert.deepEqual(mysqlArguments(), [
    `--defaults-file=${path.join(ROOT, 'data/mysql-client.cnf')}`,
    '--no-login-paths',
    '--protocol=SOCKET',
    `--socket=${path.join(ROOT, 'data/mysql.sock')}`,
    '--user=root', '--batch', '--skip-column-names',
  ]);
});

test('bootstrap MySQL commands disable both ordinary option files and login-path files', () => {
  assert.deepEqual(mysqlArguments({ bootstrap: true }), [
    '--no-defaults', '--no-login-paths', '--protocol=SOCKET',
    `--socket=${path.join(ROOT, 'data/mysql.sock')}`,
    '--user=root', '--batch', '--skip-column-names',
  ]);
});

test('no MySQL command enables inherited defaults, network transport, or command-line password', () => {
  for (const args of [mysqlArguments(), mysqlArguments({ bootstrap: true })]) {
    assert.equal(args.some(arg => /--defaults-extra-file|--password|--protocol=TCP|--host=/u.test(arg)), false);
    assert.equal(args.filter(arg => arg.startsWith('--socket=')).length, 1);
    assert.equal(path.isAbsolute(args.find(arg => arg.startsWith('--socket=')).slice('--socket='.length)), true);
  }
});

function archiveFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'majorpilot-installer-test-'));
  // This directory holds only flat files created by this test, never user tool/data paths.
  t.after(() => { for (const file of readdirSync(directory)) unlinkSync(path.join(directory,file)); rmdirSync(directory); });
  const bytes = Buffer.from('synthetic-verified-archive');
  return { directory, archive: path.join(directory,'test.tgz'), bytes, target: { url: 'https://example.invalid/not-fetched', hash: createHash('sha256').update(bytes).digest('hex') } };
}

test('verified installer cache does not redownload', t => {
  const { archive, bytes, target } = archiveFixture(t);
  let downloads = 0;
  const download = (_,output) => { downloads++; writeFileSync(output,bytes); };
  assert.equal(ensureVerifiedArchive(target,archive,download).cacheHit,false);
  assert.equal(ensureVerifiedArchive(target,archive,download).cacheHit,true);
  assert.equal(downloads,1);
});

test('interrupted download is not promoted and next attempt can succeed', t => {
  const { archive, bytes, target } = archiveFixture(t);
  assert.throws(() => ensureVerifiedArchive(target,archive,(_,output) => { writeFileSync(output,'partial'); throw new Error('simulated interruption'); }));
  assert.equal(existsSync(archive),false);
  ensureVerifiedArchive(target,archive,(_,output) => writeFileSync(output,bytes));
  assert.deepEqual(readFileSync(archive),bytes);
});

test('bad cached archive is quarantined without deletion before replacement', t => {
  const { archive, bytes, target } = archiveFixture(t);
  writeFileSync(archive,'invalid-old-cache');
  const result = ensureVerifiedArchive(target,archive,(_,output) => writeFileSync(output,bytes));
  assert.equal(readFileSync(result.quarantinedPath,'utf8'),'invalid-old-cache');
  assert.deepEqual(readFileSync(archive),bytes);
});

test('checksum-mismatched download is never promoted to canonical archive', t => {
  const { archive, target } = archiveFixture(t);
  assert.throws(() => ensureVerifiedArchive(target,archive,(_,output) => writeFileSync(output,'unverified')),/checksum mismatch/u);
  assert.equal(existsSync(archive),false);
});
