import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/ba-display.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const display = {};
vm.runInNewContext(source, { exports: display, Intl, Number, Error });
test("BA three formatters distinguish fractions, already-scaled percentage points and support event rates", () => {
  assert.equal(display.rateText(-0.41676), "-41.68%");
  assert.equal(display.ppText(-23.153321), "-23.15 个百分点");
  assert.equal(display.supportText(150.27933), "150.28 次/100人");
  for (const fn of ["rateText", "ppText", "supportText"])
    assert.equal(display[fn](null), "不可计算");
  assert.equal(display.rateText(0), "0%");
  assert.equal(display.supportText(0), "0 次/100人");
});
test("BA dimension switch clears old selected group, preserves explanation, and never mutates source", () => {
  const input = {
    segmentBy: "course_track",
    prioritySegmentKey: "APPLIED",
    priorityReason: "my reasoning",
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(display.changeSegment(input, "signup_source"))),
    { segmentBy: "signup_source", priorityReason: "my reasoning" },
  );
  assert.equal(input.prioritySegmentKey, "APPLIED");
});
test("B3 sorting is view-only, null-last with fixed stage-order ties rather than a secondary metric", () => {
  const transitions = [
    "ENROLLED_TO_FIRST_LESSON",
    "FIRST_LESSON_TO_WEEK_ONE_ACTIVE",
    "WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED",
    "ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED",
    "ASSIGNMENT_SUBMITTED_TO_COMPLETED",
  ];
  const values = transitions
    .map((transitionKey, i) => ({
      transitionKey,
      comparison: { lossCount: [4, 4, 2, 2, 0][i] },
      deltaPercentagePoints: [3, -9, -2, -2, null][i],
    }))
    .reverse();
  assert.deepEqual(
    Array.from(display.sortTransitions(values, "LOSS"), (v) => v.transitionKey),
    transitions,
  );
  assert.deepEqual(
    Array.from(
      display.sortTransitions(values, "DELTA"),
      (v) => v.transitionKey,
    ),
    [
      transitions[1],
      transitions[2],
      transitions[3],
      transitions[0],
      transitions[4],
    ],
  );
  assert.equal(values[0].transitionKey, transitions[4]);
});
const context = {
  parameters: { denominator: "enrolled_count" },
  prioritySegmentKey: "APPLIED",
  comparison: {
    stageCounts: {
      enrolled_count: 3,
      first_lesson_count: 2,
      week_one_active_count: 1,
      assignment_started_count: 1,
      assignment_submitted_count: 1,
      completed_count: 1,
    },
    supportContactCount: 6,
    supportContactsPer100Enrolled: 200,
  },
};
const input = {
  targetSegmentKey: "APPLIED",
  successMetric: "COMPLETION_RATE",
  targetChangePercentagePoints: 0.5,
  guardrailMetric: "SUPPORT_CONTACTS_PER_100_ENROLLED",
  guardrailMaximum: 0,
  reviewAfterDays: 42,
};
test("B6 uses actual selected group counts, not rounded rate; allows fractional PP, strict guardrail and 42-day review", () => {
  assert.equal(display.actionIssue(input, context), "");
  assert.equal(display.actionBaseline(context, "COMPLETION_RATE").rate, 1 / 3);
  assert.match(
    display.actionIssue(
      { ...input, targetChangePercentagePoints: 66.666667 },
      context,
    ),
    /不得超过100/,
  );
  assert.equal(
    display.actionIssue(
      { ...input, targetChangePercentagePoints: 66.666666 },
      context,
    ),
    "",
  );
  assert.match(
    display.actionIssue({ ...input, targetChangePercentagePoints: 0 }, context),
    /大于0/,
  );
  assert.match(
    display.actionIssue({ ...input, reviewAfterDays: 7 }, context),
    /28或42/,
  );
  assert.match(
    display.actionIssue({ ...input, targetSegmentKey: "FOUNDATIONS" }, context),
    /当前 B4/,
  );
});
test("B6 distinguishes a genuine zero numerator from absent denominator and restricts conditional completion", () => {
  const zero = structuredClone(context);
  zero.comparison.stageCounts.completed_count = 0;
  assert.equal(display.actionBaseline(zero, "COMPLETION_RATE").rate, 0);
  assert.equal(display.actionIssue(input, zero), "");
  assert.equal(
    display.actionBaseline(context, "STARTER_COMPLETION_RATE"),
    null,
  );
  assert.match(
    display.actionIssue(
      { ...input, successMetric: "STARTER_COMPLETION_RATE" },
      context,
    ),
    /尚无可计算基线/,
  );
  const conditional = structuredClone(context);
  conditional.parameters.denominator = "first_lesson_count";
  assert.equal(
    display.actionBaseline(conditional, "STARTER_COMPLETION_RATE").rate,
    0.5,
  );
  zero.comparison.stageCounts.enrolled_count = 0;
  assert.equal(display.actionBaseline(zero, "COMPLETION_RATE"), null);
  assert.match(display.actionIssue(input, zero), /尚无可计算基线/);
});
