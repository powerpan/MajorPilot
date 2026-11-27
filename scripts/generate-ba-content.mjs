// Deterministic REVIEW-only derivative. Never touches the frozen AI/DS bundles.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { calculateBa, validateRows, STAGES, TRANSITIONS, GROUPS, WINDOW_KEYS, SUCCESS_METRICS } from '../shared/ba/ba-metrics-v1.mjs';
const root = new URL('../', import.meta.url), prefix = 'ba-learning/1.0.0', taskVersionId = '01JB1000000000000000000001';
const sourceSha = '9f09364c467d56256b66c9a2da25bf051f0c784bad22795418fd541a7f199cf6';
const sha = data => createHash('sha256').update(data).digest('hex'), files = new Map();
const artifact = (path, value) => files.set(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
const sourceBytes = readFileSync(new URL('content/ds-learning/1.0.0/canonical-events-private.json', root));
assert.equal(sha(sourceBytes), sourceSha, 'Frozen DS canonical source drift');
const source = JSON.parse(sourceBytes); assert.equal(source.records.length, 359);
const rows = [];
for (let week = 1; week <= 12; week++) for (const course_track of GROUPS.course_track) for (const signup_source of GROUPS.signup_source) {
  const group = source.records.filter(c => c.row.cohort_week === week && c.row.course_track === course_track && c.row.signup_source === signup_source);
  rows.push({ week, course_track, signup_source, enrolled_count: group.length, first_lesson_count: group.filter(c => c.events.first_lesson).length, week_one_active_count: group.filter(c => c.events.week_one_active).length, assignment_started_count: group.filter(c => c.events.assignment_started).length, assignment_submitted_count: group.filter(c => c.events.assignment_submitted).length, completed_count: group.filter(c => c.row.completed).length, support_contact_count: group.reduce((n, c) => n + c.row.support_contacts, 0) });
}
validateRows(rows); assert.deepEqual(rows, source.futureWeeklyFunnel); assert.equal(rows.filter(r => r.enrolled_count === 0).length, 1);
artifact(`content/${prefix}/weekly-funnel.json`, rows);
const columns = Object.keys(rows[0]);
artifact(`content/${prefix}/weekly-funnel-csv.csv`, [columns.join(','), ...rows.map(row => columns.map(key => row[key]).join(','))].join('\n') + '\n');
const datasetSha256 = sha(files.get(`content/${prefix}/weekly-funnel.json`));
artifact(`content/${prefix}/source-provenance-private.json`, { schemaVersion: 'ba-provenance-v1', generatorVersion: 'ba-cohort-aggregate-v1', sourceCanonicalSha256: sourceSha, sourceGeneratorVersion: 'learning-synthetic-v1', uniqueLearners: 359, aggregateRows: 72, datasetSha256, note: '直接从冻结的完整合成事件按批次、课程与来源聚合；不读取DS清洗结果，不拷贝学员级私有记录。' });
const labels = ['报名', '首课开始', '开课首周活跃', '开始作业', '提交作业', '完成课程'];
artifact(`content/${prefix}/data-dictionary.json`, {
  schemaVersion: 'ba-dictionary-v1', observationUnit: 'COHORT_COURSE_SOURCE', synthetic: true,
  introduction: '每行是一个入学批次周、课程方向与来源渠道的聚合，不是一个学员，也不是事件发生的自然周。72个组合全部保留；零人数是已观测的0，不代表未采集。',
  fields: [
    ['week', '入学批次周', '1至12；各批次均观察每名学员加入后的完整28天。', 'week'],
    ['course_track', '课程方向', 'FOUNDATIONS基础课程／APPLIED应用课程；不是专业能力标签。', 'category'],
    ['signup_source', '报名来源', 'ORGANIC自然／PARTNER合作／CAMPAIGN活动；构成变化不等于渠道因果效果。', 'category'],
    ['enrolled_count', '报名人数', '本批次、本课程和渠道的唯一报名学员；各组互斥可加总。', 'person'],
    ['first_lesson_count', '开始首课人数', '报名后28天内开始首课；条件完成率以此作为分母。', 'person'],
    ['week_one_active_count', '开课首周活跃人数', '首次开课后7天内达到活跃条件，且仍在报名后28天内；不是报名首7天。', 'person'],
    ['assignment_started_count', '开始作业人数', '同一28天窗口内开始作业，是活跃者的子集。', 'person'],
    ['assignment_submitted_count', '提交作业人数', '同一28天窗口内至少提交一次作业，是开始作业者的子集。', 'person'],
    ['completed_count', '完成课程人数', '同一28天窗口内完成8个核心单元与4项作业，是提交作业者的子集。', 'person'],
    ['support_contact_count', '支持联系次数', '同一28天窗口内的联系事件次数，可大于报名人数；不是联系人次去重人数。', 'contact'],
  ].map(([fieldKey, label, description, unit]) => ({ fieldKey, label, description, unit })),
  groupOrder: GROUPS, stageOrder: STAGES, transitions: TRANSITIONS.map((transitionKey, i) => ({ transitionKey, fromStageKey: STAGES[i], toStageKey: STAGES[i + 1], label: `${labels[i]} → ${labels[i + 1]}` })),
  notes: ['汇总时先加总人数，再计算比例；不要平均每周或每组百分比。', '漏斗累计到达率以报名为分母，相邻转化率以上一环节为分母。', '支持联系护栏的单位为次/100名报名者，可能大于100，不是百分比。', '所有批次成熟；没有真实事件时间戳，不声称审核过真实日志。', '群体构成、样本量与未观测因素可能影响差异；不能据此直接认定原因或预测收益。'],
});
artifact(`content/${prefix}/business-brief.json`, {
  schemaVersion: 'ba-brief-v1', title: 'LumenLearn：把完成率变化转为可检验的行动', role: '初级业务分析师',
  problem: '课程团队注意到后续入学批次的完成表现有变化，希望先统一指标口径，再决定支持流程中哪一小部分值得试验。你的产物是有依据、有护栏、有复盘时间的方案，不是唯一正确答案。',
  observationWindow: '12个批次均已完整观察每名学员入组后的前28天。开课首周活跃以首次开课为起点，仍受同一个报名28天窗口约束。',
  scope: ['定义整体或条件完成率并比较等长、不重叠的成熟批次窗口', '比较相邻转化与课程或渠道群体，不直接把差异归因', '区分观察、原因假设和仍需信息，提出一个小范围试验'],
  unavailable: ['收入', '满意度', '退课原因', '真实商业效果', '个体因果效果'],
  reviewNotice: '工程预览；专业人工审核、零代码目标用户试用和45–60分钟计时仍待完成。',
  actionBoundary: '目标提升只是你的试验目标，不是系统预测。护栏按同一群体前28天的支持联系次数/100名报名者。最后一名参与者入组28或42天后复盘；42天复盘仍只使用每人前28天结果。',
});
artifact(`content/${prefix}/sql-examples.json`, {
  schemaVersion: 'ba-sql-examples-v1', executionNotice: '以下是等价聚合逻辑的只读SQL示例，不在浏览器或服务器执行学生SQL。参数来自已保存的固定选项；示例省略输入校验、结果对象与最终六位舍入，实际由固定JS和Java计算器完成。',
  snippets: [
    { operationKey: 'ba-metric', title: '先合计分子分母，再算率', code: "SELECT SUM(completed_count) AS numerator_count,\n SUM(CASE WHEN :denominator = 'first_lesson_count' THEN first_lesson_count ELSE enrolled_count END) AS denominator_count,\n SUM(completed_count) * 1.0 / NULLIF(SUM(CASE WHEN :denominator = 'first_lesson_count' THEN first_lesson_count ELSE enrolled_count END), 0) AS rate\nFROM weekly_funnel WHERE week BETWEEN :start_week AND :end_week;\n-- 对两个窗口分别计算；12批次趋势额外 GROUP BY week，不平均周比例。" },
    { operationKey: 'ba-funnel', title: '累计与相邻分母不同', code: 'SELECT SUM(enrolled_count) AS enrolled, SUM(first_lesson_count) AS first_lesson,\n SUM(first_lesson_count) * 1.0 / NULLIF(SUM(enrolled_count), 0) AS first_lesson_conversion,\n SUM(week_one_active_count) * 1.0 / NULLIF(SUM(first_lesson_count), 0) AS active_conversion,\n SUM(week_one_active_count) * 1.0 / NULLIF(SUM(enrolled_count), 0) AS active_cumulative\nFROM weekly_funnel WHERE week BETWEEN :start_week AND :end_week;\n-- 其余相邻环节同理；人数损失是上一环节人数减下一环节人数。' },
    { operationKey: 'ba-segments', title: '同一窗口内按课程或渠道重算', code: "SELECT CASE WHEN :segment_by = 'course_track' THEN course_track ELSE signup_source END AS segment_key,\n SUM(enrolled_count) AS enrolled, SUM(completed_count) AS completed,\n SUM(support_contact_count) * 100.0 / NULLIF(SUM(enrolled_count), 0) AS support_per_100_enrolled\nFROM weekly_funnel WHERE week BETWEEN :start_week AND :end_week\nGROUP BY CASE WHEN :segment_by = 'course_track' THEN course_track ELSE signup_source END;\n-- 主指标分母沿B2、相邻环节沿B3；另保留六阶段计数与报名占比，不把支持次数当漏斗人数。" },
  ],
});
artifact(`content/${prefix}/review-private.json`, { status: 'REVIEW', professionalReview: 'PENDING', targetUserTiming: 'PENDING', generatorVersion: 'ba-cohort-aggregate-v1', note: '确定性工程内容，不冒充人工审核或真实商业实验。' });
const windows = { baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 7, comparisonEndWeek: 12 }, metric = { ...windows, numerator: 'completed_count', denominator: 'enrolled_count' };
const cases = [['metric-overall', 'ba-metric', metric], ['metric-starter', 'ba-metric', { ...metric, denominator: 'first_lesson_count' }], ['metric-narrow', 'ba-metric', { ...metric, baselineEndWeek: 1, comparisonStartWeek: 12 }], ['funnel-default', 'ba-funnel', windows], ['funnel-narrow', 'ba-funnel', { baselineStartWeek: 2, baselineEndWeek: 3, comparisonStartWeek: 9, comparisonEndWeek: 10 }], ...TRANSITIONS.map((focusTransitionKey, i) => [`segments-${i + 1}`, 'ba-segments', { ...metric, denominator: i === 4 ? 'first_lesson_count' : 'enrolled_count', segmentBy: i % 2 ? 'signup_source' : 'course_track', focusTransitionKey }])];
const goldens = cases.map(([name, operationKey, parameters]) => ({ name, operationKey, parameters, result: calculateBa(operationKey, rows, parameters, { datasetSha256 }) }));
assert.deepEqual(goldens[0].result.baseline, { numeratorCount: 100, denominatorCount: 180, rate: .555556 });
assert.deepEqual(goldens[0].result.comparison, { numeratorCount: 58, denominatorCount: 179, rate: .324022 });
assert.equal(goldens[0].result.deltaPercentagePoints, -23.153321); assert.equal(goldens[0].result.relativeChange, -.416760);
artifact(`content/${prefix}/golden-private.json`, { schemaVersion: 'ba-golden-v1', datasetSha256, cases: goldens });
const str = (maxLength = 600, minLength = 1) => ({ type: 'string', minLength, maxLength }), choice = values => ({ type: 'string', enum: [...values] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, minItems, maxItems, uniqueItems = false) => ({ type: 'array', items, minItems, maxItems, ...(uniqueItems ? { uniqueItems } : {}) });
const integer = (minimum = 0, maximum = 10000) => ({ type: 'integer', minimum, maximum }), num = (minimum, maximum, nullable = true) => ({ type: nullable ? ['number', 'null'] : 'number', minimum, maximum });
const windowProps = Object.fromEntries(WINDOW_KEYS.map(k => [k, integer(1, 12)])), metricProps = { ...windowProps, numerator: choice(['completed_count']), denominator: choice(['enrolled_count', 'first_lesson_count']) };
const groupKeys = [...GROUPS.course_track, ...GROUPS.signup_source];
const step = (stepKey, title, instructions, properties, dependencies, assetKeys, hints, operationKey = null) => ({ stepKey, title, instructions, dependencies, required: true, responseSchemaVersion: 'ba-response-v1', inputSchema: object(properties), assetKeys, operationKey, hints: hints.map((text, i) => ({ level: i + 1, text })), hintContextFields: [], evidenceFields: Object.keys(properties) });
const steps = [
  step('b1-context', '界定业务问题与可决定的范围', '你是LumenLearn的初级业务分析师。先阅读业务背景和字段口径，用自己的话写出本次要回答的问题与可决定的范围，并勾选当前数据不能回答的事项。一次合成观察不能给出商业效果预测或最终专业判断。', { acknowledged: { type: 'boolean', const: true }, businessQuestion: str(500, 10), decisionScope: str(500, 10), outOfScope: array(choice(['REVENUE', 'SATISFACTION', 'WITHDRAWAL_REASONS']), 1, 3, true) }, [], ['business-brief', 'data-dictionary', 'weekly-funnel'], ['先区分业务想改变什么，与这份数据能说明什么。', '每行是批次、课程与来源的组合；计数的观察窗口相同，但没有收入或满意度字段。', '把问题写成可观察的指标变化与可验证的支持改进，不把“某群体更低”直接写成原因。']),
  step('b2-metric', '定义指标并比较成熟批次', '选择完成率分母与两个等长、不重叠的成熟批次窗口。全部报名者与已开始首课者回答不同问题。先保存选择，再运行固定计算；写明为什么这个口径适合你的问题。趋势按批次展示，不是事件自然周。', { ...metricProps, metricReason: str(600, 10) }, ['b1-context'], ['data-dictionary', 'sql-examples'], ['先把分子、分母和观察窗口写成一句完整定义。', '以首课人数为分母时，指标是已开始学习者完成率，不代表全部报名者的完成表现。', '核对两个窗口的人数，再用合计完成数除以合计分母；百分点变化不等于相对百分比变化。'], 'ba-metric'),
  step('b3-funnel', '比较漏斗并选择重点环节', '比较六阶段累计到达率和五个相邻转化。可以按对比窗口人数损失或转化率百分点变化排序，再自行选择一个重点并解释。排序第一不自动意味着最重要原因。B2分母选择不会改变这里固定的漏斗分母。', { focusTransitionKey: choice(TRANSITIONS), focusReason: str(700, 10) }, ['b2-metric'], ['data-dictionary', 'sql-examples'], ['累计到达率和相邻转化率的分母不同，先看图表标签。', '人数损失大可能只是上一环节人数多；把损失人数和相邻转化一起看。', '选择一个值得进一步检查的环节并说明依据，但不要把观察差异写成已经证明的因果机制。'], 'ba-funnel'),
  step('b4-segment', '选择值得优先验证的群体', '按课程或来源比较同一主指标与B3所选相邻环节。检查人数、报名占比和支持联系，再选择一个优先群体并说明理由。切换维度后重新选择群体；不能只依据单个百分比或把渠道标签当原因。', { segmentBy: choice(Object.keys(GROUPS)), prioritySegmentKey: choice(groupKeys), priorityReason: str(700, 10) }, ['b3-funnel'], ['data-dictionary', 'sql-examples'], ['先问每组有多少人、占整体多少，再读率。', '整体变化也可能来自群体构成变化；组内率与报名占比应一起看。', '核对当前指标与重点环节都来自同一窗口，选择可验证的优先级并保留其他解释，不宣称该群体必然是根因。'], 'ba-segments'),
  step('b5-hypothesis', '分开观察、原因假设与未知信息', '引用B2、B3或B4的当前结果，把观察到的情况、可能原因和仍需信息分开写。自由文本是你的分析，系统不会仅因保存成功就把它验证为事实。注意选择偏差、构成和缺少的个体信息。', { observation: str(700, 10), evidenceStepKey: choice(['b2-metric', 'b3-funnel', 'b4-segment']), hypothesis: str(700, 10), unknownInformation: str(700, 10) }, ['b4-segment'], [], ['观察写数据可直接读到什么，假设写可能为什么，未知写还缺什么。', '引用结果时带上窗口、群体和分母；假设使用“可能”，并提出能区分解释的信息。', '即使某群体转化下降，也不能仅凭聚合表断言提醒不足；可以说明还需了解什么行为或开展怎样的对照。']),
  step('b6-action', '形成有目标和护栏的小范围试验', '围绕当前B4群体提出一项行动、理由与验证方法。选择成功指标和期望提升百分点，并设置支持联系护栏。基线来自该群体对比窗口；它不是预测。最后一名试验参与者入组28或42天后复盘，仍只比较各人前28天结果。依据过期时先重新读取并确认。', { actionKey: choice(['FIRST_LESSON_REMINDER', 'ASSIGNMENT_CHECKLIST', 'GROUP_OFFICE_HOURS', 'CUSTOM']), actionDescription: str(700, 10), actionReason: str(700, 10), targetSegmentKey: choice(groupKeys), successMetric: choice(SUCCESS_METRICS), targetChangePercentagePoints: num(0, 100, false), guardrailMetric: choice(['SUPPORT_CONTACTS_PER_100_ENROLLED']), guardrailMaximum: num(0, Number.MAX_SAFE_INTEGER, false), reviewAfterDays: { type: 'integer', enum: [28, 42] }, testPlan: str(900, 10) }, ['b5-hypothesis'], ['business-brief', 'data-dictionary'], ['行动需要对象、成功指标、副作用护栏与复盘时间，目标不是预测。', '核对目标群体仍等于B4选择；基线使用该群体对比窗口，不是整体或基准窗口。', '写明小范围试行和可比群体；护栏为支持联系次数/100名报名者。42天复盘不意味着把42天累计结果和28天基线比较。']),
];
const ratioSchema = object({ numeratorCount: integer(), denominatorCount: integer(), rate: num(0, 1) });
const transitionSchema = object({ numeratorCount: integer(), denominatorCount: integer(), conversionRate: num(0, 1), lossCount: integer() });
const stageCountsSchema = object(Object.fromEntries(STAGES.map(k => [k, integer()])));
const periodSchema = object({ stageCounts: stageCountsSchema, enrolledShare: num(0, 1), metric: ratioSchema, focusTransition: transitionSchema, supportContactCount: integer(), supportContactsPer100Enrolled: num(0, 1000000) });
const common = { schemaVersion: { type: 'string', const: 'ba-result-v1' }, datasetSha256: str(64, 64), windows: object({ baseline: object({ startWeek: integer(1, 12), endWeek: integer(1, 12) }), comparison: object({ startWeek: integer(1, 12), endWeek: integer(1, 12) }) }), observation: object({ windowDays: { type: 'integer', const: 28 }, cohortBasis: { type: 'string', const: 'ENROLLMENT_WEEK' }, weekOneActiveBasis: { type: 'string', const: 'FIRST_LESSON_7_DAYS_WITHIN_28_DAY_WINDOW' } }) };
const operations = ['ba-metric', 'ba-funnel', 'ba-segments'].map((operationKey, i) => {
  const properties = i === 0 ? metricProps : i === 1 ? windowProps : { ...metricProps, focusTransitionKey: choice(TRANSITIONS), segmentBy: choice(Object.keys(GROUPS)) };
  const own = i === 0 ? Object.keys(metricProps) : i === 1 ? [] : ['segmentBy'];
  const result = i === 0 ? { numerator: choice(['completed_count']), denominator: metricProps.denominator, baseline: ratioSchema, comparison: ratioSchema, deltaPercentagePoints: num(-100, 100), relativeChange: num(-1, 1000000), trend: array(object({ week: integer(1, 12), ...ratioSchema.properties }), 12, 12) } : i === 1 ? { stages: array(object({ stageKey: choice(STAGES), baseline: object({ count: integer(), cumulativeRate: num(0, 1) }), comparison: object({ count: integer(), cumulativeRate: num(0, 1) }) }), 6, 6), transitions: array(object({ transitionKey: choice(TRANSITIONS), fromStageKey: choice(STAGES), toStageKey: choice(STAGES), baseline: transitionSchema, comparison: transitionSchema, deltaPercentagePoints: num(-100, 100) }), 5, 5) } : { numerator: choice(['completed_count']), denominator: metricProps.denominator, segmentBy: choice(Object.keys(GROUPS)), focusTransitionKey: choice(TRANSITIONS), segments: array(object({ segmentKey: choice(groupKeys), baseline: periodSchema, comparison: periodSchema, metricDeltaPercentagePoints: num(-100, 100), transitionDeltaPercentagePoints: num(-100, 100) }), 2, 3) };
  return { operationKey, stepKey: steps[i + 1].stepKey, engineType: 'BUSINESS_ANALYSIS', engineVersion: 'ba-metrics-v1', parametersSchema: object(properties), resultSchema: object({ ...common, operationKey: { type: 'string', const: operationKey }, ...result }), maxEvaluations: 30, publicAssetKeys: ['weekly-funnel', 'data-dictionary', 'sql-examples'], privateAssetKeys: [], datasetAssetKey: 'weekly-funnel', ownResponseBindings: own.map(parameterKey => ({ parameterKey, sourceField: parameterKey })), inputBindings: Object.keys(properties).filter(k => !own.includes(k)).map(parameterKey => ({ parameterKey, sourceStepKey: parameterKey === 'focusTransitionKey' ? 'b3-funnel' : 'b2-metric', sourceField: parameterKey })) };
});
const assets = [...files].map(([path, raw]) => ({ assetKey: path.split('/').at(-1).replace(/\.(json|csv)$/, ''), path: path.slice(8), visibility: path.includes('-private.') ? 'PRIVATE' : 'PUBLIC', mediaType: path.endsWith('.csv') ? 'text/csv' : 'application/json', sha256: sha(raw), byteLength: Buffer.byteLength(raw) }));
const manifest = { schemaVersion: 'task-manifest-v4', taskVersionId, contentKind: 'MAJOR', majorCode: 'BUSINESS_ANALYTICS', demoKey: null, versionCode: '1.0.0', title: '商业分析：从指标变化到可检验行动', scenario: 'LumenLearn希望理解成熟课程批次的完成率变化。你将定义指标、比较漏斗和群体，提出有目标、护栏与复盘方法的小范围行动。合成观察不证明因果，不预测真实收益；专业审核和目标用户计时尚待完成。', goals: ['统一分子、分母和成熟观察窗口', '比较漏斗与群体而不把排序当原因', '区分观察、假设和未知', '提出可验证、有护栏的行动方案'], estimatedMinutes: { minimum: 45, maximum: 60 }, assets, steps, operations, reflection: { questionSetVersion: 'ba-reflection-v1', instructions: '回顾本次定义指标、选择优先级与提出行动的兴趣和困难，不评价长期能力。可选追问失败可跳过。', inputSchema: object({ interestingStepKeys: array(choice([...steps.map(s => s.stepKey), 'NONE']), 1, 3, true), difficultySources: array(choice(['KNOWLEDGE', 'TOOLS', 'TIME', 'WORK_STYLE', 'OTHER', 'NONE']), 1, 3, true), continueSimilarWork: choice(['YES', 'UNSURE', 'NO']), reflectionNote: str(500, 0), nextWorkStyle: choice(['MODEL_ITERATION', 'DATA_REASONING', 'BUSINESS_ACTION', 'UNSURE', 'SKIPPED']), aiFollowUp: str(500, 0) }, ['interestingStepKeys', 'difficultySources', 'continueSimilarWork']) }, review: { kind: 'PROFESSIONAL', checkKeys: ['PROFESSIONAL_CORE', 'BEGINNER_ACCESS', 'DATA_CORRECTNESS', 'EVIDENCE_SOURCES', 'HINT_NO_FINAL_ANSWER', 'FAIRNESS', 'CHROME_EDGE', 'TIMING_45_60', 'RECOVERY', 'VERSION_CONSISTENCY'], professionalReviewRequired: true } };
artifact(`content/${prefix}/manifest.json`, manifest);
const schema = JSON.parse(readFileSync(new URL('contracts/schemas/task-manifest-v3.json', root), 'utf8'));
schema.$id = 'https://majorpilot.invalid/schemas/task-manifest-v4.json'; schema.properties.schemaVersion.const = 'task-manifest-v4'; schema.properties.contentKind = { const: 'MAJOR' }; schema.properties.majorCode = { const: 'BUSINESS_ANALYTICS' }; schema.properties.demoKey = { const: null };
schema.properties.operations.items.properties.engineType = { const: 'BUSINESS_ANALYSIS' }; schema.properties.operations.items.properties.engineVersion = { const: 'ba-metrics-v1' };
artifact('contracts/schemas/task-manifest-v4.json', schema);
for (const [path, text] of files) { const url = new URL(path, root); if (process.argv.includes('--check')) assert.equal(readFileSync(url, 'utf8'), text, `Generated artifact drift: ${path}`); else { mkdirSync(dirname(fileURLToPath(url)), { recursive: true }); writeFileSync(url, text); } }
console.log(JSON.stringify({ result: 'PASS', mode: process.argv.includes('--check') ? 'check' : 'generate-review-only', artifacts: files.size, aggregateRows: rows.length, canonicalLearners: 359, sourceSha256: sourceSha, datasetSha256, goldenCases: goldens.length, paidModelCalls: 0 }));
