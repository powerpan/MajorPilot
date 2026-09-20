import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TOOL } from './local-config.mjs';
import { runtimeEnv, readLocalEnv } from './env.mjs';
import { mysqlCommand, startInfra } from './infra.mjs';
import { stop } from './processes.mjs';
const vars = readLocalEnv();
function redis(...args) { return execFileSync(`${TOOL}/redis/src/redis-cli`, ['-h', '127.0.0.1', '-p', '16380', ...args], { env: { ...runtimeEnv(), REDISCLI_AUTH: vars.MP_REDIS_PASSWORD }, encoding: 'utf8' }).trim(); }
const id = randomUUID();
mysqlCommand('CREATE DATABASE IF NOT EXISTS majorpilot_infra_test; CREATE TABLE IF NOT EXISTS majorpilot_infra_test.mp_p0_probe (id CHAR(36) PRIMARY KEY, note VARCHAR(30));');
mysqlCommand(`INSERT INTO majorpilot_infra_test.mp_p0_probe VALUES ('${id}', 'synthetic-only');`);
assert.equal(redis('SET', `mp:p0:probe:${id}`, 'synthetic-only', 'EX', '600'), 'OK');
if (!process.argv.includes('--no-restart')) { await stop('mysql'); await stop('redis'); await startInfra(); }
assert.equal(mysqlCommand(`SELECT note FROM majorpilot_infra_test.mp_p0_probe WHERE id='${id}';`).trim(), 'synthetic-only');
assert.equal(redis('GET', `mp:p0:probe:${id}`), 'synthetic-only');
mysqlCommand(`START TRANSACTION; INSERT INTO majorpilot_infra_test.mp_p0_probe VALUES ('${randomUUID()}', 'rollback'); ROLLBACK;`);
assert.equal(mysqlCommand("SELECT COUNT(*) FROM majorpilot_infra_test.mp_p0_probe WHERE note='rollback';").trim(), '0');
mysqlCommand(`DELETE FROM majorpilot_infra_test.mp_p0_probe WHERE id='${id}';`);
redis('DEL', `mp:p0:probe:${id}`);
assert.ok((await fetch('http://127.0.0.1:18025/api/v1/info')).ok);
console.log(JSON.stringify({ mysqlVersion: mysqlCommand('SELECT VERSION();').trim(), redisVersion: redis('INFO', 'server').match(/redis_version:(.*)/)?.[1].trim(), persistenceAcrossProcessRestart: !process.argv.includes('--no-restart'), transactionRollback: true, mailpitHttp: true, syntheticProbeRowsRemoved: true, result: 'PASS' }));
