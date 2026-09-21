# MajorPilot

通过短时、基于证据的体验，帮助学生比较 Artificial Intelligence、Data Science 和 Business Analytics。技术栈为 RuoYi Spring Boot 3 + 独立 Vue 3 学生端／管理端 + MySQL + Redis。

**P7 管理、分析与账户隐私的本地功能验收已通过，正在收尾 Git 交付**：七个运营页面、可复算指标、受控CSV、个人ZIP、账户安全、研究撤回及持久化删除已实现；真实HTTP、Chrome/Edge、两次实际JVM崩溃恢复、V7→V8与空库迁移已验证。完整结果与尚待交付项见 [P7台账](docs/35-p7-delivery-ledger.md) 和 [真实页面截图](docs/34-p7-visual-contract.md)。P0–P6已推送，P6报告/比较/打印证据见 [原交付记录](docs/23-p2-to-p6-delivery-ledger.md)。普通测试仍0付费；正式报告链用隔离TEST_FIXTURE验证，主站三专业内容仍REVIEW，尚待真人专业审核及目标用户计时，不因工程验收自动发布。当前范围止于P7；P8完整MVP硬化及公网部署均未开展。

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
sh scripts/test-p3-e2e
sh scripts/test-p4-e2e
sh scripts/test-p5-e2e
sh scripts/verify-secrets
sh scripts/stop-local
```

`test-integration` 只使用独立 `majorpilot_test` 库；`test-infra.mjs` 会重启本项目的 MySQL／Redis，需在没有其他本项目测试进行时单独执行。停止脚本核对 PID 的启动时间与完整命令，只关闭本项目记录的进程并保留数据。日志位于忽略的 `logs/`；不要发布未经检查的完整日志。

`test-p1-e2e` 依次运行真实 HTTP／事件合同和 Chrome／Edge 完整流程；创建并精确清理本轮合成账户、草稿与捕获邮件。不放宽正式限流：重复运行可能触发本地共享 IP 的每小时注册限制，应等待窗口自然恢复，不清空 Redis 绕过。P0 回归需先停止本项目服务，再 `sh scripts/start-local --profile=p0` 并执行 `sh scripts/test-e2e`；完成后停止并以默认 `local` 重启。两个 profile 都保留原数据。

P2演示需要在忽略的 `.env.local` 中显式设置 `MP_P2_DEMO_ENABLED=true`，默认关闭；登录后从个人主页进入“工作区上手演示”。任务AI开关 `MP_EXPERIENCE_AI_ENABLED` 默认false，普通验收保持关闭，使用已审核静态提示；不伪装为模型生成。`test-p2-e2e`顺序运行真实HTTP和Chrome/Edge任务闭环，共创建并精确清理4个合成账户，仍遵守共享IP注册限额。

P3的AI专业内容目前为REVIEW，尚待真人专业审核与目标用户计时。仅本地验证时可在 `.env.local` 显式设置 `MP_CONTENT_PREVIEW_ENABLED=true`，从个人主页打开“内容工程预览”。预览保存真实操作并在关闭后生成后台证据，但不计正式专业完成、不生成NEXT或正式报告。`test-p3-e2e`验证真实HTTP与Chrome/Edge任务闭环，共4个合成账户，仍遵守注册限额；普通测试保持任务AI关闭。`node scripts/test-p3-api.mjs --check`只做静态预检，不创建账户或调用服务。

P4新增DS工程预览，仍受同一 `MP_CONTENT_PREVIEW_ENABLED` 本地开关控制。D1–D6覆盖质量策略、分箱频数、分组/散点关系、分层和结论；固定JS Worker预览加Java服务端复算，只读Python说明不执行代码。每个操作最多30种成功配置，相同配置复用免费，HTTP速率限制独立。`test-p4-e2e`先跑真实HTTP再跑Chrome/Edge，共4个合成账户；`node scripts/test-p4-api.mjs --check`只做静态预检。本地实现与最终验收状态见交付记录。

P5新增BA工程预览，沿用同一本地开关。B1–B6覆盖指标、漏斗、群体比较、观测与假设、行动目标及护栏；72行合成聚合表统一观察每名学员入组后28天。行动依据取当前已复核的B4群体，上游修改后需要重新读取并确认，不把学生目标写成实测效果。`test-p5-e2e`先跑真实HTTP再跑Chrome/Edge，共4个合成账户；`node scripts/test-p5-api.mjs --check`仅静态预检。三专业仍须分别完成人工审核和真实用户试用。

`build-local`还会从受审共享源码生成忽略的 `executor/dist/classifier-worker.js`、`executor/dist/ds-worker.js` 与 `executor/dist/ba-worker.js`；启动与单测校验其源码一致性，执行器再核对提交的manifest哈希。DS在opaque Worker中计算，配置摘要由固定可信launcher生成后返回原Worker；BA纯统计不依赖WebCrypto。未放宽CSP或Cookie边界。不要提交生成产物，也不要手改bundle来绕过哈希检查。

`data/tools/node/bin/node scripts/test-p2-recovery.mjs`仅在其他本项目测试结束后单独执行：要求标准项目托管后端、显式关闭任务AI及空闲Redis DB15，实际重启后端并在finally恢复原配置，不清空正常DB0。它不是操作系统断电或完整数据库备份恢复验证。

全新空库迁移可用 `data/tools/node/bin/node scripts/test-fresh-migrations.mjs` 验证；脚本检查项目实例，为本轮创建隔离 schema／最小权限账号，最终精确删除这两个临时资源，不清空主库或测试库。

P7管理页面从“MajorPilot运营”菜单进入；Student从个人主页打开“账户与隐私”。个人ZIP和内部CSV是异步私有文件，申请成功不等于文件已就绪；下载须当前身份及归属校验，24小时过期。账户删除确认即撤销会话，后台分阶段处理；预置Cookie支持查看专用回执，受理不等于物理删除完成。已执行V8不得修改，修正必须新增迁移。

P7验证入口：`data/tools/node/bin/node scripts/test-p7-api.mjs --check`仅静态预检；加 `--run` 才会在主站创建、验证并精确清理合成账户及临时最小权限Operator。`data/tools/node/bin/node tests/e2e/p7.mjs`验证真实Chrome/Edge流程，`tests/e2e/p7-layout.mjs`仅为无账号mock布局检查，两者不能互相替代。`scripts/test-p7-restart.mjs`须在已prepare/start的隔离harness中单独执行，与MySQL集成测试互斥；它实际终止测试JVM，不应与其他测试并行。全部普通入口保持模型调用关闭，不重置正式注册限流。

## 密钥及外部调用

真实密钥只在 `.env.local`，权限 `0600`；`.env.example` 只列出变量。启动器只给后端注入秘密，前端通过环境白名单启动，不继承供应商密钥。正常构建和单元测试不调用付费模型。

百炼使用北京地域；生产模型与真实用户数据条款仍须后续评估。2026-09-21用户已授权开发中真实调用，P6合成报告探针已分别验证百炼与DeepSeek；结果见交付记录。**不要把真实探针加入CI**。普通测试保持0付费调用；显式报告测试入口如下，必须使用新run-id，已尝试标记即使超时也保留，不自动重发。每轮最多2次HTTP/45秒，区分AI_VALIDATED与FALLBACK_VALIDATED。

```sh
data/tools/node/bin/node scripts/report-spike.mjs --check
# 以下命令会真实调用所选平台；密钥只从忽略的.env.local读取。
data/tools/node/bin/node scripts/report-spike.mjs --live --provider BAILIAN --run-id your-new-probe-id
```

`MP_REPORT_AI_ENABLED`是正式报告单独的启用开关，默认false；`MP_REPORT_AI_PROVIDER`支持BAILIAN或DEEPSEEK。它不把REVIEW预览变成正式内容，不更改任务提示开关。隔离P6浏览器验收使用测试源码harness（18081/15176、majorpilot_test、Redis14及独立`.env.p6-test.local`），不会继承供应商Key；与MySQL集成测试由同一归属锁互斥。按 `prepare → start → test-p6-api / tests/e2e/p6 / test-p6-restart → stop → cleanup` 顺序使用 `scripts/p6-harness.mjs`，不得并行清理共享测试库或重置限流。

## 当前边界

交付约定（2026-09-20 用户确认）：每个完成的里程碑或重大变更，在相应验证通过后提交并推送 GitHub；保留提交和远端核验信息。推送不等于公网部署。项目协作规则见 [AGENTS.md](AGENTS.md)。

- P0 的 `mp_p0_*` 表、探针接口和合成删除／邮件流程只用于技术验证，不是 P1/P7 实现。
- 三个正式专业仍未开放；保存推荐或改选不创建 Experience Run。P7个人导出与账户删除已在本地真实流程验证；邮件仍仅进入本地Mailpit，真实SMTP、生产政策审核、外部副本/备份擦除并未因此完成。
- 可选研究授权默认拒绝，撤回不影响核心使用；页面观察和后台业务事实分开。P1 API 与页面不会输出能力总分、人格标签或录取概率。
- 执行器不执行用户 Python／JavaScript：只接受受限参数，执行固定可信计算器。Pyodide 是否可用必须同时满足 CSP 和隔离，不能只以 Python 算出结果为准。
- 本地验收、Git 提交／上传、公网部署是独立步骤；运行成功不代表已上传或已上线。
- 上游许可证与修改记录见 `UPSTREAM.md`。完整 P0 证据、固定计算器替代方案和上线前门禁见 [实施记录](docs/20-p0-implementation-evidence.md)。同机干净源码与独立空库复现通过，不代表独立第二台机器或跨平台验收。
