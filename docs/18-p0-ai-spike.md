# P0：百炼能力与契约验证

> 验证日期：2026-09-20  
> 范围：合成数据、小额连通性探针、静态契约与本地故障注入  
> 不代表：生产模型定型、真实用户数据合规、完整报告质量或账号配额验收

## 1. 当前结论

百炼北京端点与 `qwen3.7-plus` 已用现有密钥成功完成两次 `json_object` 请求，分别经过 Node 诊断工具和 **Java 后端适配器**；输出通过项目本地结构、固定专业、证据 ID 和基本文本边界检查。一次严格 `json_schema` 请求返回 HTTP 400；未记录供应商原始错误体，因此不能判断是该请求的 Schema/参数限制，还是账号/模型/端点支持差异，也不能概括为“百炼不支持 JSON Schema”。

P0 接入可按已批准的设计使用 **JSON Object + 服务端校验**。生产模型、完整任务质量评测、一次结构修复和确定性报告回退仍属于后续工作，不以本探针替代。

## 2. 端点与模型核对

当天[官方 Chat API 文档](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)推荐北京业务空间专属域名，同时明确旧域名仍可使用。本次沿用无需补充业务空间 ID 的北京地址：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

后续若迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，需填写真实业务空间 ID；不能把其他地域端点与北京密钥混用。脚本只允许这两类北京 HTTPS 主机，拒绝其他域名、URL 用户名密码、查询参数和重定向。

当天[官方结构化输出说明](https://help.aliyun.com/zh/model-studio/qwen-structured-output)列出了 `qwen3.7-plus` 系列的 JSON Object 和 JSON Schema 能力。本次选择该 Plus 别名仅建立 P0 连通基线，不声称已冻结底层模型快照。官方文档提醒输出 token 限制可能截断结构化结果；本探针仍保留 512-token 成本上限，并拒绝非 `stop` 结束或不完整输出。

探针没有更改用户的 `.env.local`，没有使用 Apple 钥匙串或调用 DeepSeek 服务。探针在环境变量为空时使用代码中公开的 P0 地址/模型默认值，真实密钥只在本地诊断进程或 Java 后端进程内用于授权头。学生/管理前端不得引入诊断脚本或持有密钥。

## 3. 真实请求证据

本轮总计 **3 次**请求，无自动真实重试，每次 `max_tokens=512`，只发送仓库中的固定合成例子，没有学生信息、问卷或反思正文。已达到本轮小实验预算，不继续调用。

| 请求 | 模式 | 观察结果 | 本地校验 / 使用量 |
| --- | --- | --- | --- |
| 1 | `json_schema`、`strict=true` | HTTP 400，安全分类 `UPSTREAM_REJECTED` | 无可验证输出；原因未进一步诊断 |
| 2 | `json_object` | HTTP 200；约 1,819 ms | 通过；输入 139、输出 69、合计 208 tokens |
| 3 | Java 后端 `json_object` | 成功；约 2,663 ms；尝试 1 次 | 通过；输入 154、输出 72、合计 226 tokens |

延迟只是这一次短请求，不是性能基准。token 数来自成功响应的 usage；未核对账单、优惠额度或最终金额。未探测账号所有模型、可用余额、RPM/TPM 配额或供应商真实超时/限流行为。

为减少秘密与个人数据落盘，工具只返回白名单元数据：模式、所请求模型、状态、耗时、尝试次数、校验结果、token 数。它不打印原始请求/响应、供应商错误正文、API Key 或供应商请求 ID。

## 4. 本地故障注入与边界

`scripts/ai-spike.test.mjs` 使用本机 HTTP stub 和无权限测试占位值；真实密钥不会进入该测试。已验证：

- 429 有界重试和抖动，达到次数后停止；401 不重试；
- 请求超时中止、全局 deadline、共享请求预算；
- 响应大小上限、JSON/字段/固定证据/专业约束、基本危险内容拒绝；
- 配置文件权限、禁止执行环境文件内容、北京端点白名单；
- 日志结果不包含测试凭证或模型正文。

这些证明的是**本地客户端处理行为**，不是对百炼账号真实限流的压力验证。账号配额、真实限流/超时行为仍未实测；不主动耗尽额度制造失败。2026-09-20 用户确认：P0 接受现有小量真实调用和本地故障注入证据，真实容量压测移到上线前门禁；届时先明确预期负载、预算和平台配额，再安排受控测试。

结构化响应在探针中由无依赖白名单校验器检查；契约测试同时用 AJV 2020-12 对合成样例交叉验证。基本文本规则不是完备内容安全分类器，也不构成正式报告评测集。

## 5. Java 后端适配边界

`ruoyi-majorpilot/integration/ai` 提供供应商无关的 `AiGateway`、`FakeAiGateway`、`ReplayAiGateway` 和 `BailianAiGateway`。接口携带固定 prompt 版本和四类工作负载枚举，但 P0 **只执行同一个合成夹具**；这不表示提示、反思、报告和推荐四项业务功能已实现。请求不接收任意提示词或学生自由文本。

Java 适配器使用 `json_object` 后校验明确字段和证据，最多 3 次传输尝试、全局 deadline 不超过 45 秒；默认 2 次、30 秒全局与 15 秒单次。输出在流式读取中限制为 32 KiB，不跟随 HTTP 重定向。429、临时上游错误和超时可有限重试；结构错误直接返回安全错误，由未来业务层负责最多一次结构修复，不能混为传输重试。

`p0` profile 默认 `MAJORPILOT_AI_MODE=fake`，即使本地已有密钥也不会自动付费调用；`replay` 只使用显式脱敏夹具，`bailian` 是后端主动调用时的真实适配器。bean 初始化不调用模型。真实 Java 测试只在 `MP_RUN_BAILIAN_TEST=true` 时开启，还必须指定绝对路径 `MP_BAILIAN_LIVE_GUARD_FILE`；调用前原子创建一次性尝试标记，防止误重跑再次计费。

16 个 Java 单元/本机 HTTP stub 测试已通过，包括真实 HTTP 流读取上限、慢响应体 deadline、错误脱敏、重试次数、Fake/Replay、Spring 默认模式和 Schema 边界。另有 1 个单次 Java 真实调用测试通过。普通 Maven 测试默认跳过付费测试。

## 6. OpenAPI / JSON Schema 骨架

- [P0 OpenAPI 3.1](../contracts/openapi-p0.json)：16 个合成身份、Cookie、删除回执、邮件和持久化探针操作；与 Java Controller 路径清单一致。
- [P0 AI JSON Schema](../contracts/schemas/p0-ai-result.schema.json)：不允许额外字段，只接受固定合成证据和规则专业；不是未来体验报告 Schema。
- [契约说明](../contracts/README.md)：静态检查、Schema 编译、请求/响应负向样例和身份边界声明。

P0 接口仅在本地 `p0` profile 开启。`p0/claim` 不是正式注册，测试密码不是学生账户密码实现，删除合成 actor 不是 P7 的完整删除流程。管理端未认证错误保留上游 RuoYi envelope，并在合同中单独说明；授权成功的 MajorPilot 响应使用项目标准 envelope。

## 7. 可复现命令

普通检查不会调用模型，也不需要密钥：

```sh
data/tools/node/bin/node data/tools/npm/bin/npm-cli.js ci --prefix contracts
data/tools/node/bin/node contracts/check.mjs
data/tools/node/bin/node --test contracts/tests/*.test.mjs scripts/ai-spike.test.mjs
```

本次结果：**21/21 Node 测试、16/16 Java 无付费测试通过**，以及 1 个显式开启的 Java 真实调用通过；OpenAPI 3.1 校验、16 个操作 Schema 编译和 Java 路径清单对照通过。静态合同通过不能替代运行中的 HTTP 和真实浏览器验证。

Java 非付费单元测试通过项目环境加载器执行 Maven Reactor 的 `AiGatewayTest`。完整统一命令由仓库启动/测试入口维护，不需要把密钥放到 Maven 参数中。一次性付费测试已完成，其尝试标记保留于被 Git 忽略的 `data/p0/bailian-java-live-attempted`；不得删除标记来自动重试。

需要再次验证且接受产生少量调用费用时，才执行：

```sh
data/tools/node/bin/node scripts/ai-spike.mjs --live
```

该命令每次最多 2 次真实请求，不自动重试；严格模式失败会保留失败记录，因此即使 Object 模式可用，整体命令仍可能非零退出。不要把它放入默认启动、CI 或日常测试流程。本次已执行，不需为重现文档再次付费调用。

## 8. 后续门禁

2026-09-20 用户已确认上述验收边界调整；本轮不再追加真实模型调用。容量压测不是已通过项，也不再阻塞 P0 本地技术基线收尾。

仍待后续验证：四类真实产品工作负载的端到端和证据边界评测、模型快照与价格固定、区域数据保存/删除条款复核、账号容量和故障观测。任何真实学生数据发送前都需重新复核数据处理边界。
