import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import ts from "typescript";

const filename = new URL(
  "../src/components/reports/ReportFeedback.vue",
  import.meta.url,
);
const text = readFileSync(filename, "utf8");
const descriptor = parse(text).descriptor;
const source = ts.transpileModule(
  compileScript(descriptor, { id: "report-feedback-test" }).content,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function harness({ storageFails = false } = {}) {
  let mounted,
    changed,
    resolve,
    epoch = 0;
  const pending = new Promise((yes) => {
      resolve = yes;
    }),
    calls = [];
  class ApiError extends Error {}
  const imports = {
    vue: {
      defineComponent: (value) => value,
      ref: (value) => ({ value }),
      computed: (get) => ({
        get value() {
          return get();
        },
      }),
      watch() {},
      onMounted: (action) => {
        mounted = action;
      },
      onBeforeUnmount() {},
    },
    "../../stores/auth": {
      useAuth: () => ({ me: { studentId: "owner" }, refresh: () => pending }),
      onIdentityChange: (action) => {
        changed = action;
        return () => {};
      },
      identityRequest: () => {
        const issued = epoch;
        return {
          signal: new AbortController().signal,
          finish() {},
          assertCurrent() {
            if (issued !== epoch) throw new Error("IDENTITY_CHANGED");
          },
        };
      },
    },
    "../../lib/api": {
      ApiError,
      errorText: (value) => value.message,
      stableOperation: () => () => "stable",
      api: async (...args) => {
        calls.push(args);
      },
    },
    "../../lib/feedback-drafts": {
      verifyFeedbackOwner() {
        if (storageFails) throw new Error("Storage unavailable");
      },
      readFeedbackDraft: () => "Owned prior comment",
      writeFeedbackDraft() {},
      removeFeedbackDraft() {},
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (id) => {
      if (!(id in imports))
        throw new Error(`Unexpected component import ${id}`);
      return imports[id];
    },
  });
  const state = module.exports.default.setup(
    { versionId: "owned-version" },
    { expose() {} },
  );
  return {
    state,
    calls,
    mount: () => mounted(),
    release: () => resolve(),
    identity: () => {
      epoch++;
      changed();
    },
  };
}
test("feedback waits for authenticated draft hydration before editing/submission", async () => {
  const h = harness(),
    pending = h.mount();
  assert.equal(h.state.hydrating.value, true);
  assert.match(
    descriptor.template.content,
    /<textarea[\s\S]*?:disabled="busy \|\| hydrating"/,
  );
  h.state.comment.value = "Cannot submit during hydration";
  await h.state.submit();
  assert.equal(h.calls.length, 0);
  h.release();
  await pending;
  assert.equal(h.state.hydrating.value, false);
  assert.equal(h.state.comment.value, "Owned prior comment");
});
test("storage failure unlocks core optional feedback without exposing a prior draft", async () => {
  const h = harness({ storageFails: true }),
    pending = h.mount();
  h.release();
  await pending;
  assert.equal(h.state.hydrating.value, false);
  assert.equal(h.state.comment.value, "");
  assert.equal(h.state.storageWarning.value, "Storage unavailable");
  h.state.comment.value = "Current optional feedback";
  await h.state.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].body.contextPublicId, "owned-version");
});
test("identity clearing fences a delayed draft hydration and its failure notice", async () => {
  const h = harness(),
    pending = h.mount();
  h.identity();
  h.release();
  await pending;
  assert.equal(h.state.comment.value, "");
  assert.equal(h.state.ready.value, false);
  assert.equal(h.state.storageWarning.value, "");
});
test("formal introduction uses the actual public catalog, not a nonexistent private alias", () => {
  const source = readFileSync(
    new URL("../src/views/FormalIntroductionView.vue", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /request<MajorDifference\[\]>\("\/api\/public\/v1\/majors"\)/,
  );
  assert.doesNotMatch(source, /\/api\/app\/v1\/majors/);
});
