// Optional transport-only update. Never mutate an installed immutable release.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,cpSync,readdirSync,statSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT} from '../local-config.mjs';
const previous=process.argv[2];assert.match(previous||'',/^[a-f0-9]{64}$/);
const {release}=JSON.parse(readFileSync(`${ROOT}/.local/deployment/pilot/release.json`));assert.match(release,/^[a-f0-9]{64}$/);
const source=`${ROOT}/.local/deployment/transfer-${release}`,old=`${ROOT}/.local/deployment/transfer-${previous}`,output=`${ROOT}/.local/deployment/delta-${release}`;
mkdirSync(output,{mode:0o700});let count=0,bytes=0;
function walk(directory){for(const item of readdirSync(directory)){const file=path.join(directory,item),relative=path.relative(source,file);if(statSync(file).isDirectory()){walk(file);continue;}const data=readFileSync(file),prior=path.join(old,relative);if(existsSync(prior)&&data.equals(readFileSync(prior)))continue;mkdirSync(path.dirname(path.join(output,relative)),{recursive:true});cpSync(file,path.join(output,relative));count++;bytes+=data.length;}}
walk(source);
for(const name of ['majorpilot-backend.service','majorpilot-executor.service','nginx-https.conf'])cpSync(`${ROOT}/.local/deployment/pilot/${name}`,`${output}/${name}`);
writeFileSync(`${output}/delta.json`,JSON.stringify({previous,release}));
console.log(JSON.stringify({release,changedFiles:count,changedBytes:bytes}));
