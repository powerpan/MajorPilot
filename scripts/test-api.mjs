import assert from 'node:assert/strict';
import { readLocalEnv } from './env.mjs';
const env = readLocalEnv();
const base = 'http://127.0.0.1:18080';
class Client {
  cookies = new Map();
  constructor(origin = 'http://localhost:15173') { this.origin = origin; }
  async call(path, { method = 'GET', body, headers = {}, csrf = false } = {}) {
    const cookie = [...this.cookies.entries()].filter(([key,c]) => path === c.path || path.startsWith(`${c.path.replace(/\/$/, '')}/`) || c.path === '/').map(([k,c]) => `${k}=${c.value}`).join('; ');
    if (csrf) headers['X-CSRF-Token'] = this.cookies.get(path.startsWith('/api/app/') ? 'MP_CSRF' : 'MP_PUBLIC_CSRF')?.value || '';
    const response = await fetch(base + path, { method, headers: { Origin: this.origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000), redirect: 'error' });
    for (const value of response.headers.getSetCookie()) {
      const parts = value.split(';').map(x => x.trim()); const equal = parts[0].indexOf('='); const key = parts[0].slice(0,equal); const v = parts[0].slice(equal+1);
      if (parts.includes('Max-Age=0')) this.cookies.delete(key);
      else this.cookies.set(key, { value: v, path: parts.find(x => /^Path=/i.test(x))?.slice(5) || '/' });
    }
    let result; try { result = await response.json(); } catch { result = null; }
    return { status: response.status, body: result };
  }
}
async function student() {
  const client = new Client();
  assert.equal((await client.call('/api/public/v1/auth/csrf')).status, 200);
  assert.equal((await client.call('/api/public/v1/p0/intake', { method:'POST', body:{}, csrf:true })).status, 200);
  const claimed = await client.call('/api/public/v1/p0/claim', {method:'POST', body:{}, csrf:true});
  assert.equal(claimed.status, 200);
  await client.call('/api/public/v1/auth/csrf');
  assert.equal((await client.call('/api/public/v1/p0/login', {method:'POST', body:{studentId:claimed.body.data.studentId,password:env.MP_P0_STUDENT_PASSWORD}, csrf:true})).status, 200);
  return client;
}
const admin = new Client('http://localhost:15174');
const logged = await admin.call('/login', {method:'POST',body:{username:'admin',password:env.MP_P0_ADMIN_PASSWORD}});
assert.equal(logged.body?.code, 200, 'Admin login failed (body suppressed)');
const authorization = `Bearer ${logged.body.token}`;
assert.ok(logged.body.token);
const a = await student(), b = await student();
const crossedAdmin = await a.call('/api/admin/v1/majorpilot/p0/whoami', {headers:{Origin:'http://localhost:15174',Cookie:`MP_SESSION=${a.cookies.get('MP_SESSION').value}`}});
assert.ok(crossedAdmin.status === 401 || crossedAdmin.body?.code === 401, 'Student accepted as admin');
assert.equal((await admin.call('/api/app/v1/p0/whoami', {headers:{Authorization:authorization}})).status, 401);
assert.equal((await a.call('/api/app/v1/p0/examples',{method:'POST',body:{label:'synthetic-crud'},headers:{'X-CSRF-Token':a.cookies.get('MP_PUBLIC_CSRF').value}})).status,403,'Public CSRF accepted as student CSRF');
assert.equal((await a.call('/api/app/v1/p0/examples',{method:'POST',body:{label:'synthetic-crud'},csrf:true,headers:{Origin:'https://untrusted.invalid'}})).status,403,'Bad origin accepted');
const created = await a.call('/api/app/v1/p0/examples',{method:'POST',body:{label:'synthetic-crud'},csrf:true});
assert.equal(created.status,200);
const id = created.body.data.id;
assert.ok((await a.call('/api/app/v1/p0/examples')).body.data.some(x=>x.id===id));
assert.equal((await b.call('/api/app/v1/p0/examples')).body.data.some(x=>x.id===id),false);
assert.equal((await b.call(`/api/app/v1/p0/examples/${id}`,{method:'DELETE',csrf:true})).status,404);
assert.equal((await a.call(`/api/app/v1/p0/examples/${id}`,{method:'DELETE',csrf:true})).status,200);
for (const kind of ['verify','reset']) {
  const sent = await a.call('/api/app/v1/p0/mail',{method:'POST',body:{kind},csrf:true});
  assert.equal(sent.status,200,'Mail send failed');
  const list = await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json();
  const message = list.messages.find(x=>x.Subject.includes(sent.body.data.messageId));
  assert.ok(message,'Synthetic email not captured');
  const detail = await (await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();
  assert.ok(detail.Text.includes(`/p0-mail/${kind}#token=p0-synthetic-`));
}
await admin.call('/logout',{method:'POST',headers:{Authorization:authorization}});
for (const client of [a,b]) {
  await client.call('/api/app/v1/p0/deletion',{method:'POST',csrf:true});
  assert.equal((await client.call('/api/app/v1/p0/delete-confirm',{method:'POST',body:{password:env.MP_P0_STUDENT_PASSWORD},csrf:true})).status,200);
}
console.log(JSON.stringify({studentToAdminDenied:true,adminToStudentDenied:true,crossBoundaryCsrfDenied:true,wrongOriginDenied:true,ownedCrud:true,crossStudentDenied:true,mailVerifyAndResetCaptured:true,scope:'synthetic P0, not product registration/reset',result:'PASS'}));
