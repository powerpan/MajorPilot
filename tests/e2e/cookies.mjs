import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {readLocalEnv} from '../../scripts/env.mjs'

const env=readLocalEnv()
if(!env.MP_P0_STUDENT_PASSWORD) throw new Error('Missing MP_P0_STUDENT_PASSWORD (value suppressed)')
for(const channel of ['chrome','msedge']) {
  const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true})
  const context=await browser.newContext()
  const page=await context.newPage()
  await page.goto('http://localhost:15173/p0')
  const observed=[]
  page.on('request',request=>{
    if(request.url().includes('/api/')) observed.push(request.allHeaders().then(headers=>({path:new URL(request.url()).pathname,method:request.method(),cookieNames:(headers.cookie||'').split(';').map(part=>part.trim().split('=')[0]).filter(Boolean)})))
  })
  const call=async(path,method='GET',body,csrf)=>page.evaluate(async({path,method,body,csrf})=>{
    const response=await fetch(path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})})
    return {status:response.status,body:response.status===204?null:await response.json()}
  },{path,method,body,csrf})
  const publicCsrf=async()=>{
    const res=await call('/api/public/v1/auth/csrf')
    assert.equal(res.status,200)
    return res.body.data.csrfToken
  }
  let csrf=await publicCsrf()
  assert.equal((await call('/api/public/v1/p0/intake','POST',{},'P0_INVALID_CSRF')).status,403)
  let response=await call('/api/public/v1/p0/intake','POST',{},csrf)
  assert.ok([200,201].includes(response.status),'P0 intake failed')
  const publicCookies=await context.cookies('http://localhost:15173/api/public/v1/p0/claim')
  const intake=publicCookies.find(cookie=>cookie.name==='MP_INTAKE')
  assert.equal(intake?.path,'/api/public/v1')
  assert.equal(intake?.httpOnly,true)
  assert.equal(publicCookies.find(cookie=>cookie.name==='MP_PUBLIC_CSRF')?.path,'/')
  csrf=await publicCsrf()
  response=await call('/api/public/v1/p0/claim','POST',{},csrf)
  assert.ok([200,201].includes(response.status),'P0 claim failed')
  const studentId=response.body.data.studentId
  assert.ok(studentId)
  assert.equal((await context.cookies()).some(cookie=>cookie.name==='MP_INTAKE'),false)
  const login=async()=>{
    csrf=await publicCsrf()
    const res=await call('/api/public/v1/p0/login','POST',{studentId,password:env.MP_P0_STUDENT_PASSWORD},csrf)
    assert.equal(res.status,200,'P0 login failed')
    const session=(await context.cookies('http://localhost:15173/api/app/v1/p0/whoami')).find(cookie=>cookie.name==='MP_SESSION')
    assert.equal(session?.path,'/api/app/v1')
    assert.equal(session?.httpOnly,true)
    assert.equal(session?.sameSite,'Lax')
    assert.equal((await context.cookies('http://localhost:15173/api/public/v1/p0/claim')).some(cookie=>cookie.name==='MP_SESSION'),false)
    const appCsrf=await call('/api/app/v1/auth/csrf')
    assert.equal(appCsrf.status,200)
    return appCsrf.body.data.csrfToken
  }
  csrf=await login()
  const studentCsrf=csrf
  const anonymousCsrf=await publicCsrf()
  assert.equal((await call('/api/app/v1/auth/logout','POST',{},anonymousCsrf)).status,403,'public CSRF accepted in student boundary')
  assert.equal((await call('/api/public/v1/p0/intake','POST',{},studentCsrf)).status,403,'student CSRF accepted in public boundary')
  assert.equal((await call('/api/app/v1/p0/whoami')).body.data.studentId,studentId)
  assert.equal(await page.evaluate(()=>document.cookie.includes('MP_SESSION=')),false)
  assert.equal(await page.evaluate(()=>document.cookie.includes('MP_CSRF=')),true)
  assert.equal((await call('/api/app/v1/auth/logout','POST',{},'P0_INVALID_CSRF')).status,403)
  response=await call('/api/app/v1/auth/logout','POST',{},csrf)
  assert.ok([200,204].includes(response.status))
  assert.equal((await context.cookies()).some(cookie=>cookie.name==='MP_SESSION'),false)
  assert.equal((await call('/api/app/v1/p0/whoami')).status,401)
  csrf=await login()
  response=await call('/api/app/v1/p0/deletion','POST',{},csrf)
  assert.ok([200,201].includes(response.status))
  const receiptId=response.body.data.receiptId
  const receipt=(await context.cookies(`http://localhost:15173/api/public/v1/deletion-receipts/${receiptId}`)).find(cookie=>cookie.name==='MP_DELETION')
  assert.equal(receipt?.path,'/api/public/v1/deletion-receipts')
  assert.equal(receipt?.httpOnly,true)
  assert.equal((await context.cookies('http://localhost:15173/api/public/v1/auth/csrf')).some(cookie=>cookie.name==='MP_DELETION'),false)
  response=await call('/api/app/v1/p0/delete-confirm','POST',{password:env.MP_P0_STUDENT_PASSWORD},csrf)
  assert.ok([200,202,204].includes(response.status))
  assert.equal((await call('/api/app/v1/p0/whoami')).status,401)
  response=await call(`/api/public/v1/deletion-receipts/${receiptId}`)
  assert.equal(response.status,200)
  assert.ok(response.body.data.status)
  assert.equal('studentId' in response.body.data,false)
  const paths=await Promise.all(observed)
  assert.ok(paths.some(row=>row.path.endsWith('/p0/claim')&&row.cookieNames.includes('MP_INTAKE')))
  assert.ok(paths.some(row=>row.path.endsWith('/auth/logout')&&row.cookieNames.includes('MP_SESSION')))
  assert.ok(paths.some(row=>row.path.includes('/deletion-receipts/')&&row.cookieNames.includes('MP_DELETION')&&!row.cookieNames.includes('MP_SESSION')))
  console.log(JSON.stringify({channel,browser:browser.version(),publicClaim:'PASS',studentLogout:'PASS',publicAndAppCsrf:'PASS',deletionReceipt:'PASS',observedCookiePaths:paths.map(row=>({...row,path:row.path.replace(/deletion-receipts\/.+$/,'deletion-receipts/{id}')}))}))
  await browser.close()
}
