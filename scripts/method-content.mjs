// Reproducible authoring of the method-led edition. Never rewrites 1.0.0 assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
if (process.argv.slice(2).some(v => v !== '--check')) throw Error('Only --check is supported');
const checkOnly = process.argv.includes('--check');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const write = (p, value) => { const file = path.join(root, p); const bytes = JSON.stringify(value, null, 2) + '\n'; if (checkOnly) { if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== bytes) throw Error(`Generated method content differs: ${p}`); } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); } return Buffer.from(bytes); };
const text = () => ({ type: 'string', minLength: 1, maxLength: 1600 });
const choice = values => ({ type: 'string', enum: values });
const integer = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const object = props => ({ type: 'object', additionalProperties: false, properties: props, required: Object.keys(props) });
const field = (key, label, help = '', schema = text()) => ({ key, label, help, schema });
const options = (key, label, values, labels) => ({ ...field(key, label, '', choice(values)), options: Object.fromEntries(values.map((v, i) => [v, labels[i]])) });
const dsSpec = set => object({ duplicatePolicy: choice(['REMOVE_EXACT', 'KEEP_ALL']), excludedRowIds: { type: 'array', items: { type: 'string', maxLength: 7 }, minItems: 0, maxItems: 360, uniqueItems: true }, earlyThroughDay: integer(0, 27), latestDay: integer(1, 28), missingDaysPolicy: choice(['EXCLUDE_FROM_COMPARISON']), resultSet: choice([set]) });
const baSpec = () => object({ resultSet: choice(['FOCUS']), baselineStartWeek: integer(1, 12), baselineEndWeek: integer(1, 12), comparisonStartWeek: integer(1, 12), comparisonEndWeek: integer(1, 12), courseTrack: choice(['ALL', 'FOUNDATIONS', 'APPLIED']), signupSource: choice(['ALL', 'ORGANIC', 'PARTNER', 'CAMPAIGN']), numerator: choice(['first_lesson_count', 'week_one_active_count', 'assignment_started_count', 'assignment_submitted_count', 'completed_count']), denominator: choice(['enrolled_count', 'first_lesson_count', 'week_one_active_count', 'assignment_started_count', 'assignment_submitted_count']) });
const baKeys = ['baselineNumerator', 'baselineDenominator', 'baselinePercent', 'comparisonNumerator', 'comparisonDenominator', 'comparisonPercent'];
const dsKeys = set => set === 'CLEANING' ? ['retainedRows', 'uniqueLearners', 'duplicateRowsRemoved'] : (set === 'COMPARISON' ? ['all'] : ['FOUNDATIONS', 'APPLIED']).flatMap(p => ['earlyCount', 'earlyCompleted', 'earlyPercent', 'laterCount', 'laterCompleted', 'laterPercent'].map(k => `${p}.${k}`));
const local = (major, set) => ({ major, resultSet: set, specificationSchema: major === 'DATA_SCIENCE' ? dsSpec(set) : baSpec(), valueKeys: major === 'DATA_SCIENCE' ? dsKeys(set) : baKeys,
  defaultSpecification: major === 'DATA_SCIENCE' ? { duplicatePolicy: 'REMOVE_EXACT', excludedRowIds: [], earlyThroughDay: 3, latestDay: 28, missingDaysPolicy: 'EXCLUDE_FROM_COMPARISON', resultSet: set } : { resultSet: 'FOCUS', baselineStartWeek: 1, baselineEndWeek: 6, comparisonStartWeek: 7, comparisonEndWeek: 12, courseTrack: 'ALL', signupSource: 'ALL', numerator: 'first_lesson_count', denominator: 'enrolled_count' } });
const step = (key, title, introduction, fields, checkpoint = null, extra = {}) => ({ key, title, introduction, fields, checkpoint, ...extra });
const plans = [
  { folder: 'ai-support', major: 'AI', prefix: 'AI', id: '01JA2000000000000000000001', name: '先找错在哪里，再试着改一次', title: 'AI：让课程求助消息分得更可靠', method: '错误分析与有限迭代',
    scope: '你体验的是检查模型如何犯错、决定改什么、比较改动的代价。这里只使用固定的轻量分类器，不训练大型模型，也不证明系统已经能上线。',
    steps: [
      step('a1-task', '先认识这份工作', '课程团队每天会收到求助消息。分类器把消息分为技术问题、知识理解、学习安排、学习支持。你不需要会编程：先看看自动分类哪里值得信任、哪里需要人来接手。', [field('taskUnderstanding', '你认为这次需要检查什么？', '例如：把技术故障分成知识问题，会把消息送错给谁？也可以写现在还不确定的地方。')]),
      step('a2-metrics', '自动处理得多，就一定好吗？', '小例子：10条消息中，系统自动处理6条，其中5条分对；另4条交给人工。5÷6描述“自动处理的里面有多少分对”，6÷10描述“有多少交给系统”。交给人工不算系统分对，也不等于系统分错。', [field('accuracyMeaning', '5÷6在说什么？'), field('coverageMeaning', '6÷10在说什么？'), field('humanReviewMeaning', '那4条交给人工的消息，为什么不能直接算作分对？')], 'AI-C1', { rubric: ['区分自动处理准确率5/6与覆盖率6/10。人工复核不是正确分类，未自动处理不应混入已自动分类的准确率分母。'] }),
      step('a3-errors', '从具体错例找出值得改的地方', '下载Excel，查看“原始数据”的公开练习消息、系统预测和参考标签。先找至少两条分错的消息，比较它们有什么共同点；找不到两个有共同点的错例，也可以说明为什么暂时不能概括。参考标签只是本次教学任务的对照。', [field('errorIds', '引用哪些公开消息ID？'), field('errorPattern', '这些消息为什么容易分错？', '指向消息中的具体词或含义；证据不够时请直说。'), field('errorCost', '分错后会给谁带来什么麻烦？')], 'AI-C2', { rubric: ['核对引用是否为公开练习ID；共同点必须能在引用消息中找到。至少两例才支持共同模式，明确承认样本不足也合理。错误代价须与分类情境相符。'] }),
      step('a4-configure', '选择一次有理由的改动', '可以改标签说明、加入一个例子，或者调整交给人工的门槛。尽量一次只改一种；如果同时改了几种，后面就不能确定是哪一种造成变化。保持原方案也是允许的，但请解释。', [field('changeReason', '你想解决哪一类问题，为什么选择这个改动？'), field('expectedTradeoff', '你预期会变好什么，又可能多出什么代价？')]),
      step('a5-evaluate', '在同一批消息上比较', '点击下方“运行”，把你的设置放到同一个固定评价集中，与原方案比较。多分对一些但交给人工更多，并不是毫无代价的改进。反复尝试同一批消息，结果也不代表在新消息上一定一样好。', [field('comparison', '与原方案相比，准确率、覆盖率和人工工作分别怎样变了？'), field('tradeoff', '你怎么看这个变化？', '没有提升也可以形成合理判断。引用实际结果，不把预期当作结果。')], 'AI-C3', { rubric: ['比较同一评价集的准确率、覆盖率、人工复核与错误类别。指出配置是否改变；多因素调整不能归因于单一因素。无提升不自动代表推理错误。'] }),
      step('a6-decision', '交付建议，再换个情境想一想', '新情境：A方案处理100条中的90条，81条正确；B处理60条，57条正确。B自动处理的准确率较高，但更多消息需要人工。不要把这道小题的数据和刚才运行的数据混在一起。', [field('decision', '对你刚才的方案，你建议保留、改进后再看，还是暂不使用？为什么？'), field('risk', '还要留意什么风险？'), field('transfer', '在这个新情境里，B是否一定比A好？请说明。')], null, { transfer: 'AI-C3' }),
    ],
  },
  { folder: 'ds-learning', major: 'DATA_SCIENCE', prefix: 'DS', id: '01JD2000000000000000000001', name: '先看数据靠不靠谱，再说它说明了什么', title: 'DS：早点开始学习，与完成课程有关吗？', method: '探索性数据分析',
    scope: '你体验的是理解记录、处理数据、比较结果并限制结论。没有要求写代码或训练模型，也不能凭这份观察数据证明一个做法会让人完成课程。',
    steps: [
      step('d1-context', '先弄清一行是什么', '这里有360条合成学习记录，按学员记录学习开始时间及28天内是否完成。先下载Excel，并看“字段说明”。一行记录不等于一名新学员：重复行需要另外检查。课程、报名来源等字段已经在文件里。', [field('unit', '一行在记录什么？用哪个字段辨认学员？'), field('question', '你希望通过比较回答什么问题？')]),
      step('d2-quality', '重复、没开始、空白，不能一起删', '例子：同一学员的两行每个字段都一样，可以考虑保留一行；只看ID相同不能断定整行重复。开始天数为0表示当天开始，空白表示没有这个数值。“没有开始”的人和“开始了但没记天数”的人也不同。', [field('cleaningReason', '你怎样区分这些情况，为什么这样处理？')], 'DS-C1', { local: local('DATA_SCIENCE', 'CLEANING'), rubric: ['精确重复不等于重复ID；保留未开始者用于总体描述。0为当天，未开始的天数不适用与开始但缺失分开。选择保留重复或排除行可有合理解释，不强制唯一处理法。'] }),
      step('d3-profile', '比较两组，先把人数算清楚', '本次基础比较只看已经开始、而且开始天数有效的人。默认把0–3天开始与4–28天开始分成两组。每组完成率=该组完成人数÷该组总人数；不是除以全部学员。你也可调整分界并说明理由。', [field('comparisonReason', '你看到什么差异？这个结论只包括哪些人？')], 'DS-C2', { local: local('DATA_SCIENCE', 'COMPARISON'), rubric: ['同时考虑各组人数、完成人数与百分比。分母是该组已开始且天数有效的人，不代表未开始和缺失天数者。边界和排除规则依学生选择复算，不强迫特定方向。'] }),
      step('d4-relationship', '换到同一种课程里，还一样吗？', '两种课程的难度和学员可能不同。现在分别在基础课程、应用课程里面做刚才的比较。结果没有反转也完全正常；重点是看课程构成会不会影响整体解释。某组没有人时，比例无法计算，不是0%。', [field('courseObservation', '分开课程以后，你会怎样补充或调整刚才的解释？')], null, { local: local('DATA_SCIENCE', 'COURSE_CHECK') }),
      step('d5-stratify', '看到关系，等于找到原因吗？', '即使早点开始的人完成率较高，也可能是他们本来更有时间、动机或准备。课程和来源已经在表里，可以继续比较；个人时间安排、动机等没有记录，不能假装知道。', [field('causalReason', '能否据此保证“让大家提前开始就会提高完成率”？为什么？'), field('nextQuestion', '还想弄清什么？先说明它是已有字段，还是要另外收集。')], 'DS-C3', { rubric: ['区分观察关系与干预效果，具体指出其他可能解释及尚未记录的信息。不把课程和来源误说成原始文件没有的信息。'] }),
      step('d6-conclusion', '写一份简短结论，再试一道新题', '新情境：论坛发帖较多的人完成率更高。这里只记录了发帖与完成情况，没有安排谁必须发帖。', [field('workProduct', '你处理了什么、发现了什么、还有什么不能确定？'), field('transfer', '如果要求每个人多发帖，就一定能提高完成率吗？为什么？')], null, { transfer: 'DS-C3' }),
    ],
  },
  { folder: 'ba-learning', major: 'BUSINESS_ANALYTICS', prefix: 'BA', id: '01JB2000000000000000000001', name: '找出哪里值得先处理，再想办法验证', title: 'BA：课程团队下一步应该先做什么？', method: '学习流程分析与行动验证',
    scope: '你体验的是用人数和比例确定值得先处理的问题、区分现象与原因、设计下一步。它不是统计考试，也不要求商科背景；商业分析还有财务、定价等本案例没有覆盖的工作。',
    steps: [
      step('b1-context', '先弄清比例在回答什么', '小例子：100人报名，80人开始，40人完成。40÷100回答“报名的人中多少完成”，40÷80回答“开始的人中多少完成”。主案例有第1–6批与第7–12批，每个人都观察报名后28天；这是不同批次的人，不是同一批人的前后变化。', [field('enrollmentRate', '40÷100在说什么？'), field('starterRate', '40÷80在说什么？'), field('cohortMeaning', '为什么不能把两批完成率差异直接解释为同一个人变差了？')], 'BA-C1', { rubric: ['区分报名分母与首课分母；不同批次且每人28天，不是个人纵向变化。错误分母可能影响后续比率，但不必据此否定所有行动想法。'] }),
      step('b2-metric', '沿着学习流程找一个值得先处理的地方', 'Excel给出报名、首课、首周活跃、开始作业、提交作业、完成的人数。选相邻两步：后一步人数÷前一步人数。再看有多少人没有继续。先加总人数再算比例，不平均小组的百分比；也别把比例最低直接当作原因。', [field('focusReason', '你选择先关注哪一步，为什么？'), field('otherTransition', '再比较至少一个其他环节：写出两期人数和比例，为什么不先选它？')], null, { local: local('BUSINESS_ANALYTICS', 'FUNNEL') }),
      step('b3-funnel', '先帮助谁？数字之外还缺什么？', '按课程或来源缩小范围，比较人数规模与当前问题。可以选择规模较小但值得先试的群体；请解释，不必一律选跌得最多的。表里没有团队预算、真实联系渠道或未启动原因，不要把自己的猜测写成事实。', [field('priorityReason', '先关注哪个群体？结合人数、比例和你准备做的事解释。'), field('feasibility', '落实之前还要向团队确认什么？')], null, { local: local('BUSINESS_ANALYTICS', 'SEGMENT') }),
      step('b4-segment', '我们知道发生了什么，但知道原因了吗？', '“首课人数少了”是观察；“提醒没有送达”是一种解释；“这些人是否收到并看懂提醒”是还需查的信息。课程和来源人数已经在表里，不能当成完全未知。几个主动反馈的人，也不能代表所有人。', [field('observed', '目前数据能确认什么？'), field('possibleReason', '你怀疑的一个原因是什么？为什么还不能确定？'), field('needToKnow', '接下来查什么，才能支持或推翻这个解释？')], 'BA-C2', { rubric: ['观察有数据依据，原因保留待验证；已有课程与来源交叉计数不应被当成缺失。所需信息与原因假设有关。允许不同合理假设。'] }),
      step('b5-hypothesis', '先试一个办法：怎么看有没有用？', '可先补信息，也可试一个小改动。补信息时想清楚问谁、问什么、怎样避免只听到积极回应。小试验时最好同一时期留一组没有额外改动的人比较，并让两组分母与观察时间一致。A/B测试只是可选方法，不要求复杂统计或虚构预算。', [options('planType', '这一步你选择', ['INFORMATION', 'SMALL_TRIAL'], ['先补充信息', '小范围试一个办法']), field('target', '找谁参与，在什么环节接触？'), field('action', '具体问什么，或具体改什么？'), field('comparison', '怎样覆盖不同情况并记录，或怎样安排比较？'), field('decisionRule', '得到什么结果会让你继续、调整或放弃？', '希望达到的目标不是已经发生的效果；不知道资源上限可写先向团队确认。'), field('negativeImpact', '怎样发现可能带来的麻烦？', '例如给用户添打扰、给支持人员增加工作。联系次数可以多于人数，不能把每100人联系次数叫作人数百分比。')], 'BA-C3', { rubric: ['按学生选择的信息收集或小试验评价，不能把访谈当实验强制要求随机对照。信息路径需覆盖不同情况、记录与改变决策的依据，不捏造已访谈。试验路径需可解释比较、同分母及每人28天、目标与负面影响；非随机仍可合理但须有限制。无须样本量功效或虚构精确预算阈值。'] }),
      step('b6-action', '交付一页行动建议，再换个问题', '新情境：上个月没发提醒，这个月发了提醒，开课比例上升。两个月参与的人可能不同，也可能有其他变化。', [field('workProduct', '用几句话说明优先问题、打算做什么、怎样决定下一步。'), field('transfer', '能否仅据此说“提醒造成了上升”？你还会怎样检查？')], null, { transfer: 'BA-C3' }),
    ],
  },
];
const checkpointHelp = {
  'AI-C1': ['先问分母是谁：全部消息，还是系统已经自动处理的消息？', '5和6来自自动处理组，10是全部消息；4条还要交给人工。', '5/6约83.3%，6/10=60%。较少自动处理可能提高前者，却增加人工工作。', '可用已核对小例子继续：自动处理准确率5/6，覆盖率6/10；它是系统提供的，不是你的计算。'],
  'AI-C2': ['从公开练习表里挑出预测与参考标签不同的行。', '看看两条消息是否都有相近表达、边界模糊或需要额外背景。不要只写“模型不好”。', '如果两例没有共同点，可以写暂时无法概括，并分别说明错分代价。', '可以使用原配置继续评估；后续结果来自固定分类器，不代表你已解决这些错例。'],
  'AI-C3': ['对照原方案与当前方案，先分别看准确率、覆盖率和人工数量。', '若准确率上升但覆盖率下降，问问多出来的人工工作是否值得。', '没有提升也能有合理结论：说清改动没解决什么、还需怎样检查。', '可以以原方案作为比较基线；这份基线是系统提供的数据，不是你的模型训练成果。'],
  'DS-C1': ['先区分0、空白和没有开始；再看是否整行重复。', '不要只按学员ID删重复。可先保留一份原始记录，对每种处理写出理由。', '原始360行包含一条完全重复记录。只删除完全重复时保留359行；不自动丢掉未开始的人。', '可采用“只删完全重复、比较时排除未开始及开始天数缺失”的系统基线。后续计数按你明确选择的规则另行计算。'],
  'DS-C2': ['每一组分别数总人数与完成人数；比例是后者除以前者。', '分组前先选已开始且天数有效的人。没有开始不属于“开始得晚”。', '默认删除完全重复后，0–3天组100人中58人完成，4–28天组200人中93人完成。这个例子不是全部学员完成率。', '可采用已核对的默认两组结果继续：58/100与93/200。它只涵盖已开始且天数有效的人。'],
  'DS-C3': ['看到一起变化，不能知道换一个做法后一定怎样。', '尝试说出一种同时影响开始早晚与完成情况的因素。', '例如个人可支配时间可能同时影响开始时间和完成情况。课程和来源已在表里，不是未记录的因素。', '可在系统说明下继续：这是一份观察数据，关系不证明强制提前开始有效；后面新题仍请写你自己的想法。'],
  'BA-C1': ['先用一句话说分母这群人是谁。', '报名者含尚未开始的人；已开始者只是其中一部分。', '40/100=40%表示报名者的完成率；40/80=50%表示已开始者的完成率，两句话都可能正确但回答不同问题。', '可用系统核对的小例子继续：40%与50%的区别在分母。主案例两期是不同人，每人观察28天。'],
  'BA-C2': ['把你写的句子分成“已经看到”和“可能因为”。', '问自己：表格真的记录了原因，还是只记录了人数与行为？', '“首课人数减少”与“提醒没送达”不是同一种证据。可以先向未开始及已开始的人分别了解是否收到、是否理解。', '可以接受系统中间说明继续：当前计数能描述变化，不能独自证明具体原因；原因需要另查。'],
  'BA-C3': ['你是要先了解原因，还是先试一个改动？两种选择的检查办法不同。', '补信息要避免只问主动回应的人；试改动要想同一时期如果没做这个改动会怎样。', '小试验可比较同批符合条件的人，一组额外提醒，一组沿用原安排；统一观察报名后28天，并留意打扰和支持负荷。这只是例子。', '可参考系统给出的比较思路继续：不把“之后变好了”直接当成改动有效；具体方案仍由你选择。'],
};

const catalog = read('content/catalog.json');
const workbooks = read('content/workbooks/catalog.json');
for (const p of plans) {
  const original = read(`content/${p.folder}/1.0.0/manifest.json`);
  const m = structuredClone(original);
  Object.assign(m, { schemaVersion: p.major === 'AI' ? 'task-manifest-v2' : 'task-manifest-v5', taskVersionId: p.id, versionCode: '2.0.0', title: p.title,
    scenario: 'LumenLearn合成教学情境。' + p.scope, goals: [p.name, '先看简短讲解，再提交自己的想法；需要时可以求助和修改', '把本次表现、所获帮助和本人感受分开理解'] });
  if (p.major !== 'AI') m.operations = [];
  const guide = { schemaVersion: 'method-guide-v1', methodVersion: 'method-led-v1', methodName: p.method, scope: p.scope, steps: [], checkpoints: [] };
  m.steps = p.steps.map((s, i) => {
    if (s.transfer) {
      s.fields.splice(s.fields.findIndex(f => f.key === 'transfer'), 0, options('transferMode', '这道新情境小题（可选）', ['ANSWER', 'SKIP'], ['尝试回答', '这次先不回答，保留为未作答']));
      s.fields.find(f => f.key === 'transfer').schema = { ...text(), minLength: 0 };
    }
    const props = Object.fromEntries(s.fields.map(f => [f.key, f.schema]));
    if (s.local) {
      const l = s.local;
      props.local = object({ workbookVersion: text(), workbookSha256: { type: 'string', minLength: 64, maxLength: 64 }, method: choice(['SUPPORTED', 'OTHER']), specification: l.specificationSchema,
        values: object(Object.fromEntries(l.valueKeys.map(k => [k, { type: 'string', minLength: 1, maxLength: 40 }]))), reason: text() });
    }
    if (p.major === 'AI' && s.key === 'a4-configure') {
      const old = original.steps.find(x => x.stepKey === s.key).inputSchema.properties;
      for (const k of ['definitionVariant', 'exampleId', 'confidenceThreshold']) if (old[k]) props[k] = old[k];
      // Execution bindings are pinned to these exact original configuration fields.
      for (const binding of m.operations[0].inputBindings) props[binding.sourceField] = old[binding.sourceField];
    }
    const schema = object(props);
    const hints = (s.checkpoint ? checkpointHelp[s.checkpoint].slice(0, 3) : ['先回看这一页的小例子。', '可写出现在确定的部分和还不清楚的部分。', '不要求专业术语；把你怎么想的说清楚即可。']).map((v, j) => ({ level: j + 1, text: v }));
    guide.steps.push({ stepKey: s.key, title: s.title, introduction: s.introduction, fields: s.fields.map(({ schema, ...f }) => f), checkpointId: s.checkpoint, transferCheckpointId: s.transfer || null, local: s.local || null });
    if (s.checkpoint) {
      const supports = ['BASIC', 'HINT_1', 'HINT_2', 'HINT_3', 'RECOVERY'].map((kind, n) => ({ supportId: `${s.checkpoint.toLowerCase()}-${kind.toLowerCase().replace('_', '-')}`, version: 'support-v1', kind, text: n === 0 ? s.introduction : checkpointHelp[s.checkpoint][n - 1] }));
      for (const v of supports) v.sha256 = hash(Buffer.from(v.text));
      guide.checkpoints.push({ checkpointId: s.checkpoint, stepKey: s.key, answerSchema: schema, transferQuestionId: null, transferStepKey: null, transferSchema: null, supports, criteria: s.rubric, dependencies: guide.checkpoints.map(c => c.checkpointId) });
    }
    return { stepKey: s.key, title: s.title, instructions: s.introduction, dependencies: i ? [p.steps[i - 1].key] : [], required: true, responseSchemaVersion: 'method-response-v1', inputSchema: schema,
      assetKeys: [...new Set(['method-guide', ...(original.steps.find(o => o.stepKey === s.key)?.assetKeys || [])])], operationKey: p.major === 'AI' && s.key === 'a5-evaluate' ? m.operations[0].operationKey : null, hints, hintContextFields: Object.keys(props).filter(k => props[k].type === 'string'), evidenceFields: Object.keys(props) };
  });
  const transfer = p.steps.find(s => s.transfer);
  const cp = guide.checkpoints.find(c => c.checkpointId === transfer.transfer);
  cp.transferQuestionId = `${p.prefix.toLowerCase()}-transfer-1`; cp.transferStepKey = transfer.key; cp.transferSchema = m.steps.find(s => s.stepKey === transfer.key).inputSchema;
  // Config operation can depend on a4 only. Other steps preserve a simple linear navigation.
  if (p.major === 'AI') m.steps.find(s => s.stepKey === 'a5-evaluate').dependencies = ['a4-configure'];
  const guidePath = `${p.folder}/2.0.0/method-guide.json`;
  const bytes = write(`content/${guidePath}`, guide);
  m.assets.push({ assetKey: 'method-guide', path: guidePath, visibility: 'PUBLIC', mediaType: 'application/json', sha256: hash(bytes), byteLength: bytes.length });
  m.reflection.instructions = '回想你刚才真正体验到的工作：哪些愿意继续、哪里觉得困难、帮助是否有用？不确定也可以。这些感受不由题目对错代替。';
  m.reflection.questionSetVersion = 'method-reflection-v1';
  const keys = m.reflection.inputSchema.properties.interestingStepKeys?.items;
  if (keys?.enum) keys.enum = [...p.steps.map(s => s.key), 'NONE'];
  const manifestPath = `${p.folder}/2.0.0/manifest.json`;
  const manifestBytes = write(`content/${manifestPath}`, m);
  if (!catalog.manifests.includes(manifestPath)) catalog.manifests.push(manifestPath);
  // These public-data workbooks were already authored for this method design.
  // Bind the unchanged file version explicitly; never relabel file contents as 2.0.0.
  const workbook = structuredClone(workbooks.workbooks.find(w => w.taskVersionId === original.taskVersionId));
  workbook.taskVersionId = p.id; workbook.manifestSha256 = hash(manifestBytes);
  workbooks.workbooks = workbooks.workbooks.filter(w => w.taskVersionId !== p.id); workbooks.workbooks.push(workbook);
}
write('content/catalog.json', catalog);
write('content/workbooks/catalog.json', workbooks);
console.log(`${checkOnly?'Verified':'Authored'} three version 2.0.0 manifests; preserved original assets and workbook file versions.`);
