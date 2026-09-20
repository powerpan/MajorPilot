import { LABELS, normalizeConfig, evaluateComparison } from '../shared/classifier/classifier-v1.mjs';

// Bundled once, hash-pinned by the launcher. No dynamic imports or user source.
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
self.onmessage = ({data}) => {
  const reply = value => {
    const result = {...value, engine: 'classifier-v1'};
    self.postMessage(bytes(result) > 102400 ? {status:'ERROR',code:'OUTPUT_LIMIT',engine:'classifier-v1'} : result);
  };
  try {
    if (!data || Object.keys(data).sort().join('|') !== 'config|model|samples|template' || data.template !== 'classifier-practice-v1' || bytes(data) > 1048576) throw new Error('INPUT_LIMIT_OR_SCHEMA');
    const {model, samples} = data;
    if (model?.schemaVersion !== 'classifier-model-v1' || JSON.stringify(model.labelOrder) !== JSON.stringify(LABELS) || !Array.isArray(model.vocabulary) || model.vocabulary.length > 10000 || !Array.isArray(model.examples) || model.examples.length > 100 || !Array.isArray(model.definitionVariants) || model.definitionVariants.length > 32) throw new Error('CLASSIFIER_MODEL_INVALID');
    if (!Array.isArray(samples) || samples.length !== 24 || samples.some(row => !/^practice-\d{2}$/.test(row.sampleId) || typeof row.messageText !== 'string' || row.messageText.length > 2000 || !LABELS.includes(row.goldLabel)) || new Set(samples.map(row => row.sampleId)).size !== 24) throw new Error('CLASSIFIER_SAMPLES_INVALID');
    const config = normalizeConfig(model, data.config);
    reply({status:'SUCCESS',result:evaluateComparison(model, config, samples)});
  } catch (error) { reply({status:'ERROR',code: /^(CLASSIFIER_|INPUT_)/.test(error.message) ? error.message : 'CLASSIFIER_INPUT_INVALID'}); }
};
