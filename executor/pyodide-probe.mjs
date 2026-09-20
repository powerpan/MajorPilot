// P0-only candidate benchmark. Never part of the production executor surface.
// It deliberately compares the upstream loader under boot-only vs strict CSP.
import http from 'node:http'
import {readFileSync} from 'node:fs'
const allowedAssets = new Set(['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'])
const worker = `import {loadPyodide} from '/assets/pyodide.mjs';
const begin=performance.now();
addEventListener('securitypolicyviolation',event=>postMessage({ok:false,code:'CSP_BLOCKED',directive:event.effectiveDirective,coldMs:Math.round(performance.now()-begin)}));
try { const pyodide=await loadPyodide({indexURL: 'http://127.0.0.1:15176/assets/'});
postMessage({ok:true,engine:pyodide.version,mean:pyodide.runPython('sum([12,18,24,30])/4'),coldMs:Math.round(performance.now()-begin),heapBytes:pyodide._module.HEAPU8.byteLength});
} catch {postMessage({ok:false,code:'CANDIDATE_BOOT_BLOCKED',coldMs:Math.round(performance.now()-begin)})}`
http.createServer((request,response) => {
  if(request.headers.host !== '127.0.0.1:15176') {response.writeHead(421);return response.end()}
  response.setHeader('Cache-Control','no-store')
  response.setHeader('X-Content-Type-Options','nosniff')
  const path=new URL(request.url,'http://127.0.0.1:15176').pathname
  if(path==='/') {response.writeHead(200,{'Content-Type':'text/html'});return response.end('<!doctype html><title>Pyodide P0 benchmark</title><p>Test-only candidate benchmark; no credentials or user code.</p>')}
  if(path==='/boot-worker.mjs'||path==='/strict-worker.mjs') {
    response.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src ${path.includes('strict')?"'none'":"'self'"}`)
    response.writeHead(200,{'Content-Type':'text/javascript'});return response.end(worker)
  }
  const asset=path.replace('/assets/','')
  if(!path.startsWith('/assets/')||!allowedAssets.has(asset)){response.writeHead(404);return response.end()}
  response.writeHead(200,{'Content-Type':asset.endsWith('.mjs')?'text/javascript':asset.endsWith('.wasm')?'application/wasm':'application/octet-stream'})
  response.end(readFileSync(new URL(`./node_modules/pyodide/${asset}`,import.meta.url)))
}).listen(15176,'127.0.0.1',()=>console.log('Test-only Pyodide candidate probe on 127.0.0.1:15176'))
