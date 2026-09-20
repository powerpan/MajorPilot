import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {readLocalEnv} from '../../scripts/env.mjs'

const env=readLocalEnv()
if(!env.MP_P0_ADMIN_PASSWORD) throw new Error('Missing MP_P0_ADMIN_PASSWORD (value suppressed)')
await mkdir('/tmp/majorpilot-p0-evidence',{recursive:true})
const raw=process.argv.includes('--upstream')
for(const channel of ['chrome','msedge']) {
  const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  const page=await context.newPage()
  const errors=[]
  const consoleErrors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(['error','warning'].includes(message.type())) consoleErrors.push(message.text())})
  await page.goto('http://localhost:15174/login')
  if(!raw) {
    assert.equal(await page.getByPlaceholder('账号').inputValue(),'')
    assert.equal(await page.getByPlaceholder('密码',{exact:true}).inputValue(),'')
    assert.equal(await page.getByText('记住密码',{exact:true}).count(),0)
  }
  await page.getByPlaceholder('账号').fill(env.MP_P0_ADMIN_USERNAME||'admin')
  await page.getByPlaceholder('密码',{exact:true}).fill(env.MP_P0_ADMIN_PASSWORD)
  const loginResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/login')&&response.request().method()==='POST')
  const routersResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/getRouters'))
  await page.getByRole('button',{name:'登 录',exact:true}).click()
  const loginBody=await (await loginResponse).json()
  assert.equal(loginBody.code,200,'admin login API result not successful (credentials suppressed)')
  try {await page.waitForURL('**/index',{timeout:30000})}
  catch {
    await page.screenshot({path:`/tmp/majorpilot-p0-evidence/${channel}-admin-login-failure.png`,fullPage:true})
    await browser.close()
    throw new Error('Admin navigation failed after successful login; inspect local screenshot (no credentials logged)')
  }
  await page.locator('.sidebar-container').waitFor()
  const routes=await (await routersResponse).json()
  assert.equal(routes.code,200)
  assert.ok(Array.isArray(routes.data)&&routes.data.length>0,'permission menu did not load')
  await page.screenshot({path:`/tmp/majorpilot-p0-evidence/${channel}-admin-${raw?'upstream':'trimmed'}.png`,fullPage:true})
  if(!raw) {
    assert.ok(await page.locator('.app-container').getByRole('heading',{name:'MajorPilot 管理端',exact:true}).isVisible())
    const menu=await page.locator('.sidebar-container').innerText()
    assert.doesNotMatch(menu,/系统工具|若依官网|任务调度|数据监控/)
    const prohibitedCookieNames=(await context.cookies()).filter(cookie=>['Admin-Token','password','rememberMe'].includes(cookie.name)).map(cookie=>cookie.name)
    assert.deepEqual(prohibitedCookieNames,[],'prohibited cookie names present (values suppressed)')
    const student=await context.newPage()
    await student.goto('http://localhost:15173/')
    assert.equal(await student.evaluate(()=>sessionStorage.getItem('MP_ADMIN_TOKEN')),null)
    await student.close()
  }
  await page.locator('.avatar-wrapper').click()
  await page.getByText('退出登录',{exact:true}).click()
  await page.getByRole('button',{name:'确定',exact:true}).click()
  await page.waitForURL('**/login**',{timeout:15000})
  assert.equal(await page.getByPlaceholder('密码',{exact:true}).inputValue(),raw?'admin123':'')
  if(!raw) assert.equal(await page.evaluate(()=>sessionStorage.getItem('MP_ADMIN_TOKEN')),null)
  assert.deepEqual(errors,[])
  assert.deepEqual(consoleErrors,[])
  console.log(JSON.stringify({channel,version:browser.version(),baseline:raw?'UPSTREAM':'TRIMMED',login:'PASS',permissionMenu:'PASS',logout:'PASS',pageErrors:0,consoleErrors:0}))
  await browser.close()
}
