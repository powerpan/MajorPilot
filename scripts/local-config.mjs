import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PORTS = Object.freeze({ backend: 18080, mysql: 13306, redis: 16380, smtp: 11025, mail: 18025, student: 15173, admin: 15174, executor: 15175 });
export const TOOL = path.join(ROOT, 'data/tools');
export const JAVA_HOME = process.env.MP_JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
