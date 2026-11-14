# MajorPilot MVP API 契约设计

> 状态：详细设计修订稿 v0.2  
> 更新日期：2026-09-20  
> 适用范围：学生端、匿名流程、管理端、错误、幂等和并发约定  
> 关联文档：[信息架构](./02-mvp-information-architecture.md) · [技术约束](./03-mvp-technical-constraints.md) · [逻辑数据模型](./11-logical-data-model.md)

## 1. API 边界

2026-11-14 的个人资料、匿名部分提交和自主开始接口见 [48](./48-profile-dashboard-and-payment-demo.md)，优先于本文件早期的完整问卷及来源推荐前置条件。新增接口继续使用本文的身份、CSRF、归属、幂等与错误协议；支付演示不新增业务写 API。

| 边界 | 基础路径 | 身份 | 客户端 |
| --- | --- | --- | --- |
| 公开与匿名流程 | `/api/public/v1` | 无 Student 身份；Intake、删除回执各用独立限定凭证 | `majorpilot-web` |
| 学生业务 | `/api/app/v1` | Student Session | `majorpilot-web` |
| 内部管理 | `/api/admin/v1/majorpilot` | RuoYi Operator Account + 权限 | `majorpilot-admin` |

三类路径使用独立安全匹配规则。Student Session 不会被管理安全链识别，RuoYi 管理 Token 也不会自动获得学生资源访问权。

前端不得直接调用百炼、DeepSeek、邮件服务或数据库。浏览器执行资源只接收 Task Version 声明的公开任务资产。

## 2. 通用协议

- 使用 HTTPS；本地开发允许 `localhost` HTTP，但不能放宽生产 Cookie 和来源策略；
- JSON 字段采用 `camelCase`；
- 时间采用 ISO 8601 UTC，例如 `2026-09-20T12:34:56.789Z`；
- 外部资源标识使用 `publicId`，不暴露数据库自增 ID；
- 请求和响应均包含 `X-Request-Id`，缺失时由服务端生成；
- 服务端日志使用 correlation ID，不记录密码、会话、重置令牌或模型密钥；
- 写请求只接受明确 `Content-Type: application/json`；
- 默认拒绝未声明字段，兼容性字段需要 API 版本升级策略；
- 字符串在服务端进行长度、编码和控制字符校验；
- 所有资源归属在服务端验证，无法访问的私有资源统一返回不泄露存在性的响应。

## 3. 标准响应

### 3.1 成功响应

```json
{
  "data": {},
  "meta": {
    "requestId": "req_...",
    "apiVersion": "v1"
  }
}
```

创建成功使用 `201` 并返回资源。异步接受使用 `202` 和可查询的 job 或 report 标识。无响应体的成功操作使用 `204`。

### 3.2 错误响应

```json
{
  "error": {
    "code": "STEP_REVISION_CONFLICT",
    "message": "This step was updated elsewhere.",
    "fieldErrors": [],
    "retryable": false
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

`message` 是安全、可显示的概述，不能包含堆栈、SQL、供应商响应或秘密。学生端根据稳定 `code` 显示本地化文案。

### 3.3 HTTP 状态

| 状态 | 用途 |
| ---: | --- |
| 400 | JSON、查询参数或基本格式错误 |
| 401 | 缺少、过期或撤销的当前身份凭证 |
| 403 | 已认证但缺少管理权限或操作不允许 |
| 404 | 资源不存在或当前主体无权知道其存在 |
| 409 | 状态转换、重复资源、幂等键或 revision 冲突 |
| 422 | 格式正确但不满足领域规则 |
| 429 | 登录、注册、提示、执行或模型调用频率过高 |
| 503 | 可恢复的外部服务或暂时资源不可用 |

## 4. 身份和 Cookie

### 4.1 Intake 凭证

创建 Intake Session 后，服务端设置短期 HttpOnly Cookie：

- 名称建议 `MP_INTAKE`；
- host-only，`Path=/api/public/v1`，同时覆盖 Intake 与 `/auth/register` 认领接口；
- `SameSite=Lax`；生产环境 `Secure`；
- 值为不可恢复的随机 secret，数据库只保存哈希；
- 最近有效操作后7天到期，Cookie 与数据库到期时间一致；认领或清理后失效。

仅有 URL 中的 `publicId` 不能读取 Intake 数据。

### 4.2 Student Session

学生登录采用服务端可撤销的 opaque session：

- HttpOnly Cookie `MP_SESSION`；
- 生产环境 `Secure`；
- `SameSite=Lax`；
- host-only，`Path=/api/app/v1`，退出登录也位于此路径下；
- 浏览器 JavaScript 无法读取；
- 数据库保存哈希和撤销状态，Redis 可缓存但不是唯一来源；
- 绝对有效期7天，连续24小时无活动失效；不提供无限延期的“记住我”；
- 修改／重置密码、确认删除和安全锁定会撤销全部 Student Session，包括当前设备。

### 4.3 CSRF、引导与路径矩阵

两类前台写请求分别使用 `MP_PUBLIC_CSRF` 和 `MP_CSRF` 可读 Cookie；均为 host-only、`Path=/`、`SameSite=Lax`，生产 `Secure`。页面在站点根路径也必须能读取，不能继承 API 子路径。客户端按 API 边界将对应值放入 `X-CSRF-Token`，后端校验签名、有效期、Cookie/header 一致与精确允许的 Origin，不只做字符串相等比较。

- `GET /api/public/v1/auth/csrf` 签发／刷新匿名 CSRF token；已有 Intake 时绑定该 Intake，未创建时使用签名随机 nonce。创建 Intake 后轮换为绑定值；注册成功清除 Intake 和匿名 CSRF Cookie。
- 登录成功签发新的 MP_SESSION 和绑定该会话的 MP_CSRF；刷新页面用 `GET /api/app/v1/auth/csrf` 恢复 CSRF 值。匿名和学生 CSRF 不互相覆盖。
- 注册事务创建待验证账户并认领 Intake，不等邮箱验证成功才认领；验证失败可重发，不能把已认领 Intake 绑定给另一个账户。邮箱验证不自动创建会话；登录后未验证账户仅可访问账户／验证辅助功能，不能开始任务。
- 登录／注册响应丢失时通过正常登录恢复已认领资料；幂等记录不缓存或重放原始 Session、密码、邮件令牌和 Set-Cookie。
- 退出及密码变更成功时，以与设置相同的名称、Path 清除 MP_SESSION 和 MP_CSRF。生产配置不得设置父域 Domain；本地 HTTP 例外只针对本地环境。

| 请求 | 应携带身份 Cookie | CSRF |
| --- | --- | --- |
| 创建 Intake | 无；创建后设置 MP_INTAKE | MP_PUBLIC_CSRF |
| 保存／提交 Intake、注册认领 | MP_INTAKE | MP_PUBLIC_CSRF |
| 登录、验证、重置密码 | 无 Student Cookie，按需验证一次性邮件令牌 | MP_PUBLIC_CSRF |
| 学生写请求、退出 | MP_SESSION | MP_CSRF |
| 删除回执只读查询 | MP_DELETION | 不接受写操作 |

Cookie Path 只是发送范围，不代替认证、归属校验和安全链隔离。

### 4.4 Operator Session

管理端沿用 RuoYi 管理认证机制，但使用与学生端不同的密钥、Token 类型和安全链。管理权限以 RuoYi 角色与权限点判断，不允许通过 Student Session 交换管理 Token。

## 5. 幂等与并发

### 5.1 `Idempotency-Key`

以下操作要求客户端发送不含个人信息的随机 `Idempotency-Key`：

- 提交 Decision Profile；
- 注册并认领 Intake Session；
- 作出 Recommendation Decision；
- 创建或开始 Experience Run；
- 暂停、恢复或切换 Experience Run；
- 请求浏览器／服务端执行记录；
- 提交 Reflection；
- 提交用户反馈；
- 申请学生个人数据导出；
- 申请删除账户；
- 管理端触发报告重生成或数据导出。

相同身份、路径和 key 的重复请求返回首次结果。相同 key 但请求体不同返回 `409 IDEMPOTENCY_KEY_REUSED`。

记录持久化于 `mp_idempotency_record`，范围包括主体、HTTP 方法、标准化资源路径和 key；以事务保证并发只执行一次。处理中返回 `409 REQUEST_IN_PROGRESS` 和安全重试提示；常规记录保留24小时，长期业务唯一约束继续生效。认证必须先于结果重放，已撤销会话不能用旧 key 绕过认证。含秘密的请求用服务端 HMAC 指纹，不保存原始请求体；认证响应仅保存资源引用和安全恢复指引。

### 5.2 乐观锁

步骤保存、Reflection 草稿和账户设置携带 `expectedRevision`。服务端只在当前 revision 相等时更新，否则返回：

```json
{
  "error": {
    "code": "STEP_REVISION_CONFLICT",
    "message": "A newer version is already saved.",
    "retryable": false
  },
  "data": {
    "currentRevision": 7
  }
}
```

客户端不能静默用旧内容覆盖新内容。

## 6. 公开与匿名 API

| 方法 | 路径 | 作用 | 关键规则 |
| --- | --- | --- | --- |
| GET | `/majors` | 获取三个 Major 的公开简介 | 无任务答案和内部规则 |
| GET | `/questionnaires/current` | 获取当前问卷定义 | 返回版本、字段和展示规则 |
| GET | `/auth/csrf` | 获取匿名 CSRF token | 不签发学生身份 |
| POST | `/intake-sessions` | 创建 Intake Session | 设置 Intake Cookie |
| GET | `/intake-sessions/{id}` | 恢复当前草稿 | 同时需要匹配 Intake Cookie |
| PUT | `/intake-sessions/{id}/draft` | 保存问卷草稿 | `expectedRevision` |
| POST | `/intake-sessions/{id}/submit` | 提交 Decision Profile 并生成推荐 | 要求 Idempotency-Key |
| POST | `/intake-sessions/{id}/finish` | 保存空或部分背景并结束本次填写 | 推荐可为空；保留 Intake Cookie 认领，要求 Idempotency-Key |
| GET | `/intake-sessions/{id}/recommendation` | 查看注册前真实推荐 | 不隐藏主推荐和核心理由 |
| POST | `/auth/register` | 创建 Student Account 并认领 Intake | 不允许重复认领 |
| POST | `/auth/verify-email` | 使用一次性令牌验证邮箱 | 令牌不出现在日志 |
| POST | `/auth/verify-email/resend` | 重发验证邮件 | 无论账户存在与否统一响应，按邮箱及来源限流 |
| POST | `/auth/login` | 学生邮箱密码登录 | 速率限制和统一失败信息 |
| POST | `/auth/password/forgot` | 请求密码重置 | 无论邮箱存在与否返回相同外观 |
| POST | `/auth/password/reset` | 重置密码并撤销旧会话 | 一次性令牌 |
| GET | `/deletion-receipts/{receiptId}` | 查询删除回执 | 匹配 MP_DELETION，只返回处理状态与时间 |
| POST | `/events` | 匿名页面事件批量上报 | Intake + 匿名 CSRF；见第 9.1 节 |

### 6.1 提交问卷

请求只提交当前 questionnaire version 声明的 question keys。响应包含：

- `decisionProfileId`；
- `recommendationId`；
- `primaryMajor`；
- `alternativeMajors`；
- 2–4 条结构化理由；
- 三项差异摘要；
- `explanationStatus`；
- `canRegister`。

如果 AI 解释失败，返回结构化模板理由和 `explanationStatus = STRUCTURED_ONLY`，状态仍为成功。

## 7. 学生账户与主页 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/me` | 当前 Student Account 的安全资料和验证状态 |
| GET | `/auth/csrf` | 获取绑定当前 Student Session 的 CSRF token |
| POST | `/auth/logout` | 撤销当前会话并清除 Cookie；要求 CSRF |
| PATCH | `/me/email` | 发起邮箱变更验证 |
| POST | `/me/email/confirm` | 使用一次性令牌确认新邮箱 |
| PATCH | `/me/password` | 校验当前密码后修改，撤销全部会话，要求重新登录 |
| GET | `/dashboard` | 三个 Major 状态、推荐、继续入口和报告入口 |
| GET | `/profile` | 最新正式背景、独立草稿、草稿 revision；缺失与主动跳过分开 |
| PUT | `/profile/draft` | 按草稿 revision 及正式资料版本校验并保存，不改变正式背景 |
| POST | `/profile/submit` | 追加完整或部分资料版本，要求 Idempotency-Key；信息足够才附初始推荐 |
| POST | `/profile/draft/discard` | 校验草稿 revision 后丢弃草稿，保留正式与历史资料 |
| GET | `/decision-profiles` | 查看自己的版本摘要 |
| POST | `/decision-profiles` | 提交新版本并重新推荐 |
| GET | `/recommendations/{id}` | 查看自己的推荐和理由 |
| POST | `/recommendations/{id}/decision` | 追加接受／Override 决定并返回 decisionId；不创建 Run，要求 Idempotency-Key |
| GET | `/consents` | 查看当前和历史授权摘要 |
| POST | `/consents/research/withdraw` | 撤回可选研究授权 |
| POST | `/account-deletion-requests` | 发起请求并预先设置只读 MP_DELETION 回执 Cookie |
| POST | `/account-deletion-requests/{id}/confirm` | 确认删除并撤销会话 |
| GET | `/account-deletion-requests/{id}` | 确认前在已登录账户中查看；确认后转公共回执查询 |
| POST | `/feedback` | 提交页面、任务或报告反馈 |
| POST | `/data-export-requests` | 申请报告或完整个人数据导出 |
| GET | `/data-export-requests/{id}` | 查看导出状态 |
| GET | `/data-export-requests/{id}/download` | 登录并校验归属后下载短期文件 |
| POST | `/events` | 学生页面事件批量上报；要求 Session、CSRF 与资源归属 |

`GET /me` 不返回密码状态细节、内部 ID、管理角色或其他学生数据。

本轮新页面使用 `/profile` 系列；旧 `/decision-profiles` 保留兼容。精确字段与冲突码见 [资料流程可执行合同](../contracts/openapi-profile-flow.json)。草稿 revision 在提交及取消后仍递增，避免旧标签页重新写回已丢弃的草稿。

### 7.1 用户反馈

反馈请求只接受：`feedbackType`、可选 `contextType`、当前主体拥有的可选 `contextPublicId`、可选 1–5 分、最长 1000 字的 `comment`、可选 `surveyVersion` 与该版本白名单 `answers`，以及明确同意附带的诊断代码。服务端自行补充当前页面类别、Major/Task Version 等允许上下文，不接受前端上传任意账户、日志或请求内容。

同一反馈通过 `Idempotency-Key` 防止重复；提交失败时学生端保留本地草稿。反馈用于产品改进，不自动改变推荐、任务完成或报告内容，也不默认进入通用 CSV 导出。

### 7.2 学生个人数据导出

创建请求时 `scope` 只能是 `REPORTS_ONLY` 或 `FULL_PERSONAL_EXPORT`。服务端异步生成可理解的 JSON 与报告 HTML 压缩包；状态接口不暴露本地路径。下载要求有效 Student Session、CSRF/Origin 保护和资源归属，文件默认24小时过期。删除账户确认后所有旧下载立即失效。

个人导出与管理端 CSV 是两个独立合同：前者只服务数据主体且包含可理解个人内容，后者服务受控分析、默认假名化并有内部用途审计。

### 7.3 删除确认与回执

创建删除请求时先生成高熵回执 secret，仅将哈希入库，通过 HttpOnly、host-only、SameSite=Lax、生产 Secure 的 `MP_DELETION` 设置，`Path=/api/public/v1/deletion-receipts`。返回的 receiptId 不是凭证。此 Cookie 不能登录、下载数据、读取账户或确认／取消删除。

确认必须携带当前密码、有效 Session、CSRF 与 Idempotency-Key；密码不入日志或幂等响应。事务撤销全部会话并持久化删除作业。前端立即清理本机该账户草稿并转 `/deletion-status/:receiptId`。即使确认响应丢失，预先取得的回执 Cookie 仍可判断结果；不会为查询进度保留正常登录权限。回执查询统一返回 REQUESTED／PROCESSING／COMPLETED／ACTION_REQUIRED 及时间，不返回邮箱、内部失败堆栈或业务数据；不存在、凭证错误、过期统一404。

回执到期为“确认后120天”与“完成后90天”中的较早者；未确认请求7天到期。Cookie 不可跨设备自动恢复；丢失时告知通过人工支持核验，不能仅凭 receiptId 或邮箱找回。处理超期需要管理告警，不能用回执期限掩盖30天删除目标。

创建请求预置的 Cookie 最长127天（7天确认窗口+120天），服务端始终用记录实际期限校验；确认或状态查询成功时将浏览器到期时间收紧到服务端期限。这样确认响应丢失不会使原本只存7天的 Cookie 提前消失；到期／处理完成后按 Path 清理过期 Cookie，不扩大查询权限。

修改密码、删除确认和邮箱变更均要求当前密码再验证；邮箱变更成功撤销全部会话。邮件令牌放在前端 URL fragment，页面读取后立即清除，再通过 POST body 提交；重置／验证页面不加载第三方资源，设置 no-referrer，避免令牌进入访问日志。

## 8. Experience Run API

| 方法 | 路径 | 作用 | 允许状态 |
| --- | --- | --- | --- |
| POST | `/experience-runs` | 引用 decisionId 或直接指定 majorCode 创建／复用 Ready Run | 自主选择不制造推荐；每专业最多一个当前 Run；已有 Paused／Closed 返回其继续／报告入口 |
| GET | `/experience-runs/{id}` | 获取运行摘要和当前步骤 | 所有归属状态 |
| POST | `/experience-runs/{id}/start` | 固定 Task Version 并正式开始 | `READY` |
| POST | `/experience-runs/{id}/pause` | 保存后明确暂停，释放活动名额 | `IN_PROGRESS` 或 `TASK_COMPLETED` |
| POST | `/experience-runs/{id}/resume` | 回到暂停前阶段，不重新计开始 | `PAUSED` |
| GET | `/experience-runs/{id}/task` | 获取固定 Task Version 的学生可用 manifest | 已开始且非 REPLACED；PAUSED／CLOSED 只读 |
| GET | `/experience-runs/{id}/steps/{stepKey}` | 获取步骤内容和当前 response | 允许访问的步骤 |
| PUT | `/experience-runs/{id}/steps/{stepKey}/response` | 保存新 revision | `IN_PROGRESS` |
| POST | `/experience-runs/{id}/steps/{stepKey}/complete` | 完成步骤 | IN_PROGRESS 且依赖已满足 |
| POST | `/experience-runs/{id}/executions` | 记录受控执行并返回结果 | `IN_PROGRESS` |
| POST | `/experience-runs/{id}/hints` | 请求指定层级提示 | `IN_PROGRESS` |
| POST | `/experience-runs/{id}/task-completion` | 完成核心任务 | IN_PROGRESS 且所有必需步骤完成 |
| GET | `/experience-runs/{id}/reflection` | 获取反思定义和草稿 | TASK_COMPLETED，或暂停反思阶段，或 CLOSED 只读 |
| PUT | `/experience-runs/{id}/reflection` | 保存 Reflection 草稿 | `TASK_COMPLETED` |
| POST | `/experience-runs/{id}/reflection/submission` | 提交 Reflection 并关闭 Run | TASK_COMPLETED；要求 Idempotency-Key 与 expectedRevision |
| POST | `/experience-runs/{id}/reflection/follow-up` | 主动请求一次可跳过的 AI 追问 | TASK_COMPLETED；不改变必填字段 |

### 8.1 创建和开始分开

创建 Run 表示学生确认选择，状态为 Ready。只有调用 start 才分配并固定当前 PUBLISHED Task Version。这样打开介绍页不会被记录为正式开始。

READY 不占活动名额；相同 Major 的当前 Run 已存在则返回它，不创建 attempt。普通专业 Run 在创建时固定最新正式背景，未提供背景则绑定明确空快照，不把草稿当正式答案。推荐／决定的原始引用保留，不因背景更新而改写；异常恢复 Run 按 `11` 沿用原版本／背景。PAUSED 继续使用 resume，CLOSED 返回报告入口，REPLACED 返回恢复 Run 指针且不能写入。

复用已有 READY 不重新绑定背景。仅针对历史尚未绑定 profile、尚未开始且不属于恢复的 READY，保留显式新 decisionId 与 expectedRevision 的兼容更新；缺失或过期返回409，不静默改变。新建或已开始运行不走此路径。

start／resume 必带目标 `expectedRevision`；若有另一个活动 Run，默认返回409 ACTIVE_RUN_EXISTS。学生明确确认切换后，可附 `pauseActiveRunId` 与 `expectedActiveRunRevision`；服务端锁定学生及运行，在同一事务暂停所声明的活动 Run 并激活目标。活动 id/revision 不符或目标不可开始则全部回滚，不能静默暂停另一个新开的任务。pause 同样带 expectedRevision；保存未成功时不自动暂停、不提示已同步。

TASK_COMPLETED 占用活动名额直至提交反思或明确暂停。PAUSED 的写请求统一409 RUN_PAUSED；另一个标签页收到后保留本地未同步差异供原账户检查，不能自动恢复或覆盖服务器。

### 8.2 保存 response

```json
{
  "expectedRevision": 6,
  "responseSchemaVersion": "ai-task-response-v1",
  "response": {}
}
```

响应返回新 revision、服务端保存时间和验证摘要。服务端按照 Task Version 校验 stepKey、字段和大小，不接受任意文件路径或可执行内容。

### 8.3 受控执行

执行请求只引用 Task Version 中的 operation key 和允许参数：

```json
{
  "operationKey": "evaluate-classifier",
  "inputRevision": 7,
  "parameters": {}
}
```

API 不接受任意 shell、任意网络地址或服务端文件路径。`evaluate-classifier` 在服务端按 `09` §5.4A 从已保存 inputRevision 读取白名单配置并重新计算；请求中不接受 prediction、gold_label 或指标。结果为 SERVER_VERIFIED，正式评分只返回聚合信息；重复配置复用已有结果。

DS／BA 本地预览可以提交 operationKey、inputRevision、输入哈希和受控结果摘要；后端只调用同一操作的固定计算器校验，不执行传入的任意代码。已支持的固定操作重算通过才标 SERVER_VERIFIED；尚不能重算的结果仅可标 CLIENT_OBSERVED，不支持正确性结论，也不能通过必需计算步骤。过期 revision、暂停或删除确认后的迟到结果不推进步骤。

### 8.4 Hint Request

请求包含 `stepKey` 和 `hintLevel`。后端自行构建允许上下文，不接受前端上传完整提示词或任意模型 system message。

反思追问另走 `/reflection/follow-up`，使用 Idempotency-Key；同一 Run 最多一个成功追问，重复请求返回原问题，失败可重试或跳过。追问或提示的迟到结果不推进步骤，暂停／关闭／删除后不自动写入学生回答。

## 9. 报告 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/reports` | 当前 Student 的报告摘要列表 |
| GET | `/reports/{id}` | 当前可见 Report Version |
| GET | `/reports/{id}/status` | 生成状态和安全失败信息 |
| GET | `/reports/{id}/print` | 登录后打印友好数据或页面入口 |
| GET | `/comparison-report` | 当前比较报告或未满足条件原因 |

Run 关闭后后端自动创建 Experience Report，不要求学生重复点击。生成中返回 `202` 或 `status = GENERATING`。模型失败并进入确定性降级时仍可以返回 READY，并标明个性化解释有限。

学生端没有“选择模型”“编辑结论”“指定 Evidence”或查看历史 Report Version 的 API。

### 9.1 页面事件接收合同

公共 `/events` 只接受当前 Intake 的 recommendation.viewed；学生 `/events` 接受 recommendation.viewed、experience.step.viewed、experience.run.resumed（仅自动离开后返回的页面观察）、report.viewed、report.printed、next_recommendation.viewed、comparison_report.viewed。所有领域事实事件只能由后端事务产生；明确的 pause/resume 使用后端 experience.run.paused／reactivated，不混入页面观察事件。

请求为 `{events:[{clientEventId,eventName,eventVersion,occurredAt,contextType,contextPublicId,properties}]}`；最多20条、整体16KiB，每主体每分钟60批。服务端从 Cookie 确定主体、source、Task Version 等，不接受 studentId、source 或任意资源归属。校验 `13` 属性白名单、context 所有权与版本；批次存在不合法项则422且整批不落库，返回安全字段错误。重复合法项跳过；成功返回202及 acceptedCount／duplicateCount。

clientEventId 为随机 UUID，按服务端主体作用域去重；“首次有效展示”另按主体+事件+上下文版本去重。有效展示定义为文档可见且核心内容完成渲染并持续1秒；print 表示打印视图被触发，不声称实际打印成功。未来超过5分钟或早于接收24小时的 occurredAt 拒绝；报表采用 receivedAt，保留客户端时间仅作诊断。

前端只在内存缓冲事件，最多60秒重试；失败不阻塞主流程，不持久化敏感离线队列。确认删除／退出立即清空缓冲。服务端 GET 报告成功不代替 report.viewed，事件缺失显示为未观测而不是证明用户未阅读。

## 10. 管理端 API

所有路径要求 RuoYi 权限点，至少划分：

- `majorpilot:overview:view`；
- `majorpilot:student:view`；
- `majorpilot:experience:view`；
- `majorpilot:report:view`；
- `majorpilot:report:regenerate`；
- `majorpilot:task:view`；
- `majorpilot:task:publish`；
- `majorpilot:export:create`；
- `majorpilot:audit:view`；
- `majorpilot:recovery:create`。

### 10.1 概览和查询

| 方法 | 路径 | 权限 | 作用 |
| --- | --- | --- | --- |
| GET | `/overview` | overview:view | 基础漏斗和运行状态 |
| GET | `/students` | student:view | 假名化学生查询 |
| GET | `/students/{id}` | student:view | 最小必要学生摘要 |
| GET | `/experience-runs` | experience:view | 按状态、Major、Task Version 查询 |
| GET | `/experience-runs/{id}` | experience:view | 运行状态和脱敏步骤摘要 |
| GET | `/reports` | report:view | 生成状态和失败类型 |
| GET | `/reports/{id}` | report:view | 当前报告和脱敏 Evidence 摘要 |
| GET | `/audit-events` | audit:view | 敏感操作审计 |

读取完整 Reflection、自由文本或历史 Report Version 需要比普通 student:view 更高的专门权限，并写 `mp_sensitive_audit`。

### 10.2 内容版本

| 方法 | 路径 | 权限 | 作用 |
| --- | --- | --- | --- |
| GET | `/task-versions` | task:view | 查看 manifest、校验值和状态 |
| POST | `/task-versions/validate` | task:publish | 验证仓库中的候选版本 |
| POST | `/task-versions/{id}/publish` | task:publish | 发布已审核版本 |
| POST | `/task-versions/{id}/retire` | task:publish | 停止分配给新 Run |

管理 API 不提供网页直接编辑任意任务文件。内容修改通过仓库评审，管理端只验证、发布和退役版本。

### 10.3 恢复、重生成和导出

| 方法 | 路径 | 权限 | 约束 |
| --- | --- | --- | --- |
| POST | `/experience-runs/{id}/recovery-runs` | recovery:create | 仅未完成当前 Run；原子置 REPLACED 并创建新 READY；原因、revision、幂等键及审计必需 |
| POST | `/reports/{id}/regenerations` | report:regenerate | 创建新 Report Version；要求 Idempotency-Key 和原因 |
| POST | `/exports` | export:create | 字段、范围和用途白名单；异步 |
| GET | `/exports/{id}` | export:create | 查看状态并短期下载 |

禁止提供“修改学生答案”“编辑 Reflection”“直接标记完成”“直接编辑报告正文”的端点。

## 11. 管理端分页和导出

为兼容 RuoYi 管理表格，管理查询使用：

- `pageNum`：从1开始；
- `pageSize`：默认20，最大100；
- 白名单 `sortBy` 和 `sortOrder`；
- 响应包含 `rows`、`total` 和 `requestId`。

学生端少量历史列表使用 cursor 分页，cursor 是不透明值，最大 `limit = 50`。

CSV 导出不能复用普通分页接口绕过字段控制。导出任务单独定义字段白名单、最大行数、过期时间和审计。

## 12. 稳定错误代码

首版至少定义：

- `AUTH_REQUIRED`、`SESSION_EXPIRED`、`CSRF_INVALID`；
- `EMAIL_ALREADY_REGISTERED`、`EMAIL_NOT_VERIFIED`、`ACCOUNT_LOCKED`；
- `INTAKE_EXPIRED`、`INTAKE_ALREADY_CLAIMED`；
- `QUESTIONNAIRE_VERSION_STALE`、`DECISION_PROFILE_INVALID`；
- `RECOMMENDATION_NOT_FOUND`、`MAJOR_NOT_AVAILABLE`；
- `ACTIVE_RUN_EXISTS`、`RUN_STATE_INVALID`、`TASK_VERSION_UNAVAILABLE`；
- `RUN_PAUSED`、`RUN_REPLACED`、`RUN_REVISION_CONFLICT`；
- `STEP_NOT_AVAILABLE`、`STEP_REVISION_CONFLICT`、`STEP_VALIDATION_FAILED`；
- `EXECUTION_TIMED_OUT`、`EXECUTION_NOT_ALLOWED`；
- `EVALUATION_LIMIT_REACHED`、`EXECUTION_REVISION_STALE`；
- `HINT_RATE_LIMITED`、`AI_TEMPORARILY_UNAVAILABLE`；
- `REFLECTION_INCOMPLETE`；
- `REPORT_GENERATING`、`REPORT_GENERATION_FAILED`；
- `RESOURCE_NOT_FOUND`、`PERMISSION_DENIED`；
- `IDEMPOTENCY_KEY_REQUIRED`、`IDEMPOTENCY_KEY_REUSED`；
- `REQUEST_IN_PROGRESS`、`EVENT_BATCH_INVALID`；
- `FEEDBACK_INVALID`；
- `DATA_EXPORT_NOT_READY`、`DATA_EXPORT_EXPIRED`；
- `EXPORT_LIMIT_EXCEEDED`。

## 13. API 验收

1. Student Session 调用任何管理路径均失败；
2. Operator Token 不能直接读取学生私有报告路径；
3. 仅凭另一个学生的 publicId 无法确认资源是否存在；
4. 注册请求重复提交只创建一个 Student Account 并只认领一次 Intake；
5. 相同问卷提交重复请求返回同一 Recommendation；
6. 旧 revision 保存返回冲突且不覆盖新内容；
7. 同一学生并发开始两个 Run 时最多一个成功；
8. Task Version 更新后旧 Run 仍获得固定版本内容；
9. 模型不可用时规则推荐、静态提示和确定性报告降级仍可工作；
10. 报告生成失败不会改变 Experience Run 的 Closed 状态；
11. 管理员恢复和重生成必须带权限、原因、幂等键和审计；
12. API 错误不包含堆栈、SQL、完整请求、令牌或供应商秘密；
13. 登录、注册、重置、提示、执行和导出分别有速率限制；
14. 所有学生写请求通过 CSRF 和 Origin 校验；
15. OpenAPI 契约测试能验证字段、枚举、错误代码和权限边界。
16. 反馈只能绑定当前学生拥有的上下文，且不允许夹带任意日志、账户标识或其他用户资源。
17. 学生个人导出只能由所属学生下载，过期或删除确认后立即失效，并且不包含内部秘密或其他用户数据。
18. 浏览器实测注册认领携带 MP_INTAKE，退出携带 MP_SESSION；SPA 页面可读取各自 CSRF，跨边界 token 被拒绝。
19. 切换失败保持原活动运行，成功时恰好一个活动运行；暂停后的旧标签页不能继续保存或完成。
20. 删除确认响应丢失仍可查专用回执，但不能读取任何账户／报告资源；密码修改后当前设备也重新登录。
21. 客户端不能伪造后端完成事件、他人观看事件或评分结果；事件失败不改变领域状态。
