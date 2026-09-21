// UI-only mocked transport. No accounts, database changes, email, or model calls.
// This checks rendering/accessibility only and cannot replace P7 actual-API gates.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const output='/tmp/majorpilot-p7-layout-only';await mkdir(output,{recursive:true});
const id='01ARZ3NDEKTSV4RRFFQ69G5FAV',now='2026-09-21T00:00:00.000Z';
const meta={requestId:'layout-only',apiVersion:'v1'};
const zero={numerator:0,denominator:0,rate:null,cohortCount:0,immatureCount:0,anchor:'FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT',windowDays:7};
const metrics={firstExperienceCompletion:{...zero,anchor:'FIRST_FORMAL_RECOVERY_CHAIN_STARTED_AT'},reportInsight:{...zero,windowDays:0},secondExperienceStart:{...zero,windowDays:14},feedbackCoverage:{numerator:0,denominator:0,rate:null,answeredWithoutViewed:0,unobservedReportCount:0},secondStartTiming:{before:0,after:0}};
const stages=['INTAKE_STARTED','PROFILE_SUBMITTED','RECOMMENDATION_VIEWED','REGISTERED','EMAIL_VERIFIED','FIRST_EXPERIENCE_STARTED','FIRST_EXPERIENCE_CLOSED','FIRST_REPORT_VIEWED','FIRST_REPORT_SURVEY_SUBMITTED'];
const overview={metricsVersion:'metrics-v2 · UI-only empty fixture',asOf:now,from:'2026-06-23T00:00:00.000Z',to:now,filters:{},dataUpdatedAt:now,exclusions:{testStudents:0,botStudents:0,deletionStudents:0,nonStandardRuns:0},metrics,byMajor:['AI','DATA_SCIENCE','BUSINESS_ANALYTICS'].map(majorCode=>({majorCode,metrics})),funnels:[{key:'FIRST_VALUE',grain:'INTAKE_JOURNEY_THEN_UNIQUE_STUDENT',anchor:'INTAKE_STARTED_AT',stages:stages.map(key=>({key,count:0,previousConversion:null,cumulativeConversion:null})),coverageNotes:['UI-only empty fixture; not a product baseline.']}],comparisonByMajorPair:[],taskFunnels:[],diagnostics:{eligibleStudents:0,runsWithActivityObservations:0,eligibleStartedRuns:0,observedActiveSeconds:0,activityObservationCoverage:null},coverageNotes:['UI-only layout fixture'],health:{checkedAt:now,jobs:[],safeErrors:[],overdueDeletionCount:0,reportReadyVersionCount:0,reportFallbackVersionCount:0,unknownCostCalls:null,knownEstimatedCost:null,retention:[],coverageNotes:['UI-only fixture']}};
const menu=[['overview','运营概览'],['students','学生账户'],['experience-runs','体验运行'],['reports','报告管理'],['task-versions','任务版本'],['exports','受控导出'],['audit-events','审计记录']];
const results=[];
for(const channel of process.argv.includes('--chrome-only')?['chrome']:['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true});
 const deadline=setTimeout(()=>void browser.close(),180000);
 try{
 const context=await browser.newContext({viewport:{width:1536,height:1024}});context.setDefaultTimeout(10000);
  const admin=await context.newPage(),errors=[];admin.on('pageerror',e=>errors.push(e.message));
  const studentRow={studentId:id,alias:'布局专用学生',status:'ACTIVE',analyticsExclusionCode:null,revision:0,createdAt:now,emailVerifiedAt:now,lastLoginAt:now,profileCount:1,startedMajorCount:0,closedMajorCount:0};
  const adminActions=[];
  await admin.addInitScript(()=>sessionStorage.setItem('MP_ADMIN_TOKEN','UI-only-not-a-valid-jwt'));
  await admin.route('**/dev-api/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace('/dev-api','');let body;
   if(path==='/getInfo')body={code:200,user:{userId:999,userName:'UI-only',nickName:'布局夹具',avatar:''},roles:['admin'],permissions:['*:*:*']};
   else if(path==='/getRouters')body={code:200,data:[{path:'/majorpilot',component:'Layout',name:'MajorPilot',meta:{title:'MajorPilot',icon:'guide'},children:menu.map(([path,title])=>({path,component:`majorpilot/${path}/index`,name:'MajorPilot'+path,meta:{title,noCache:true}}))}]};
   else if(path==='/api/admin/v1/majorpilot/overview')body={data:overview,meta};
   else if(path==='/api/admin/v1/majorpilot/students')body={data:{rows:[studentRow],total:1},meta};
   else if(path===`/api/admin/v1/majorpilot/students/${id}/analytics-exclusion`){const request=route.request().postDataJSON();assert.deepEqual(request,{expectedRevision:0,exclusionCode:'TEST',reason:'本次仅验证界面操作，不创建真实产品分析数据。'});adminActions.push('exclusion');studentRow.analyticsExclusionCode='TEST';studentRow.revision=1;body={data:studentRow,meta}}
   else if(path===`/api/admin/v1/majorpilot/students/${id}/sensitive-view`){const request=route.request().postDataJSON();assert.deepEqual(request,{purpose:'SUPPORT_REQUEST',reason:'本次仅验证敏感读取对话框，使用合成邮箱夹具。'});adminActions.push('sensitive');body={data:{studentId:id,email:'layout-only@example.invalid'},meta}}
   else if(path.startsWith('/api/admin/v1/majorpilot/'))body={data:{rows:[],total:0,scopeNotes:['UI-only empty list fixture']},meta};
   else body={code:200,data:null};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await admin.goto('http://localhost:15174/majorpilot/overview');
  await admin.getByRole('heading',{name:'MajorPilot 运营概览'}).waitFor();await admin.locator('.mp-kpi').first().waitFor();
  assert.equal(await admin.locator('.mp-kpi strong').allTextContents().then(v=>v.every(x=>x==='—')),true,'zero denominators must be unknown');
  assert.ok((await admin.locator('.mp-kpi').first().textContent()).includes('首条正式体验恢复链最早开始时间'),'completion cohort uses real MetricsEngine start anchor, not report readiness');
  assert.equal(await admin.locator('.mp-funnel .el-table__body tbody tr').count(),9,'all nine stages rendered');
  for(const width of [1536,1100]){await admin.setViewportSize({width,height:1024});await admin.screenshot({path:`${output}/${channel}-overview-${width}.png`});const overflow=await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false)}
  for(const [path,title] of menu.slice(1)){await admin.goto(`http://localhost:15174/majorpilot/${path}`);await admin.locator('.mp-operations h1').waitFor();assert.ok((await admin.locator('.mp-operations h1').textContent()).length>0,title);}
  await admin.goto('http://localhost:15174/majorpilot/reports');await admin.getByLabel('专业',{exact:true}).selectOption('AI');await admin.getByLabel('报告类型',{exact:true}).selectOption('COMPARISON');assert.equal(await admin.getByRole('combobox',{name:'专业',exact:true}).inputValue(),'AI');assert.equal(await admin.getByRole('combobox',{name:'报告类型',exact:true}).inputValue(),'COMPARISON');
  await admin.goto('http://localhost:15174/majorpilot/exports');await admin.getByLabel('数据集',{exact:true}).selectOption('METRICS');assert.equal(await admin.getByRole('combobox',{name:'数据集',exact:true}).inputValue(),'METRICS');await admin.getByText('选择白名单字段（至少一项）',{exact:true}).waitFor();
  await admin.goto('http://localhost:15174/majorpilot/students');const row=admin.locator('.el-table__body tbody tr').filter({hasText:id});await row.getByRole('button',{name:'分析标记',exact:true}).click();await admin.getByRole('dialog',{name:'修改分析排除标记',exact:true}).waitFor();
  await writeFile(`${output}/${channel}-student-dialog-accessibility.txt`,await admin.getByRole('dialog').ariaSnapshot());assert.equal(await admin.getByLabel('分析排除',{exact:true}).count(),1);assert.equal(await admin.getByRole('combobox',{name:'分析排除',exact:true}).count(),1);
  await admin.getByLabel('分析排除',{exact:true}).selectOption('TEST');await admin.getByLabel('操作原因（必填）',{exact:true}).fill('本次仅验证界面操作，不创建真实产品分析数据。');await admin.screenshot({path:`${output}/${channel}-student-exclusion-dialog.png`,animations:'disabled'});await admin.getByRole('button',{name:'确认提交',exact:true}).click();await admin.getByRole('dialog').waitFor({state:'hidden'});assert.equal(adminActions.includes('exclusion'),true);
  await row.getByRole('button',{name:'敏感读取',exact:true}).click();await admin.getByRole('dialog',{name:'必要敏感内容读取',exact:true}).waitFor();await admin.getByLabel('用途',{exact:true}).selectOption('SUPPORT_REQUEST');await admin.getByLabel('操作原因（必填）',{exact:true}).fill('本次仅验证敏感读取对话框，使用合成邮箱夹具。');await admin.getByRole('button',{name:'确认并读取',exact:true}).click();await admin.locator('.el-dialog pre').waitFor();assert.ok((await admin.locator('.el-dialog pre').textContent()).includes('layout-only@example.invalid'));await admin.screenshot({path:`${output}/${channel}-student-sensitive-dialog.png`});await admin.getByRole('button',{name:'取消',exact:true}).click();await admin.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await admin.locator('.el-dialog pre').count(),0);assert.deepEqual(adminActions,['exclusion','sensitive']);
  await context.close();
  const student=await browser.newContext({viewport:{width:1536,height:1024}});student.setDefaultTimeout(10000);const page=await student.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data;
   if(path==='/api/app/v1/me')data={studentId:id,email:'layout-only@example.invalid',status:'ACTIVE',emailVerified:true,canStartExperience:true};
   else if(path==='/api/app/v1/consents')data=[{documentType:'RESEARCH',documentVersion:'v1',decision:'DECLINED',decidedAt:now}];
   else if(path==='/api/app/v1/data-export-requests')data={items:[]};
   else if(path.endsWith('/auth/csrf'))data={csrfToken:'layout-only-csrf'};
   else if(path==='/api/app/v1/account-deletion-requests')data={requestId:id,receiptId:id,status:'REQUESTED',requestedAt:now,confirmedAt:null,scheduledFor:null,completedAt:null,receiptExpiresAt:'2026-09-28T00:00:00Z'};
   else throw new Error('Unexpected UI-only request: '+path);
   await route.fulfill({status:path.endsWith('account-deletion-requests')?201:200,contentType:'application/json',body:JSON.stringify({data,meta})});
  });
  await page.goto('http://localhost:15173/app/settings');await page.getByRole('heading',{name:'账户与隐私'}).waitFor();await page.getByText('layout-only@example.invalid',{exact:true}).waitFor();
  for(const width of [1536,1024,390]){
   await page.setViewportSize({width,height:width===390?844:1024});await page.screenshot({path:`${output}/${channel}-settings-${width}.png`,fullPage:true});if(width===1536)await page.screenshot({path:`${output}/${channel}-settings-fold-1536.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(await page.locator('.privacy-export-button').evaluate(el=>el.getBoundingClientRect().height<=60),'export action must stay single-line and compact');
   await page.getByRole('button',{name:'修改密码',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByLabel('当前密码',{exact:true}).inputValue(),'');await page.getByLabel('当前密码',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.getByLabel('新密码',{exact:true}).evaluate(el=>document.activeElement===el),true);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'了解并申请删除'}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('button',{name:'确认删除账户',exact:true}).isEnabled(),false);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await student.close();results.push({channel,scope:'UI-only mocked transport, no real identities or product metrics',allNineStages:true,zeroDenominator:'unknown',studentDialogActions:adminActions,sensitiveClearedOnClose:true,settingsWidths:[1536,1024,390],nativePasswordTab:true,dialogEscape:true,deletionUnchecked:true,pageErrors:0});
 }finally{clearTimeout(deadline);await browser.close()}
}
await writeFile(`${output}/results.json`,JSON.stringify({status:'PASS',scope:'MOCK_LAYOUT_ONLY',results},null,2));console.log(JSON.stringify({status:'PASS',scope:'MOCK_LAYOUT_ONLY',results}));
