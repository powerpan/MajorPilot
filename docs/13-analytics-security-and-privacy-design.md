# MajorPilot MVP 分析、安全与隐私设计

> 状态：详细设计修订稿 v0.2  
> 更新日期：2026-09-20  
> 适用范围：产品事件、指标、导出、数据分类、威胁控制、留存和删除  
> 关联文档：[产品定义](./01-mvp-product-definition.md) · [技术约束](./03-mvp-technical-constraints.md) · [报告设计](./10-report-and-evidence-design.md) · [数据模型](./11-logical-data-model.md) · [API 契约](./12-api-contract-design.md)

## 1. 分析目标

MVP 分析只服务三个决策：

1. 学生是否能够独立完成一次有意义的专业体验；
2. 哪些步骤、内容或技术问题阻止完成；
3. 完成体验后，学生是否获得具体认识并愿意继续比较。

指标不用于给学生打分、识别“高价值客户”或自动触发销售。没有真实基线前不设置增长目标，先确保定义、事件和数据质量稳定。

## 2. KPI 框架

### 2.1 主要 KPI

| KPI | 定义 | 计算 | 决策用途 | 主要限制 |
| --- | --- | --- | --- | --- |
| 首次体验7日完成率 | 首次正式开始后7日内关闭 Experience Run 的学生比例 | 成熟开始 cohort 中7日内 Closed 的独立 Student／首次 Start 的独立 Student | 判断核心任务是否可独立完成 | 不说明体验是否有价值；需配合报告反馈 |
| 报告具体收获率 | 查看首份报告后明确同意“我对该专业的工作方式形成了至少一个具体新认识”的学生比例 | 同意或强烈同意人数／提交该问题人数 | 判断报告是否产生预期认知价值 | 自愿反馈存在响应偏差，必须显示回答覆盖率 |
| 第二体验14日启动率 | 首份报告首次 Ready 起14日截止时，已正式开始至少两个不同 Major 的学生比例（含报告前已开始） | 成熟报告 cohort 中截止时满足条件的 Student／首份报告首次 Ready 的 Student | 判断跨专业探索是否形成 | 单独拆出报告前／后的启动，不能把提前探索归因于报告 |

不使用注册数、页面访问量或提示调用量作为主要 KPI，因为它们可以增长而不代表学生获得价值。

### 2.2 诊断指标

| 主要 KPI | 诊断指标 |
| --- | --- |
| 首次体验7日完成率 | Intake 完成率、推荐后注册率、邮箱验证率、注册后开始率、各步骤完成率、恢复成功率、活跃完成时长 |
| 报告具体收获率 | Evidence Snapshot 成功率、报告首次验证通过率、降级报告比例、报告生成耗时、报告查看率、反馈回答覆盖率 |
| 第二体验14日启动率 | 下一推荐查看率、下一推荐接受／改选率、各首专业后的第二专业选择、比较报告形成率 |

### 2.3 守护指标

- 不可恢复进度丢失事件；
- 跨账户或跨身份资源访问事件；
- 报告证据验证失败却被发布的事件；
- 前端、日志或仓库发现秘密；
- 浏览器执行越过任务白名单；
- API 与执行错误影响的独立 Student 比例；
- 报告 fallback 比例和 AI 成本；
- 删除请求超过设计处理期的数量；
- 中位活跃任务时长明显偏离 45–60 分钟；
- 提示三级使用和任务失败的联合分布，但不把高提示使用本身视为负面。

前四项属于正确性和安全门槛，目标是零，不等待业务基线。

## 3. 指标公共约定

- **Student 粒度**：同一 Student 在一个 cohort 中只计一次；
- **首次体验**：Student 第一个进入 InProgress 的 Experience Run；
- **正式开始**：成功完成 `/start` 并固定 Task Version；
- **完成**：Experience Run 到达 Closed，不以报告 Ready 代替；
- **活跃时长**：相邻活动间隔超过10分钟的部分不累计；
- **成熟 cohort**：已经完整经过7日或14日观察窗口；
- **时间**：按 UTC 存储，后台可以按选择时区展示；
- **版本**：所有任务指标至少按 Major、Task Version、问卷版本和推荐规则版本可分组；
- **删除**：已删除 Student 从可识别明细中移除，只保留不可逆聚合；
- **机器人和测试账户**：通过明确标记排除，不根据行为猜测。

本修订将指标口径标记为 `metrics-v2`，不与旧口径混合。主指标保留体验完成、报告收获和跨专业启动三项；没有真实用户数据，不设置数值目标。产品负责人负责口径变更，实施者负责事件／业务表对账，首批内测每周复核成熟 cohort 与缺失事件。

- 暂停和恢复不计新开始；Ready 不计开始；REPLACED 不计完成。同专业异常恢复用 origin_run_id 追到根运行，首次开始时间与7日窗口不重置；恢复后的同专业 Closed 可归入原首次体验完成。
- 首次体验仍指最早开始的专业；中途换专业并先完成另一个，不自动把“首次开始”改成“首次完成”。另一个专业的完成在全部体验诊断中呈现，不能改写分母。
- 首份报告以逻辑报告 `first_ready_at` 最早者确定，重生成不重置14日窗口。若第二专业早于该时刻开始，计入“已启动（报告前）”；若在窗口内才开始，计入“报告后启动”；同学生只计一次。仅后者可用于观察报告后的行为关联，仍不是因果证明。
- 示例：第0天 AI 开始，第1天暂停后 DS 开始，第2天 DS 报告 Ready，第5天 AI 完成，则首次体验7日完成计入，第二体验14日启动属于报告前已启动。若 AI 一直未完成，前者不计入，不能用 DS 完成替代。
- 来源为 `mp_experience_run`、origin 链、`mp_report.first_ready_at`、报告反馈与页面观察事件。完成／开始以业务表为准，阅读和打印只由客户端有效展示事件说明；没有阅读事件标为未观测，不以 GET 成功补造。

## 4. 事件命名与公共字段

事件名称使用 `domain.object.action`，例如 `experience.run.started`。不把页面按钮文案写入事件名。

公共字段：

- `eventId`、`eventName`、`eventVersion`；
- `occurredAt`、`receivedAt`；
- `source`；
- 假名化 `studentId` 或 `intakeSessionId`；
- 可选 `experienceRunId`、`majorCode`、`taskVersion`、`stepKey`；
- `requestId`；
- 事件专用白名单 `properties`。

禁止公共 properties 包含邮箱、姓名、密码、令牌、完整自由文本、完整代码、模型 prompt、供应商响应或用户代理原文。

## 5. MVP 事件目录

### 5.1 Intake 与推荐

| 事件 | 触发点 | 专用属性 |
| --- | --- | --- |
| `intake.session.started` | Intake 创建成功 | questionnaireVersion |
| `intake.step.saved` | 某页草稿成功保存 | stepKey、revision；不含答案 |
| `intake.profile.submitted` | Decision Profile 提交 | questionnaireVersion、requiredAnswerCount |
| `recommendation.generated` | 规则推荐完成 | ruleVersion、primaryMajor、tieDetected、explanationStatus |
| `recommendation.viewed` | 推荐页首次有效显示 | primaryMajor |
| `recommendation.decision.made` | 接受或 Override | decisionType、recommendedMajor、selectedMajor、reasonCode |
| `student.registration.completed` | Student Account 创建并认领 | acquisitionChannelCode、questionnaireVersion |
| `student.email.verified` | 邮箱验证成功 | elapsedBucket |

### 5.2 Experience Run

| 事件 | 触发点 | 专用属性 |
| --- | --- | --- |
| `experience.run.created` | Ready Run 创建 | majorCode、sourceRecommendationType |
| `experience.run.started` | 固定 Task Version | majorCode、taskVersion |
| `experience.run.resumed` | 离开超过10分钟后恢复 | inactivityBucket、stepKey |
| `experience.run.paused` | 明确暂停事务成功 | pausedFromStatus、stepKey |
| `experience.run.reactivated` | 恢复／切换事务成功 | resumedStatus、stepKey |
| `experience.run.replaced` | 内部恢复事务成功 | reasonCode；不含敏感原因文本 |
| `experience.step.viewed` | 步骤首次有效显示 | stepKey |
| `experience.response.saved` | 新 revision 保存 | stepKey、revision、responseType |
| `experience.step.completed` | 步骤通过领域验证 | stepKey、activeDurationBucket |
| `experience.execution.completed` | 受控执行结束 | operationKey、status、durationBucket、errorCode |
| `experience.hint.requested` | 提示请求创建 | stepKey、hintLevel |
| `experience.hint.completed` | 提示成功、fallback 或失败 | stepKey、hintLevel、status、durationBucket |
| `experience.task.completed` | 核心任务完成 | activeDurationBucket |
| `experience.reflection.submitted` | 必需反思提交 | answeredCount、optionalSkippedCount |
| `experience.run.closed` | 输入冻结且持久化 Evidence Job 建立 | activeDurationBucket、hintLevelMax |

不记录每次键盘输入、鼠标轨迹或滚动位置。自动保存只记录成功 revision，不复制回答内容。

### 5.3 报告与继续体验

| 事件 | 触发点 | 专用属性 |
| --- | --- | --- |
| `report.generation.started` | Report Version 开始 | reportType、generationMode、templateVersion |
| `report.generation.completed` | Ready 或 Failed | status、validationAttemptCount、fallbackUsed、durationBucket |
| `report.viewed` | 当前版本首次有效展示 | reportType、reportVersion、fallbackUsed |
| `report.printed` | 打印视图触发 | reportType、reportVersion |
| `report.feedback.submitted` | 报告价值问题提交 | insightResponse、clarityChange、coverageVersion |
| `next_recommendation.viewed` | 下一建议展示 | completedMajor、recommendedMajor |
| `comparison_report.ready` | 比较报告 Ready | majorSet、sourceReportVersions |
| `comparison_report.viewed` | 首次查看 | majorSet |

### 5.4 账户与隐私

| 事件 | 触发点 | 专用属性 |
| --- | --- | --- |
| `consent.research.changed` | 可选研究授权变化 | decision、documentVersion |
| `account.deletion.requested` | 删除请求确认 | 无业务内容 |
| `account.deletion.completed` | 删除作业完成 | durationBucket、result |

敏感管理操作不进入普通 Product Event，写入 `mp_sensitive_audit`。

### 5.5 事件来源、接收与缺失

客户端允许事件与批量 API 以 `12` §9.1 为准。source、主体和所有关联版本由服务端确定；客户端不能上报 started／closed／ready 等后端事实。领域事实与对应事件在同一事务落库。页面恢复 observed(resumed) 与领域恢复 reactivated 分开，不重复当成任务开始。

`clientEventId` 按主体命名空间去重，后端分配全局 eventId；首次展示再按主体、事件、上下文版本去重。有效展示要求可见页面核心内容渲染持续1秒；打印事件只表示触发打印视图。事件队列仅在内存保存，断网允许丢失；报告后台必须显示页面观察覆盖限制，不能声称客户端埋点可靠性等同业务表。

属性白名单中的 Major、Task Version、primaryMajor、reportVersion、ruleVersion、decisionType 等均由资源记录补全；客户端只提交必要 contextPublicId，以及服务端无法推导的允许观察属性（例如 inactivityBucket）。receivedAt 是报表时间，客户端 occurredAt 只用于延迟诊断。非法、过期与超限批次不落库，不阻塞任务保存。

## 6. 漏斗定义

### 6.1 首次价值漏斗

```text
Intake started
→ Decision Profile submitted
→ Recommendation viewed
→ Registration completed
→ Email verified
→ First Experience started
→ First Experience closed
→ First Report viewed
→ Report feedback submitted
```

每层同时报告人数、上一步转化率和从第一步累计转化率。不能只显示百分比而隐藏分母。

### 6.2 比较闭环漏斗

```text
First Report viewed
→ Next Recommendation viewed
→ Second Experience started
→ Second Experience closed
→ Comparison Report ready
→ Comparison Report viewed
```

按第一个 Major 和第二个 Major 组合分组，样本量过小时不作趋势解释。

以上漏斗表示报告后继续体验的有序路径，不覆盖“先暂停跨专业体验、后看报告”的路径；后者独立列为报告前探索，不强行塞入漏斗步骤或计作流失。全体跨专业启动以 §3 的业务表口径统计。

### 6.3 任务诊断漏斗

每个 Task Version 按顺序报告 step viewed、step completed、错误、恢复和提示使用。步骤顺序来自 Task Version manifest，不能用前端页面名称临时拼接。

## 7. 报告反馈最小问题

首次报告查看后以可跳过方式询问：

1. “这次体验让我对该专业的工作方式形成了至少一个具体新认识。”五点量表；
2. “现在我更清楚自己还需要验证什么。”五点量表；
3. “你接下来最可能做什么？”体验另一个专业／进一步了解当前专业／暂停决定／其他／不愿回答。

反馈题版本化。反馈不改变已经生成的报告，不用于给 Student 分类销售价值。

首版 `surveyVersion=report-value-v1`：`insightResponse`、`clarityChange` 为1–5整数，4／5算同意；`nextAction` 为 TRY_ANOTHER／LEARN_CURRENT／PAUSE_DECISION／OTHER／DECLINED。各题可跳过，但提交至少一项；第一题 KPI 分母只含回答第一题者。观察覆盖率为“有首份报告查看事件且回答该题的人数／有首份报告查看事件的人数”，零分母为未知；没有查看事件的有效回答仍可进入收获率，但另列人数，不让覆盖率超过100%。每学生／报告首个有效答卷用于首版 KPI，后续反馈不静默改写历史答案或重复计人；事件 coverageVersion 使用此 surveyVersion。

## 8. 数据质量规则

- `eventId` 唯一，重复事件不重复计数；
- 未来超过5分钟／延迟超过24小时的客户端 occurredAt 拒绝；已接受事件的指标时间使用 receivedAt，不静默伪造客户端时间；
- 进入 funnel 的服务端事实优先于仅前端事件；
- Run 状态事件必须能与 `mp_experience_run` 对账；
- Report Ready 必须能与 READY `mp_report_version` 对账；
- 每日检查未知事件名、未知版本、缺失公共字段和非法属性；
- 事件 schema 变化需要新 `eventVersion`；
- 后台指标显示数据更新时间和排除条件；
- CSV 导出数字需要与同条件后台查询对账；
- 样本量、反馈覆盖率和 fallback 比例与 KPI 同时展示。

## 9. 数据分类

| 等级 | 数据 | 处理要求 |
| --- | --- | --- |
| S0 秘密 | API Key、密码、Session、重置令牌 | 不进入事件和日志；令牌只存哈希；最小权限 |
| S1 高敏感个人内容 | 邮箱、自由文本、Reflection、代码、报告正文 | 严格资源归属、细粒度管理权限、审计、删除覆盖 |
| S2 个人业务数据 | 问卷结构化答案、推荐、步骤结果、Evidence | 登录保护、用途限制、版本和留存控制 |
| S3 假名化运行数据 | Product Event、错误代码、耗时桶 | 不含直接标识；仍受访问和保留限制 |
| S4 公开内容 | 首页、专业简介、已发布任务说明的公开部分 | 仍需内容完整性和 XSS 防护 |

“假名化”不等于匿名。只要仍能通过 Student ID 关联，就按个人数据管理。

## 10. 威胁与控制

| 威胁 | 主要控制 | 验证方式 |
| --- | --- | --- |
| 学生读取他人报告 | 每次服务端资源归属验证；不可枚举 ID 只作辅助 | 两账户越权集成测试 |
| Student Session 访问管理端 | 独立安全链、Token 类型、密钥和路径 | 交叉令牌测试 |
| Operator 越权查看敏感内容 | 权限点、默认假名化、敏感查看审计 | 角色矩阵测试和审计核对 |
| CSRF 和会话劫持 | HttpOnly、Secure、SameSite、CSRF token、Origin 校验、会话撤销 | 浏览器安全测试 |
| XSS 注入报告和任务页面 | 模型结构化输出、字段白名单、安全 Markdown 渲染、CSP | 恶意内容用例 |
| Prompt Injection 改写规则 | 模型只接收白名单 Evidence；推荐结果服务端锁定；输出再次校验 | 注入评测集 |
| API Key 泄露 | 后端环境文件、Git ignore、启动检查、日志脱敏、前端扫描 | secret scan 和构建产物检查 |
| ID 枚举 | publicId、高熵 token、归属校验、统一404 | 枚举与时序测试 |
| 暴力登录和令牌滥用 | 分层速率限制、锁定、统一错误、令牌哈希和撤销 | 速率与锁定测试 |
| CSV 大规模外泄 | 专门权限、字段白名单、行数限制、短期下载、全程审计 | 导出权限与过期测试 |
| 浏览器执行逃逸 | 隔离来源、计算期 CSP 禁网、可信模板／参数语法白名单、无凭证／文件句柄、Worker 超时 | 按 `15` 验证网络、JS bridge、存储与资源限制；Worker 本身不是安全边界 |
| 隐藏标签泄露或客户端伪造评分 | 私有评价资产不下发，固定服务端计算器复算，返回聚合指标 | public 包扫描、篡改结果和过期 revision 用例 |
| 删除后异步数据回写 | 发布与删除共用账户锁、状态检查、租约版本和取消作业 | 删除／报告／导出竞态测试 |
| 资源耗尽和高额模型调用 | 单用户配额、并发限制、超时、输出上限、成本记录 | 压力和限流测试 |
| PII 进入日志或事件 | DTO 白名单、结构化日志脱敏、禁止请求体默认日志 | 日志扫描测试 |
| Task Version 被篡改 | manifest 与数据 SHA-256、发布权限、仓库评审 | 启动和发布校验 |
| Redis 数据丢失 | 关键状态写 MySQL，Redis 只缓存 | 清空 Redis 恢复测试 |

## 11. AI 数据最小化

发送给模型前：

- 使用任务内假名标识，不发送邮箱；
- 只发送当前用途需要的 Evidence 或步骤上下文；
- 不发送完整 Product Event 流；
- 不发送与任务无关的 Decision Profile 字段；
- 自由文本先进行长度限制和必要脱敏；
- 记录发送字段类别、模型、区域和版本，不默认长期保存完整原文；
- 供应商错误响应按不可信内容处理，不直接显示给学生；
- 真实数据启用前复核区域、保存、训练使用和删除条款。

## 12. 隐私界面要求

学生在填写前能够理解：

- 收集哪些基本信息和任务过程；
- 哪些内容用于个人报告；
- 哪些结构化事件用于产品分析；
- AI 服务会接触哪些最小化数据；
- 数据保存时间和删除方式；
- 报告默认私有；
- 可选研究授权不会影响核心服务；
- 如何撤回授权和删除账户。

隐私摘要必须使用普通语言，并链接到版本化完整文本。隐私文案变更需要新 document version，不覆盖历史接受记录。

## 13. 留存、删除与导出

采用 [逻辑数据模型](./11-logical-data-model.md) 的 MVP 默认期限：匿名 Intake 7天、事件明细180天、AI 元数据90天、确认删除后30天内处理。公开部署前进行法律和运营复核。

个人导出与内部 CSV 不同：

- 学生个人导出只包含其可理解的账户、问卷、体验成果和报告；
- 不导出密码哈希、内部风险字段、模型提示词或其他学生数据；
- 内部 CSV 默认假名化，不包含自由文本；
- 所有内部导出设置用途、过期和审计；
- 删除完成后，旧下载链接失效。

实际上从删除确认开始就撤销全部会话并使旧下载失效，不等30天作业结束。确认前预置专用 HttpOnly 删除回执 Cookie，确认后只可访问状态／时间，不可访问正常业务；具体期限与凭证丢失处理见 `12` §7.3。本地未同步草稿7天到期，主动退出／换账号／删除时清理；离线旧设备不能承诺即时远程擦除，重新联网校验后清理，详见 `15` §5.1A。

幂等缓存、持久化 job、租约检查点也纳入数据清理；确认删除后尚未返回的模型结果不得重新落库。仅保留去标识化处理回执，不能保留可回查原账户的作业副本。

## 14. 指标目标策略

当前没有真实用户基线，不为三个主要 KPI 编造数值目标。MVP 首轮按以下顺序工作：

1. 先验证事件完整性和指标可重算；
2. 在内部测试和首批小规模用户中建立分布；
3. 按 Task Version、背景和设备检查差异；
4. 再确定改善目标和时间范围；
5. 任何增长目标都同时带进度丢失、错误、报告质量和隐私守护指标。

上线前的非业务质量门槛包括：无已知越权、无密钥泄露、无不可恢复进度丢失、无未经证据验证发布的报告。

## 15. 验收条件

1. 三个主要 KPI 可以从定义的领域表和事件独立重算；
2. KPI 同时显示分母、观察窗口、版本和数据更新时间；
3. 重复事件不会重复计数；
4. 前端事件缺失时服务端仍支持开始／完成指标，阅读与打印节点显示未观测，不用 GET 成功补造；
5. 删除 Student 后分析明细不能重新识别该人；
6. 普通管理员不能查看完整自由文本或创建导出；
7. Student、Operator 和匿名凭证交叉使用全部失败；
8. 恶意任务文本、Reflection 和模型输出不能执行脚本；
9. 模型输入不包含邮箱、会话、密钥和完整事件流；
10. 清空 Redis 不影响指标事实来源；
11. 每个内部导出都有操作者、条件、用途和过期时间；
12. 报告反馈率和 fallback 比例与报告价值 KPI 同时显示；
13. 未建立真实基线前，后台不展示伪精确目标或红绿绩效判断；
14. 隐私摘要、完整文本和实际事件字段保持一致；
15. 数据保留和删除作业具有可验证状态及失败重试。
16. 暂停、恢复、异常替换和报告重生成不重置 cohort 或重复计入开始；报告前探索单列，不冒充报告后转化。
