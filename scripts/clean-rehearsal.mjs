// Fresh source snapshot rehearsal, not a claim of a second independent machine.
// --prepare: creates a new scratch directory + explicit shared tool/cache links.
// --build: snapshots current Git-eligible source, creates NEW local credentials,
//          npm ci/build + Maven Wrapper build without private user configuration.
// Never starts/stops services. The caller must coordinate any later fixed-port smoke.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT, TOOL, JAVA_HOME } from './local-config.mjs';

const stateFile=path.join(ROOT,'.local/clean-rehearsal.json');
const mode=process.argv[2];
const metadata={scope:'fresh-source-same-desktop-not-independent-machine',providerKeysCopied:false,applicationStateCopied:false,servicesStarted:false};
mkdirSync(path.dirname(stateFile),{recursive:true});
function save(state) { writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600}); }
if(mode==='--prepare') {
  const scratch=mkdtempSync('/tmp/majorpilot-clean-');
  mkdirSync(path.join(scratch,'data'));mkdirSync(path.join(scratch,'.local'));
  const links=[['data/tools',TOOL],['data/npm-cache',path.join(ROOT,'data/npm-cache')],['.local/m2',path.join(ROOT,'.local/m2')],['data/maven-user',path.join(ROOT,'.local/maven')]];
  for(const [relative,target] of links) { if(!existsSync(target)) throw new Error(`Missing shared prerequisite: ${relative}`);symlinkSync(target,path.join(scratch,relative),'dir'); }
  const prior=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):null;
  const previousAttempts=prior?[...(prior.previousAttempts||[]),{scratch:prior.scratch,stage:prior.stage,log:prior.log}]:[];
  const state={...metadata,scratch,stage:'PREPARED',sharedPrerequisites:links.map(([relative,target])=>({relative,target})),previousAttempts,createdAt:new Date().toISOString()};save(state);console.log(JSON.stringify(state));
} else if(mode==='--build') {
  const state=JSON.parse(readFileSync(stateFile,'utf8'));
  const scratch=state.scratch;
  if(state.stage!=='PREPARED' || !/^\/tmp\/majorpilot-clean-[A-Za-z0-9]+$/.test(scratch)) throw new Error('Expected a newly prepared scratch directory; create another instead of reusing build history');
  const fallback='/Users/ericpan/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git';
  const git=existsSync(fallback)?fallback:'git';
  const candidates=execFileSync(git,['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean);
  const directories=new Set(['backend','admin-web','student-web','contracts','database','scripts','docs','executor','tests','content']);
  const rootFiles=new Set(['AGENTS.md','README.md','UPSTREAM.md','UPSTREAM-backend.md','UPSTREAM-frontend.md','CONTEXT.md','.env.example','.gitignore','.java-version','.node-version','.nvmrc']);
  // Root runtime data/ is already excluded by the top-level allowlist. A nested
  // source directory such as student-web/src/data must remain in the snapshot.
  const forbidden=new Set(['.git','node_modules','target','dist','logs','.local','artifacts','playwright-report','test-results']);
  const files=candidates.filter(file=>{
    const parts=file.split('/');
    return (directories.has(parts[0])||rootFiles.has(file)) && !parts.some(part=>forbidden.has(part)||part==='.DS_Store'||(part.startsWith('.env')&&part!=='.env.example'));
  }).sort();
  const digest=createHash('sha256');
  for(const file of files) {
    const source=path.join(ROOT,file);
    if(!lstatSync(source).isFile()||lstatSync(source).isSymbolicLink()) throw new Error(`Source must be a regular file: ${file}`);
    const destination=path.join(scratch,file);mkdirSync(path.dirname(destination),{recursive:true});cpSync(source,destination,{preserveTimestamps:true});
    digest.update(file+'\0').update(readFileSync(source));
  }
  if(existsSync(path.join(scratch,'.env.local'))||existsSync(path.join(scratch,'data/mysql'))) throw new Error('Private environment/application state unexpectedly copied');
  // Explicit empty user configurations avoid reading private ~/.npmrc or ~/.m2/settings.xml.
  const npmUser=path.join(scratch,'data/rehearsal-npm-user.conf'),npmGlobal=path.join(scratch,'data/rehearsal-npm-global.conf'),mavenSettings=path.join(scratch,'data/rehearsal-maven-settings.xml');
  writeFileSync(npmUser,'');writeFileSync(npmGlobal,'');writeFileSync(mavenSettings,'<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>\n');
  const env=Object.fromEntries(['HOME','USER','TMPDIR','LANG','TERM'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{PATH:`${scratch}/data/tools/node/bin:${JAVA_HOME}/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,JAVA_HOME,CI:'true',MAVEN_USER_HOME:`${scratch}/data/maven-user`});
  const node=`${scratch}/data/tools/node/bin/node`,npm=`${scratch}/data/tools/npm/bin/npm-cli.js`;
  const log=path.join(scratch,'data/clean-build.log');const fd=openSync(log,'w',0o600);
  function run(command,args,cwd=scratch) { execFileSync(command,args,{cwd,env,stdio:['ignore',fd,fd]}); }
  try {
    run(node,['scripts/configure-local.mjs']);
    const generated=readFileSync(path.join(scratch,'.env.local'),'utf8');
    if(/(?:BAILIAN|DEEPSEEK|OPENAI).*KEY\s*=/.test(generated)) throw new Error('Unexpected provider key field in newly generated local environment');
    for(const project of ['admin-web','student-web','contracts','executor','tests/e2e']) {
      const common=['--userconfig',npmUser,'--globalconfig',npmGlobal,'--cache',`${scratch}/data/npm-cache`];
      run(node,[npm,...common,'ci','--no-audit','--no-fund'],path.join(scratch,project));
      const buildScripts=project==='admin-web'?['typecheck','build:prod']:project==='student-web'?['build']:project==='contracts'?['check']:[];
      for(const script of buildScripts) run(node,[npm,...common,'run',script],path.join(scratch,project));
    }
    run(`${scratch}/backend/mvnw`,['--settings',mavenSettings,`-Dmaven.repo.local=${scratch}/.local/m2`,'-DskipTests','package'],`${scratch}/backend`);
    save({...state,stage:'BUILT',files:files.length,sourceSnapshotSha256:digest.digest('hex'),log,finishedAt:new Date().toISOString(),newIndependentLocalCredentials:true,buildResult:'PASS'});
    console.log(JSON.stringify({...metadata,scratch,files:files.length,newIndependentLocalCredentials:true,buildResult:'PASS',log}));
  } catch(error) {
    save({...state,stage:'BUILD_FAILED',files:files.length,log,buildResult:'FAIL'});throw new Error(`Clean build failed; inspect ${log}. No services were started.`,{cause:error});
  } finally { closeSync(fd); }
} else throw new Error('Use --prepare or --build. This script never starts services.');
