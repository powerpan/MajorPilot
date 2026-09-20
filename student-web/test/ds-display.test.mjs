import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/ds-display.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exports = {};
vm.runInNewContext(source, { exports, Intl, Number, Error });
test("changing DS mode removes inactive fields while retaining student observation", () => {
  const scatter = exports.changeRelationshipMode(
    {
      relationshipMode: "GROUP_COMPLETION",
      groupBy: "device_group",
      observation: "kept",
    },
    "SCATTER",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(scatter)), {
    relationshipMode: "SCATTER",
    observation: "kept",
  });
  const group = exports.changeRelationshipMode(
    {
      relationshipMode: "SCATTER",
      xField: "a",
      yField: "b",
      observation: "kept",
    },
    "GROUP_COMPLETION",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(group)), {
    relationshipMode: "GROUP_COMPLETION",
    observation: "kept",
  });
});
test("numeric labels include units, null is not zero, scales include domain endpoints", () => {
  assert.equal(exports.numberText(null), "无可计算值");
  assert.equal(exports.numberText(0), "0");
  assert.equal(exports.percentText(null), "无可计算值");
  assert.equal(exports.percentText(0), "0%");
  for (const key of [
    "avg_session_minutes",
    "days_to_first_lesson",
    "assignment_submit_rate",
  ]) {
    const domain = exports.numericDomain(key);
    assert.equal(exports.linearPosition(0, domain, [62, 700]), 62);
    assert.equal(exports.linearPosition(domain[1], domain, [62, 700]), 700);
  }
  assert.throws(
    () => exports.linearPosition(NaN, [0, 1], [0, 100]),
    /INVALID_CHART_COORDINATE/,
  );
});
