import { spawn } from 'node:child_process';
import { runtimeEnv } from './env.mjs';
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/with-env.mjs <backend command> [args]');
const child = spawn(command, args, { env: runtimeEnv({ secrets: true }), stdio: 'inherit' });
child.on('error', () => { console.error('Command failed to start; environment values suppressed'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
