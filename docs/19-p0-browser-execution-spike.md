# P0 浏览器、执行器与双前端验证

> 日期：2026-09-20；范围：技术验证，不是 P1 用户产品。  
> 浏览器技能：`frontend-testing-debugging`；Browser plugin / browser skill 未提供，按技能使用常规 Playwright。  
> 本文只记录实测项，完整 P0 出口由汇总文档判定。

## 1. 固定版本与操作入口

- Node 24.21.0、npm 11.19.1，均使用项目 `data/tools`，不依赖系统 Node 25。
- Playwright 1.62.1；本机 Chrome 153.0.8010.48、Edge 151.0.4129.78，独立临时 profile，开启 Chromium sandbox，不读取用户默认浏览器数据。
- RuoYi 管理端 SHA、许可证、原样构建、补丁见 [UPSTREAM-frontend](../UPSTREAM-frontend.md)。
- 学生技术验证页：`http://localhost:15173/`；管理端：`http://localhost:15174/`；执行器：`http://127.0.0.1:15175/`。
- 布局保持 Element Plus 原有设计体系。本次未创建最终学生产品视觉；1280×900 桌面、390×844 手机截图人工检查了文字、按钮、间距、数据区和横向溢出。
- 两端均强制 TypeScript 检查后构建。管理端恢复真实Vue类型后暴露的248项上游诊断已修复，`vue-tsc --noEmit` 实际exit 0；未关闭strict或添加全局any绕过。保留的上游第三方ambient shim仍是后续工程质量审查项。

```sh
# 从仓库根目录；先按 README 完成本地工具和依赖安装
data/tools/node/bin/node --test executor/test/*.test.mjs
data/tools/node/bin/node tests/e2e/execution.mjs
# 单独开一个终端：这是测试专用服务，不是正常部署组件
data/tools/node/bin/node executor/pyodide-probe.mjs
data/tools/node/bin/node tests/e2e/pyodide.mjs
# 后端就绪后运行身份与 Cookie 浏览器门禁
data/tools/node/bin/node tests/e2e/cookies.mjs
data/tools/node/bin/node tests/e2e/admin.mjs
data/tools/node/bin/node tests/e2e/security.mjs
```

受 Codex 沙箱限制，普通权限浏览器进程曾 SIGABRT；后续通过批准的提权执行真实 Chrome/Edge。脚本没有停用浏览器安全机制。

## 2. 引擎选择与真实候选

实际安装并运行 Pyodide **314.0.7** npm 包，文件体积 **13,879,282 bytes**。两浏览器原始 Worker 加载和固定 Python 均值计算均成功；Chrome 冷启动 890 ms，Edge 881 ms；启动后 WASM heap 为 **31,457,280 bytes**。这是运行时 heap 大小，不是整个浏览器峰值内存。

同一版本的官方 loader 在计算期策略 `connect-src 'none'` 下不能启动：两浏览器均实际触发 `securitypolicyviolation`，`effectiveDirective = connect-src`（约 1 ms）。前期仅记录 15 秒超时不足以证明原因，现已用明确 CSP 事件替换该弱证据。

**P0 采用设计 `15` §10 已允许的退路：可信固定计算器 + 界面参数 + 等价只读 Python。** 当前不开放可编辑表达式、不执行用户 Python/JS、不放宽 CSP。该结果不意味着 Pyodide 本质上不可安全使用；需要另做受审计的运行时资产预加载／传递架构，才能重新评估。P2/P3 正式结果仍必须后端白名单重算或完整预计算覆盖，P0 浏览器结果不是正式评分。

官方参考：[Pyodide Worker 用法](https://pyodide.org/en/stable/usage/webworker.html)、[JS API](https://pyodide.org/en/stable/usage/api/js-api.html)。

## 3. 固定计算器安全边界

- 不同 hostname 隔离：学生 `localhost`，执行器 `127.0.0.1`；不仅是不同端口。
- iframe sandbox 仅 `allow-scripts`，不允许 same-origin、表单、弹窗、文件选择或顶部导航；因此执行上下文是 opaque origin，不授予持久化存储。
- 固定 Worker 资产由可信本地启动器嵌入、SHA-256 校验；其 blob Worker 继承 CSP，计算全程 `connect-src 'none'`。
- 只发送 template ID 与有限数字参数。无 Cookie、Session、CSRF、问卷、报告、隐藏答案或本地文件句柄。
- 消息验证 source window、type、随机 nonce。父页面接收时，只有精确 iframe 的 `origin=null` 被允许；执行端接收时精确匹配主站 Origin。向 opaque iframe 的目标 `*` 不代表广播，且不携带秘密。
- 单次 Worker：10 秒后终止；输出100 KiB、输入1 MiB、数组10,000项、有限数字。未承诺浏览器硬内存配额。
- 最终超时/错误后移除 frame 并新建下一次执行，避免复用运行状态。

## 4. 浏览器与单元实测

测试路径：学生页加载 → 输入不同数字 → 运行 → 均值随输入改变 → 隔离探针 → 10秒超时 → 恢复重跑 → 手机视口。

| 门禁 | Chrome | Edge |
| --- | --- | --- |
| 页面身份、非空、无框架错误层 | 通过 | 通过 |
| `[12,18,24,30]` 均值21；`[2,4]` 均值3 | 通过 | 通过 |
| network / WebSocket / file URL 被阻断 | 通过 | 通过 |
| 至少3次真实 CSP connect-src 违规，禁止请求无服务端响应 | 通过 | 通过 |
| IndexedDB、OPFS、文件选择器、DOM、Cookie 不可用 | 通过 | 通过 |
| 10秒超时并终止；再次运行正常 | 通过 | 通过 |
| 伪造消息的错误 nonce、Origin、source window | 拒绝 | 拒绝 |
| 主站Path=/合成Cookie实际发送，执行器无Cookie | 通过 | 通过 |
| 1280×900、390×844；无横向溢出 | 通过 | 通过 |
| pageerror | 0 | 0 |
| 非预期 console warning/error | 0 | 0 |

初次冷启动观测33/15 ms；复测15/91 ms；增加伪造消息、无效输入与console门禁后的复测17/16 ms；最终 canonical 构建并重启后的复测25/43 ms。超时含页面交互开销约10.35秒。该小样本不是性能SLA或低端机基准。严格console检查曾发现缺失favicon导致404，现用显式空favicon修正，未通过忽略此错误获得通过。

安全复核修正：最初 `request.headers()` 可能省略 Cookie，且哨兵 Cookie 的 Path 不覆盖执行器路径，不能证明 hostname 隔离。当前测试改为 `request.allHeaders()`，使用主站 `Path=/` 的合成 HttpOnly 哨兵，并同时要求主站真实请求包含哨兵、至少3次执行器请求没有任何 Cookie；不会输出 Cookie 值。

Node 单元测试3项通过：提交的manifest固定Worker SHA-256；两个输入产生不同结果；拒绝源码字段、未知模板、超长数组、超过1MiB的请求、非有限数字以及超量输出。启动器在接收任何请求前验证manifest哈希，浏览器执行前再次验证。

本地截图 `/tmp/majorpilot-p0-evidence/`，包含每个浏览器的 `*-desktop.png`、`*-mobile.png`、`*-isolation.png`。截图不提交仓库，因其证明本次本地环境而非可复现测试本身；可用提交的脚本重建。

## 5. 身份与 Cookie 浏览器门禁

`tests/e2e/cookies.mjs` 在上述Chrome和Edge均通过：真实浏览器请求的 `MP_INTAKE` 随公共认领发送且认领后清除；`MP_SESSION` 仅在 `/api/app/v1` 发送且JS不可读，学生退出接口实际携带会话并清除；根路径可读的两类CSRF不会互相替代，错误token返回403；删除确认撤销会话后，限定路径 `MP_DELETION` 仍可查无PII回执，其他公共路径不发送该回执Cookie。记录只含Cookie名字/路径，不含值。

此为明确标注的合成P0主体，不是P1注册认证验收。

`tests/e2e/admin.mjs --upstream` 在应用源码裁剪前证明：原始RuoYi Vue3前端（仅Vite本地地址适配）可在Chrome/Edge登录、加载真实权限菜单和退出。对应后端是P0本地配置，不能把这次浏览器测试说成前后端都毫无修改；原始后端编译/API登录有独立记录。

安全裁剪后 `tests/e2e/admin.mjs` 两浏览器再次通过：初始用户名/密码为空、无记住密码控件、权限菜单接口成功且移除关闭的工具/演示入口、首页为P0说明、登录后无密码/Admin-Token Cookie、学生origin不能读取管理端sessionStorage Token、退出清除Token。`pageerror=0`、非预期console警告/错误=0。桌面管理端截图同目录 `*-admin-upstream.png` 和 `*-admin-trimmed.png`，均做了人工图像检查。

`tests/e2e/security.mjs` 证明管理员Bearer不能作为学生凭据，学生Cookie不能作为管理员凭据，合法CSRF配错误Origin仍拒绝，且拒绝后原学生会话仍可用。管理员到学生一项通过真实浏览器fetch；反向刻意跨Cookie路径发送HttpOnly凭据以及伪造Origin使用Playwright的显式HTTP测试客户端，不虚构为普通网页JS可读取HttpOnly Cookie。

发现并修正了两项实际问题：生成的48字符管理密码超过上游允许的20字符长度，现限定16–20并随机生成20字符；Vite长跑进程曾未感知磁盘补丁，HTTP仍返回旧Cookie实现，现通过PID管理重启并核验实际页面后重跑。文件编辑成功或生产构建成功均没有被当成浏览器已加载最新代码的证据。

## 6. 最终统一入口复测与依赖审计

根目录 `sh scripts/build-local` 实际 exit 0，覆盖两前端的干净依赖安装、严格类型检查与生产构建。随后用项目PID管理器重启学生端、管理端和执行器，再运行 `sh scripts/test-e2e`，避免把旧Vite进程当成最终源码。

该次统一命令中的 `execution.mjs`、`cookies.mjs`、`security.mjs`、`admin.mjs` 四组在Chrome和Edge全部通过，管理端viewport为1440×1000。最终学生桌面、手机、隔离探针及管理首页截图再次人工检查，无裁切、遮挡、空白页或框架错误层。命令尾部的 `scripts/test-api.mjs` 在邮件发送断言遇到500，导致该次总命令 **exit 1**，未将“四组浏览器通过”写成“整个统一命令通过”。

后续窄范围A/B检查定位为Maven构建覆盖正在运行的target JAR：仅重启同一JAR、保持Mailpit和配置不变即可恢复邮件发送。后端启动已改为内容寻址的不可变运行副本，并通过运行期间再次Maven构建的回归（PID、运行副本SHA均不变，邮件接口仍成功）。该修复完成后，本次再次完整执行 `sh scripts/test-e2e`，**最终 exit 0**：四组Chrome/Edge测试全部通过，末尾API测试的身份隔离、跨边界CSRF、错误Origin、所有权CRUD、跨学生拒绝以及两种邮件捕获均为true。最终固定计算器冷启动样本24/73 ms，超时10347/10353 ms。原失败及纠正证据被保留，完整后端原因与回归见P0汇总证据。

移除未使用的jsencrypt后，对最终管理端lock再次执行 `npm audit --omit=dev --json`：critical 0、high 0、moderate 1、low 0；唯一剩余项为ECharts 5.6.0的 [GHSA-fgmj-fm8m-jvvx](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx)。审计命令因该moderate项返回exit 1，这是已知风险而非“零漏洞通过”。P0没有用户可编辑的图表配置；升到修复版6.1.0属于major升级，须在P8上线门禁之前进行兼容性与安全复核。原始审计摘要保存在本机 `/tmp/majorpilot-p0-frontend/admin-final-production-audit-summary.json`。

## 7. 尚不能据此声称完成的部分

- 此页无真实学生注册、问卷、体验、报告或后台分析功能；这些仍属于 P1 以后。
- 执行参数和结果的后端权威校验留在 P2/P3；当前只验证浏览器隔离与恢复。
- Pyodide 的严格预加载隔离架构未通过，本地固定计算器退路已经实测。
- 没有低端设备、Safari、Firefox、生产TLS和跨真实域名验收。
- Cookie、管理登录等后端依赖证据另行汇总，不由静态构建或本页执行通过推断。
