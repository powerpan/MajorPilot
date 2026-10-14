import test from 'node:test';
import assert from 'node:assert/strict';
import {executorConfig} from '../config.mjs';
test('local calculator retains its dedicated loopback surface',()=>{
  assert.deepEqual(executorConfig({}),{host:'127.0.0.1',port:15175,parentOrigin:'http://localhost:15173',requestHost:'127.0.0.1:15175'});
});
test('pilot stays loopback with a different HTTPS hostname',()=>{
  const env={MP_EXECUTOR_MODE:'pilot',MP_STUDENT_ORIGIN:'https://student.example.org',MP_EXECUTOR_ORIGIN:'https://executor.example.org'};
  assert.equal(executorConfig(env).requestHost,'executor.example.org');assert.equal(executorConfig(env).host,'127.0.0.1');
  for(const invalid of ['http://executor.example.org','https://student.example.org','https://executor.example.org/path','https://secret@executor.example.org','https://executor.example.org:8080','https://executor.example.org/'])assert.throws(()=>executorConfig({...env,MP_EXECUTOR_ORIGIN:invalid}));
  assert.throws(()=>executorConfig({...env,MP_EXECUTOR_MODE:'unexpected'}));
});
