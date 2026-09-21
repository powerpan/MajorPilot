// Actual local P7 UI/security flows. Run only in the root-coordinated account window.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readLocalEnv } from '../../scripts/env.mjs';
import { createFixtureScope } from '../../scripts/lib/local-student-fixture.mjs';
const output='/tmp/majorpilot-p7-evidence';await mkdir(output,{recursive:true});
const scope=createFixtureScope('p7-browser'),env=readLocalEnv(),results=[];
for(const method of ['trackEmail','mailToken','trackReceipt'])assert.equal(typeof scope[method],'function',`P7 fixture ${method} must be ready before any registration`);
const channels=process.argv.includes('--chrome-only')?['chrome']:['chrome','msedge'];
async function login(page,email,password){await page.goto('http://localhost:15173/login');await page.getByLabel('邮箱',{exact:true}).fill(email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL('**/app');}
async function settings(page){await page.goto('http://localhost:15173/app/settings');await page.getByRole('heading',{name:'账户与隐私',exact:true}).waitFor();await page.locator('.privacy-row small').first().waitFor();}
async function operatorLogin(page){await page.goto('http://localhost:15174/login');await page.getByPlaceholder('账号').fill(env.MP_P0_ADMIN_USERNAME||'admin');await page.getByPlaceholder('密码').fill(env.MP_P0_ADMIN_PASSWORD);await page.getByRole('button',{name:/登\s*录/}).click();await page.waitForURL('**/index');}
function observeEvent(page,name){
 return page.waitForResponse(response=>{
  if(response.request().method()!=='POST'||new URL(response.url()).pathname!=='/api/app/v1/events')return false;
  return response.request().postDataJSON()?.events?.some(event=>event.eventName===name);
 });
}
async function verifyRunObservation(response,name,runId){
 assert.equal(response.status(),202,`${name} accepted by the real event endpoint`);
 const request=response.request().postDataJSON(),event=request.events.find(item=>item.eventName===name);
 assert.equal(event.contextPublicId,runId);assert.equal(event.contextType,'EXPERIENCE_RUN');assert.equal(event.eventVersion,'v1');assert.ok(event.visibleDurationMs>=1000);
 assert.deepEqual(Object.keys(event).sort(),['clientEventId','contextPublicId','contextType','eventName','eventVersion','occurredAt','properties','visibleDurationMs']);
 assert.deepEqual(event.properties,name==='experience.step.viewed'?{stepKey:'prepare'}:{stepKey:'prepare',inactivityBucket:'MINUTES_10_60'});
 assert.ok((await response.json()).data.acceptedCount>=1);
}
try{
 for(const channel of channels){
  const account=await scope.student({research:'ACCEPTED'});
  const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true}),context=await browser.newContext({viewport:{width:1536,height:1024}}),page=await context.newPage();
  context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(30000);
  const deadline=setTimeout(()=>void browser.close(),480000),errors=[],downloadHeaders=[];
  let activePage=page,activeSurface='student';
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(/\/data-export-requests\/.+\/download$/.test(new URL(request.url()).pathname))downloadHeaders.push(request.allHeaders().then(h=>({originPresent:!!h.origin,secFetchSite:h['sec-fetch-site'],csrfPresent:!!h['x-csrf-token']})))});
  const shot=name=>page.screenshot({path:`${output}/${channel}-${name}.png`});
  try{
   // Only this invocation's synthetic owner is marked TEST; no real content is published.
   const operator=await browser.newContext({viewport:{width:1536,height:1024}}),admin=await operator.newPage();operator.setDefaultTimeout(15000);
   activePage=admin;activeSurface='admin';
   await operatorLogin(admin);await admin.goto('http://localhost:15174/majorpilot/students');await admin.locator('.mp-operations h1').waitFor();
   await admin.getByLabel('学生公有 ID',{exact:true}).fill(account.account.studentId);await admin.getByRole('button',{name:'应用筛选',exact:true}).click();
   const row=admin.locator('.el-table__body tbody tr').filter({hasText:account.account.studentId});await row.first().waitFor();
   await row.getByRole('button',{name:'分析标记',exact:true}).click();await admin.getByLabel('分析排除',{exact:true}).selectOption('TEST');await admin.getByLabel('操作原因（必填）',{exact:true}).fill('P7 浏览器验收合成账户，明确排除产品统计。');await admin.getByRole('button',{name:'确认提交',exact:true}).click();await admin.getByRole('dialog').waitFor({state:'hidden'});
   await row.getByRole('button',{name:'敏感读取',exact:true}).click();await admin.getByLabel('用途',{exact:true}).selectOption('SUPPORT_REQUEST');await admin.getByLabel('操作原因（必填）',{exact:true}).fill('P7 必要支持读取验收，仅核对本轮合成账户邮箱。');await admin.getByRole('button',{name:'确认并读取',exact:true}).click();await admin.locator('.el-dialog pre').waitFor();assert.equal((await admin.locator('.el-dialog pre').textContent()).includes(account.email),true);
   await admin.getByRole('button',{name:'取消',exact:true}).click();await admin.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await admin.locator('pre').count(),0,'sensitive body cleared on close');
   await admin.goto('http://localhost:15174/majorpilot/overview');await admin.locator('.mp-kpi').first().waitFor();
   await admin.screenshot({path:`${output}/${channel}-overview-1536.png`});
   await admin.goto('http://localhost:15174/majorpilot/reports');await admin.getByLabel('专业',{exact:true}).selectOption('AI');await admin.getByLabel('报告类型',{exact:true}).selectOption('COMPARISON');await admin.getByRole('button',{name:'应用筛选',exact:true}).click();await admin.getByText('比较报告不能同时使用单次体验的专业或版本筛选，请清除这些筛选后重试。',{exact:true}).waitFor();await admin.getByRole('button',{name:'恢复全部',exact:true}).click();
   await admin.goto('http://localhost:15174/majorpilot/task-versions');await admin.locator('.mp-operations h1').waitFor();await admin.getByText('REVIEW 不等于已发布。技术验证不能替代专业审核与真实目标用户计时；本页不会预选审核项。',{exact:true}).waitFor();
   await admin.goto('http://localhost:15174/majorpilot/exports');await admin.locator('.mp-operations h1').waitFor();await admin.getByLabel('数据集',{exact:true}).selectOption('STUDENTS');assert.equal(await admin.locator('input[value="password"]').count(),0,'no sensitive CSV field offered');
   await operator.close();
   activePage=page;activeSurface='student';
   await login(page,account.email,account.password);
   await page.goto('http://localhost:15173/app/demos/DEMO_TABLE');
   const viewed=observeEvent(page,'experience.step.viewed');await page.getByRole('button',{name:'开始这次演示',exact:true}).click();await page.getByRole('heading',{name:'准备工作区',exact:true}).waitFor();
   const runId=new URL(page.url()).pathname.split('/').at(-1);await verifyRunObservation(await viewed,'experience.step.viewed',runId);
   // Only the browser's departure clock is shifted; server time and emitted occurredAt stay real.
   // This proves the elapsed-time branch without claiming an actual eleven-minute human absence.
   await page.clock.setFixedTime(new Date(Date.now()-11*60000));await page.getByRole('button',{name:'暂停并返回',exact:true}).click();await page.waitForURL('**/app/demos');await page.clock.setFixedTime(new Date());
   await page.locator('a[href="/app/demos/DEMO_TABLE"]').click();const resumed=observeEvent(page,'experience.run.resumed');await page.getByRole('button',{name:'恢复这次演示',exact:true}).click();await page.getByRole('heading',{name:'准备工作区',exact:true}).waitFor();await verifyRunObservation(await resumed,'experience.run.resumed',runId);
   await settings(page);
   await page.getByRole('button',{name:'撤回研究授权',exact:true}).click();await page.getByRole('button',{name:'确认撤回',exact:true}).click();await page.getByText('研究授权已撤回，不影响核心服务。',{exact:true}).waitFor();
   for(const width of [1536,1024,390]){await page.setViewportSize({width,height:width===390?844:1024});await page.evaluate(()=>scrollTo(0,0));await shot(`settings-${width}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
   await page.setViewportSize({width:1536,height:1024});
   const second=await context.newPage();await settings(second);
   await page.getByRole('button',{name:'修改密码',exact:true}).click();await page.getByLabel('当前密码',{exact:true}).fill('deliberately-wrong-current-password');await page.getByLabel('新密码',{exact:true}).fill('Synthetic-new-'+randomBytes(16).toString('hex'));await page.getByRole('button',{name:'提交变更',exact:true}).click();await page.getByText('当前密码不正确，请检查后重试。',{exact:true}).waitFor();assert.ok(page.url().includes('/app/settings'));
   const nextPassword='Synthetic-next-'+randomBytes(16).toString('hex');await page.getByLabel('当前密码',{exact:true}).fill(account.password);await page.getByLabel('新密码',{exact:true}).fill(nextPassword);await page.getByRole('button',{name:'提交变更',exact:true}).click();await page.waitForURL('**/login?notice=password-changed');await second.waitForURL('**/login');assert.equal((await account.client.call('/api/app/v1/me')).status,401,'other server session revoked');await second.close();account.password=nextPassword;
   await login(page,account.email,account.password);await settings(page);
   const newEmail=account.email.replace('@','-changed@');scope.trackEmail(newEmail);
   await page.getByRole('button',{name:'更换邮箱',exact:true}).click();await page.getByLabel('当前密码',{exact:true}).fill(account.password);await page.getByLabel('新邮箱',{exact:true}).fill(newEmail);await page.getByRole('button',{name:'提交变更',exact:true}).click();await page.getByText('变更请求已受理。如果该地址可用于本账户，我们会发送确认邮件；确认前仍使用原邮箱登录。',{exact:true}).waitFor();
   const token=await scope.mailToken(newEmail,'change-email');await page.goto(`http://localhost:15173/change-email#token=${token}`);await page.waitForURL('**/login?notice=email-changed');assert.equal(new URL(page.url()).hash,'');account.email=newEmail;
   await login(page,account.email,account.password);await settings(page);await page.getByLabel('完整个人资料',{exact:false}).check();await page.getByRole('button',{name:'请求导出',exact:true}).click();await page.getByRole('button',{name:'下载私有文件',exact:true}).waitFor({timeout:90000});
   const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载私有文件',exact:true}).click();const download=await downloaded;const downloadPath=`${output}/${channel}-synthetic-personal.zip`;await download.saveAs(downloadPath);const bytes=await readFile(downloadPath);assert.equal(bytes.subarray(0,2).toString(),'PK');
   const headers=await Promise.all(downloadHeaders);assert.ok(headers.length>0);assert.equal(headers.at(-1).csrfPresent,true);assert.equal(headers.at(-1).secFetchSite,'same-origin');
   const deletionRequest=page.waitForResponse(response=>response.status()===201&&new URL(response.url()).pathname==='/api/app/v1/account-deletion-requests');
   await page.getByRole('button',{name:'了解并申请删除',exact:true}).click();const receiptId=(await (await deletionRequest).json()).data.receiptId;scope.trackReceipt(receiptId);await page.getByRole('link',{name:'查看本次请求回执',exact:true}).waitFor();const receiptCookie=(await context.cookies()).find(c=>c.name==='MP_DELETION');assert.ok(receiptCookie?.httpOnly);assert.equal(receiptCookie.path,'/api/public/v1/deletion-receipts');
   if(channel==='chrome')await page.route('**/api/app/v1/account-deletion-requests/*/confirm',async route=>{const response=await route.fetch();assert.equal(response.status(),202,'server confirmation succeeded before lost-response simulation');await route.abort('failed')});
   await page.getByLabel('当前密码',{exact:true}).fill(account.password);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认删除账户',exact:true}).click();await page.waitForURL('**/deletion-status/*');assert.ok(receiptId);await page.getByRole('heading',{name:'账户删除回执',exact:true}).waitFor();await shot('deletion-receipt');assert.equal(await page.getByText(account.email,{exact:true}).count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('mp:intake-draft:v1')),null);
   const foreign=await browser.newContext(),foreignPage=await foreign.newPage();await foreignPage.goto(`http://localhost:15173/deletion-status/${receiptId}`);await foreignPage.getByText(/回执不存在、已过期/).waitFor();await foreign.close();
   assert.deepEqual(errors,[]);results.push({channel,version:browser.version(),status:'PASS',operatorScopedTestMarker:true,sensitiveClear:true,reportFilterConflict:true,runObservations:{stepViewedAccepted:true,resumedAccepted:true,elapsedClock:'SIMULATED_11_MINUTES',serverTime:'REAL'},privacyWidths:[1536,1024,390],researchWithdrawn:true,passwordRevokedOtherSession:true,emailFragmentConsumed:true,privateZip:true,downloadRequest:headers.at(-1),deletionReceipt:true,lostConfirmationResponse:channel==='chrome',receiptOtherBrowserRejected:true,paidCalls:0});
  }catch(cause){await activePage.screenshot({path:`${output}/${channel}-${activeSurface}-failure.png`}).catch(()=>{});throw cause}finally{clearTimeout(deadline);await browser.close()}
 }
}finally{await scope.cleanup()}
await writeFile(`${output}/results.json`,JSON.stringify({status:'PASS',scope:'ACTUAL_LOCAL_P7',accounts:channels.length,exactCleanup:true,results},null,2));console.log(JSON.stringify({status:'PASS',scope:'ACTUAL_LOCAL_P7',results}));
