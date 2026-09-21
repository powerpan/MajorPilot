# P5 Business Analytics 实施接缝

> 2026-09-21：P4工程提交8b9d616推送核对后开始实施，P5本地工程验收现已通过，具体测试及Git交付见[交付记录](./23-p2-to-p6-delivery-ledger.md#8-p5-实施与工程验收)。依据用户离线自主决策授权、[任务设计](./09-three-major-task-designs.md)与[实施路线](./16-implementation-roadmap-and-traceability.md)确定，仍不越过人工审核或公开部署门禁。

## 1. 核心体验与复用边界

BA 的最终成果是指标诊断与小范围行动实验方案。学生必须定义指标、比较两期漏斗、选择优先群体、区分观测和原因假设，并说明成功指标、护栏及复盘时间。没有商业效果预测、唯一正确行动、专业适配分数或自动排名。

复用现有 Run/Step/Reflection、保存冲突、暂停切换、Worker、服务端重算和证据流水线；不复制状态机，不把 BA 变成 DS 数据清洗或 Pearson 练习。B1–B6 后是独立 Reflection。所有分析自由文本初始为空，候选行动只是起点，不替学生填写依据或方案。

内容保持 REVIEW / REVIEW_PREVIEW。工程预览关闭会形成内部证据，但不计正式完成、NEXT 或报告。真实专家审核、零代码学生试用与 45–60 分钟计时仍待人工记录。普通验证不调用付费模型。

## 2. 固定业务数据与观察窗口

- 只从 P4 已冻结的完整 canonical events 生成 BA 资产；不读取学生选择的 DS 清洗表，也不重新随机生成学员。生成器必须核对源文件 SHA，新的 BA bundle 保存自身资产及来源元数据，不通过公共 manifest 泄漏其他专业的私有路径。
- 公共业务表为 12 个入学批次周 × 2 课程方向 × 3 来源渠道，共 72 行，含任务设计 §3.3 的所有字段。包括没有报名者的组合，计数为0。
- week 是“加入课程的批次周”，不是事件发生的自然周。统一观察每名学员加入后完整28天的累积结果；全部12批次均已成熟。28天是 BA 教学情境的明确化，不追改已冻结 DS 内容或暗示现有数据有真实事件时间戳。
- 基准批次1–6与对比批次7–12：报名180/179、首课166/142、首周活跃146/104、开始作业137/94、提交作业126/85、完成100/58；支持联系次数283/269。总报名359，与 canonical 唯一学员一致。
- 漏斗必须满足完成≤提交作业≤开始作业≤首周活跃≤首课≤报名。支持联系是事件次数，可超过人数，不作为漏斗的一层，也不称联系人数。
- week_one_active 明确定义为“首次开课后7天内达到活跃条件，且仍在报名28天观察期内”，界面显示“开课首周活跃”，不是报名后首7天。冻结数据中40人的首课晚于报名第7天但此标记为true；所有首课最晚第16天，前述定义在时间范围上相容。它是合成事件标记，没有真实事件时间戳，不声称已经审计过真实日志。此澄清不修改P4数据。
- 所有数据合成；无收入、满意度、退课人数、真实个人属性。没有的数据不能补成0。不同课程/渠道构成可能改变聚合率，差异本身不是因果。

窗口参数是1..12整数，起点≤终点，两个窗口等长、不重叠、基准结束早于对比开始。默认1–6与7–12，仅为可修改控件默认，不是解释答案。一个窗口内先合计分子分母再相除，不能平均每周或每组百分比。

## 3. 步骤与输入合同

| 步骤 | 已保存输入 | 固定操作与任务产物 |
| --- | --- | --- |
| b1-context | acknowledged、businessQuestion、decisionScope、outOfScope | 情境、数据字典、业务边界；澄清完成下降与本次可决定的小范围支持改进，收入/满意度属于未知 |
| b2-metric | numerator、denominator、baselineStartWeek/EndWeek、comparisonStartWeek/EndWeek、metricReason | ba-metric；定义两期主指标，展示12批次趋势与真实分母 |
| b3-funnel | focusTransitionKey、focusReason | ba-funnel；先比较5个相邻转化，再选择重点并解释 |
| b4-segment | segmentBy、prioritySegmentKey、priorityReason | ba-segments；按课程或来源比较两期，保留样本与构成意识 |
| b5-hypothesis | observation、evidenceStepKey、hypothesis、unknownInformation | 观测、可能原因、尚缺信息分开填写；引用 B2/B3/B4 |
| b6-action | actionKey、actionDescription、actionReason、targetSegmentKey、successMetric、targetChangePercentagePoints、guardrailMetric、guardrailMaximum、reviewAfterDays、testPlan | 一项行动、成功与副作用指标、明确复盘与验证方法，无自动效果预测 |

各字段最终枚举/长度固定进不可变 manifest；自由文本校验只验证存在/长度，不把主张内容宣告为正确。B1业务问题/决策范围采用学生短文表达；outOfScope从收入、满意度等当前未观测指标选择。只读说明讲清情境，不制造考试式总分。

B2分子首版为 completed_count，分母可选 enrolled_count 或 first_lesson_count。后者必须命名“已开始学习者完成率”，不得沿用总体完成率标签。B3漏斗累计率始终以报名为分母，相邻转化率以明确的上一环节人数为分母，与B2条件指标区别显示。

B3可排序候选环节（按人数损失或转化率百分点变化），显示排序口径，但选择与解释由学生作出，不自动判定“排序第一就是原因”。人数损失使用对比窗口的 comparison.lossCount 降序；转化率变化使用 deltaPercentagePoints 升序（下降最多的在前），不可计算的 null 放末尾。并列时均按五个环节的固定漏斗顺序破平局，不采用另一项指标暗中排序。focusTransitionKey引用5个合法相邻环节。排序仅为界面视图，不改变统计配置/成功配额。

B4 segmentBy 为 course_track 或 signup_source；prioritySegmentKey须属于当前维度，切换维度清除旧选择。结果同时显示当前主指标和B3所选环节转化，不能只呈现百分比。选择优先级不改变计算值，但后续 B6 目标必须引用当前选择，允许学生回到B4修改。

B6候选行动：首课提醒、作业清单、集中答疑、CUSTOM；都需自行填写行动描述、依据与验证计划。successMetric为整体完成、首课、首周活跃、作业提交中的一项（分母报名），或当前B2的已开始者完成率；标签和口径明确。目标提升用百分点而不是百分比，属于学生试验目标而非模型预测。护栏固定为每100名报名者的支持联系次数，guardrailMaximum是可观察上限，可以大于100。

成功指标与护栏的基线统一取B4当前所选群体、对比窗口；不是全站，也不是基准窗口。群体结果额外保留六个stageCounts，以便选择与B2/B3不同的成功指标时仍有可复核分子分母。目标显示“基线＋学生期望提升”，不称预计效果；比率目标不超过100%。分母0时显示“尚无可计算基线”，要求更换指标/窗口后再完成行动方案，不填0凑数。护栏用“次/100人”，不是百分比。

B6虽无独立计算operation，服务端完成校验仍必须读取当前B4、与当前已保存来源revision一致的 SERVER_VERIFIED 结果；不得接受客户端上传的派生基线，也不能借用旧来源或仅浏览器预览结果。校验 targetSegmentKey 与当前B4选择一致，成功指标合法且分母大于0；只有B2当前采用已开始学习者分母时，才允许选择该条件完成率。由该群体对比窗口的 stageCounts 计算基线，验证 baselineRate × 100 + targetChangePercentagePoints ≤ 100，并核对护栏固定单位和 reviewAfterDays 的28/42枚举。前端可使用同一规则预检，但不替代服务端校验；完成校验与执行复用同一统计语义，跨步保存/完成钩子不另造计算口径。

reviewAfterDays选择28或42，从最后一名试验参与者入组日开始计时；统计仍只覆盖每个人入组后的前28天，42天是晚14天复盘而非累计42天后对比28天基线。护栏也使用同一28天窗口和报名群体。不能拿未成熟7天数据宣告最终完成改善。试验方案需说明小范围、对照/可比群体与解释限制，不强制声称已开展随机试验。未来若增加7/14天早期检查，须另定义窗口与最终复盘，不在本轮混用分母/观察时长。

## 4. 三个固定计算器

新增 ba-metrics-v1，JS隔离Worker预览、Java白名单重算。只读生成的短SQL是可选教学说明，不接收或执行学生SQL/Python。使用纯函数，不加数据库查询编辑器或图表搭建库。

共同结果含 schemaVersion=ba-result-v1、operationKey、datasetSha256、窗口定义和完整观察期说明。比例内部保留精度，输出统一6位half-up；UI百分比、百分点明确。零分母输出null；基准比例0时相对变化null，不能显示Infinity或“提升无限倍”。结果≤100KiB。

结果单位固定：rate、cumulativeRate、conversionRate 和 relativeChange 都是未乘100的比例；relativeChange = (comparisonRate − baselineRate) / baselineRate，UI显示百分数时才乘100。deltaPercentagePoints = (comparisonRate − baselineRate) × 100，已经是百分点；supportContactsPer100Enrolled = supportContacts / enrolled × 100，已经是“次/100人”，这两项不得再次乘100或共用百分比格式器。例如总体完成率默认窗口的 relativeChange=-0.416760 显示约−41.68%，deltaPercentagePoints=-23.153321 显示约−23.15个百分点；对比窗口支持联系指标150.279330显示约150.28次/100人。所有派生值先用未舍入的计数比例计算，最后才各自舍入。

- ba-metric：输入B2分子/分母和4个窗口字段。两期 numeratorCount/denominatorCount/rate、deltaPercentagePoints、relativeChange；12个批次各自计数与比例。改变分母后每处标题、说明和数值同时更新。
- ba-funnel：只消费B2四个窗口。六个阶段两期 count/cumulativeRate；五个相邻环节两期 numeratorCount/denominatorCount/conversionRate/lossCount 与变化百分点。首阶段累计率在报名0时null；不自动预测“挽回人数”。B3重点与理由是判断字段，不进入配置hash。
- ba-segments：消费B2六字段、B3 focusTransitionKey、当前B4 segmentBy。各组两期六阶段stageCounts、报名量/报名占比/主指标分子分母率、主指标变化百分点、所选环节的分子分母转化率及变化；supportContactsPer100Enrolled单列。固定枚举顺序；用户排序不改变原结果。

此规模只有72聚合行，原生Vue SVG+HTML表格足够。单屏一个主图，数据表保留精确数值；不做3D漏斗、面积隐喻、双轴或动画。原生表格是图表不可用时的完整替代。

## 5. manifest 与版本接缝

新增 task-manifest-v4 / BUSINESS_ANALYSIS / ba-metrics-v1，保留已冻结v1/v2/v3及AI/DS内容。新taskVersionId建议 01JB1000000000000000000001，bundle ba-learning/1.0.0。复用ownResponseBindings/inputBindings，v4允许own为空（B3只消费已保存B2来源）；参数覆盖、实际祖先DAG、安全字段、optional规则不放宽。

正式parameters={}，v4同v3必须expectedSourceRevisions（无祖先{}）。绑定与入口/末端CAS共用；完成、执行和历史当前结果选择一致。B2变化使后续失效；B3重点改变使B4/B5/B6失效，但相同窗口重算可复用ba-funnel；B4群体改变使后续方案重新确认。

每个operation最多30种成功独特配置，默认也计次；相同规范化配置复用免费、失败不扣。HTTP每分钟速率限制独立，不因工程测试取消。文本、优先级与排序不冒充新的计算配置；有序时间窗口不能排序合并。

优先零迁移，继续使用现有保存/执行/来源JSON；确有缺口才新增迁移，不修改V1–V6。本阶段不实现P6报告或P7运营界面。

## 6. 证据与验收

新增冻结 ba-evidence-v1。可观察事实包括实际选择的指标/窗口/维度、尝试了哪类分析及验证后的聚合数值；反思是STUDENT_SELF_REPORT。指标理由、优先级依据、观察原话、原因假设、行动与目标都归属STUDENT_ANALYSIS/UNVERIFIED且allowed_claim_types=[]，不能把目标提升或商业建议写成真实收益。

数据、参数与窗口合法性、所有72行与canonical逐组一致、漏斗单调、加权聚合、零分母/基准0、support次数大于人数、相同输入跨语言、30配额复用、旧source/伪造结果拒绝、切维度清除旧群体、闭包快照和AI/DS兼容都需验证。

真实Chrome/Edge覆盖B1–B6、指标分母/窗口变更、漏斗排序、两个细分维度、行动/护栏/28或42天复盘、保存/暂停/Reflection关闭及私有边界。未运行/失败/过期图不冒充当前计算，图表都有表格替代和轴/口径。视觉验收与真实目标用户试用分别记录。

## 7. 实施前精确接口合同

本节是供实现者对齐的类型合同，不是已实现代码或新增API。公共数据沿用来源资产的 snake_case 字段；计算参数、结果及接口使用 camelCase。以下对象均拒绝未知字段；未标可选的字段必须存在，数值不可计算时明确为 null，不以缺字段或0代替。

### 7.1 数据、枚举与纯JS入口

纯模块计划位于 `shared/ba/ba-metrics-v1.mjs`，配套 `.d.mts`。不依赖 Node、网络、DOM 或 WebCrypto；资产摘要由受控加载器核对后传入，生产Java仍独立读取固定资产并计算摘要。JS调用是同步的，避免依赖隔离Worker中未必存在的 `crypto.subtle`。

```typescript
export type Operation = 'ba-metric' | 'ba-funnel' | 'ba-segments';
export type CourseTrack = 'FOUNDATIONS' | 'APPLIED';
export type SignupSource = 'ORGANIC' | 'PARTNER' | 'CAMPAIGN';
export type SegmentBy = 'course_track' | 'signup_source';
export type SegmentKey = CourseTrack | SignupSource;
export type StageKey =
  | 'enrolled_count' | 'first_lesson_count' | 'week_one_active_count'
  | 'assignment_started_count' | 'assignment_submitted_count' | 'completed_count';
export type TransitionKey =
  | 'ENROLLED_TO_FIRST_LESSON'
  | 'FIRST_LESSON_TO_WEEK_ONE_ACTIVE'
  | 'WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED'
  | 'ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED'
  | 'ASSIGNMENT_SUBMITTED_TO_COMPLETED';
export type StageCounts = Record<StageKey, number>;
export interface WeeklyFunnelRow extends StageCounts {
  week: number;
  course_track: CourseTrack;
  signup_source: SignupSource;
  support_contact_count: number;
}
export interface WindowParameters {
  baselineStartWeek: number; baselineEndWeek: number;
  comparisonStartWeek: number; comparisonEndWeek: number;
}
export interface MetricParameters extends WindowParameters {
  numerator: 'completed_count';
  denominator: 'enrolled_count' | 'first_lesson_count';
}
export interface SegmentParameters extends MetricParameters {
  focusTransitionKey: TransitionKey;
  segmentBy: SegmentBy;
}
export interface ParametersByOperation {
  'ba-metric': MetricParameters;
  'ba-funnel': WindowParameters;
  'ba-segments': SegmentParameters;
}
export interface ResultsByOperation {
  'ba-metric': MetricResult;
  'ba-funnel': FunnelResult;
  'ba-segments': SegmentsResult;
}
export function validateRows(rows: unknown): asserts rows is WeeklyFunnelRow[];
export function normalizeParameters<O extends Operation>(
  operation: O, raw: unknown
): ParametersByOperation[O];
export function calculateBa<O extends Operation>(
  operation: O, rows: readonly WeeklyFunnelRow[], raw: unknown,
  metadata: { datasetSha256: string }
): ResultsByOperation[O];
```

`validateRows`检查恰好72个唯一组合、1..12整数周、固定课程/渠道枚举、非负安全整数计数、漏斗单调及安全整数聚合；零报名组合各事件计数也须为0。支持联系次数没有“≤报名人数”限制。生产资产门禁另外核对源canonical SHA、逐组重聚合与黄金值，单靠表形状验证不代表来源可信。公共JSON为上述72个行对象组成的数组；CSV使用相同字段名。

`normalizeParameters`严格执行第2节窗口约束，不接受字符串数字、null、默认补值或多余字段；返回新对象，键按字典序固定，不修改输入。`calculateBa`内部再次调用同一规范化函数、检查行和64字符小写十六进制摘要；不接收客户端观察结果或计次信息，不在此层计算配置hash。来源revision、配置hash、配额与结果信任沿用通用运行引擎。

### 7.2 固定参数来源

| 操作 | 自身已保存字段 ownResponseBindings | 祖先已保存字段 inputBindings | 明确不属于参数 |
| --- | --- | --- | --- |
| ba-metric / b2-metric | MetricParameters全部6字段 | 无 | metricReason |
| ba-funnel / b3-funnel | 空数组 | B2的WindowParameters全部4字段 | numerator、denominator、focusTransitionKey、focusReason及界面排序 |
| ba-segments / b4-segment | segmentBy | B2的MetricParameters全部6字段，B3的focusTransitionKey | prioritySegmentKey、priorityReason及界面排序 |

上述字段均必填，没有optional分支。正式HTTP执行请求仍为 `parameters: {}`，只另带通用 `inputRevision/expectedSourceRevisions` 等既有控制字段；这不是允许浏览器向正式计算器提交派生参数的新接口。B2的来源向量为 `{}`，B3含B2，B4含B2与B3；服务端以当前已保存revision构建并复核，不能只比较参数值相同。

### 7.3 共享结果与三个分支

```typescript
export interface WindowRange { startWeek: number; endWeek: number }
export interface ResultBase {
  schemaVersion: 'ba-result-v1';
  datasetSha256: string;
  windows: { baseline: WindowRange; comparison: WindowRange };
  observation: {
    windowDays: 28;
    cohortBasis: 'ENROLLMENT_WEEK';
    weekOneActiveBasis: 'FIRST_LESSON_7_DAYS_WITHIN_28_DAY_WINDOW';
  };
}
export interface RatioSummary {
  numeratorCount: number;
  denominatorCount: number;
  rate: number | null;
}
export interface MetricResult extends ResultBase {
  operationKey: 'ba-metric';
  numerator: 'completed_count';
  denominator: MetricParameters['denominator'];
  baseline: RatioSummary;
  comparison: RatioSummary;
  deltaPercentagePoints: number | null;
  relativeChange: number | null;
  trend: Array<RatioSummary & { week: number }>;
}
export interface StagePeriod { count: number; cumulativeRate: number | null }
export interface TransitionPeriod {
  numeratorCount: number;
  denominatorCount: number;
  conversionRate: number | null;
  lossCount: number;
}
export interface FunnelResult extends ResultBase {
  operationKey: 'ba-funnel';
  stages: Array<{
    stageKey: StageKey;
    baseline: StagePeriod;
    comparison: StagePeriod;
  }>;
  transitions: Array<{
    transitionKey: TransitionKey;
    fromStageKey: StageKey;
    toStageKey: StageKey;
    baseline: TransitionPeriod;
    comparison: TransitionPeriod;
    deltaPercentagePoints: number | null;
  }>;
}
export interface SegmentPeriod {
  stageCounts: StageCounts;
  enrolledShare: number | null;
  metric: RatioSummary;
  focusTransition: TransitionPeriod;
  supportContactCount: number;
  supportContactsPer100Enrolled: number | null;
}
export interface SegmentsResult extends ResultBase {
  operationKey: 'ba-segments';
  numerator: 'completed_count';
  denominator: MetricParameters['denominator'];
  segmentBy: SegmentBy;
  focusTransitionKey: TransitionKey;
  segments: Array<{
    segmentKey: SegmentKey;
    baseline: SegmentPeriod;
    comparison: SegmentPeriod;
    metricDeltaPercentagePoints: number | null;
    transitionDeltaPercentagePoints: number | null;
  }>;
}
```

固定顺序及计算定义：

- `trend`恰好12项，按week升序，表示每一完整成熟批次，不只返回两个窗口的端点。每项从该周所有课程/渠道先求和，再按当前分母算率。
- `stages`恰好6项，顺序为StageKey声明顺序；`transitions`恰好5项，顺序为TransitionKey声明顺序，from/to分别为相邻阶段。累计率=count/同窗口报名人数；相邻分子=后阶段、分母=前阶段，lossCount=分母−分子。
- `segments`为课程时恰好2项（FOUNDATIONS、APPLIED），为渠道时恰好3项（ORGANIC、PARTNER、CAMPAIGN）；缺人数的合法组也保留。`enrolledShare`分母是**相同窗口所有组**报名人数，和B2条件分母不同；报名量直接读stageCounts.enrolled_count，不新增重复字段。
- 分组两期指标、相邻转化及支持联系均只使用该组该窗口的计数。`supportContactCount`保留实际次数，便于与“次/100人”的分母一起复核。结果不包含学生优先级、原因、行动、目标提升、预测值或界面排序。
- 任一所需率为null时，两期差值也为null；基准rate为0或任一rate为null时relativeChange为null。计数仍保留真实0。所有派生值遵循第4节单位和最终half-up6约定；无NaN、Infinity或负零。
- 这些结构描述计算结果，不新增SERVER_VERIFIED布尔字段。信任、来源revision、复用、配额和时间由既有Execution DTO包裹；不得靠结果自述“可信”绕过服务端验证。

### 7.4 B6只做校验，不增加operation

B6完整回答仍由manifest验证文本/枚举/长度。以下是从已验证回答中白名单投影的数值与选择字段，不是新增保存DTO，也不由客户端提供context。

```typescript
export type SuccessMetric =
  | 'COMPLETION_RATE' | 'FIRST_LESSON_RATE' | 'WEEK_ONE_ACTIVE_RATE'
  | 'ASSIGNMENT_SUBMISSION_RATE' | 'STARTER_COMPLETION_RATE';
export interface ActionValidationInput {
  targetSegmentKey: SegmentKey;
  successMetric: SuccessMetric;
  targetChangePercentagePoints: number;
  guardrailMetric: 'SUPPORT_CONTACTS_PER_100_ENROLLED';
  guardrailMaximum: number;
  reviewAfterDays: 28 | 42;
}
export interface ActionValidationContext {
  parameters: SegmentParameters;
  prioritySegmentKey: SegmentKey;
  result: SegmentsResult;
}
export function validateAction(
  input: ActionValidationInput, context: ActionValidationContext
): void;
```

前四个successMetric的分子分别为completed、first_lesson、week_one_active、assignment_submitted对应count，分母均为enrolled_count；STARTER_COMPLETION_RATE为completed_count/first_lesson_count且只能在当前B2选此分母时使用。服务端先验证context来自当前B4的同源SERVER_VERIFIED结果，再由同一纯函数核对结果窗口/指标/维度/所选环节与parameters一致、目标组与prioritySegmentKey一致并属于当前维度。

目标提升为有限数且 `0 < targetChangePercentagePoints ≤ 100`；用未舍入计数比例验证最终比率目标≤100。护栏上限为非负有限数，可以大于100，不强制大于当前观察值；低于当前值代表学生希望收紧护栏，并不证明可实现。两个相关分母均须大于0；reviewAfterDays只允许整数28或42。失败阻止B6完成，但不把有效草稿、假设或行动文本判成错误结论。校验不生成计算结果、执行记录或配置配额，也不将学生目标保存为已验证效果。

### 7.5 Java接缝、错误与校验归属

Java新包建议固定为 `com.ruoyi.majorpilot.businessanalytics`，由内容/计算实现者独占；通用experience仅负责dispatch、保存与完成时的跨步加载和来源栅栏。以下为类名限定的方法签名清单，省略类声明与方法体，不是新增源码：

```text
// 生产适配器；构造方式与现有DS适配器一致。
BaMetricsEngine(TaskContentRepository repository, ObjectMapper mapper);
JsonNode normalize(TaskContent.Version version, JsonNode operation, JsonNode raw);
JsonNode calculate(TaskContent.Version version, JsonNode operation, JsonNode raw);

// 同一套纯参数规则用于执行与完成，不查询数据库。
static JsonNode BaSemantics.normalize(String operationKey, JsonNode raw);
static void BaSemantics.validate(String operationKey, JsonNode raw);
static void BaSemantics.validateAction(
    JsonNode actionProjection, JsonNode segmentParameters,
    String prioritySegmentKey, JsonNode currentSegmentResult);

// 不依赖Spring的黄金测试入口；与calculateBa逐字段相同。
static JsonNode BaStatistics.calculate(
    String operationKey, JsonNode rows, JsonNode rawParameters, String datasetSha256);
```

生产适配器只接收固定 `BUSINESS_ANALYSIS/ba-metrics-v1` operation，按pinned Task Version读取并核对自身bundle/资产hash。所有BA配置的 `isBaseline` 都为false，默认配置也按第5节计入30次。normalize/calculate只处理三个operation；不得把B6伪装成第四个operation。纯统计层检查不替代内容生命周期、账户、runMode、来源revision或事务权限检查。

| 安全码 | 触发条件与边界 |
| --- | --- |
| BA_PARAMETERS_INVALID | 422：固定参数结构、类型、枚举或窗口不合法；不回显输入内容 |
| BA_ACTION_INVALID | 422：B6白名单投影、目标群体/指标/分母/比率目标/护栏/复盘约束不合法；允许继续保存草稿 |
| BA_DATA_INVALID | JS/纯统计测试的本地安全码：聚合表结构、计数或摘要格式不合法；生产适配器映射为503 CONTENT_INTEGRITY_FAILED，不把服务端内容损坏归咎学生 |
| CONTENT_INTEGRITY_FAILED | 503：固定bundle、hash、资产或operation内容不一致；不得返回文件路径或原始异常 |
| EXECUTION_NOT_ALLOWED | 沿用422：operation不在固定内容中，或正式请求试图直接传参数等通用拒绝 |
| EXECUTION_REVISION_STALE | 沿用409：执行依赖的已保存来源/当前结果已变化；不是BA数值输入错误 |
| STEP_SOURCE_REVISION_CONFLICT | 409：B6完成所携带的来源向量与当前B2/B3/B4不一致；只返回安全currentSourceRevisions，不返回分析原文 |
| EXECUTION_RESULT_MISMATCH | 沿用422：客户端观察结果与服务端重算不符；不接受其覆盖服务器结果 |

JSON语法/标量强制转换、Step保存CAS、依赖未完成、配置配额和HTTP速率限制继续使用原安全码，不重新包装成BA错误。HTTP层必须保留内容损坏503与来源过期409，不能由通用execution错误收尾统一降成422。JS错误仅携带上述code与固定安全说明；模型、完整回答、原始资产与供应商错误不进入错误正文。

### 7.6 B6行动上下文与跨标签页确认

无operation的B6不能从现有inputBindings获得基线，也不能取最近一条浏览器执行记录。P5仅对v4 BA的b6-action在Step响应新增可选 `baActionContext`；旧Step响应省略该字段保持兼容。服务端在同一读取事务和Student锁下加载B2/B3/B4，使用B4专用currentExecution查询，要求成功、SERVER_VERIFIED、精确own/source关联。上下文不包含其他群体、内部主键或未核验分析。

```typescript
export interface BaActionContext {
  parameters: SegmentParameters;
  prioritySegmentKey: SegmentKey;
  comparison: SegmentPeriod;
  sourceRevisions: {
    'b2-metric': number;
    'b3-funnel': number;
    'b4-segment': number;
  };
}
export interface StepCompletion {
  expectedRevision: number;
  expectedSourceRevisions?: Record<string, number>;
}
```

此公开context只是第7.4节完整内部ActionValidationContext的安全投影；`comparison`固定为当前priority群体的对比窗口。窗口及当前主指标来自parameters，支持联系分母和可选成功指标从stageCounts读取。服务端结果不合法/缺失时拒绝拼接旧基线，以安全错误引导返回B4重算。B6不是第四个计算操作，不生成额外execution或消耗配置配额。

仅 `/steps/{key}/complete` 改用专用StepCompletion DTO；其他Run revision动作不变。B6新命令必须带精确B2/B3/B4来源向量，缺失/类型不合法/非精确键集422 STEP_VALIDATION_FAILED，已保存revision不符409 STEP_SOURCE_REVISION_CONFLICT。旧P2–P4和其他步骤可省略；旧幂等指纹序列化时必须省略null新增字段。认证/归属先于receipt读取，成功旧key按原合同重放，不因后来上游变化重验；同key异body仍409。

前端只展示已加载且用户见过的context快照，不能后台静默替换依据。轮询同时比较B2/B3/B4当前revision与context向量，即使其他标签已把上游重新完成也标记过期；保留本地方案、停用完成和旧基线、提供“重新读取当前依据并确认”。完成请求及其幂等指纹包含当前已确认向量；409不自动采用新向量重试。重新读取不能丢失尚未同步的方案，沿用既有草稿恢复/确认流程。

自动验收需覆盖同一事务context、一方修改并重新完成上游后另一方旧vector拒绝、同群体但新revision也拒绝、刷新确认后的新vector通过、旧成功receipt重放、同key异vector拒绝、迟到context/未同步草稿保留，以及所有旧专业无新增字段仍可完成。
