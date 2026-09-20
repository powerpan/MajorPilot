// Node publication validator; the browser imports classifier-v1.mjs only.
import assert from 'node:assert/strict';
import { LABELS, features, predict, evaluateComparison } from './classifier-v1.mjs';
export function validateClassifierAssets(assets) {
  const get = key => JSON.parse(assets.get(key));
  const model = get('classifier-model'), practice = get('practice-public'), hidden = get('evaluation-private'), visible = get('evaluation-public'), training = get('training-private'), golden = get('golden-private');
  const fields = (value, expected) => assert.deepEqual(Object.keys(value).sort(), expected.split(' ').sort());
  fields(model, 'schemaVersion labelOrder vocabulary baseCounts definitionVariants examples baselineConfig');
  assert.equal(model.schemaVersion, 'classifier-model-v1'); assert.deepEqual(model.labelOrder, LABELS);
  const vocab = new Set(model.vocabulary); assert.ok(vocab.size > 0 && vocab.size <= 4096 && vocab.size === model.vocabulary.length); model.vocabulary.forEach(t => assert.equal([...t].length, 2));
  fields(model.baseCounts, LABELS.join(' ')); for (const row of Object.values(model.baseCounts)) { assert.deepEqual(Object.keys(row).sort(), [...vocab].sort()); Object.values(row).forEach(n => assert.ok(Number.isInteger(n) && n >= 0 && n <= 10000)); }
  assert.equal(model.definitionVariants.length, 8); assert.equal(new Set(model.definitionVariants.map(v => v.id)).size, 8);
  model.definitionVariants.forEach(v => {fields(v, 'id label title description features'); assert.ok(LABELS.includes(v.label)); assert.equal(new Set(v.features).size, v.features.length); v.features.forEach(t => assert.ok(vocab.has(t))); });
  const ids = new Set(); const unique = id => {assert.ok(!ids.has(id));ids.add(id);};
  model.examples.forEach(e => {fields(e, 'exampleId messageText goldLabel');unique(e.exampleId);assert.ok(LABELS.includes(e.goldLabel));});
  assert.deepEqual(get('example-pool'), model.examples);
  training.forEach(s => {fields(s, 'sampleId messageText goldLabel');unique(s.sampleId);assert.ok(LABELS.includes(s.goldLabel));});
  const recomputed=Object.fromEntries(LABELS.map(label=>[label,Object.fromEntries([...vocab].map(token=>[token,0]))]));
  training.forEach(s=>Object.entries(features(s.messageText)).forEach(([token,count])=>{if(vocab.has(token))recomputed[s.goldLabel][token]+=count;}));
  assert.deepEqual(recomputed,model.baseCounts);
  assert.equal(practice.length, 24);assert.equal(hidden.length, 48);assert.equal(visible.length, 48);
  practice.forEach(s => {fields(s, 'sampleId messageText goldLabel baseline');unique(s.sampleId);assert.deepEqual(predict(model, model.baselineConfig, s.messageText), s.baseline);});
  assert.ok(practice.filter(s => s.goldLabel !== s.baseline.routedLabel).length >= 8);
  hidden.forEach((s, i) => {fields(s, 'sampleId messageText goldLabel');fields(visible[i], 'sampleId messageText');unique(s.sampleId);assert.deepEqual(visible[i], {sampleId:s.sampleId,messageText:s.messageText});});
  LABELS.forEach(label => assert.equal(hidden.filter(s => s.goldLabel === label).length, 12));
  assert.deepEqual(evaluateComparison(model,golden.baselineConfig,hidden),golden.baseline);
  assert.deepEqual(evaluateComparison(model,golden.changedConfig,hidden),golden.changed);
  assert.deepEqual(get('baseline-summary'),golden.baseline.baseline);
}
