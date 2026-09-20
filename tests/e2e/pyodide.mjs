import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {readdir,stat} from 'node:fs/promises'
let packageBytes=0
for(const entry of await readdir(new URL('../../executor/node_modules/pyodide/',import.meta.url))) packageBytes+=(await stat(new URL(`../../executor/node_modules/pyodide/${entry}`,import.meta.url))).size
for(const channel of ['chrome','msedge']) {
  const browser=await chromium.launch({channel,headless:true,chromiumSandbox:true})
  const page=await browser.newPage()
  await page.goto('http://127.0.0.1:15176/')
  const results=await page.evaluate(async()=>{
    const run=path=>new Promise(resolve=>{
      const worker=new Worker(path,{type:'module'})
      const timer=setTimeout(()=>{worker.terminate();resolve({ok:false,code:'TIMEOUT'})},15000)
      worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data)}
      worker.onerror=()=>{clearTimeout(timer);worker.terminate();resolve({ok:false,code:'CSP_OR_LOADER_BLOCKED'})}
    })
    return {boot:await run('/boot-worker.mjs'),strict:await run('/strict-worker.mjs')}
  })
  assert.equal(results.boot.ok,true)
  assert.equal(results.boot.mean,21)
  assert.equal(results.strict.ok,false)
  assert.equal(results.strict.directive,'connect-src')
  console.log(JSON.stringify({channel,version:browser.version(),packageBytes,...results,decision:'FIXED_CALCULATOR_FALLBACK_PENDING_PRELOADED_PYODIDE_ARCHITECTURE'}))
  await browser.close()
}
