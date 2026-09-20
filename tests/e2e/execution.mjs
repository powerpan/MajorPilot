import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const screenshots = '/tmp/majorpilot-p0-evidence'
await mkdir(screenshots,{recursive:true})
for(const channel of ['chrome','msedge']) {
  const browser = await chromium.launch({channel,headless:true,chromiumSandbox:true})
  const context = await browser.newContext({viewport:{width:1280,height:900}})
  // This sentinel is synthetic and deliberately scoped to the main hostname.
  await context.addCookies([{name:'MP_P0_HOST_SENTINEL',value:'P0_SYNTHETIC_COOKIE_SENTINEL',domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}])
  const page = await context.newPage()
  const errors=[]
  const unexpectedConsole=[]
  const expectedCspMessages=[]
  const requestHeaders=[]
  const forbiddenResponses=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{
    if(!['warning','error'].includes(message.type())) return
    const text=message.text()
    if(/Content Security Policy|connect-src|Refused to connect|Fetch API cannot load/i.test(text)) expectedCspMessages.push(text)
    else unexpectedConsole.push(text)
  })
  page.on('response',response=>{if(response.url().includes('/api/app/') || response.url().includes('/p0-probe')) forbiddenResponses.push(response.status())})
  page.on('request',request=>{
    if(request.url().startsWith('http://127.0.0.1:15175')||request.url()==='http://localhost:15173/p0') requestHeaders.push(request.allHeaders().then(headers=>({url:request.url(),hasAnyCookie:Boolean(headers.cookie),hasSentinel:(headers.cookie||'').includes('MP_P0_HOST_SENTINEL=')})))
  })
  await page.goto('http://localhost:15173/p0')
  await page.getByRole('heading',{name:'MajorPilot · P0 技术验证'}).waitFor()
  assert.match(await page.title(),/MajorPilot.*P0/)
  assert.ok(await page.getByRole('heading',{name:'MajorPilot · P0 技术验证'}).isVisible())
  await page.getByRole('textbox',{name:'合成数据'}).fill('1,,2')
  await page.getByRole('button',{name:'运行固定计算器'}).click()
  await page.getByRole('alert').filter({hasText:'请输入逗号分隔的有效数字'}).waitFor()
  assert.equal(await page.getByTestId('execution-result').count(),0)
  await page.getByRole('textbox',{name:'合成数据'}).fill('12, 18, 24, 30')
  await page.getByRole('button',{name:'运行固定计算器'}).click()
  await page.getByTestId('execution-result').filter({hasText:'"mean": 21'}).waitFor()
  const first=await page.getByTestId('execution-result').innerText()
  await page.getByRole('textbox',{name:'合成数据'}).fill('2, 4')
  await page.getByRole('button',{name:'运行固定计算器'}).click()
  await page.getByTestId('execution-result').filter({hasText:'"mean": 3'}).waitFor()
  await page.getByRole('button',{name:'验证网络与存储隔离'}).click()
  await page.getByTestId('execution-result').filter({hasText:'networkBlocked'}).waitFor()
  const isolation=JSON.parse(await page.getByTestId('execution-result').locator('pre').innerText())
  assert.ok(Object.values(isolation.result).every(value=>value===true),JSON.stringify(isolation.result))
  const actualHeaders=await Promise.all(requestHeaders)
  assert.ok(actualHeaders.some(request=>request.url==='http://localhost:15173/p0'&&request.hasSentinel),'synthetic cookie was not sent to baseline main-site request')
  const executorRequests=actualHeaders.filter(request=>request.url.startsWith('http://127.0.0.1:15175'))
  assert.ok(executorRequests.length>=3)
  const executorCookies=executorRequests.some(request=>request.hasAnyCookie)
  assert.equal(executorCookies,false,'main-site cookie leaked to executor')
  assert.deepEqual(forbiddenResponses,[],'forbidden network request reached a server')
  // Browser may emit a request event for CSP-blocked fetch; there must be no response.
  await page.screenshot({path:`${screenshots}/${channel}-isolation.png`,fullPage:true})
  const start=Date.now()
  await page.getByRole('button',{name:'验证 10 秒超时'}).click()
  await page.evaluate(()=>{
    const frame=document.querySelector('iframe')
    const nonce=new URL(frame.src).hash.slice(1)
    for(const [origin,source,token] of [['null',frame.contentWindow,'wrong-nonce'],['http://untrusted.invalid',frame.contentWindow,nonce],['null',window,nonce]]) {
      window.dispatchEvent(new MessageEvent('message',{origin,source,data:{type:'MP_EXECUTOR_RESULT',nonce:token,result:{status:'SUCCESS',engine:'fixed-calculator-v1',result:{forged:true}}}}))
    }
  })
  assert.equal(await page.getByTestId('execution-result').count(),0,'forged message accepted')
  await page.getByTestId('execution-result').filter({hasText:'EXECUTION_TIMEOUT'}).waitFor({timeout:15000})
  const timeoutMs=Date.now()-start
  assert.ok(timeoutMs>=9900&&timeoutMs<14000)
  await page.getByRole('button',{name:'运行固定计算器'}).click()
  await page.getByTestId('execution-result').filter({hasText:'"mean": 3'}).waitFor()
  await page.screenshot({path:`${screenshots}/${channel}-desktop.png`,fullPage:true})
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
  await page.screenshot({path:`${screenshots}/${channel}-mobile.png`,fullPage:true})
  assert.deepEqual(errors,[])
  assert.deepEqual(unexpectedConsole,[])
  console.log(JSON.stringify({channel,browser:browser.version(),first,isolation:isolation.result,timeoutMs,executorCookies,pageErrors:errors.length,unexpectedConsole:unexpectedConsole.length,expectedCspMessages:expectedCspMessages.length,forgedMessagesRejected:true,screenshotDirectory:screenshots}))
  await browser.close()
}
