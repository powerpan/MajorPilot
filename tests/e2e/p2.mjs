import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createFixtureScope } from '../../scripts/lib/local-student-fixture.mjs';

const output = '/tmp/majorpilot-p2-evidence';
await mkdir(output, { recursive: true });
const scope = createFixtureScope('p2-browser');
const channels = process.argv.includes('--chrome-only') ? ['chrome'] : ['chrome', 'msedge'];
let accounts;
try {
  accounts = [await scope.student(), await scope.student()];
  for (const [index, channel] of channels.entries()) {
    const browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
    const errors = [], consoleErrors = [], cookies = [], checks = [];
    const page = await context.newPage();
    let second, allowNetwork = false;
    function watch(p) {
      p.on('pageerror', error => errors.push(error.message));
      p.on('console', message => {
        if (!['error','warning'].includes(message.type())) return;
        if (message.text().startsWith('Failed to load resource') && (message.location().url.includes('/api/') || allowNetwork)) return;
        consoleErrors.push(message.text());
      });
      p.on('request', request => {
        if (new URL(request.url()).hostname === '127.0.0.1' && new URL(request.url()).port === '15175') cookies.push(request.allHeaders().then(headers => Boolean(headers.cookie)));
      });
      p.on('dialog', dialog => dialog.accept());
    }
    watch(page);
    async function shot(name, p = page, fullPage = false) { await p.screenshot({ path: `${output}/${channel}-${name}.png`, fullPage }); }
    async function title(text, p = page) { await p.getByRole('heading', {name:text, exact:true}).waitFor({timeout:15000}); }
    async function saved(p = page) { await p.waitForFunction(() => document.querySelector('[data-testid="save-status"]')?.textContent === '已保存', undefined, { timeout: 12000 }); }
    async function login(account, destination = '/app/demos', p = page) {
      await p.goto(`http://localhost:15173/login?returnTo=${encodeURIComponent(destination)}`);
      await p.getByLabel('邮箱',{exact:true}).fill(account.email);
      await p.getByLabel('密码',{exact:true}).fill(account.password);
      await p.getByRole('button',{name:'登录',exact:true}).click();
      await p.waitForURL(`**${destination}`,{timeout:15000});
    }
    async function completed(nextTitle) {
      await page.getByRole('button',{name:'完成此步骤',exact:true}).click();
      await title(nextTitle);
    }
    async function fieldSaved(locator, value, p = page) {
      const response = p.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/experience-runs/'));
      await locator.fill(value); assert.equal((await response).status(),200,'autosave must be accepted'); await saved(p);
    }
    async function draftRows(p = page) {
      return p.evaluate(() => new Promise((resolve,reject) => {
        const open = indexedDB.open('majorpilot-task-drafts-v1',1);
        open.onsuccess = () => { const db=open.result; const req=db.transaction('drafts').objectStore('drafts').getAll(); req.onsuccess=()=>{db.close();resolve(req.result)}; req.onerror=reject; }; open.onerror=reject;
      }));
    }
    try {
      await login(accounts[index]);
      await page.getByRole('link',{name:'了解并进入 →'}).first().click();
      await title('工作区上手：读取与调整');
      await shot('introduction');
      await page.getByRole('button',{name:'开始这次演示'}).click();
      await title('准备工作区'); const tableUrl = page.url();
      await page.getByRole('checkbox').check(); await completed('读取合成样本');
      assert.equal(await page.locator('.workspace-sample tbody tr').count(),4);
      await page.getByRole('checkbox').check(); await completed('调整参数并预览');
      assert.equal(await page.locator('[data-testid="result-sum"]').count(),0,'no fabricated initial result');
      await page.locator('input[name="multiplier"][value="1"]').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('input[name="multiplier"][value="2"]').isChecked(),true,'native radio responds to keyboard');
      await page.getByRole('button',{name:'运行预览',exact:true}).click();
      await page.getByTestId('result-sum').filter({hasText:'52'}).waitFor();
      assert.equal(await page.getByTestId('result-count').textContent(),'4'); assert.equal(await page.getByTestId('result-mean').textContent(),'13');
      await shot('workspace-1536');
      for (const width of [1366,1100,1024,390]) {
        await page.setViewportSize({width,height:width===390?844:1024});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth),false,`${width}: horizontal overflow`);
        if (width<1024) { assert.equal(await page.locator('.workspace-fields').count(),0); await page.getByRole('link',{name:'返回个人主页 →'}).waitFor(); }
        else if(width<1200) { await page.getByRole('button',{name:'需要提示？'}).click(); await page.getByRole('dialog',{name:'分层帮助'}).waitFor(); await page.getByRole('button',{name:'关闭提示 ×'}).click(); }
        await shot(`workspace-${width}`);
      }
      await page.setViewportSize({width:1536,height:1024});
      for(const level of ['一','二','三']) { await page.getByRole('button',{name:`查看${level}级提示`,exact:true}).click(); if(level!=='一') await page.getByRole('button',{name:'确认查看',exact:true}).click(); await page.waitForFunction(n=>document.querySelectorAll('.workspace-help .hint-level small').length===n,['一','二','三'].indexOf(level)+1); }
      assert.equal(await page.locator('.workspace-help .hint-level small').count(),3); checks.push('schema-driven real start/save/worker/server-verified result/three-level static hints/responsive restrictions');

      await completed('记录观察');
      const original='我把倍数改为二，所有数值的总和与平均值都增加了；样本数量保持不变。';
      await fieldSaved(page.locator('textarea[name="observation"]'),original);
      await page.getByRole('button',{name:/03.*调整参数并预览/}).click(); await title('调整参数并预览');
      await page.locator('input[name="multiplier"][value="3"]').check();
      await page.getByText('结果已过期：输入已修改，请保存后重新运行。').waitFor();
      await page.getByRole('button',{name:'运行预览',exact:true}).click(); await page.getByTestId('result-sum').filter({hasText:'78'}).waitFor();
      await page.locator('input[name="multiplier"][value="2"]').check(); await page.getByRole('button',{name:'运行预览',exact:true}).click(); await page.getByTestId('result-sum').filter({hasText:'52'}).waitFor();
      assert.equal(await page.locator('.result-stale').count(),0,'reused execution is attached to current response revision');
      await page.reload(); await title('调整参数并预览'); assert.equal(await page.locator('.result-stale').count(),0,'reused attachment survives refresh');
      await completed('记录观察'); assert.equal(await page.locator('textarea[name="observation"]').inputValue(),original,'invalidated dependent answer retained');
      checks.push('completed-step iteration invalidates dependencies without deleting answers; reused execution binding survives refresh');

      second=await context.newPage(); watch(second); await second.goto(tableUrl); await title('记录观察',second);
      const firstText='第一页面记录：参数调整后先核对样本范围，再比较数值变化，保留对异常结果的疑问。';
      const secondText='第二页面尚未同步的独立观察：我需要确认倍数与范围的不同作用，不自动覆盖另一份内容。';
      await fieldSaved(page.locator('textarea[name="observation"]'),firstText);
      await second.locator('textarea[name="observation"]').fill(secondText); await second.getByText('请先处理版本差异').waitFor();
      await shot('revision-conflict',second);
      await second.getByRole('button',{name:'查看并复制草稿'}).click(); assert.ok((await second.getByRole('textbox',{name:'可复制的本机草稿'}).inputValue()).includes(secondText)); await second.getByRole('button',{name:'关闭',exact:true}).click();
      await second.getByRole('button',{name:'舍弃本机草稿并重新载入'}).click(); await saved(second); assert.equal(await second.locator('textarea[name="observation"]').inputValue(),firstText);
      assert.equal(await page.evaluate(async()=>{ const drafts=await import('/src/lib/task-drafts.ts'); try {await drafts.readTaskDraft({owner:'not-current-owner',runId:'another-run',stepKey:'observe',taskVersion:'another-version'});return false}catch{return true} }),true,'cross-account cache read is rejected before storage retrieval');
      allowNetwork=true; await context.setOffline(true);
      const offline='离线时我记录的内容应保存在当前账户与任务版本下，网络恢复后由我确认再同步。';
      await page.locator('textarea[name="observation"]').fill(offline); await page.getByTestId('save-status').filter({hasText:'离线待同步'}).waitFor();
      await page.waitForTimeout(250); const localDrafts=await draftRows(); assert.equal(localDrafts.length,1,'only unsynced current task stored'); assert.ok(localDrafts[0].expiresAt-Date.now()<=7*86400000 && localDrafts[0].expiresAt-Date.now()>6.99*86400000,'7-day TTL is explicit');
      await context.setOffline(false); await page.reload(); await title('记录观察');
      await page.getByText('发现这台设备上的未同步草稿').waitFor(); await page.getByRole('button',{name:'恢复本机草稿',exact:true}).click(); await saved(); assert.equal(await page.locator('textarea[name="observation"]').inputValue(),offline); assert.equal((await draftRows()).length,0,'sync deletes local copy'); allowNetwork=false;
      checks.push('two-tab revision conflict requires explicit adoption; offline IndexedDB recovery and delete-after-sync');

      await page.getByRole('link',{name:'查看其他演示 →'}).click(); await page.getByRole('link',{name:'了解并进入 →'}).nth(1).click();
      await page.getByRole('button',{name:'开始这次演示'}).click(); await page.getByRole('dialog',{name:'暂停原体验，切换到这里？'}).waitFor(); await page.getByRole('button',{name:'确认暂停并切换'}).click(); await title('准备工作区');
      const compareUrl=page.url();
      await second.bringToFront(); await second.getByText('体验已暂停 · 当前只读').waitFor({timeout:12000}); assert.equal(await second.locator('textarea[name="observation"]').isDisabled(),true);
      await page.bringToFront(); await page.getByRole('button',{name:'暂停并返回',exact:true}).click();
      await page.getByRole('link',{name:'了解并进入 →'}).first().click(); await page.getByRole('button',{name:'恢复这次演示'}).click(); await title('记录观察');
      assert.equal(await page.locator('textarea[name="observation"]').inputValue(),offline);
      await second.close(); second=null;
      await completed('提交任务'); await page.getByRole('checkbox').check(); await completed('回顾这次体验');
      assert.equal(await page.locator('.reflection-fields input:checked').count(),0,'no answers defaulted on student behalf'); await shot('reflection-1536');
      await page.locator('input[name="interestingStepKeys"][value="adjust"]').check(); await page.locator('input[name="difficultySources"][value="TOOLS"]').check(); await page.locator('input[name="continueSimilarWork"][value="UNSURE"]').check();
      await page.getByRole('button',{name:'暂停反思并返回'}).click(); await page.getByRole('link',{name:'了解并进入 →'}).first().click(); await page.getByRole('button',{name:'恢复这次演示'}).click(); await title('回顾这次体验');
      assert.equal(await page.locator('input[name="continueSimilarWork"][value="UNSURE"]').isChecked(),true);
      await page.getByRole('button',{name:'提交并完成演示',exact:true}).click(); await title('这次演示已完成。'); assert.equal(await page.getByRole('link',{name:/报告/}).count(),0); await shot('closed');
      checks.push('atomic pause/switch, other tab read-only, paused reflection resumes exact phase, CLOSED demo without fake report');

      // Actual isolated runtime recovery, using only source-reviewed fixed probes.
      const probes=await page.evaluate(async()=>{
        const {execute}=await import('/src/execution.ts');
        const crash=await execute('crash-probe-v1',[1]);
        const timeout=await execute('timeout-probe-v1',[1]);
        const controller=new AbortController(); const pending=execute('timeout-probe-v1',[1],{signal:controller.signal}); setTimeout(()=>controller.abort(),50);
        let cancelled=false; try{await pending}catch(error){cancelled=error.message==='EXECUTION_CANCELLED'}
        const recovered=await execute('demo-summary-v1',[2,5,8,11],{parameters:{multiplier:2,include:'ALL'}});
        return {crash:crash.code,timeout:timeout.code,timeoutMs:timeout.elapsedMs,cancelled,recovered:recovered.result.sum};
      });
      assert.equal(probes.crash,'WORKER_FAILURE'); assert.equal(probes.timeout,'EXECUTION_TIMEOUT'); assert.ok(probes.timeoutMs>=9900&&probes.timeoutMs<14000); assert.equal(probes.cancelled,true); assert.equal(probes.recovered,52); assert.equal((await Promise.all(cookies)).some(Boolean),false,'executor receives no account cookies');
      checks.push('real worker crash/10s termination/cancel/recovery and executor no-cookie boundary');

      // Real account revalidation around a locked unsynced draft. No stored credentials.
      await page.goto(compareUrl); await page.getByRole('link',{name:'主动恢复或切换 →'}).click(); await page.getByRole('button',{name:'恢复这次演示'}).click(); await title('准备工作区');
      allowNetwork=true; await context.setOffline(true); await page.getByRole('checkbox').check(); await page.waitForTimeout(250); assert.equal((await draftRows()).length,1);
      await context.setOffline(false);
      await context.clearCookies({name:'MP_SESSION'}); await page.reload(); await page.waitForURL('**/login?**'); assert.equal(await page.locator('.workspace-fields').count(),0);
      await login(accounts[index],new URL(compareUrl).pathname); await title('准备工作区'); await page.getByText('发现这台设备上的未同步草稿').waitFor();
      await page.getByRole('button',{name:'恢复本机草稿'}).click(); await saved(); assert.equal((await draftRows()).length,0);
      await context.setOffline(true); await page.getByRole('checkbox').uncheck(); await page.waitForTimeout(200); await context.setOffline(false);
      await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('majorpilot-task-drafts-v1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),req=store.openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){cursor.update({...cursor.value,expiresAt:Date.now()-1});cursor.continue()}};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject};open.onerror=reject}));
      await page.reload(); await title('准备工作区'); assert.equal((await draftRows()).length,0,'expired local draft is deleted before render'); assert.equal(await page.getByText('发现这台设备上的未同步草稿').count(),0);
      await context.setOffline(true); await page.getByRole('checkbox').uncheck(); await page.waitForTimeout(200); await context.setOffline(false);
      await context.clearCookies({name:'MP_SESSION'}); await page.reload(); await page.waitForURL('**/login?**');
      await login(accounts[1-index],'/app/demos'); assert.equal((await draftRows()).length,0,'login as another verified account purges previous namespace');
      allowNetwork=false; checks.push('7-day TTL/cross-owner read denial, natural expiry locks draft, same-account login restores, different verified owner purges');
      assert.deepEqual(errors,[],'page runtime errors'); assert.deepEqual(consoleErrors,[],'unexpected browser errors');
      console.log(JSON.stringify({channel,version:browser.version(),checks,worker:probes,screenshots:output,pageErrors:errors.length,consoleErrors:consoleErrors.length}));
    } catch(cause) {
      await shot('failure').catch(()=>undefined);
      throw new Error(`${channel}: ${cause.message}`);
    } finally { await context.close(); await browser.close(); }
  }
} finally { await scope.cleanup(); }
