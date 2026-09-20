import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ROOT, TOOL, JAVA_HOME, PORTS } from './local-config.mjs';
import { readLocalEnv, runtimeEnv } from './env.mjs';
import { portOpen, record, processInspectionAvailable } from './processes.mjs';
const checks = [];
for (const [name, command, args, expected] of [
  ['java', `${JAVA_HOME}/bin/java`, ['-version'], /version "21\./],
  ['node', `${TOOL}/node/bin/node`, ['--version'], /^v24\.21\.0/],
  ['npm', `${TOOL}/node/bin/node`, [`${TOOL}/npm/bin/npm-cli.js`, '--version'], /^11\.19\.1/],
  ['mysql', `${TOOL}/mysql/bin/mysqld`, ['--version'], /8\.4\.11/],
  ['redis', `${TOOL}/redis/src/redis-server`, ['--version'], /v=7\.2\.16/],
  ['mailpit', `${TOOL}/mailpit/mailpit`, ['version'], /1\.31\.2/],
]) {
  try { const text = execFileSync(command, args, { env: runtimeEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); checks.push({ name, pass: expected.test(text), version: text.trim().split('\n')[0] }); }
  catch (err) { const stderr = err.stderr?.toString() || ''; checks.push({ name, pass: expected.test(stderr), version: expected.test(stderr) ? stderr.split('\n')[0] : 'unavailable' }); }
}
// java -version writes to stderr with exit=0; use explicit stream capture below.
const { spawnSync } = await import('node:child_process');
const java = spawnSync(`${JAVA_HOME}/bin/java`, ['-version'], { encoding: 'utf8' });
checks[0] = { name: 'java', pass: /version "21\./.test(java.stderr || ''), version: (java.stderr || '').split('\n')[0] };
try {
  const env = readLocalEnv();
  for (const key of ['MP_DB_URL', 'MP_DB_USERNAME', 'MP_DB_PASSWORD', 'MP_REDIS_PASSWORD', 'MP_ADMIN_TOKEN_SECRET', 'MP_CSRF_SECRET', 'MP_P0_ADMIN_PASSWORD', 'MP_P0_STUDENT_PASSWORD']) checks.push({ name: key, pass: !!env[key], value: 'suppressed' });
  checks.push({ name: 'BAILIAN_API_KEY', pass: env.MAJORPILOT_AI_MODE !== 'bailian' || !!env.BAILIAN_API_KEY, configured: !!env.BAILIAN_API_KEY, required: env.MAJORPILOT_AI_MODE === 'bailian', value: 'suppressed' });
  for (const key of ['MP_P2_DEMO_ENABLED', 'MP_CONTENT_PREVIEW_ENABLED', 'MP_EXPERIENCE_AI_ENABLED']) checks.push({ name: key, pass: env[key] === undefined || ['true', 'false'].includes(env[key]), enabled: env[key] === 'true' });
} catch (err) { checks.push({ name: '.env.local', pass: false, reason: err.message }); }
checks.push({ name: 'maven-wrapper', pass: existsSync(`${ROOT}/backend/mvnw`) });
const ports = [];
for (const [name, port] of Object.entries(PORTS)) ports.push({ name, port, listening: await portOpen(port), managed: processInspectionAvailable() ? !!record(name === 'mail' || name === 'smtp' ? 'mailpit' : name) : 'unknown: process inspection sandbox-restricted' });
console.log(JSON.stringify({ checks, ports, pass: checks.every(c => c.pass) }, null, 2));
process.exitCode = checks.every(c => c.pass) ? 0 : 1;
