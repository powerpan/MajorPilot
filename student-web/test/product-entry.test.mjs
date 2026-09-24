import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import ts from "typescript";
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const entries = {};
vm.runInNewContext(compile(readFileSync(new URL("../src/lib/product-entry.ts", import.meta.url), "utf8")), { exports: entries });
const source = readFileSync(new URL("../src/views/DashboardView.vue", import.meta.url), "utf8"), descriptor = parse(source).descriptor;
const compiled = compile(compileScript(descriptor, { id: "product-entry" }).content);
const major = (code) => ({ short: code === "BUSINESS_ANALYTICS" ? "BA" : code === "DATA_SCIENCE" ? "DS" : "AI", name: code });
const run = (values = {}) => ({ runId: "run-1", contentKind: "MAJOR", majorCode: "BUSINESS_ANALYTICS", runMode: "STANDARD", status: "READY", revision: 1, ...values });
const plain = (value) => JSON.parse(JSON.stringify(value));
test("historical report labels use their exact source, never the latest edition for that major", () => {
  const runs = [run({runId:'old',experienceEdition:1}),run({runId:'new',experienceEdition:2})];
  assert.equal(entries.reportEditionLabel({sourceRunId:'old'},runs),'旧版体验 · 原记录保留');
  assert.equal(entries.reportEditionLabel({sourceRunId:'new'},runs),'方法引导版体验');
  assert.equal(entries.reportEditionLabel({sourceRunId:'missing'},runs),'');
  assert.equal(entries.reportEditionLabel({},runs),'');
});
test("creating a new edition keeps old unfinished and closed experiences reachable without mutations",()=>{
  const old=run({runId:'old',experienceEdition:1,status:'PAUSED',taskVersionId:'old-task'}),fresh=run({runId:'new',experienceEdition:2,taskVersionId:'new-task'});
  const rows=[old,fresh,run({runId:'replaced',experienceEdition:1,status:'REPLACED',taskVersionId:'old-task'}),run({runId:'foreign-preview',experienceEdition:1,runMode:'REVIEW_PREVIEW',taskVersionId:'old-task'})],before=JSON.stringify(rows);
  assert.deepEqual(plain(entries.historicalProductRuns(rows)).map(r=>r.runId),['old']);
  assert.equal(entries.historicalProductRuns([old]).length,0);assert.equal(JSON.stringify(rows),before);
  assert.equal(entries.historicalProductRuns([{...old,status:'CLOSED'},fresh])[0].status,'CLOSED');
});
test("product instructions remove the obsolete preview label without rewriting pinned content or claiming review", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../content/ai-support/1.0.0/manifest.json", import.meta.url), "utf8"));
  const original = JSON.stringify(manifest), text = manifest.steps[0].instructions;
  assert.match(text, /工程预览/);
  for (const value of [run({ majorCode: "AI" }), run({ majorCode: "AI", runMode: "REVIEW_PREVIEW", productEligible: true })]) {
    const display = entries.productInstructions(value, text);
    assert.doesNotMatch(display, /工程预览/);
    assert.match(display, /专业审核与真实用户计时尚待完成/);
    assert.equal(display.replace("本次体验的专业审核与真实用户计时尚待完成。", "本工程预览尚待专业审核与真实用户计时。"), text);
  }
  assert.equal(entries.productInstructions(run({ runMode: "REVIEW_PREVIEW" }), text), text);
  assert.equal(JSON.stringify(manifest), original);
});
function harness({ initialRuns = [], currentDecision = null, primary = "BUSINESS_ANALYTICS", available = true, reports = [], hold, confirmation = true, width = 1536, view = "dashboard" } = {}) {
  let mount, changed, epoch = 0;
  const calls = [], navigation = [], confirmations = [];
  const dashboard = { recommendation: { recommendationId: "rec-1", primaryMajor: primary }, majors: ["AI", "DATA_SCIENCE", "BUSINESS_ANALYTICS"].map((majorCode) => ({ majorCode, availability: available ? "AVAILABLE" : "CONTENT_PENDING" })), currentDecision, nextStep: "CHOOSE" };
  const data = { "/api/app/v1/dashboard": dashboard, "/api/app/v1/experience-runs": initialRuns, "/api/public/v1/majors": dashboard.majors, "/api/app/v1/reports?limit=50": { items: reports }, "/api/app/v1/comparison-report": { state: "WAITING", reason: "NEED_TWO_MAJORS" } };
  class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  const imports = {
    vue: { defineComponent: (value) => value, ref: (value) => ({ value }), computed: (get) => ({ get value() { return get(); } }), onMounted: (fn) => { mount = fn; }, watch: (get, fn) => { mount = fn; }, onBeforeUnmount() {}, nextTick: async () => {} },
    "vue-router": { useRouter: () => ({ push: async (url) => navigation.push(url), replace: async (url) => navigation.push(url) }), useRoute: () => ({ params: { major: "BUSINESS_ANALYTICS", taskVersionId: "old-task" }, query: {}, fullPath: "/app/experiences/BUSINESS_ANALYTICS" }) },
    "../lib/api": { ApiError, errorText: (error) => error.message, stableOperation: () => (body) => JSON.stringify(body), api: async (path, options = {}) => {
      calls.push({ path, options });
      if (hold && await hold(path, options)) return { decisionId: "decision-1", recommendationId: "rec-1", selectedMajorCode: options.body.selectedMajorCode };
      if (options.method === "POST") {
        if (path.endsWith("/decision")) return { decisionId: "decision-1", recommendationId: "rec-1", selectedMajorCode: options.body.selectedMajorCode };
        if (path === "/api/app/v1/experience-runs") return run();
        if (path.endsWith("/start") || path.endsWith("/resume")) return run({ status: "IN_PROGRESS" });
        throw new Error(`Unexpected write ${path}`);
      }
      if (!(path in data)) throw new Error(`Unexpected read ${path}`);
      return data[path];
    } },
    "../stores/auth": { useAuth: () => ({ me: { emailVerified: true }, refresh: async () => {}, expire() {} }), onIdentityChange: (fn) => { changed = fn; return () => {}; }, identityRequest: () => { const issued = epoch; return { signal: new AbortController().signal, finish() {}, assertCurrent() { if (issued !== epoch) throw new ApiError(409, "IDENTITY_CHANGED"); } }; } },
    "../data/majors": { major, majors: ["AI", "DATA_SCIENCE", "BUSINESS_ANALYTICS"].map(code => ({ code })) }, "../lib/events": { observeRecommendation: () => () => {} }, "../lib/product-entry": entries, "../lib/report-display": { waitingLabels: {} },
  };
  const module = { exports: {} };
  const script = view === "dashboard" ? compiled : compile(compileScript(parse(readFileSync(new URL(`../src/views/${view === "introduction" ? "FormalIntroductionView" : "PreviewView"}.vue`, import.meta.url), "utf8")).descriptor, { id: "entry-compatibility" }).content);
  vm.runInNewContext(script, { module, exports: module.exports, window: { innerWidth: width, confirm: (message) => { confirmations.push(message); return confirmation; } }, require: (name) => imports[name] || (name.endsWith(".vue") ? {} : (() => { throw new Error(name); })()) });
  const state = module.exports.default.setup({}, { expose() {} });
  if (state.decisionDialog) state.decisionDialog.value = { showModal() {}, close() {} };
  return { state, calls, navigation, confirmations, data, mount, identity: () => { epoch++; changed(); } };
}

test("only server-authorized old previews join the product experience flow", () => {
  assert.equal(entries.isProductRun(run()), true);
  assert.equal(entries.isProductRun(run({ runMode: "REVIEW_PREVIEW" })), false);
  assert.equal(entries.isProductRun(run({ runMode: "REVIEW_PREVIEW", productEligible: true })), true);
  assert.equal(entries.isProductRun(run({ contentKind: "DEMO", productEligible: true })), false);
});
test("completed product runs take priority and replaced/history-only previews never invite duplicate completion", () => {
  const records = [run({ runId: "closed", status: "CLOSED", runMode: "REVIEW_PREVIEW", productEligible: true }), run({ runId: "later-ready" }), run({ runId: "replaced", status: "REPLACED" })];
  assert.equal(entries.productRun(records, "BUSINESS_ANALYTICS").runId, "closed");
  assert.equal(entries.productRun(records, "AI"), undefined);
});
test("labels distinguish running, reflection, paused, report-ready and report-preparing", () => {
  assert.equal(entries.productAction(undefined, undefined, "BA", true), "开始 BA 体验");
  assert.equal(entries.productAction(run({ status: "TASK_COMPLETED" }), undefined, "BA", true), "完成体验反思");
  assert.equal(entries.productAction(run({ status: "PAUSED" }), undefined, "BA", true), "继续 BA 体验");
  assert.equal(entries.productAction(run({ status: "CLOSED" }), undefined, "BA", true), "查看报告进度");
  assert.equal(entries.productAction(run({ status: "CLOSED" }), { currentVersionId: "v1" }, "BA", true), "查看体验报告");
  assert.equal(entries.productAction(undefined, undefined, "BA", false), "了解这个方向");
});
test("recommended CTA saves the real decision then creates and starts exactly one STANDARD run", async () => {
  const h = harness(); await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  const writes = h.calls.filter((call) => call.options.method === "POST");
  assert.deepEqual(writes.map((call) => call.path), ["/api/app/v1/recommendations/rec-1/decision", "/api/app/v1/experience-runs", "/api/app/v1/experience-runs/run-1/start"]);
  assert.deepEqual(plain(writes[0].options.body), { selectedMajorCode: "BUSINESS_ANALYTICS" });
  assert.deepEqual(h.navigation, ["/app/runs/run-1"]);
});
test("same-recommendation saved decision is reused, but another recommendation is not", async () => {
  for (const [id, expected] of [["rec-1", 0], ["older", 1]]) {
    const h = harness({ currentDecision: { decisionId: "saved", recommendationId: id, selectedMajorCode: "BUSINESS_ANALYTICS" } });
    await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
    assert.equal(h.calls.filter((call) => call.path.endsWith("/decision")).length, expected);
  }
});
test("unselected different major first asks rather than silently inventing an override reason", async () => {
  const h = harness(); await h.mount(); await h.state.startFormal("AI");
  assert.equal(h.state.choosing.value, "AI");
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
  h.state.reason.value = "UNFAMILIAR_FIRST"; await h.state.save();
  assert.equal(h.calls.find((call) => call.path.endsWith("/decision")).options.body.overrideReasonCode, "UNFAMILIAR_FIRST");
});
test("admitted historical closed preview opens its actual private report without writes", async () => {
  const h = harness({ initialRuns: [run({ status: "CLOSED", runMode: "REVIEW_PREVIEW", productEligible: true })], reports: [{ reportId: "real-report", reportType: "EXPERIENCE", majorCode: "BUSINESS_ANALYTICS", currentVersionId: "v1" }] });
  await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  assert.deepEqual(h.navigation, ["/app/reports/real-report"]);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("paused run uses atomic switch revisions without a new decision or run", async () => {
  const paused = run({ status: "PAUSED", revision: 9 });
  const active = run({ runId: "active", majorCode: "AI", status: "IN_PROGRESS", revision: 4 });
  const h = harness({ initialRuns: [paused, active] }); await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  const writes = h.calls.filter((call) => call.options.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/api/app/v1/experience-runs/run-1/resume");
  assert.deepEqual(plain(writes[0].options.body), { expectedRevision: 9, pauseActiveRunId: "active", expectedActiveRunRevision: 4 });
  assert.equal(h.confirmations.length, 1);
});
test("declining a switch preserves progress and makes no transition write", async () => {
  const h = harness({ confirmation: false, initialRuns: [run({ status: "PAUSED" }), run({ runId: "active", majorCode: "AI", status: "IN_PROGRESS" })] });
  await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  assert.deepEqual(h.navigation, []);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("double click and changed identity fence a pending decision before any run creation or route change", async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ hold: async (path) => { if (!path.endsWith("/decision")) return false; await gate; return true; } });
  await h.mount(); const pending = h.state.startFormal("BUSINESS_ANALYTICS");
  await h.state.startFormal("BUSINESS_ANALYTICS");
  assert.equal(h.calls.filter((call) => call.path.endsWith("/decision")).length, 1);
  h.identity(); release(); await pending;
  assert.deepEqual(h.navigation, []);
  assert.equal(h.state.dashboard.value, null);
  assert.equal(h.state.error.value, "");
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 1);
});
test("unavailable content stays honest and links to the introduction without creating a run", async () => {
  const h = harness({ available: false }); await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  assert.deepEqual(h.navigation, ["/app/experiences/BUSINESS_ANALYTICS"]);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("mobile can read introduction or saved progress but cannot create or resume a task", async () => {
  for (const existing of [false, true]) {
    const h = harness({ width: 390, initialRuns: existing ? [run({ status: "PAUSED" })] : [] });
    await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
    assert.deepEqual(h.navigation, [existing ? "/app/runs/run-1" : "/app/experiences/BUSINESS_ANALYTICS"]);
    assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
  }
});
test("the explicit new-edition entry also preserves the mobile read-only task boundary", async () => {
  const old = run({experienceEdition:1,status:'CLOSED'}),h = harness({width:390,initialRuns:[old]});
  await h.mount();await h.state.startEdition(old);
  assert.equal(h.calls.filter(call=>call.options.method==='POST').length,0);
  assert.deepEqual(h.navigation,[]);
});
test("a failed run-list read cannot leave a misleading start button backed by an empty run list", async () => {
  const h = harness({ hold: async (path) => { if (path === "/api/app/v1/experience-runs") throw new Error("run read failed"); return false; } });
  await h.mount(); await h.state.startFormal("BUSINESS_ANALYTICS");
  assert.equal(h.state.dashboard.value, null);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("formal introduction starts the recommended experience with one explicit click", async () => {
  const h = harness({ view: "introduction" }); await h.mount(); await h.state.start();
  assert.deepEqual(h.calls.filter((call) => call.options.method === "POST").map((call) => call.path), ["/api/app/v1/recommendations/rec-1/decision", "/api/app/v1/experience-runs", "/api/app/v1/experience-runs/run-1/start"]);
  assert.deepEqual(h.navigation, ["/app/runs/run-1"]);
});
test("formal introduction reuses an authorized closed preview and opens its report", async () => {
  const h = harness({ view: "introduction", initialRuns: [run({ status: "CLOSED", runMode: "REVIEW_PREVIEW", productEligible: true })], reports: [{ reportId: "real-report", reportType: "EXPERIENCE", majorCode: "BUSINESS_ANALYTICS", currentVersionId: "v1" }] });
  await h.mount(); await h.state.start();
  assert.deepEqual(h.navigation, ["/app/reports/real-report"]);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("mobile formal introduction never creates a decision or starts a task", async () => {
  const h = harness({ view: "introduction", width: 390 }); await h.mount(); await h.state.start();
  assert.deepEqual(h.navigation, []);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("legacy task URL resolves only its exact saved task to the product introduction without writes", async () => {
  const h = harness({ view: "legacy", initialRuns: [run({ taskVersionId: "unrelated-task", majorCode: "AI" }), run({ taskVersionId: "old-task", runMode: "REVIEW_PREVIEW", productEligible: true })] });
  await h.mount(); assert.deepEqual(h.navigation, ["/app/experiences/BUSINESS_ANALYTICS"]);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0);
});
test("student homepage no longer offers preview creation and keeps its recommended action in the recommendation band", () => {
  assert.doesNotMatch(source, /review-preview|previewAvailable|工程预览/);
  assert.match(descriptor.template.content, /dashboard-recommendation-copy[\s\S]*dashboard-primary-action[\s\S]*startFormal\(dashboard.recommendation.primaryMajor\)/);
  const redirect = readFileSync(new URL("../src/views/PreviewView.vue", import.meta.url), "utf8");
  assert.doesNotMatch(redirect, /method: "POST"|review-preview-runs/);
  assert.match(redirect, /taskVersionId === taskId/);
});
