import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { materializeBackendArtifact } from './runtime-artifact.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'majorpilot-runtime-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'built.jar');
  writeFileSync(source, 'synthetic jar bytes v1');
  return { source, runtimeDirectory: path.join(root, 'runtime') };
}
test('runtime artifact is an independent read-only copy and same bytes reuse it', t => {
  const options = fixture(t), first = materializeBackendArtifact(options), second = materializeBackendArtifact(options);
  assert.equal(first.reused, false); assert.equal(second.reused, true); assert.equal(first.path, second.path);
  assert.equal(readFileSync(first.path, 'utf8'), 'synthetic jar bytes v1');
  assert.notEqual(statSync(first.path).ino, statSync(options.source).ino);
  assert.equal(statSync(first.path).mode & 0o222, 0);
});
test('a later mutable build cannot change an already materialized runtime artifact', t => {
  const options = fixture(t), first = materializeBackendArtifact(options);
  writeFileSync(options.source, 'synthetic jar bytes v2');
  const second = materializeBackendArtifact(options);
  assert.notEqual(first.path, second.path); assert.notEqual(first.sha256, second.sha256);
  assert.equal(readFileSync(first.path, 'utf8'), 'synthetic jar bytes v1');
  assert.equal(readFileSync(second.path, 'utf8'), 'synthetic jar bytes v2');
});
test('corrupted existing content-addressed artifact is rejected, not silently overwritten', t => {
  const options = fixture(t), artifact = materializeBackendArtifact(options);
  chmodSync(artifact.path, 0o600);writeFileSync(artifact.path, 'corrupted fixture');
  assert.throws(() => materializeBackendArtifact(options), /integrity check failed/);
  assert.equal(readFileSync(artifact.path, 'utf8'), 'corrupted fixture');
});
test('symbolic-link source is rejected', t => {
  const options = fixture(t), linked = options.source + '.link';symlinkSync(options.source, linked);
  assert.throws(() => materializeBackendArtifact({ ...options, source: linked }), /regular file/);
});
