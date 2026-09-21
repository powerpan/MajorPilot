import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/feedback-drafts.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function harness() {
  const data = new Map(),
    listeners = new Map(),
    exports = {};
  let now = 1000;
  const storage = {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  vm.runInNewContext(source, {
    exports,
    localStorage: storage,
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
    },
    Date: { now: () => now },
  });
  return {
    api: exports,
    data,
    advance: (value) => (now += value),
    identity: (reason) =>
      listeners.get("mp:identity-cleared")({ detail: { reason } }),
  };
}
test("feedback comments are account and report-version scoped; only comments are serialized", () => {
  const { api, data } = harness();
  assert.throws(() => api.readFeedbackDraft("A", "v1"));
  api.verifyFeedbackOwner("A");
  api.writeFeedbackDraft("A", "v1", "comment");
  assert.equal(api.readFeedbackDraft("A", "v1"), "comment");
  assert.equal(api.readFeedbackDraft("A", "v2"), "");
  assert.throws(() => api.readFeedbackDraft("B", "v1"));
  assert.deepEqual(Object.keys(JSON.parse([...data.values()][0])).sort(), [
    "comment",
    "expiresAt",
    "owner",
    "versionId",
  ]);
});
test("TTL is seven days and read does not extend it", () => {
  const { api, advance } = harness();
  api.verifyFeedbackOwner("A");
  api.writeFeedbackDraft("A", "v1", "saved");
  advance(api.FEEDBACK_TTL_MS - 1);
  assert.equal(api.readFeedbackDraft("A", "v1"), "saved");
  advance(2);
  assert.equal(api.readFeedbackDraft("A", "v1"), "");
});
test("logout purges only feedback namespace and identity lock prevents reads", () => {
  const { api, data, identity } = harness();
  data.set("other-project", "retained");
  api.verifyFeedbackOwner("A");
  api.writeFeedbackDraft("A", "v1", "saved");
  identity("SESSION_EXPIRED");
  assert.throws(() => api.readFeedbackDraft("A", "v1"));
  api.verifyFeedbackOwner("A");
  assert.equal(api.readFeedbackDraft("A", "v1"), "saved");
  identity("LOGOUT");
  assert.equal(data.size, 1);
  assert.equal(data.get("other-project"), "retained");
});
test("switching account removes old owner comments, and successful feedback removes only its version", () => {
  const { api } = harness();
  api.verifyFeedbackOwner("A");
  api.writeFeedbackDraft("A", "v1", "one");
  api.writeFeedbackDraft("A", "v2", "two");
  api.removeFeedbackDraft("A", "v1");
  assert.equal(api.readFeedbackDraft("A", "v2"), "two");
  api.verifyFeedbackOwner("B");
  api.verifyFeedbackOwner("A");
  assert.equal(api.readFeedbackDraft("A", "v2"), "");
});
test("limit counts code points and rejected edit does not destroy last valid comment", () => {
  const { api } = harness();
  api.verifyFeedbackOwner("A");
  api.writeFeedbackDraft("A", "v1", "😀".repeat(1000));
  assert.equal([...api.readFeedbackDraft("A", "v1")].length, 1000);
  assert.throws(() => api.writeFeedbackDraft("A", "v1", "a".repeat(1001)));
  assert.equal(api.readFeedbackDraft("A", "v1"), "😀".repeat(1000));
});
