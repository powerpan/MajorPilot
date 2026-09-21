import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { ROOT } from './local-config.mjs';
const runDir = path.join(ROOT, 'data/run');
const logDir = path.join(ROOT, 'logs');
mkdirSync(runDir, { recursive: true, mode: 0o700 });
mkdirSync(logDir, { recursive: true, mode: 0o700 });
const valid = new Set(['mysql', 'redis', 'mailpit', 'backend', 'student', 'admin', 'executor', 'p6-test-backend', 'p6-test-student']);
function file(name) { if (!valid.has(name)) throw new Error('Unknown component'); return path.join(runDir, `${name}.json`); }
function identity(pid) {
  try { return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8' }).trim(); } catch { return null; }
}
export const processInspectionAvailable = () => identity(process.pid) !== null;
function requireInspection() { if (!processInspectionAvailable()) throw new Error('Process inspection is sandbox-restricted. Run this script in a local terminal or via approved escalation; no process was changed.'); }
export function record(name) {
  if (!existsSync(file(name))) return null;
  const r = JSON.parse(readFileSync(file(name), 'utf8'));
  return identity(r.pid) === r.identity ? r : null;
}
export function portOpen(port) {
  return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); socket.setTimeout(400); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
}
export async function waitFor(check, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Component readiness timeout; inspect the named local log (do not share credentials)');
}
export async function start(name, command, args, env, { cwd = ROOT, port } = {}) {
  requireInspection();
  if (record(name)) { console.log(`${name}: already managed`); return; }
  if (port && await portOpen(port)) throw new Error(`${name}: port ${port} occupied by an unmanaged process; not touching it`);
  const fd = openSync(path.join(logDir, `${name}.log`), 'a', 0o600);
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
  child.on('error', () => {});
  closeSync(fd);
  await new Promise(r => setTimeout(r, 350));
  const id = child.pid && identity(child.pid);
  if (!id) throw new Error(`${name}: failed to start; see logs/${name}.log`);
  writeFileSync(file(name), JSON.stringify({ pid: child.pid, identity: id, port }), { mode: 0o600 });
  child.unref();
  if (port) await waitFor(() => portOpen(port), 45000);
  console.log(`${name}: started${port ? ` on 127.0.0.1:${port}` : ''}`);
}
export async function stop(name) {
  requireInspection();
  const r = record(name);
  if (!r) { console.log(`${name}: no matching project-owned process`); return; }
  process.kill(-r.pid, 'SIGTERM');
  await waitFor(() => identity(r.pid) !== r.identity, 30000);
  unlinkSync(file(name));
  console.log(`${name}: stopped (data retained)`);
}
