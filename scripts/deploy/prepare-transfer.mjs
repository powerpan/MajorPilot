// Keep the validated JAR byte-for-byte while fetching public nested dependencies on the server.
// This avoids retransmitting Maven Central's ~90 MB over a slow laptop uplink.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT} from '../local-config.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {release}=JSON.parse(readFileSync(`${ROOT}/.local/deployment/pilot/release.json`));assert.match(release,/^[a-f0-9]{64}$/);
const source=`${ROOT}/.local/deployment/releases/${release}`,output=`${ROOT}/.local/deployment/transfer-${release}`;
mkdirSync(output,{mode:0o700});
const cache=new Map();function visit(directory){for(const item of readdirSync(directory)){const file=path.join(directory,item);if(statSync(file).isDirectory())visit(file);else if(item.endsWith('.jar')){const values=cache.get(item)||[];values.push(file);cache.set(item,values);}}}visit(`${ROOT}/.local/m2`);
const jar=readFileSync(`${source}/app.jar`);let end=jar.length-22;
while(end>=Math.max(0,jar.length-65557)&&jar.readUInt32LE(end)!==0x06054b50)end--;
assert.ok(end>=0);const count=jar.readUInt16LE(end+10);let central=jar.readUInt32LE(end+16);const dependencies=[];
for(let i=0;i<count;i++){
  assert.equal(jar.readUInt32LE(central),0x02014b50);
  const method=jar.readUInt16LE(central+10),size=jar.readUInt32LE(central+20),nameLength=jar.readUInt16LE(central+28),extra=jar.readUInt16LE(central+30),comment=jar.readUInt16LE(central+32),offset=jar.readUInt32LE(central+42);
  const name=jar.subarray(central+46,central+46+nameLength).toString();central+=46+nameLength+extra+comment;
  if(method!==0||!name.startsWith('BOOT-INF/lib/')||!name.endsWith('.jar')||name.includes('/ruoyi-'))continue;
  assert.equal(jar.readUInt32LE(offset),0x04034b50);
  const start=offset+30+jar.readUInt16LE(offset+26)+jar.readUInt16LE(offset+28),sha=hash(jar.subarray(start,start+size));
  const file=(cache.get(path.basename(name))||[]).find(file=>hash(readFileSync(file))===sha);if(!file)continue;
  const relative=path.relative(`${ROOT}/.local/m2`,file);assert.ok(!relative.includes('..'));
  dependencies.push({offset:start,length:size,sha256:sha,url:`https://repo.maven.apache.org/maven2/${relative}`});
}
dependencies.sort((a,b)=>a.offset-b.offset);let cursor=0,coreOffset=0;const core=[],chunks=[];
for(const dep of dependencies){assert.ok(dep.offset>=cursor);const bytes=jar.subarray(cursor,dep.offset);core.push(bytes);chunks.push({coreOffset,length:bytes.length});coreOffset+=bytes.length;chunks.push(dep);cursor=dep.offset+dep.length;}
const last=jar.subarray(cursor);core.push(last);chunks.push({coreOffset,length:last.length});const coreBytes=Buffer.concat(core);
writeFileSync(`${output}/core.bin`,coreBytes);
writeFileSync(`${output}/transport.json`,JSON.stringify({release,jarSha256:hash(jar),coreSha256:hash(coreBytes),chunks},null,2));
for(const name of ['student','executor','SHA256SUMS'])cpSync(`${source}/${name}`,`${output}/${name}`,{recursive:true});
cpSync(`${ROOT}/scripts/deploy/assemble-release.mjs`,`${output}/assemble-release.mjs`);
console.log(JSON.stringify({release,originalBytes:jar.length,privateCoreBytes:coreBytes.length,publicDependencies:dependencies.length}));
