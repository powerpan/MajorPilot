// Stateful UI transport regression. Every /api/ request is intercepted; no real
// accounts, email, database writes, reports, provider requests or payment calls.
// Requires parent-managed Vite servers. Does not start or stop any process.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { copy, codes, names, now, id, keys, questionnaire, profile, run } from './profile-fixture.mjs';
const base=process.env.MP_E2E_BASE_URL || 'http://127.0.0.1:15176';
const pilotBase=process.env.MP_E2E_PILOT_BASE_URL;
const pilotOnly=process.argv.includes('--pilot-only');
const intakeOnly=process.argv.includes('--intake-only');
assert.ok(!pilotOnly||pilotBase,'--pilot-only requires MP_E2E_PILOT_BASE_URL');
assert.ok(!(pilotOnly&&intakeOnly),'Choose one targeted mode');
const out=process.env.MP_E2E_OUTPUT || `/tmp/majorpilot-20261114-profile-flow${pilotOnly?'-pilot':''}`;
for(const value of [base,pilotBase].filter(Boolean)) assert.ok(['127.0.0.1','localhost'].includes(new URL(value).hostname),'UI regressions only run against local parent-managed servers');
await mkdir(out,{recursive:true});
const results=[];
const errors=[];
const consoleMessages=[];
const meta={requestId:'synthetic-ui-profile',apiVersion:'v1'};
const channels=process.argv.includes('--chrome-only')?['chrome']:['chrome','msedge'];
async function until(check,message){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw new Error(message);}
function fixture({authenticated=true,consented=true,initial=profile({applicationStage:'EXPLORING',targetIntakeWindow:'UNSURE',currentField:null})}={}) {
 return {authenticated,consented,state:{profile:copy(initial),draft:null,draftRevision:0},runs:[],reports:[],writes:[],unknown:[],expectedConsoleFailures:new Set(),history:initial?[copy(initial)]:[],failNextSave:false,loseNextSubmission:false,replays:new Map(),intake:{intakeSessionId:id,questionnaireVersion:'decision-profile-v1',status:'DRAFT',revision:0,expiresAt:'2099-11-21T00:00:00Z',lastStepKey:'step-1',answers:{},recommendationId:null},allowances:{experience:{limit:3,used:1,remaining:2,reserved:0},comparison:{limit:2,used:0,remaining:2,reserved:0}}};
}
async function transport(context,f) {
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
  const body=req.postData()?req.postDataJSON():null;
  const fail=(status,code,details={})=>{if((status===401&&!f.authenticated&&path==='/api/app/v1/me')||([409,503].includes(status)&&path.startsWith('/api/app/v1/profile/')))f.expectedConsoleFailures.add(`${status} ${path}`);return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message:'Safe synthetic error',...details},meta})});};
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data:copy(data),meta})});
  if(!['GET','HEAD'].includes(method)) f.writes.push({path,method,body:copy(body),key:req.headers()['idempotency-key']});
  if(path.endsWith('/auth/csrf'))return route.fulfill({status:200,headers:{'content-type':'application/json','set-cookie':`${path.includes('/public/')?'MP_PUBLIC_CSRF':'MP_CSRF'}=synthetic-ui-csrf; Path=/; SameSite=Lax`},body:JSON.stringify({data:{csrfToken:'synthetic-ui-csrf'},meta})});
  if(!['GET','HEAD'].includes(method))assert.equal(req.headers()['x-csrf-token'],'synthetic-ui-csrf','UI mutations retain the existing CSRF transport');
  if(path==='/api/app/v1/me')return f.authenticated?ok({studentId:id,email:'ui-only@example.invalid',status:'ACTIVE',emailVerified:true,canStartExperience:f.consented}):fail(401,'AUTH_REQUIRED');
  if(path==='/api/public/v1/questionnaires/current')return ok(questionnaire);
  if(path==='/api/app/v1/profile'&&method==='GET')return ok(f.state);
  if(path==='/api/app/v1/profile/draft'&&method==='PUT'){
   if(f.failNextSave){f.failNextSave=false;return fail(503,'SERVICE_UNAVAILABLE');}
   if(body.expectedRevision!==f.state.draftRevision)return fail(409,'PROFILE_DRAFT_CONFLICT',{details:{currentRevision:f.state.draftRevision}});
   if(body.baseProfileVersion!==(f.state.profile?.profileVersion||0))return fail(409,'PROFILE_VERSION_CONFLICT',{details:{currentProfileVersion:f.state.profile?.profileVersion||0}});
   f.state.draftRevision++;f.state.draft={revision:f.state.draftRevision,baseProfileVersion:body.baseProfileVersion,questionnaireVersion:body.questionnaireVersion,answers:body.answers,lastStepKey:body.lastStepKey,mode:body.mode};return ok(f.state);
  }
  if(path==='/api/app/v1/profile/draft/discard'){
   if(body.expectedRevision!==f.state.draftRevision)return fail(409,'PROFILE_DRAFT_CONFLICT',{details:{currentRevision:f.state.draftRevision}});
   f.state.draft=null;f.state.draftRevision++;return ok(f.state);
  }
  if(path==='/api/app/v1/profile/submit'){
   const key=req.headers()['idempotency-key'];assert.ok(key,'submit must be idempotent');
   if(f.replays.has(key))return ok(f.replays.get(key),201);
   if(body.expectedRevision!==f.state.draftRevision)return fail(409,'PROFILE_DRAFT_CONFLICT',{details:{currentRevision:f.state.draftRevision}});
   f.state.profile=profile(body.answers,(f.state.profile?.profileVersion||0)+1);f.history.push(copy(f.state.profile));f.state.draft=null;f.state.draftRevision++;
   const data={profile:f.state.profile,recommendation:null,draftRevision:f.state.draftRevision};f.replays.set(key,copy(data));
   if(f.loseNextSubmission){f.loseNextSubmission=false;return fail(503,'SERVICE_UNAVAILABLE');}return ok(data,201);
  }
  if(path==='/api/app/v1/pilot')return ok({consented:f.consented,allowances:f.allowances});
  if(path==='/api/app/v1/pilot/consent'){assert.ok(body.consents.some(x=>x.documentType==='TERMS'&&x.decision==='ACCEPTED'));assert.ok(body.consents.some(x=>x.documentType==='PRIVACY'&&x.decision==='ACCEPTED'));f.consented=true;return ok({consented:true,allowances:f.allowances});}
  if(path==='/api/app/v1/dashboard')return ok({profile:f.state.profile,recommendation:null,nextRecommendation:null,majors:codes.map((majorCode,i)=>({majorCode,name:names[i],description:'合成专业介绍',status:f.runs.find(r=>r.majorCode===majorCode)?.status||'NOT_STARTED',availability:i===2?'CONTENT_PREPARING':'AVAILABLE'})),currentDecision:null,nextStep:'SELECT_EXPERIENCE'});
  if(path==='/api/app/v1/experience-runs'&&method==='GET')return ok(f.runs);
  if(path==='/api/app/v1/experience-runs'&&method==='POST'){assert.deepEqual(Object.keys(body),['majorCode']);const created=run(body.majorCode,'READY',f.runs.length);f.runs.push(created);return ok(created,201);}
  const transition=path.match(/\/experience-runs\/([^/]+)\/(start|resume)$/);
  if(transition){const target=f.runs.find(r=>r.runId===transition[1]);assert.equal(body.expectedRevision,target.revision);if(body.pauseActiveRunId){const active=f.runs.find(r=>r.runId===body.pauseActiveRunId);assert.equal(body.expectedActiveRunRevision,active.revision);active.status='PAUSED';active.revision++;}target.status='IN_PROGRESS';target.revision++;return ok(target);}
  if(path==='/api/app/v1/experience-editions')return ok([]);
  if(path==='/api/app/v1/reports')return ok({items:f.reports,nextCursor:null});
  if(path==='/api/app/v1/comparison-report')return ok({state:'WAITING',reason:'NEED_TWO_MAJORS',majors:[]});
  // The card regression stops at navigation. Do not fabricate professional task content.
  const runRead=path.match(/\/experience-runs\/([^/]+)$/);
  if(runRead&&method==='GET')return ok({...f.runs.find(r=>r.runId===runRead[1]),status:'READY'});
  if(path==='/api/public/v1/intake-sessions'&&method==='POST')return ok(f.intake,201);
  if(path===`/api/public/v1/intake-sessions/${id}`)return ok(f.intake);
  if(path===`/api/public/v1/intake-sessions/${id}/draft`){assert.equal(body.expectedRevision,f.intake.revision);f.intake.answers={...f.intake.answers,...body.answers};f.intake.revision++;f.intake.lastStepKey=body.stepKey;return ok(f.intake);}
  if(path===`/api/public/v1/intake-sessions/${id}/finish`){assert.equal(body.expectedRevision,f.intake.revision);f.intake.answers=body.answers;f.intake.revision++;f.intake.status='SUBMITTED';return ok({profile:profile(body.answers),recommendation:null},201);}
  f.unknown.push(`${method} ${path}`);return fail(501,'UI_MOCK_UNEXPECTED_REQUEST');
 });
}
function observePage(page,f){page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(!['error','warning','warn'].includes(message.type()))return;const text=message.text(),url=message.location().url;const status=text.match(/^Failed to load resource: the server responded with a status of (401|409|503)\b/)?.[1];let path='';try{path=new URL(url).pathname;}catch{}consoleMessages.push({type:message.type(),text,url,expected:!!status&&f.expectedConsoleFailures.has(`${status} ${path}`)});});}
async function pageFor(browser,f,url=base){const context=await browser.newContext({viewport:{width:1440,height:1000}});context.setDefaultTimeout(10000);await transport(context,f);const page=await context.newPage();observePage(page,f);page.on('dialog',dialog=>dialog.accept());return {context,page,url};}
async function shot(page,name,channel,width=1440){await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});assert.ok((await page.title()).includes('MajorPilot'),`${name}: project title`);const location=new URL(page.url());assert.ok([new URL(base).origin,pilotBase&&new URL(pilotBase).origin].includes(location.origin),`${name}: expected local origin`);const expectedPath=name==='profile-summary'?'/app/profile':name==='profile-conflict'?'/app/profile/edit':name==='plans'?'/app/plans':name==='normal-register-after-skip'?'/register':'/app';assert.equal(location.pathname,expectedPath,`${name}: route identity`);assert.equal(await page.locator('vite-error-overlay').count(),0,`${name}: no Vite error overlay`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${name}: no horizontal overflow at ${width}`);assert.ok((await page.locator('main').innerText()).length>30,`${name}: nonblank`);assert.equal(await page.locator('dialog[open]').count(),0,`${name}: no blocking overlay`);await page.screenshot({path:`${out}/${channel}-${name}-${width}.png`,fullPage:true,animations:'disabled'});if(width===390)await page.screenshot({path:`${out}/${channel}-${name}-390-fold.png`,animations:'disabled'});}
for(const channel of channels){
 const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true});
 const deadline=setTimeout(()=>void browser.close(),180000);
 try{
  if(!intakeOnly&&!pilotOnly){
  const f=fixture(),{context,page}=await pageFor(browser,f);
  await page.goto(`${base}/app/profile`);await page.getByRole('heading',{name:'我的资料',exact:true}).waitFor();
  await page.getByText('用户选择不确定',{exact:true}).waitFor();assert.ok(await page.getByText('主动跳过',{exact:true}).count()>0);assert.ok(await page.getByText('尚未填写',{exact:true}).count()>0);
  await shot(page,'profile-summary',channel);await shot(page,'profile-summary',channel,390);await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('link',{name:'修改资料',exact:true}).click();await page.getByRole('radio',{name:'准备申请',exact:true}).check();
  await until(()=>f.state.draft?.answers.applicationStage==='PREPARING_APPLICATION','draft saved');assert.equal(f.state.profile.profileVersion,1);assert.equal(f.state.profile.answers.applicationStage,'EXPLORING');
  await page.reload();await page.getByRole('radio',{name:'准备申请',exact:true}).waitFor();assert.equal(await page.getByRole('radio',{name:'准备申请',exact:true}).isChecked(),true,'refresh recovers server draft');
  await page.getByRole('button',{name:'取消修改',exact:true}).click();await page.getByRole('heading',{name:'我的资料',exact:true}).waitFor();assert.equal(f.state.draft,null);assert.equal(f.state.profile.answers.applicationStage,'EXPLORING');
  await page.getByRole('button',{name:'从空白重新填写',exact:true}).click();await page.getByRole('radio',{name:'探索方向',exact:true}).waitFor();assert.equal(await page.locator('input:checked').count(),0,'blank restart has no default responses');assert.equal(f.state.profile.profileVersion,1);
  await page.getByRole('radio',{name:'已经申请',exact:true}).check();f.loseNextSubmission=true;
  await page.getByRole('button',{name:'暂不填写，先去探索',exact:true}).click();await page.getByRole('button',{name:'确认上次提交结果',exact:true}).waitFor();assert.equal(f.history.length,2,'accepted submission exists once despite lost response');
  await page.reload();await page.getByRole('button',{name:'确认上次提交结果',exact:true}).click();await page.getByRole('heading',{name:'我的资料',exact:true}).waitFor();
  assert.equal(f.history.length,2,'same idempotency key reused after refresh');assert.equal(f.state.profile.answers.applicationStage,'APPLIED');assert.equal(Object.values(f.state.profile.answerStates).filter(v=>v==='SKIPPED').length,12);assert.equal(f.history[0].answers.applicationStage,'EXPLORING','old profile unchanged');
  const submissions=f.writes.filter(x=>x.path.endsWith('/profile/submit'));assert.equal(submissions.length,2);assert.equal(submissions[0].key,submissions[1].key);
  await page.getByRole('link',{name:'修改资料',exact:true}).click();await page.getByRole('radio',{name:'探索方向',exact:true}).waitFor();
  const second=await context.newPage();second.on('dialog',d=>d.accept());observePage(second,f);await second.goto(`${base}/app/profile/edit`);await second.getByRole('radio',{name:'探索方向',exact:true}).waitFor();
  await page.getByRole('radio',{name:'准备申请',exact:true}).check();await until(()=>f.state.draft?.answers.applicationStage==='PREPARING_APPLICATION','first tab draft saved');
  await second.getByRole('radio',{name:'研究项目',exact:true}).check();await second.getByRole('button',{name:'放弃本机未同步更改，加载服务器版本',exact:true}).waitFor();assert.equal(f.state.draft.answers.applicationStage,'PREPARING_APPLICATION','stale tab cannot overwrite draft');
  await shot(second,'profile-conflict',channel);await second.close();await page.getByRole('button',{name:'取消修改',exact:true}).click();await page.getByRole('heading',{name:'我的资料',exact:true}).waitFor();
  await page.getByRole('link',{name:'修改资料',exact:true}).click();f.failNextSave=true;await page.getByRole('radio',{name:'探索方向',exact:true}).check();await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();assert.equal(f.state.profile.profileVersion,2);await page.getByRole('button',{name:'重试保存',exact:true}).click();await until(()=>f.state.draft?.answers.applicationStage==='EXPLORING','failed save retry preserves answer');await page.getByRole('button',{name:'保存草稿，稍后继续',exact:true}).click();await page.getByRole('link',{name:/继续未提交的填写/}).waitFor();
  assert.deepEqual(f.unknown,[]);await context.close();results.push({channel,case:'profile lifecycle',draftIsolation:true,refreshRecovery:true,cancel:true,blankRestart:true,idempotentLostResponse:true,multiTabConflict:true,saveRetry:true});

  const b=fixture(),blank=await pageFor(browser,b);
  await blank.context.addInitScript(({id})=>{if(sessionStorage.getItem('mock-seeded'))return;sessionStorage.setItem('mock-seeded','true');sessionStorage.setItem(`mp:profile-editor:${id}`,JSON.stringify({questionnaireVersion:'decision-profile-v1',answers:{applicationStage:'APPLIED'},step:0,revision:0,baseVersion:1,mode:'EDIT',dirty:true,pending:null}));},{id});
  await blank.page.goto(`${base}/app/profile/edit?mode=blank`);await blank.page.getByRole('radio',{name:'探索方向',exact:true}).waitFor();assert.equal(await blank.page.locator('input:checked').count(),0,'explicit blank ignores a dirty EDIT cache');
  await blank.page.getByRole('radio',{name:'准备申请',exact:true}).check();await until(()=>b.state.draft?.answers.applicationStage==='PREPARING_APPLICATION','blank restart saved');await blank.page.reload();await blank.page.getByRole('radio',{name:'准备申请',exact:true}).waitFor();assert.equal(await blank.page.getByRole('radio',{name:'准备申请',exact:true}).isChecked(),true,'RESTART draft survives refresh');
  for(let step=1;step<9;step++)await blank.page.getByRole('button',{name:'保存并继续',exact:true}).click();
  assert.deepEqual(await blank.page.locator('[data-field=scenarioPreference] select').evaluateAll(items=>items.map(item=>item.value)),['','',''],'ranking never preselects tied first place');
  await blank.page.locator('#rank-AI').selectOption('1');await blank.page.getByRole('button',{name:'暂不填写，先去探索',exact:true}).click();await blank.page.getByRole('heading',{name:'我的资料',exact:true}).waitFor();assert.deepEqual(b.state.profile.answers.scenarioPreference,[{majorCode:'AI',rank:1}]);assert.equal(b.state.profile.complete,false);assert.equal(b.state.profile.recommendationReady,false);assert.deepEqual(b.unknown,[]);await blank.context.close();results.push({channel,case:'blank restart and partial rankings',dirtyEditIgnored:true,restartRefresh:true,noDefaultRank:true,partialRankingPreserved:true});

  const d=fixture(),dash=await pageFor(browser,d);await dash.page.goto(`${base}/app`);await dash.page.getByRole('region',{name:'三个专业体验'}).waitFor();
  const cards=dash.page.getByRole('region',{name:'三个专业体验'}).locator('article');assert.equal(await cards.count(),3);assert.equal(await cards.filter({hasText:'Business Analytics'}).getByRole('button',{name:'了解这个方向',exact:true}).isEnabled(),true);
  await shot(dash.page,'dashboard-no-recommendation',channel);await shot(dash.page,'dashboard-no-recommendation',channel,390);await dash.page.setViewportSize({width:1440,height:1000});
  await cards.filter({hasText:'Artificial Intelligence'}).getByRole('button',{name:'开始 AI 体验',exact:true}).click();await dash.page.waitForURL('**/app/runs/*');assert.equal(d.runs[0].majorCode,'AI');assert.equal(d.runs[0].status,'IN_PROGRESS');
  d.runs.push(run('DATA_SCIENCE','PAUSED',1));const previousSteps=copy(d.runs.map(r=>r.steps));await dash.page.goto(`${base}/app`);await dash.page.getByRole('button',{name:'继续 DS 体验',exact:true}).click();await dash.page.waitForURL('**/app/runs/*');assert.equal(d.runs[0].status,'PAUSED');assert.equal(d.runs[1].status,'IN_PROGRESS');assert.deepEqual(d.runs.map(r=>r.steps),previousSteps,'switch keeps saved step progress');
  const resume=d.writes.find(x=>x.path.endsWith('/resume'));assert.equal(resume.body.pauseActiveRunId,d.runs[0].runId);assert.ok(Number.isInteger(resume.body.expectedActiveRunRevision));
  d.runs.push(run('BUSINESS_ANALYTICS','CLOSED',2));d.reports.push({reportId:id,sourceRunId:d.runs[2].runId,reportType:'EXPERIENCE',majorCode:'BUSINESS_ANALYTICS',status:'READY',currentVersionId:id,versionNo:1,readyAt:now,firstReadyAt:now,generation:null,revision:0});
  await dash.page.goto(`${base}/app`);await dash.page.getByRole('button',{name:'查看体验报告',exact:true}).waitFor();await shot(dash.page,'dashboard-saved-states',channel);await shot(dash.page,'dashboard-saved-states',channel,390);
  assert.equal(await dash.page.getByRole('button',{name:'继续 AI 体验',exact:true}).isVisible(),false,'mobile cannot resume a professional workspace');assert.equal(await dash.page.getByRole('button',{name:'查看体验报告',exact:true}).isVisible(),true,'mobile can read completed reports');assert.equal(await dash.page.getByRole('link',{name:'查看已保存进度 →',exact:true}).count(),2);
  await dash.page.setViewportSize({width:1440,height:1000});
  for(const [status,label,action] of [['READY','准备开始','开始 DS 体验'],['TASK_COMPLETED','等待反思','完成体验反思'],['PAUSED','已暂停','继续 DS 体验'],['IN_PROGRESS','进行中','继续 DS 体验']]){
   d.runs[1].status=status;await dash.page.goto(`${base}/app`);const ds=dash.page.locator('[data-major=DATA_SCIENCE]');await ds.getByText(label,{exact:true}).waitFor();assert.equal(await ds.getByRole('button',{name:action,exact:true}).isEnabled(),true);
  }
  d.reports[0].currentVersionId=null;d.reports[0].status='FAILED';await dash.page.goto(`${base}/app`);await dash.page.locator('[data-major=BUSINESS_ANALYTICS]').getByRole('button',{name:'查看报告进度',exact:true}).waitFor();await dash.page.getByText('报告准备异常；体验仍已完成',{exact:true}).waitFor();
  await dash.page.goto(`${base}/app/plans`);await dash.page.getByRole('button',{name:'查看支付演示',exact:true}).waitFor();const before=copy({profile:d.state,runs:d.runs,allowances:d.allowances,reports:d.reports}),writeCount=d.writes.length;
  await shot(dash.page,'plans',channel);await shot(dash.page,'plans',channel,390);await dash.page.getByRole('button',{name:'查看支付演示',exact:true}).click();await dash.page.getByRole('button',{name:'确认演示',exact:true}).click();await dash.page.getByRole('button',{name:'结束演示',exact:true}).click();await dash.page.getByText('演示结束，未产生订单或费用',{exact:false}).waitFor();assert.equal(d.writes.length,writeCount,'payment demo makes no write requests');assert.deepEqual({profile:d.state,runs:d.runs,allowances:d.allowances,reports:d.reports},before);await dash.page.reload();assert.equal(d.writes.length,writeCount,'refresh does not create orders or quota');assert.deepEqual(d.unknown,[]);await dash.context.close();results.push({channel,case:'dashboard and payment demonstration',threeCards:true,noRecommendationDirectStart:true,pauseResumeRequest:true,noQuotaOrDataMutation:true});

  }
  if(!pilotOnly){
  const publicFixture=fixture({authenticated:false,initial:null}),publicPage=await pageFor(browser,publicFixture);
  await publicPage.page.goto(`${base}/intake/1`);await publicPage.page.getByRole('radio',{name:'探索方向',exact:true}).check();await publicPage.page.getByRole('button',{name:'保存并继续',exact:true}).click();await publicPage.page.getByRole('button',{name:'跳过这题',exact:true}).click();await publicPage.page.getByRole('button',{name:'暂不填写，继续注册',exact:true}).click();await publicPage.page.waitForURL('**/register');
  assert.equal(publicFixture.intake.answers.applicationStage,'EXPLORING');assert.equal(publicFixture.intake.answers.targetIntakeWindow,null);assert.equal(publicFixture.writes.filter(x=>x.path.endsWith('/finish')).length,1);assert.equal(publicFixture.writes.some(x=>x.path.includes('/auth/register')),false,'skipping questionnaire does not register or verify identity');assert.ok(await publicPage.page.locator('input[type=email]').count());assert.ok(await publicPage.page.locator('input[type=password]').count());await shot(publicPage.page,'normal-register-after-skip',channel);
  await publicPage.page.getByLabel('邮箱',{exact:true}).fill('synthetic-ui@example.invalid');await publicPage.page.getByLabel('密码',{exact:true}).fill('Synthetic UI fixture only 2026!');await publicPage.page.getByLabel('确认密码',{exact:true}).fill('Synthetic UI fixture only 2026!');await publicPage.page.getByRole('button',{name:'注册并保存资料',exact:true}).click();assert.equal(publicFixture.writes.some(x=>x.path.includes('/auth/register')),false,'normal registration still requires explicit terms and privacy');assert.equal(await publicPage.page.locator('input[type=checkbox][required]:invalid').count(),2);
  await publicPage.page.goto(`${base}/recommendation`);await publicPage.page.getByRole('heading',{name:'先保留你的起点。',exact:true}).waitFor();await publicPage.page.reload();await publicPage.page.getByRole('heading',{name:'先保留你的起点。',exact:true}).waitFor();assert.equal(await publicPage.page.locator('.error-notice').count(),0,'partial submitted intake renders an honest empty recommendation without 404');assert.deepEqual(publicFixture.unknown,[],'no nonexistent recommendation GET');await publicPage.context.close();results.push({channel,case:'normal intake',partialPreserved:true,skipToRegistration:true,identityBoundaryUnchanged:true,noRecommendation404:true});

  }
  if(pilotBase&&!intakeOnly){const p=fixture({consented:false,initial:null}),pilot=await pageFor(browser,p,pilotBase);
   await pilot.context.addInitScript(({id})=>sessionStorage.setItem(`mp:pilot-intake:${id}`,JSON.stringify({answers:{applicationStage:'EXPLORING'},step:0})),{id});
   await pilot.page.goto(`${pilotBase}/app/welcome`);await pilot.page.getByRole('heading',{name:'开始之前，由你决定。',exact:true}).waitFor();assert.equal(await pilot.page.getByRole('button',{name:'暂不填写，先去探索',exact:true}).count(),0);await pilot.page.getByRole('button',{name:'确认，继续了解我的起点',exact:true}).click();assert.equal(p.writes.length,0,'unchecked consent cannot be skipped');await pilot.page.locator('input[type=checkbox]').nth(0).check();await pilot.page.locator('input[type=checkbox]').nth(1).check();await pilot.page.getByRole('button',{name:'确认，继续了解我的起点',exact:true}).click();await pilot.page.getByRole('radio',{name:'探索方向',exact:true}).waitFor();assert.equal(await pilot.page.getByRole('radio',{name:'探索方向',exact:true}).isChecked(),true,'old pilot half-filled cache is restored');
   await pilot.page.getByRole('button',{name:'保存草稿，稍后继续',exact:true}).click();await pilot.page.waitForURL('**/app');assert.equal(p.state.profile,null,'legacy recovery does not submit a formal profile');assert.equal(p.state.draft.answers.applicationStage,'EXPLORING');assert.equal(await pilot.page.evaluate(id=>sessionStorage.getItem(`mp:pilot-intake:${id}`),id),null,'legacy cache removed only after server draft succeeds');
   await pilot.page.getByRole('link',{name:'修改资料',exact:true}).click();await pilot.page.getByRole('button',{name:'暂不填写，先去探索',exact:true}).click();await pilot.page.waitForURL('**/app/profile');assert.equal(p.state.profile.answers.applicationStage,'EXPLORING');assert.equal(p.state.profile.recommendationReady,false);await pilot.page.goto(`${pilotBase}/app`);await pilot.page.getByRole('region',{name:'三个专业体验'}).waitFor();await shot(pilot.page,'pilot-skipped-dashboard',channel);assert.deepEqual(p.unknown,[]);await pilot.context.close();results.push({channel,case:'pilot intake',termsPrivacyRequired:true,partialSkip:true,legacyHalfFilledDraftRecovered:true});}
 }finally{clearTimeout(deadline);await browser.close();}
}
assert.deepEqual(errors,[],'no unhandled page errors');
await writeFile(`${out}/console.json`,JSON.stringify(consoleMessages,null,2));assert.deepEqual(consoleMessages.filter(message=>!message.expected),[],'no unexpected console warnings/errors');
const summary={status:'PASS',scope:'STATEFUL_UI_MOCK_ONLY',mode:pilotOnly?'PILOT_ONLY':intakeOnly?'INTAKE_ONLY':'FULL',paidCalls:0,actualBackend:false,pilotCovered:!!pilotBase&&!intakeOnly,pageErrors:0,unexpectedConsole:0,expectedNetworkErrors:consoleMessages.length,output:out,results};await writeFile(`${out}/results.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
