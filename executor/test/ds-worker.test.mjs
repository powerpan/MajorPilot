import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { calculateDs } from "../../shared/ds/ds-stats-v1.mjs";
import { createDsDigestHandler, digestUtf8 } from "../ds-digest.mjs";
const source = readFileSync(
  new URL("../dist/ds-worker.js", import.meta.url),
  "utf8",
);
const rows = JSON.parse(
  readFileSync(
    new URL(
      "../../content/ds-learning/1.0.0/learner-activity.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const datasetSha256 = createHash("sha256")
  .update(
    readFileSync(
      new URL(
        "../../content/ds-learning/1.0.0/learner-activity.json",
        import.meta.url,
      ),
    ),
  )
  .digest("hex");
async function execute(data) {
  let result;
  let hashRequest;
  const self = {
    postMessage: (value) => {
      if (value.type === "MP_DS_HASH_REQUEST") hashRequest = value;
      else result = value;
    },
  };
  new vm.Script(source).runInContext(
    // Mirrors the actual opaque Blob Worker: no crypto.subtle is available.
    vm.createContext({ self, TextEncoder }),
  );
  self.onmessage({ data });
  if (hashRequest)
    await createDsDigestHandler({
      worker: { postMessage: (reply) => self.onmessage({ data: reply }) },
      operationKey: data.operationKey,
      parameters: data.parameters,
      isActive: () => true,
      onFailure: (error) => {
        result = error;
      },
      subtle: webcrypto.subtle,
    })(hashRequest);
  return JSON.parse(JSON.stringify(result));
}
const parameters = {
  duplicatePolicy: "DROP_EXACT",
  missingPolicy: "KEEP_NULL",
  extremePolicy: "KEEP",
};
const input = (operationKey = "ds-quality-clean", extra = {}) => ({
  template: "ds-analysis-v1",
  operationKey,
  parameters: { ...parameters, ...extra },
  rows,
  datasetSha256,
});
test("DS bundle is deterministic, hash pinned and contains no learner assets, network or arbitrary source execution", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    manifest.dsWorkerSha256,
  );
  assert.doesNotMatch(
    source,
    /canonical-events-private|golden-private|learner-001|\beval\s*\(|\bfetch\s*\(|\bimport\s*\(/,
  );
});
test("opaque DS worker without WebCrypto agrees with reviewed algorithm for quality/profile/both relationships/both stratifications", async () => {
  for (const data of [
    input(),
    input("ds-profile", { distributionField: "avg_session_minutes" }),
    input("ds-relationship", {
      relationshipMode: "GROUP_COMPLETION",
      groupBy: "device_group",
    }),
    input("ds-relationship", {
      relationshipMode: "SCATTER",
      xField: "days_to_first_lesson",
      yField: "assignment_submit_rate",
    }),
    input("ds-stratify", {
      relationshipMode: "GROUP_COMPLETION",
      groupBy: "device_group",
      stratifyBy: "cohort_period",
    }),
    input("ds-stratify", {
      relationshipMode: "SCATTER",
      xField: "days_to_first_lesson",
      yField: "assignment_submit_rate",
      stratifyBy: "course_track",
    }),
  ]) {
    const value = await execute(data);
    assert.equal(value.status, "SUCCESS");
    assert.equal(value.engine, "ds-stats-v1");
    assert.deepEqual(
      value.result,
      await calculateDs(data.operationKey, rows, data.parameters, {
        datasetSha256,
      }),
    );
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 102400);
  }
});
test("DS worker preserves zero/null and rejects inactive branch, oversized rows, unknown fields or injected source", async () => {
  for (const data of [
    { ...input(), code: "fetch(1)" },
    { ...input(), rows: [...rows, rows[0]] },
    { ...input(), datasetSha256: "file:///etc/passwd" },
    input("ds-relationship", {
      relationshipMode: "SCATTER",
      xField: "days_to_first_lesson",
      yField: "assignment_submit_rate",
      groupBy: "device_group",
    }),
    input("ds-relationship", {
      relationshipMode: "SCATTER",
      xField: "days_to_first_lesson",
      yField: "days_to_first_lesson",
    }),
  ])
    assert.equal((await execute(data)).status, "ERROR");
  const empty = await execute({
    ...input("ds-profile", { distributionField: "avg_session_minutes" }),
    rows: [],
  });
  assert.equal(empty.result.profile.mean, null);
  assert.equal(empty.result.profile.completion.completionRate, null);
  assert.deepEqual(
    empty.result.profile.histogram.map((value) => value.count),
    [0, 0, 0, 0, 0],
  );
});

test("trusted digest uses standard SHA-256 UTF-8 vectors", async () => {
  assert.equal(
    await digestUtf8("", webcrypto.subtle),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    await digestUtf8("abc", webcrypto.subtle),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await digestUtf8("清洗规则", webcrypto.subtle),
    createHash("sha256").update("清洗规则", "utf8").digest("hex"),
  );
});

const digestMessage = () => ({
  type: "MP_DS_HASH_REQUEST",
  operationKey: "ds-quality-clean",
  canonicalCleaning: JSON.stringify({
    duplicatePolicy: "DROP_EXACT",
    extremePolicy: "KEEP",
    missingPolicy: "KEEP_NULL",
  }),
});
test("digest bridge validates exact fields, canonical cleaning input and operation association", async () => {
  for (const message of [
    { ...digestMessage(), extra: 1 },
    { ...digestMessage(), type: "MP_EXECUTE" },
    { ...digestMessage(), operationKey: "ds-profile" },
    { ...digestMessage(), canonicalCleaning: "x".repeat(161) },
    {
      ...digestMessage(),
      canonicalCleaning: JSON.stringify({
        duplicatePolicy: "KEEP",
        extremePolicy: "KEEP",
        missingPolicy: "KEEP_NULL",
      }),
    },
    {
      ...digestMessage(),
      canonicalCleaning:
        '{"missingPolicy":"KEEP_NULL","duplicatePolicy":"DROP_EXACT","extremePolicy":"KEEP"}',
    },
    {
      ...digestMessage(),
      canonicalCleaning:
        '{"duplicatePolicy":"DROP_EXACT","extremePolicy":"KEEP","missingPolicy":"KEEP_NULL","digest":"injected"}',
    },
  ]) {
    const replies = [],
      failures = [];
    await createDsDigestHandler({
      worker: { postMessage: (value) => replies.push(value) },
      operationKey: "ds-quality-clean",
      parameters,
      isActive: () => true,
      onFailure: (value) => failures.push(value),
      subtle: webcrypto.subtle,
    })(message);
    assert.equal(replies.length, 0);
    assert.equal(failures[0]?.code, "DS_DIGEST_FAILURE");
  }
  const replies = [],
    failures = [];
  const handle = createDsDigestHandler({
    worker: { postMessage: (value) => replies.push(value) },
    operationKey: "ds-quality-clean",
    parameters,
    isActive: () => true,
    onFailure: (value) => failures.push(value),
    subtle: webcrypto.subtle,
  });
  await handle(digestMessage());
  assert.equal(
    replies[0].cleaningConfigSha256,
    createHash("sha256")
      .update(digestMessage().canonicalCleaning)
      .digest("hex"),
  );
  await handle(digestMessage());
  assert.equal(replies.length, 1);
  assert.equal(failures[0]?.code, "DS_DIGEST_FAILURE");
});

test("cancelled digest never reaches the old or replacement Worker, even after late resolution", async () => {
  let active = true,
    resolveDigest;
  const oldReplies = [],
    replacementReplies = [],
    failures = [];
  let currentWorker = { postMessage: (value) => oldReplies.push(value) };
  const handle = createDsDigestHandler({
    worker: currentWorker,
    operationKey: "ds-quality-clean",
    parameters,
    isActive: () => active,
    onFailure: (value) => failures.push(value),
    subtle: {
      digest: () =>
        new Promise((resolve) => {
          resolveDigest = resolve;
        }),
    },
  });
  const pending = handle(digestMessage());
  active = false;
  currentWorker = { postMessage: (value) => replacementReplies.push(value) };
  resolveDigest(new Uint8Array(32).buffer);
  await pending;
  assert.equal(oldReplies.length, 0);
  assert.equal(replacementReplies.length, 0);
  assert.equal(failures.length, 0);
});
