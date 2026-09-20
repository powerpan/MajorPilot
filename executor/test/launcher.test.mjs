import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { webcrypto, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "../server.mjs";

// Exercise the exact CSP-pinned launcher script returned by the real HTTP handler,
// without opening a port or registering a student. Worker contexts lack WebCrypto.
async function launch(payload) {
  let html;
  const server = createServer();
  server.listeners("request")[0](
    { headers: { host: "127.0.0.1:15175" }, method: "GET", url: "/" },
    {
      setHeader() {},
      writeHead() {},
      end(value) {
        html = value;
      },
    },
  );
  const source = html
    .match(/<script>([\s\S]*)<\/script>/)[1]
    .replaceAll("<\\/script", "</script");
  let receive;
  let resolveResult;
  const result = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const blobs = new Map();
  const parent = {
    postMessage(value) {
      if (value.type === "MP_EXECUTOR_RESULT") resolveResult(value.result);
    },
  };
  class FakeWorker {
    constructor(url) {
      this.stopped = false;
      this.self = {
        postMessage: (data) =>
          queueMicrotask(() => {
            if (!this.stopped) this.onmessage({ data });
          }),
      };
      new vm.Script(blobs.get(url).source).runInContext(
        vm.createContext({ self: this.self, TextEncoder, setTimeout }),
      );
    }
    postMessage(data) {
      if (!this.stopped) this.self.onmessage({ data: structuredClone(data) });
    }
    terminate() {
      this.stopped = true;
    }
  }
  new vm.Script(source).runInContext(
    vm.createContext({
      location: { hash: "#probe-nonce" },
      parent,
      crypto: webcrypto,
      TextEncoder,
      Uint8Array,
      setTimeout,
      clearTimeout,
      Blob: class {
        constructor(parts) {
          this.source = parts.join("");
        }
      },
      URL: {
        createObjectURL(blob) {
          const id = `blob:${blobs.size}`;
          blobs.set(id, blob);
          return id;
        },
        revokeObjectURL(id) {
          blobs.delete(id);
        },
      },
      Worker: FakeWorker,
      addEventListener(type, handler) {
        if (type === "message") receive = handler;
      },
    }),
  );
  await receive({
    source: parent,
    origin: "http://localhost:15173",
    data: { type: "MP_EXECUTE", nonce: "probe-nonce", ...payload },
  });
  return JSON.parse(JSON.stringify(await result));
}

test("actual launcher preserves P2 and AI execution while routing DS's private digest handshake", async () => {
  assert.deepEqual(
    (
      await launch({
        template: "demo-summary-v1",
        values: [2, 5, 8, 11],
        parameters: { multiplier: 2, include: "ALL" },
      })
    ).result,
    { count: 4, sum: 52, mean: 13, multiplier: 2, include: "ALL" },
  );
  const model = JSON.parse(
    readFileSync(
      new URL(
        "../../content/ai-support/1.0.0/classifier-model.json",
        import.meta.url,
      ),
    ),
  );
  const samples = JSON.parse(
    readFileSync(
      new URL(
        "../../content/ai-support/1.0.0/practice-public.json",
        import.meta.url,
      ),
    ),
  );
  const ai = await launch({
    template: "classifier-practice-v1",
    model,
    config: model.baselineConfig,
    samples,
  });
  assert.equal(ai.status, "SUCCESS");
  assert.equal(ai.engine, "classifier-v1");
  const bytes = readFileSync(
    new URL(
      "../../content/ds-learning/1.0.0/learner-activity.json",
      import.meta.url,
    ),
  );
  const ds = await launch({
    template: "ds-analysis-v1",
    operationKey: "ds-quality-clean",
    rows: JSON.parse(bytes),
    datasetSha256: createHash("sha256").update(bytes).digest("hex"),
    parameters: {
      duplicatePolicy: "DROP_EXACT",
      extremePolicy: "KEEP",
      missingPolicy: "KEEP_NULL",
    },
  });
  assert.equal(ds.status, "SUCCESS");
  assert.equal(ds.engine, "ds-stats-v1");
  assert.equal(ds.result.retainedRows, 359);
});

test("actual launcher does not accept an externally supplied cleaning digest", async () => {
  const value = await launch({
    template: "ds-analysis-v1",
    operationKey: "ds-quality-clean",
    rows: [],
    datasetSha256: "a".repeat(64),
    parameters: {
      duplicatePolicy: "KEEP",
      extremePolicy: "KEEP",
      missingPolicy: "KEEP_NULL",
    },
    cleaningConfigSha256: "b".repeat(64),
  });
  assert.equal(value.status, "ERROR");
  assert.equal(value.code, "INVALID_MESSAGE");
});
