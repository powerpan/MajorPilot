import { mkdirSync, existsSync, readFileSync, renameSync, lstatSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = path.join(root, 'data/tools');
const targets = {
  node: { file: 'node-v24.21.0-darwin-arm64.tar.gz', url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.gz', hash: 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057', dir: 'node', strip: true, marker: 'bin/node' },
  npm: { file: 'npm-11.19.1.tgz', url: 'https://registry.npmjs.org/npm/-/npm-11.19.1.tgz', algorithm: 'sha512', hash: 'ztsxKxt/kkIaAs+2i0GU6I+DRmUdrNasxTZKJe9TCdSjKxlhah/4r/hl5ygMD6XAg1qZ9c2TNomR4qgOydp10g==', encoding: 'base64', dir: 'npm', strip: true, marker: 'bin/npm-cli.js' },
  // SHA256 pinned after first download also matched Oracle's published MD5 6e89113f04f2af85d0a164573493db3a.
  mysql: { file: 'mysql-8.4.11-macos15-arm64.tar.gz', url: 'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11-macos15-arm64.tar.gz', hash: 'b96e00493bc3499b9ffd7f08d65c5d64933af0383a8287d9873b64f94c2d6009', dir: 'mysql', strip: true, marker: 'bin/mysqld' },
  redis: { file: 'redis-7.2.16.tar.gz', url: 'https://download.redis.io/releases/redis-7.2.16.tar.gz', hash: '960a8ec15e34ff40e57ff16837b26b33bd81f2da6d24497bb63de532a323a18e', dir: 'redis', strip: true, marker: 'src/redis-server' },
  mailpit: { file: 'mailpit-darwin-arm64.tar.gz', url: 'https://github.com/axllent/mailpit/releases/download/v1.31.2/mailpit-darwin-arm64.tar.gz', hash: 'd0180f1fc6e47908e80657dcf2aa1a3186c70ec45ae20a18243a3a46f618d3c6', dir: 'mailpit', marker: 'mailpit' },
};
function digest(file, target) {
  return createHash(target.algorithm || 'sha256').update(readFileSync(file)).digest(target.encoding || 'hex');
}

/** Cache promotion is atomic; failed/partial downloads never become the canonical archive. */
export function ensureVerifiedArchive(target, archive, download = (url, output) => {
  execFileSync('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '300', url, '-o', output], { stdio: 'inherit' });
}) {
  let quarantinedPath;
  if (existsSync(archive)) {
    if (!lstatSync(archive).isFile() || lstatSync(archive).isSymbolicLink()) throw new Error('Refuse nonregular tool archive');
    if (digest(archive,target) === target.hash) return { cacheHit: true };
    quarantinedPath = `${archive}.invalid-${randomUUID()}`;
    renameSync(archive,quarantinedPath);
  }
  const partial = `${archive}.partial-${randomUUID()}`;
  // On failure this diagnostic partial is retained; another run uses a new unique path.
  download(target.url,partial);
  if (!existsSync(partial) || !lstatSync(partial).isFile() || lstatSync(partial).isSymbolicLink() || digest(partial,target) !== target.hash) throw new Error('Downloaded tool archive checksum mismatch; partial retained, canonical archive unchanged');
  renameSync(partial,archive);
  return { cacheHit: false, ...(quarantinedPath ? { quarantinedPath } : {}) };
}

export function installTools(requested = process.argv.slice(2)) {
  mkdirSync(base, { recursive: true });
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Local binary installer currently supports macOS arm64 only. See README for other hosts.');
  for (const name of requested.length ? requested : Object.keys(targets)) {
  const t = targets[name];
  if (!t) throw new Error('Unknown tool name');
  const dest = path.join(base, t.dir);
  if (existsSync(path.join(dest, t.marker))) { console.log(`${name}: already installed`); continue; }
  const archive = path.join(base, t.file);
  const verified = ensureVerifiedArchive(t,archive);
  if (verified.quarantinedPath) console.log(`${name}: invalid cached archive retained at ${verified.quarantinedPath}; replaced only after checksum verification`);
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', dest, ...(t.strip ? ['--strip-components=1'] : [])], { stdio: 'inherit' });
  if (name === 'redis') execFileSync('make', ['-j4', 'MALLOC=libc', 'BUILD_TLS=no'], { cwd: dest, stdio: 'inherit' });
  console.log(`${name}: installed; archive sha256=${createHash('sha256').update(readFileSync(archive)).digest('hex')}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) installTools();
