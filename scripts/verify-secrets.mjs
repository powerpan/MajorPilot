import { readdirSync, readFileSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
import { readLocalEnv, parseEnv } from './env.mjs';
const environments = [readLocalEnv()];
// Test identities are private too. Read only this documented, ignored file,
// never follow a symlink or scan arbitrary environment stores.
const harnessEnvironment = path.join(ROOT, '.env.p6-test.local');
if (existsSync(harnessEnvironment)) {
  const stat = lstatSync(harnessEnvironment);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('P6 test environment must be a mode-600 regular file; values suppressed');
  environments.push(parseEnv(readFileSync(harnessEnvironment, 'utf8')));
}
const secrets = [...new Set(environments.flatMap(environment => Object.entries(environment).filter(([k,v]) => /KEY|SECRET|PASSWORD/.test(k) && v.length >= 12).map(([,v]) => v)))];
// The test Operator uses the first 20 characters to honor RuoYi's retained
// password-length contract; check the actual credential as well as its seed.
for (const environment of environments) if (environment.MP_P6_RUN_TAG && environment.MP_P0_ADMIN_PASSWORD?.length === 64) secrets.push(environment.MP_P0_ADMIN_PASSWORD.slice(0, 20));
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
