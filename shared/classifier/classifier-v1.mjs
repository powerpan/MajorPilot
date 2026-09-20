// Frozen teaching classifier. No network, storage, eval or environment access.
export const LABELS = Object.freeze(['technical_issue', 'concept_confusion', 'schedule_constraint', 'motivation_support']);
export const MANUAL = 'MANUAL_REVIEW';
export function halfUp6(value) {
  if (!Number.isFinite(value)) throw new Error('CLASSIFIER_INVALID_NUMBER');
  return Number((Math.sign(value) * Math.round(Math.abs(value) * 1e6) / 1e6).toFixed(6));
}
export function features(text) {
  const chars = [...text.normalize('NFKC').toLowerCase().replace(/[\p{White_Space}\p{Punctuation}]/gu, '')];
  const counts = {};
  for (let i = 0; i + 1 < chars.length; i++) { const token = chars[i] + chars[i + 1]; counts[token] = (counts[token] || 0) + 1; }
  return counts;
}
export function normalizeConfig(model, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join('|') !== ['confidenceThreshold', 'definitionVariantIds', 'exampleIds', 'lowConfidencePolicy'].join('|')) throw new Error('CLASSIFIER_CONFIG_INVALID');
  const ids = raw.definitionVariantIds;
  if (!ids || typeof ids !== 'object' || Array.isArray(ids) || Object.keys(ids).sort().join('|') !== [...LABELS].sort().join('|')) throw new Error('CLASSIFIER_CONFIG_INVALID');
  const definitionVariantIds = {};
  for (const label of LABELS) { if (!model.definitionVariants.some(v => v.id === ids[label] && v.label === label)) throw new Error('CLASSIFIER_CONFIG_INVALID'); definitionVariantIds[label] = ids[label]; }
  if (!Array.isArray(raw.exampleIds) || raw.exampleIds.length > 4 || new Set(raw.exampleIds).size !== raw.exampleIds.length || raw.exampleIds.some(id => typeof id !== 'string' || !model.examples.some(e => e.exampleId === id))) throw new Error('CLASSIFIER_CONFIG_INVALID');
  if (![0.4, 0.55, 0.7].includes(raw.confidenceThreshold) || ![MANUAL, 'AUTO_ROUTE'].includes(raw.lowConfidencePolicy)) throw new Error('CLASSIFIER_CONFIG_INVALID');
  return { definitionVariantIds, exampleIds: [...raw.exampleIds].sort(), confidenceThreshold: raw.confidenceThreshold, lowConfidencePolicy: raw.lowConfidencePolicy };
}
export function isBaseline(model, config) { return JSON.stringify(normalizeConfig(model, config)) === JSON.stringify(normalizeConfig(model, model.baselineConfig)); }
function trained(model, raw) {
  const config = normalizeConfig(model, raw), vocabulary = new Set(model.vocabulary);
  const counts = Object.fromEntries(LABELS.map(label => [label, Object.fromEntries(model.vocabulary.map(t => [t, model.baseCounts[label][t] || 0]))]));
  for (const id of config.exampleIds) { const example = model.examples.find(e => e.exampleId === id); for (const [token, count] of Object.entries(features(example.messageText))) if (vocabulary.has(token)) counts[example.goldLabel][token] += count; }
  for (const label of LABELS) for (const token of model.definitionVariants.find(v => v.id === config.definitionVariantIds[label]).features) { if (!vocabulary.has(token)) throw new Error('CLASSIFIER_MODEL_INVALID'); counts[label][token]++; }
  return { counts, config, vocabulary };
}
export function predict(model, raw, messageText) {
  const { counts, config, vocabulary } = trained(model, raw), input = features(messageText);
  const logScores = LABELS.map(label => {
    const total = Object.values(counts[label]).reduce((a, b) => a + b, 0) + model.vocabulary.length;
    let score = Math.log(0.25);
    // Vocabulary order is frozen: floating-point addition must be reproducible.
    for (const token of model.vocabulary) if (vocabulary.has(token) && input[token]) score += input[token] * Math.log((counts[label][token] + 1) / total);
    return halfUp6(score);
  });
  const best = Math.max(...logScores), winner = logScores.indexOf(best), exp = logScores.map(score => Math.exp(score - best));
  const confidence = halfUp6(exp[winner] / exp.reduce((a, b) => a + b, 0));
  const predictedLabel = LABELS[winner], routedLabel = config.lowConfidencePolicy === MANUAL && confidence < config.confidenceThreshold ? MANUAL : predictedLabel;
  return { predictedLabel, routedLabel, confidence, logScores };
}
export function metrics(goldLabels, routedLabels) {
  if (!goldLabels.length || goldLabels.length !== routedLabels.length) throw new Error('CLASSIFIER_SAMPLES_INVALID');
  const columns = [...LABELS, MANUAL], counts = LABELS.map(() => columns.map(() => 0));
  goldLabels.forEach((gold, i) => { const row = LABELS.indexOf(gold), col = columns.indexOf(routedLabels[i]); if (row < 0 || col < 0) throw new Error('CLASSIFIER_SAMPLES_INVALID'); counts[row][col]++; });
  const sampleCount = goldLabels.length, manualReviewCount = counts.reduce((a, r) => a + r[4], 0), autoRoutedCount = sampleCount - manualReviewCount, correctAutoRoutedCount = counts.reduce((a, r, i) => a + r[i], 0);
  const ratio = (n, d) => d ? halfUp6(n / d) : null;
  const perLabel = LABELS.map((label, i) => { const supportCount = counts[i].reduce((a, b) => a + b, 0), predictedCount = counts.reduce((a, r) => a + r[i], 0), truePositiveCount = counts[i][i]; return { label, precision: ratio(truePositiveCount, predictedCount), recall: ratio(truePositiveCount, supportCount), supportCount, predictedCount, truePositiveCount }; });
  const errorCounts = LABELS.flatMap((trueLabel, i) => columns.flatMap((predictedLabel, j) => i === j ? [] : [{ trueLabel, predictedLabel, count: counts[i][j] }]));
  return { sampleCount, autoRoutedCount, correctAutoRoutedCount, manualReviewCount, coverage: ratio(autoRoutedCount, sampleCount), autoAccuracy: ratio(correctAutoRoutedCount, autoRoutedCount), totalCorrectAutoRate: ratio(correctAutoRoutedCount, sampleCount), perLabel, confusionMatrix: { labelOrder: [...LABELS], columns, counts }, errorCounts };
}
export function evaluate(model, config, samples) { return metrics(samples.map(s => s.goldLabel), samples.map(s => predict(model, config, s.messageText).routedLabel)); }
export function evaluateComparison(model, config, samples) {
  const baseline = evaluate(model, model.baselineConfig, samples), candidate = evaluate(model, config, samples);
  const difference = key => baseline[key] === null || candidate[key] === null ? null : halfUp6(candidate[key] - baseline[key]);
  return { schemaVersion: 'classifier-result-v1', baseline, candidate, delta: { coverage: difference('coverage'), autoAccuracy: difference('autoAccuracy'), totalCorrectAutoRate: difference('totalCorrectAutoRate'), manualReviewCount: candidate.manualReviewCount - baseline.manualReviewCount }, errorCategoryChanges: baseline.errorCounts.map((before, i) => ({ trueLabel: before.trueLabel, predictedLabel: before.predictedLabel, baselineCount: before.count, candidateCount: candidate.errorCounts[i].count, change: candidate.errorCounts[i].count - before.count })) };
}
