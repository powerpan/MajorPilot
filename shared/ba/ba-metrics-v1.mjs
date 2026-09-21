// Fixed ba-metrics-v1. Pure, synchronous and usable in a network-isolated Worker.
export const STAGES = Object.freeze(['enrolled_count', 'first_lesson_count', 'week_one_active_count', 'assignment_started_count', 'assignment_submitted_count', 'completed_count']);
export const TRANSITIONS = Object.freeze(['ENROLLED_TO_FIRST_LESSON', 'FIRST_LESSON_TO_WEEK_ONE_ACTIVE', 'WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED', 'ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED', 'ASSIGNMENT_SUBMITTED_TO_COMPLETED']);
export const GROUPS = Object.freeze({ course_track: Object.freeze(['FOUNDATIONS', 'APPLIED']), signup_source: Object.freeze(['ORGANIC', 'PARTNER', 'CAMPAIGN']) });
export const WINDOW_KEYS = Object.freeze(['baselineStartWeek', 'baselineEndWeek', 'comparisonStartWeek', 'comparisonEndWeek']);
export const SUCCESS_METRICS = Object.freeze(['COMPLETION_RATE', 'FIRST_LESSON_RATE', 'WEEK_ONE_ACTIVE_RATE', 'ASSIGNMENT_SUBMISSION_RATE', 'STARTER_COMPLETION_RATE']);
const OPERATIONS = ['ba-metric', 'ba-funnel', 'ba-segments'];
const COUNTS = [...STAGES, 'support_contact_count'];
const ROW_KEYS = ['week', 'course_track', 'signup_source', ...COUNTS];
const OBSERVATION = Object.freeze({ windowDays: 28, cohortBasis: 'ENROLLMENT_WEEK', weekOneActiveBasis: 'FIRST_LESSON_7_DAYS_WITHIN_28_DAY_WINDOW' });
function requireValue(valid, code) { if (!valid) throw Object.assign(new Error(code), { code }); }
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keysEqual = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const safeCount = n => Number.isSafeInteger(n) && n >= 0;
function validCounts(row) { return COUNTS.every(k => safeCount(row[k])) && STAGES.every((k, i) => i === 0 || row[k] <= row[STAGES[i - 1]]) && (row.enrolled_count > 0 || row.support_contact_count === 0); }

export function validateRows(rows) {
  const code = 'BA_DATA_INVALID'; requireValue(Array.isArray(rows) && rows.length === 72, code);
  const seen = new Set(), totals = Object.fromEntries(COUNTS.map(k => [k, 0]));
  for (const row of rows) {
    requireValue(keysEqual(row, ROW_KEYS) && Number.isInteger(row.week) && row.week >= 1 && row.week <= 12 && GROUPS.course_track.includes(row.course_track) && GROUPS.signup_source.includes(row.signup_source) && validCounts(row), code);
    const key = `${row.week}:${row.course_track}:${row.signup_source}`; requireValue(!seen.has(key), code); seen.add(key);
    for (const k of COUNTS) { totals[k] += row[k]; requireValue(safeCount(totals[k]), code); }
  }
}

export function normalizeParameters(operation, raw) {
  const code = 'BA_PARAMETERS_INVALID'; requireValue(OPERATIONS.includes(operation), code);
  const keys = [...WINDOW_KEYS, ...(operation === 'ba-funnel' ? [] : ['numerator', 'denominator']), ...(operation === 'ba-segments' ? ['focusTransitionKey', 'segmentBy'] : [])];
  requireValue(keysEqual(raw, keys), code);
  for (const k of WINDOW_KEYS) requireValue(Number.isInteger(raw[k]) && raw[k] >= 1 && raw[k] <= 12, code);
  requireValue(raw.baselineStartWeek <= raw.baselineEndWeek && raw.comparisonStartWeek <= raw.comparisonEndWeek && raw.baselineEndWeek < raw.comparisonStartWeek && raw.baselineEndWeek - raw.baselineStartWeek === raw.comparisonEndWeek - raw.comparisonStartWeek, code);
  if (operation !== 'ba-funnel') requireValue(raw.numerator === 'completed_count' && ['enrolled_count', 'first_lesson_count'].includes(raw.denominator), code);
  if (operation === 'ba-segments') requireValue(Object.hasOwn(GROUPS, raw.segmentBy) && TRANSITIONS.includes(raw.focusTransitionKey), code);
  return Object.fromEntries(keys.sort().map(k => [k, raw[k]]));
}

// Exact integer rational arithmetic, including ties away from zero. Round only final outputs.
function roundRatio(n, d, scale = 1n) {
  if (d === 0n) return null;
  let top = n * scale, sign = top < 0n ? -1 : 1; if (top < 0n) top = -top;
  const scaled = top * 1000000n, units = scaled / d + (scaled % d * 2n >= d ? 1n : 0n);
  return units === 0n ? 0 : sign * Number(units) / 1000000;
}
const ratio = (n, d, scale = 1n) => roundRatio(BigInt(n), BigInt(d), scale);
const delta = (bn, bd, cn, cd) => !bd || !cd ? null : roundRatio(BigInt(cn) * BigInt(bd) - BigInt(bn) * BigInt(cd), BigInt(cd) * BigInt(bd), 100n);
const relative = (bn, bd, cn, cd) => !bn || !bd || !cd ? null : roundRatio(BigInt(cn) * BigInt(bd) - BigInt(bn) * BigInt(cd), BigInt(bn) * BigInt(cd));
function aggregate(rows, start, end, field, value) {
  const result = Object.fromEntries(COUNTS.map(k => [k, 0]));
  for (const row of rows) if (row.week >= start && row.week <= end && (!field || row[field] === value)) for (const k of COUNTS) result[k] += row[k];
  return result;
}
const metric = (row, denominator) => ({ numeratorCount: row.completed_count, denominatorCount: row[denominator], rate: ratio(row.completed_count, row[denominator]) });
function transition(row, index) { const n = row[STAGES[index + 1]], d = row[STAGES[index]]; return { numeratorCount: n, denominatorCount: d, conversionRate: ratio(n, d), lossCount: d - n }; }
export function calculateBa(operation, rows, raw, metadata) {
  const p = normalizeParameters(operation, raw); validateRows(rows);
  requireValue(keysEqual(metadata, ['datasetSha256']) && typeof metadata.datasetSha256 === 'string' && /^[a-f0-9]{64}$/.test(metadata.datasetSha256), 'BA_DATA_INVALID');
  const b = aggregate(rows, p.baselineStartWeek, p.baselineEndWeek), c = aggregate(rows, p.comparisonStartWeek, p.comparisonEndWeek);
  const result = { schemaVersion: 'ba-result-v1', operationKey: operation, datasetSha256: metadata.datasetSha256, windows: { baseline: { startWeek: p.baselineStartWeek, endWeek: p.baselineEndWeek }, comparison: { startWeek: p.comparisonStartWeek, endWeek: p.comparisonEndWeek } }, observation: { ...OBSERVATION } };
  if (operation === 'ba-metric') return { ...result, numerator: p.numerator, denominator: p.denominator, baseline: metric(b, p.denominator), comparison: metric(c, p.denominator), deltaPercentagePoints: delta(b.completed_count, b[p.denominator], c.completed_count, c[p.denominator]), relativeChange: relative(b.completed_count, b[p.denominator], c.completed_count, c[p.denominator]), trend: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, ...metric(aggregate(rows, i + 1, i + 1), p.denominator) })) };
  if (operation === 'ba-funnel') return { ...result, stages: STAGES.map(stageKey => ({ stageKey, baseline: { count: b[stageKey], cumulativeRate: ratio(b[stageKey], b.enrolled_count) }, comparison: { count: c[stageKey], cumulativeRate: ratio(c[stageKey], c.enrolled_count) } })), transitions: TRANSITIONS.map((transitionKey, i) => ({ transitionKey, fromStageKey: STAGES[i], toStageKey: STAGES[i + 1], baseline: transition(b, i), comparison: transition(c, i), deltaPercentagePoints: delta(b[STAGES[i + 1]], b[STAGES[i]], c[STAGES[i + 1]], c[STAGES[i]]) })) };
  const index = TRANSITIONS.indexOf(p.focusTransitionKey);
  const period = (row, overall) => ({ stageCounts: Object.fromEntries(STAGES.map(k => [k, row[k]])), enrolledShare: ratio(row.enrolled_count, overall.enrolled_count), metric: metric(row, p.denominator), focusTransition: transition(row, index), supportContactCount: row.support_contact_count, supportContactsPer100Enrolled: ratio(row.support_contact_count, row.enrolled_count, 100n) });
  return { ...result, numerator: p.numerator, denominator: p.denominator, segmentBy: p.segmentBy, focusTransitionKey: p.focusTransitionKey, segments: GROUPS[p.segmentBy].map(segmentKey => {
    const groupB = aggregate(rows, p.baselineStartWeek, p.baselineEndWeek, p.segmentBy, segmentKey), groupC = aggregate(rows, p.comparisonStartWeek, p.comparisonEndWeek, p.segmentBy, segmentKey);
    return { segmentKey, baseline: period(groupB, b), comparison: period(groupC, c), metricDeltaPercentagePoints: delta(groupB.completed_count, groupB[p.denominator], groupC.completed_count, groupC[p.denominator]), transitionDeltaPercentagePoints: delta(groupB[STAGES[index + 1]], groupB[STAGES[index]], groupC[STAGES[index + 1]], groupC[STAGES[index]]) };
  }) };
}

function decimalRatio(value) {
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e'), parts = mantissa.split('.');
  let n = BigInt(parts.join('')), places = (parts[1]?.length ?? 0) - Number(exponent);
  return places >= 0 ? [n, 10n ** BigInt(places)] : [n * 10n ** BigInt(-places), 1n];
}
export function validateAction(input, context) {
  const code = 'BA_ACTION_INVALID';
  requireValue(keysEqual(input, ['targetSegmentKey', 'successMetric', 'targetChangePercentagePoints', 'guardrailMetric', 'guardrailMaximum', 'reviewAfterDays']) && keysEqual(context, ['parameters', 'prioritySegmentKey', 'result']), code);
  let p; try { p = normalizeParameters('ba-segments', context.parameters); } catch { requireValue(false, code); }
  requireValue(GROUPS[p.segmentBy].includes(context.prioritySegmentKey) && input.targetSegmentKey === context.prioritySegmentKey && SUCCESS_METRICS.includes(input.successMetric), code);
  requireValue(typeof input.targetChangePercentagePoints === 'number' && Number.isFinite(input.targetChangePercentagePoints) && input.targetChangePercentagePoints > 0 && input.targetChangePercentagePoints <= 100 && typeof input.guardrailMaximum === 'number' && Number.isFinite(input.guardrailMaximum) && input.guardrailMaximum >= 0 && input.guardrailMetric === 'SUPPORT_CONTACTS_PER_100_ENROLLED' && [28, 42].includes(input.reviewAfterDays), code);
  const r = context.result;
  requireValue(object(r) && r.schemaVersion === 'ba-result-v1' && r.operationKey === 'ba-segments' && r.numerator === p.numerator && r.denominator === p.denominator && r.segmentBy === p.segmentBy && r.focusTransitionKey === p.focusTransitionKey && r.windows?.baseline?.startWeek === p.baselineStartWeek && r.windows?.baseline?.endWeek === p.baselineEndWeek && r.windows?.comparison?.startWeek === p.comparisonStartWeek && r.windows?.comparison?.endWeek === p.comparisonEndWeek, code);
  requireValue(Array.isArray(r.segments) && r.segments.length === GROUPS[p.segmentBy].length && r.segments.every((s, i) => object(s) && s.segmentKey === GROUPS[p.segmentBy][i]), code);
  const comparison = r.segments.find(s => s.segmentKey === input.targetSegmentKey)?.comparison;
  requireValue(object(comparison) && keysEqual(comparison.stageCounts, STAGES) && validCounts({ ...comparison.stageCounts, support_contact_count: comparison.supportContactCount }), code);
  const counts = comparison.stageCounts, starter = input.successMetric === 'STARTER_COMPLETION_RATE';
  requireValue(!starter || p.denominator === 'first_lesson_count', code);
  const numerator = counts[{ COMPLETION_RATE: 'completed_count', FIRST_LESSON_RATE: 'first_lesson_count', WEEK_ONE_ACTIVE_RATE: 'week_one_active_count', ASSIGNMENT_SUBMISSION_RATE: 'assignment_submitted_count', STARTER_COMPLETION_RATE: 'completed_count' }[input.successMetric]], denominator = counts[starter ? 'first_lesson_count' : 'enrolled_count'];
  requireValue(denominator > 0 && counts.enrolled_count > 0, code);
  const [goal, scale] = decimalRatio(input.targetChangePercentagePoints);
  requireValue(BigInt(numerator) * 100n * scale + goal * BigInt(denominator) <= BigInt(denominator) * 100n * scale, code);
}
