import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/stores/reports.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const fixture = JSON.parse(
  readFileSync(
    new URL("../../contracts/examples/reports/ai.json", import.meta.url),
    "utf8",
  ),
);
const clone = (value) => structuredClone(value),
  settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => (resolve = yes));
  return { promise, resolve };
};
class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
function harness() {
  let identityEpoch = 0,
    handler = async (path) =>
      path.endsWith("/status")
        ? {
            reportId: fixture.reportId,
            status: "READY",
            currentVersionId: fixture.reportVersionId,
            generation: null,
            revision: 1,
          }
        : clone(fixture);
  const calls = [],
    identityListeners = [],
    controllers = new Set(),
    timers = new Map(),
    events = new Map();
  let timerId = 0;
  const auth = {
    me: { studentId: "owned" },
    async refresh() {},
    expire() {
      identity();
    },
  };
  function identity() {
    identityEpoch++;
    auth.me = null;
    controllers.forEach((item) => item.abort());
    controllers.clear();
    identityListeners.forEach((item) => item());
  }
  const document = {
    visibilityState: "visible",
    addEventListener: (key, callback) => events.set(key, callback),
  };
  const imports = {
    pinia: { defineStore: (_id, setup) => setup },
    vue: {
      ref: (value) => ({ value }),
      computed: (get) => ({
        get value() {
          return get();
        },
      }),
    },
    "../lib/api": {
      api: async (path, options) => {
        calls.push({ path, options });
        return handler(path, options);
      },
      ApiError,
      errorText: (error) => error.message,
    },
    "./auth": {
      useAuth: () => auth,
      onIdentityChange: (listener) => identityListeners.push(listener),
      identityRequest: () => {
        const epoch = identityEpoch,
          controller = new AbortController();
        controllers.add(controller);
        return {
          signal: controller.signal,
          assertCurrent() {
            if (epoch !== identityEpoch)
              throw new ApiError(409, "IDENTITY_CHANGED");
          },
          finish() {
            controllers.delete(controller);
          },
        };
      },
    },
    "../lib/report-display": {
      isReport: (value) => value?.schemaVersion === "report-v1",
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    AbortController,
    AbortSignal,
    document,
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  })((key) => imports[key], module, module.exports);
  const reader = module.exports.useReports();
  return {
    reader,
    calls,
    timers,
    setApi: (next) => (handler = next),
    identity,
    visibility: (state) => {
      document.visibilityState = state;
      events.get("visibilitychange")();
    },
  };
}
test("READY reads direct report-v1 and status separately, never wraps or persists body", async () => {
  const h = harness();
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  assert.equal(h.reader.report.value.reportVersionId, fixture.reportVersionId);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every((item) => !item.options?.method));
});
test("202 status waits; READY refresh loads body without requesting generation", async () => {
  const h = harness();
  let ready = false;
  h.setApi(async (path) =>
    path.endsWith("/status") || !ready
      ? {
          reportId: fixture.reportId,
          status: ready ? "READY" : "GENERATING",
          currentVersionId: ready ? fixture.reportVersionId : null,
          generation: { status: "GENERATING", phase: "PREPARED" },
          revision: 1,
        }
      : clone(fixture),
  );
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  assert.equal(h.reader.report.value, null);
  assert.equal(h.reader.preparing.value, true);
  ready = true;
  await h.reader.refreshStatus();
  assert.equal(h.reader.report.value.reportVersionId, fixture.reportVersionId);
  assert.ok(h.calls.every((item) => !item.options?.method));
});
test("new current version never silently replaces the report already being read", async () => {
  const h = harness();
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  h.setApi(async () => ({
    reportId: fixture.reportId,
    status: "READY",
    currentVersionId: "new-version",
    generation: null,
    revision: 2,
  }));
  await h.reader.refreshStatus();
  assert.equal(h.reader.report.value.reportVersionId, fixture.reportVersionId);
  assert.equal(h.reader.newVersionAvailable.value, true);
  assert.equal(h.timers.size, 0);
});
test("hidden stops polling and resumed timer backs off without mutating server", async () => {
  const h = harness();
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  assert.equal([...h.timers.values()][0].delay, 2000);
  h.visibility("hidden");
  assert.equal(h.timers.size, 0);
  h.visibility("visible");
  assert.equal([...h.timers.values()][0].delay, 4000);
  h.reader.clear();
  assert.equal(h.timers.size, 0);
});
test("identity change clears body and aborts requests; a late response cannot repopulate", async () => {
  const h = harness(),
    pending = deferred();
  h.setApi(() => pending.promise);
  const work = h.reader.open({ kind: "report", reportId: fixture.reportId });
  await settle();
  h.identity();
  assert.equal(h.calls[0].options.signal.aborted, true);
  pending.resolve(clone(fixture));
  await work;
  assert.equal(h.reader.report.value, null);
  assert.equal(h.reader.status.value, null);
  assert.equal(h.timers.size, 0);
});
test("print validates the expected version and does not expose a changed body", async () => {
  const h = harness();
  await h.reader.open({
    kind: "print",
    reportId: fixture.reportId,
    expectedVersionId: "old-version",
  });
  assert.match(
    h.calls[0].path,
    /\/print\?expectedReportVersionId=old-version$/,
  );
  assert.equal(h.reader.report.value, null);
  assert.equal(h.reader.errorCode.value, "REPORT_VERSION_CHANGED");
  assert.equal(h.timers.size, 0);
});
test("comparison READY unwraps only explicit branch and enables only matching source links", async () => {
  const h = harness(),
    comparison = clone(fixture);
  comparison.reportType = "COMPARISON";
  comparison.sources = [
    {
      ...fixture.sources[0],
      sourceReport: {
        reportId: "source-a",
        reportVersionId: "version-a",
        versionNo: 1,
      },
    },
    {
      ...fixture.sources[0],
      majorCode: "DATA_SCIENCE",
      sourceReport: {
        reportId: "source-b",
        reportVersionId: "version-b",
        versionNo: 1,
      },
    },
  ];
  h.setApi(async (path) =>
    path.endsWith("/comparison-report")
      ? { state: "READY", report: comparison, generation: null }
      : {
          status: "READY",
          currentVersionId: path.includes("source-a")
            ? "version-a"
            : "newer-version",
        },
  );
  await h.reader.open({ kind: "comparison" });
  await settle();
  assert.equal(h.reader.sourceReadable.value["version-a"], true);
  assert.equal(h.reader.sourceReadable.value["version-b"], false);
  assert.equal(h.calls.length, 3);
});
test("failed regeneration keeps old current report readable", async () => {
  const h = harness();
  h.setApi(async (path) =>
    path.endsWith("/status")
      ? {
          reportId: fixture.reportId,
          status: "READY",
          currentVersionId: fixture.reportVersionId,
          generation: {
            status: "FAILED",
            safeCode: "REPORT_GENERATION_FAILED",
          },
          revision: 2,
        }
      : clone(fixture),
  );
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  assert.equal(h.reader.report.value.reportVersionId, fixture.reportVersionId);
  assert.equal(h.reader.generation.value.status, "FAILED");
  assert.equal(h.reader.error.value, "");
});
test("a recognized account-lock denial clears an already visible private body", async () => {
  const h = harness();
  await h.reader.open({ kind: "report", reportId: fixture.reportId });
  assert.ok(h.reader.report.value);
  h.setApi(async () => {
    throw new ApiError(403, "ACCOUNT_LOCKED");
  });
  await h.reader.refreshStatus();
  assert.equal(h.reader.report.value, null);
  assert.equal(h.reader.status.value, null);
  assert.equal(h.timers.size, 0);
});
