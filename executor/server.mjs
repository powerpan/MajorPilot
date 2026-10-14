import http from 'node:http'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {digestUtf8, createDsDigestHandler} from './ds-digest.mjs'
import {executorConfig} from './config.mjs'

const {host,port,parentOrigin,requestHost} = executorConfig()
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
const workerHash = createHash('sha256').update(worker).digest('hex')
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
if (manifest.engine !== 'fixed-calculator-v1' || manifest.workerSha256 !== workerHash) throw new Error('Executor manifest/worker hash mismatch; review both files before starting')
const classifierWorker = readFileSync(new URL('./dist/classifier-worker.js',import.meta.url),'utf8')
const classifierHash = createHash('sha256').update(classifierWorker).digest('hex')
if (manifest.classifierWorkerSha256 !== classifierHash) throw new Error('Classifier manifest/worker hash mismatch')
const dsWorker = readFileSync(new URL('./dist/ds-worker.js',import.meta.url),'utf8')
const dsHash = createHash('sha256').update(dsWorker).digest('hex')
if (manifest.dsWorkerSha256 !== dsHash) throw new Error('DS manifest/worker hash mismatch')
const baWorker = readFileSync(new URL('./dist/ba-worker.js',import.meta.url),'utf8')
const baHash = createHash('sha256').update(baWorker).digest('hex')
if (manifest.baWorkerSha256 !== baHash) throw new Error('BA manifest/worker hash mismatch')
// Assets are embedded by the trusted Node launcher; compute needs no network load.
const bootstrap = `
const nonce = location.hash.slice(1);
const parentOrigin = ${JSON.stringify(parentOrigin)};
const sources = ${JSON.stringify({calculator:{source:worker,hash:workerHash,engine:'fixed-calculator-v1'},classifier:{source:classifierWorker,hash:classifierHash,engine:'classifier-v1'},ds:{source:dsWorker,hash:dsHash,engine:'ds-stats-v1'},ba:{source:baWorker,hash:baHash,engine:'ba-metrics-v1'}})};
const digestUtf8 = ${digestUtf8.toString()};
const createDsDigestHandler = ${createDsDigestHandler.toString()};
let consumed = false;
function emit(result) { parent.postMessage({type:'MP_EXECUTOR_RESULT', nonce, result}, parentOrigin); }
addEventListener('message', async event => {
  if(consumed || event.source !== parent || event.origin !== parentOrigin || event.data?.type !== 'MP_EXECUTE' || event.data?.nonce !== nonce) return;
  consumed = true;
  const classifier = event.data.template === 'classifier-practice-v1';
  const ds = event.data.template === 'ds-analysis-v1';
  const ba = event.data.template === 'ba-analysis-v1';
  const {source:workerSource,hash:expectedHash,engine} = sources[ba ? 'ba' : ds ? 'ds' : classifier ? 'classifier' : 'calculator'];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(workerSource));
  const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('');
  if(actualHash !== expectedHash) return emit({status:'ERROR',code:'ASSET_HASH_MISMATCH',engine:'fixed-calculator-v1'});
  const url = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
  const worker = new Worker(url);
  let finished = false;
  const finish = result => {if(finished) return; finished = true; clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); emit(result)};
  const timer = setTimeout(() => finish({status:'ERROR',code:'EXECUTION_TIMEOUT',engine:'fixed-calculator-v1'}),10000);
  const payload = event.data;
  const digestHandler = ds ? createDsDigestHandler({worker,operationKey:payload.operationKey,parameters:payload.parameters,isActive:()=>!finished,onFailure:finish,subtle:crypto.subtle}) : null;
  addEventListener('pagehide',()=>{finished=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);},{once:true});
  worker.onmessage = event => {
    if(ds && event.data?.type === 'MP_DS_HASH_REQUEST') {void digestHandler(event.data);return;}
    finish(event.data);
  };
  worker.onerror = event => {event.preventDefault(); finish({status:'ERROR',code:'WORKER_FAILURE',engine:'fixed-calculator-v1'});};
  const allowed = ds || ba ? ['type','nonce','template','operationKey','parameters','rows','datasetSha256'] : classifier ? ['type','nonce','template','model','config','samples'] : ['type','nonce','template','values','parameters'];
  if(Object.keys(payload).some(key => !allowed.includes(key))) return finish({status:'ERROR',code:'INVALID_MESSAGE',engine});
  worker.postMessage(ds || ba ? {template:payload.template,operationKey:payload.operationKey,parameters:payload.parameters,rows:payload.rows,datasetSha256:payload.datasetSha256} : classifier ? {template:payload.template,model:payload.model,config:payload.config,samples:payload.samples} : {template:payload.template, values:payload.values, ...(payload.parameters === undefined ? {} : {parameters:payload.parameters})});
});
parent.postMessage({type:'MP_EXECUTOR_READY',nonce},parentOrigin);`
const scriptHash = createHash('sha256').update(bootstrap).digest('base64')
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MajorPilot isolated executor</title></head><body><script>${bootstrap.replaceAll('</script', '<\\/script')}</script></body></html>`
const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; worker-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${parentOrigin}; sandbox allow-scripts`

export function createServer() {
  return http.createServer((request, response) => {
    if (request.headers.host !== requestHost) {response.writeHead(421); return response.end()}
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
