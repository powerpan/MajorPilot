import assert from 'node:assert/strict';
import { stop, waitFor } from './processes.mjs';
import { startInfra } from './infra.mjs';
const url='http://127.0.0.1:18080/api/public/v1/p0/health';
assert.equal((await fetch(url)).status,200);
await stop('redis');
try {
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,503);
  const result=await response.json();
  assert.equal(result.data.redis,'DOWN');
  assert.equal(result.data.database,'UP');
} finally { await startInfra(); }
await waitFor(async()=>{try{return (await fetch(url,{signal:AbortSignal.timeout(5000)})).status===200;}catch{return false;}},30000);
console.log(JSON.stringify({redisStoppedHealth:503,redisRestoredHealth:200,result:'PASS'}));
