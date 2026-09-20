// Pure browser-compatible deterministic statistics. No I/O, eval, runtime imports,
// random sampling, or mutable dataset state. SHA uses standard Web Crypto only.
export const NUMERIC_FIELDS = Object.freeze(['avg_session_minutes', 'days_to_first_lesson', 'assignment_submit_rate']);
export const GROUPS = Object.freeze({ course_track: ['FOUNDATIONS', 'APPLIED'], signup_source: ['ORGANIC', 'PARTNER', 'CAMPAIGN'], device_group: ['desktop', 'mobile', 'mixed'], cohort_period: ['EARLY', 'LATE'], days_to_first_lesson_band: ['SAME_DAY', 'DAYS_1_2', 'DAYS_3_6', 'DAYS_7_PLUS'] });
export const BINS = Object.freeze({ avg_session_minutes: [0, 10, 20, 40, 80, 240], days_to_first_lesson: [0, 1, 3, 7, 14, 28], assignment_submit_rate: [0, .25, .5, .75, 1] });
const CLEAN = ['duplicatePolicy', 'missingPolicy', 'extremePolicy'];
const RELATION = ['relationshipMode', 'groupBy', 'xField', 'yField'];
const ROW_KEYS = ['learner_id', 'cohort_week', 'course_track', 'signup_source', 'device_group', 'lessons_started', 'lessons_completed', 'assignment_submit_rate', 'avg_session_minutes', 'days_to_first_lesson', 'forum_visits', 'support_contacts', 'completed'];
const valid = condition => { if (!condition) throw new Error('DS_PARAMETERS_INVALID'); };
const own = (obj, key) => Object.hasOwn(obj, key);
export function normalizeParameters(operation, raw) {
  valid(raw !== null && typeof raw === 'object' && !Array.isArray(raw));
  valid(['ds-quality-clean', 'ds-profile', 'ds-relationship', 'ds-stratify'].includes(operation));
  const keys = [...CLEAN, ...(operation === 'ds-profile' ? ['distributionField'] : operation === 'ds-quality-clean' ? [] : RELATION), ...(operation === 'ds-stratify' ? ['stratifyBy'] : [])];
  valid(Object.keys(raw).every(k => keys.includes(k)));
  valid(['KEEP', 'DROP_EXACT'].includes(raw.duplicatePolicy)); valid(['KEEP_NULL', 'DROP_MISSING', 'MEDIAN_NUMERIC'].includes(raw.missingPolicy)); valid(['KEEP', 'CAP_P95'].includes(raw.extremePolicy));
  if (operation === 'ds-profile') valid(NUMERIC_FIELDS.includes(raw.distributionField));
  if (operation === 'ds-relationship' || operation === 'ds-stratify') {
    if (raw.relationshipMode === 'GROUP_COMPLETION') valid(own(GROUPS, raw.groupBy) && !own(raw, 'xField') && !own(raw, 'yField'));
    else { valid(raw.relationshipMode === 'SCATTER'); valid(NUMERIC_FIELDS.includes(raw.xField) && NUMERIC_FIELDS.includes(raw.yField) && raw.xField !== raw.yField && !own(raw, 'groupBy')); }
    if (operation === 'ds-stratify') valid(['course_track', 'cohort_period'].includes(raw.stratifyBy) && raw.stratifyBy !== raw.groupBy);
  }
  return Object.fromEntries(Object.keys(raw).sort().map(k => [k, raw[k]]));
}
export function validateRows(rows) {
  valid(Array.isArray(rows) && rows.length <= 360);
  for (const row of rows) {
    valid(row && Object.keys(row).length === ROW_KEYS.length && ROW_KEYS.every(k => own(row, k)));
    valid(typeof row.learner_id === 'string' && /^learner-[0-9]{3}$/.test(row.learner_id));
    valid(Number.isInteger(row.cohort_week) && row.cohort_week >= 1 && row.cohort_week <= 12);
    for (const field of ['course_track', 'signup_source', 'device_group']) valid(GROUPS[field].includes(row[field]));
    for (const [field, max] of [['lessons_started', 8], ['lessons_completed', 8], ['forum_visits', 60], ['support_contacts', 20]]) valid(Number.isInteger(row[field]) && row[field] >= 0 && row[field] <= max);
    valid(row.lessons_completed <= row.lessons_started && typeof row.completed === 'boolean');
    for (const field of NUMERIC_FIELDS) valid(row[field] === null || (Number.isFinite(row[field]) && row[field] >= 0 && row[field] <= BINS[field].at(-1)));
    if (row.lessons_started === 0) valid(row.avg_session_minutes === null && row.days_to_first_lesson === null && (row.assignment_submit_rate === 0 || row.assignment_submit_rate === null) && !row.completed);
    if (row.completed) valid(row.lessons_completed === 8 && (row.assignment_submit_rate === 1 || row.assignment_submit_rate === null));
  }
}
export function halfUp6(value) { if (value === null) return null; valid(Number.isFinite(value)); const n = Math.floor(Math.abs(value) * 1e6 + .5) / 1e6; return n === 0 ? 0 : Math.sign(value) * n; }
export function quantile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), h = (sorted.length - 1) * p, lo = Math.floor(h); return sorted[lo] + (h - lo) * (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]); }
export function wilson(successes, n) { if (!n) return { lower: null, upper: null }; const z = 1.959963984540054, z2 = z * z, p = successes / n, d = 1 + z2 / n, center = (p + z2 / (2 * n)) / d, half = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / d; return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) }; }
export function pearson(points) {
  const n = points.length; if (!n) return { n, meanX: null, meanY: null, r: null };
  const meanX = points.reduce((s, p) => s + p.x, 0) / n, meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, yy = 0, xy = 0; for (const p of points) { const dx = p.x - meanX, dy = p.y - meanY; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  return { n, meanX, meanY, r: n < 2 || xx === 0 || yy === 0 ? null : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) };
}
const status = (row, field) => row[field] !== null ? 'VALID' : field !== 'assignment_submit_rate' && row.lessons_started === 0 ? 'NOT_APPLICABLE' : 'MISSING';
const fieldQuality = rows => NUMERIC_FIELDS.map(fieldKey => ({ fieldKey, validCount: rows.filter(r => status(r, fieldKey) === 'VALID').length, missingCount: rows.filter(r => status(r, fieldKey) === 'MISSING').length, notApplicableCount: rows.filter(r => status(r, fieldKey) === 'NOT_APPLICABLE').length }));
const exclusions = () => ({ missingOnly: 0, notApplicableOnly: 0, both: 0, total: 0 });
function select(rows, fields) { const excluded = exclusions(), selected = []; for (const row of rows) { const states = fields.map(f => status(row, f)), missing = states.includes('MISSING'), na = states.includes('NOT_APPLICABLE'); if (missing || na) { excluded[missing && na ? 'both' : missing ? 'missingOnly' : 'notApplicableOnly']++; excluded.total++; } else selected.push(row); } return { rows: selected, exclusions: excluded }; }
function clean(input, config) {
  const seen = new Map(), duplicates = new Map(); let rows = [];
  input.forEach((row, i) => { const key = JSON.stringify(ROW_KEYS.map(k => row[k])), number = i + 1; if (seen.has(key)) { if (!duplicates.has(key)) duplicates.set(key, { learnerId: row.learner_id, rowNumbers: [seen.get(key)] }); duplicates.get(key).rowNumbers.push(number); if (config.duplicatePolicy === 'DROP_EXACT') return; } else seen.set(key, number); rows.push({ ...row, rowNumber: number }); });
  const removedDuplicateRows = input.length - rows.length, before = fieldQuality(input);
  const medians = Object.fromEntries(NUMERIC_FIELDS.map(f => [f, quantile(rows.filter(r => status(r, f) === 'VALID').map(r => r[f]), .5)]));
  const imputations = NUMERIC_FIELDS.map(fieldKey => ({ fieldKey, count: 0, median: medians[fieldKey] }));
  let removedMissingRows = 0;
  if (config.missingPolicy === 'DROP_MISSING') { const prior = rows.length; rows = rows.filter(r => NUMERIC_FIELDS.every(f => status(r, f) !== 'MISSING')); removedMissingRows = prior - rows.length; }
  if (config.missingPolicy === 'MEDIAN_NUMERIC') for (const row of rows) for (const info of imputations) if (status(row, info.fieldKey) === 'MISSING' && info.median !== null) { row[info.fieldKey] = info.median; info.count++; }
  let capValue = null, cappedRows = 0;
  if (config.extremePolicy === 'CAP_P95') { capValue = quantile(rows.filter(r => r.avg_session_minutes !== null).map(r => r.avg_session_minutes), .95); if (capValue !== null) for (const row of rows) if (row.avg_session_minutes !== null && row.avg_session_minutes > capValue) { row.avg_session_minutes = capValue; cappedRows++; } }
  return { rows, quality: { duplicateRows: input.length - seen.size, duplicateGroups: [...duplicates.values()], removedDuplicateRows, removedMissingRows, before, after: fieldQuality(rows), imputations, cappedRows, capValue } };
}
function completion(rows) { const n = rows.length, completedCount = rows.filter(r => r.completed).length, ci = wilson(completedCount, n); return { n, completedCount, completionRate: n ? completedCount / n : null, ciLower: ci.lower, ciUpper: ci.upper }; }
function groupKey(row, field) { if (field === 'cohort_period') return row.cohort_week <= 6 ? 'EARLY' : 'LATE'; if (field === 'days_to_first_lesson_band') { const d = row.days_to_first_lesson; return d < 1 ? 'SAME_DAY' : d < 3 ? 'DAYS_1_2' : d < 7 ? 'DAYS_3_6' : 'DAYS_7_PLUS'; } return row[field]; }
function relationship(rows, p, includePoints) {
  if (p.relationshipMode === 'SCATTER') { const selected = select(rows, [p.xField, p.yField]), points = selected.rows.map(r => ({ rowNumber: r.rowNumber, x: r[p.xField], y: r[p.yField] })); return { relationshipMode: p.relationshipMode, analysisRows: points.length, exclusions: selected.exclusions, xField: p.xField, yField: p.yField, scatter: pearson(points), ...(includePoints ? { points } : {}) }; }
  const selected = select(rows, p.groupBy === 'days_to_first_lesson_band' ? ['days_to_first_lesson'] : []);
  return { relationshipMode: p.relationshipMode, analysisRows: selected.rows.length, exclusions: selected.exclusions, groupBy: p.groupBy, groups: GROUPS[p.groupBy].map(key => ({ key, ...completion(selected.rows.filter(r => groupKey(r, p.groupBy) === key)) })) };
}
function roundTree(value) { if (typeof value === 'number') return halfUp6(value); if (Array.isArray(value)) return value.map(roundTree); if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundTree(v)])); return value; }
export async function calculateDs(operation, input, raw, metadata) {
  const p = normalizeParameters(operation, raw);
  const cleaning = Object.fromEntries(CLEAN.slice().sort().map(k => [k, p[k]])), bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(cleaning))), cleaningConfigSha256 = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  return calculateDsPrepared(operation, input, p, { ...metadata, cleaningConfigSha256 });
}
// Synchronous build-validator seam: callers must calculate the canonical SHA.
export function calculateDsPrepared(operation, input, raw, metadata) {
  validateRows(input); const p = normalizeParameters(operation, raw); valid(/^[a-f0-9]{64}$/.test(metadata?.datasetSha256) && /^[a-f0-9]{64}$/.test(metadata?.cleaningConfigSha256));
  const cleaningConfigSha256 = metadata.cleaningConfigSha256;
  const { rows, quality } = clean(input, p);
  const result = { schemaVersion: 'ds-result-v1', operationKey: operation, datasetSha256: metadata.datasetSha256, cleaningConfigSha256, inputRows: input.length, retainedRows: rows.length, uniqueLearners: new Set(rows.map(r => r.learner_id)).size, analysisRows: rows.length, exclusions: exclusions(), quality };
  if (operation === 'ds-profile') {
    const selected = select(rows, [p.distributionField]), values = selected.rows.map(r => r[p.distributionField]), bounds = BINS[p.distributionField], counts = fieldQuality(rows).find(f => f.fieldKey === p.distributionField);
    result.analysisRows = values.length; result.exclusions = selected.exclusions;
    result.profile = { distributionField: p.distributionField, completion: completion(rows), validCount: values.length, missingCount: counts.missingCount, notApplicableCount: counts.notApplicableCount, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, minimum: quantile(values, 0), q25: quantile(values, .25), median: quantile(values, .5), q75: quantile(values, .75), maximum: quantile(values, 1), histogram: bounds.slice(0, -1).map((lower, index) => ({ lower, upper: bounds[index + 1], upperInclusive: index === bounds.length - 2, count: values.filter(v => v >= lower && (index === bounds.length - 2 ? v <= bounds[index + 1] : v < bounds[index + 1])).length })) };
  }
  if (operation === 'ds-relationship' || operation === 'ds-stratify') {
    const overall = relationship(rows, p, operation === 'ds-relationship'); result.analysisRows = overall.analysisRows; result.exclusions = overall.exclusions;
    if (operation === 'ds-relationship') result.relationship = overall;
    else result.stratified = { stratifyBy: p.stratifyBy, overall, strata: GROUPS[p.stratifyBy].map(key => { const part = rows.filter(r => groupKey(r, p.stratifyBy) === key); return { key, retainedRows: part.length, summary: relationship(part, p, false) }; }) };
  }
  const rounded = roundTree(result); valid(new TextEncoder().encode(JSON.stringify(rounded)).length <= 102400); return rounded;
}
