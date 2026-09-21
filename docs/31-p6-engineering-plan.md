# P6 报告、下一专业与比较：工程实施接缝

> 2026-09-21：P4验收期间完成设计准备；P5提交94f6acb推送并核对远端后开始P6实施。下文保留实施前基线及锁定合同；P6本地工程验证结果以[交付记录第9节](./23-p2-to-p6-delivery-ledger.md#9-p6-实施状态)为准，不将工程预览变成正式专业发布。
>
> 依据：[报告与证据](./10-report-and-evidence-design.md)、[逻辑数据模型](./11-logical-data-model.md)、[API 合同](./12-api-contract-design.md)、[工程与测试](./15-engineering-and-test-design.md)、[实施路线](./16-implementation-roadmap-and-traceability.md)。NEXT 规则沿用 [08](./08-intake-and-recommendation-design.md)，反馈与事件沿用 [13](./13-analytics-security-and-privacy-design.md)，BA 保留 [P5 计划](./29-p5-engineering-plan.md)中的 `ba-evidence-v1`。

## 1. 范围与不可混淆的状态

P6 交付 FR-14 单专业报告、FR-15 下一专业与改选、FR-16 比较报告、FR-17 反馈，并补齐对应版本、作业、证据、私有访问和恢复测试。P7 的完整运营后台、个人导出和账户删除流程不提前宣称完成；P6 必须先具备这些流程需要的权限、清理归属及删除竞态栅栏。

| 术语或工程对象 | 本轮精确定义 | 不代表什么 |
| --- | --- | --- |
| Closed Experience | 任务与反思提交，原始输入 manifest 已冻结 | 不代表证据、报告已 READY |
| Evidence Snapshot | 某次版本化提取产物；READY 后内容不可变 | 不等于整个事件流，也不保证其中每项可支持声明 |
| 声明目录 Claim Catalog | 从指定 READY snapshot 按版本化规则得出的、可安全发布的陈述及数值目录 | 不是模型自行认定的事实，不回读最新草稿 |
| Report | 一次正式 Run 的逻辑报告，或一名 Student 的逻辑比较报告 | 不等于某一次模型调用 |
| Report Version | 某次生成请求的版本、固定来源和成功产物；发布后内容不可变 | 不覆盖前一版本，也不改变任务完成状态 |
| Generation Request Manifest | 固定本次生成意图、原关闭输入及规则/模板版本的工程记录 | 不修改原 Run manifest，不授权指定任意证据或模型 |
| REVIEW_PREVIEW | 已验证 Student 在显式本地开关下体验未正式发布内容 | 不计正式完成、NEXT、报告或比较来源 |

继续使用 `STANDARD` / `REVIEW_PREVIEW` 与 `contentKind` 双重判断。只有 `STANDARD + MAJOR + CLOSED` 进入正式报告链；DEMO 与 REVIEW_PREVIEW 始终 `reportStatus=NOT_APPLICABLE`。不得靠给真实 REVIEW 内容填入虚构人工审核记录、改变 Run mode 或建立假 Recommendation Decision 来开放报告。

## 2. 当前实现基线与 P6 必补接缝

以下是编写时的源码观察，不是 P6 通过证据；实施时需再次核对 P5 合并结果。

- `experience/ClosurePipeline` 已冻结 `closed-input-v3`、原 Decision Profile/Task Version/最终 revision/执行来源向量/Reflection/Hint 引用与 hash；STANDARD 关闭时同事务创建 NEXT、PENDING Report 和 EVIDENCE_BUILD。
- `experience/EvidenceJobs` 已有 MySQL lease、输入/hash 校验、追加 snapshot 和发布栅栏；`publish()` 尚未排 ReportVersion/REPORT_GENERATE。不能依赖一次进程内回调填补这个缺口。
- V6 已有 `mp_report`、`mp_background_job`、snapshot/item、AI 元数据；尚无 Report Version/Claim/Comparison Source 表，`current_version_id` 尚未建立版本 FK。
- `recommendation/RecommendationStore.owned/latestStudent` 目前只读取 INITIAL；`StudentRecommendationService` 的读取/决定 DTO 也以 INITIAL 为主。NEXT 已落库不等于学生已能查看、接受或改选。
- 当前 NEXT 存储 JSON 中的 `decisionProfileId` 为内部主键。新增响应必须通过归属查询投影 public ID，不直接返回存储 JSON，也不改写历史推荐。
- AI 现有提取规则为 `evidence-v2`，DS 为 `ds-evidence-v1`；P5 计划新增 `ba-evidence-v1`。三个 dispatcher 保留独立语义，不能把 BA 默认落到 AI 分支。
- 当前 `EvidenceJobs.claim()` 按 Run 将 BUILDING snapshot 判作旧租约失败。P6 引入新规则构建请求后，必须收窄到**被接管 job 检查点指向的那一份 snapshot**，不能误伤同 Run 另一个合法构建。
- 反馈是 P6 范围，当前未发现正式 `mp_student_feedback`/反馈业务；不能只完成报告页面便遗漏它。

## 3. 最小物理迁移建议

使用实施时下一个未占用 Flyway 版本，不预占可能被 P5 使用的编号，不改 V1–V6 或任何已执行迁移。沿用 BIGINT 内键、CHAR(26) public ID、UTC DATETIME(3)、JSON 和现有标准 envelope。

### 3.1 新增五张业务表

| 表 | 字段与约束 |
| --- | --- |
| `mp_report_version` | `public_id`、`report_id`、`version_no`、`status`、`generation_phase`、`generation_mode`、`request_manifest_json`/`request_manifest_sha256`、`input_manifest_json`/`source_manifest_sha256`、`evidence_snapshot_ids_json`、`decision_profile_ids_json`、`next_recommendation_id`、`template_version`、`prompt_version`、`schema_version`、`claim_rule_version`、`claim_catalog_sha256`、`model`、`structured_report_json`、`validation_result_json`、`retry_no`、`failure_code`、创建/完成时间；`UNIQUE(report_id,version_no)`，`retry_no IN (0,1)` |
| `mp_report_claim` | `report_version_id`、`section_key`、`claim_order`、`claim_type`、`claim_text`、`confidence_code`，以及目录追溯用的 `statement_key`/`claim_rule_version`；`UNIQUE(report_version_id,section_key,claim_order)` |
| `mp_report_claim_evidence` | `(report_claim_id,evidence_item_id)` 复合主键和双 FK；跨 snapshot/Student 的允许性仍须发布事务验证 |
| `mp_comparison_source` | `comparison_report_version_id`、`source_experience_report_version_id`、`major_id`；每比较版本每 Major 唯一、每来源版本唯一；只能引用同 Student 的 EXPERIENCE 版本 |
| `mp_student_feedback` | 按 `11` §11.4 保存 public ID、Student、类型/上下文、服务端解析的 Major/Task Version、评分/评论/版本化答案、诊断代码、状态/时间；报告反馈另外固定 `report_id` 与 `report_version_id` FK，避免重生成后丢失反馈语境 |

`request_manifest_json` 在请求受理时冻结；`input_manifest_json` 只在证据 READY、来源齐全时从 NULL 一次性固定，随后不可变。后者未就绪时其 hash/snapshot 列可为空，不能填空数组假装已有证据。两者职责不同，不把“补齐输入”解释成改写已冻结请求。

READY/SUPERSEDED 版本的来源、正文和声明不可编辑；允许的后续变更仅是 READY→SUPERSEDED 状态，以及按删除流程清理。FAILED 版本保留安全失败信息，不存未验证供应商原文。`generation_mode`/`model` 在选择执行路径前可空，成功时明确 AI 或 DETERMINISTIC_FALLBACK；回退版本的 `model` 可空，真实失败调用仍保留在 AI 元数据中。

### 3.2 复用与小范围 ALTER

- `mp_report` 保留现有逻辑身份约束、状态与 `first_ready_at`。增加 `generation_target_version_id`，为它及 `current_version_id` 补 FK；同 Report 归属由事务验证。新请求/发布更新 `row_version`，旧 job 只能发布当前 generation target。
- `mp_ai_call` 增加可空 `report_version_id`、`invocation_id`、`generation_stage`；使用现有 call_kind 表达 EXPERIENCE_REPORT/COMPARISON_REPORT。invocation 在外调前持久化，可追踪崩溃时结果不明的调用；若元数据表需 IN_PROGRESS 状态，新增受控枚举，不伪填 SUCCEEDED。token/费用未知继续 NULL，不写0。
- `mp_background_job` 继续用于 EVIDENCE_BUILD、REPORT_GENERATE、COMPARISON_GENERATE；不另建内存队列或消息中间件。checkpoint 只保存阶段、引用、hash、版本与次数，不复制学生内容或模型请求。
- 常规报告 job 业务键为 `report:<versionPublicId>` / `comparison:<versionPublicId>`；新规则提取为 `evidence-regeneration:<versionPublicId>:<requestSha256>`。长 tuple 先规范化 hash，必须落在现有 VARCHAR(180) 内，不能拼接任意长规则名。
- 为反馈/报告事件增加的上下文关联采用明确资源归属，沿用既有事件去重约束；如缺必要 FK，仅补最小列，不把通用事件 JSON 变成报告事实仓库。
- 清理时先解除 Report 的 current/target 指针，再删除 comparison links、claim links/claims、版本等；不使用关闭 FK 检查解决引用环。

## 4. 冻结输入、新规则提取与声明目录

### 4.1 版本轴分别固定

每份请求固定 `requestSchemaVersion=report-request-v1`、Report/Run public ID、原 `closedInputSha256`、任务/原 profile ID 与 hash、提取规则、claim rule、template/prompt/output schema 版本、请求方式、原 NEXT ID；比较请求另固定排序后的来源版本集合。由服务端选择已审核的版本注册表，客户端不得上传 prompt、原始证据或任意版本路径。

证据就绪后固定 `inputSchemaVersion=report-input-v1`、READY snapshot ID/hash、原 profile 引用、claim catalog hash；比较输入同时固定每项 Experience ReportVersion ID/hash 与 Major。读取原 profile 只为验证冻结归属和 hash，不将最新问卷替换进去，不把完整问卷发模型。

普通初次构建严格使用关闭 manifest 的规则。历史关闭的 AI=`evidence-v2`、DS=`ds-evidence-v1`、BA=`ba-evidence-v1` 不自动升级；P6注册并测试新提取器后，新关闭且匹配已注册Task Version/Question Set的Run分别显式冻结 `evidence-v3`、`ds-evidence-v2`、`ba-evidence-v2`。新号只在原专业提取结果后追加本节规定的派生证据，不改变既有条目的语义。旧 READY 不重写；旧 `evidence-v1` 未有安全适配器时保持显式 UNSUPPORTED，不挂旧版本号用新语义重算。

### 4.2 显式新规则重生成

管理端可选择 REUSE_READY_EVIDENCE，或 REBUILD_EVIDENCE 并指定已注册的 `targetEvidenceRuleVersion`。后者创建新的 ReportVersion 请求记录与提取 job；只读同一个原关闭 manifest，但使用请求中明确授权的新规则，追加新 snapshot。原关闭 manifest、旧 snapshot 和旧 ReportVersion 均不改。

Experience 的 REUSE 固定当前报告版本已绑定的 READY snapshot；首次生成失败且无 current 时，复用该失败版本已经固定且仍合法的输入，或初始关闭 job 明确产出的 READY snapshot，不能查询任意“最新快照”顶替。没有可复用来源则返回 REPORT_EVIDENCE_NOT_READY，走显式重建。Comparison 只支持复用当前各单项报告来源；不接受一个 `targetEvidenceRuleVersion` 横跨三个专业直接重提取。需要更新专业提取规则时，先重生成对应 Experience Report，再由比较协调器追加版本。

新规则兼容注册必须声明可读取的 closed-input schema、Major/Task Version、来源字段与允许声明类型；不能以通用“最新规则”回退。构建中每次失败/接管追加 snapshot version，并且仅将同 job 上一个 BUILDING 标 FAILED。初始 job 与重生成 job 不共享模糊的 snapshot“最新”指针。

有报告当前版本时，证据重建失败仍保留原报告可读。相同请求 key 重放返回同一生成请求；不同 key 但已有进行中的 generation target 返回 `409 REPORT_REGENERATION_IN_PROGRESS`，不重复付费排队。新版本完成/失败后才允许下一次显式请求。

### 4.3 可发布声明目录

提出首版 `report-claims-v1`，独立于证据提取版本。目录条目至少包含 `statementKey`、`claimType`、`allowedSectionKeys`、`evidenceIds`、`ruleRefs`、受类型约束的 `valueBindings`（数值、单位、分母、时间窗口、来源）、`attribution`、`confidence` 与审核过的表述模板。目录稳定排序并计算 hash。

| 来源 | 可发布内容 | 明确禁止 |
| --- | --- | --- |
| STEP_RESPONSE 的动作/选项 | “本次选择了……”“提交了几类分析”等可核查动作 | 将所选命题、解释或方案直接宣告正确 |
| SERVER_VERIFIED 执行 | 固定版本、数据和参数下的聚合值，保留分母/窗口/支持条件 | 客户端未经复算数值、跨配置拼凑指标、稳定能力评价 |
| Reflection 白名单 | 带“你表示/本次自述”归属的兴趣、困难和继续意愿 | 把跳过解释为负面，将任务分析自由文本混作体验自述 |
| Hint 支持上下文 | 请求过的提示主题/层级及本次得到支持的限制 | 根据提示次数、耗时、错误次数推断能力高低 |
| STUDENT_ANALYSIS / UNVERIFIED | 默认不进入模型或可发布目录，保留内部来源审计 | 从原话挑一句包装成事实/因果/商业效果，claims=[] 仍强行引用 |
| 版本化内容/规则说明 | 合成数据、单次任务边界、专业工作方式差异、规则 NEXT | 分数、人格标签、录取概率、职业保证或唯一专业排名 |

BA 尤其保留 `ba-evidence-v1` 的历史与分析边界，新 `ba-evidence-v2` 也不放宽这些条目：指标理由、优先级依据、观察原话、原因假设、行动与目标仍为 UNVERIFIED/claims=[]。可展示服务端已验证的实际指标、窗口、群体、分母与支持联系单位；“期望提升 X 个百分点”不成为收益或效果预测。DS 相关系数/分层差异不改写为因果；AI 准确率改善不变成适合 AI。

### 4.4 可机器验收的文案边界

首版确定采用模型提交 `report-proposal-v1`：固定 section、选择的 `statementKey` 与允许的 `phrasingKey`；服务端从目录填入数值、文本、claimType 和来源，组装最终 `report-v1`。不接受模型创造任意学生可见正文。模型负责在合法内容中选择重点及表述变体；数值、归属、边界和推荐不由模型发明。这样能验证事实与语义，而不是声称正则禁词或“有 evidence ID”足以证明任意自然语言可靠。

如后续允许更自由的改写，必须另立可验证合同和版本，不能在本轮悄悄放宽。旧 snapshot 不授权 BOUNDED_INTERPRETATION，不能仅加 claim catalog 绕过 `allowed_claim_types`。本轮通过 §4.5 的新提取规则落实两条保守解释；不删除该能力，也不改旧 evidence-v2/DS/BA 语义。

所有 OBSERVED_FACT / STUDENT_SELF_REPORT / BOUNDED_INTERPRETATION 关联至少一个允许该类型的 Evidence Item；LIMITATION/NEXT_STEP 至少有已注册规则引用或相关证据。缺失指标/零分母保持 null/证据不足，不补0；单位、舍入与比较方向由固定计算器/模板决定，不由模型重算。

### 4.5 本轮保守解释规则

新提取版本在同一快照追加至多一项 `DERIVED_INTERPRETATION`，来源仍为原 `REFLECTION` 和其 revision/hash。value 固定 `scope=THIS_EXPERIENCE`、`derivationRuleKey`、同快照 `sourceEvidenceKeys`、原 questionSetVersion及合法枚举值；`allowed_claim_types=[BOUNDED_INTERPRETATION]`。普通 SELF_REPORT 仍只允许 STUDENT_SELF_REPORT，学生分析仍 claims=[]。报告引用派生项，内部保留对原反思条目的lineage。

| 规则 | 条件 | 固定表述边界 |
| --- | --- | --- |
| INTEREST_WITH_CONTINUATION | interestingStepKeys含原Task Version合法具体步骤、不含NONE，continueSimilarWork=YES | “你在本次体验中提到了感兴趣的环节，并表示愿意继续类似工作；这是继续探索这类任务的一条线索，不代表已经确定专业方向或具备稳定能力。” |
| INTEREST_WITHOUT_CONFIRMED_CONTINUATION | 同样有具体兴趣步骤，continueSimilarWork=UNSURE或NO | UNSURE：“本次有感兴趣的环节，但你仍不确定是否愿意继续类似工作；环节兴趣尚不等于明确的继续意愿。” NO：“本次有感兴趣的环节，但你表示不想继续类似工作；对某个环节有兴趣与愿意继续，并不是同一个选择。” |

两规则互斥；多个兴趣项不排序，不称“最喜欢”。[NONE]配任意继续意愿时不生成解释，原自述仍保留；NONE混具体步骤、空数组、陌生步骤、缺失意愿拒绝新规则输入，不猜默认。difficultySources、nextWorkStyle、提示次数、成绩、耗时、可选追问和自由文本不改变上述predicate，不能污染目录。比较可并列引用各来源的本次解释，但不得升级成更适合/兴趣更强的总排序。

INITIAL提取必须 `sourceRule=effectiveRule=closedManifest.evidenceRuleVersion`；历史显式REBUILD才可由持久请求授权对应的新effectiveRule，并通过兼容注册表；原关闭hash、归属、租约栅栏仍全部校验。REUSE不产生新解释。确定性回退排除所有bounded条目；正常受控模型提议需验证两条规则确能发布，不能只实现提取而没有报告正向路径。跨Student/Run/profile、反思revision/hash错误均拒绝，重复输入目录及内容hash稳定。

## 5. 最终报告结构与校验

最终 `report-v1` 包含 `reportId`、`reportVersionId`、`versionNo`、`reportType`、`majorCode`（比较为 null）、`generatedAt`、`generationMode`、固定 sections、限制说明、NEXT 安全投影和来源摘要。所有外部 ID 是 public ID，不输出数据库内键、hash 调试细节或完整后台对象。

Experience sections 顺序固定：OVERVIEW、WHAT_YOU_DID、EXPERIENCE_PREFERENCE、CURRENT_PREPARATION、TASK_PERFORMANCE、WORK_STYLE_CONNECTION、EVIDENCE_BOUNDARIES、OTHER_MAJOR_DIFFERENCES、NEXT_EXPERIENCE。WHAT_YOU_DID 为3–5条真实动作；不足时不得补造，应在内容/证据验收阶段发现。偏好、准备度、表现不得合成总分。

Comparison sections 顺序固定：SCOPE_AND_SOURCES、WORK_COMPLETED、SELF_REPORTED_EXPERIENCE、COMMON_DIMENSIONS、MAJOR_SPECIFIC_EXPERIENCE、UNKNOWNS、NEXT_VERIFICATION、REMAINING_MAJOR。共同维度严格使用 `10` §6 七项，缺证据显示“本次尚无足够证据”，不从表现推断定量舒适程度。

首版安全上限：最终 JSON ≤128KiB、一般每节最多8条（WHAT_YOU_DID特限5条、COMMON_DIMENSIONS按下文特限21条）、每条文本≤400个 Unicode code point、每条证据≤8个、依据摘要≤300字；具体内容模板必须先证明能在上限内完整表达。只输出纯文本，不开放 HTML/任意 Markdown；不接收外部 URL、图片、脚本或模型生成链接，页面导航由受控资源引用生成。禁止未知字段、浮点/字符串冒充整数、非法 enum 和越界数组。

比较仍使用平铺claims数组，不引入任意嵌套正文。COMMON_DIMENSIONS强制恰好“固定7维×固定来源专业数”：两专业14条、三专业21条；每个 `(dimensionKey, majorCode)` 恰好一条，顺序先维度、再来源tuple。该节声明必须带目录绑定的dimensionKey/majorCode，模型不填写归属。缺证据也保留对应专业的位置，用注册LIMITATION模板说明未知，不补假evidence ID；只把上限扩大到21而不校验笛卡尔积是不够的。

WORK_COMPLETED、SELF_REPORTED_EXPERIENCE、MAJOR_SPECIFIC_EXPERIENCE同样强制每条有majorCode并覆盖全部来源。前后两节每专业1–2条，总不超过6条；自述节每专业固定兴趣和困难两个目录slot，每slot一条自述或缺证据限制，继续意愿在COMMON_DIMENSIONS完整呈现。slot由目录元信息与语义校验器验证，不需添加可自由填写的topic。其他全局节仍最多8条；专业独有的事实/未知放有归属的节，不塞入无归属自由列表。前端按major分组展示，不据数组顺序暗示优劣。

发布前校验依次为：结构 → 类型/长度 → snapshot/Student/Run 归属及 hash → statement/phrasing 白名单 → claim/evidence 允许类型与数值单位 → 事实/自述归属 → NEXT 与规则结果一致 → 专业/比较来源约束 → 禁止内容。确定性回退经过**同一**最终 schema 和发布校验。安全错误记录只含 code/path/计数，不存未验证模型片段。

学生“依据”展示只投影经过筛选的说明；不展示内部 evidence ID、STUDENT_ANALYSIS 原文、事件日志、私有数据行、隐藏标签或提示词。数据库保留精确 links，不等于把审计树返回浏览器。

## 6. 作业、一次修复与原子发布

### 6.1 触发与恢复

1. STANDARD 关闭事务维持原有顺序：冻结输入、NEXT、PENDING Report、EVIDENCE_BUILD 一起提交，不外调。
2. Evidence READY 发布事务新增：创建首个 GENERATING ReportVersion、固定请求/完整输入、设置 generation target、插入 REPORT_GENERATE。证据成功与报告排队不能有崩溃窗口。
3. 升级后设置有界 reconciler，处理“STANDARD Report PENDING + 已有合法 READY snapshot + 无版本/job”的历史缺口。按账户锁和唯一约束执行；不为预览补报告、不选任意最新 snapshot。
4. 每5秒扫描可用 job，租约60秒、20秒心跳。外部阶段不持有 SQL 长事务；每次进入或恢复阶段先验证 lease/账户/target，心跳失败后停止发布资格。
5. 进程退出后只凭 MySQL 恢复。snapshot 的重试追加 snapshot；报告 job 的基础设施重试继续同一 ReportVersion/阶段，显式新重生成才新建版本。

### 6.2 状态与次数

| 对象 | 状态或阶段合同 |
| --- | --- |
| Report，无当前版本 | PENDING（证据未好）→GENERATING→READY；不可恢复失败为 FAILED |
| Report，已有当前版本 | 始终保持 READY；新生成状态另通过 target 的 generation 信息显示，不隐藏可用旧报告 |
| ReportVersion | GENERATING→READY 或 FAILED；成功替换后前一 READY→SUPERSEDED；FAILED 从不成为 current |
| generation phase | WAITING_EVIDENCE、PREPARED、INITIAL_REQUESTED、REPAIR_REQUESTED、FALLBACK_PENDING、VALIDATED、PUBLISHED；失败由 status/failureCode 表达 |
| 普通 job | PENDING→RUNNING→SUCCEEDED；暂时失败 RETRY_WAIT，最多3次，间隔5秒/30秒；租约接管递增 lease_version |
| 一次结构修复 | `retry_no` 从0→1的 CAS 在修复调用前提交；同 ReportVersion 永不大于1，与 job attempt_count 分开 |

报告初次生成与可选修复属于同一个最多45秒的外部生成预算；报告请求超时/429的网络重试也消耗该预算，不能每次重置。建议最多3次 HTTP 尝试（含修复），修复不再单独无限重试。AI 禁用、配置不可用、供应商持续故障或一次修复仍不合法，进入 FALLBACK_PENDING；不让 AI 故障拖满三次队列重试才给基础报告。

跨重启保存阶段与预算时点：不得为未保存的候选原文恢复整段供应商内容。INITIAL_REQUESTED 结果不明时保留调用元数据并按有限策略转回退；REPAIR_REQUESTED 已占用次数，即使调用结果未知也不能再发第二次修复。数据库短暂错误可重试发布已验证产物；若尚未持久化合法产物，可确定性重建回退。记录 invocation 与阶段，但不承诺供应商 exactly-once，崩溃可能已经产生费用。

回退生成九节/八节同结构，至少包含元数据、完成动作、验证聚合结果、安全 Reflection 摘要、限制和规则 NEXT；不生成 BOUNDED_INTERPRETATION，明确“部分个性化解释暂不可用”。READY 证据缺失或 hash 错误不是 AI 错误：不得回退编造，报告显示准备异常，Run 仍 CLOSED。

### 6.3 发布 CAS 与故障栅栏

发布事务统一先锁 Student，再锁 Report，再校验/锁目标 Version 和 Job。要求：账户 ACTIVE；job worker/lease_version/未过期租约匹配；version 仍为 generation target；request/input/catalog hash 未变；snapshot READY 且 mode=STANDARD；来源和关联均属于同一 Student。最后原子写 claims/links/合法正文、Version READY、旧版本 SUPERSEDED、current 指针、时间与领域事件、job SUCCEEDED。

`first_ready_at` 仅首次由 NULL 写入；`ready_at` 为本次成功时间。失败不能覆盖 current，失去 target/租约的结果只丢弃或标安全终态，不能“再试一次 UPDATE”越过栅栏。generation target 在进入终态后清除，版本记录保留。

幂等与同请求重放先验证当前身份和资源归属，再读取 receipt；同 key 不同 body 为409。声明写入或事件写入故障必须回滚整个发布事务；不得留下 current 指向没有 links 的版本。检查不能只在模型调用前做一次。

## 7. NEXT、自由改选与完成后的主页

复用 `next-recommendation-v1` 与 `08` §9/N01–N09，不在报告模型中重新排序。关闭时按 STANDARD 已完成集合排除候选：仅余一项→ONLY_REMAINING；明确 nextWorkStyle 且在候选中→EXPLICIT_NEXT_STYLE；否则 ADJACENT_BASELINE。三个专业完成→ALL_COMPLETED、无新 NEXT。

新增 NEXT 安全 DTO：`recommendationType=NEXT`、`recommendationId`、`sourceRunId`、原 `decisionProfileId`（public ID）、`ruleVersion`、`explanationVersion`、`completedMajorCodes`、`primaryMajor`、`alternativeMajors`、`reasons`、`differences`、`generatedAt`。差异文案使用固定版本模板，明确比较工作方式，不给能力或适合度排序。

`GET /recommendations/{id}` 支持 INITIAL/NEXT 两种严格 schema；保持 INITIAL 既有字段兼容，不把 NEXT 强行解析为 INITIAL。`POST .../decision` 沿用 `selectedMajorCode/overrideReasonCode/overrideText`，追加 ACCEPTED/OVERRIDDEN，不创建 Run；开始/恢复仍走现有入口。只能选择当前未正式完成项；已经完成目标的新决定返回409安全领域错误，旧成功 key 仍按主体认证后重放原资源。历史推荐正文不因此改写。

可用性是当前导航投影，与冻结排名分开：推荐项暂 UNAVAILABLE 仍显示原排名和说明，并列出可用替代项；已有 PAUSED 且 pinned 内容有效则继续同 Run，不重建尝试。不要因 Task Version 退役抹去完成或报告；也不将“没有可发布内容”误写成 ALL_COMPLETED。

Dashboard 保留 INITIAL 数据兼容，增 `nextRecommendation`、报告摘要和比较状态。学生即使首份报告仍准备，也能依据关闭时 NEXT 继续下一项。报告中的历史 NEXT 不变；当前主页优先最新正式关闭产生的 NEXT，三个正式项完成时不重新显示旧 INITIAL 作为下一步。

## 8. 比较报告的来源并发合同

- 每 Student 只有一个 COMPARISON 逻辑 Report。至少两个不同 Major 的 STANDARD Experience Report 各有当前 READY Version 才受理；两个 CLOSED 而其中报告未 READY 时返回 WAITING，不复制未验证摘要。
- 每次单项报告成功发布时，在同一个账户锁下检查当前来源 tuple。按 Major code 排序，固定 version IDs、正文 hash、snapshot IDs/hash、原 profile IDs；只有 tuple 与当前比较/进行中目标不同才新排版本。
- 发布比较前复核每个来源仍为该 Experience Report 的 current READY。发生替换则旧生成版本 FAILED、job CANCELLED，安全码 COMPARISON_SOURCE_STALE；当前已发布比较继续可读，并针对新 tuple 排一个版本。不要发布“刚生成但来源早已过时”的比较。
- 第三项 READY 或单项重生成后扩展同一比较 Report 的新版本。历史比较绑定不可变；其来源后来变 SUPERSEDED 不使已发布比较内容漂移或自动不可读。
- 比较的证据引用限定为固定来源版本对应 snapshot 的并集，不直接读取最新原始任务文本；同专业恢复运行不能凑成两个 Major。不存在独立的跨专业总分、总排名或唯一结论。
- 等待原因固定为 NEED_TWO_MAJORS / WAITING_SOURCE_REPORTS / SOURCE_REPORT_FAILED / COMPARISON_GENERATING / COMPARISON_FAILED；返回尚缺的本人 Major/安全状态，不暴露 job、供应商或数据库细节。

## 9. API、错误与权限合同

所有响应沿用标准 envelope、X-Request-Id、camelCase/public ID/UTC；严格拒绝未知请求字段。学生私有内容沿统一边界使用 `Cache-Control: no-store`（私有及共享缓存均不得存储），不进入 IndexedDB、localStorage、Service Worker 报告缓存或公开 URL。

### 9.1 学生 API

基础路径 `/api/app/v1`，要求有效且已验证的 Student Session；Operator bearer 不能代替它。

| 路径 | 明确行为 |
| --- | --- |
| GET `/reports?cursor=&limit=` | 本人逻辑报告摘要，最多50条；含 type/major/status/currentVersionId/generation/时间，无历史正文 |
| GET `/reports/{id}` | READY 返回200当前 `report-v1`；无当前且准备中返回202状态 DTO；无当前且终态失败409 REPORT_GENERATION_FAILED；不存在/跨人/预览404 RESOURCE_NOT_FOUND |
| GET `/reports/{id}/status` | 200，含 `reportId,status,currentVersionId,generation{status,phase,retryable,safeCode},revision`；不是领取任务或触发付费调用 |
| GET `/reports/{id}/print` | 同认证与当前版本规则，返回打印所需的同一安全 DTO，不提供免登录链接；可选 `expectedReportVersionId` 仅校验当前版本，失配409 REPORT_VERSION_CHANGED，不支持读旧版 |
| GET `/comparison-report` | READY 为200当前报告；条件不足/生成中为200 `{state:WAITING,reason,...}`；已有旧 READY 且更新中仍返回旧 current 并附 generation 摘要 |
| GET `/recommendations/{id}`、POST `.../decision` | 第7节 NEXT/INITIAL 分派，写操作继续要求 CSRF/Origin/Idempotency-Key |
| POST `/feedback` | 第10节，201返回 feedbackId/status；幂等重放不新增反馈 |

打印页面页脚固定 reportVersionId/versionNo/生成日期和边界说明。若打开报告后恰好新版本发布，打印校验返回冲突并提示刷新，不偷偷打印不同内容；没有“指定历史版本打印”后门。

### 9.2 管理 API 与重生成请求

基础路径 `/api/admin/v1/majorpilot`：普通查询 `majorpilot:report:view`；重生成 `majorpilot:report:regenerate`。学生 Cookie 无权进入；已认证但无权限403，未认证真实 HTTP401，不能退回上游 AjaxResult 的伪200。

`POST /reports/{id}/regenerations` 请求拟定：`expectedRevision`、`reasonCode`、`reason`（必填、10–500字）、`evidenceMode=REUSE_READY_EVIDENCE|REBUILD_EVIDENCE`、后者必填的 `targetEvidenceRuleVersion`。模板/prompt/model 由服务器已审核配置选择；不接受任意正文、证据数组、profile/task 替换。要求 Idempotency-Key；202返回 `reportId,reportVersionId,status,revision`。同事务追加 Sensitive Audit 和 job；审计失败不受理。

历史报告/完整敏感文本须独立权限与读取审计，建议命名 `majorpilot:report:history:view`、`majorpilot:report:sensitive:view`，待本计划审阅统一；不能让 report:view 隐式获得两者。P6 只做必要报告查询/重生成支持，不冒充 P7 整个运营后台已完成。

新增安全错误建议纳入 OpenAPI：REPORT_VERSION_CHANGED、REPORT_REVISION_CONFLICT（409，带安全 currentRevision）、REPORT_REGENERATION_IN_PROGRESS（409）、REPORT_EVIDENCE_NOT_READY（409）、EVIDENCE_RULE_UNSUPPORTED（422，仅管理受理选择）、COMPARISON_SOURCE_STALE（内部终态/状态摘要）、REPORT_GENERATION_FAILED、FEEDBACK_INVALID。既有 job 内不支持规则仍保持其安全失败码；外部 HTTP 映射不由抛异常处随意决定。

报告读取/状态轮询不触发新生成。建议状态轮询前台先2秒、逐步至10秒，隐藏页面停止；限流使用独立 report-read bucket。管理员重生成建议同报告一个活动目标、同操作者每分钟5次，并保留现有全局限制；反馈每 Student 每分钟5次。数值是本计划工程默认，根代理审阅后固定，不为测试临时放宽。

## 10. 反馈、事件与隐私

反馈接受 `feedbackType=GENERAL|TASK|REPORT|TECHNICAL`，可选 `contextType/contextPublicId`、1–5整数 rating、≤1000字 comment、`surveyVersion/answers`、明确同意附带的白名单 diagnosticCode。context 首版只接受 EXPERIENCE_RUN / REPORT_VERSION，未关联资源时两字段都不传；两字段必须成对。至少提供评分/评论/问卷答案之一。REPORT 类型要求 REPORT_VERSION context，且必须是本人的已发布 ReportVersion；浏览器携带版本 public ID，服务端解析 report/major/task，禁止客户端指定 Student/internal ID/日志或整页状态。diagnosticCode 只有学生明确选择附带时才发送，默认不发送。

已读页面在重生成后提交反馈可以引用该 Student 自己的旧 READY/SUPERSEDED 版本，只做归属绑定，不因此给学生新增历史正文读取 API。待生成/失败版本不能作为“已读报告价值”反馈来源。任务/全局反馈可独立提交，不能强制答价值题才能继续体验。

`report-value-v1` 保留 `insightResponse,clarityChange` 1–5 与 `nextAction=TRY_ANOTHER|LEARN_CURRENT|PAUSE_DECISION|OTHER|DECLINED`，每题可跳但至少一项。每 Student/逻辑报告首个有效答卷用于首版 KPI，后续答卷追加、不覆盖；无有效查看事件的答卷仍可有效，但不能补造阅读事件。反馈不改变报告、NEXT、Run 或证据。

前端仅允许按现有“本账户+反馈上下文、7天TTL、成功即清理”草稿规则保留未提交评论，不持久化报告正文。失败保留草稿，退出/换账号/删除清理本项目命名空间；不得 clear 全浏览器存储。

领域事件在事务内产生：report.generation.started/completed、comparison_report.ready、report.feedback.submitted 等，字段严格沿 `13` 白名单。页面事件 report.viewed/printed、next_recommendation.viewed、comparison_report.viewed 继续复用批次/主体/context 归属和去重；有效展示≥1秒，GET 不代替阅读，print 只说明触发打印视图。版本在展示时绑定，不能因服务器 current 已变就归到新版。

日志与 mp_ai_call 只记录最小版本/调用/耗时/安全码；默认不保存供应商原始请求响应、完整问卷、分析或 Reflection 原文。研究同意不作为核心报告使用前提，撤回不使报告不可读。报告/证据随账户保留；AI 元数据90天、普通成功 job30天/失败90天、敏感审计180天等沿既定默认，不擅自延长。

## 11. 删除、锁定与清理竞态

所有 report/evidence worker 在领取、外调开始前和发布前验证账户；发布与删除确认争用同一个 Student 行锁。DELETION_PENDING/DELETED 后不领取/发布，取消非删除 job，丢弃迟到结果，释放本机临时内容；LOCKED 暂时延期且不永久丢弃请求。未验证账户无报告访问权，历史数据也不能绕过当前会话检查。

精确清理顺序至少覆盖：撤销会话/下载 → 取消归属 job → 清 Report current/target FK → comparison source → claim evidence/claims → feedback 的版本关联/正文 → report versions/report → snapshots/items及其原始内容 → NEXT/decision/profile/run关联 → event/idempotency/AI元数据。实际 SQL 必须按已实施 FK 拓扑确定，不能把此列表机械当作无需检查的删除脚本。

测试当前可以在隔离库按正常事务将合成账户置 DELETION_PENDING，验证“调用前/外调中/发布前/删除后”均不复活内容；这只证明 P6 栅栏，不等于 P7 删除申请、回执、30天执行及法律留存审查已完成。所有新实体必须有明确 Student 归属路径，以便精确清理，不仅存不可反查的 hash。

## 12. 正式链路测试与工程预览隔离

真实 AI/DS/BA bundle 在未完成专家审核、零代码试用和计时记录前保持 REVIEW；P6 不添加业务运行时“假审核/强制正式”开关。预览关闭仍只生成内部证据，无 NEXT/mp_report/比较；学生 API 无法读出预览报告。

正式链路的受控测试使用 `majorpilot_test`、带唯一前缀的合成 Student、明确标注 TEST_FIXTURE 的独立 Task Version/public ID，构造“已发布状态”的测试前置条件以验证引擎。它不是实际专业内容审核证明，不改共享主库/真实 bundle 的审核字段。运行真实事务、队列 worker、计算/证据服务、Report controller、安全链和序列化，不以伪造 HTTP JSON 替代业务链。

若需浏览器访问正式报告页面，使用仅存在于测试源码/测试启动器的 Spring HTTP harness，连接固定隔离测试库、独立端口和受控 fake/replay gateway；生产构建不得含 seed/绕过审核端点。当前 P0/local 环境 guard 固定主库与端口，测试装配应使用专门的精确 test-DB guard，不放宽现有生产/本地 guard。Cookie/Origin/CSRF 同样按测试服务配置真实校验，不能 disabled SecurityFilterChain。

实施前源码复核进一步固定测试装配边界：

- 测试Boot配置只存在于test源码；显式扫描/Import产品业务、安全链、真实事务/AOP及异常翻译，排除主启动类和P0EnvironmentGuard。替代guard必须在DataSource前验证 `majorpilot_test`、最小权限测试账号、固定loopback地址、独立端口和fake外调；不得把生产guard改成允许任意URL。
- 暂定测试后端18081、测试学生站15176；启动前检查端口为空且只接管本项目已登记身份。进程管理增加精确测试组件名或等价专用登记，不能kill端口/模糊进程。既有主服务18080/15173不停止，测试结束精确回收本轮进程/资源。
- 浏览器测试站用 `127.0.0.1` 与主站 `localhost` 分离Cookie域，并使用独立浏览器context；Cookie不按端口隔离。测试Vite配置单独放测试目录，代理只指向18081，Origin/CSRF仍真实校验。
- 完整安全链包含Student/Public、Operator JWT和方法权限，启用真实method-security/ss权限判断；不通过mock身份过滤器、禁用CSRF/权限或浏览器伪造业务JSON演示报告。测试Operator也使用正常鉴权主体与明确权限集合。
- 测试内容catalog仅在专用harness启动classpath中装入，不能全局遮蔽普通单测或产品catalog。独立TEST_FIXTURE版本使用专用public ID；固定数据/规则可以复用生产实现，但“已发布状态”只是测试前置，不写实际内容的人审记录。新规则兼容注册对测试Task ID的装配仅在测试源码中，不新增业务运行时旁路。
- 独立测试CSRF/签名密钥只写忽略的本地环境文件，分离测试session及限流命名空间，仍使用真实同样数值的限流实现。不是清除、改变或绕过主站限流。不继承供应商Key；harness启动guard拒绝live模式。测试重启使用相同本轮测试秘密以验证持久化恢复，不在每次重启重置身份/限流。
- 同时运行的MySQL集成测试和HTTP harness必须互斥使用测试库，先检查fixture归属；不能在harness运行时执行会清理同库的测试。所有合成账号、版本、jobs、事件、邮件按确切归属回收，依外键拓扑操作，不关FK约束。
- 报告worker心跳使用独立调度能力；不能让45秒同步外调阻塞唯一的Scheduled线程，导致20秒续租名存实亡。关闭/初始证据/重建/报告/比较分别限定job type和target，旧snapshot失效只针对接管job检查点，不按整Run扫除。

正常构建、合同、MySQL 和浏览器测试全部 fake/replay/stub，不调用付费平台。真实报告模型能力验证若被授权，单列合成最小上下文、调用次数/费用上限、持久尝试 guard 与结果；不把 stub 成功称真实供应商成功，容量压测继续是上线前门禁。

2026-09-21用户已授权开发过程真实调用API且不要求费用上限；据此允许小量合成能力验证，不再逐次等待成本确认。工程探针仍限制每次45秒/至多2次HTTP，使用独立持久尝试标记防止误重放；普通回归入口显式关闭付费测试。容量压测仍需负载范围，不由本授权自动触发。报告真实探针为 `scripts/report-spike.mjs`，结果严格区分 AI_VALIDATED 与 FALLBACK_VALIDATED。

## 13. 必须落到自动与浏览器验收的清单

| ID | 可测试合同 | 通过证据 |
| --- | --- | --- |
| R01 | 空库/已有V6升级，新表约束与清理顺序 | 两条 Flyway 路径；未知/错误归属不能发布 |
| R02 | 关闭与 Evidence READY→Report 排队原子 | 注入事务失败无半份状态；提交后杀进程重启仍继续 |
| R03 | 原 profile/task/revision/source vector 固定 | 更新当前问卷/新任务后重生成旧 Run，hash与原始来源不漂移 |
| R04 | 三专业事实与分析分离 | AI恶意断言、DS因果文本、BA收益/行动目标不能生成 OBSERVED_FACT；claims=[] 永不直接发布 |
| R05 | 数字与语义目录 | 改分母/单位/窗口/方向、伪造 statement、错证据、陌生ID、跨人证据、HTML/URL/未知字段全部拒绝 |
| R06 | 一次修复与回退 | 错JSON→一次修复成功；两次非法→同schema回退；timeout/429/AIoff可用且不撤销CLOSED |
| R07 | 回退不跳过证据 | FAILED/缺失/被篡改snapshot不得READY报告；无BOUNDED_INTERPRETATION |
| R08 | 租约和重启 | 领取后、外调中、发布前实际停止测试JVM再恢复；旧lease不能写、retry_no不重置、无永卡GENERATING |
| R09 | 版本与发布CAS | 重复key一个版本；异体409；旧target/旧lease拒绝；审计或claimlinks故障全回滚，原READY继续可读 |
| R10 | 新规则显式性 | 原manifest与READY不变；请求指定注册规则才新snapshot；unsupported旧规则不静默升级；同Run不同job不互杀BUILDING |
| R11 | NEXT N01–N09 | 排除已完成、显式方式、邻近默认、暂停续跑、不可用不改排名、ALL_COMPLETED，无模型决定排序 |
| R12 | 比较来源 | 1份等待、2份READY自动生成、第三份同逻辑Report新版本；同Major不重复计；发布中来源替换拒绝旧结果 |
| R13 | 历史比较稳定 | 来源版本SUPERSEDED后旧比较正文/hash不变，新比较另版，不回读最新原始答案 |
| R14 | 身份/管理权限 | A读B/未知ID同404；学生进管理401，管理员进学生401；低权限重生成/历史/敏感读取403 |
| R15 | 删除竞态 | 外调中确认删除后无晚到正文/证据/事件写回；测试数据与新FK可精确清理；锁定仅延期 |
| R16 | API与打印 | OpenAPI正负样例；网页/打印/管理current版本一致，打印旧expectedVersion冲突；缓存/退出不露前账户内容 |
| R17 | 反馈/事件 | 跨人context拒绝、整数严格、幂等追加、旧本人报告版本反馈、首份KPI不重复；GET不补阅读、事件≥1秒/限流/批次原子 |
| R18 | 工程预览隔离 | 三专业REVIEW_PREVIEW关闭报告NOT_APPLICABLE；主库仍无正式发布，无假审核记录 |
| R19 | 产品呈现 | Chrome+Edge九节/八节、三维分离、未知维度、等待/失败/回退、反馈保留、下一项改选、键盘与打印阅读 |
| R20 | 隐私与供应商边界 | 日志/产物/仓库无植入秘密/原始模型内容；默认测试0付费调用；审计与元数据只含必要字段 |

核心失败不降断言、不补手工 SQL 假结果、不以隔离测试替代真实内容审核。报告引擎受控验收、真实任务审核/计时、Git提交推送、本地服务验收、公网部署分别记录。

## 14. 建议实施顺序与审阅点

1. 先定迁移、两类 manifest、report-proposal/report-v1/schema 与状态 DTO，建立三专业确定性事实目录和回退黄金样例。
2. 实现作业/一次修复/发布CAS/重生成/新规则请求，接 NEXT 与比较来源协调，完成实库并发与进程重启门禁。
3. 实现学生私有报告/打印/反馈，以及最小管理员查询和审计重生成；同步页面事件与 secret/privacy检查。
4. 接前端固定分节、依据、状态恢复、NEXT/改选、比较和反馈，完成隔离正式链浏览器验收及主站预览负向验收。
5. 由根代理审核证据和当前剩余人工门禁，再决定 P6 工程里程碑是否可提交推送；本文件不能作为“已通过”记录。

根代理已裁定采用：受约束声明目录与两个版本化保守解释规则；ReportVersion分离请求/完整输入两份manifest；重生成单活动target；`majorpilot:report:history:view`/`majorpilot:report:sensitive:view`专门权限；最终JSON128KiB/一般每节8条（完成动作5、共同维度严格14或21）/单条400 code point等上述上限；报告读取每Student每分钟120次、管理重生成每Operator每分钟5次、反馈每Student每分钟5次。文中“建议/拟定”据本段固定为P6工程默认。按用户授权不等待额外产品确认，P6开始前同步OpenAPI和测试，各端不得自行放宽。

### 14.1 开工时固定的接线细节

- INITIAL推荐保持原DTO（没有recommendationType、字段为majorDifferences）；NEXT独立DTO带 `recommendationType=NEXT` 与 `differences`，用严格union兼容，不改旧INITIAL正文。
- 普通报告GET的200 data直接是 `report-v1`；202 data为状态DTO。比较GET的READY data固定 `{state:"READY",report:report-v1,generation}`，WAITING为独立分支，不由各端另套一层。
- report-v1字段固定为schemaVersion/reportId/reportVersionId/versionNo/reportType/majorCode/generatedAt/generationMode/sections/limitations/sources/nextRecommendation。section为sectionKey/title/claims；claim为claimType/text/confidence/basisSummary/majorCode/dimensionKey，后两项不适用时显式null。confidence仅DIRECT/SELF_REPORTED/BOUNDED/RULE_BASED，表示声明归属类别，不是概率或能力置信分数。
- 七维enum顺序固定PROBLEM_INTEREST、QUANTITATIVE_COMFORT、UNCERTAINTY_HANDLING、WORK_FOCUS、HELP_AND_ITERATION、EXPLANATION_INTEREST、CONTINUATION_WILLINGNESS；仅共同维度节带dimensionKey。来源摘要含majorCode/experienceRunId/taskVersionId/taskVersionCode/taskTitle/sourceReport；比较sourceReport为reportId/reportVersionId/versionNo，单专业为null。不将可漂移的isCurrent写入不可变正文；导航时另查当前版本并核对。
- 冻结NextProjection为state（RECOMMENDED或ALL_COMPLETED）、recommendationId（可空）、sourceRunId、ruleVersion、completedMajorCodes、primaryMajor（可空）、alternativeMajors、reasonCodes。单专业使用自身关闭NEXT；比较请求受理时固定当时最新STANDARD+MAJOR CLOSED产生的NEXT/ALL_COMPLETED，即使第三专业报告未READY，也不再劝其首次体验已经关闭的第三项。以后完成变化不改已冻结正文，当前可用性另由导航DTO提供。
- SOURCE/CATALOG_INVALID直接作为来源/规则错误终止，不伪装成模型故障；只有proposal不合法进入一次修复。gateway一次调用只发一次HTTP，持久次数、预算、租约与回退由作业层负责。共享canonical JSON保留原RunStore的对象key排序/数组顺序，旧snapshot hash不得加入新字段重算。
