// Deterministic build-time content generation. Never reads env, databases or network.
// --check compares committed artifacts without writing. Updating a published bundle
// requires a NEW version directory/id; this REVIEW bundle is not a human approval.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { LABELS, features, predict, evaluateComparison } from '../shared/classifier/classifier-v1.mjs';
const root = new URL('../', import.meta.url), prefix = 'ai-support/1.0.0';
const taskVersionId = '01JA1000000000000000000001';
const files = new Map(), json = value => JSON.stringify(value, null, 2) + '\n';
const artifact = (path, value) => files.set(path, typeof value === 'string' ? value : json(value));
let seed = 173;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const shuffle = array => { const out = [...array]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const words = [
  ['登录失败', '页面报错', '视频卡顿', '声音中断', '文件上传', '提交按钮'],
  ['概念定义', '原理推导', '公式含义', '例子理解', '题目思路', '算法区别'],
  ['截止日期', '课程安排', '工作时间', '延长期限', '学习进度', '周末补课'],
  ['学习信心', '坚持动力', '练习挫败', '鼓励支持', '担心能力', '放弃犹豫'],
];
const extras = [
  ['无法打开', '显示错误', '一直转圈'], ['如何解释', '为什么这样', '意思是什么'],
  ['没有空闲', '申请延期', '来不及学'], ['想要放弃', '需要鼓励', '失去动力'],
];
const definitions = [
  ['技术问题', '系统功能无法正常使用，而不是概念或时间困难。'],
  ['概念理解', '重点是理解原理、术语或解题方法。'],
  ['时间安排', '重点是期限、日程和可用学习时间。'],
  ['学习鼓励', '重点是坚持意愿与学习支持；不处理危机或心理诊断。'],
];
const idRoots = ['technical', 'concept', 'schedule', 'motivation'];
const training = LABELS.flatMap((label, i) => words[i].map((text, j) => ({ sampleId: `train-${i + 1}-${j + 1}`, messageText: `${text}，请协助处理${text}。`, goldLabel: label })));
const examples = LABELS.flatMap((label, i) => extras[i].map((text, j) => ({ exampleId: `example-${idRoots[i]}-${j + 1}`, messageText: `${words[i][j]}，${text}，请帮助。`, goldLabel: label })));
const definitionVariants = LABELS.flatMap((label, i) => [
  { id: `${idRoots[i]}-default`, label, title: `${definitions[i][0]}：基础定义`, description: definitions[i][1], features: [] },
  { id: `${idRoots[i]}-clarified`, label, title: `${definitions[i][0]}：补充措辞`, description: `保留基础含义，并关注“${extras[i].join('、')}”等措辞。`, features: [...new Set(extras[i].flatMap(t => Object.keys(features(t))))].sort() },
]);
const vocabulary = [...new Set([...training.map(t => t.messageText), ...examples.map(t => t.messageText), ...extras.flat()].flatMap(t => Object.keys(features(t))))].sort();
const baseCounts = Object.fromEntries(LABELS.map(label => [label, Object.fromEntries(vocabulary.map(t => [t, 0]))]));
for (const row of training) for (const [token, count] of Object.entries(features(row.messageText))) baseCounts[row.goldLabel][token] += count;
const baselineConfig = { definitionVariantIds: Object.fromEntries(LABELS.map((label, i) => [label, `${idRoots[i]}-default`])), exampleIds: [], confidenceThreshold: 0.55, lowConfidencePolicy: 'MANUAL_REVIEW' };
const model = { schemaVersion: 'classifier-model-v1', labelOrder: [...LABELS], vocabulary, baseCounts, definitionVariants, examples, baselineConfig };
const ambiguous = [
  ['概念定义和原理推导的页面无法打开。', '截止日期与课程安排的页面显示错误。', '学习信心和坚持动力的页面一直转圈。'],
  ['登录失败和页面报错这个例子如何解释？', '截止日期和课程安排这两个概念意思是什么？', '学习信心与坚持动力的公式为什么这样？'],
  ['登录失败和页面报错处理好了，但工作太忙申请延期。', '概念定义和原理推导我理解了，只是没有空闲。', '学习信心和坚持动力没有问题，但这周来不及学。'],
  ['登录失败和页面报错都解决了，可我失去动力。', '概念定义和原理推导会了，却还是想要放弃。', '截止日期与课程安排都合适，但我需要鼓励。'],
];
const practice = shuffle(LABELS.flatMap((goldLabel, i) => [...words[i].slice(0, 2).map(t => `我遇到${t}，想了解如何处理。`), `关于${words[i][2].slice(0,2)}，我${extras[i][2]}。`, ...ambiguous[i]].map(messageText => ({ messageText, goldLabel })))).map((r, i) => ({ sampleId: `practice-${String(i + 1).padStart(2, '0')}`, ...r }));
const evaluation = shuffle(LABELS.flatMap((goldLabel, i) => [
  ...words[i].map(t => `课程中出现${t}，希望得到帮助。`),
  ...ambiguous[i].map(text => `请求描述：${text.replaceAll('和','以及').replaceAll('与','及').replaceAll('但','不过')}`), ...extras[i].map((t, j) => `现在${words[i][j].slice(0,2)}这部分，我${t}。`),
].map(messageText => ({ messageText, goldLabel })))).map((r, i) => ({ sampleId: `sample-${String(i + 1).padStart(3, '0')}`, ...r }));
const publicPractice = practice.map(row => ({ ...row, baseline: predict(model, baselineConfig, row.messageText) }));
const changedConfig = { ...baselineConfig, definitionVariantIds: Object.fromEntries(LABELS.map((label, i) => [label, `${idRoots[i]}-clarified`])), exampleIds: examples.filter((_, i) => i % 3 === 0).map(e => e.exampleId), confidenceThreshold: 0.7 };
const privateRows = [...practice.map(r => ({ ...r, split: 'practice' })), ...evaluation.map(r => ({ ...r, split: 'evaluation' }))];
const csv = [['message_id', 'message_text', 'gold_label', 'baseline_prediction', 'baseline_confidence', 'split'], ...privateRows.map(r => { const p = predict(model, baselineConfig, r.messageText); return [r.sampleId, r.messageText, r.goldLabel, p.routedLabel, p.confidence, r.split]; })].map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
artifact(`content/${prefix}/classifier-model.json`, model);
artifact(`content/${prefix}/example-pool.json`, examples);
artifact(`content/${prefix}/practice-public.json`, publicPractice);
artifact(`content/${prefix}/evaluation-public.json`, evaluation.map(({ sampleId, messageText }) => ({ sampleId, messageText })));
artifact(`content/${prefix}/evaluation-private.json`, evaluation);
artifact(`content/${prefix}/support-messages.csv`, csv);
artifact(`content/${prefix}/training-private.json`, training);
artifact(`content/${prefix}/baseline-summary.json`, evaluateComparison(model, baselineConfig, evaluation).baseline);
artifact(`content/${prefix}/review-private.json`, { schemaVersion: 'content-review-v1', releaseStatus: 'REVIEW', humanProfessionalReview: 'PENDING', targetUserTiming: 'PENDING', intendedMinutes: [45, 60], seed: 173, disclosure: '全部消息均为合成；技术与数据检查不能替代专业人工审核或目标用户计时。' });
artifact(`content/${prefix}/golden-private.json`, { schemaVersion: 'classifier-golden-v1', baselineConfig, changedConfig, baseline: evaluateComparison(model, baselineConfig, evaluation), changed: evaluateComparison(model, changedConfig, evaluation), practicePredictions: practice.map(s => ({ sampleId: s.sampleId, ...predict(model, baselineConfig, s.messageText) })) });

const str = (max = 500, min = 1) => ({ type: 'string', minLength: min, maxLength: max });
const choice = values => ({ type: 'string', enum: values });
const integer = (min = 0, max = 10000) => ({ type: 'integer', minimum: min, maximum: max });
const rate = { type: ['number', 'null'], minimum: 0, maximum: 1 };
const array = (items, min = 0, max = 30, unique = false) => ({ type: 'array', items, minItems: min, maxItems: max, ...(unique ? { uniqueItems: true } : {}) });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const configProperties = { definitionVariantIds: object(Object.fromEntries(LABELS.map(label => [label, choice(definitionVariants.filter(v => v.label === label).map(v => v.id))]))), exampleIds: array(choice(examples.map(e => e.exampleId)), 0, 4, true), confidenceThreshold: { type: 'number', enum: [0.4, 0.55, 0.7] }, lowConfidencePolicy: choice(['MANUAL_REVIEW', 'AUTO_ROUTE']) };
const label = choice([...LABELS]), route = choice([...LABELS, 'MANUAL_REVIEW']);
const metricSchema = object({ sampleCount: integer(1), autoRoutedCount: integer(), correctAutoRoutedCount: integer(), manualReviewCount: integer(), coverage: rate, autoAccuracy: rate, totalCorrectAutoRate: rate, perLabel: array(object({ label, precision: rate, recall: rate, supportCount: integer(), predictedCount: integer(), truePositiveCount: integer() }), 4, 4), confusionMatrix: object({ labelOrder: array(label, 4, 4), columns: array(route, 5, 5), counts: array(array(integer(), 5, 5), 4, 4) }), errorCounts: array(object({ trueLabel: label, predictedLabel: route, count: integer() }), 16, 16) });
const resultSchema = object({ schemaVersion: { type: 'string', const: 'classifier-result-v1' }, baseline: metricSchema, candidate: metricSchema, delta: object({ coverage: { type: ['number', 'null'], minimum: -1, maximum: 1 }, autoAccuracy: { type: ['number', 'null'], minimum: -1, maximum: 1 }, totalCorrectAutoRate: { type: ['number', 'null'], minimum: -1, maximum: 1 }, manualReviewCount: integer(-10000) }), errorCategoryChanges: array(object({ trueLabel: label, predictedLabel: route, baselineCount: integer(), candidateCount: integer(), change: integer(-10000) }), 16, 16) });
const step = (stepKey, title, instructions, properties, dependencies, assetKeys, evidenceFields, hints, operationKey = null) => ({ stepKey, title, instructions, dependencies, required: true, responseSchemaVersion: 'ai-response-v1', inputSchema: object(properties), assetKeys, operationKey, hints: hints.map((text, i) => ({ level: i + 1, text })), hintContextFields: [], evidenceFields });
const steps = [
  step('a1-task', '认识支持请求分类任务', 'LumenLearn希望把支持请求交给正确团队。你会检查一个公开说明的轻量教学分类器，不是训练大模型。数据均为合成。本工程预览尚待专业审核与真实用户计时。', { acknowledged: { type: 'boolean', const: true }, taskGoal: choice(['ROUTE_SUPPORT_REQUESTS', 'GENERATE_EVERY_ANSWER', 'ASSESS_STUDENT_ABILITY']) }, [], ['classifier-model'], ['taskGoal'], ['先区分分类路由和自动回答。', '标签描述请求要交给哪个团队，不是给学生贴标签。', '技术问题与概念问题可能使用相似词；最终仍需你判断请求用途。']),
  step('a2-metrics', '理解覆盖率与错误代价', '四条真实类别T/C/S/M分别路由T/C/T/人工：只有三条自动处理，其中两条正确。比较自动准确率与覆盖率，解释你最在意哪类错误；这不是总分测验。', { priorityMetric: choice(['COVERAGE', 'AUTO_ACCURACY', 'RECALL']), errorCostReason: str(500) }, ['a1-task'], ['baseline-summary'], ['priorityMetric', 'errorCostReason'], ['先写清每个比例的分子和分母。', '转人工会降低覆盖率，但不等于所有错误已解决。', '四条演算中，自动准确率分母为3，覆盖率分母为4；请解释你的取舍。']),
  step('a3-errors', '检查公开练习中的错误', '查看练习集的审核标签与baseline，选择8–10条需要检查的案例，至少归纳两类错误模式。转人工是拒绝自动路由，不应伪称预测正确。引用样本后写出你自己的解释。', { inspectedSampleIds: array(choice(practice.map(r => r.sampleId)), 8, 10, true), errorPatterns: array(object({ patternCode: choice(['AMBIGUOUS_WORDING', 'DEFINITION_BOUNDARY', 'EXAMPLE_GAP', 'LOW_CONFIDENCE']), sampleIds: array(choice(practice.map(r => r.sampleId)), 1, 5, true), explanation: str(400) }), 2, 3) }, ['a2-metrics'], ['practice-public'], ['inspectedSampleIds', 'errorPatterns'], ['查看预测标签与请求真正目的是否一致。', '把问题按定义边界、示例不足和低置信度分组。', '任选一条同时提到技术词与学习概念的公开案例，检查分类器是否只抓住了表面措辞。']),
  step('a4-configure', '设计有限配置修改', '每类选择一个审核定义、最多四个候选示例和一个阈值。练习预览在浏览器Worker运行，不消耗正式评价额度。说明文本只保存理由，不会变为模型指令。', { ...configProperties, modificationReason: str(600), expectedEffect: str(400) }, ['a3-errors'], ['classifier-model', 'example-pool', 'practice-public'], ['definitionVariantIds', 'exampleIds', 'confidenceThreshold', 'lowConfidencePolicy', 'modificationReason', 'expectedEffect'], ['先选择你要改善的一个错误模式。', '提高阈值主要改变转人工比例；定义和示例改变特征计数。', '可以先只改一个配置并预览，保留其他设置，便于解释差异。']),
  step('a5-evaluate', '在固定评价集上比较结果', '正式评估从服务端读取A4已保存版本，在同一隐藏集重算。最多五种成功配置；baseline及相同配置复用不扣额度。只提供聚合结果，请同时比较改善、退步与人工复核量。', { comparisonNotes: str(800), tradeoff: str(500) }, ['a4-configure'], ['evaluation-public', 'baseline-summary'], ['comparisonNotes', 'tradeoff'], ['检查当前结果是否绑定最新A4配置。', '把coverage、自动准确率和各标签recall一起看。', '如果自动准确率上升但更多请求转人工，请说明这是否符合你的使用目标。'], 'ai-evaluate'),
  step('a6-decision', '决定使用方式与边界', '选择继续试验、有限上线或暂不上线；写出至少一个监控项和当前小规模合成评价不能消除的风险。不要求所有学生选择同一方案。', { rolloutDecision: choice(['CONTINUE_EXPERIMENT', 'LIMITED_PILOT', 'DO_NOT_DEPLOY']), decisionReason: str(600), monitoringItems: array(str(200), 1, 3, true), residualRisk: str(500) }, ['a5-evaluate'], [], ['rolloutDecision', 'decisionReason', 'monitoringItems', 'residualRisk'], ['用本次结果支持你的决定，不作适配度判断。', '区分评价集里的结果与真实新请求的表现。', '可监控人工复核量或某类漏分，但最后的使用决定仍由你解释。']),
];
const assets = [...files.keys()].filter(p => p.startsWith(`content/${prefix}/`)).map(path => { const name = path.split('/').at(-1), assetKey = name.replace(/\.(json|csv)$/, ''); const raw = files.get(path); return { assetKey, path: path.slice(8), visibility: /private|support-messages|golden/.test(name) ? 'PRIVATE' : 'PUBLIC', mediaType: name.endsWith('.csv') ? 'text/csv' : 'application/json', sha256: createHash('sha256').update(raw).digest('hex'), byteLength: Buffer.byteLength(raw) }; });
const manifest = { schemaVersion: 'task-manifest-v2', taskVersionId, contentKind: 'MAJOR', majorCode: 'AI', demoKey: null, versionCode: '1.0.0', title: 'AI：让支持请求分类更可靠', scenario: 'LumenLearn的课程完成率下降。你作为模型分析助理，检查学习支持请求的分类错误，通过有限配置迭代提出谨慎的使用建议。所有人物与消息均为合成；这是工程预览，不是已完成真人计时的正式发布。', goals: ['理解分类输出与错误代价', '基于公开案例进行有限配置迭代', '在固定隐藏集比较覆盖率与准确率', '说明使用决定、监控与不确定性'], estimatedMinutes: { minimum: 45, maximum: 60 }, assets, steps, operations: [{ operationKey: 'ai-evaluate', stepKey: 'a5-evaluate', engineType: 'FROZEN_CLASSIFIER', engineVersion: 'classifier-v1', parametersSchema: object(configProperties), resultSchema, maxEvaluations: 5, publicAssetKeys: ['classifier-model', 'practice-public', 'evaluation-public', 'baseline-summary'], privateAssetKeys: ['evaluation-private'], datasetAssetKey: 'evaluation-private', modelAssetKey: 'classifier-model', inputBindings: Object.keys(configProperties).map(parameterKey => ({ parameterKey, sourceStepKey: 'a4-configure', sourceField: parameterKey })) }], reflection: { questionSetVersion: 'ai-reflection-v1', instructions: '描述这次体验的兴趣与困难，不评价长期能力。可选项可跳过；AI追问只有主动请求才可能生成，失败不影响提交。', inputSchema: object({ interestingStepKeys: array(choice([...steps.map(s => s.stepKey), 'NONE']), 1, 3, true), difficultySources: array(choice(['KNOWLEDGE', 'TOOLS', 'TIME', 'WORK_STYLE', 'OTHER', 'NONE']), 1, 3, true), continueSimilarWork: choice(['YES', 'UNSURE', 'NO']), reflectionNote: str(500, 0), nextWorkStyle: choice(['MODEL_ITERATION', 'DATA_REASONING', 'BUSINESS_ACTION', 'UNSURE', 'SKIPPED']), aiFollowUp: str(500, 0) }, ['interestingStepKeys', 'difficultySources', 'continueSimilarWork']) }, review: { kind: 'PROFESSIONAL', checkKeys: ['PROFESSIONAL_CORE', 'BEGINNER_ACCESS', 'DATA_CORRECTNESS', 'EVIDENCE_SOURCES', 'HINT_NO_FINAL_ANSWER', 'FAIRNESS', 'CHROME_EDGE', 'TIMING_45_60', 'RECOVERY', 'VERSION_CONSISTENCY'], professionalReviewRequired: true } };
artifact(`content/${prefix}/manifest.json`, manifest);
const v1 = JSON.parse(readFileSync(new URL('contracts/schemas/task-manifest-v1.json', root), 'utf8'));
v1.$id = 'https://majorpilot.invalid/schemas/task-manifest-v2.json'; v1.properties.schemaVersion.const = 'task-manifest-v2';
const operation = v1.properties.operations.items;
operation.properties.modelAssetKey = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,79}$' };
operation.properties.inputBindings = array(object({ parameterKey: str(80), sourceStepKey: str(80), sourceField: str(80) }), 1, 30);
operation.required.push('modelAssetKey', 'inputBindings');
artifact('contracts/schemas/task-manifest-v2.json', v1);
assert.equal(practice.length, 24); assert.equal(evaluation.length, 48);
for (const label of LABELS) assert.equal(evaluation.filter(s => s.goldLabel === label).length, 12);
assert.equal(new Set([...training, ...practice, ...evaluation].map(s => s.sampleId)).size, training.length + 72);
let checked = 0;
for (const [path, text] of files) { const url = new URL(path, root); if (process.argv.includes('--check')) assert.equal(readFileSync(url, 'utf8'), text, `Generated artifact drift: ${path}`); else { mkdirSync(dirname(fileURLToPath(url)), { recursive: true }); writeFileSync(url, text); } checked++; }
console.log(JSON.stringify({ result: 'PASS', mode: process.argv.includes('--check') ? 'check' : 'generate-review-only', artifacts: checked, practice: practice.length, evaluation: evaluation.length, practiceNonCorrect: publicPractice.filter(r => r.baseline.routedLabel !== r.goldLabel).length, paidModelCalls: 0 }));
