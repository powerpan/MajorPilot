import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
import { readLocalEnv } from './env.mjs';
const secrets = Object.entries(readLocalEnv()).filter(([k,v]) => /KEY|SECRET|PASSWORD/.test(k) && v.length >= 12).map(([,v]) => v);
secrets.push('MAJORPILOT_TEST_SECRET_DO_NOT_SHIP_91d370');
const skipped = new Set(['.git', '.local', '.agents', '.codex', 'node_modules', 'target', 'artifacts']);
let files = 0;
const failures = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Only the root data directory is private runtime state. src/data is source.
    if (dir === ROOT && entry.name === 'data') continue;
    if (skipped.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example')) continue;
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.isFile()) continue;
    files++;
    const data = readFileSync(file);
    // This scanner contains its own canary literal; real secrets still checked here.
    const tested = file.endsWith('/scripts/verify-secrets.mjs') ? secrets.slice(0, -1) : secrets;
    if (tested.some(secret => data.includes(Buffer.from(secret)))) failures.push(path.relative(ROOT, file));
  }
}
walk(ROOT);
console.log(JSON.stringify({ filesScanned: files, scope: 'source, frontend dist, logs; local secrets/dependencies/Java binaries excluded', leakedFiles: failures, result: failures.length ? 'FAIL' : 'PASS' }, null, 2));
process.exitCode = failures.length ? 1 : 0;
