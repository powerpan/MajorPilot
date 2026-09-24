// Isolated, test-source-only HTTP harness. No provider key is inherited or loaded.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync, mkdtempSync, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOL, JAVA_HOME } from './local-config.mjs';
import { parseEnv, readLocalEnv, runtimeEnv } from './env.mjs';
import { mysqlArguments } from './infra.mjs';
import { acquireTestLock, releaseTestLock, readTestLock, testDatabaseLock } from './integration.mjs';
import { materializeBackendArtifact } from './runtime-artifact.mjs';
import { start, stop, record, processInspectionAvailable, waitFor } from './processes.mjs';

const directory = path.join(ROOT, 'data/p6-harness');
const secretFile = path.join(ROOT, '.env.p6-test.local');
const hash = value => createHash('sha256').update(value).digest('hex');
const fixtureDefinitions = [
  { key:'ai', source:'ai-support/1.0.0/manifest.json', id:'01JF1000000000000000000001' },
  { key:'ds', source:'ds-learning/1.0.0/manifest.json', id:'01JF2000000000000000000001' },
  { key:'ba', source:'ba-learning/1.0.0/manifest.json', id:'01JF3000000000000000000001' },
];
function checkedDirectory(file) {
  const stat=lstatSync(file);
  assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(), 'Harness directory must be a real directory');
}
function checkedFile(file) {
  const stat=lstatSync(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Harness file must be regular');
  return stat;
}
export function validateTestSecrets(values) {
  for(const key of ['MP_DB_PASSWORD','MP_ADMIN_TOKEN_SECRET','MP_CSRF_SECRET','MP_P0_STUDENT_PASSWORD','MP_P0_ADMIN_PASSWORD'])
    if(!/^[a-f0-9]{64}$/.test(values[key]||''))throw new Error('Invalid harness secret; value suppressed');
  if(!/^[a-f0-9]{16}$/.test(values.MP_P6_RUN_TAG||''))throw new Error('Invalid harness scope');
  if(values.MP_ADMIN_TOKEN_SECRET===values.MP_CSRF_SECRET)throw new Error('Harness signing secrets must be independent');
  if(Object.keys(values).length!==6)throw new Error('Unexpected harness environment key');
  return values;
}
function testSecrets({create=false}={}) {
  if (!existsSync(secretFile)) {
    assert.ok(create, 'Run p6-harness prepare first');
    const values=Object.fromEntries(['MP_DB_PASSWORD','MP_ADMIN_TOKEN_SECRET','MP_CSRF_SECRET','MP_P0_STUDENT_PASSWORD','MP_P0_ADMIN_PASSWORD'].map(key=>[key,randomBytes(32).toString('hex')]));
    values.MP_P6_RUN_TAG=randomBytes(8).toString('hex');
    writeFileSync(secretFile,Object.entries(values).map(([key,value])=>`${key}=${value}\n`).join(''),{mode:0o600,flag:'wx'});
  }
  const stat=lstatSync(secretFile);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o077),'Harness secrets require a regular mode-600 file');
  const values=parseEnv(readFileSync(secretFile,'utf8'));
  return validateTestSecrets(values);
}
export function p6Environment(){
  const local=readLocalEnv();
  return {...runtimeEnv(),...testSecrets(), MP_DB_URL:'jdbc:mysql://127.0.0.1:13306/majorpilot_test?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC',
    MP_DB_USERNAME:'majorpilot_p6_test',MP_REDIS_PASSWORD:local.MP_REDIS_PASSWORD,MP_REDIS_HOST:'127.0.0.1',MP_REDIS_PORT:'16380',
    MP_P6_HARNESS_DIR:directory,MP_DATA_DIR:path.join(directory,'data'),MAJORPILOT_AI_MODE:'fake'};
}
function redis(args){
  try{return execFileSync(path.join(TOOL,'redis/src/redis-cli'),['-h','127.0.0.1','-p','16380','-n','14','--raw',...args],
    {env:{...runtimeEnv(),REDISCLI_AUTH:readLocalEnv().MP_REDIS_PASSWORD},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000}).trim();}
  catch{throw new Error('Harness Redis operation failed; details suppressed');}
}
function mysqlCommand(sql){
  try{return execFileSync(path.join(TOOL,'mysql/bin/mysql'),mysqlArguments(),{input:sql,env:runtimeEnv(),encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:10000});}
  catch{throw new Error('Harness MySQL operation failed; SQL and credentials suppressed');}
}
function ownRedis(){
  const expected=`p6-harness:${testSecrets().MP_P6_RUN_TAG}`;
  const marker=redis(['GET','mp:p6:harness-owner']);
  if(marker===expected)return;
  assert.equal(marker,'','Redis DB14 belongs to another test scope; not touching it');
  assert.equal(redis(['DBSIZE']),'0','Redis DB14 is not empty; not touching it');
  assert.equal(redis(['SET','mp:p6:harness-owner',expected,'NX']),'OK','Harness Redis ownership race');
}
export function exactHarnessGrants(grants){
  const account='`majorpilot_p6_test`@`127.0.0.1`';
  // mysql --batch escapes the stored backslash in SHOW GRANTS output.
  // Verify the actual mysql.db byte sequence independently below.
  const batchDatabase=String.raw`majorpilot\\_test`;
  return grants.length===2 && grants.includes(`GRANT USAGE ON *.* TO ${account}`)
    && grants.includes(`GRANT ALL PRIVILEGES ON \`${batchDatabase}\`.* TO ${account}`);
}
function ensureDatabaseAccount(){
  const values=testSecrets();
  // With partial_revokes=OFF, '_' is a database-GRANT wildcard even when
  // backtick-quoted. Escape it so the test principal cannot match another DB.
  assert.equal(mysqlCommand('SELECT @@partial_revokes;').trim(),'0','Unexpected database grant semantics; no privileges were changed');
  const existing=mysqlCommand("SELECT COUNT(*) FROM mysql.user WHERE user='majorpilot_p6_test' AND host='127.0.0.1';").trim();
  if(existing==='0')mysqlCommand(`CREATE USER 'majorpilot_p6_test'@'127.0.0.1' IDENTIFIED BY '${values.MP_DB_PASSWORD}'; GRANT ALL ON \`majorpilot\\_test\`.* TO 'majorpilot_p6_test'@'127.0.0.1';`);
  else assert.equal(existing,'1','Unexpected harness database account');
  let grants=mysqlCommand("SHOW GRANTS FOR 'majorpilot_p6_test'@'127.0.0.1';").trim().split('\n');
  assert.equal(grants.length,2,'Unexpected harness database grants');
  const legacyGrant='GRANT ALL PRIVILEGES ON `majorpilot_test`.* TO `majorpilot_p6_test`@`127.0.0.1`';
  const legacy=grants.includes(legacyGrant)&&grants.includes('GRANT USAGE ON *.* TO `majorpilot_p6_test`@`127.0.0.1`');
  assert.ok(legacy||exactHarnessGrants(grants),'Harness account exceeds test database scope');
  try { assert.equal(execFileSync(path.join(TOOL,'mysql/bin/mysql'),['--no-defaults','--no-login-paths','--protocol=TCP','-h127.0.0.1','-P13306','-umajorpilot_p6_test','--batch','--skip-column-names','majorpilot_test','-e','SELECT DATABASE();'],
      {env:{...runtimeEnv(),MYSQL_PWD:values.MP_DB_PASSWORD},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000}).trim(),'majorpilot_test'); }
  catch { throw new Error('Harness account authentication failed; existing credentials were not changed'); }
  if(legacy){
    // Narrow only the known project-generated grant after the saved credential
    // has authenticated. Add exact access first; never widen or rotate access.
    mysqlCommand("GRANT ALL ON `majorpilot\\_test`.* TO 'majorpilot_p6_test'@'127.0.0.1'; REVOKE ALL ON majorpilot_test.* FROM 'majorpilot_p6_test'@'127.0.0.1';");
    grants=mysqlCommand("SHOW GRANTS FOR 'majorpilot_p6_test'@'127.0.0.1';").trim().split('\n');
  }
  assert.ok(exactHarnessGrants(grants),'Expected only the literal test-database grant');
  assert.equal(mysqlCommand("SELECT HEX(Db) FROM mysql.db WHERE User='majorpilot_p6_test' AND Host='127.0.0.1';").trim(),'6D616A6F7270696C6F745C5F74657374','Expected one literal escaped underscore in the stored database grant');
}
export function fixtureManifest(original,definition){
  const manifest=structuredClone(original);
  assert.equal(manifest.contentKind,'MAJOR');
  assert.ok(['AI','DATA_SCIENCE','BUSINESS_ANALYTICS'].includes(manifest.majorCode));
  manifest.taskVersionId=definition.id;manifest.versionCode=definition.method?'2.0.0':'9.6.0';manifest.title=`TEST_FIXTURE · ${manifest.title}`;
  return manifest;
}
export function fixtureWorkbooks(catalog,bindings){
  assert.equal(catalog.schemaVersion,'workbook-catalog-v1');
  return {schemaVersion:catalog.schemaVersion,workbooks:bindings.map(binding=>{
    const entries=catalog.workbooks.filter(book=>book.taskVersionId===binding.sourceId);assert.equal(entries.length,1,'Workbook fixture requires exactly one pinned source');
    return {...structuredClone(entries[0]),taskVersionId:binding.taskVersionId,manifestSha256:binding.manifestSha256};
  })};
}
function writeControl(file,bytes){
  if(existsSync(file))checkedFile(file);
  const temporary=`${file}.pending-${randomBytes(8).toString('hex')}`;
  writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});renameSync(temporary,file);
}
function inventory(folder){
  const files=[];
  function walk(at){for(const entry of readdirSync(at,{withFileTypes:true})){const file=path.join(at,entry.name);assert.ok(!entry.isSymbolicLink(),'Symlink in harness artifact');if(entry.isDirectory())walk(file);else if(entry.isFile())files.push({path:path.relative(folder,file),sha256:hash(readFileSync(file))});}}
  walk(folder);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export function prepareHarness({method=false}={}){
  assert.ok(processInspectionAvailable(),'Process inspection required before harness preparation');
  assert.ok(!record('p6-test-backend')&&!record('p6-test-student'),'Stop harness before materializing another version');
  mkdirSync(directory,{recursive:true,mode:0o700});checkedDirectory(directory);testSecrets({create:true});
  const artifact=materializeBackendArtifact();
  const temporary=mkdtempSync(path.join(directory,'prepare-'));
  execFileSync(path.join(JAVA_HOME,'bin/jar'),['--extract','--file',artifact.path,'BOOT-INF/classes','BOOT-INF/lib'],{cwd:temporary,stdio:['ignore','pipe','pipe'],timeout:30000});
  const testClasses=path.join(ROOT,'backend/ruoyi-majorpilot/target/test-classes');
  assert.ok(existsSync(path.join(testClasses,'majorpilot/harness/P6HarnessApplication.class')),'Compile test harness classes before prepare');
  const sourceDirectory=path.join(ROOT,'backend/ruoyi-majorpilot/src/test/java/majorpilot/harness');
  for(const entry of readdirSync(sourceDirectory).filter(name=>name.endsWith('.java')&&!name.endsWith('Test.java')))
    assert.ok(lstatSync(path.join(testClasses,'majorpilot/harness',entry.replace(/\.java$/,'.class'))).mtimeMs>=lstatSync(path.join(sourceDirectory,entry)).mtimeMs,'Harness test classes are stale; compile the frozen sources first');
  const bundled=readdirSync(path.join(temporary,'BOOT-INF/lib')).filter(name=>/^ruoyi-majorpilot-[\w.-]+\.jar$/.test(name));
  assert.equal(bundled.length,1,'Expected one frozen domain module');
  const frozenSources=path.join(temporary,'frozen-source');mkdirSync(frozenSources,{mode:0o700});
  const definitions=fixtureDefinitions.map(item=>({...item,method,source:method?item.source.replace('/1.0.0/','/2.0.0/'):item.source}));
  execFileSync(path.join(JAVA_HOME,'bin/jar'),['--extract','--file',path.join(temporary,'BOOT-INF/lib',bundled[0]),'task-content/workbooks/catalog.json',...definitions.map(item=>`task-content/${item.source}`)],{cwd:frozenSources,stdio:['ignore','pipe','pipe'],timeout:10000});
  const resources=path.join(temporary,'fixture-resources/task-content');mkdirSync(resources,{recursive:true,mode:0o700});
  const fixturePins=[],workbookBindings=[];
  for(const definition of definitions){
    const original=JSON.parse(readFileSync(path.join(frozenSources,'task-content',definition.source),'utf8'));
    const manifest=fixtureManifest(original,definition);
    const relative=`p6-fixtures/${definition.key}/manifest.json`,file=path.join(resources,relative),bytes=JSON.stringify(manifest,null,2)+'\n';
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});writeFileSync(file,bytes,{flag:'wx',mode:0o600});
    fixturePins.push({majorCode:manifest.majorCode,taskVersionId:definition.id,manifestPath:relative,manifestSha256:hash(bytes)});
    workbookBindings.push({sourceId:original.taskVersionId,taskVersionId:definition.id,manifestSha256:hash(bytes)});
  }
  writeFileSync(path.join(resources,'catalog.json'),JSON.stringify({schemaVersion:'content-catalog-v1',manifests:fixturePins.map(item=>item.manifestPath)})+'\n',{flag:'wx',mode:0o600});
  mkdirSync(path.join(resources,'workbooks'),{mode:0o700});
  writeFileSync(path.join(resources,'workbooks/catalog.json'),JSON.stringify(fixtureWorkbooks(JSON.parse(readFileSync(path.join(frozenSources,'task-content/workbooks/catalog.json'),'utf8')),workbookBindings))+'\n',{flag:'wx',mode:0o600});
  const jar=path.join(temporary,'p6-test-only.jar');
  const classes=path.join(temporary,'harness-classes');mkdirSync(path.join(classes,'majorpilot/harness'),{recursive:true,mode:0o700});
  for(const entry of readdirSync(path.join(testClasses,'majorpilot/harness')).filter(name=>name.endsWith('.class')&&!/Test(?:\$|\.)/.test(name)))
    writeFileSync(path.join(classes,'majorpilot/harness',entry),readFileSync(path.join(testClasses,'majorpilot/harness',entry)),{flag:'wx',mode:0o600});
  execFileSync(path.join(JAVA_HOME,'bin/jar'),['--create','--date=2020-01-01T00:00:00Z','--file',jar,'-C',classes,'majorpilot/harness','-C',path.dirname(resources),'task-content'],{stdio:['ignore','pipe','pipe'],timeout:10000});
  const files=inventory(temporary).filter(file=>!file.path.startsWith('fixture-resources/'));
  const identity=hash(JSON.stringify({backendSha256:artifact.sha256,files,fixturePins}));
  const destination=path.join(directory,`runtime-${identity}`);
  if(existsSync(destination)) {
    checkedDirectory(destination);
    assert.deepEqual(inventory(destination).filter(file=>!file.path.startsWith('fixture-resources/')),files,'Existing immutable harness artifact changed');
    // Retain this completed preparation as a harmless diagnostic directory; never overwrite an artifact.
  } else renameSync(temporary,destination);
  for(const file of inventory(destination))chmodSync(path.join(destination,file.path),0o400);
  const descriptor={schemaVersion:'p6-harness-runtime-v1',identity,backendSha256:artifact.sha256,directory:destination,files,fixturePins};
  writeControl(path.join(directory,'current.json'),JSON.stringify(descriptor,null,2)+'\n');
  if(!existsSync(path.join(directory,'gateway-control.json')))writeFileSync(path.join(directory,'gateway-control.json'),'{"mode":"PASS"}\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({result:'PREPARED',scope:'TEST_FIXTURE only',identity,backendSha256:artifact.sha256,fixtures:fixturePins,paidCalls:0}));
  return descriptor;
}
function currentArtifact(){
  checkedFile(path.join(directory,'current.json'));
  const value=JSON.parse(readFileSync(path.join(directory,'current.json'),'utf8'));
  assert.match(value.identity,/^[a-f0-9]{64}$/);
  assert.equal(value.directory,path.join(directory,`runtime-${value.identity}`));checkedDirectory(value.directory);
  const files=inventory(value.directory).filter(file=>!file.path.startsWith('fixture-resources/'));
  assert.deepEqual(files,value.files,'Content-addressed test artifact changed');
  assert.equal(value.schemaVersion,'p6-harness-runtime-v1');assert.match(value.backendSha256,/^[a-f0-9]{64}$/);
  assert.equal(hash(JSON.stringify({backendSha256:value.backendSha256,files,fixturePins:value.fixturePins})),value.identity);
  return value;
}
export async function startHarness({backendOnly=false}={}){
  assert.ok(processInspectionAvailable(),'Process inspection required before harness startup');
  const artifact=currentArtifact();
  const tag=testSecrets().MP_P6_RUN_TAG;
  acquireTestLock({scope:'p6-harness',tag},{resume:true});
  // Keep the exact scope lock on startup failure for diagnosis/recovery. Explicit
  // cleanup releases it only after both processes and exact fixture rows are gone.
  ensureDatabaseAccount();ownRedis();
  const unknown=mysqlCommand(`SELECT COUNT(*) FROM majorpilot_test.mp_student_account WHERE email_normalized NOT LIKE 'p6-http-${tag}-%@example.invalid';`).trim();
  assert.equal(unknown,'0','Another fixture scope owns test database rows; finish that suite first');
  // P2's permanent technical DEMOs are not Major content and are disabled in this
  // harness. Preserve those rows; only another published Major could affect the
  // formal recommendation/source selection under test.
  assert.equal(mysqlCommand("SELECT COUNT(*) FROM majorpilot_test.mp_task_version WHERE content_kind='MAJOR' AND status='PUBLISHED' AND public_id NOT IN ('01JF1000000000000000000001','01JF2000000000000000000001','01JF3000000000000000000001');").trim(),'0','Another published Major fixture scope is present; no existing version was changed');
  const classpath=[path.join(artifact.directory,'p6-test-only.jar'),path.join(artifact.directory,'BOOT-INF/classes'),path.join(artifact.directory,'BOOT-INF/lib/*')].join(path.delimiter);
  await start('p6-test-backend',path.join(JAVA_HOME,'bin/java'),['-cp',classpath,'majorpilot.harness.P6HarnessApplication'],p6Environment(),{cwd:directory,port:18081});
  await waitFor(async()=>{try{return(await fetch('http://127.0.0.1:18081/api/public/v1/health',{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},45000);
  await waitFor(()=>mysqlCommand("SELECT COUNT(*) FROM majorpilot_test.mp_task_version WHERE public_id IN ('01JF1000000000000000000001','01JF2000000000000000000001','01JF3000000000000000000001') AND status='PUBLISHED';").trim()==='3',10000);
  await waitFor(()=>mysqlCommand(`SELECT COUNT(*) FROM majorpilot_test.sys_user WHERE create_by='p6-harness:${tag}' AND status='0';`).trim()==='2',10000);
  if(!backendOnly)await start('p6-test-student',path.join(TOOL,'node/bin/node'),[path.join(ROOT,'student-web/node_modules/vite/bin/vite.js'),'--config',path.join(ROOT,'tests/e2e/p6-vite.config.mjs')],runtimeEnv(),{port:15176});
  console.log(JSON.stringify({result:'STARTED',scope:'isolated TEST_FIXTURE harness',backend:18081,student:backendOnly?null:15176,artifact:artifact.identity,paidCalls:0}));
}
export async function stopHarness({backendOnly=false}={}){
  assert.ok(processInspectionAvailable(),'Process inspection required before stopping harness');
  assert.deepEqual(readTestLock(),{scope:'p6-harness',tag:testSecrets().MP_P6_RUN_TAG},'Another scope owns test resources');
  if(!backendOnly)await stop('p6-test-student');await stop('p6-test-backend');
  // Stop is recoverable. Keep fixture ownership/mutex until explicit cleanup.
}
export function cleanupHarness(){
  assert.ok(processInspectionAvailable(),'Process inspection required before harness cleanup');
  assert.ok(!record('p6-test-backend')&&!record('p6-test-student'),'Stop both harness components before cleanup');
  const tag=testSecrets().MP_P6_RUN_TAG, owner={scope:'p6-harness',tag};
  assert.deepEqual(readTestLock(),owner,'Another scope owns test resources');
  assert.equal(mysqlCommand('SELECT COUNT(*) FROM majorpilot_test.mp_student_account;').trim(),'0','Acceptance clients must clean their exact Student dependency trees first');
  const artifact=currentArtifact();
  for(const pin of artifact.fixturePins){
    assert.ok(fixtureDefinitions.some(definition=>definition.id===pin.taskVersionId));
    const rows=mysqlCommand(`SELECT manifest_sha256 FROM majorpilot_test.mp_task_version WHERE public_id='${pin.taskVersionId}';`).trim();
    assert.ok(!rows||rows===pin.manifestSha256,'Fixture hash changed; no cleanup attempted');
  }
  const own=`p6-harness:${tag}`;
  assert.equal(mysqlCommand(`SELECT COUNT(*) FROM majorpilot_test.sys_user_role ur JOIN majorpilot_test.sys_role r ON r.role_id=ur.role_id JOIN majorpilot_test.sys_user u ON u.user_id=ur.user_id WHERE (r.create_by='${own}' AND u.create_by<>'${own}') OR (u.create_by='${own}' AND r.create_by<>'${own}');`).trim(),'0','Foreign operator association; no cleanup attempted');
  assert.equal(mysqlCommand(`SELECT COUNT(*) FROM majorpilot_test.sys_role_menu rm JOIN majorpilot_test.sys_role r ON r.role_id=rm.role_id JOIN majorpilot_test.sys_menu m ON m.menu_id=rm.menu_id WHERE (r.create_by='${own}' AND m.create_by<>'${own}') OR (m.create_by='${own}' AND r.create_by<>'${own}');`).trim(),'0','Foreign menu association; no cleanup attempted');
  // Stop + exclusive DB ownership prevent new writers. Foreign-key constraints remain enabled.
  mysqlCommand(`USE majorpilot_test; START TRANSACTION;
    DELETE a FROM mp_sensitive_audit a JOIN sys_user u ON u.user_id=a.operator_id WHERE u.create_by='${own}';
    DELETE l FROM sys_logininfor l JOIN sys_user u ON u.user_name=l.user_name WHERE u.create_by='${own}';
    DELETE l FROM sys_oper_log l JOIN sys_user u ON u.user_name=l.oper_name WHERE u.create_by='${own}';
    DELETE ur FROM sys_user_role ur JOIN sys_user u ON u.user_id=ur.user_id WHERE u.create_by='${own}';
    DELETE rm FROM sys_role_menu rm JOIN sys_role r ON r.role_id=rm.role_id WHERE r.create_by='${own}';
    DELETE FROM sys_user WHERE create_by='${own}' AND user_id>2;
    DELETE FROM sys_role WHERE create_by='${own}' AND role_id>2;
    DELETE FROM sys_menu WHERE create_by='${own}';
    DELETE FROM mp_task_version WHERE public_id IN (${artifact.fixturePins.map(pin=>`'${pin.taskVersionId}'`).join(',')});
    COMMIT;`);
  const marker=`p6-harness:${tag}`;
  assert.equal(redis(['GET','mp:p6:harness-owner']),marker,'Redis14 owner changed; retained mutex');
  const keys=redis(['KEYS','*']).split('\n').filter(Boolean);
  assert.ok(keys.length<=10000&&keys.every(key=>/^[A-Za-z0-9_.:-]+$/.test(key)),'Unexpected Redis14 keys; retained mutex');
  for(let i=0;i<keys.length;i+=100){
    const batch=keys.slice(i,i+100).filter(key=>key!=='mp:p6:harness-owner');
    if(batch.length)assert.notEqual(redis(['EVAL',"if redis.call('GET',KEYS[1])~=ARGV[1] then return -1 end; return redis.call('UNLINK',unpack(ARGV,2))",'1','mp:p6:harness-owner',marker,...batch]),'-1');
  }
  assert.equal(redis(['DBSIZE']),'1','Unexpected new Redis14 state; retained mutex');
  assert.equal(redis(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0",'1','mp:p6:harness-owner',marker]),'1');
  releaseTestLock(owner);
  console.log(JSON.stringify({result:'CLEANED',fixtureTasks:3,operatorScope:'exact test tag',redisDatabase:14,retained:'ignored secrets, least-privilege database account, immutable artifacts',mainServicesChanged:false}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [command,...extra]=process.argv.slice(2);assert.equal(extra.length,0,'Unexpected harness arguments');
  if(command==='prepare'||command==='prepare-method')prepareHarness({method:command==='prepare-method'});
  else if(command==='start'||command==='start-backend')await startHarness({backendOnly:command==='start-backend'});
  else if(command==='stop'||command==='stop-backend')await stopHarness({backendOnly:command==='stop-backend'});
  else if(command==='cleanup')cleanupHarness();
  else throw new Error('Use prepare, prepare-method, start, stop, start-backend, stop-backend or cleanup');
}
