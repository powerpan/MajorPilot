import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { calculateBa } from "../../shared/ba/ba-metrics-v1.mjs";
const source = readFileSync(
  new URL("../dist/ba-worker.js", import.meta.url),
  "utf8",
);
const bytes = readFileSync(
  new URL(
    "../../content/ba-learning/1.0.0/weekly-funnel.json",
    import.meta.url,
  ),
);
const rows = JSON.parse(bytes),
  datasetSha256 = createHash("sha256").update(bytes).digest("hex");
const parameters = {
  numerator: "completed_count",
  denominator: "enrolled_count",
  baselineStartWeek: 1,
  baselineEndWeek: 6,
  comparisonStartWeek: 7,
  comparisonEndWeek: 12,
};
function execute(payload) {
  let result;
  const self = { postMessage: (value) => (result = value) };
  new vm.Script(source).runInNewContext({ self, TextEncoder });
  self.onmessage({ data: payload });
  return JSON.parse(JSON.stringify(result));
}
test("BA isolated worker works without crypto, DOM, Node or network and equals all three pure operations", () => {
  for (const [operationKey, params] of [
    ["ba-metric", parameters],
    [
      "ba-funnel",
      Object.fromEntries(
        Object.entries(parameters).filter(([key]) => key.endsWith("Week")),
      ),
    ],
    [
      "ba-segments",
      {
        ...parameters,
        segmentBy: "course_track",
        focusTransitionKey: "ENROLLED_TO_FIRST_LESSON",
      },
    ],
  ]) {
    const value = execute({
      template: "ba-analysis-v1",
      operationKey,
      rows,
      parameters: params,
      datasetSha256,
    });
    assert.equal(value.status, "SUCCESS");
    assert.equal(value.engine, "ba-metrics-v1");
    assert.deepEqual(
      value.result,
      calculateBa(operationKey, rows, params, { datasetSha256 }),
    );
    assert.ok(JSON.stringify(value).length <= 102400);
  }
});
test("BA worker pin matches source-only bundle with no embedded business data/private assets or eval", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url)),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    manifest.baWorkerSha256,
  );
  assert.doesNotMatch(
    source,
    /canonical-events-private|golden-private|\bfetch\s*\(|\beval\s*\(|\bimport\s*\(|crypto\.subtle/,
  );
});
test("BA worker rejects arbitrary fields, code, invalid windows and damaged rows with safe errors", () => {
  const payload = {
    template: "ba-analysis-v1",
    operationKey: "ba-metric",
    rows,
    parameters,
    datasetSha256,
  };
  for (const next of [
    { ...payload, code: "throw 1" },
    { ...payload, parameters: { ...parameters, comparisonStartWeek: 5 } },
    { ...payload, rows: rows.slice(1) },
    { ...payload, datasetSha256: "not-a-hash" },
  ]) {
    const result = execute(next);
    assert.equal(result.status, "ERROR");
    assert.ok(
      ["BA_PARAMETERS_INVALID", "BA_DATA_INVALID"].includes(result.code),
    );
    assert.deepEqual(Object.keys(result).sort(), ["code", "engine", "status"]);
  }
});
