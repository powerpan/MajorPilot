import { execFileSync } from 'node:child_process';
import { ROOT, TOOL } from './local-config.mjs';
import { runtimeEnv } from './env.mjs';
const env = runtimeEnv();
for (const name of ['admin-web', 'student-web', 'contracts', 'executor']) {
  const stages = [['ci', '--cache', `${ROOT}/data/npm-cache`, '--no-audit', '--no-fund']];
  if (name === 'admin-web') stages.push(['run', 'typecheck'], ['run', 'build:prod']);
  if (name === 'student-web') stages.push(['run', 'build']);
  if (name === 'contracts') stages.push(['run', 'check']);
  for (const args of stages) execFileSync(`${TOOL}/node/bin/node`, [`${TOOL}/npm/bin/npm-cli.js`, ...args], { cwd: `${ROOT}/${name}`, env, stdio: 'inherit' });
}
execFileSync(`${TOOL}/node/bin/node`, [`${ROOT}/executor/build-classifier.mjs`, '--write'], { cwd: ROOT, env, stdio: 'inherit' });
execFileSync(`${TOOL}/node/bin/node`, [`${ROOT}/executor/build-ds.mjs`, '--write'], { cwd: ROOT, env, stdio: 'inherit' });
execFileSync(`${TOOL}/node/bin/node`, [`${TOOL}/npm/bin/npm-cli.js`, 'ci', '--cache', `${ROOT}/data/npm-cache`, '--no-audit', '--no-fund'], { cwd: `${ROOT}/tests/e2e`, env, stdio: 'inherit' });
execFileSync(`${ROOT}/backend/mvnw`, [`-Dmaven.repo.local=${ROOT}/.local/m2`, '-DskipTests', 'package'], { cwd: `${ROOT}/backend`, env: { ...env, MAVEN_USER_HOME: `${ROOT}/data/maven-user` }, stdio: 'inherit' });
