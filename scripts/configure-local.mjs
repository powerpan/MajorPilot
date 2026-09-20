import { existsSync, readFileSync, writeFileSync, chmodSync, lstatSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
import { parseEnv } from './env.mjs';
const file = path.join(ROOT, '.env.local');
if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())) throw new Error('Refuse nonregular env file');
const original = existsSync(file) ? readFileSync(file, 'utf8') : '';
const present = parseEnv(original);
const defaults = {
  MP_DB_URL: 'jdbc:mysql://127.0.0.1:13306/majorpilot?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC',
  MP_DB_USERNAME: 'majorpilot', MP_DB_PASSWORD: randomBytes(24).toString('hex'),
  MP_DB_ROOT_PASSWORD: randomBytes(24).toString('hex'),
  MP_REDIS_HOST: '127.0.0.1', MP_REDIS_PORT: '16380', MP_REDIS_PASSWORD: randomBytes(24).toString('hex'),
  MP_ADMIN_TOKEN_SECRET: randomBytes(48).toString('hex'), MP_CSRF_SECRET: randomBytes(48).toString('hex'),
  MP_P0_STUDENT_PASSWORD: randomBytes(24).toString('hex'), MP_P0_ADMIN_PASSWORD: randomBytes(15).toString('base64url'),
  MP_STUDENT_ORIGIN: 'http://localhost:15173', MP_SMTP_HOST: '127.0.0.1', MP_SMTP_PORT: '11025',
};
// RuoYi's retained admin password contract caps at 20 characters. 15 random bytes
// encode to exactly 20 base64url characters (120 bits); student auth is separate.
const rotateAdmin = process.argv.includes('--rotate-p0-admin');
const lines = Object.entries(defaults).filter(([k]) => !Object.hasOwn(present, k) || !present[k] || (rotateAdmin && k === 'MP_P0_ADMIN_PASSWORD'));
const missing = lines.filter(([k]) => !Object.hasOwn(present, k));
const replacements = Object.fromEntries(lines.filter(([k]) => Object.hasOwn(present,k)));
const updated = original.split(/\r?\n/).map(line => { const key=line.split('=',1)[0]; return Object.hasOwn(replacements,key) ? `${key}=${replacements[key]}` : line; }).join('\n');
if (lines.length) writeFileSync(file, `${updated}${updated.endsWith('\n') ? '' : '\n'}\n# Generated local-only P0 credentials; never commit.\n${missing.map(([k,v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });
chmodSync(file, 0o600);
console.log(JSON.stringify({ initializedVariables: lines.map(([k]) => k), existingNonemptyValuesPreservedExceptExplicitAdminRotation: true, adminRotationRequested: rotateAdmin, mode: '600' }));
