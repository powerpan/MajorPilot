# P4 Data Science 实施接缝

> 2026-09-21：P3 浏览器收尾期间完成设计准备；本文不代表 P4 已实现。按用户离线期间自主推进授权，锁定下述实现细节。依据 [任务设计](./09-three-major-task-designs.md)、[工程设计](./15-engineering-and-test-design.md) 和 [阶段路线](./16-implementation-roadmap-and-traceability.md)，P3 工程门禁通过并推送后再实施。

## 1. 产品边界

目标是让学生经历数据质量判断、分布、关系、解释检查和有限结论，不是完成一套预测竞赛。保留 D1–D6 加独立 Reflection；最终至少两个质量处理决定、两至三个有证据的发现、一个不能由现有数据推出的因果结论、一个后续问题。没有专业总分或自动专业排名。

沿用 P3 明确标记的 `REVIEW_PREVIEW`，不假造人工审核、零代码目标用户试用或 45–60 分钟计时；不计正式完成、NEXT、用户报告。已有保存、暂停切换、独立反思、关闭、Evidence Snapshot 一套流程复用，不复制 DS 状态机。

执行采用 P0 已批准、工程设计 §10 明确允许的固定计算器回退：隔离 Worker 中的 JS 预览＋Java 服务端白名单重算。显示等价只读 Python 说明并明确“不执行 Python”。无任意代码、上传、可编辑表达式、第三方网络或新 Python 运行时。说明必须对应实际分支，不能把伪代码称作可运行结果。

## 2. 数据与未来 BA 的关系

- 固定种子、生成器版本和文件哈希：360 条原始行 = 359 名合成学员 + 1 条完全重复行。前 11 周各 30 名，末周 29 名。数据字典保留任务设计 §3.1 的全部字段。
- 先生成完整事件事实，再派生 DS 质量问题副本与后续 BA 聚合。BA 报名总人数为 359，不能读取任一学生清洗后的表。行号只用于显示，不参与精确重复判断。
- 有限枚举：两个课程方向、三个来源、三种设备；无真实人物、敏感属性或私人信息。固定的早/晚六周 `cohort_period` 由批次派生。
- 24 名不同学员分别注入 10 个 `avg_session_minutes`、8 个 `days_to_first_lesson`、6 个 `assignment_submit_rate` 的记录缺失。选择无缺失普通记录制造精确重复，避免计数歧义。
- 未开始学习（lessons_started=0）的首次学习天数与会话时长为 `NOT_APPLICABLE`，不算记录缺失，不用 0 替代。已开始者的 null 才是 `MISSING`；缺失与不适用按字段分别报告。0 是合法观测值。作业提交率对所有报名者适用，分母固定为4项作业，未学习者为0，不靠任意 truthy 判断。
- 保留少量合理极端值、反例和噪声；批次/课程/来源构成与完成相关，但不生成“某设备或渠道必然导致失败”的决定性规律。固定样例需证明存在聚合与分层差异，不以强行得到某个学生结论为生成目标。

## 3. 质量处理与统计方法

顺序固定为精确去重 → 缺失处理 → 极端值处理 → 分析字段有效样本筛选。原始资产永不改写。

| 参数 | 允许值与含义 |
| --- | --- |
| duplicatePolicy | `KEEP` 或 `DROP_EXACT`；后者保留原始顺序第一条 |
| missingPolicy | `KEEP_NULL`、`DROP_MISSING`、`MEDIAN_NUMERIC`；只处理三个声明字段中的 MISSING，不删除/填补 NOT_APPLICABLE，不修改 completed |
| extremePolicy | `KEEP` 或 `CAP_P95`；只对会话时长按去重/缺失处理后的非空值计算 95 分位并缩尾，明确会改变测量值，不代表原值错误 |

删除精确重复后 359 行；再删除 24 个缺失注入行后 335 行。保留或中位数填补缺失时仍为 359 行。保留重复的结果用“记录数”，不得称独立学员数。中位数不能在空样本时虚构 0。

三个字段的填补中位数分别从去重后、填补前的有效值一次算定，不能因字段处理顺序而变；缩尾在填补后计算。会话分钟值域0–240、直方图边界 `[0,10,20,40,80,240]`；首课天数0–28、边界 `[0,1,3,7,14,28]`；提交率0–1、边界 `[0,.25,.5,.75,1]`。首课分组为 `[0,1)、[1,3)、[3,7)、[7,28]`。生成器拒绝越界值，不允许图表静默裁掉观测。

分位数采用 Type 7：零基位置 `h=(n−1)p`、相邻次序值线性插值；中位数与之统一。[R 官方定义](https://www.stat.ethz.ch/R-manual/R-patched/library/stats/html/quantile.html)。直方图区间随字段固定，左闭右开、最后一格含最大值；极端值不能被图表裁掉。

完成比例区间采用 Wilson 95%，固定 `z=1.959963984540054`；n=0 时比例和区间均为 null，n=1 仍显示真实宽区间，不伪装稳定。[NIST Wilson 方法](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)。区间基于二项独立观测假设；保留重复、不随机采样、缺失/选择偏差和混杂都会限制解释，不能用区间替代这些警告。

散点关系按成对有效记录计算 Pearson r；n<2 或任一变量方差为 0 时为 null。没有回归、p 值或未经验证的相关区间。内部保留精度，只有最终输出做 6 位 half-up，Java/JS 共用边界向量；分组顺序固定，不随对象或哈希表遍历顺序漂移。

散点均值也只来自同一成对有效集合，n=0 两均值均为null、n=1均值有效但r=null；按固定行序和双遍历中心化计算。排除计数互斥为 missingOnly、notApplicableOnly、both、total，满足 retainedRows=n+total。分层摘要各自计算，不平均分层r冒充整体r；D5不重复返回全部散点。

## 4. 步骤输入与操作

所有自由文本初始为空；界面默认参数不是替学生写的解释。解释不进入计算配置哈希。

| 步骤 | 回答与操作 |
| --- | --- |
| D1 理解字段与问题 | acknowledged、observationUnit、targetField；资料、字段表与合成记录预览 |
| D2 检查数据质量 | identifiedIssues、三个质量策略、duplicateReason、missingReason；`ds-quality-clean` |
| D3 查看初步分布 | distributionField、sampleInterpretation；`ds-profile`，完成数/分母/比例和所选数值字段的有效量、缺失/不适用、均值/分位/直方图 |
| D4 探索变量关系 | relationshipMode、groupBy、xField、yField、observation；`ds-relationship`，只激活当前模式需要的字段 |
| D5 检查解释 | stratifyBy、uncertaintyComment、causalJudgment；`ds-stratify`，沿用 D4 同一关系定义和 D2 质量处理 |
| D6 写出分析结论 | 2–3 个 findings（statement、evidenceStepKey、verdict）、unsupportedCausalClaim、limitations、nextQuestion |

D4 提供两条窄路径，满足选择变量/分组图/散点图的已确认范围：

- `GROUP_COMPLETION`：因变量明确固定 completed；分组可选 course_track、signup_source、device_group、cohort_period、days_to_first_lesson_band。显示每组完成数/分母/率/Wilson 区间，排除或不适用记录另列，不能当成失败者。
- `SCATTER`：横/纵轴从 avg_session_minutes、days_to_first_lesson、assignment_submit_rate 中各选一项且不能相同；按原始行序返回有限点、有效 n、成对均值、r、排除数量。轴标签、单位、null 含义明确，不用随机抖动改变值。
- D5 按 course_track 或 cohort_period 分层；分组完成率模式不可选与 groupBy 相同的分层。显示整体和分层结果，分组模式用 Wilson，散点模式用 n/r/均值；不把散点硬套二项区间，也不自动生成因果结论。

输出都含 datasetSha256、cleaningConfigSha256、原始/保留/有效行数与各类排除计数；每个指标有自己的实际分母。图表输出仅含需要的点/分组，控制在现有 100 KiB 上限内，不复制全表各列或文字到每个 execution。完整公共表作为固定公共资产单独读取。

## 5. manifest、版本与请求一致性

- 新 `task-manifest-v3` / `DATA_ANALYSIS` / `ds-stats-v1`，不修改已冻结 v1/v2、AI 内容或已执行迁移。各步一个 operation；每 operation 最多 30 种成功配置，同一规范化配置复用不扣额度，失败不收费。不是 AI 的五次隐藏评价配额。
- `ownResponseBindings` 读取当前 step 的已保存 inputRevision；`inputBindings` 读取实际被使用的祖先步骤字段。字段均为一层白名单，参数名不重叠且并集精确覆盖 parametersSchema；祖先必须在依赖 DAG 可达。当前答案还未保存时不尝试解析不存在的 r0。
- v3 不扩张通用条件 JSON Schema：D4 的 mode 必填，分支字段在严格 object 形状层 optional；v3 绑定器仅允许跳过 schema 明确声明 optional 且确实不存在的来源字段。同一个 DS 语义校验器在执行/完成时要求当前分支字段、拒绝 inactive 字段、X=Y 与 group=stratum。切换模式移除旧分支输入，草稿可不完整；v1/v2 语义不变。
- 正式 execution 的 parameters 仍为 `{}`，参数来自服务端已保存的答案。v3 请求必须带 `expectedSourceRevisions`（无祖先为 `{}`），并精确匹配客户端看到的来源；v1/v2 兼容省略。准备计算与落库两端检查来源，拒绝到达前/计算中变化；响应保留真实原始来源和当前应用来源。
- 前端幂等指纹包含 operation、当前 revision、规范化来源向量；同来源重试稳定，祖先变化产生新请求身份。字段解释、无序集合规范化与有序 X/Y 分开处理，不能交换横纵轴。DS 默认配置也计入30种限额，没有 AI baseline 免费特例。
- prepare、terminal fence、完成步骤、刷新时选择当前 execution 使用同一来源语义。D2 修改使依赖下游失效而保留历史，不允许旧图表充当新方案的结果。
- 优先零数据库迁移：已有 JSON 来源、执行关联、engineVersion 字段可容纳；确有缺口才追加迁移，不能改 V1–V6。

## 6. 证据与验证

DS 证据白名单按专业及版本分派：质量选择/理由、实际字段/图表/分层与已验证统计、D6 学生发现/局限/问题、固定 Reflection。学生分析/因果假设是未经内容验证的归属材料，不升级为 OBSERVED_FACT，也不混同 Reflection 的 STUDENT_SELF_REPORT。沿用 P3 分离后的分析条目与事实条目规则；未经新版本规则推导的分析条目本身不许可生成事实主张。关闭 manifest 固定 evidenceRuleVersion；旧 READY 仅按原冻结版本读取，不能换规则重算或给新语义冒用旧规则编号。

验证至少覆盖：生成器 check、固定数据计数与漏斗约束、空/单条/全缺失/常数/零与 null、Type7/边界分箱/Wilson/相关、同输入跨语言结果、服务端拒绝伪造结果、来源入口与末端 CAS、归一化复用及 30 配额、公开资产与新 manifest 安全、关闭冻结和 DS 证据语义、已有 AI/P2 回归、Chrome/Edge 原生全链路及图表可达性。

真实用户无代码完成、专业人工审核、时长仍为外部门禁。工程内容 REVIEW 可以继续后续阶段，但不改写这些状态；正常构建与测试不调用付费模型。
