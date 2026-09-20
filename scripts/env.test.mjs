import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, runtimeEnv } from './env.mjs';
test('env parser does not evaluate shell syntax', () => assert.deepEqual(parseEnv('A=$(whoami)\nB=`id`\nC="some text"'), { A: '$(whoami)', B: '`id`', C: 'some text' }));
test('env parser accepts comments and CRLF', () => assert.deepEqual(parseEnv('# text\r\nA=\r\nB=12\r\n'), { A: '', B: '12' }));
test('duplicate and malformed environment rejected without values', () => { for (const s of ['A=1\nA=SECRET', 'export A=SECRET', 'A=SECRET\0']) assert.throws(() => parseEnv(s), e => !e.message.includes('SECRET')); });
test('frontend environment strips arbitrary inherited credentials', () => { process.env.BAILIAN_API_KEY = 'sensitive-test-value'; process.env.VITE_ACCIDENTAL_SECRET = 'sensitive-test-value'; const env = runtimeEnv(); assert.equal(env.BAILIAN_API_KEY, undefined); assert.equal(env.VITE_ACCIDENTAL_SECRET, undefined); delete process.env.BAILIAN_API_KEY; delete process.env.VITE_ACCIDENTAL_SECRET; });
