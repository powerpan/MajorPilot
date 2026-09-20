// Build-time, fixed-seed synthetic REVIEW content. No env/network/database access.
// --check verifies committed bytes. Published content needs a new version/id.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { calculateDs, validateRows, NUMERIC_FIELDS, GROUPS, BINS } from '../shared/ds/ds-stats-v1.mjs';
const root = new URL('../', import.meta.url), prefix = 'ds-learning/1.0.0', taskVersionId = '01JD1000000000000000000001';
const files = new Map(), json = value => JSON.stringify(value, null, 2) + '\n', sha = value => createHash('sha256').update(value).digest('hex');
const artifact = (path, value) => files.set(path, typeof value === 'string' ? value : json(value));
let seed = 271828; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = values => values[Math.floor(random() * values.length)], integer = max => Math.floor(random() * max);
const canonical = [];
for (let i = 0; i < 359; i++) {
  const cohort_week = Math.floor(i / 30) + 1, late = cohort_week > 6;
  const course_track = random() < (late ? .67 : .36) ? 'APPLIED' : 'FOUNDATIONS';
  const signup_source = pick(late ? ['ORGANIC', 'PARTNER', 'CAMPAIGN', 'CAMPAIGN'] : ['ORGANIC', 'ORGANIC', 'PARTNER', 'CAMPAIGN']);
  const device_group = pick(signup_source === 'CAMPAIGN' ? ['mobile', 'mobile', 'mixed', 'desktop'] : ['desktop', 'desktop', 'mixed', 'mobile']);
  const first_lesson = random() < (late ? .84 : .95), days = first_lesson ? Math.min(28, integer(late ? 13 : 8) + (signup_source === 'CAMPAIGN' ? integer(5) : 0)) : null;
  const week_one_active = first_lesson && random() < (days < 7 ? .93 : .66);
  const assignment_started = week_one_active && random() < .94, assignment_submitted = assignment_started && random() < .91;
  const completed = assignment_submitted && random() < (course_track === 'APPLIED' ? .64 : .85);
  const lessons_started = !first_lesson ? 0 : completed ? 8 : 1 + integer(8);
  const submissions = !assignment_submitted ? 0 : completed ? 4 : 1 + integer(4);
  const row = { learner_id: `learner-${String(i + 1).padStart(3, '0')}`, cohort_week, course_track, signup_source, device_group, lessons_started, lessons_completed: completed ? 8 : Math.min(7, integer(lessons_started + 1)), assignment_submit_rate: submissions / 4, avg_session_minutes: first_lesson ? 6 + integer(35) + (course_track === 'APPLIED' ? integer(15) : 0) : null, days_to_first_lesson: days, forum_visits: first_lesson ? integer(10) : 0, support_contacts: integer(4), completed };
  canonical.push({ row, events: { first_lesson, week_one_active, assignment_started, assignment_submitted } });
}
const active = canonical.filter(c => c.row.lessons_started > 0);
[180, 210, 240].forEach((value, index) => { active[index].row.avg_session_minutes = value; });
active[3].row.forum_visits = 45; active[4].row.support_contacts = 12;
const sourceRows = canonical.map(c => c.row), rows = structuredClone(sourceRows);
const injected = { avg_session_minutes: [], days_to_first_lesson: [], assignment_submit_rate: [] };
let cursor = 10;
for (const [field, count] of [['avg_session_minutes', 10], ['days_to_first_lesson', 8], ['assignment_submit_rate', 6]]) for (let n = 0; n < count; n++) { const id = active[cursor++].row.learner_id; rows.find(r => r.learner_id === id)[field] = null; injected[field].push(id); }
const duplicate = rows.find(r => r.learner_id === active[40].row.learner_id); rows.push(structuredClone(duplicate));
validateRows(rows); assert.equal(rows.length, 360); assert.equal(new Set(rows.map(r => r.learner_id)).size, 359);
const funnel = [];
for (let week = 1; week <= 12; week++) for (const course_track of GROUPS.course_track) for (const signup_source of GROUPS.signup_source) {
  const group = canonical.filter(c => c.row.cohort_week === week && c.row.course_track === course_track && c.row.signup_source === signup_source);
  funnel.push({ week, course_track, signup_source, enrolled_count: group.length, first_lesson_count: group.filter(c => c.events.first_lesson).length, week_one_active_count: group.filter(c => c.events.week_one_active).length, assignment_started_count: group.filter(c => c.events.assignment_started).length, assignment_submitted_count: group.filter(c => c.events.assignment_submitted).length, completed_count: group.filter(c => c.row.completed).length, support_contact_count: group.reduce((sum, c) => sum + c.row.support_contacts, 0) });
}
for (const row of funnel) { const counts = ['enrolled_count', 'first_lesson_count', 'week_one_active_count', 'assignment_started_count', 'assignment_submitted_count', 'completed_count'].map(k => row[k]); assert.ok(counts.every((n, i) => i === 0 || n <= counts[i - 1])); }
artifact(`content/${prefix}/learner-activity.json`, rows);
const columns = Object.keys(rows[0]);
artifact(`content/${prefix}/learner-activity-csv.csv`, [columns.join(','), ...rows.map(row => columns.map(key => row[key] === null ? '' : typeof row[key] === 'boolean' ? Number(row[key]) : row[key]).join(','))].join('\n') + '\n');
artifact(`content/${prefix}/canonical-events-private.json`, { generatorVersion: 'learning-synthetic-v1', seed: 271828, records: canonical, futureWeeklyFunnel: funnel, injectedMissing: injected, duplicateLearnerId: duplicate.learner_id });
const dictionary = {
  schemaVersion: 'ds-dictionary-v1', observationUnit: 'LEARNER', synthetic: true,
  introduction: '360条原始记录来自359名合成学员，其中一条完全重复。未来业务漏斗从原始事件事实去重聚合，总报名人数为359；不会随你选择的清洗方案改变。',
  targetDefinition: 'completed表示在同一规定周期内完成8个核心单元和全部4项作业。目标字段始终保留原始记录值，填补其他字段不会重新判定是否完成。',
  fields: [
    ['learner_id', '合成学员标识', '无业务含义；原始表有一条完全重复记录。', 'identifier'], ['cohort_week', '加入批次', '1至12；每个批次均已到达同一规定观察截止时间，避免把新批次尚未观察完误作未完成。', 'week'],
    ['course_track', '课程方向', 'FOUNDATIONS基础课程／APPLIED应用课程；不代表学生专业或能力。', 'category'], ['signup_source', '报名来源', 'ORGANIC自然／PARTNER合作／CAMPAIGN活动。', 'category'], ['device_group', '常用设备', 'desktop桌面／mobile移动／mixed混用；观察差异不能证明设备导致完成变化。', 'category'],
    ['lessons_started', '开始的核心单元数', '0至8；0表示尚未开始学习。', 'count'], ['lessons_completed', '完成的核心单元数', '0至8，不能超过开始数。', 'count'], ['assignment_submit_rate', '作业提交率', '提交项数除以固定4项作业，对全部报名者适用；未学习者为0。空值是记录缺失，不能自动当作未提交。', 'ratio'],
    ['avg_session_minutes', '平均会话时长', '分钟，0至240。未开始者空值为不适用；已开始者空值是记录缺失。很长的会话可能有多种解释，不自动认定错误。', 'minute'], ['days_to_first_lesson', '首次学习等待时间', '天，0至28。0代表同日开始；未开始者空值为不适用，不得中位数填补；已开始者空值才是记录缺失。', 'day'],
    ['forum_visits', '论坛访问次数', '观察期内0至60次；较高次数不直接说明更高学习动机。', 'count'], ['support_contacts', '联系支持次数', '观察期内0至20次；不是联系过支持的人数。', 'count'], ['completed', '是否按期完成', 'true或false；没有记录缺失。', 'boolean'],
  ].map(([fieldKey, label, description, unit]) => ({ fieldKey, label, description, unit })),
  bins: BINS, groupOrder: GROUPS, notes: ['cohort_period：1至6周为EARLY，7至12周为LATE。', '保留重复时，统计分母是记录数而不是独立学员人数。', 'Wilson区间依赖二项独立观测假设，不能消除重复、缺失、非随机样本和混杂的限制。', 'Pearson仅描述当前成对有效记录的线性关系，不证明因果；常量或少于两条时为null。', '所有数据均为合成，未完成真实用户计时或专业人工审核。'],
};
artifact(`content/${prefix}/data-dictionary.json`, dictionary);
const groupPython = `from math import sqrt
def group_key(row, field):
    if field == "cohort_period":
        return "EARLY" if row["cohort_week"] <= 6 else "LATE"
    if field == "days_to_first_lesson_band":
        day = row["days_to_first_lesson"]
        if day is None: return None  # 缺失和不适用都不进入等待时间分组
        return "SAME_DAY" if day < 1 else "DAYS_1_2" if day < 3 else "DAYS_3_6" if day < 7 else "DAYS_7_PLUS"
    return row[field]

def grouped_completion(rows, group_by, group_order):
    result = []
    for key in group_order:  # 数据字典的固定顺序；空组也保留
        group = [row for row in rows if group_key(row, group_by) == key]
        n = len(group)
        k = sum(row["completed"] for row in group)
        p = k / n if n else None
        if n:
            z = 1.959963984540054
            den = 1 + z*z/n
            center = (p + z*z/(2*n)) / den
            half = z * sqrt((p*(1-p) + z*z/(4*n))/n) / den
            interval = (max(0, center-half), min(1, center+half))
        else:
            interval = (None, None)
        result.append({"key": key, "n": n, "completed_count": k,
                       "completion_rate": p, "wilson_95": interval})
    return result
`;
const scatterPython = `from math import sqrt
def paired_summary(rows, x_field, y_field):
    pairs = [(row[x_field], row[y_field]) for row in rows
             if row[x_field] is not None and row[y_field] is not None]
    n = len(pairs)  # 0 是有效数值，不能用 if row[field] 来筛选
    if not n: return {"n": 0, "mean_x": None, "mean_y": None, "r": None}
    mean_x = sum(x for x, y in pairs) / n
    mean_y = sum(y for x, y in pairs) / n
    xx = sum((x-mean_x)**2 for x, y in pairs)
    yy = sum((y-mean_y)**2 for x, y in pairs)
    xy = sum((x-mean_x)*(y-mean_y) for x, y in pairs)
    r = max(-1, min(1, xy/sqrt(xx*yy))) if n >= 2 and xx > 0 and yy > 0 else None
    return {"n": n, "mean_x": mean_x, "mean_y": mean_y, "r": r}
`;
artifact(`content/${prefix}/python-examples.json`, {
  schemaVersion: 'ds-python-examples-v1', executionNotice: '以下是与当前分支统计定义等价的只读Python核心公式示例，不在浏览器执行Python，也不是完整执行器。cleaned_rows、当前字段和固定分组顺序来自已保存方案及数据字典；示例省略输入校验、质量计数、结果哈希和最终六位舍入。实际计算由固定JavaScript计算器预览并由Java服务端重算；不接受用户代码。',
  snippets: [
    { operationKey: 'ds-quality-clean', title: '去重、缺失与缩尾顺序', code: 'fields = ["avg_session_minutes", "days_to_first_lesson", "assignment_submit_rate"]\ndef missing(row, field):\n    return row[field] is None and (field == "assignment_submit_rate" or row["lessons_started"] > 0)\n# 先按全部原始列精确去重并保留第一行；如选择KEEP则跳过此步。\n# DROP_MISSING只删除any(missing(row, f) for f in fields)的行。\n# MEDIAN_NUMERIC各列先从同一去重后快照计算中位数，再仅填补missing。\n# CAP_P95最后对非空会话时长取Type7的0.95分位，并用min(value, cap)缩尾。' },
    { operationKey: 'ds-profile', title: '分位数与完成率的不同分母', code: 'def quantile_type7(values, p):\n    a = sorted(values)\n    if not a: return None\n    h = (len(a) - 1) * p\n    lo = int(h)\n    return a[lo] + (h - lo) * (a[min(lo + 1, len(a) - 1)] - a[lo])\ncompletion_rate = sum(row["completed"] for row in cleaned_rows) / len(cleaned_rows) if cleaned_rows else None\nvalid = [row[field] for row in cleaned_rows if row[field] is not None]\n# 变量统计的分母为len(valid)，完成率分母为len(cleaned_rows)。' },
    { operationKey: 'ds-relationship', relationshipMode: 'GROUP_COMPLETION', title: '分组完成率与Wilson区间（只读公式）', code: groupPython + '\nresult = grouped_completion(cleaned_rows, group_by, group_order)\n# 每组分母为该组有效记录数，不是所有报名者，也不计算Pearson。\n# 区间不能消除重复、缺失、非随机样本或混杂的影响。' },
    { operationKey: 'ds-relationship', relationshipMode: 'SCATTER', title: '成对有效的Pearson（只读公式）', code: scatterPython + '\nresult = paired_summary(cleaned_rows, x_field, y_field)\n# 两项均值和r使用同一个成对有效集合；相关不代表因果。' },
    { operationKey: 'ds-stratify', relationshipMode: 'GROUP_COMPLETION', title: '分层后的分组完成率（只读公式）', code: groupPython + '\noverall = grouped_completion(cleaned_rows, group_by, group_order)\nlayers = []\nfor stratum in stratum_order:\n    part = [row for row in cleaned_rows if group_key(row, stratify_by) == stratum]\n    layers.append({"key": stratum, "retained_rows": len(part),\n                   "groups": grouped_completion(part, group_by, group_order)})\n# 每层重新计数k和n并计算Wilson区间；不平均各层比例或区间。\n# stratify_by只允许课程或早晚批次，且不能与group_by相同。' },
    { operationKey: 'ds-stratify', relationshipMode: 'SCATTER', title: '分层后的成对相关（只读公式）', code: scatterPython + '\ndef layer_key(row, field):\n    return ("EARLY" if row["cohort_week"] <= 6 else "LATE") if field == "cohort_period" else row[field]\n\noverall = paired_summary(cleaned_rows, x_field, y_field)\nlayers = []\nfor stratum in stratum_order:\n    part = [row for row in cleaned_rows if layer_key(row, stratify_by) == stratum]\n    layers.append({"key": stratum, "retained_rows": len(part),\n                   "summary": paired_summary(part, x_field, y_field)})\n# 每层重新建立成对有效集合；不能平均各层r得到整体r。\n# 这里只报告成对n、均值与r，不生成未定义的相关区间或因果结论。' },
  ],
});
artifact(`content/${prefix}/review-private.json`, { status: 'REVIEW', professionalReview: 'PENDING', targetUserTiming: 'PENDING', generatorVersion: 'learning-synthetic-v1', note: '仅完成确定性工程数据准备；不冒充人工内容审核或45–60分钟目标用户测试。' });
const clean = { duplicatePolicy: 'DROP_EXACT', missingPolicy: 'KEEP_NULL', extremePolicy: 'KEEP' };
const cases = [
  ['quality-keep', 'ds-quality-clean', clean], ['quality-drop', 'ds-quality-clean', { ...clean, missingPolicy: 'DROP_MISSING' }], ['quality-median-cap', 'ds-quality-clean', { ...clean, missingPolicy: 'MEDIAN_NUMERIC', extremePolicy: 'CAP_P95' }], ['quality-duplicate', 'ds-quality-clean', { ...clean, duplicatePolicy: 'KEEP' }],
  ['profile-session', 'ds-profile', { ...clean, distributionField: 'avg_session_minutes' }],
  ['group-device', 'ds-relationship', { ...clean, relationshipMode: 'GROUP_COMPLETION', groupBy: 'device_group' }], ['group-delay', 'ds-relationship', { ...clean, relationshipMode: 'GROUP_COMPLETION', groupBy: 'days_to_first_lesson_band' }],
  ['scatter', 'ds-relationship', { ...clean, relationshipMode: 'SCATTER', xField: 'days_to_first_lesson', yField: 'assignment_submit_rate' }],
  ['stratify-group', 'ds-stratify', { ...clean, relationshipMode: 'GROUP_COMPLETION', groupBy: 'device_group', stratifyBy: 'cohort_period' }], ['stratify-scatter', 'ds-stratify', { ...clean, relationshipMode: 'SCATTER', xField: 'days_to_first_lesson', yField: 'assignment_submit_rate', stratifyBy: 'course_track' }],
];
const datasetSha256 = sha(files.get(`content/${prefix}/learner-activity.json`)), goldens = [];
for (const [name, operationKey, parameters] of cases) goldens.push({ name, operationKey, parameters, result: await calculateDs(operationKey, rows, parameters, { datasetSha256 }) });
assert.equal(goldens[0].result.retainedRows, 359); assert.equal(goldens[1].result.retainedRows, 335); assert.equal(goldens[2].result.quality.imputations.reduce((s, f) => s + f.count, 0), 24);
artifact(`content/${prefix}/golden-private.json`, { schemaVersion: 'ds-golden-v1', datasetSha256, cases: goldens });
const str = (maxLength = 600, minLength = 1) => ({ type: 'string', minLength, maxLength }), choice = values => ({ type: 'string', enum: values }), count = () => ({ type: 'integer', minimum: 0, maximum: 10000 });
const num = (minimum = 0, maximum = 10000, nullable = true) => ({ type: nullable ? ['number', 'null'] : 'number', minimum, maximum });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false }), array = (items, minItems = 0, maxItems = 360, uniqueItems = false) => ({ type: 'array', items, minItems, maxItems, ...(uniqueItems ? { uniqueItems } : {}) });
const cleanProps = { duplicatePolicy: choice(['KEEP', 'DROP_EXACT']), missingPolicy: choice(['KEEP_NULL', 'DROP_MISSING', 'MEDIAN_NUMERIC']), extremePolicy: choice(['KEEP', 'CAP_P95']) };
const relationProps = { relationshipMode: choice(['GROUP_COMPLETION', 'SCATTER']), groupBy: choice(Object.keys(GROUPS)), xField: choice(NUMERIC_FIELDS), yField: choice(NUMERIC_FIELDS) };
const step = (stepKey, title, instructions, properties, required, dependencies, assetKeys, hints, operationKey = null) => ({ stepKey, title, instructions, dependencies, required: true, responseSchemaVersion: 'ds-response-v1', inputSchema: object(properties, required), assetKeys, operationKey, hints: hints.map((text, i) => ({ level: i + 1, text })), hintContextFields: [], evidenceFields: Object.keys(properties) });
const steps = [
  step('d1-context', '理解数据与分析问题', '你是LumenLearn的初级数据分析师，要理解完成率下降时有哪些关系值得进一步检查。每行是一条合成学员记录，不是一天或一个班级。先阅读数据字典，尤其是观察截止时间、完成定义、重复与空值。目标是形成可复核的发现与限制，不是证明单一原因。', { acknowledged: { type: 'boolean', const: true }, observationUnit: choice(['LEARNER', 'COURSE', 'DAY']), targetField: choice(['completed', 'support_contacts', 'device_group']) }, undefined, [], ['learner-activity', 'data-dictionary'], ['先确认一行代表什么，再解释比例。', '完成率的分母和字段有效数可能不同；批次都应有同样的观察机会。', '查看learner_id与cohort_week：同一行不是每周重复测量，且一条完全重复记录可能改变计数。']),
  step('d2-quality', '检查并处理数据质量', '检查缺失、重复和合理极端值，选择处理策略，并分别解释重复与缺失的处理理由。不适用不等于缺失，0不等于空值。缩尾会改动测量值但不证明原值错误。运行后比较处理前后的记录数；你可以修改方案，后续图表需要重新核验。', { identifiedIssues: array(choice(['EXACT_DUPLICATE', 'MISSING_RECORD', 'REASONABLE_EXTREME', 'NOT_APPLICABLE']), 2, 4, true), ...cleanProps, duplicateReason: str(500, 10), missingReason: str(500, 10) }, undefined, ['d1-context'], ['learner-activity', 'data-dictionary', 'python-examples'], ['先分别计数重复、缺失和不适用，不急着删除所有空格。', '用lessons_started判断会话和首课字段是否适用；作业提交率对全部报名者适用。', '对一条未开始学习记录检查空值，再对一条已开始但缺少首课日期的记录检查空值：它们不应被同样填补。'], 'ds-quality-clean'),
  step('d3-profile', '查看分布与统计分母', '选择一个数值字段，比较均值、中位数、四分位数与完整直方图。完成率使用清洗后所有保留记录，变量分布只用该字段有效记录。请解释为什么这两个分母可能不同；不要只用平均数描述全部学员。', { distributionField: choice(NUMERIC_FIELDS), sampleInterpretation: str(600, 10) }, undefined, ['d2-quality'], ['data-dictionary', 'python-examples'], ['查看计数、单位和空值说明，再读图。', '对比均值与中位数，看看长尾是否影响平均值。', '选择平均会话时长，核对直方图各格之和是否等于有效记录数，而不是直接等于保留记录数。'], 'ds-profile'),
  step('d4-relationship', '探索两个变量的关系', '选择分组完成率或散点关系。前者明确以completed为因变量；后者选择两个不同数值字段，只计算两轴同时有效的记录。结果由固定计算器产生，不执行Python。写出你观察到的关系及可能的反例，避免把相关说成原因。', { ...relationProps, observation: str(700, 10) }, ['relationshipMode', 'observation'], ['d3-profile'], ['data-dictionary', 'python-examples'], ['先确认你想比较群体比例，还是看两个数值变量怎样共同变化。', '散点的两项均值与r来自同一个成对有效集合；缺失一轴的记录不能参与计算。', '可以比较首课等待天数与提交率，但即使相关明显，也应检查批次、课程或选择偏差是否提供其他解释。'], 'ds-relationship'),
  step('d5-stratify', '分层检查解释与不确定性', '保持D4关系定义不变，按课程方向或早晚批次分层。各层重新计算，不把各层r平均成整体r。分组比例有Wilson区间，散点只有成对n、均值和r，不虚构相关区间。说明分层后的变化与仍然不知道的内容。', { stratifyBy: choice(['course_track', 'cohort_period']), uncertaintyComment: str(800, 10), causalJudgment: choice(['INSUFFICIENT_FOR_CAUSAL_CLAIM', 'OBSERVATIONAL_ASSOCIATION_ONLY', 'CLAIMS_CAUSAL_SUPPORT']) }, undefined, ['d4-relationship'], ['data-dictionary', 'python-examples'], ['先核对每层分母是否变小，再比较整体与层内结果。', '相同整体关系可能在不同课程或批次内变弱、变强或不一致。', '若选设备分组，尝试按早晚批次分层；写出数据支持的观察和仍需收集的信息，而不是要求区间替你证明原因。'], 'ds-stratify'),
  step('d6-conclusion', '写出有限且可复核的结论', '整理两到三个发现，各自引用D3、D4或D5，区分支持、不支持和证据不足。再写一个不能由这些观察推出的因果结论、当前限制和下一步可验证问题。系统记录你的分析，不自动把自由文本当作经过证明的事实，也不输出专业适配分数。', { findings: array(object({ statement: str(500, 10), evidenceStepKey: choice(['d3-profile', 'd4-relationship', 'd5-stratify']), verdict: choice(['SUPPORTED', 'NOT_SUPPORTED', 'INSUFFICIENT_EVIDENCE']) }), 2, 3), unsupportedCausalClaim: str(500, 10), limitations: str(700, 10), nextQuestion: str(500, 10) }, undefined, ['d5-stratify'], [], ['每个发现先指出它引用哪次分析。', '把观测、可能解释和仍未知的事项分别写清楚。', '即使看到首课延迟与完成有关，也不能断言缩短延迟一定提高完成率；你可以提出一个能进一步检验的设计。']),
];
const exclusionSchema = object(Object.fromEntries(['missingOnly', 'notApplicableOnly', 'both', 'total'].map(k => [k, count()])));
const completionSchema = object({ n: count(), completedCount: count(), completionRate: num(0, 1), ciLower: num(0, 1), ciUpper: num(0, 1) });
const qualityField = object({ fieldKey: choice(NUMERIC_FIELDS), validCount: count(), missingCount: count(), notApplicableCount: count() });
const qualitySchema = object({ duplicateRows: count(), duplicateGroups: array(object({ learnerId: str(30), rowNumbers: array(count(), 2, 360) })), removedDuplicateRows: count(), removedMissingRows: count(), before: array(qualityField, 3, 3), after: array(qualityField, 3, 3), imputations: array(object({ fieldKey: choice(NUMERIC_FIELDS), count: count(), median: num() }), 3, 3), cappedRows: count(), capValue: num() });
const relationshipSchema = object({ relationshipMode: choice(['GROUP_COMPLETION', 'SCATTER']), analysisRows: count(), exclusions: exclusionSchema, groupBy: choice(Object.keys(GROUPS)), groups: array(object({ key: str(80), ...completionSchema.properties }), 0, 5), xField: choice(NUMERIC_FIELDS), yField: choice(NUMERIC_FIELDS), scatter: object({ n: count(), meanX: num(), meanY: num(), r: num(-1, 1) }), points: array(object({ rowNumber: count(), x: num(0, 240, false), y: num(0, 240, false) })) }, ['relationshipMode', 'analysisRows', 'exclusions']);
const commonResult = { schemaVersion: { type: 'string', const: 'ds-result-v1' }, operationKey: choice(cases.map(c => c[1]).filter((k, i, a) => a.indexOf(k) === i)), datasetSha256: str(64, 64), cleaningConfigSha256: str(64, 64), inputRows: count(), retainedRows: count(), uniqueLearners: count(), analysisRows: count(), exclusions: exclusionSchema, quality: qualitySchema };
const profileSchema = object({ distributionField: choice(NUMERIC_FIELDS), completion: completionSchema, validCount: count(), missingCount: count(), notApplicableCount: count(), mean: num(), minimum: num(), q25: num(), median: num(), q75: num(), maximum: num(), histogram: array(object({ lower: num(0, 240, false), upper: num(0, 240, false), upperInclusive: { type: 'boolean' }, count: count() }), 4, 5) });
const operations = ['ds-quality-clean', 'ds-profile', 'ds-relationship', 'ds-stratify'].map((operationKey, i) => {
  const stepKey = steps[i + 1].stepKey, properties = { ...cleanProps, ...(i === 1 ? { distributionField: choice(NUMERIC_FIELDS) } : i >= 2 ? relationProps : {}), ...(i === 3 ? { stratifyBy: choice(['course_track', 'cohort_period']) } : {}) }, required = Object.keys(properties).filter(k => !['groupBy', 'xField', 'yField'].includes(k));
  const ownKeys = i === 0 ? Object.keys(cleanProps) : i === 1 ? ['distributionField'] : i === 2 ? Object.keys(relationProps) : ['stratifyBy'];
  const inputBindings = Object.keys(properties).filter(k => !ownKeys.includes(k)).map(parameterKey => ({ parameterKey, sourceStepKey: Object.hasOwn(cleanProps, parameterKey) ? 'd2-quality' : 'd4-relationship', sourceField: parameterKey }));
  const resultSchema = object({ ...commonResult, ...(i === 1 ? { profile: profileSchema } : i === 2 ? { relationship: relationshipSchema } : i === 3 ? { stratified: object({ stratifyBy: choice(['course_track', 'cohort_period']), overall: relationshipSchema, strata: array(object({ key: str(80), retainedRows: count(), summary: relationshipSchema }), 2, 2) }) } : {}) });
  return { operationKey, stepKey, engineType: 'DATA_ANALYSIS', engineVersion: 'ds-stats-v1', parametersSchema: object(properties, required), resultSchema, maxEvaluations: 30, publicAssetKeys: ['learner-activity', 'data-dictionary', 'python-examples'], privateAssetKeys: [], datasetAssetKey: 'learner-activity', inputBindings, ownResponseBindings: ownKeys.map(parameterKey => ({ parameterKey, sourceField: parameterKey })) };
});
const assets = [...files].map(([path, raw]) => ({ assetKey: path.split('/').at(-1).replace(/\.(json|csv)$/, ''), path: path.slice(8), visibility: path.includes('-private.') ? 'PRIVATE' : 'PUBLIC', mediaType: path.endsWith('.csv') ? 'text/csv' : 'application/json', sha256: sha(raw), byteLength: Buffer.byteLength(raw) }));
const checks = ['PROFESSIONAL_CORE', 'BEGINNER_ACCESS', 'DATA_CORRECTNESS', 'EVIDENCE_SOURCES', 'HINT_NO_FINAL_ANSWER', 'FAIRNESS', 'CHROME_EDGE', 'TIMING_45_60', 'RECOVERY', 'VERSION_CONSISTENCY'];
const manifest = { schemaVersion: 'task-manifest-v3', taskVersionId, contentKind: 'MAJOR', majorCode: 'DATA_SCIENCE', demoKey: null, versionCode: '1.0.0', title: '数据科学：从学习记录到有限结论', scenario: 'LumenLearn近期课程完成率下降。你要检查合成学习记录的质量，探索关系并说明不确定性，形成可复核的分析摘要。本内容为工程预览，专业人工审核和目标用户计时仍待完成。', goals: ['区分重复、缺失、不适用与合理极端值', '比较分布、分组完成率或散点关系', '通过分层与明确分母检查解释', '表达发现、因果限制与下一步问题'], estimatedMinutes: { minimum: 45, maximum: 60 }, assets, steps, operations, reflection: { questionSetVersion: 'ds-reflection-v1', instructions: '回顾本次处理数据、探索关系和说明限制的感受，不把一次任务当成长期能力判断。可选AI追问只在主动请求时生成，失败可跳过。', inputSchema: object({ interestingStepKeys: array(choice([...steps.map(s => s.stepKey), 'NONE']), 1, 3, true), difficultySources: array(choice(['KNOWLEDGE', 'TOOLS', 'TIME', 'WORK_STYLE', 'OTHER', 'NONE']), 1, 3, true), continueSimilarWork: choice(['YES', 'UNSURE', 'NO']), reflectionNote: str(500, 0), nextWorkStyle: choice(['MODEL_ITERATION', 'DATA_REASONING', 'BUSINESS_ACTION', 'UNSURE', 'SKIPPED']), aiFollowUp: str(500, 0) }, ['interestingStepKeys', 'difficultySources', 'continueSimilarWork']) }, review: { kind: 'PROFESSIONAL', checkKeys: checks, professionalReviewRequired: true } };
artifact(`content/${prefix}/manifest.json`, manifest);
const schema = JSON.parse(readFileSync(new URL('contracts/schemas/task-manifest-v1.json', root), 'utf8'));
schema.$id = 'https://majorpilot.invalid/schemas/task-manifest-v3.json'; schema.properties.schemaVersion.const = 'task-manifest-v3';
const op = schema.properties.operations.items; op.properties.engineType.enum.push('DATA_ANALYSIS');
op.properties.inputBindings = array(object({ parameterKey: str(80), sourceStepKey: str(80), sourceField: str(80) }), 0, 30);
op.properties.ownResponseBindings = array(object({ parameterKey: str(80), sourceField: str(80) }), 0, 30); op.required.push('inputBindings', 'ownResponseBindings');
artifact('contracts/schemas/task-manifest-v3.json', schema);
artifact('contracts/examples/p4-ds-run.json', { purpose: 'Synthetic engineering acceptance fixture, not human review or timing evidence', taskVersionId, responseSchemaVersion: 'ds-response-v1', responses: {
  'd1-context': { acknowledged: true, observationUnit: 'LEARNER', targetField: 'completed' },
  'd2-quality': { identifiedIssues: ['EXACT_DUPLICATE', 'MISSING_RECORD', 'NOT_APPLICABLE'], ...clean, duplicateReason: '完全重复记录会给同一学员重复权重，因此先保留第一条。', missingReason: '先保留记录缺失，针对每次分析报告有效分母，不填补未开始者的不适用值。' },
  'd3-profile': { distributionField: 'avg_session_minutes', sampleInterpretation: '完成率使用保留记录作为分母，会话分布只包含该字段有效记录，两者不能混用。' },
  'd4-relationship': { relationshipMode: 'SCATTER', xField: 'days_to_first_lesson', yField: 'assignment_submit_rate', observation: '我观察首课等待时间与提交率的成对记录关系；缺少任一轴的记录没有参与。' },
  'd5-stratify': { stratifyBy: 'course_track', uncertaintyComment: '分层后的样本量更小，课程构成与缺失可能影响关系，相关系数不能替代因果检验。', causalJudgment: 'INSUFFICIENT_FOR_CAUSAL_CLAIM' },
  'd6-conclusion': { findings: [{ statement: '会话时长分布的有效记录数不同于完成率分母，需要分别说明。', evidenceStepKey: 'd3-profile', verdict: 'SUPPORTED' }, { statement: '当前成对数据与分层关系仍不足以识别缩短等待时间的因果效果。', evidenceStepKey: 'd5-stratify', verdict: 'INSUFFICIENT_EVIDENCE' }], unsupportedCausalClaim: '不能仅凭相关就说缩短首次学习等待时间一定会提高完成率。', limitations: '合成样本、缺失与重复处理以及课程构成都限制了对真实学生的推广。', nextQuestion: '在相同课程和批次中开展小范围随机提醒试验，能否观察到首课启动和完成的变化？' },
}, groupAlternative: { relationshipMode: 'GROUP_COMPLETION', groupBy: 'device_group', observation: '比较设备组的完成比例和各自分母，观察差异但不把设备解释为原因。' }, reflection: { questionSetVersion: 'ds-reflection-v1', answers: { interestingStepKeys: ['d2-quality', 'd5-stratify'], difficultySources: ['KNOWLEDGE'], continueSimilarWork: 'YES', nextWorkStyle: 'DATA_REASONING', aiFollowUp: 'SKIPPED' } } });
let checked = 0;
for (const [path, text] of files) { const url = new URL(path, root); if (process.argv.includes('--check')) assert.equal(readFileSync(url, 'utf8'), text, `Generated artifact drift: ${path}`); else { mkdirSync(dirname(url.pathname), { recursive: true }); writeFileSync(url, text); } checked++; }
console.log(JSON.stringify({ result: 'PASS', mode: process.argv.includes('--check') ? 'check' : 'generate-review-only', artifacts: checked, rawRows: 360, uniqueLearners: 359, injectedMissing: 24, goldenCases: goldens.length, paidModelCalls: 0 }));
