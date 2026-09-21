# P7 管理、分析与隐私：验收和交付台账

2026-09-21。状态：本地功能、真实流程及最终自动化回归通过；P7 Git提交/推送尚待执行，不预填SHA。P6已提交并推送 `fb030ac4cd5b9cb542ac5ffa9bec62a1174b0c0c`，远端main完整SHA一致；本阶段以该提交为起点。

合同见[工程设计](./33-p7-engineering-plan.md)、[视觉设计与真实截图](./34-p7-visual-contract.md)。范围截止P7，不进入P8，不公开部署。三专业真实内容保持REVIEW；纯算法/实库合成样本、隔离正式TEST_FIXTURE与真人审核/计时分开记录。

## 1. 交付能力

- Operator：七个运营页面、细粒度权限、假名化分页查询、三项可复算KPI/有序漏斗/运行健康、显式TEST/BOT排除及审计、敏感读取用途和审计、已有恢复/内容发布/报告历史功能的受控入口、四种白名单CSV。
- Student：当前密码校验的改邮箱/改密码、跨会话撤销、研究同意撤回、两范围异步私有ZIP、账户删除确认与独立Cookie回执。
- 后台：严格类型归属与租约的持久化作业、原子私有文件发布、并发删除保护、八阶段物理删除、可重试故障与九类留存策略。删除不改写专业内容或他人数据。
- 保持Vue3/SpringBoot3/MySQL/Redis及既有品牌。未创建公开报告、能力总分、职业排名、自动发布内容或通用运营平台。

## 2. 最终工程证据

| 检查 | 结果及准确范围 |
| --- | --- |
| 普通纯回归 | `sh scripts/test-unit`：Node270/270（104+5+11+74+76）；Java481项，300通过、181实库/付费条件跳过，0失败/错误。普通测试0付费 |
| 完整真实MySQL | `sh scripts/test-integration`：Java481项，479通过、仅2项明确付费探针跳过，0失败/错误；只使用majorpilot_test，不把付费跳过算供应商验证 |
| 构建 | `sh scripts/build-local`：两端strict/生产构建、合同、三个受限执行器及完整Maven package通过。最终JAR SHA256为 `32f43d1ec7ccf175b61a310de1bf8ff0755ade7b126ab90cc5b47e7ea6a5c53f` |
| 秘密扫描 | `sh scripts/verify-secrets`：源码/前端产物/日志1713文件、0泄漏（含最终真实截图）。暂存索引/禁入路径检查仍为Git前单独门禁 |
| 指标 | metrics-v2纯黄金33项；真实MySQL三项核心指标各2/3，与独立手算一致；原anchor维度筛选、零分母null及坏答卷安全失败均覆盖 |
| 隐私/并发/留存 | 实库验证账户安全、非空历史个人ZIP、非空CSV/公式/权限/审计、独立心跳与旧lease、删除/文件发布竞态、跨主体文件引用拒绝、完整体验/报告树精确删除及另一Student保留；留存截止、批次、重复执行、活跃数据保留和Evidence FK均通过 |
| 迁移 | 空库V1–V8与V7→V8均PASS，80表；8种合法/28种非法job owner组合、5个新表、16菜单/15权限/零隐式授权；旧Student/Job/角色授权保持 |
| 实际HTTP | `scripts/test-p7-api.mjs --run`：37个operation认证边界，26个operation另有成功响应；两种实际ZIP与受控CSV字节、私有归属、Cookie回执和实际删除通过，详见下节 |
| 实际浏览器 | Chrome153.0.8010.48 / Edge151.0.4129.78真实业务均PASS，设置页1536/1024/390；不是mock成功替代 |
| 实际JVM崩溃 | 隔离18081测试JVM两处SIGKILL，原60秒lease自然到期、同一不可变artifact恢复，旧lease拒绝，实际ZIP及完成回执验证通过 |

最终日志：`/tmp/majorpilot-p7-unit-final.log`、`/tmp/majorpilot-p7-integration-final.log`、`/tmp/majorpilot-p7-build-final.log`、`/tmp/majorpilot-p7-secrets-final.log`。这些是本地忽略产物，不发布完整日志或环境凭证。

冻结代码的同机干净源码构建另通过：`/tmp/majorpilot-clean-JuYAr4`，1346文件、新临时凭证，不复制API Key或应用数据、不启动服务，复用已核验工具及依赖缓存。日志 `/tmp/majorpilot-p7-clean-rehearsal.log` 和该快照 `data/clean-build.log`。之后只补文档和交付回执；不称独立第二台机器或P8完整空环境验收。

此前475项实库结果（473通过/2付费跳过）为中间验证。唯一失败是测试中对既有spy再次spy的夹具错误，已修正后完整重跑；后加入6项仅测试源码的重启门闩回归，最终481项结果如上，没有降低产品断言。

### 运行版本与迁移冻结

真实HTTP/浏览器/迁移/崩溃恢复所用产品运行包为内容寻址只读JAR `e94884a0b7ce694ff1375068d93b0982f813b448c9d2b3628e411e642422f313`。最终构建总JAR为上述 `32f43d1…`；两包内MajorPilot生产模块SHA完全一致：`6b0596494c9130f9d0b0968e4e40a4cd42560384f488c7c5fa4fd81a287281ff`。最终包已通过托管PID/启动身份核验后重启本项目后端，health200；Operator密码/状态/角色及其他服务PID身份保持不变。

主库和测试库均已执行V8，Flyway checksum `211975370`，迁移文件SHA256 `470cfbb79d09041e26428811caacc59faa285f7ba991733b8ac97852fa9d138c`。e948包完成首次主库升级，32f43d1包仅应用最终冻结构建；最终只读核验Student0、receipt0、真实MAJOR发布数0、测试harness已停止。V1–V8不可编辑，只能新增迁移。结果见 `/tmp/majorpilot-p7-final-runtime-verified.log`；首次核验脚本的末尾只读统计误用字段名，按实际 `content_kind` 修正并重查通过，没有因此重复重启或修改数据。

独立迁移证据：`/tmp/majorpilot-fresh-migrations-9tEt4q/migration-evidence.json`（V7→V8）、`/tmp/majorpilot-fresh-migrations-RrWWYg/migration-evidence.json`（空库）。两次临时最小权限schema/账号均精确清理，不重置主库/测试库。

## 3. 实际HTTP与浏览器

`/tmp/majorpilot-p7-api-actual.log`记录实际Spring安全链/事务/队列/下载验证：

- 37个operation均检查未认证/无权限等合同边界，其中26个另跑通成功响应；不声称37项都有完整成功路径。创建2个真实注册/验证合成Student和1个经RuoYi接口建立的最小权限临时Operator，最终均精确清理。
- 两种ZIP范围的真实字节、CRC、manifest、允许字段及跨Student拒绝通过；主站REPORTS_ONLY是空报告包，非空历史版本/正文由隔离正式fixture实库测试证明。CSV真实HTTP检查空结果表头、权限、用途、发起Operator归属、下载审计；非空字段/公式/黄金指标由独立实库测试证明。
- 只读ZIP的Session/归属/CSRF及Origin检查通过；仅缺少Origin的同源GET允许Fetch Metadata兜底，写请求仍要求Origin。HTTP检查声明的24小时期限，实际过期边界由注入时钟的实库测试验证，不宣称等待了24小时。
- REVIEW_PREVIEW的归属步骤观察、去重、跨主体拒绝及运行诊断通过，没有发布主站专业内容。回执Cookie预置、路径、仅hash入库、当前密码复核、确认响应丢弃后恢复、会话/旧文件即刻失效、最终删除和另一Student保留均通过。

初轮探针发现临时RuoYi用户名/密码超过上游20字符限制、动态API路径优先级误匹配及合法重复 `no-store` 被过严比较。修正测试生成值、按静态路径优先匹配和缓存指令集合校验后完整重跑；没有放宽正式密码/安全边界。

`/tmp/majorpilot-p7-evidence/results.json`和`/tmp/majorpilot-p7-browser-actual.log`记录双浏览器实际结果：

- TEST标记、敏感用途/关闭清空、筛选冲突、内容审核上下文与CSV字段UI均通过。选择框明确可访问名称，最终非空对话框另有mock回归。
- 研究撤回、错误当前密码422且不退出、改密码撤销另一实际服务端会话与标签广播、邮箱fragment即时清除及新邮箱登录、真实ZIP下载通过。
- Chrome实际让确认POST在服务器受理后丢失响应，预置Cookie恢复处理回执；Edge正常确认。另一浏览器没有Cookie时404。截图拍到PROCESSING，最终删除完成由后续查询/清理验证，不混称截图为COMPLETED。
- `step.viewed`与`run.resumed`均取得实际202；恢复场景的浏览器流逝时钟模拟11分钟，服务端时间真实，不是人工11分钟计时。两浏览器无未处理page error；2名合成Student及本轮回执精确清理，付费0。

最终截图与目视复核见[视觉记录](./34-p7-visual-contract.md)。无账号mock布局结果另保留于 `/tmp/majorpilot-p7-layout-only/results.json`，不计作真实业务验证。

## 4. 两处真实崩溃恢复与清理

`scripts/test-p7-restart.mjs`与 `/tmp/majorpilot-p7-restart-actual.log`：测试源码harness标识 `8c6a1679c316b2245abd545d5dfb49a05332fa83f95464672934f8aef93b53b5`，基于上述e948产品包，使用独立majorpilot_test/Redis14/环境文件，模型Key不继承。

1. `EXPORT_RESERVED`：文件键已持久checkpoint、实际写入前SIGKILL。原checkpoint/lease保留，等待自然60秒到期后新worker领取、generation增加；旧lease心跳及处理拒绝，换新artifact键生成ZIP，字节/hash/大小核验通过，旧未写键不存在。
2. `DELETE_FILES_COMMITTED`：FILES阶段已提交、METADATA前SIGKILL。同一构建/秘密/Redis恢复，已提交阶段保持；自然过期接管并拒绝旧lease，继续物理删除，依赖行移除且回执去标识化COMPLETED。

没有通过SQL改业务状态或缩短租约模拟恢复，未动主站运行身份。1名测试Student精确清理；随后按托管PID/启动身份停止测试服务，确认0Student后精确移除3个合成任务及本轮Operator/角色/菜单，清理专用Redis14并释放测试库互斥锁。忽略的0600测试环境文件、最小权限数据库账号和不可变artifact保留。日志 `/tmp/majorpilot-p7-harness-cleanup.log`。不是操作系统断电或数据库备份恢复演练。

## 5. 本轮收紧的边界

- 未验证邮箱的Student可以管理账户/导出/删除，但不得借此访问专业任务。
- 私有ZIP下载需Session/归属/CSRF和明确Origin；仅无Origin的同源GET允许 `Sec-Fetch-Site: same-origin` 兜底，不放宽写请求。
- 文件I/O和发布持有相同Student锁；管理文件锁定全部成员，heartbeat独立续租，不会在删除确认后写出无法追踪的文件。
- 文件键先持久记录于checkpoint，删除核对类别及所有引用的归属；磁盘失败保留tracking，不标完成。
- 账户删除按真实FK分阶段提交，恢复链叶节点优先；引用异常不扩删。最后事务同时移除账户/job并断开回执归属。
- 删除确认响应超时后的查询使用独立请求时限，同时保留身份epoch防护；受理不等于完成。
- 已有v1政策正文不静默修改；P7本地功能状态单列，最终生产政策一致性仍属发布前门禁。

## 6. Git交付与后续门禁

P7功能、实库、真实HTTP/浏览器、迁移、崩溃恢复、最终普通回归/构建/秘密扫描及主站冻结包启动核验已通过。尚待提交索引/禁入路径及diff检查、Git提交/推送和远端完整SHA核对；取得结果后补写交付回执，不虚构提交编号。

以下不是本轮已完成事项：

- 三专业真人专家审核、零代码目标用户试用及45–60分钟计时；主站内容仍REVIEW，不自动发布。
- P8完整MVP硬化、备份恢复及独立环境复现。P6/P7同机干净源码复演不等于第二台机器验证。
- 真实SMTP、生产域名/HTTPS/Secure Cookie与政策一致性、外部服务副本及备份删除规则。
- 真实模型容量压测仍需明确负载、配额与授权范围。用户已授权开发真实调用且不要求费用上限；本P7普通验收没有付费调用，P6真实供应商结果独立保留，不冒充P7容量验收。
- 公网部署和完整MVP最终验收；Git推送不代表上述门禁已完成。
