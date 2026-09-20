import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { randomUUID, createHash, webcrypto } from "node:crypto";
import ts from "typescript";

// Current store code with transport/DOM/storage boundaries substituted. Browser
// tests separately exercise real IndexedDB and the isolated Worker.
const source = ts.transpileModule(
  readFileSync(new URL("../src/stores/workspace.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
const clone = (value) => structuredClone(value);
class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const run = {
  runId: "owned-run",
  status: "IN_PROGRESS",
  revision: 1,
  readOnly: false,
  taskVersionId: "reviewed-v1",
  currentStepKey: "prepare",
  steps: [
    { stepKey: "prepare", status: "IN_PROGRESS", revision: 1 },
    { stepKey: "observe", status: "NOT_STARTED", revision: 0 },
  ],
};
const definition = {
  stepKey: "prepare",
  title: "准备",
  dependencies: [],
  inputSchema: { properties: { acknowledged: { type: "boolean" } } },
  assetKeys: [],
  operationKey: null,
  responseSchemaVersion: "v1",
};
const step = {
  ...definition,
  status: "IN_PROGRESS",
  revision: 1,
  response: { acknowledged: true },
  definition,
  readOnly: false,
  executions: [],
};
function harness() {
  let epoch = 0;
  let draftReader = async () => undefined;
  const listeners = [],
    calls = [],
    drafts = [],
    dsCalls = [];
  let handler = async (path, options) =>
    path.endsWith("/task")
      ? { steps: [definition], assets: [], versionCode: "1" }
      : path.includes("/steps/")
        ? clone(step)
        : clone(run);
  const auth = {
    me: { studentId: "owner" },
    async refresh() {},
    expire() {
      identity();
    },
  };
  function identity() {
    epoch++;
    auth.me = null;
    listeners.forEach((listener) => listener());
  }
  const context = vm.createContext({
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    navigator: { onLine: true },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("[]").buffer,
    }),
  });
  const require = (path) =>
    path === "vue"
      ? {
          ref: (value) => ({ value }),
          computed: (getter) => ({
            get value() {
              return getter();
            },
          }),
        }
      : path === "pinia"
        ? { defineStore: (_, setup) => setup }
        : path === "./auth"
          ? {
              useAuth: () => auth,
              onIdentityChange: (listener) => listeners.push(listener),
              identityRequest: () => {
                const issued = epoch;
                return {
                  signal: new AbortController().signal,
                  assertCurrent() {
                    if (issued !== epoch)
                      throw new ApiError(409, "IDENTITY_CHANGED");
                  },
                  finish() {},
                };
              },
            }
          : path === "../lib/api"
            ? {
                ApiError,
                errorText: (error) => error.message,
                api: (path, options) => {
                  calls.push({ path, options });
                  return handler(path, options);
                },
                stableOperation: () => {
                  let prev, key;
                  return (body) => {
                    const next = JSON.stringify(body);
                    if (next !== prev) {
                      prev = next;
                      key = randomUUID();
                    }
                    return key;
                  };
                },
              }
            : path === "../lib/task-drafts"
              ? {
                  async readTaskDraft() {
                    return draftReader();
                  },
                  async writeTaskDraft(key, revision, answer) {
                    drafts.push({ key, revision, answer: clone(answer) });
                  },
                  async removeTaskDraft() {
                    drafts.length = 0;
                  },
                }
              : path === "../execution"
                ? {
                    execute: async () => ({
                      status: "SUCCESS",
                      result: { count: 4, sum: 52, mean: 13 },
                    }),
                    executeDs: async (...args) => {
                      dsCalls.push(clone(args.slice(0, 4)));
                      return {
                        status: "SUCCESS",
                        result: { schemaVersion: "ds-result-v1" },
                      };
                    },
                  }
                : (() => {
                    throw new Error(`Unexpected import ${path}`);
                  })();
  const module = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(
    require,
    module,
    module.exports,
  );
  return {
    store: module.exports.useWorkspace(),
    identity,
    auth,
    calls,
    drafts,
    dsCalls,
    setApi(next) {
      handler = next;
    },
    setDraftReader(next) {
      draftReader = next;
    },
  };
}
test("late Run load cannot repopulate a cleared identity", async () => {
  const h = harness(),
    reply = deferred();
  h.setApi(() => reply.promise);
  const pending = h.store.load("owned-run");
  await settle();
  h.identity();
  reply.resolve(clone(run));
  await pending;
  assert.equal(h.store.run.value, null);
  assert.equal(h.store.step.value, null);
  h.store.clear();
});
test("late autosave cannot resurrect cleared input or state", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const reply = deferred();
  h.setApi(() => reply.promise);
  h.store.edit({ acknowledged: false });
  const pending = h.store.flush();
  await settle();
  h.identity();
  reply.resolve({ revision: 2, runRevision: 2, invalidatedStepKeys: [] });
  assert.equal(await pending, false);
  assert.equal(h.store.run.value, null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.answer.value)), {});
  h.store.clear();
});
test("edits during autosave get the returned revision before a second serialized save", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const reply = deferred();
  let writes = 0;
  h.setApi(async (path, options) => {
    if (options.method === "PUT") {
      writes++;
      if (writes === 1) return reply.promise;
      return { revision: 3, runRevision: 3, invalidatedStepKeys: [] };
    }
    return clone(run);
  });
  h.store.edit({ acknowledged: false });
  const pending = h.store.flush();
  await settle();
  h.store.edit({ acknowledged: true });
  reply.resolve({ revision: 2, runRevision: 2, invalidatedStepKeys: [] });
  assert.equal(await pending, true);
  assert.equal(writes, 2);
  const requests = h.calls.filter((call) => call.options.method === "PUT");
  assert.equal(requests[1].options.body.expectedRevision, 2);
  assert.equal(h.store.dirty.value, false);
  h.store.clear();
});
test("conflicting autosave keeps the draft and requires explicit adoption", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.setApi(async () => {
    throw new ApiError(409, "STEP_REVISION_CONFLICT");
  });
  h.store.edit({ acknowledged: false });
  assert.equal(await h.store.flush(), false);
  assert.equal(h.store.conflict.value, true);
  assert.equal(h.store.answer.value.acknowledged, false);
  assert.ok(h.drafts.length);
  h.store.clear();
});
test("invalidation notice describes history after a step is completed again and clears with identity", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const observe = { ...definition, stepKey: "observe", title: "观察" };
  h.store.manifest.value.steps.push(observe);
  h.setApi(async (path, options) => {
    if (options.method === "PUT")
      return {
        revision: 2,
        runRevision: 2,
        invalidatedStepKeys: ["prepare", "observe"],
      };
    if (path.endsWith("/complete"))
      return {
        ...clone(run),
        revision: 3,
        currentStepKey: "observe",
        steps: [
          { stepKey: "prepare", status: "COMPLETED", revision: 2 },
          { stepKey: "observe", status: "IN_PROGRESS", revision: 0 },
        ],
      };
    if (path.endsWith("/steps/observe"))
      return {
        ...clone(step),
        stepKey: "observe",
        definition: observe,
        revision: 0,
      };
    return { ...clone(run), revision: 2 };
  });
  h.store.edit({ acknowledged: false });
  assert.equal(await h.store.flush(), true);
  const notice = h.store.iterationNotice.value;
  assert.equal(
    notice,
    "本次修改曾使以下步骤的完成状态失效：准备、观察。答案与历史仍保留；当前进度以左侧步骤状态为准。",
  );
  assert.doesNotMatch(notice, /需要重新复核/);
  await h.store.complete();
  assert.equal(h.store.run.value.steps[0].status, "COMPLETED");
  assert.equal(h.store.selectedStep.value, "observe");
  assert.equal(
    h.store.iterationNotice.value,
    notice,
    "a historical notice does not claim these remain pending",
  );
  h.identity();
  assert.equal(h.store.iterationNotice.value, "");
  h.store.clear();
});
test("other-tab pause stops writes without silently resuming or deleting local differences", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.edit({ acknowledged: false });
  h.setApi(async () => ({
    ...clone(run),
    status: "PAUSED",
    readOnly: true,
    revision: 2,
  }));
  await h.store.checkState();
  assert.equal(h.store.readOnly.value, true);
  assert.equal(await h.store.flush(), false);
  assert.equal(h.store.answer.value.acknowledged, false);
  assert.equal(
    h.calls.filter((call) => call.options.method === "PUT").length,
    0,
  );
  h.store.clear();
});
test("out-of-order step loads cannot attach another step answer to the selected editor", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const first = deferred(),
    second = deferred();
  h.setApi((path) =>
    path.endsWith("/prepare") ? first.promise : second.promise,
  );
  const a = h.store.select("prepare"),
    b = h.store.select("observe");
  second.resolve({
    ...clone(step),
    stepKey: "observe",
    definition: { ...definition, stepKey: "observe" },
    response: { observation: "current-step-answer" },
  });
  await b;
  first.resolve(clone(step));
  await assert.rejects(a, (error) => error.code === "IDENTITY_CHANGED");
  assert.equal(h.store.selectedStep.value, "observe");
  assert.equal(h.store.answer.value.observation, "current-step-answer");
  h.store.clear();
});
test("a second flush waits for all edits queued during the first save", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const first = deferred(),
    second = deferred();
  let writes = 0;
  h.setApi(async () => (++writes === 1 ? first.promise : second.promise));
  h.store.edit({ acknowledged: false });
  const initial = h.store.flush();
  await settle();
  h.store.edit({ acknowledged: true });
  let drained = false;
  const waiter = h.store.flush().then((value) => {
    drained = true;
    return value;
  });
  first.resolve({ revision: 2, runRevision: 2, invalidatedStepKeys: [] });
  await settle();
  assert.equal(
    drained,
    false,
    "dependent action must not proceed after only the older save",
  );
  second.resolve({ revision: 3, runRevision: 3, invalidatedStepKeys: [] });
  assert.equal(await waiter, true);
  await initial;
  assert.equal(writes, 2);
  h.store.clear();
});
test("P3 source binding is distinct from historical execution source and governs staleness", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value = {
    ...clone(step),
    inputBindings: [{ sourceStepKey: "a4-configure", sourceRevision: 3 }],
  };
  h.store.execution.value = {
    appliedToRevision: 1,
    inputRevision: 1,
    sourceRevisions: { "a4-configure": 1 },
    appliedSourceRevisions: { "a4-configure": 3 },
  };
  assert.equal(h.store.resultStale.value, false);
  h.store.step.value.inputBindings[0].sourceRevision = 4;
  assert.equal(h.store.resultStale.value, true);
  h.store.clear();
});
test("P3 formal evaluation sends no A4 config and initializes an empty A5 response first", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value = {
    ...clone(step),
    stepKey: "a5-evaluate",
    revision: 0,
    definition: {
      ...definition,
      stepKey: "a5-evaluate",
      operationKey: "ai-evaluate",
      inputSchema: { properties: {} },
    },
  };
  h.store.selectedStep.value = "a5-evaluate";
  h.store.answer.value = {};
  h.setApi(async (path, options) =>
    options.method === "PUT"
      ? { revision: 1, runRevision: 2, invalidatedStepKeys: [] }
      : path.endsWith("/executions")
        ? { executionId: "result", status: "SUCCEEDED", appliedToRevision: 1 }
        : clone(run),
  );
  await h.store.executePreview();
  const call = h.calls.find((value) => value.path.endsWith("/executions"));
  assert.ok(call);
  assert.deepEqual(JSON.parse(JSON.stringify(call.options.body)), {
    operationKey: "ai-evaluate",
    inputRevision: 1,
    parameters: {},
  });
  h.store.clear();
});
test("P3 incomplete nested answer stays local and is not autosaved as invalid or blank input", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value.definition.inputSchema = {
    properties: {
      patterns: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1 } },
        },
      },
    },
  };
  h.store.edit({ patterns: [{ reason: "one" }, {}] });
  assert.equal(await h.store.flush(), false);
  assert.equal(
    h.calls.filter((value) => value.options.method === "PUT").length,
    0,
  );
  assert.equal(h.store.dirty.value, true);
  assert.ok(h.drafts.length);
  h.store.clear();
});
test("P3 follow-up cannot attach to a locally edited reflection before its autosave revision changes", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.run.value.status = "TASK_COMPLETED";
  h.store.selectedStep.value = "reflection";
  h.store.reflection.value = {
    revision: 1,
    readOnly: false,
    definition: {
      inputSchema: {
        properties: { reflectionNote: { type: "string", minLength: 0 } },
      },
    },
    followUp: null,
  };
  h.store.answer.value = { reflectionNote: "original" };
  const reply = deferred();
  h.setApi(() => reply.promise);
  const pending = h.store.requestFollowUp();
  await settle();
  h.store.edit({ reflectionNote: "new local reflection" });
  reply.resolve({
    status: "SUCCEEDED",
    response: { question: "stale question" },
  });
  await pending;
  assert.equal(h.store.reflection.value.revision, 1);
  assert.equal(h.store.reflection.value.followUp, null);
  assert.equal(h.store.answer.value.reflectionNote, "new local reflection");
  h.store.clear();
});
test("P3 execution idempotency distinguishes changed A4 source even when A5 answer revision is unchanged", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value = {
    ...clone(step),
    stepKey: "a5-evaluate",
    revision: 2,
    definition: {
      ...definition,
      stepKey: "a5-evaluate",
      operationKey: "ai-evaluate",
    },
    inputBindings: [
      {
        parameterKey: "confidenceThreshold",
        sourceStepKey: "a4-configure",
        sourceRevision: 3,
        value: 0.4,
      },
      {
        parameterKey: "auxiliary",
        sourceStepKey: "a2-metrics",
        sourceRevision: 1,
        value: "test",
      },
    ],
  };
  h.store.selectedStep.value = "a5-evaluate";
  h.store.answer.value = {};
  h.setApi(async () => ({
    executionId: "result",
    status: "SUCCEEDED",
    appliedToRevision: 2,
  }));
  await h.store.executePreview();
  h.store.step.value.inputBindings[0] = {
    parameterKey: "confidenceThreshold",
    sourceStepKey: "a4-configure",
    sourceRevision: 4,
    value: 0.7,
  };
  await h.store.executePreview();
  h.store.step.value.inputBindings.reverse();
  await h.store.executePreview();
  const calls = h.calls.filter((value) => value.path.endsWith("/executions"));
  assert.equal(calls.length, 3);
  assert.notEqual(
    calls[0].options.key,
    calls[1].options.key,
    "a new saved A4 source is a new execution operation, not an old idempotent replay",
  );
  assert.equal(
    calls[1].options.key,
    calls[2].options.key,
    "retry of the same A5 response and source must keep its key",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls[0].options.body)),
    JSON.parse(JSON.stringify(calls[1].options.body)),
    "source identity is not a client configuration override",
  );
  h.store.clear();
});
test("P2 execution without cross-step sources retains a stable retry key and original HTTP body", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value.definition.operationKey = "demo-summary-v1";
  h.store.answer.value = { multiplier: 2, include: "ALL" };
  h.store.sample.value = {
    rows: [2, 5, 8, 11].map((value, index) => ({
      rowId: String(index),
      value,
    })),
  };
  h.setApi(async () => ({
    executionId: "result",
    status: "SUCCEEDED",
    appliedToRevision: 1,
  }));
  await h.store.executePreview();
  await h.store.executePreview();
  const calls = h.calls.filter((value) => value.path.endsWith("/executions"));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.key, calls[1].options.key);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), {
    operationKey: "demo-summary-v1",
    inputRevision: 1,
    parameters: { multiplier: 2, include: "ALL" },
    observedResult: { count: 4, sum: 52, mean: 13 },
  });
  h.store.clear();
});
test("restoring execution history prefers its current response/source binding, not newest or oldest creation order", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const current = {
    executionId: "applied",
    status: "SUCCEEDED",
    inputRevision: 1,
    appliedToRevision: 3,
    sourceRevisions: { "a4-configure": 1 },
    appliedSourceRevisions: { "a4-configure": 7 },
  };
  const stale = {
    executionId: "stale",
    status: "SUCCEEDED",
    inputRevision: 3,
    appliedToRevision: null,
    sourceRevisions: { "a4-configure": 6 },
    appliedSourceRevisions: null,
  };
  for (const history of [
    [current, stale],
    [stale, current],
  ]) {
    h.setApi(async () => ({
      ...clone(step),
      revision: 3,
      inputBindings: [{ sourceStepKey: "a4-configure", sourceRevision: 7 }],
      executions: history,
    }));
    await h.store.select("prepare");
    assert.equal(h.store.execution.value.executionId, "applied");
    assert.equal(h.store.resultStale.value, false);
  }
  h.store.clear();
});
test("P2 no-source legacy history still restores the applied current response", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.setApi(async () => ({
    ...clone(step),
    revision: 3,
    executions: [
      {
        executionId: "latest-stale",
        status: "SUCCEEDED",
        inputRevision: 2,
        appliedToRevision: null,
      },
      {
        executionId: "older-reused",
        status: "SUCCEEDED",
        inputRevision: 1,
        appliedToRevision: 3,
      },
    ],
  }));
  await h.store.select("prepare");
  assert.equal(h.store.execution.value.executionId, "older-reused");
  assert.equal(h.store.resultStale.value, false);
  h.store.clear();
});
test("unbound history fallback remains explicitly stale including unexpected extra source keys", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.setApi(async () => ({
    ...clone(step),
    revision: 3,
    inputBindings: [{ sourceStepKey: "a4-configure", sourceRevision: 7 }],
    executions: [
      {
        executionId: "newest-invalid",
        status: "SUCCEEDED",
        appliedToRevision: 3,
        appliedSourceRevisions: { "a4-configure": 7, "unexpected-source": 1 },
      },
      {
        executionId: "older-invalid",
        status: "SUCCEEDED",
        appliedToRevision: null,
        appliedSourceRevisions: null,
      },
    ],
  }));
  await h.store.select("prepare");
  assert.equal(h.store.execution.value.executionId, "newest-invalid");
  assert.equal(h.store.resultStale.value, true);
  h.store.clear();
});
test("a newly edited input cannot be mistaken for recovered draft while selecting a step", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const read = deferred();
  h.setDraftReader(async () => {
    await read.promise;
    const local = h.drafts.at(-1);
    return local ? { ...local, serverRevision: local.revision } : undefined;
  });
  const pending = h.store.select("prepare");
  await settle();
  assert.equal(h.store.selectionReady.value, false);
  assert.equal(h.store.readOnly.value, true);
  h.store.edit({ acknowledged: false });
  read.resolve();
  await pending;
  assert.equal(
    h.store.recovered.value,
    null,
    "a freshly created input must not turn into a recovered-draft gate and disable completion",
  );
  assert.equal(
    h.store.readOnly.value,
    false,
    "step must become editable when hydration completes",
  );
  h.store.clear();
});
test("a superseded draft hydration cannot unlock or recover into the next selected step", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const first = deferred(),
    second = deferred();
  let reads = 0;
  h.setDraftReader(() => (++reads === 1 ? first.promise : second.promise));
  h.setApi(async (path) => ({
    ...clone(step),
    stepKey: path.endsWith("observe") ? "observe" : "prepare",
  }));
  const old = h.store.select("prepare");
  await settle();
  const current = h.store.select("observe");
  await settle();
  first.resolve(undefined);
  await assert.rejects(old, (error) => error.code === "IDENTITY_CHANGED");
  assert.equal(h.store.selectionReady.value, false);
  second.resolve(undefined);
  await current;
  assert.equal(h.store.selectionReady.value, true);
  assert.equal(h.store.selectedStep.value, "observe");
  h.store.clear();
});
test("a Run poll issued on A5 does not make the loaded A4 read-only when its actual dependencies remain complete", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.store.step.value = {
    ...clone(step),
    stepKey: "a5-evaluate",
    definition: { ...definition, dependencies: ["a4-configure"] },
  };
  h.store.run.value.steps = [
    { stepKey: "a3-errors", status: "COMPLETED" },
    { stepKey: "a4-configure", status: "COMPLETED" },
  ];
  const poll = deferred();
  h.setApi(async (path) =>
    path.includes("/steps/")
      ? {
          ...clone(step),
          stepKey: "a4-configure",
          definition: { ...definition, dependencies: ["a3-errors"] },
        }
      : poll.promise,
  );
  const pending = h.store.checkState();
  await settle();
  await h.store.select("a4-configure");
  poll.resolve({
    ...clone(run),
    steps: [
      { stepKey: "a3-errors", status: "COMPLETED" },
      { stepKey: "a4-configure", status: "IN_PROGRESS" },
    ],
  });
  await pending;
  assert.equal(h.store.readOnly.value, false);
  assert.equal(h.store.conflict.value, false);
  h.store.clear();
});
test("a failed step hydration stays gated with an explicit error and can be retried", async () => {
  const h = harness();
  await h.store.load("owned-run");
  h.setApi(async () => {
    throw new Error("reviewed asset unavailable");
  });
  await h.store.select("prepare").catch(h.store.handle);
  assert.equal(h.store.selectionReady.value, false);
  assert.equal(h.store.readOnly.value, true);
  assert.equal(h.store.error.value, "reviewed asset unavailable");
  assert.equal(h.store.saveLabel.value, "步骤尚未就绪");
  h.setApi(async () => clone(step));
  await h.store.select("prepare");
  assert.equal(h.store.selectionReady.value, true);
  assert.equal(h.store.readOnly.value, false);
  assert.equal(h.store.error.value, "");
  h.store.clear();
});
test("P4 v3 sends source CAS including empty ancestry and uses saved own fields only for local preview", async () => {
  const h = harness();
  await h.store.load("owned-run");
  const digest = createHash("sha256").update("[]").digest("hex");
  h.store.manifest.value = {
    ...h.store.manifest.value,
    schemaVersion: "task-manifest-v3",
    assets: [
      {
        assetKey: "learner-activity",
        mediaType: "application/json",
        sha256: digest,
        byteLength: 2,
      },
    ],
    operations: [
      {
        operationKey: "ds-profile",
        ownResponseBindings: [
          {
            parameterKey: "distributionField",
            sourceField: "distributionField",
          },
        ],
      },
    ],
  };
  h.store.step.value = {
    ...h.store.step.value,
    definition: { ...definition, operationKey: "ds-profile" },
    response: {
      distributionField: "avg_session_minutes",
      sampleInterpretation: "not a compute parameter",
    },
    inputBindings: [
      {
        parameterKey: "duplicatePolicy",
        sourceStepKey: "d2-quality",
        sourceRevision: 3,
        value: "DROP_EXACT",
      },
      {
        parameterKey: "missingPolicy",
        sourceStepKey: "d2-quality",
        sourceRevision: 3,
        value: "KEEP_NULL",
      },
      {
        parameterKey: "extremePolicy",
        sourceStepKey: "d2-quality",
        sourceRevision: 3,
        value: "KEEP",
      },
    ],
  };
  const receipts = new Map();
  h.setApi(async (_path, options) => {
    if (!receipts.has(options.key))
      receipts.set(options.key, {
        executionId: "server-result",
        status: "SUCCEEDED",
        reused: receipts.size > 0,
        remainingEvaluations: 29,
        appliedToRevision: options.body.inputRevision,
      });
    return clone(receipts.get(options.key));
  });
  await h.store.executePreview();
  assert.equal(h.store.execution.value.reused, false);
  await h.store.executePreview();
  assert.equal(
    h.store.execution.value.reused,
    false,
    "same request receipt retains the first reused flag",
  );
  const calls = h.calls.filter((value) => value.path.endsWith("/executions"));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.key, calls[1].options.key);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), {
    operationKey: "ds-profile",
    inputRevision: 1,
    parameters: {},
    expectedSourceRevisions: { "d2-quality": 3 },
  });
  assert.deepEqual(h.dsCalls[0][2], {
    duplicatePolicy: "DROP_EXACT",
    missingPolicy: "KEEP_NULL",
    extremePolicy: "KEEP",
    distributionField: "avg_session_minutes",
  });
  h.store.step.value.revision = 2;
  h.store.step.value.response.sampleInterpretation =
    "updated explanation, same compute configuration";
  await h.store.executePreview();
  assert.notEqual(h.calls.at(-1).options.key, calls[0].options.key);
  assert.deepEqual(h.dsCalls.at(-1)[2], h.dsCalls[0][2]);
  assert.equal(h.store.execution.value.executionId, "server-result");
  assert.equal(
    h.store.execution.value.reused,
    true,
    "a new answer revision can receive a computation-cache reuse receipt",
  );
  assert.equal(h.store.execution.value.remainingEvaluations, 29);
  assert.equal(h.store.execution.value.appliedToRevision, 2);
  h.store.step.value.inputBindings = [];
  await h.store.executePreview();
  const last = h.calls.at(-1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(last.options.body.expectedSourceRevisions)),
    {},
  );
  assert.notEqual(last.options.key, calls[0].options.key);
  h.store.clear();
});
