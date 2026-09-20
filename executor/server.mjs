import http from 'node:http'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

const host = '127.0.0.1'
const port = 15175
const parentOrigin = 'http://localhost:15173'
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
const workerHash = createHash('sha256').update(worker).digest('hex')
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
if (manifest.engine !== 'fixed-calculator-v1' || manifest.workerSha256 !== workerHash) throw new Error('Executor manifest/worker hash mismatch; review both files before starting')
// Assets are embedded by the trusted Node launcher; compute needs no network load.
const bootstrap = `
const nonce = location.hash.slice(1);
const parentOrigin = ${JSON.stringify(parentOrigin)};
const workerSource = ${JSON.stringify(worker)};
const expectedHash = ${JSON.stringify(workerHash)};
let consumed = false;
function emit(result) { parent.postMessage({type:'MP_EXECUTOR_RESULT', nonce, result}, parentOrigin); }
addEventListener('message', async event => {
  if(consumed || event.source !== parent || event.origin !== parentOrigin || event.data?.type !== 'MP_EXECUTE' || event.data?.nonce !== nonce) return;
  consumed = true;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(workerSource));
  const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('');
  if(actualHash !== expectedHash) return emit({status:'ERROR',code:'ASSET_HASH_MISMATCH',engine:'fixed-calculator-v1'});
  const url = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
  const worker = new Worker(url);
  const finish = result => {clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); emit(result)};
  const timer = setTimeout(() => finish({status:'ERROR',code:'EXECUTION_TIMEOUT',engine:'fixed-calculator-v1'}),10000);
  worker.onmessage = event => finish(event.data);
  worker.onerror = () => finish({status:'ERROR',code:'WORKER_FAILURE',engine:'fixed-calculator-v1'});
  const payload = event.data;
  if(Object.keys(payload).some(key => !['type','nonce','template','values'].includes(key))) return finish({status:'ERROR',code:'INVALID_MESSAGE',engine:'fixed-calculator-v1'});
  worker.postMessage({template:payload.template, values:payload.values});
});
parent.postMessage({type:'MP_EXECUTOR_READY',nonce},parentOrigin);`
const scriptHash = createHash('sha256').update(bootstrap).digest('base64')
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MajorPilot isolated executor</title></head><body><script>${bootstrap.replaceAll('</script', '<\\/script')}</script></body></html>`
const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; worker-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${parentOrigin}; sandbox allow-scripts`

export function createServer() {
  return http.createServer((request, response) => {
    if (request.headers.host !== `${host}:${port}`) {response.writeHead(421); return response.end()}
    response.setHeader('Content-Security-Policy', csp)
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), display-capture=(), clipboard-read=(), clipboard-write=()')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'GET' || request.url !== '/') {response.writeHead(404); return response.end()}
    // The executor never emits a Set-Cookie header or exposes business API routes.
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
    response.end(html)
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createServer().listen(port, host, () => console.log(`Executor ready at http://${host}:${port}; worker SHA256 ${workerHash}`))
