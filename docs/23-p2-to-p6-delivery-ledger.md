# P2–P6 实施与验收记录

> 2026-09-21：用户将持续推进目标延长至 P7；临时不能回答问题时，依据现有设计自主选择实现细节。仍按阶段依序实施，非阻塞缺陷记录后继续推进，不绕过失败的核心门禁，也不把未验证的要求写成完成。

## 1. 交付边界

遵守 [实施路线](./16-implementation-roadmap-and-traceability.md)、[领域模型](./06-domain-model-and-data-boundaries.md)、[任务设计](./09-three-major-task-designs.md)、[报告设计](./10-report-and-evidence-design.md)。Vue 3 / Spring Boot 3 / MySQL / Redis 不变；每个完成的阶段或重大变更在适度验证后提交、推送并核对远端 SHA。Git 交付不代表公开部署。

P1 的 AI 理由润色仍按用户确认延期；P2–P6 的分层提示、反思追问和报告生成是不同能力，仍按原合同实现。普通测试不产生付费调用；2026-09-21用户授权开发时真实API能力验证，不要求费用上限。真实容量压测仍需明确负载范围，不能据此自动开展。

## 2. 分阶段清单

| 阶段 | 必须实现和验证 | 当前状态 |
| --- | --- | --- |
| P2 | 版本化内容、受控执行、三栏工作区、保存 revision、暂停/原子切换/恢复、撤回和审计恢复 | 本地实施与验收通过；已推送 `02e7552` 并核对远端 |
| P3 | AI 教学分类器与隐藏集服务端评分、完整任务与反思、冻结证据输入 | 已推送 `37d77ab` 并核对远端；REVIEW预览，真人审核/计时仍待办 |
| P4 | DS 数据质量与关系分析、可复核统计、非因果结论、完整任务 | 已推送 `8b9d616` 并核对远端；真人门禁仍待办 |
| P5 | BA 指标/漏斗/分群、行动与验证指标、完整任务 | 已推送 `94f6acb` 并核对远端；真人门禁仍待办 |
| P6 | 持久化证据与报告作业、校验/修复/回退、NEXT、私有比较报告和反馈/打印 | 已推送 `fb030ac4cd5b9cb542ac5ffa9bec62a1174b0c0c` 并核对远端 |
| P7 | 运营管理、分析与隐私工具 | 本地工程与最终冻结回归通过；Git交付见 [P7台账](./35-p7-delivery-ledger.md) |

状态以实际证据更新，不以代码行数或绿色单元测试替代纵向闭环。

## 3. P2 工程决定

- 技术演示与正式专业分离：`contentKind=DEMO|MAJOR`；DEMO 的 `major_id` 为空，使用独立 `DEMO_TABLE` / `DEMO_COMPARE` 标识。`mp_major` 仍只有 AI、DATA_SCIENCE、BUSINESS_ANALYTICS 三个专业。
- 演示不关联虚构的专业推荐决定，不占正式专业当前运行唯一位置，不进入正式完成计数、NEXT 或报告；关闭演示显示报告 `NOT_APPLICABLE`，不显示假“生成中”。
- 同一 Student 的一个活动运行约束仍跨 DEMO 和 MAJOR 生效，演示也验证相同的暂停/恢复和 revision 规则。
- 演示仅在 `local` profile 且显式 `MP_P2_DEMO_ENABLED=true` 时可见，仍要求真实 Student 身份；缺省关闭。已校验技术内容可按 `TECHNICAL_DEMO` 审核类别安装，不宣称经过专业或目标用户审核。
- 实际专业 Task Version 的发布、撤回和内容锁定继续遵守原设计。P2 不开放尚未制作的三个专业任务。
- `MP_EXPERIENCE_AI_ENABLED` 是任务提示的独立付费调用开关，默认 false；本地自动验收保持关闭，用受审静态提示，并以模拟 HTTP 服务验证真实供应商适配器与故障路径。
- 浏览器执行沿用 P0 固定计算器与只读计算说明的已选方案，不接收任意源代码，也不为了展示 Python 而声称执行了用户代码。

## 4. 验收证据要求

每阶段记录准确命令、执行结果、实际运行版本、浏览器流程、失败修复、Git 提交及远端核对。P2 特别覆盖双标签页冲突、重复请求、跨学生越权、原子切换回滚、Redis 不作为领域事实来源、Worker 超时/崩溃、内容升级后旧运行不漂移。

前端延续 [P1 视觉系统](./22-p1-visual-direction.md)，新增工作区先生成完整设计再实现。内置浏览器进行实际页面核验，自动化浏览器矩阵作为独立回归证据；真实文本与运行状态优先于效果图中的样例。

### P2 验收发现并修复的问题

- V1→V5 空库迁移：0表→65表，P1关键表13张、P2关键表13张；首次执行5个迁移，校验通过，第二次执行0。临时最小权限数据库和账号已验证清理。证据 `/tmp/majorpilot-fresh-migrations-EHn2JY/migration-evidence.json`，验证构建SHA256 `c3847636dcc34cb80eb3258a41a1dfd881114f68d4939b29a80c9e5eb3384f70`。
- 真实并发测试发现幂等表外键共享锁升级造成死锁；已统一先锁 Student 再插入幂等记录，并测试不同开始请求只能有一个活动运行。
- 只读独立审查发现执行剩余次数负值、复用执行误报过期、关闭DEMO后孤儿提示不能恢复；已修复并补回归。执行保留原 `inputRevision`，以独立 `appliedToRevision` 说明当前答案绑定，不伪造历史时间。
- 第一次真实启动发现供应商提示 Bean 多构造缺少明确注入；已补 `@Autowired` 和真实Spring扫描红绿测试。
- 首次HTTP验收进一步发现 `@Repository` 代理对象被跨Bean直接读取字段导致演示开关误判及定时器空指针；已改成虚方法访问，并新增真实CGLIB代理行为回归，最终真实HTTP验收通过。
- 上游管理错误写回HTTP200，不能满足产品API合同；新增仅匹配 `/api/admin/v1/majorpilot/**` 的独立安全链，真实Operator主体和标准401/403错误通过测试，不更改旧RuoYi管理端协议。
- 首轮浏览器测试在断网之后动态加载测试模块而失败；将测试模块断言移至断网之前，业务代码仍必须经历真实离线恢复。重跑两浏览器完整矩阵通过，未跳过断言。截图发现主按钮超出首屏，改为主区滚动且底部操作固定可见，不修改已发布1.0.0内容。
- 上述验收均未触发付费模型调用。失败及成功各轮的合成账号、关联业务数据和捕获邮件均精确清理，不关闭或清空真实限流；重复验收如命中注册限流，必须等待自然窗口。

### P2 最终本地验收（2026-09-21）

- 最终运行构建 SHA256：`7fa08ac66a67a0d405802e3e499541230b1288887e1a6b99f7a310f166c4fc0a`，实际服务运行于独立的只读 `data/runtime/ruoyi-admin-<sha256>.jar`，不是可被构建覆盖的target JAR。
- `sh scripts/test-unit`：Node 90/90；Java 128项中85项通过、43项依赖数据库或真实供应商的测试跳过。随后 `sh scripts/test-integration`：Java 127项通过、仅1项明确要求真实百炼调用的测试跳过；不能把该跳过项写成供应商验收。
- `node scripts/test-p2-api.mjs`：真实本地HTTP闭环通过，21个操作的实际响应经schema校验。覆盖鉴权、CSRF/Origin、跨账号拒绝、幂等、revision、原子暂停切换与回滚、固定资产、参数约束、服务端复算、防伪结果、相同配置复用、反思和关闭。学生凭证不能访问管理恢复接口。
- `node tests/e2e/p2.mjs`：Chrome 153.0.8010.48、Edge 151.0.4129.78各6组完整流程通过；包括真实保存/执行/三层提示、已完成步骤修订与下游失效、复用后刷新、双标签409、离线草稿恢复、原子切换、反思暂停/继续/关闭、7天TTL与跨账号隔离。真实Worker崩溃、取消及约10秒超时后可重建；执行器请求不携带学生Cookie。两浏览器未出现未处理page error或非预期console error。
- `node scripts/test-p2-recovery.mjs`：实际JVM停止/启动，切换到已验证为空且仅供本次测试使用的项目Redis DB15；同一学生会话、已提交答案revision、Task Version从MySQL恢复，并可继续完成步骤。静态提示的限流键证明服务确实使用DB15。正常DB0未清空或重置；原后端配置已恢复、DB15及本轮合成账号已精确清理。不是操作系统断电或主库恢复演练。
- `node scripts/test-fresh-migrations.mjs data/runtime/ruoyi-admin-<sha256>.jar`：最终运行JAR的V1→V5空库迁移通过，0表→65表，P1/P2关键表各13张；首次5个迁移、第二次0个、checksum校验通过。临时最小权限数据库和账号已验证清理。证据 `/tmp/majorpilot-fresh-migrations-aw07qJ/migration-evidence.json`。
- 同机干净源码构建通过：`/tmp/majorpilot-clean-HB9AVg`，964个源文件、全新本地凭证、未复制供应商密钥/应用状态、未启动服务；共享已校验工具和依赖缓存。不等同于第二台机器验证；其后小范围前端布局调整另经strict/build与完整浏览器矩阵验证。
- `sh scripts/verify-secrets`：源码、前端产物和日志1297个文件扫描通过；提交索引另行检查。`git diff --check`通过。内置浏览器独立核验公共页面及未登录演示入口返回登录页；完整已登录矩阵使用Chrome/Edge，不冒充内置浏览器全部流程。
- 视觉对照与留存截图见 [P2视觉记录](./24-p2-workspace-visual-direction.md)。桌面1536/1366、抽屉1100/1024、手机390×844均无横向溢出；手机任务编辑明确受限。

### P2 的明确剩余边界

- 真实百炼任务提示适配器与降级已实现，模拟供应商协议/超时/错误通过；本轮没有付费真实任务提示调用。P0的小量供应商能力验证与上线前真实容量门禁仍独立有效。
- 可选反思追问当前可安全失败并跳过；真正专业内容的追问在P3接入。DEMO关闭只写持久化 `DEMO_COMPLETE` 收尾记录，不假装创建报告。
- 内容发布/撤回和审计恢复已有受权限保护的API与数据库验证；完整运营界面仍属P7。P2不开放AI/DS/BA正式任务，也不代表完整MVP或公网可部署。

## 5. 必须保留的外部验收

P3–P5 的零 Python 经验目标用户试用、人工计时及 45–60 分钟中位完成时间需要真实参与者记录。自动脚本和代理走查不能代替目标用户。实现可在等待试用期间按顺序继续，但在这些证据缺失时，不能宣称所有阶段出口或完整目标已验收。

专业内容与教学可达性将先进行代码/内容独立审查，注明审核者和方法；不虚构真人专家、学生或时长观察记录。真实 SMTP、公开部署和 P8 完整 MVP 硬化不因本次推进自动完成。P7 管理/隐私另按 [专门台账](./35-p7-delivery-ledger.md) 的真实工程证据验收，不由P2–P6结果推定。

## 6. P3 实施与验收

P3接缝与预览隔离见 [工程计划](./25-p3-engineering-plan.md)，新增配置/评价屏的设计与真实截图见 [视觉合同](./26-p3-ai-visual-direction.md)。当前AI内容仅为REVIEW，不将工程预览计入正式完成、NEXT或专业报告；专业审核与真实用户计时仍PENDING。预览关闭实际生成内部Evidence Snapshot，不能以用户端显示“无报告”省略后台证据验证。

最终固定AI数据基线：48条隐藏评价、39条自动路由、27条正确自动路由、9条人工复核；覆盖率0.8125，自动路由准确率0.692308，总正确自动处理比例0.5625。阈值提高不保证改善准确率，必须展示实际评价结果及权衡。普通验证不调用付费模型。

### 已取得的 P3 工程证据

- 不可变AI Task Version `01JA1000000000000000000001`，manifest SHA256 `813d1ba169586ed56a09fef86caf514c407497668e1f8bb5114a82391cc8e06f`；24条公开练习、48条隐藏评价及独立示例/训练。生成器 `--check` 与完整跨Java/JS黄金向量通过，不把聚合统计保密能力称为考试级防探测。
- 本轮真实运行JAR SHA256 `8fa4096ae91c143cafd487a88503fbf1335c7628011047a8f996e4fe8871f293`，按内容寻址只读副本运行。执行器原P0/P2 Worker未改字节，新增公开练习bundle SHA256 `d42ca56725918a6eb7804752958c7c4725653e7566121f66e457c0b25f281a2a`；bundle在忽略的 `executor/dist/` 生成，源码及校验哈希入库。
- `sh scripts/test-unit`：Node112/112；Java156项中100通过、56因环境条件跳过。`sh scripts/test-integration`：155通过、仅1项明确要求真实百炼调用的测试跳过。真实MySQL包括预览发布后身份不升级、配置规范化与5次配额、源revision失效、原子关闭/NEXT/排队、失败快照追加、租约接管与迟到写拒绝、临时账户锁定延期和关闭前旧回执兼容。
- `node scripts/test-p3-api.mjs`：真实HTTP首轮通过，27/27操作有实际响应合同验证；其中正式创建为404拒绝、5项管理操作为401拒绝，不冒充正式发布或管理操作成功。覆盖A1–A6、跨账号、CSRF/Origin、公开资源/私有404、伪造结果422、旧输入409、5种成功配置后第6种429、baseline免费、同集合不同顺序复用、反思暂停/恢复/幂等关闭。实际后台Evidence Snapshot READY，预览report为NOT_APPLICABLE且没有NEXT/正式report行；两合成账户及关联行/邮件已精确清理。
- 默认关闭的提示/追问均有真实供应商协议适配器，模拟HTTP测试严格字段、一次修复、限时和退避；本轮HTTP中的静态提示与可跳过追问记录两条元数据，HTTP attempts均为0。没有付费调用，没有清空限流。
- 空库V1→V6：0表→70表，P1/P2关键表各13张、P3关键表6张，正式job归属Student外键和旧P0 CHAR36队列隔离已验证；首次6迁移、再次0、checksum通过、临时schema/最小权限账号精确清理。证据 `/tmp/majorpilot-fresh-migrations-VCXTi1/migration-evidence.json`。
- 内置浏览器核验了未登录工程预览入口被重定向至登录页，页面身份/实际截图正常、控制台无error/warn；不把这项写成已登录任务全流程验收。完整Chrome/Edge矩阵及视觉对照仍在进行。
- 同机干净源码重建通过：`/tmp/majorpilot-clean-mZqZGw`，1018个源文件、新随机本地凭证、共享工具/依赖缓存；无供应商密钥、无业务状态、未启动服务。包含从源码生成并验证classifier bundle。不是第二台机器验收；后续界面/测试细调需独立回归记录。
- P3运行版本下 `node scripts/test-p2-api.mjs` 回归通过：21个操作响应校验，既有DEMO闭环/同一活动槽/反思与无报告身份不退化；两账户及关联数据精确清理。

### 浏览器验收发现与修复过程

- 第一轮390px检查的全文选择器同时命中可见设备提示和隐藏帮助dialog，触发strict错误；改为限定可见设备提示区域，不删除隐藏帮助或放宽断言。第二轮resize之后立即检查Vue DOM，尚未来得及响应媒体查询；改为等待实际设备提示可见，再断言编辑器不存在。
- 为防无界等待，增加15秒动作、30秒导航及每浏览器8分钟流程上限，失败仍进入浏览器关闭和精确fixture清理。两轮失败均已清理，不调整或清空正式限流。
- 配额测试的预期状态码纠正为真实合同429；之前写409是测试错误，不改服务端行为。A4原截图为填写后的滚动位置，已要求另拍首屏；1100截图的顶部异常留白仍需检查实际几何与最终截图后才能验收。
- 第三轮实际浏览器流程在第二种配置的配额断言失败：A4变更后A5回答revision不变，前端沿用旧幂等键，正确的服务端幂等重放反而暴露了前端请求身份缺陷。已让指纹包括排序后的来源revision向量，保持HTTP body和服务端参数权威不变；先红后绿验证新来源新key、同源重试稳定及P2兼容。另修复刷新时误取最老成功执行，优先完整当前应用来源，历史回退必须明确过期。两项尚待最终真实浏览器重跑。
- 1100最新截图经主代理view_image核对，顶栏回到y=0、底部动作在视口内。原因是测试巨量滚轮导致滚动链/弹性位移；已采用实际scrollTop和滚动隔离并加几何断言。三个实际失败轮次均进入精确fixture清理；两次仅启动审批超时没有创建进程或账户。
- 限定证据核查发现原步骤回答整包标OBSERVED_FACT，会把未验证学生分析误许可成事实。P3收尾中拆分客观操作、验证执行和未经验证分析，并将提取规则固定在关闭输入；不等到P6报告消费后才修正。未发现关闭后改读最新Profile，实际引用与校验均来自运行绑定的原版本。
- 第四轮五种配置/来源/配额及刷新已通过，后续快速返回冷加载步骤时主按钮被禁用。最小红色回归确认资产/IndexedDB尚未读取完就开放编辑，会把刚输入内容误认作恢复草稿。步骤选择现在原子就绪后才开放编辑，失败有明确错误与重试；增加快速编辑、迟到加载、旧轮询与加载失败四项回归，最后一轮真实流程通过。错误现场截图/门禁状态捕获已加入测试。

### P3 最终本地工程验收

- 最终运行只读JAR SHA256：`5a123f05777ecd7633fafe976ddfbb43a2772e7729d7ce932659b773c3a7307c`。主库仍V1–V6，V6 checksum未改；AI Task Version/数据哈希未改。此前8fa版本验证是中间证据，不冒充最终运行版本。
- `sh scripts/test-unit`：Node122/122；Java164项中103通过、61按环境条件跳过。`sh scripts/test-integration`及完整package：Java163通过、仅1项明确付费百炼实测跳过。新增3项证据语义单测、5项真实MySQL版本/恶意因果/原始来源/旧READY不变回归；普通验证付费调用为0。
- `node scripts/test-p3-api.mjs`最终新运行包再次通过27/27实际操作响应合同，6项仅为拒绝验证的范围与上文一致；真实快照READY，闭包为 `closed-input-v3` 且冻结 `evidenceRuleVersion=evidence-v2`。A3–A6的4个分析条目为 `STUDENT_ANALYSIS/UNVERIFIED`、allowed_claim_types为空；动作事实不混入分析字段，每条item规则与闭包一致。旧未完成不支持规则显式失败，旧READY不重写。
- `node tests/e2e/p3.mjs`：Chrome153.0.8010.48、Edge151.0.4129.78各4组完整检查通过。真实A1–A6、24条练习与无Cookie Worker、A4修改/保存、A5 baseline免费/5种计次/第6种429/耗尽后复用、输入版本与刷新、A6决定、反思可跳过追问及关闭、正式计数与NEXT/报告隔离；无隐藏标签/私有路径投影泄漏、无非预期console/page error。
- 最后前端就绪保护之后再次运行 `node tests/e2e/p2.mjs`：两浏览器各6组完整回归通过，包含真实离线、双标签冲突、暂停切换、7天TTL、跨身份清理、Worker崩溃/取消/约10秒超时与恢复。不是仅引用修复之前的P2结果。
- 新运行包V1→V6独立空库再次通过：0→70表，首次6迁移/再次0、checksum、Student job外键和旧P0队列隔离正常；临时schema/账号精确清理。证据 `/tmp/majorpilot-fresh-migrations-3AyH3j/migration-evidence.json`。
- 最终代码的同机干净源码重建通过：`/tmp/majorpilot-clean-hMqY1I`，1025个源码/设计文件，新本地随机凭证，不复制供应商密钥/应用状态、未启动服务；共享工具与依赖缓存。不等同于第二台机器或真实供应商验收。
- 精选截图及主代理同轮概念对照见 [视觉验收](./26-p3-ai-visual-direction.md)。所有HTTP/浏览器合成账户与邮件精确清理，无限流重置；重复测试等待自然窗口。源码/产物/日志扫描、提交索引及diff检查作为本次提交最后门禁。

P3技术闭环已具备可复核工程证据。提交 `37d77ab409d1598d2098002087739fc548968564` 已推送并核对远端。内容仍REVIEW，真实专业审核、零代码目标用户试用和计时未完成；未公开部署，不称完整MVP完成。P4随后按 [实施计划](./27-p4-engineering-plan.md) 与 [视觉合同](./28-p4-ds-visual-direction.md) 开始实施。

## 7. P4 实施与工程验收

DS保持REVIEW预览，不计正式完成、NEXT或用户报告。使用固定JS Worker计算与Java服务端复核，不执行学生Python。D1–D6、四个统计操作、来源revision、30种成功配置配额、独立Reflection与冻结证据均已实现；先保留中间证据，最终结果另列于本节末尾。

- Task Version `01JD1000000000000000000001`；manifest SHA256 `0e3fad47b7b5e4b15c0666429a5cd163eb4b1115524e00d4140c8bc89132c8c2`；公开数据SHA256 `18fbd558ad5d3940cb0062b982c66704a3a2f75e89c3fc30c1c6196184660a06`。360条原始行、359名合成学员、1条精确重复、24条注入缺失。AI已冻结内容和V1–V6迁移未改。
- 主库首次注册前发现关系教学Python只说明了散点分支，已改成与GROUP_COMPLETION/SCATTER一致的只读示例；两端内容校验拒绝错分支，5项核心Python公式离线对照通过。不声称产品内运行Python；没有改动已交付的不可变DS版本。
- `sh scripts/test-unit`中间结果：Node141/141，Java187项中117通过、70条件跳过。`sh scripts/test-integration`：186通过、仅1项明确付费百炼实测跳过。随后前端兼容性修复的最终单测结果另记，不能沿用本行冒充最终版本。
- `sh scripts/build-local`通过；当前内容寻址运行JAR SHA256 `a13df051cf5e308ed7f541b1692b94defd10e816347722e14fcbd44f6fc03ccc`。`node scripts/test-p4-api.mjs`真实HTTP通过27/27操作响应schema；正式创建404和5项管理401仅为拒绝验证。D1–D6、四操作完整结果跨Java/JS相同、公开JSON/CSV原字节和哈希、私有404/跨账号、来源缺失422/过期409、伪造观察422、分支/X=Y错误、30种配置及第31种429、耗尽后复用均通过。执行请求间隔遵守独立每分钟限流，没有重置限额。
- HTTP关闭后的Evidence Snapshot READY，`closed-input-v3`/`ds-evidence-v1`；5条学生分析为UNVERIFIED且allowed_claim_types为空，4条最终执行为VERIFIED_EXECUTION。无正式报告/NEXT，正式完成计数不变。两合成账户与关联邮件/业务行精确清理，付费调用0。
- 同一P4运行包的 `node scripts/test-p3-api.mjs` 回归通过27/27；AI baseline免费/五次配额/隐藏资产边界/关闭语义未退化；两账户精确清理。
- 当前JAR独立空库V1→V6通过：0→70表，首次6个迁移/再次0、checksum及归属外键正常；临时最小权限schema/账号精确清理。证据 `/tmp/majorpilot-fresh-migrations-nTAkZf/migration-evidence.json`，未启动或停止服务。

### 实际验收发现与修复

1. 第一轮Chrome D2无法执行：Vue响应式Proxy不能直接跨postMessage结构化克隆。已用真实Vue reactive输入复现，并对异步iframe启动前载荷被修改补回归；执行边界改成普通不可变JSON快照，未增加凭证或资产。
2. 第二轮Proxy错误消失，但Worker返回DS_INPUT_INVALID。无账户的真实Chrome最小探针确认：iframe为secure context且有crypto.subtle，opaque Blob Worker不是secure context且没有crypto.subtle。固定可信launcher现只为规范化后的三字段配置计算摘要，返回原活动Worker；严格字段、操作、长度、次数与取消栅栏，未增加allow-same-origin或放宽CSP。16项Worker/摘要边界测试及真实同环境红绿探针通过；统计公式和数据没有改动。
3. 每轮失败均关闭浏览器、精确清理本轮合成账户/邮件；没有清除注册IP限流。启动审批超时且未启动进程的尝试不计成实际运行。
4. 后台作者自检发现超过50条失败历史后，分页可能隐藏仍有效的旧成功执行，导致冻结证据漏项。真实MySQL先复现3项失败，再改为独立查询当前own/source绑定的有效执行；历史最多50条加一条当前结果，不无限放大分页。完成、关闭和证据构建均验证完整操作覆盖/来源，缺项拒绝而非发布READY。四项新回归及既有目标测试通过；不称此作者自检为独立审查。
5. 第三轮浏览器误把同一幂等key重放当作新请求配置复用。正确合同是重放原receipt，因此测试分别验证同key原样返回、新已保存revision下相同配置免费复用，未改业务或删断言；最终完整矩阵通过。
6. 最终旧P3浏览器暂停恢复时，同名“了解并进入”同时命中AI/DS，触发strict locator错误。已按fixture.taskVersionId定位确切href，未使用first/nth掩盖歧义；等待注册窗口自然恢复后，Chrome/Edge完整重跑通过，没有放宽断言或限流。
7. 视觉核验发现历史失效通知在重新完成后仍写“需要重新复核”，易与当前待办混淆。改成“本次修改曾使…失效”，明确当前进度以左侧状态为准；生命周期单测、strict与build通过，不影响失效或来源校验。

### P4 最终运行版本及已通过门禁

- 后端内容寻址只读JAR SHA256 `557389ce85a850fd523e9453ef71da92b3d321d99b016b6e7ec4d70ac47f8db7`；DS Worker SHA256 `f86f10f1d318fc0ff7b7bb4e9a5115717b14bfd8935430acdebda213088c454c`。P0/P2 Worker、AI classifier bundle和AI内容未改；V1–V6执行迁移未改。此前a13包验证仅为中间证据。
- 最后文案修复后 `sh scripts/test-unit`：Node149/149（82+41+26）；Java191项中117通过、74条件跳过。最终后台 `sh scripts/test-integration`：190通过、仅1项明确付费百炼实测跳过。`build-local`、前端strict/build和bundle哈希校验通过；普通验收付费调用0。
- 最终JAR上 `node scripts/test-p4-api.mjs`：27/27实际操作响应schema通过，正式创建404与5项管理401仍仅是拒绝验证。完整D1–D6、四操作Java/JS逐值相同、原字节数据哈希、公开/私有边界、来源422/409、错误分支/伪造结果、30种成功及第31种429、耗尽后免费复用通过。实际Snapshot READY且冻结 `closed-input-v3` / `ds-evidence-v1`，5条UNVERIFIED分析claims=[]，4条VERIFIED_EXECUTION完整。PREVIEW无正式NEXT/report，正式计数不变。
- 同一最终JAR的 `node scripts/test-p3-api.mjs` 回归再次通过27/27；原AI五次配额/baseline免费/隐藏集/关闭来源不退化。两轮API账户、关联数据与邮件均精确清理，不重置限流。
- `node tests/e2e/p4.mjs`：Chrome153.0.8010.48、Edge151.0.4129.78各八组检查通过。D1资料/空理由、D2失败恢复/默认计次/幂等与新revision复用、D3频数、D4分组Wilson与散点、上游修改/来源失效/暂停恢复、D5两模式/D6/Reflection关闭、1536/1366/1100/1024/390、无Cookie/私有投影边界。无非预期console/page error，两个合成账户与邮件精确清理。
- 最终执行器/后台上的 `node tests/e2e/p2.mjs`：Chrome/Edge各六组完整回归再次通过；Worker约10秒超时、崩溃、取消、恢复以及双标签冲突、离线草稿、TTL/跨身份隔离没有退化。
- 最终JAR空库V1→V6：0→70表，首次6迁移、第二次0，checksum/P1与P2各13关键表/P3六表/Student归属通过；临时最小权限schema与账户精确清理。证据 `/tmp/majorpilot-fresh-migrations-kjp0QD/migration-evidence.json`。
- 最后文案/选择器修复后的同机干净源码重建通过：`/tmp/majorpilot-clean-w69Ebh`，1087个源码/设计文件、新本地随机凭证、未复制供应商密钥或状态、未启动服务，共享工具/依赖缓存。随后只补交付文档和精选图片，不把同机演练称独立第二台机器验证。
- 主代理同轮概念与真实截图核对八项见 [P4视觉验收](./28-p4-ds-visual-direction.md)。源码/前端产物/日志1423文件secret扫描通过；提交索引和diff仍作为Git交付最后门禁。所有普通测试未调用付费模型，专业审核/真人试用/45–60分钟计时仍PENDING。

- 旧P3选择器修复后 `node tests/e2e/p3.mjs`：Chrome153.0.8010.48、Edge151.0.4129.78各四组完整回归通过，包含A1–A6、暂停恢复、真实五次配额/耗尽后复用、来源revision、反思与关闭、工程预览隔离及无私有字段/Cookie泄漏。无非预期console/page error；两个合成账户与捕获邮件精确清理。最终日志 `/tmp/majorpilot-p4-final-p3-browser.log`。

P4本地工程门禁通过，提交 `8b9d6168a710c3246502804f49be45179e8b964b` 已推送并核对远端SHA一致。第一次权限自动审查仅超时、未启动命令，按工具允许重试一次后成功；不是绕过权限拒绝。真人专业审核、零代码目标用户试用/计时、真实供应商容量以及公网部署仍未完成，不能据此宣称完整MVP已验收。

P5的 [实施接缝](./29-p5-engineering-plan.md) 和关键屏概念在等待P4验收期间准备，P4推送后才开始P5代码实现。真实专业审核、目标用户试用/计时以及公开部署保持独立门禁。

## 8. P5 实施与工程验收

BA保持REVIEW预览，不计正式完成、NEXT或用户报告。B1–B6覆盖业务边界、指标定义、两期漏斗、群体选择、原因假设和小范围行动验证；三个固定计算采用同一冻结聚合表，由隔离JS Worker与Java各自计算。没有学生SQL执行、原因预测或专业适配评分。本节先保留中间证据，再记录最终运行包、浏览器与视觉验收。

- 公开数据为完整72个批次/课程/渠道组合，来源为P4已冻结canonical合成事件；manifest SHA为 `ba81c1c6cc8600a54d38bc164539f163493d6ae11be5a8354827747cf480d8a3`，公共JSON SHA为 `60ae1da5a75cb1153672a5be0a7756e490371e4fbfc4461bbc3fe7d12dc505b1`。AI/DS内容未改，P5无新数据库迁移。
- 完整后端集成测试216项：215通过，1项真实百炼付费测试按约定跳过，0失败/错误。包含BA纯统计7项与BA真实MySQL13项，以及旧AI/DS/演示/发布链回归。
- 已验证的候选运行包为 `ruoyi-admin-10b9463bdfb65892f8d35c40654c70ea93aecab0115fd4fdd579d9c87ff0cfd4.jar`，从content-addressed只读路径启动。新空schema迁移复演通过：0→70表、V1–V6首次6项/第二次0项；保留P0队列及Student作业归属，临时最小权限账号/schema精确清理，未启动第二套服务。
- `node scripts/test-p5-api.mjs`在该运行包上真实HTTP通过27项操作响应合同。六项仅验证拒绝边界（正式创建404及五个未认证管理401），不将其记成发布/恢复管理成功路径。覆盖三个计算逐字段Java/JS一致、空own的B3执行、窗口/分母/两维度、30/31配置上限和零余额免费复用；完成B6要求当前服务端核验群体、正确单位及用户确认来源向量，同群体但revision已更新也409拒绝。
- 实际关闭后Evidence Snapshot READY，`closed-input-v3`冻结`ba-evidence-v1`；6项学生分析均UNVERIFIED且allowed_claim_types为空，3项最终计算为VERIFIED_EXECUTION，行动目标不冒充观察效果。无正式报告/NEXT，正式完成计数不变。两个合成账号/关联邮件精确清理，不清空限流，全程付费调用0。
- 同一P5运行包上的P3/P4真实HTTP各27项响应合同再次通过，AI的免费baseline/五次配额与DS的30配置及来源绑定均未退化；两轮各2个合成账号精确清理。BA Worker固定SHA `16cefa7db5ffc64ba97c82284604d3c9a3337dbe7487ccfbd91d54bbe0ccd1e4`，旧P0/AI/DS pins不变。无账号实际Chrome/Edge探针确认opaque Worker中`isSecureContext=false`、无`crypto.subtle`仍计算通过（100/180与58/179）；这不替代完整页面流程。

### P5 最终运行版本与交付检查

- 完整构建后实际运行包为 `ruoyi-admin-5f3ad60662085668cc98b646c3b01d3127a74880d3dde426d7e43b153e8f564d.jar`，按托管身份只重启本项目后端，健康检查通过。新运行包上P5真实HTTP27项合同及空schema迁移再次通过；迁移证据 `/tmp/majorpilot-fresh-migrations-NxfW6F/migration-evidence.json`，V1–V6未变、临时资源精确清理。
- `sh scripts/test-unit`：Node174/174通过，Java216项中129通过、87项实库/付费测试显式跳过；实库独立入口215通过/1付费跳过的结果另列，不把跳过项算通过。严格前端类型、管理端类型、两端生产构建和合同编译通过。
- `node tests/e2e/p5.mjs`：Chrome153.0.8010.48、Edge151.0.4129.78各8组完整流程通过；B6跨客户端来源变化、保留未同步方案、显式重新确认及28/42天复盘均实际验证。无非预期console/page error，执行器请求无Student Cookie。两账户及邮件精确清理，普通测试0付费。
- 同一最终运行包顺序执行P2/P3/P4真实Chrome/Edge回归，两浏览器分别6/4/8组全部通过；旧暂停切换、离线恢复、Worker故障、AI配额与DS绑定保留。总计6个本轮合成账号精确清理，没有清除注册限流。
- 新源码快照在 `/tmp/majorpilot-clean-vQAZ44` 重装依赖、生成新本地秘密并独立构建通过（1137文件）。B4样式补丁后再次在 `/tmp/majorpilot-clean-BuJ76I` 完成1151文件的干净源码构建，随后仅调整UI测试的键盘操作并补文档/截图。两次均不复制供应商Key或应用数据、不启动服务，是同机共享已核验工具/缓存的复演，不是第二台机器验收。
- 主代理对照三张概念和实际截图发现B4宽表导致内部选择框被中心栏裁切，原“全页无横溢出”断言不能发现。已将BA grid列改为 `minmax(0,1fr)` 并对子项设 `min-width:0`；最终单测仍Node174/174、Java129通过/87显式跳过，学生端strict/build通过。修后再跑真实P5 Chrome/Edge完整8组流程均通过，并增加内部控件边界断言；日志 `/tmp/majorpilot-p5-browser-final.log`，两账户/邮件精确清理。
- 无账号UI补检 `tests/e2e/p5-layout.mjs` 全API模拟，严格区分于真实业务验收：Chrome/Edge共10用例×4宽度40组几何检查通过，B4两维选择框/图表不被裁切；Tab/Space、帮助抽屉Enter/Tab/Escape和回焦、735字长输入完整性/光标首尾/滚动到底/底部不遮挡均通过。macOS原生选择菜单的箭头操作未断言，不把 `selectOption` 冒称键盘菜单验收。真实截图及主代理复核见 [P5视觉合同](./30-p5-ba-visual-direction.md)。

P5本地工程门禁通过，提交 `94f6acb942c2f601df98f1f28b6533e777d58b19` 已推送并核对远端main完全一致，提交后工作树干净。源码/前端产物/日志1491文件扫描与103文件提交索引秘密/禁入路径检查均通过。暂存组合命令两次自动权限审查超时、未执行；缩小为已追踪与已核验新增文件的两条独立命令后通过，未绕过权限拒绝。真人专业审核、零代码目标用户试用及45–60分钟计时仍PENDING；未公开部署。

## 9. P6 实施状态

P5推送核验后开始代码实施。以[报告工程合同](./31-p6-engineering-plan.md)及[视觉合同](./32-p6-report-visual-direction.md)为准，纯目录/校验与持久作业分离；正式链路仅用隔离测试库和TEST_FIXTURE内容验证。下列分项与最终验证均已通过，P6已提交并推送；真实专业内容仍REVIEW。

### P6 已通过分项与运行边界

- 后端候选只读运行包SHA256 `d6027491533d7cf00704772abff0489799da3031bd33d31ad7fad5bcb9f258b3`。新V7追加五张报告/反馈表及外键，不修改V1–V6。初始隔离HTTP构建 `fbd2568d089e6eb0445b44a50661fcde9fc0ac3db23de7ee872f18837c4130b6`；加入仅测试源码的重启门闩后构建 `3677bef7d67503473f3f5df0e12991ca168c7987a6cf5c0143c873d9b2cb7cb1`，两者使用同一产品JAR。
- 完整MySQL回归261项：259通过、2项明确付费探针跳过，0失败/错误，日志 `/tmp/majorpilot-p6-integration-final.log`。初跑两项旧Hint装配缺依赖已补真实配置，未降低断言。后加4项仅测试门闩单测通过；普通总入口Node208通过（89+60+59），Java265中159通过/106实库或付费条件跳过，不把跳过算通过。普通入口显式关闭真实模型测试开关。
- `scripts/test-p6-api.mjs` 在实际Spring安全链/事务/队列/独立测试库上通过15/15新增operation响应合同：三专业正式TEST_FIXTURE闭环、AI一次成功、DS一次修复、BA修复后回退、2→3比较、NEXT、四种管理权限、幂等/旧current/版本冲突、反馈与页面事件。起初管理登录Origin使用错误，修成既有管理源15174而非放宽CORS；失败2账号与通过2账号均精确清理。日志 `/tmp/majorpilot-p6-api-second.log`，付费0。
- R08执行 `scripts/test-p6-restart.mjs`：三个检查点真实SIGKILL测试JVM并从同一构建/密钥/Redis恢复，未修改SQL业务状态或缩短60秒租约。领取后PREPARED调用计数0→1；修复中REPAIR_REQUESTED保持retry_no=1、HTTP=2，被中断调用UNKNOWN后回退，无再次修复；发布前VALIDATED保持HTTP=1及正文hash。三阶段lease均1→2，真实旧lease heartbeat/publish均拒绝，current/claim/event不变。日志 `/tmp/majorpilot-p6-r08-runtime.log`；1账号精确清理，主站进程未变。
- 空库V1→V7与“先V1→V6、加入合成既有行、再升V7”均通过：75表、新五表/七新增具名外键、重试及HTTP上限CHECK正常，第二次迁移0项；升级前后既有行完全相同。证据分别 `/tmp/majorpilot-fresh-migrations-aCSRMY/migration-evidence.json` 与 `/tmp/majorpilot-fresh-migrations-Fk9XDV/migration-evidence.json`，临时库/账号精确清理。随后主站同JAR升到V7，checksum1240588679；0Student/0Run/3真实MAJOR仍REVIEW，未发布正式内容。
- 真实浏览器最终矩阵 `tests/e2e/p6.mjs`：Chrome153.0.8010.48及Edge151.0.4129.78均通过网页业务检查，9/8节、14/21格、1536/1366/768/390、NEXT介绍→决定→开始→暂停恢复、旧current和旧版反馈、print409/来源race、回退、ALL_COMPLETED、跨账户拒绝和跨tab退出。日志 `/tmp/majorpilot-p6-browser-final.log`，2账号精确清理，付费0。先前两轮分别为事件未满可见1秒和ALL_COMPLETED样式类误用，修测试时序/语义选择器，不放宽产品合同。
- 上述浏览器PASS只证明HTML/DOM与流程。根代理检查实际PDF曾发现三专业比较正文缺失并有空白页，未因DOM存在21格而宣称PDF通过；后来用无账号探针复现，并将手机媒体查询限定screen，独立固定印刷列宽/间距。最终实际三专业闭环只用1个合成账号，两浏览器均单专业3页/比较6页，15/40声明与全部依据、7维/3专业/21格、版本页脚通过PDF文本核对。根代理逐页查看9张真实页图，无截断/空白/孤立页脚，Chrome与Edge渲染逐字节一致；日志 `/tmp/majorpilot-p6-print-actual.log`，账号/邮件精确清理，0付费。详见[视觉验收](./32-p6-report-visual-direction.md)。
- 构建与同机干净源码演练已通过：`/tmp/majorpilot-clean-BD3wT1`、1234文件、新凭证、不复制API Key/数据库、不启动服务；该次在比较打印修复前，不能冒称最终修复版。最终源码/索引扫描另行追加结果。
- 主站升到同一P6 JAR后，旧P3/P4/P5真实HTTP各27项响应合同通过；旧P2/P5 Chrome/Edge各6/8组业务流程通过。日志 `/tmp/majorpilot-p6-legacy-p3.log`、`-p4.log`、`-p5.log`、`-p2-browser.log`、`-p5-browser.log`。只将新关闭预期更新为已生效的evidence-v3/ds-evidence-v2/ba-evidence-v2，旧READY不重写、预览无正式报告/NEXT、UNVERIFIED分析claims=[]仍保留。6个API与4个浏览器合成账户/邮件精确清理，0付费，没有重置每小时注册限额。
- 独立源码核查未发现新后端阻塞：归属/版本/租约再次校验后原子发布、首份有效答卷不可回填、正式NEXT与ALL_COMPLETED、一次修复与持久HTTP预算均有对应实库和重启证据。测试库账号授权同时收窄为字面 `majorpilot_test`，转义下划线避免MySQL库名通配授权；新grant已以实际账号连接和mysql.db元数据核验，没有扩大权限。

### P6 最终候选验证

- 打印CSS冻结后 `sh scripts/test-unit`：Node212/212（93+60+59），Java265项中159通过/106实库或付费条件跳过，0失败/错误；日志 `/tmp/majorpilot-p6-unit-delivery.log`。普通测试0付费。
- 最后源码同机干净重建 `/tmp/majorpilot-clean-W8ezui`：1242文件、全新本地凭证、没有复制API Key或业务状态、未启动服务，依赖安装、两端类型/构建、合同、三个执行器及后端package均PASS。共享已核验工具/缓存，不称第二台机器；之后仅补交付文档和打印截图。
- 实际打印完成后按登记PID/启动身份停止18081/15176，核对0Student及固定fixture hash后精确清理3个合成任务、带本轮标签的Operator/角色/菜单与专用Redis14，释放互斥锁。主库/主站不变，忽略的密钥文件、最小权限测试账号与不可变构建保留。停止审批首次超时未执行，按工具允许重试一次成功，未绕过拒绝。
- 测试库释放后 `sh scripts/test-integration` 最终265项：263通过、2明确付费测试跳过，0失败/错误，日志 `/tmp/majorpilot-p6-integration-delivery.log`。包括新增4项重启门闩，完整实库业务回归仍通过。此前261项结果保留为中间证据，不代替本次最终统计。
- Git前门禁：源码/前端产物/日志1584文件秘密扫描PASS；126个暂存文件逐一检查实际环境秘密、测试Operator派生凭证及禁入路径PASS；`git diff --check`与`git diff --cached --check`通过。主站health200，主库V7/checksum1240588679、0Student、3个真实MAJOR仍REVIEW/0PUBLISHED。提交与远端完整SHA在下一阶段开始前核对，不将本行当成已推送。

### P6 Git 交付回执

提交 `fb030ac4cd5b9cb542ac5ffa9bec62a1174b0c0c`（`feat(p6): deliver private evidence-bound reports and comparisons`）已推送至 `origin/main`，远端完整SHA与本地一致，共126个文件。上述Git前门禁之后完成核验，再进入P7；未公开部署。P7实现及独立验收见 [后续台账](./35-p7-delivery-ledger.md)。

### 真实模型能力验证（单列）

2026-09-21用户授权开发中使用真实API且不要求费用上限。报告探针只发送四类合成白名单字段（reportType、requiredSectionOrder、statements、completeValidProposal），不含账户/问卷/学生分析/原始事件。普通测试仍0付费；容量压测和供应商真实数据条款是独立上线门禁。

- 首次合成探针百炼qwen3.7-plus和DeepSeek deepseek-flash各1 HTTP，均AI_VALIDATED、16声明含1个受规则约束解释，耗时10794ms/1721ms；日志 `/tmp/majorpilot-p6-live-report.log`。
- 补上持久防重放入口 `scripts/report-spike.mjs` 后，各平台再以独立run-id验证一次：均AI_VALIDATED、各1 HTTP、10517ms/2190ms，日志 `/tmp/majorpilot-p6-live-guarded.log`。本轮合计4次真实HTTP，不是“只调用2次”；没有使用回退冒称模型成功。费用未估算，不把未知费用记为0。每个入口仍45秒/最多2 HTTP，已有attempt标记不得自动重发。
