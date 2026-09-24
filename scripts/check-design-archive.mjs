import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'docs/archive/2026-09-24-pre-method-led');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(manifest.schemaVersion, 'design-archive-v1');
assert.equal(manifest.files.length, 14);
for (const entry of manifest.files) {
  assert.match(entry.archive, /^(?:[0-9]{2}-|adr\/[0-9]{4}-)[a-z0-9-]+\.md$/);
  const archive = fs.readFileSync(path.join(directory, entry.archive), 'utf8');
  assert.equal(hash(archive), entry.sha256, `${entry.archive}: archive changed`);
  let original = entry.linkTransformation === 'none' ? archive : archive.replace(/(\[[^\]]*\]\()\.\.\/\.\.\/([^)]+)(\))/g, '$1$2$3');
  if (entry.hardBreakLines) original = original.split('\n').map((line, index) => entry.hardBreakLines.includes(index + 1) ? line.replace(/<br>$/, '  ') : line).join('\n');
  assert.equal(hash(original), entry.sourceSha256, `${entry.archive}: source reconstruction`);
  assert.equal(entry.hadUncommittedChanges, entry.sourceSha256 !== entry.committedSourceSha256);
  assert(fs.readFileSync(path.join(root, entry.source), 'utf8').includes('已撤下的旧设计入口'));
}
console.log('PASS: 14 archived designs, source reconstruction and withdrawal entries');
