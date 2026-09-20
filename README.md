# MajorPilot

通过短时、基于证据的体验，帮助学生比较 Artificial Intelligence、Data Science 和 Business Analytics。技术栈为 RuoYi Spring Boot 3 + 独立 Vue 3 学生端／管理端 + MySQL + Redis。

**P2 版本化任务引擎与通用工作区已完成本地实施和验收**：在P1首页、Intake、推荐与账户基础上，新增真实保存/执行/分层提示、暂停切换、草稿恢复及反思闭环。两个本地技术演示不属于AI/DS/BA，也不生成专业报告。见 [P2–P6交付记录](docs/23-p2-to-p6-delivery-ledger.md) 和 [工作区视觉验收](docs/24-p2-workspace-visual-direction.md)。专业内容、证据报告及完整MVP仍需P3–P8；不声称公网生产已就绪。

P1保留记录见 [身份与推荐验收](docs/21-p1-implementation-and-delivery.md)、[已确认视觉方向](docs/22-p1-visual-direction.md)。按2026-09-20用户确认，首次推荐使用确定性规则解释，AI润色单列后续增强。

产品事实与设计入口见 [docs/README.md](docs/README.md)，实施范围见 [P0–P8 路线](docs/16-implementation-roadmap-and-traceability.md)，历史技术底座见 [P0 记录](docs/20-p0-implementation-evidence.md)。

## 本地运行（macOS Apple Silicon）

需要已安装 JDK 21、基础 Node、`curl`、`tar` 和 Xcode Command Line Tools（编译项目私有 Redis）。当前 JDK 默认 `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`，其他安装位置设置 `MP_JAVA_HOME`。不要求 Docker，不修改或复用系统数据库。

```sh
sh scripts/bootstrap-local
sh scripts/build-local
sh scripts/start-local
```

首次 bootstrap 下载校验固定版本到忽略的 `data/tools/`，为本项目初始化 MySQL 和 Redis，并启动本地邮件捕获器。`configure-local.mjs` 仅补全缺失／空值的本地配置与随机凭证，保留已有非空值及所有百炼／DeepSeek 字段；不会存入钥匙串。数据库已初始化后不要单独改密码而不更新数据库账户。

`build-local` 通过 `npm ci` 安装 lockfile 依赖并构建双前端，再用 Maven Wrapper 打包后端。数据库迁移在后端首次启动执行。启动时校验端口与项目进程归属，不会停止其他项目进程。所有服务均监听 loopback，不适合公网部署。

后端启动时将完成的 JAR 按 SHA-256 保存为 `data/runtime/` 中的独立只读副本，避免重新构建覆盖运行中的嵌套 JAR。重复 `start-local` 不会替换正在运行的版本；应用新构建时先 `sh scripts/stop-local`，再 `sh scripts/start-local`。不要手动运行或覆盖正在使用的 `target/ruoyi-admin.jar`。

Codex 的 macOS 沙箱可能禁止 MySQL 的 `hw.cachelinesize` 查询以及 `ps` 进程校验：出现初始化 SIGSEGV／process inspection 错误时，通过明确权限审批在沙箱外运行同一脚本，或在自己的终端运行；不要因此降级 MySQL 或关闭数据库安全边界。

| 组件 | 地址／端口 | 数据／职责 |
| --- | --- | --- |
| 学生产品首页 | http://localhost:15173 | 新视觉、正式 Intake、推荐和账户流程 |
| P0 技术验证页 | http://localhost:15173/p0 | 固定执行器探针；合成身份需独立 p0 profile |
| 管理端 | http://localhost:15174 | RuoYi 管理登录；本地随机密码 |
| 后端 | 127.0.0.1:18080 | 默认 `local` profile，正式身份与任务引擎 API |
| 执行器 | 127.0.0.1:15175 | 不同 hostname、无凭证的固定计算器 |
| MySQL 8.4.11 | 127.0.0.1:13306 | `data/mysql/`，majorpilot / majorpilot_test |
| Redis 7.2.16 | 127.0.0.1:16380 | `data/redis/`，独立认证与 AOF |
| Mailpit 1.31.2 | http://127.0.0.1:18025 | SMTP 11025；仅本地合成邮件 |

端口的运行脚本配置集中于 `scripts/local-config.mjs`；前端代理及 Cookie Origin 当前固定为这套本地地址。不要只改一处端口来测试 Origin 安全边界。`local` 和 `p0` 不同时运行；默认健康入口为 `/api/public/v1/health`。

管理员名 `admin`；随机密码位于 `.env.local` 的 `MP_P0_ADMIN_PASSWORD`，使用编辑器在本机查看。学生 P0 探针也只使用生成的本地测试口令；它们不是注册产品。不把这些值粘贴到聊天、截图或工单。

```sh
sh scripts/check-env
sh scripts/test-unit
sh scripts/test-integration
sh scripts/test-p1-e2e
sh scripts/test-p2-e2e
sh scripts/verify-secrets
sh scripts/stop-local
```

`test-integration` 只使用独立 `majorpilot_test` 库；`test-infra.mjs` 会重启本项目的 MySQL／Redis，需在没有其他本项目测试进行时单独执行。停止脚本核对 PID 的启动时间与完整命令，只关闭本项目记录的进程并保留数据。日志位于忽略的 `logs/`；不要发布未经检查的完整日志。

`test-p1-e2e` 依次运行真实 HTTP／事件合同和 Chrome／Edge 完整流程；创建并精确清理本轮合成账户、草稿与捕获邮件。不放宽正式限流：重复运行可能触发本地共享 IP 的每小时注册限制，应等待窗口自然恢复，不清空 Redis 绕过。P0 回归需先停止本项目服务，再 `sh scripts/start-local --profile=p0` 并执行 `sh scripts/test-e2e`；完成后停止并以默认 `local` 重启。两个 profile 都保留原数据。

P2演示需要在忽略的 `.env.local` 中显式设置 `MP_P2_DEMO_ENABLED=true`，默认关闭；登录后从个人主页进入“工作区上手演示”。任务AI开关 `MP_EXPERIENCE_AI_ENABLED` 默认false，普通验收保持关闭，使用已审核静态提示；不伪装为模型生成。`test-p2-e2e`顺序运行真实HTTP和Chrome/Edge任务闭环，共创建并精确清理4个合成账户，仍遵守共享IP注册限额。

`data/tools/node/bin/node scripts/test-p2-recovery.mjs`仅在其他本项目测试结束后单独执行：要求标准项目托管后端、显式关闭任务AI及空闲Redis DB15，实际重启后端并在finally恢复原配置，不清空正常DB0。它不是操作系统断电或完整数据库备份恢复验证。

全新空库迁移可用 `data/tools/node/bin/node scripts/test-fresh-migrations.mjs` 验证；脚本检查项目实例，为本轮创建隔离 schema／最小权限账号，最终精确删除这两个临时资源，不清空主库或测试库。

## 密钥及外部调用

真实密钥只在 `.env.local`，权限 `0600`；`.env.example` 只列出变量。启动器只给后端注入秘密，前端通过环境白名单启动，不继承供应商密钥。正常构建和单元测试不调用付费模型。

百炼 P0 使用北京地域和合成输入；生产模型与真实用户数据条款仍须后续评估。**不要把 `scripts/ai-spike.mjs --live` 加入 CI**：这会发出有额度消耗的真实请求。DeepSeek 本轮没有调用。

## 当前边界

交付约定（2026-09-20 用户确认）：每个完成的里程碑或重大变更，在相应验证通过后提交并推送 GitHub；保留提交和远端核验信息。推送不等于公网部署。项目协作规则见 [AGENTS.md](AGENTS.md)。

- P0 的 `mp_p0_*` 表、探针接口和合成删除／邮件流程只用于技术验证，不是 P1/P7 实现。
- P1 三个专业均为未开始／任务尚未开放；保存推荐或改选不创建 Experience Run。邮件仅进入本地 Mailpit，真实 SMTP、数据导出／账户删除和生产政策审核均未在本轮冒充完成。
- 可选研究授权默认拒绝，撤回不影响核心使用；页面观察和后台业务事实分开。P1 API 与页面不会输出能力总分、人格标签或录取概率。
- 执行器不执行用户 Python／JavaScript：只接受受限参数，执行固定可信计算器。Pyodide 是否可用必须同时满足 CSP 和隔离，不能只以 Python 算出结果为准。
- 本地验收、Git 提交／上传、公网部署是独立步骤；运行成功不代表已上传或已上线。
- 上游许可证与修改记录见 `UPSTREAM.md`。完整 P0 证据、固定计算器替代方案和上线前门禁见 [实施记录](docs/20-p0-implementation-evidence.md)。同机干净源码与独立空库复现通过，不代表独立第二台机器或跨平台验收。
