import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { reactive } from "vue";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/execution.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function harness() {
  let listener,
    removed = false,
    sent;
  const frame = {
    sandbox: { add() {} },
    contentWindow: {
      postMessage(value) {
        sent = structuredClone(value);
        queueMicrotask(() =>
          listener({
            source: frame.contentWindow,
            origin: "null",
            data: {
              type: "MP_EXECUTOR_RESULT",
              nonce: sent.nonce,
              result: {
                status: "SUCCESS",
                engine: "ds-stats-v1",
                result: { ok: true },
              },
            },
          }),
        );
      },
    },
    remove() {
      removed = true;
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    TextEncoder,
    crypto: webcrypto,
    performance,
    setTimeout,
    clearTimeout,
    document: { createElement: () => frame, body: { appendChild() {} } },
    window: {
      addEventListener: (_, next) => {
        listener = next;
      },
      removeEventListener: () => {},
    },
  });
  return {
    api: exports,
    ready: () =>
      listener({
        source: frame.contentWindow,
        origin: "null",
        data: { type: "MP_EXECUTOR_READY", nonce: frame.src.split("#")[1] },
      }),
    get sent() {
      return sent;
    },
    get removed() {
      return removed;
    },
  };
}
test("actual execution transport converts Vue reactive rows and parameters to cloneable message values", async () => {
  const h = harness(),
    controller = new AbortController(),
    rows = reactive([{ value: 0, nullable: null }]),
    params = reactive({ duplicatePolicy: "KEEP" });
  const pending = h.api.executeDs(
    "ds-quality-clean",
    rows,
    params,
    "a".repeat(64),
    controller.signal,
  );
  try {
    assert.doesNotThrow(
      () => h.ready(),
      "postMessage structured-clone must accept a Vue reactive asset",
    );
    const result = await pending;
    assert.equal(result.status, "SUCCESS");
    assert.deepEqual(h.sent.rows, [{ value: 0, nullable: null }]);
    assert.equal(h.removed, true);
  } finally {
    controller.abort();
    await pending.catch(() => undefined);
  }
});
test("execution message is a snapshot, not a later mutation of current editor state", async () => {
  const h = harness(),
    controller = new AbortController(),
    rows = [{ value: 1 }];
  const pending = h.api.executeDs(
    "ds-quality-clean",
    rows,
    {},
    "a".repeat(64),
    controller.signal,
  );
  try {
    rows[0].value = 99;
    h.ready();
    await pending;
    assert.equal(h.sent.rows[0].value, 1);
  } finally {
    controller.abort();
    await pending.catch(() => undefined);
  }
});
