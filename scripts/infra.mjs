import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, TOOL, PORTS } from './local-config.mjs';
import { readLocalEnv, runtimeEnv } from './env.mjs';
import { start, stop, waitFor, record } from './processes.mjs';
const mysql = path.join(TOOL, 'mysql/bin/mysql');
const mysqld = path.join(TOOL, 'mysql/bin/mysqld');
const datadir = path.join(ROOT, 'data/mysql');
const socket = path.join(ROOT, 'data/mysql.sock');
const config = path.join(ROOT, 'data/mysql-client.cnf');
export function mysqlArguments({ bootstrap = false } = {}) {
  return [...(bootstrap ? ['--no-defaults'] : [`--defaults-file=${config}`]), '--no-login-paths', '--protocol=SOCKET', `--socket=${socket}`, '--user=root', '--batch', '--skip-column-names'];
}
export function mysqlCommand(sql, { bootstrap = false } = {}) {
  try { return execFileSync(mysql, mysqlArguments({ bootstrap }), { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { throw new Error('MySQL command failed; SQL and credentials suppressed'); }
}
export async function startInfra({ bootstrap = false } = {}) {
  const vars = readLocalEnv();
  for (const name of ['MP_DB_PASSWORD', 'MP_DB_ROOT_PASSWORD', 'MP_REDIS_PASSWORD']) if (!/^[a-zA-Z0-9_-]{24,128}$/.test(vars[name] || '')) throw new Error(`${name}: require 24-128 alphanumeric characters`);
  const env = runtimeEnv();
  mkdirSync(path.join(ROOT, 'data'), { recursive: true, mode: 0o700 });
  chmodSync(path.join(ROOT, 'data'), 0o700);
  if (!existsSync(path.join(datadir, 'mysql'))) {
    if (!bootstrap) throw new Error('Database not initialized; run bootstrap-local first');
    mkdirSync(datadir, { recursive: true, mode: 0o700 });
    execFileSync(mysqld, ['--no-defaults', `--basedir=${TOOL}/mysql`, `--datadir=${datadir}`, '--initialize-insecure', '--log-error-verbosity=1'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
  }
  // This project runs one local standalone MySQL instance and has no replica or
  // point-in-time recovery workflow. MySQL 8.4 enables binary logging by
  // default, so disable it explicitly to avoid retaining multi-gigabyte test
  // traffic in the ignored local data directory.
  const args = ['--no-defaults', `--basedir=${TOOL}/mysql`, `--datadir=${datadir}`, `--socket=${socket}`, '--bind-address=127.0.0.1', `--port=${PORTS.mysql}`, '--mysqlx=OFF', '--skip-log-bin', '--default-time-zone=+00:00', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_0900_ai_ci', '--log-error-verbosity=2'];
  if (!existsSync(config)) {
    await start('mysql', mysqld, [...args, '--skip-networking'], env);
    await waitFor(() => { try { return mysqlCommand('SELECT 1;', { bootstrap: true }).trim() === '1'; } catch { return false; } });
    mysqlCommand(`ALTER USER 'root'@'localhost' IDENTIFIED BY '${vars.MP_DB_ROOT_PASSWORD}'; CREATE DATABASE IF NOT EXISTS majorpilot CHARACTER SET utf8mb4; CREATE DATABASE IF NOT EXISTS majorpilot_test CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'majorpilot'@'127.0.0.1' IDENTIFIED BY '${vars.MP_DB_PASSWORD}'; GRANT ALL ON majorpilot.* TO 'majorpilot'@'127.0.0.1'; GRANT ALL ON majorpilot_test.* TO 'majorpilot'@'127.0.0.1';`, { bootstrap: true });
    writeFileSync(config, `[client]\nuser=root\npassword=${vars.MP_DB_ROOT_PASSWORD}\nsocket=${socket}\n`, { mode: 0o600 });
    await stop('mysql');
  }
  await start('mysql', mysqld, args, env, { port: PORTS.mysql });
  await waitFor(() => { try { return mysqlCommand('SELECT 1;').trim() === '1'; } catch { return false; } });
  mkdirSync(path.join(ROOT, 'data/redis'), { recursive: true, mode: 0o700 });
  const redisConfig = path.join(ROOT, 'data/redis.conf');
  writeFileSync(redisConfig, `bind 127.0.0.1\nport ${PORTS.redis}\nprotected-mode yes\nrequirepass ${vars.MP_REDIS_PASSWORD}\ndir ${ROOT}/data/redis\nappendonly yes\nappendfsync everysec\n`, { mode: 0o600 });
  await start('redis', `${TOOL}/redis/src/redis-server`, [redisConfig], env, { port: PORTS.redis });
  await start('mailpit', `${TOOL}/mailpit/mailpit`, ['--listen', `127.0.0.1:${PORTS.mail}`, '--smtp', `127.0.0.1:${PORTS.smtp}`, '--database', path.join(ROOT, 'data/mailpit.db')], env, { port: PORTS.mail });
}
if (process.argv[1] === new URL(import.meta.url).pathname) await startInfra({ bootstrap: process.argv.includes('--bootstrap') });
