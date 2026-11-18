// Real HTTP/browser flow against the isolated test-source harness. Its visibly
// labelled report transport is offline; this is NOT model semantic acceptance.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {ROOT} from '../../scripts/local-config.mjs';
import {createP6FixtureScope,expect,idempotency,p6Query,p6Origin} from '../../scripts/lib/p6-student-fixture.mjs';
const args=process.argv.slice(2);assert.ok(args.length===0||args.length===1&&['--check','--edge'].includes(args[0]));
const channel=args.includes('--edge')?'msedge':'chrome';
const read=path=>JSON.parse(readFileSync(ROOT+'/'+path,'utf8'));
const entries=[['BUSINESS_ANALYTICS','ba-learning','01JF3000000000000000000001','Q01'],['DATA_SCIENCE','ds-learning','01JF2000000000000000000001','Q08'],['AI','ai-support','01JF1000000000000000000001','Q11']].map(([major,folder,id,quality])=>{
  const manifest=read(`content/${folder}/2.0.0/manifest.json`),guide=read(`content/${folder}/2.0.0/method-guide.json`),fixture=read(`data/method-quality/cases/${quality}.json`);
  assert.equal(fixture.syntheticOnly,true);const source=fixture.input.runs.find(r=>r.majorCode===major);assert.ok(source);
  return {major,id,manifest,guide,responses:Object.fromEntries(source.finalAnswers.map(a=>[a.stepKey,a.answer]))};
});
const {loadP6Contracts}=await import('../../contracts/check-p6.mjs');const contract=await loadP6Contracts();
for(const entry of entries)for(const step of entry.manifest.steps){const valid=contract.ajv.compile(step.inputSchema);assert.ok(valid(entry.responses[step.stepKey]),`${entry.major}/${step.stepKey}: invalid synthetic response`);}
const root='/api/app/v1/experience-runs';
if(args.includes('--check'))console.log(JSON.stringify({result:'PASS',scope:'static method-led fixture preflight',majors:3,paidCalls:0,accountsCreated:0}));
else await run();
async function until(check,label,timeout=90000){const deadline=Date.now()+timeout;do{const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,300));}while(Date.now()<deadline);throw Error(label+' timed out; private data suppressed');}
function post(client,path,body,headers=idempotency()){return client.call(path,{method:'POST',body,headers});}
async function run(){
  assert.equal(p6Query('SELECT DATABASE();'),'majorpilot_test');
  assert.equal(p6Query("SELECT COUNT(*) FROM mp_task_version WHERE public_id IN ('01JF1000000000000000000001','01JF2000000000000000000001','01JF3000000000000000000001') AND status='PUBLISHED' AND JSON_SEARCH(manifest_json,'one','method-guide') IS NOT NULL;"),'3','Prepare the method harness, not the legacy one');
  const output='/tmp/majorpilot-method-e2e'+(channel==='msedge'?'-edge':'');mkdirSync(output,{recursive:true});
  const scope=createP6FixtureScope(),checks=[],errors=[];let browser,page,failed;
  try{
    const account=await scope.student(),foreign=await scope.student(),client=account.client;
    browser=await chromium.launch({channel,headless:true,chromiumSandbox:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))errors.push(message.text());});
    const login=async target=>{await page.goto(p6Origin+'/login?returnTo='+encodeURIComponent(target));await page.locator('#auth-email').fill(account.email);await page.locator('#auth-password').fill(account.password);await page.locator('.auth-form button[type=submit]').click();await page.waitForURL(p6Origin+target);};
    const reports=[];
    for(const entry of entries){
      const dashboard=expect(await client.call('/api/app/v1/dashboard'),200,'dashboard'),rec=dashboard.nextRecommendation||dashboard.recommendation;
      const decision=expect(await post(client,`/api/app/v1/recommendations/${rec.recommendationId}/decision`,{selectedMajorCode:entry.major,...(rec.primaryMajor===entry.major?{}:{overrideReasonCode:'DECLINED'})}),201,'explicit choice');
      let current=expect(await post(client,root,{decisionId:decision.decisionId}),201,'new run');current=expect(await post(client,`${root}/${current.runId}/start`,{expectedRevision:current.revision}),200,'start');
      assert.equal(current.taskVersionId,entry.id);assert.equal(current.experienceEdition,2);const runPath=`${root}/${current.runId}`;
      expect(await foreign.client.call(runPath+'/learning'),404,'foreign learning denied');
      const metadata=expect(await client.call(runPath+'/workbooks'),200,'bound workbook')[0];assert.equal(metadata.taskVersionId,entry.id);
      const opening = page.locator('.workspace-first-step');
      if(entry.major==='BUSINESS_ANALYTICS'){
        await login('/app/runs/'+current.runId);await page.locator('textarea[name=enrollmentRate]').waitFor();
        assert.match(await opening.innerText(), /正式体验已开始[\s\S]*20 ÷ 30[\s\S]*提交这一小步/);
        await page.getByRole('button',{name:'完成此步骤',exact:true}).click();await page.locator('.workspace-attention-message').waitFor();
        assert.equal(await page.locator('textarea[name=enrollmentRate]').evaluate(el=>document.activeElement===el),true);
        const downloadPromise=page.waitForEvent('download');await page.locator('.workbook-download a').click();const download=await downloadPromise;
        assert.equal(createHash('sha256').update(readFileSync(await download.path())).digest('hex'),metadata.sha256);
        const first=entry.responses['b1-context'];for(const [key,value]of Object.entries(first))await page.locator(`textarea[name="${key}"]`).fill(key==='enrollmentRate'?'40÷100是已经开始的人中的比例。':value);
        await page.getByRole('button',{name:'提交这一小步',exact:true}).click();await page.getByText('已记录 1 次提交。',{exact:false}).waitFor();
        const hint=page.locator('.method-support').filter({has:page.locator('summary',{hasText:'提示 2'})});await hint.locator('summary').click();await hint.getByRole('button',{name:'查看这份提示'}).click();await hint.getByText('这份帮助已提供；不代表你已阅读或理解。',{exact:true}).waitFor();
        await page.locator('textarea[name=enrollmentRate]').fill(first.enrollmentRate);await page.getByRole('button',{name:'提交一次修改',exact:true}).click();await page.getByText('已记录 2 次提交。',{exact:false}).waitFor();
        await page.screenshot({path:output+'/ba-explicit-revision-desktop.png',fullPage:true});
        await page.getByRole('button',{name:'完成此步骤',exact:true}).click();await until(async()=>expect(await client.call(runPath+'/steps/b1-context'),200,'browser completion').status==='COMPLETED','browser step completion');
        await page.goto(p6Origin+'/app');checks.push('real browser: validation focus, authorized XLSX download, initial/help/revision and completion');
      } else {
        await page.goto(p6Origin+'/app/runs/'+current.runId);
        const isAi = entry.major === 'AI';
        await page.locator(isAi ? 'textarea[name=taskUnderstanding]' : 'textarea[name=unit]').waitFor();
        assert.match(await opening.innerText(), isAi ? /正式体验已开始[\s\S]*错分问题[\s\S]*举个例子[\s\S]*完成此步骤/ : /正式体验已开始[\s\S]*字段说明[\s\S]*举个例子[\s\S]*完成此步骤/);
        await page.screenshot({ path: `${output}/${isAi ? 'ai' : 'ds'}-opening-desktop.png` });
        if (isAi) {
          await page.setViewportSize({ width: 1024, height: 844 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `${output}/ai-opening-compact.png` });
          await page.locator('textarea[name=taskUnderstanding]').fill(entry.responses['a1-task'].taskUnderstanding);
          await page.getByRole('button', { name: '完成此步骤', exact: true }).click();
          await page.locator('textarea[name=accuracyMeaning]').waitFor();
          assert.equal(await opening.count(), 0);
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await page.goto(p6Origin+'/app');
      }
      for(const definition of entry.manifest.steps){
        const key=definition.stepKey,step=expect(await client.call(runPath+'/steps/'+key),200,'step');if(step.status==='COMPLETED')continue;
        let learning=expect(await client.call(runPath+'/learning'),200,'learning');const guide=entry.guide.steps.find(s=>s.stepKey===key),cp=guide.checkpointId;
        if(cp&&!learning.events.some(e=>e.payload.supportId===cp.toLowerCase()+'-basic'))learning=expect(await post(client,runPath+'/learning/events',{expectedSequence:learning.sequence,stepKey:key,kind:'SUPPORT_PROVIDED',checkpointId:cp,supportId:cp.toLowerCase()+'-basic'}),200,'basic explanation');
        const response=structuredClone(entry.responses[key]);if(response.local){response.local.workbookVersion=metadata.workbookVersion;response.local.workbookSha256=metadata.sha256;}
        if (entry.major === 'AI' && key === 'a4-configure') {
          await page.goto(p6Origin+'/app/runs/'+current.runId);
          const labels = page.locator('.classifier-definition');
          await labels.first().waitFor();
          assert.equal(await labels.getByText(/^例子 · /).count(), 4);
          assert.match(await page.locator('.classifier-change-example').innerText(), /改前[\s\S]*0\.38[\s\S]*改后[\s\S]*0\.80/);
          const technical = page.locator('select[name=definition-technical_issue]');
          await technical.selectOption({ label: '补充措辞' });
          assert.match(await labels.first().innerText(), /关注.*一直转圈/);
          await page.getByRole('radio', { name: '0.70', exact: true }).check();
          await page.getByRole('radio', { name: '自动分派', exact: true }).check();
          await page.getByText('当前低分也自动分派，门槛不会改变消息去向。', { exact: true }).waitFor();
          await page.locator('textarea[name=changeReason]').fill('比较补充故障措辞后是否能更好地区分技术问题。');
          await page.locator('textarea[name=expectedTradeoff]').fill('自动分派可能减少人工工作，也可能增加错分。');
          await until(async () => {
            const { response: config } = expect(await client.call(runPath+'/steps/'+key), 200, 'read saved classifier config');
            return config?.definitionVariantIds?.technical_issue === 'technical-clarified' && config.confidenceThreshold === 0.7 && config.lowConfidencePolicy === 'AUTO_ROUTE';
          }, 'config changes persist through actual HTTP', 10000);
          await page.setViewportSize({ width: 1024, height: 844 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.locator('.classifier-change-example').screenshot({ path: `${output}/ai-config-example-compact.png` });
          await technical.selectOption(response.definitionVariantIds.technical_issue);
          await page.getByRole('radio', { name: response.confidenceThreshold.toFixed(2), exact: true }).check();
          await page.getByRole('radio', { name: '转人工复核', exact: true }).check();
          await page.locator('textarea[name=changeReason]').fill(response.changeReason);
          await page.locator('textarea[name=expectedTradeoff]').fill(response.expectedTradeoff);
          await page.getByRole('button', { name: '保存并进入评估', exact: true }).click();
          await page.locator('textarea[name=comparison]').waitFor();
          assert.deepEqual(expect(await client.call(runPath+'/steps/'+key), 200, 'completed config').response, response);
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.goto(p6Origin+'/app');
          checks.push('AI: labels, variant and threshold explanations, config persistence, navigation into evaluation');
          continue;
        }
        let saved=expect(await client.call(runPath+'/steps/'+key+'/response',{method:'PUT',body:{expectedRevision:step.revision,responseSchemaVersion:step.responseSchemaVersion,response}}),200,'save');
        if(response.local){const checked=expect(await post(client,runPath+'/learning/local-results',{stepKey:key,expectedStepRevision:saved.revision,assistance:false}),200,'local result check');assert.ok(['MATCHED','MISMATCHED'].includes(checked.record.result.status));}
        if(entry.major==='BUSINESS_ANALYTICS'&&key==='b2-metric'){
          await page.goto(p6Origin+'/app/runs/'+current.runId);await page.locator('textarea[name=focusReason]').waitFor();await page.locator('.method-check').waitFor();
          // The browser opened the next step before the API fixture filled it.
          // Explicitly discard only this synthetic account's empty local draft.
          const reload=page.getByRole('button',{name:'舍弃本机草稿并重新载入',exact:true});if(await reload.isVisible())await reload.click();
          await page.locator('[data-field-path="local.reason"] textarea').fill(response.local.reason+' 这是修改后的核对测试。');
          assert.equal(await page.locator('.method-check').count(),0,'Old check must disappear immediately after a local edit');
          await page.getByRole('button',{name:'完成此步骤',exact:true}).click();await page.locator('[data-field-path="local.check"] .workspace-attention-message').waitFor();
          assert.equal(await page.locator('[data-field-path="local.check"] button').first().evaluate(el=>el===document.activeElement),true);
          assert.notEqual(expect(await client.call(runPath+'/steps/'+key),200,'blocked before recheck').status,'COMPLETED');
          await page.locator('[data-field-path="local.reason"] textarea').fill(response.local.reason);
          const [rechecked]=await Promise.all([page.waitForResponse(r=>r.url().endsWith(runPath+'/learning/local-results')&&r.request().method()==='POST'),page.getByRole('button',{name:'核对并保存',exact:true}).click()]);assert.equal(rechecked.status(),200);
          await until(async()=>expect(await client.call(runPath+'/steps/'+key),200,'saved recheck').response?.local?.reason===response.local.reason,'restored original local explanation');
          saved=expect(await client.call(runPath+'/steps/'+key),200,'current step revision after UI check');
          await page.goto(p6Origin+'/app');checks.push('real browser: local edit invalidates the displayed check and next-step focuses the recheck action');
        }
        if(definition.operationKey){const execution=expect(await post(client,runPath+'/executions',{operationKey:definition.operationKey,inputRevision:saved.revision,parameters:{}}),200,'actual fixed algorithm');assert.equal(execution.status,'SUCCEEDED');assert.equal(execution.trustLevel,'SERVER_VERIFIED');}
        if(entry.major==='AI'&&key==='a6-decision'){
          await page.goto(p6Origin+'/app/runs/'+current.runId);
          const submitTransfer=page.getByRole('button',{name:'提交新情境回答',exact:true});
          await submitTransfer.click();
          await page.getByRole('button',{name:'新情境回答已提交',exact:true}).waitFor();
          await page.getByRole('button',{name:'完成此步骤',exact:true}).click();
          await page.getByRole('heading',{name:'回顾这次体验',exact:true}).waitFor();
          current=expect(await client.call(runPath),200,'AI finished through actual UI');
          assert.equal(current.status,'TASK_COMPLETED');
          checks.push('AI: final transfer remains available after two comparison attempts');
          continue;
        }
        if(cp||guide.transferCheckpointId){learning=expect(await client.call(runPath+'/learning'),200,'current sequence');const body={expectedSequence:learning.sequence,expectedStepRevision:saved.revision,stepKey:key,kind:'ATTEMPT_SUBMITTED',checkpointId:cp||guide.transferCheckpointId,role:cp?'INITIAL':'TRANSFER'},idem=idempotency();
          const receipt=expect(await post(client,runPath+'/learning/events',body,idem),200,'explicit attempt');assert.deepEqual(expect(await post(client,runPath+'/learning/events',body,idem),200,'exact learning replay'),receipt);
          expect(await post(foreign.client,runPath+'/learning/events',body),404,'foreign learning write denied');
        }
        if(entry.major==='AI'&&key==='a5-evaluate'){
          current=expect(await post(client,runPath+'/steps/'+key+'/complete',{expectedRevision:saved.revision}),200,'complete original comparison');
          await page.goto(p6Origin+'/app/runs/'+current.runId);
          await page.getByRole('button',{name:/在同一批消息上比较/}).click();
          const revise=page.getByRole('button',{name:'提交一次修改',exact:true});
          await revise.waitFor();
          assert.equal(await revise.isDisabled(),true,'unchanged answers must not create a revision');
          const field=page.locator('textarea[name=comparison]');
          const revised=response.comparison+' 复测时也应分别看自动处理比例和人工工作量。';
          await field.fill(revised);
          await revise.click();
          await page.locator('[data-field-path=execution] .workspace-attention-message').waitFor();
          await page.getByRole('button',{name:'运行当前配置并比较',exact:true}).click();
          await until(async()=>{
            const step=expect(await client.call(runPath+'/steps/'+key),200,'revised comparison');
            return step.response.comparison===revised&&step.executions.some(e=>e.appliedToRevision===step.revision);
          },'evaluation bound to revised response');
          await revise.click();
          await page.getByText('已记录 2 次提交。',{exact:false}).waitFor();
          await page.getByRole('button',{name:'完成此步骤',exact:true}).click();
          await page.locator('textarea[name=decision]').waitFor();
          current=expect(await client.call(runPath),200,'AI moved to final step');
          assert.equal(current.currentStepKey,'a6-decision');
          await page.getByTestId('save-status').getByText('已保存',{exact:true}).waitFor();
          await page.goto(p6Origin+'/app');
          checks.push('AI: unchanged revision gated, edited comparison re-evaluated, revision submitted and final step reopened');
          continue;
        }
        if(entry.major==='BUSINESS_ANALYTICS'&&key==='b6-action'){
          // Reproduce a saved draft differing from the immutable submission.
          expect(await client.call(runPath+'/steps/'+key+'/response',{method:'PUT',body:{
            expectedRevision:saved.revision,responseSchemaVersion:step.responseSchemaVersion,
            response:{...response,transferMode:'SKIP',transfer:''},
          }}),200,'draft diverges from recorded transfer answer');
          await page.goto(p6Origin+'/app/runs/'+current.runId);
          await page.getByRole('button',{name:'新情境回答已提交',exact:true}).waitFor();
          await page.getByRole('button',{name:'完成此步骤',exact:true}).click();
          await page.locator('.learning-submit .workspace-attention-message').waitFor();
          await page.getByRole('button',{name:'恢复上次提交',exact:true}).click();
          await page.getByText('已恢复并保存原先提交的内容。点击「完成此步骤」继续。',{exact:true}).waitFor();
          assert.equal(await page.locator('textarea[name=transfer]').inputValue(),response.transfer);
          await page.getByRole('button',{name:'完成此步骤',exact:true}).click();
          await page.getByRole('heading',{name:'回顾这次体验',exact:true}).waitFor();
          current=expect(await client.call(runPath),200,'BA finished through actual UI');
          assert.equal(current.status,'TASK_COMPLETED');
          checks.push('BA: a previously submitted transfer answer completes the final step and opens reflection');
          continue;
        }
        current=expect(await post(client,runPath+'/steps/'+key+'/complete',{expectedRevision:saved.revision}),200,'complete step');
      }
      current=expect(await client.call(runPath),200,'latest run');
      if(current.status!=='TASK_COMPLETED')current=expect(await post(client,runPath+'/task-completion',{expectedRevision:current.revision}),200,'task completion');
      const reflection=expect(await client.call(runPath+'/reflection'),200,'reflection');current=expect(await post(client,runPath+'/reflection/submission',{expectedRevision:reflection.revision,questionSetVersion:reflection.questionSetVersion,answers:{interestingStepKeys:[entry.manifest.steps[0].stepKey],difficultySources:['KNOWLEDGE'],continueSimilarWork:'YES',reflectionNote:'这是独立测试环境中的合成体验感受。'}}),200,'close');assert.equal(current.status,'CLOSED');
      const summary=await until(async()=>expect(await client.call('/api/app/v1/reports?limit=50'),200,'report list').items.find(r=>r.sourceRunId===current.runId),'report linked to exact run');
      await until(async()=>{const status=expect(await client.call(`/api/app/v1/reports/${summary.reportId}/status`),200,'report status');assert.notEqual(status.status,'FAILED');return status.currentVersionId;},'reviewed structural report');
      const report=expect(await client.call(`/api/app/v1/reports/${summary.reportId}`),200,'method report');assert.equal(report.schemaVersion,'method-report-v1');assert.equal(report.methodAnalysis.nodes.length,3);assert.match(report.methodAnalysis.summary,/合成结构测试/);assert.equal(report.calculationConditions.length,entry.manifest.steps.filter(s=>s.inputSchema.properties.local).length);assert.ok(report.calculationConditions.every(c=>c.verificationStatus==='MATCHED'));reports.push(report);
      expect(await foreign.client.call(`/api/app/v1/reports/${summary.reportId}`),404,'private report');checks.push(entry.major+': six steps, local results/algorithm, explicit attempts, reflection, reviewed report');
      console.log(JSON.stringify({major:entry.major,result:'PASS',report:'TEST_REPLAY only',paidCalls:0}));
    }
    const comparison=await until(async()=>{const r=expect(await client.call('/api/app/v1/comparison-report'),200,'comparison');return r.state==='READY'&&r.report.sources.length===3&&r.report;},'three-major comparison');assert.equal(comparison.methodAnalysis.nodes.length,9);
    for(const report of [reports[0],comparison]){
      const kind=report.reportType==='COMPARISON'?'comparison':'ba';await page.goto(`${p6Origin}/app/reports/${report.reportId}`);await page.locator('.method-node').first().waitFor();assert.equal(await page.locator('.method-node').count(),report.methodAnalysis.nodes.length);
      assert.doesNotMatch(await page.locator('.report-reader').innerText(),/sourceRef|checkpointId|METHOD_REPORT/);assert.equal(await page.locator('.report-section').count(),3);
      await page.getByRole('heading',{name:'这些数字核对了吗？',exact:true}).waitFor();assert.equal(await page.locator('.method-record-facts details').count(),report.calculationConditions.length);
      await page.screenshot({path:`${output}/${kind}-report-desktop.png`,fullPage:true});
      await page.screenshot({path:`${output}/${kind}-report-desktop-first-screen.png`});
      await page.locator('.method-answer-details summary').click();assert.equal(await page.locator('.method-answer').count(),report.methodAnalysis.answers.length);
      await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);await page.screenshot({path:`${output}/${kind}-report-mobile.png`,fullPage:true});await page.locator('.method-answer-details summary').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/${kind}-report-mobile-first-screen.png`});await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:'打印',exact:true}).click();await page.waitForURL('**/print?expectedVersion=*');await page.locator('.method-answer-details[open]').waitFor();
      assert.equal(await page.locator('.method-answer').count(),report.methodAnalysis.answers.length);await page.emulateMedia({media:'print'});await page.screenshot({path:`${output}/${kind}-report-print.png`,fullPage:true});await page.emulateMedia({media:'screen'});
      assert.equal(await page.locator('.method-record-facts details[open]').count(),report.calculationConditions.length);
    }
    checks.push('actual report/three-major comparison readers: desktop/mobile, full answer details in print layout');assert.deepEqual(errors,[]);
  }catch(error){failed=error;if(page)await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});}
  finally{if(browser)await browser.close();await scope.cleanup();}
  if(failed)throw failed;const result={result:'PASS',channel,checks,paidCalls:0,modelSemanticAcceptance:false,fixtureCleanup:true,mainServicesChanged:false};writeFileSync(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
