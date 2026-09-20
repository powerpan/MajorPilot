import { execFileSync } from 'node:child_process';
import { ROOT } from './local-config.mjs';
import { runtimeEnv } from './env.mjs';
execFileSync(`${ROOT}/backend/mvnw`, [`-Dmaven.repo.local=${ROOT}/.local/m2`, 'test'], { cwd: `${ROOT}/backend`, env: { ...runtimeEnv({ secrets: true }), MP_RUN_MYSQL_TESTS: 'true', MAVEN_USER_HOME: `${ROOT}/data/maven-user` }, stdio: 'inherit' });
