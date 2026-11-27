// Run on the destination. Hashes, not a rebuild or a version label, identify the JAR.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync,renameSync,openSync,writeSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(`${directory}/transport.json`));
assert.match(manifest.release,/^[a-f0-9]{64}$/);const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const core=readFileSync(`${directory}/core.bin`);assert.equal(hash(core),manifest.coreSha256);
const cache=`/opt/majorpilot/runtime/maven-downloads`;mkdirSync(cache,{recursive:true,mode:0o700});
const dependencies=manifest.chunks.filter(c=>c.url);let next=0;
async function download(){while(next<dependencies.length){const item=dependencies[next++];assert.match(item.sha256,/^[a-f0-9]{64}$/);const url=new URL(item.url);assert.equal(url.origin,'https://repo.maven.apache.org');assert.ok(url.pathname.startsWith('/maven2/')&&!url.pathname.includes('..'));const file=`${cache}/${item.sha256}.jar`;
  if(!existsSync(file)||hash(readFileSync(file))!==item.sha256){
    let complete=false;
    for(const source of [url.href,`https://maven.aliyun.com/repository/central/${url.pathname.slice('/maven2/'.length)}`]){
      try{const response=await fetch(source,{signal:AbortSignal.timeout(240000)});assert.ok(response.ok,`Public dependency HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,item.length);assert.equal(hash(bytes),item.sha256,'Public dependency differs from validated JAR');writeFileSync(file,bytes,{mode:0o600});complete=true;break;}catch{/* Try a mirror of the same bytes, never a replacement version. */}
    }
    assert.ok(complete,`Unable to verify public dependency ${item.sha256}`);
  }
}}
await Promise.all(Array.from({length:3},download));
const target=`/opt/majorpilot/releases/${manifest.release}`,staging=`${target}.assembling`;
assert.ok(!existsSync(target)&&!existsSync(staging),'Release already exists; inspect instead of overwriting');mkdirSync(staging,{mode:0o700});
const fd=openSync(`${staging}/app.jar`,'wx',0o600);
try{for(const item of manifest.chunks){const bytes=item.url?readFileSync(`${cache}/${item.sha256}.jar`):core.subarray(item.coreOffset,item.coreOffset+item.length);assert.equal(bytes.length,item.length);writeSync(fd,bytes);}}finally{closeSync(fd);}
assert.equal(hash(readFileSync(`${staging}/app.jar`)),manifest.jarSha256,'Reassembled JAR changed');
const checksumText=readFileSync(`${directory}/SHA256SUMS`,'utf8');
writeFileSync(`${staging}/SHA256SUMS`,checksumText);
for(const line of checksumText.trim().split('\n')){
  assert.match(line,/^[a-f0-9]{64}  [a-zA-Z0-9_./-]+$/);const name=line.slice(66);
  assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'));
  if(name==='app.jar')continue;
  assert.ok(name.startsWith('student/')||name.startsWith('executor/'));
  mkdirSync(path.dirname(`${staging}/${name}`),{recursive:true});cpSync(`${directory}/${name}`,`${staging}/${name}`);
}
assert.equal(hash(readFileSync(`${staging}/SHA256SUMS`)),manifest.release);
execFileSync('/usr/bin/sha256sum',['--check','SHA256SUMS'],{cwd:staging,stdio:'ignore'});
execFileSync('/bin/chmod',['-R','a+rX',staging]);renameSync(staging,target);
console.log(`Validated immutable release installed: ${manifest.release}`);
