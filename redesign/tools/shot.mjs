// Screenshot tool for the redesign prototype (headless Chrome via DevTools protocol).
// Usage: node tools/shot.mjs <out.png> <url-path-and-hash> [width=1440] [height=0 (=full page, up to --max-height)]
//          [--click=<css selector>]... [--drag=<sel>:<from>:<to>]... [--touchdrag=<sel>:<from>:<to>]...
//          [--wait=<ms>] [--eval=<js>]... [--max-height=<px>]
//   Flags may appear anywhere after the URL (a --click right after the width is no longer swallowed as the height).
//   --click dispatches a real bubbling MouseEvent, so SVG elements work too.
//   --drag drags an input[type=range] with REAL pointer input (CDP Input.dispatchMouseEvent): mousePressed at <from>,
//     mouseMoved in 12 steps, mouseReleased at <to>. <from>/<to> are fractions of the slider's value range
//     (0 = min, 1 = max; mapped to screen x, so dir="rtl" sliders work), and <from> may be "thumb" (or empty) to
//     press on the thumb where it currently is. The selector may contain colons: the last two ":" fields are the fractions.
//     It scrolls the slider into view first, and prints value before → after plus how many input/change events fired.
//   --touchdrag is the same gesture with touch input (Input.dispatchTouchEvent touchStart/touchMove/touchEnd;
//     touch emulation is switched on for the run), to check sliders on phones.
//   --focus=<selector> scrolls to and focuses an element; --key=<Tab|Enter|Escape|ArrowLeft|ArrowRight|...> sends a real
//     key press (CDP Input.dispatchKeyEvent), e.g. --focus=#ai-staff --key=ArrowRight to see the :focus-visible ring.
//   --click/--drag/--touchdrag/--focus/--key run in the order given; then --wait; then each --eval (a JS expression; prints its JSON result).
//   --max-height caps a full-page capture (default 4000 CSS px). Long phone pages: --max-height=12000. Captures taller
//     than Chrome's ~16k-device-pixel texture limit are taken in slices and stitched into one PNG automatically.
// Example: node tools/shot.mjs shots/ba-2.png "/?preset=sample#/lens/ba/funnel" 1440
//          node tools/shot.mjs shots/home-zh.png "/?preset=fresh&lang=zh#/home" 390
// Prints page errors AND failed network loads (a script that never loads used to look like "no page errors").
// Serve the folder with: python3 tools/serve.py 8790  (threaded, deep queue, no-cache)
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createServer } from "node:net";
import { decodePNG, encodePNG, stackPNG } from "./png.mjs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const pos = args.filter((a) => !a.startsWith("--"));
const [out, path = "/#/home", w = "1440", h = "0"] = pos;
const ACT = ["--click=", "--drag=", "--touchdrag=", "--key=", "--focus="];
const actions = flags.map((a) => { const k = ACT.find((p) => a.startsWith(p)); return k ? { kind: k.slice(2, -1), arg: a.slice(k.length) } : null; }).filter(Boolean);
const maxH = +((flags.find((a) => a.startsWith("--max-height=")) || "--max-height=4000").slice(13)) || 4000;
const evals = flags.filter((a) => a.startsWith("--eval=")).map((a) => a.slice(7));
const waitMs = +((flags.find((a) => a.startsWith("--wait=")) || "--wait=0").slice(7));
const BASE = process.env.MP_BASE || "http://localhost:8790";
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "mpshot-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
let ws, id = 0; const pending = new Map(); const errors = []; const reqs = new Map();
try {
  let url; for (let i = 0; i < 200 && !url; i++) { try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} if (!url) await sleep(150); }
  ws = new WebSocket(url); await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value || a.description).join(" "));
    if (m.method === "Network.requestWillBeSent") reqs.set(m.params.requestId, m.params.request.url);
    if (m.method === "Network.loadingFailed" && !m.params.canceled) { const u = reqs.get(m.params.requestId) || ""; if (u.startsWith(BASE)) errors.push(`LOAD FAILED ${u.slice(BASE.length)} (${m.params.errorText})`); }
    if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && m.params.response.url.startsWith(BASE)) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url.slice(BASE.length)}`);
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  /** Real pointer drag on a range input: "<selector>:<from|thumb>:<to>" (fractions of the value range). */
  const drag = async (kind, spec) => {
    const m = spec.match(/^(.*):([^:]*):([^:]*)$/);
    if (!m) { console.log(`${kind}: bad spec "${spec}" (want <selector>:<from|thumb>:<to>)`); return; }
    const [, sel, fromS, toS] = m;
    const g = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
      e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      if(!e.__mpDrag){ e.__mpDrag={input:0,change:0}; e.addEventListener('input',()=>e.__mpDrag.input++); e.addEventListener('change',()=>e.__mpDrag.change++); }
      e.__mpDrag.input=0; e.__mpDrag.change=0;
      const r=e.getBoundingClientRect(), cs=getComputedStyle(e), min=e.min===''?0:+e.min, max=e.max===''?100:+e.max;
      const tw=e.classList.contains('mp-range')?18:16;   // thumb width (tokens.css); the track runs tw/2 in from each end
      return {l:r.left,w:r.width,y:r.top+r.height/2,min,max,v:+e.value,rtl:cs.direction==='rtl'||e.dir==='rtl',tw,vw:innerWidth,vh:innerHeight};})()`);
    if (!g) { console.log(`${kind}: no element for ${sel}`); return; }
    if (g.y < 0 || g.y > g.vh) console.log(`${kind}: warning, ${sel} is outside the viewport (y=${Math.round(g.y)})`);
    const xAt = (f) => { f = Math.max(0, Math.min(1, f)); if (g.rtl) f = 1 - f; return g.l + g.tw / 2 + f * (g.w - g.tw); };
    const cur = g.max > g.min ? (g.v - g.min) / (g.max - g.min) : 0;
    const x0 = xAt(fromS === "" || fromS === "thumb" ? cur : +fromS), x1 = xAt(+toS), y = g.y, N = 12;
    if (kind === "drag") {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= N; i++) { await sleep(16); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x1 - x0) * i / N, y, button: "left", buttons: 1 }); }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y, button: "left", buttons: 0, clickCount: 1 });
    } else {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y, id: 1 }] });
      for (let i = 1; i <= N; i++) { await sleep(16); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / N, y, id: 1 }] }); }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await sleep(300);
    const after = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return {gone:true}; return {v:+e.value, input:e.__mpDrag?e.__mpDrag.input:'?', change:e.__mpDrag?e.__mpDrag.change:'?', fill:e.style.getPropertyValue('--fill')}})()`);
    console.log(`${kind} ${sel}: x ${Math.round(x0)}→${Math.round(x1)}, value ${g.v} → ${after.gone ? "(element re-rendered away)" : after.v}` + (after.gone ? "" : ` · input×${after.input} change×${after.change}${after.fill ? " · --fill " + after.fill : ""}`));
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  const width = +w;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: width < 700 ? 3 : 2, mobile: width < 700 });
  await send("Page.navigate", { url: BASE + path });
  for (let i = 0; i < 40; i++) { await sleep(150); if (await ev("document.readyState==='complete' && !!document.querySelector('#app > *')")) break; }
  await ev("document.fonts.ready.then(()=>true)"); await sleep(300);
  const dpr = width < 700 ? 3 : 2;
  if (actions.some((a) => a.kind === "touchdrag")) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  for (const a of actions) {
    if (a.kind === "click") {
      const ok = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(a.arg)}); if(!e) return false; e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); return true})()`);
      if (!ok) console.log(`click: no element for ${a.arg}`);
      await sleep(450);
    } else if (a.kind === "focus") {
      const ok = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(a.arg)}); if(!e) return false; e.scrollIntoView({block:'center',behavior:'instant'}); e.focus(); return true})()`);
      if (!ok) console.log(`focus: no element for ${a.arg}`);
    } else if (a.kind === "key") {
      const K = { Tab: [9, "Tab"], Enter: [13, "Enter"], Escape: [27, "Escape"], " ": [32, "Space"], ArrowLeft: [37, "ArrowLeft"], ArrowUp: [38, "ArrowUp"], ArrowRight: [39, "ArrowRight"], ArrowDown: [40, "ArrowDown"], Home: [36, "Home"], End: [35, "End"] }[a.arg] || [0, a.arg];
      const base = { key: a.arg, code: K[1], windowsVirtualKeyCode: K[0], nativeVirtualKeyCode: K[0] };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base }); await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(200);
    } else await drag(a.kind, a.arg);
  }
  if (waitMs) await sleep(waitMs);
  for (const x of evals) console.log("eval:", JSON.stringify(await ev(x)));
  await ev("(()=>{const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important} .site-header{position:static!important}';document.head.appendChild(s);return true})()");
  await sleep(250);
  const sw = await ev("document.documentElement.scrollWidth");
  if (sw > width + 1) errors.push(`HORIZONTAL OVERFLOW: page is ${sw}px wide at ${width}px`);
  const fullH = Math.ceil(await ev("document.documentElement.scrollHeight"));
  let height = +h || Math.min(maxH, fullH);
  if (!+h && fullH > maxH) console.log(`note: page is ${fullH}px tall; captured the top ${maxH}px (raise --max-height to get it all)`);
  mkdirSync(dirname(out), { recursive: true });
  // Chrome can't rasterize one surface much past ~16k device px (taller captures wrap/tile or come back blank),
  // so tall pages are captured slice by slice through a slice-sized viewport and stitched.
  const SLICE = +process.env.MP_SLICE || 4000;
  if (height * dpr <= 15000 && !process.env.MP_SLICE) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: width < 700 });
    await sleep(350);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(out, Buffer.from(data, "base64"));
  } else {
    if (height > fullH) { console.log(`note: stitched captures stop at the page end (${fullH}px)`); height = fullH; }
    await send("Emulation.setDeviceMetricsOverride", { width, height: SLICE, deviceScaleFactor: dpr, mobile: width < 700 });
    // sticky bars would repeat in every slice; with a page-tall viewport they sit in their natural place, so pin them there
    await ev("(()=>{document.querySelectorAll('*').forEach(e=>{if(getComputedStyle(e).position==='sticky')e.style.setProperty('position','static','important')});return true})()");
    await sleep(350);
    const sh = Math.ceil(await ev("document.documentElement.scrollHeight"));
    if (process.env.MP_DEBUG) console.log(`debug: scrollHeight ${fullH} at 900px viewport, ${sh} in slice mode`);
    if (sh < height) height = sh;
    const parts = [];
    for (let y = 0; y < height; y += SLICE) {
      const top = Math.min(y, height - SLICE);                        // the last slice overlaps the previous one; trim it
      // shift the page with a transform instead of scrolling: no scroll handlers fire (the header's "scrolled" state
      // changes its height) and the slice lands exactly where asked
      await ev(`(()=>{window.scrollTo(0,0);document.documentElement.style.transform='translateY(-${top}px)';return true})()`); await sleep(220);
      const img = decodePNG(Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      const skip = Math.round((y - top) * dpr), rowB = img.width * 4;
      parts.push({ width: img.width, height: img.height - skip, data: img.data.subarray(skip * rowB) });
    }
    writeFileSync(out, encodePNG(stackPNG(parts)));
    console.log(`stitched ${parts.length} slices of ${SLICE}px`);
  }
  console.log(`saved ${out} (${width}x${height})`);
  if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n")); else console.log("no page errors");
} finally { try { ws && ws.close(); } catch {} chrome.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300); }
setTimeout(() => process.exit(0), 400);
