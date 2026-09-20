import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {readLocalEnv} from '../../scripts/env.mjs'

const env=readLocalEnv()
for(const channel of ['chrome','msedge']) {
  const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true})
  const operator=await browser.newContext()
  const admin=await operator.newPage()
  await admin.goto('http://localhost:15174/login')
  const login=await admin.evaluate(async({username,password})=>{
    const res=await fetch('/dev-api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,code:'',uuid:''})})
    return res.json()
  },{username:env.MP_P0_ADMIN_USERNAME||'admin',password:env.MP_P0_ADMIN_PASSWORD})
  assert.equal(login.code,200,'operator API login failed')
  const token=login.token
  const operatorStatus=await admin.evaluate(async token=>{
    const response=await fetch('/dev-api/api/admin/v1/majorpilot/p0/whoami',{headers:{Authorization:`Bearer ${token}`}})
    return {status:response.status,body:await response.json()}
  },token)
  assert.equal(operatorStatus.status,200)
  assert.equal(operatorStatus.body.data.subjectType,'RUOYI_OPERATOR')

  const student=await browser.newContext()
  const page=await student.newPage()
  await page.goto('http://localhost:15173/p0')
  const adminToStudent=await page.evaluate(async token=>(await fetch('/api/app/v1/p0/whoami',{headers:{Authorization:`Bearer ${token}`}})).status,token)
  assert.equal(adminToStudent,401,'admin token incorrectly authenticated a student')
  const response=await page.evaluate(async password=>{
    const csrf=async()=>{const response=await fetch('/api/public/v1/auth/csrf');return (await response.json()).data.csrfToken}
    const post=async(path,body)=>{
      const token=await csrf()
      const response=await fetch(`/api/public/v1/p0/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(body)})
      return {status:response.status,body:await response.json()}
    }
    await post('intake',{})
    const claim=await post('claim',{})
    return post('login',{studentId:claim.body.data.studentId,password})
  },env.MP_P0_STUDENT_PASSWORD)
  assert.equal(response.status,200)
  const cookies=await student.cookies('http://localhost:15173/api/app/v1/p0/whoami')
  const cookieHeader=cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')
  // Deliberate adversarial HTTP requests transport the HttpOnly student cookie
  // across the admin path. Browser JS itself cannot read this cookie.
  const studentToAdmin=await student.request.get('http://127.0.0.1:18080/api/admin/v1/majorpilot/p0/whoami',{headers:{Cookie:cookieHeader}})
  const studentToAdminBody=await studentToAdmin.json()
  assert.ok(studentToAdmin.status()===401||studentToAdminBody.code===401,'student cookie authenticated an operator')
  const csrfCookie=cookies.find(cookie=>cookie.name==='MP_CSRF')
  const wrongOrigin=await student.request.post('http://127.0.0.1:18080/api/app/v1/auth/logout',{headers:{Cookie:cookieHeader,'X-CSRF-Token':csrfCookie.value,Origin:'http://localhost:15174'},data:{}})
  assert.equal(wrongOrigin.status(),403,'admin origin accepted by student CSRF boundary')
  // Ensure the rejection did not revoke the valid session, then clean up it.
  assert.equal(await page.evaluate(async()=>(await fetch('/api/app/v1/p0/whoami')).status),200)
  await page.evaluate(async()=>{
    const csrf=(await (await fetch('/api/app/v1/auth/csrf')).json()).data.csrfToken
    await fetch('/api/app/v1/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'})
  })
  await admin.evaluate(async token=>{await fetch('/dev-api/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}})},token)
  console.log(JSON.stringify({channel,version:browser.version(),operatorPositiveControl:'PASS',adminBearerToStudent:'REJECTED',studentCookieToAdmin:'REJECTED',wrongOriginWithValidCsrf:'REJECTED',scope:'Browser+explicit adversarial HTTP requests; no credential values logged'}))
  await browser.close()
}
