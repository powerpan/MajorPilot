import { readFileSync, lstatSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, TOOL, JAVA_HOME } from './local-config.mjs';

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m || Object.hasOwn(values, m[1])) throw new Error('Invalid or duplicate environment variable; values suppressed');
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.includes('\0') || v.includes('\r')) throw new Error('Invalid environment value; suppressed');
    values[m[1]] = v;
  }
  return values;
}
export function readLocalEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) throw new Error('Missing .env.local; run node scripts/configure-local.mjs');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('.env.local must be a regular file with mode 600');
  return parseEnv(readFileSync(file, 'utf8'));
}
export function runtimeEnv({ secrets = false } = {}) {
  // Frontends receive only a small allowlist, never inherited provider credentials.
  const clean = Object.fromEntries(['HOME', 'USER', 'TMPDIR', 'LANG', 'TERM', 'CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  clean.PATH = `${TOOL}/node/bin:${JAVA_HOME}/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
  clean.JAVA_HOME = JAVA_HOME;
  if (secrets) Object.assign(clean, readLocalEnv());
  return clean;
}
