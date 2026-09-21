# P7 管理、分析、支持与隐私：实施合同

> 2026-09-21：P6 提交 `fb030ac4cd5b9cb542ac5ffa9bec62a1174b0c0c` 推送并核对远端后启动P7；本地功能及真实流程验收已通过，最终冻结回归与Git交付见[验收台账](./35-p7-delivery-ledger.md)。本文固定实施选择与验收要求，不代替分项证据。保持 Vue 3 / Spring Boot 3 / MySQL / Redis；不进入 P8，不公开部署，不发布仍为 REVIEW 的三专业内容。
>
> 依据：[路线 P7](./16-implementation-roadmap-and-traceability.md#10-p7管理分析支持与隐私)、[指标与隐私](./13-analytics-security-and-privacy-design.md)、[数据模型](./11-logical-data-model.md)、[API](./12-api-contract-design.md)、[页面流程](./14-ui-flow-and-wireframes.md)。如锚点因 Markdown 渲染差异不可用，以文档章节标题为准。

## 1. 范围与工作分界

内部 Operator 能观察三个 KPI、查明异常、查看发布版本、执行有审计的支持动作和受控导出；Student 能管理账户、撤回研究同意、取得个人资料并删除账户。不能编辑学生答案/反思/报告、直接改完成状态、自动发营销信息或推断职业适配分数。

代码实施分为四条有明确文件归属的工作线：指标纯计算与黄金向量；后台查询/管理导出/运行诊断；学生隐私/留存/物理迁移；现有两套 Vue 前端。根代理统一 API 合同、迁移、集成与 Git 交付。共享字段/路径先写合同再消费，不以临时假数据替代实际后端验收。

主库专业内容保持 REVIEW；正式报告和指标闭环继续用隔离 TEST_FIXTURE。测试账号必须显式排除实际产品分析；对黄金向量的合成输入单独标记为测试证据，不冒充真实 cohort 或业务基线。

## 2. 实施起点核对与处理

- P6 已有报告查询/历史/审计重生成、内容验证/发布/退役、运行恢复、反馈和观察事件接口，不重复另建业务实现。
- 起点的 `P0Bootstrap` 在 local 启动会重置管理员密码并停用全部其他 Operator。P7已拆开一次性local安全初始化与P0探针初始化；实际主站重启核对密码/角色/账号状态保持不变。继续禁用上游演示账户和延期菜单，不重新开放注册/代码生成等功能。
- 起点缺少的显式TEST/BOT排除标记、完整个人导出、真实删除回执/作业、已登录邮箱与密码修改、运营分页界面已实现，并分别由实库、真实HTTP与浏览器验证。
- 起点的 `mp_background_job.owner_student_id` 为NOT NULL；V8已加入系统/管理任务与按类型归属约束。V1–V8均已执行并冻结，不改旧文件。
- `mp_student_account` 没有设计想象中的 current_* FK；实际循环为 Report→Version→Report 与 Run→Recommendation→source_run；Run.origin 和 Profile.supersedes 还有自引用。
- 已增加队列邮件发送前账户状态检查；已经发送的Mailpit/SMTP副本不属于SQL删除能力，不承诺外部副本即时擦除。

## 3. 三个指标的锁定口径

`metricsVersion=metrics-v2`；请求固定 `asOf`，UTC 毫秒精度，cohort 区间 `[from,to)`；`from < to <= asOf`，未提供时默认最近90天，最多366天。历史 asOf 只表示现存业务记录在该截止时刻的重算，不声称能恢复已删除数据或当时的排除标记。只读同一数据库快照，不从 LIMIT 50 的页面列表统计。

公共范围：正式 `STANDARD + MAJOR`，Student 唯一计数；排除明确 TEST/BOT、DELETION_PENDING/已删除主体。可选研究授权拒绝/撤回不排除必要产品运行统计。未来事实忽略；页面观察按 received_at，不按客户端 occurred_at。DEMO/REVIEW_PREVIEW 不抢占首次位置。

筛选维度为 Major、Task Version、questionnaireVersion、recommendationRuleVersion；分别绑定对应指标 anchor 的原 Run/Profile/Recommendation，不查当前问卷替代历史。每项返回 numerator、denominator、rate、cohortCount、immatureCount、anchor、windowDays，整体包含 asOf、filters、exclusions、dataUpdatedAt 与口径/覆盖说明；分母0时 rate=null，不显示0%。

| 指标 | Anchor与分母 | 分子与特殊处理 |
| --- | --- | --- |
| 首次体验7日完成 | 同学生最早正式开始的专业恢复链，anchor 为该链最早非空 started_at；只纳入完整经过7日的学生 | 同一 origin 链任一正式 Run 在 anchor+7日以内关闭。根 READY 未开始时用后续实际开始；暂停/恢复/REPLACED 不重置窗口，另一专业先关闭不能替代 |
| 报告具体收获 | 最早逻辑 EXPERIENCE 报告 first_ready_at；该报告 first_valid_survey 的第一题有效1–5答复 | 第一题4/5。首个有效答卷漏答时，后答不得补入；后续专业报告反馈不能代替；重生成不重置首报告 |
| 第二体验14日启动 | 最早逻辑 EXPERIENCE first_ready_at；只纳入完整经过14日的学生 | 到 firstReady+14日已实际开始至少两个不同专业。第二专业早于 firstReady 计 BEFORE，否则 AFTER；恰好截止计入，同专业恢复不重复计 |

反馈覆盖单列 `(有首报告view且首有效答卷回答第一题的人数)/(有首报告view的人数)`；无view但有效回答仍进收获率，另列 answeredWithoutViewed。普通评论不是价值答卷；不能因观察丢失篡改事实或令覆盖超过100%。反馈记录 created_at 和事件 received_at 必须不晚于 asOf。

没有真实基线，不添加增长目标/同比箭头/虚构趋势。样本量、未成熟 cohort、反馈覆盖、回退与缺失观察同时可见。概览按专业提供可比的分子/分母细分，不平均百分比。

## 4. 漏斗、诊断和事件

实现 `13` 的首次价值、报告后比较、Task Version 步骤三类有序漏斗；每层显示人数、上一步和累计转化。报告前第二专业探索单列，不硬塞进报告后漏斗。匿名 Intake 的开始/提交/认领用明确同一 Intake 归属；不能只统计已注册者而称全部访客漏斗。

补 `experience.step.viewed`（核心内容可见1秒）和离开超过10分钟后的 `experience.run.resumed` 观察；区别已有领域 reactivated。只发内存白名单事件，身份切换清空，未观察不当成未行为。服务端开始/关闭/ready仍以业务事务为准。

运行健康包含失败/等待作业、报告回退、安全错误代码分布、超30天删除、留存最近执行时间/安全失败码、事件与事实对账。活跃时长由可用事件按相邻最多10分钟累计，并明示覆盖；已有缺失观察不能被回填为精确学习时长。未知费用为null，不当0。

## 5. 管理 API 与权限

基础 `/api/admin/v1/majorpilot`，继续现有 RuoYi JWT，Student Cookie不能替代。新分页响应仍用产品 envelope：`data:{rows,total}`、`meta.requestId`；pageNum从1、pageSize默认20/最大100、sortBy/sortOrder白名单。旧 `/reports`、`/task-versions` 数组接口冻结，新增 `/reports/page`、`/task-versions/page` 供表格使用。

- `/overview`：固定过滤条件下的KPI/分专业/漏斗/诊断；`majorpilot:overview:view`。
- `/students`、`/students/{id}`：假名、公有ID、状态、时间、专业进度、版本和同意摘要，不默认邮箱/自由文本；`student:view`。
- `/students/{id}/analytics-exclusion`：NONE/TEST/BOT、必填原因、期望revision、幂等键与审计；独立 `analytics:manage`，不根据邮箱或行为自动推断。
- `/experience-runs`、`/{id}`：状态与脱敏步骤/执行/错误/版本；`experience:view`。现有 `recovery-runs` 保留原revision/原因/审计。
- `/reports/page`、现有报告状态/历史/重生成：普通 report:view不含正文；完整历史/正文继续专门权限和先审计后响应。
- `POST /students/{id}/sensitive-view`、`POST /experience-runs/{id}/sensitive-view`：显式用途/原因，专门 `majorpilot:student:sensitive`、`majorpilot:experience:sensitive`，必要完整内容读取写Audit；普通列表不得借此扩字段。
- `/task-versions/page`及已有验证/发布/退役：不提供网页任意编辑文件；REVIEW未经实际审核仍不可发布。
- `/audit-events`：权限audit:view，默认动作/假名目标/时间/安全结果，不复制敏感原因全文或前后业务内容。
- `/exports`、`/{id}`、`/{id}/download`：独立export:create，创建用途必填、状态/下载均校验发起Operator，下载再次审计。

内部CSV只允许 STUDENTS / EXPERIENCE_RUNS / REPORTS / METRICS 的版本化白名单字段，硬上限10000行，超限明确失败不悄悄截取；过滤与概览同口径。禁止邮箱、自由文本、代码、Reflection、报告正文、风险字段、原始事件/模型prompt。转义逗号/引号/换行及CSV公式前缀，不能把用户文本拼入公式。24小时过期；产物成员关系记录所有可关联Student，任一主体删除即撤销整份旧文件，不等30天。

## 6. 学生账户、导出与删除界面

沿用已有品牌与账户路径，新建 `/app/settings` 及 `/deletion-status/:receiptId`。未验证邮箱也可管理密码、同意、个人导出/删除，不因此开放任务。账户改邮箱/改密码要求当前密码，单次邮件令牌、无账号枚举、分层限流；邮箱变更确认和改密码成功撤销全部Session。邮件token使用fragment并读取即清除，无第三方资源。

个人导出 `REPORTS_ONLY|FULL_PERSONAL_EXPORT` 为异步 ZIP_JSON_HTML。完整导出包含可理解账户资料、所有问卷版本/选择/体验回答与结果/反思、已发布报告版本和反馈，不是原始SQL转储；不含密码/令牌/哈希/风险标记/审计/未验证候选报告/他人内容。报告HTML完全转义，固定私有声明与版本；文件只通过有效Session+归属+CSRF/Origin下载，24小时有效，不暴露磁盘路径。包内包含版本化清单、生成时间和范围。

删除创建预置专用 `MP_DELETION` Cookie，Path严格 `/api/public/v1/deletion-receipts`，HttpOnly/host-only/SameSite=Lax（生产Secure仍属部署门禁），最长127天，数据库仅secret hash。receiptId不是凭证。确认需当前密码+Session+CSRF+幂等键，同事务置DELETION_PENDING、撤销所有Session/EmailToken、过期导出、取消非删除job、持久化ACCOUNT_DELETE；前端即清本机草稿/事件缓存并跳回执。

回执只返回 REQUESTED/PROCESSING/COMPLETED/ACTION_REQUIRED和安全时间；不存在/凭证错误/过期同404。确认后实际过期取确认120天与完成90天较早者，未确认7天，成功查询收紧Cookie期限。即使确认响应丢失，预置Cookie仍可查看；丢失不能凭邮箱/receiptId自动找回，说明人工支持核验。

## 7. V8 与共享实现约定

`V8__operations_privacy_and_retention.sql` 已在主库和隔离测试库执行，Flyway checksum均为 `211975370`；执行后冻结，只能新迁移修正。执行版 SHA-256 为 `470cfbb79d09041e26428811caacc59faa285f7ba991733b8ac97852fa9d138c`。空库V1–V8、V7→V8及主库升级分别验证，证据见台账；没有用测试库迁移代替主库核验。

- `mp_student_account.analytics_exclusion_code` nullable(TEST/BOT)，NONE写NULL；排除修改保留审计/revision。
- `mp_sensitive_audit.owner_student_id` nullable FK/索引；按现存Run/Report/ReportVersion目标精确回填，后续支持/敏感动作写明确归属。无法追溯旧行不猜主体。
- `mp_student_data_export`：id/public_id/student_id/scope/status/format/object_key/file_sha256/file_size_bytes/requested_at/completed_at/expires_at/failure_code/row_version。
- `mp_admin_export`：id/public_id/operator_id/dataset/filters_json/fields_json/purpose/status/object_key/file_sha256/file_size_bytes/row_count/requested_at/completed_at/expires_at/failure_code/row_version；`mp_admin_export_student`记录(export_id,student_id)。
- `mp_account_deletion_request`：id/public_id/student_id nullable/status/requested_at/confirmed_at/scheduled_for/completed_at/failure_code/receipt_id/receipt_secret_hash/receipt_expires_at/current_stage/last_attempt_at/row_version。完成后清空student与可回查引用，只留去标识化回执。
- `mp_background_job.owner_student_id`可空，增加owner_operator_id及job_type归属CHECK；四种既有 Student job（EVIDENCE_BUILD/EVIDENCE_REBUILD/REPORT_GENERATE/COMPARISON_GENERATE）及STUDENT_EXPORT/ACCOUNT_DELETE必须Student owner，ADMIN_EXPORT必须Operator owner，RETENTION_CLEANUP无二者。新worker严格领取自己的job_type。
- 留存有有界批次和可重算健康元数据，无业务明细快照。补必要指标时间/归属索引及MajorPilot菜单/独立权限，不默认授予所有Operator。

共享文件存储由根代理提供 `privacy.PrivateObjectStore`：`write(String logicalKey,byte[]) -> Stored(key,sha256,size)`、`read(String logicalKey)`、`delete(String logicalKey)`。只接受服务端生成 `student/<publicId>.zip` 或 `admin/<publicId>.csv`，放忽略的 `data/private-exports`、文件0600，拒绝符号链接/路径穿越；写临时文件再原子发布。输出不含绝对路径，状态检查与下载不可分离为公开静态链接。

## 8. 删除、并发和留存

删除尽快执行，30天是最长期限不是定时等待。ACCOUNT_DELETE持久分阶段、可重启、持续重试并告警，不用普通3次重试上限永久搁置。普通导出job最多3次/5秒/30秒、60秒租约、独立心跳、lease CAS；异步输出发布前再次锁账户/发起Operator并校验状态。

删除先固定所有归属集合，包括已认领Intake、REPLACED/DEMO/REVIEW_PREVIEW。跨主体或循环异常停止并安全告警，不扩大删除范围。按真实外键拓扑：

1. 撤销并删除个人/包含该Student的内部导出文件，清理成员关联及敏感审计。
2. Student或认领Intake的事件、AI元数据、幂等、安全元数据；解除Report current/target。
3. Comparison Source→Claim Evidence→Claim→Feedback→Report Version→Report。
4. Evidence Item→Snapshot→普通Job（snapshot.origin_job_id决定先后）。
5. Response Execution→Execution；Hint；Reflection Answer→Reflection；Completion→Response Revision→Step State；Closure Request。
6. 清所属Recommendation.source_run_id，再按无子节点删除Run恢复链；不将受CHECK约束的origin随意置空。
7. Decision→Reason→Recommendation→Decision Answer；Profile新到旧；Consent→认领Intake→Session/Token等。
8. 同一最终事务移除ACCOUNT_DELETE job，断开request Student引用并删账户，回执仅留安全处理结果。

所有业务发布与删除使用同一Student锁；迟到模型/文件结果丢弃，不能复活账户内容。内部导出发布锁所有成员Student，按固定ID顺序；删除确认立即使旧下载失效。文件删除失败不能标COMPLETED，重试需能找到逻辑对象键。删除前核对文件类别、所有导出行与job checkpoint中的文件引用归属；错误指向其他Student产物时停止，不通过放宽删除范围解决。

保留默认：匿名Intake7天、到期Token7天、撤销Session30天、AI元数据90天、事件/敏感审计180天、普通成功job30天/失败90天、文件24小时/导出元数据30天、未确认删除7天。清job前只解除已终态且不再被reconciler依赖的snapshot.origin_job_id，不改snapshot正文/hash。删除优先普通留存；不清共享IP限流，账户/邮箱限流仍按短TTL自然到期。外部服务副本、备份及离线旧设备即时擦除不能承诺，公开部署前单独审查。

## 9. 验收与分工约束

| 门禁 | 必须证据 |
| --- | --- |
| M01 指标 | 三核心综合黄金2/3、成熟边界、根未开始/恢复链、跨专业不可替代、首答漏答、重复/缺失view、receivedAt、排除、原版本筛选；实库与独立手算对账 |
| M02 后台 | 分页/白名单排序、筛选回All、0分母null、无权限401/403、Student/JWT分域、敏感读取先审计、支持不能编辑原答案 |
| M03 导出 | 两类导出正常ZIP/CSV字节、内容/公式防护、归属/用途/行上限/24h过期/下载审计、删除前后下载拒绝、重启/旧lease拒绝 |
| M04 账户 | 邮箱token一次性/竞态/当前密码、密码修改撤销多Session、研究撤回不影响核心与必要KPI |
| M05 删除 | 预置Cookie路径、确认响应丢失、多Session即时撤销、含全部实体与恢复链的精确删除、并发报告/导出不回写、JVM重启续做、只留不可关联回执 |
| M06 留存 | 时间可注入的边界测试、上限批次/重复执行、FK未禁用、未来/活跃数据保留、失败可诊断 |
| M07 交付 | Vue strict/build、普通0付费、MySQL集成、Chrome/Edge与手机设置页、V7→V8及空库、秘密/索引检查、提交推送/远端全SHA |

不把自动化演示当真人审核或计时；不把本地运行、Git推送、公网部署或P8完整验收混为一谈。M01–M06已取得独立纯测试、实库、HTTP、浏览器及实际JVM重启证据；M07的最终冻结回归、索引和Git交付状态统一见[验收台账](./35-p7-delivery-ledger.md)，未取得的交付结果不预填成功。
