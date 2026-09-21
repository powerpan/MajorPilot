import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFixtureScope,removeFixtureObject} from './lib/local-student-fixture.mjs';

const nonce='0123456789abcdef',studentId='01JTEST0000000000000000001',intakeId='01JTEST0000000000000000002',receiptId='01JTEST0000000000000000003',requestId='01JTEST0000000000000000004';
function harness({privacy=true,lostRegistration=false,loginFailure=false,foreignArtifact=false}={}){
  const calls=[],sql=[],deletedMail=[],removedObjects=[],messages=[],receiptRows=new Map();let row=null,index=0;
  const response=(status,data)=>({status,body:status===204?null:{data,meta:{requestId:'synthetic-fixture'}},headers:new Headers()});
  const clientFactory=()=>({publicCsrf:async()=>{},call:async(route,options={})=>{
    calls.push({route,...options});
    if(route==='/api/public/v1/intake-sessions')return response(201,{intakeSessionId:intakeId,revision:0});
    if(route.endsWith('/submit'))return response(201,{recommendationId:'synthetic'});
    if(route==='/api/public/v1/auth/register'){
      row={publicId:studentId,email:options.body.email,status:'ACTIVE'};messages.push({ID:`mail-${index++}`,To:[{Address:row.email}],Text:`http://localhost:15173/verify-email#token=${'a'.repeat(43)}\n`});
      if(lostRegistration)throw new Error('synthetic lost response');return response(201,{studentId});
    }
    if(route==='/api/public/v1/auth/verify-email')return response(204);
    if(route==='/api/public/v1/auth/login')return loginFailure&&calls.filter(c=>c.route===route).length>1?response(401,null):response(200,{studentId});
    if(route==='/api/app/v1/auth/csrf')return response(200,{});
    if(route==='/api/app/v1/account-deletion-requests'){receiptRows.set(receiptId,{requestId,studentId,receiptId,status:'REQUESTED'});return response(201,{requestId,receiptId});}
    if(route.endsWith('/confirm')){row=null;receiptRows.get(receiptId).status='COMPLETED';return response(202,{status:'CONFIRMED'});}
    throw new Error('Unexpected mocked fixture route');
  }});
  const query=statement=>{
    sql.push(statement);
    if(statement==='SELECT DATABASE();')return 'majorpilot';
    if(statement.includes('information_schema.tables'))return statement.includes("table_name='mp_student_data_export'")?(privacy?'1':'0'):'1';
    if(statement.startsWith("SELECT JSON_OBJECT('publicId'"))return row?JSON.stringify(row):'';
    if(statement.startsWith("SELECT JSON_OBJECT('requestId'"))return receiptRows.has(receiptId)&&statement.includes(receiptId)?JSON.stringify({requestId,studentId}):'';
    if(statement.startsWith("SELECT JSON_OBJECT('receiptId'"))return [...receiptRows.values()].filter(r=>r.status!=='COMPLETED').map(r=>JSON.stringify(r)).join('\n');
    if(statement.startsWith("SELECT JSON_OBJECT('key'"))return foreignArtifact&&statement.includes('mp_student_data_export')?JSON.stringify({key:`student/${studentId}.zip`}):'';
    if(statement.startsWith("SELECT JSON_OBJECT('kind'"))return '';
    if(statement.startsWith('SELECT DISTINCT e.id'))return '';
    if(statement.includes('SELECT id FROM mp_experience_run')&&statement.includes('ORDER BY attempt_no'))return '';
    if(statement.startsWith('DELETE FROM mp_account_deletion_request WHERE receipt_id=')){receiptRows.delete(receiptId);return '';}
    if(statement.startsWith('START TRANSACTION;'))return ''; // publisher fencing, not final removal
    if(statement.includes('START TRANSACTION;')&&statement.includes('DELETE FROM mp_student_account')){row=null;return '';}
    if(statement.includes('SELECT COUNT(*) FROM mp_student_account'))return row?'1':'0';
    if(foreignArtifact&&statement.includes("WHERE object_key='student/")&&statement.includes('student_id NOT IN'))return '1';
    if(statement.includes('SELECT COUNT(*)'))return '0';
    throw new Error('Unexpected mocked fixture SQL');
  };
  const fetch=async(url,options={})=>{
    if(options.method==='DELETE'){deletedMail.push(...JSON.parse(options.body).IDs);return {ok:true};}
    if(url.endsWith('/api/v1/messages'))return {ok:true,json:async()=>({messages})};
    const id=url.split('/').at(-1);return {ok:true,json:async()=>messages.find(m=>m.ID===id)};
  };
  const scope=createFixtureScope('p7-browser',{nonce,query,fetch,clientFactory,sleep:async()=>{},removeObject:key=>removedObjects.push(key)});
  return {scope,calls,sql,messages,deletedMail,removedObjects,receiptRows,setRow(value){row=value;},getRow(){return row;}};
}

test('P7 accepts explicit research consent, preserves default and rejects invalid consent before network',async()=>{
  const a=harness();await a.scope.student({research:'ACCEPTED'});assert.equal(a.calls.find(c=>c.route.endsWith('/register')).body.consents.at(-1).decision,'ACCEPTED');
  const b=harness();await b.scope.student();assert.equal(b.calls.find(c=>c.route.endsWith('/register')).body.consents.at(-1).decision,'DECLINED');
  const c=harness();await assert.rejects(c.scope.student({research:'UNDECLARED'}),/Invalid fixture research/);assert.equal(c.calls.length,0);
});
test('email scope accepts changed address for an allocated index only',async()=>{
  const h=harness();const a=await h.scope.student();assert.equal(h.scope.trackEmail(a.email.replace('@','-changed@')),a.email.replace('@','-changed@'));
  for(const email of ['outside@example.invalid',a.email.replace(nonce,'f'.repeat(16)),a.email.replace('-0@','-1@'),a.email.replace('-0@','-00@'),a.email.replace('@example.invalid',"'@example.invalid"),a.email.replace('example.invalid','example.com')])assert.throws(()=>h.scope.trackEmail(email),/outside this fixture/);
});
test('change-email token lookup requires exact scoped recipient and captures exact mail ID',async()=>{
  const h=harness();const a=await h.scope.student();const email=a.email.replace('@','-changed@');h.scope.trackEmail(email);
  h.messages.push({ID:'changed-mail',To:[{Address:email}],Text:`http://localhost:15173/change-email#token=${'b'.repeat(43)}\n`},{ID:'foreign-mail',To:[{Address:'other@example.invalid'}],Text:`/change-email#token=${'c'.repeat(43)}`});
  assert.equal(await h.scope.mailToken(email,'change-email'),'b'.repeat(43));await assert.rejects(h.scope.mailToken('other@example.invalid','change-email'));await assert.rejects(h.scope.mailToken(email,'arbitrary-route'));
  await h.scope.cleanup();assert.ok(h.deletedMail.includes('changed-mail'));assert.ok(!h.deletedMail.includes('foreign-mail'));
});
test('successful cleanup prefers actual deletion routes and fixes owner despite mutable returned account fields',async()=>{
  const h=harness();const a=await h.scope.student();a.email=a.email.replace('@','-changed@');a.password='changed-synthetic-passphrase';a.account.studentId='01JTEST0000000000000000009';h.setRow({publicId:studentId,email:a.email,status:'ACTIVE'});
  await h.scope.cleanup();const login=h.calls.filter(c=>c.route.endsWith('/login')).at(-1);assert.equal(login.body.email,a.email);assert.equal(login.body.password,a.password);assert.ok(h.calls.some(c=>c.route.endsWith('/confirm')));
  const final=h.sql.find(s=>s.includes('START TRANSACTION;')&&s.includes('DELETE FROM mp_student_account'));assert.match(final,new RegExp(`DELETE FROM mp_student_account WHERE public_id IN \\('${studentId}'\\)`));assert.ok(!final.includes(a.account.studentId));assert.ok(!final.includes('WHERE email_normalized IN'));assert.equal(h.receiptRows.size,0);
});
test('lost registration response resolves only exact claimed Intake and still removes delivered mail',async()=>{
  const h=harness({lostRegistration:true});await assert.rejects(h.scope.student(),/lost response/);await h.scope.cleanup();
  assert.ok(h.sql.some(s=>s.startsWith("SELECT JSON_OBJECT('publicId'")&&s.includes(`i.public_id='${intakeId}'`)&&s.includes('i.claimed_student_id=s.id')));assert.deepEqual(h.deletedMail,['mail-0']);
});
test('trackReceipt requires database ownership and completed detached cleanup includes both fixed IDs',async()=>{
  const h=harness();await h.scope.student();assert.throws(()=>h.scope.trackReceipt(receiptId),/not owned/);h.receiptRows.set(receiptId,{receiptId,requestId,studentId,status:'REQUESTED'});h.scope.trackReceipt(receiptId);h.setRow(null);h.receiptRows.get(receiptId).status='COMPLETED';await h.scope.cleanup();
  const cleanup=h.sql.find(s=>s.startsWith('DELETE FROM mp_account_deletion_request WHERE receipt_id='));assert.ok(cleanup.includes(`receipt_id='${receiptId}'`));assert.ok(cleanup.includes(`public_id='${requestId}'`));assert.ok(cleanup.includes("student_id IS NULL AND status='COMPLETED'"));
});
test('P7 raw fallback does exact V8 graph cleanup but cannot masquerade as formal deletion success',async()=>{
  const h=harness({loginFailure:true});await h.scope.student();await assert.rejects(h.scope.cleanup(),/Exact fixture data cleanup failed/);
  const cleanup=h.sql.find(s=>s.includes('DELETE FROM mp_student_account'));for(const table of ['mp_admin_export_student','mp_student_data_export','mp_account_deletion_request','mp_step_completion','mp_sensitive_audit'])assert.ok(cleanup.includes(table));assert.ok(!/FOREIGN_KEY_CHECKS|TRUNCATE|DROP |FLUSH/i.test(cleanup));assert.equal(h.getRow(),null);assert.deepEqual(h.deletedMail,['mail-0']);
});
test('a foreign file pointer fails before bytes or SQL graph are removed, while exact mail cleanup still runs',async()=>{
  const h=harness({loginFailure:true,foreignArtifact:true});await h.scope.student();await assert.rejects(h.scope.cleanup(),/Exact fixture data cleanup failed/);assert.deepEqual(h.removedObjects,[]);assert.ok(!h.sql.some(s=>s.includes('DELETE FROM mp_student_account')));assert.deepEqual(h.deletedMail,['mail-0']);
});
test('legacy no-V8 cleanup still uses captured public ID, retains V5 completion dependencies, never invokes deletion API',async()=>{
  const h=harness({privacy:false});await h.scope.student();await h.scope.cleanup();assert.ok(!h.calls.some(c=>c.route.includes('account-deletion')));assert.ok(h.sql.some(s=>s.includes('mp_step_completion')));assert.ok(!h.sql.some(s=>s.includes('DELETE FROM mp_student_data_export')));
});
test('private file remover is exact, idempotent and refuses symlinks or cross-class paths',()=>{
  const root=realpathSync(mkdtempSync(path.join(tmpdir(),'majorpilot-fixture-files-')));try{
    mkdirSync(path.join(root,'student'));const own=path.join(root,'student',studentId+'.zip'),unrelated=path.join(root,'unrelated.txt');writeFileSync(own,'synthetic');writeFileSync(unrelated,'keep');removeFixtureObject(`student/${studentId}.zip`,root);assert.equal(existsSync(own),false);assert.equal(readFileSync(unrelated,'utf8'),'keep');removeFixtureObject(`student/${studentId}.zip`,root);
    for(const key of ['../unrelated.txt',`student/${studentId}.csv`,`admin/${studentId}.zip`,'student/not-id.zip'])assert.throws(()=>removeFixtureObject(key,root));
    symlinkSync(unrelated,own);assert.throws(()=>removeFixtureObject(`student/${studentId}.zip`,root),/Unsafe/);assert.equal(readFileSync(unrelated,'utf8'),'keep');
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('prefix and nonce cannot introduce SQL or filesystem metacharacters',()=>{
  for(const prefix of ['p1','p8','p7-../','p7-browser\n','p7\x27'])assert.throws(()=>createFixtureScope(prefix));
  assert.throws(()=>createFixtureScope('p7',{nonce:'not-hex'}));
});
