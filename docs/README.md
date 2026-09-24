# MajorPilot 设计文档索引

## 最新内容设计：2026-09-24

用户已确认按明确方法逐步体验、面向跨专业新手解释，以及下载Excel后将关键结果和理由回填网站，并明确要求实施网站。38–41 是当前设计基线；旧案例和报告设计已[撤下并留存](./archive/2026-09-24-pre-method-led/README.md)。工程和运行状态单独记录在[42 切换台账](./42-method-led-implementation-ledger.md)，设计确认不等于功能已上线。

1. [38 方法主线驱动的专业体验重设计](./38-method-led-experience-redesign.md)：范围、原则、历史兼容、实施次序和真人门禁。
2. [39 三专业案例脚本与理解检查](./39-guided-major-case-specifications.md)：AI错误分析、DS探索性分析、BA漏斗诊断与行动验证。
3. [40 过程证据与新手可读报告](./40-learning-evidence-and-report-design.md)：支持条件、前后尝试、卡点定位、生成与验收。
4. [41 原始数据Excel下载与结果回填](./41-excel-download-and-local-results.md)：下载链接、工作簿内容、核对和隐私边界。
5. [42 改版实施台账](./42-method-led-implementation-ledger.md)、[43 Excel 下载先行交付](./43-workbook-download-delivery.md)、[44 过程与核对内核](./44-learning-core-implementation.md)：逐批工程结果与未完成门禁。

该专题是新版本实施入口。09、10、25–32 的旧正文位于独立归档目录，原路径只保留回溯指针；未修改的身份、版本、数据责任和安全边界继续有效。

## 既有实施与设计记录

> 更新日期：2026-09-21
>
> 当前阶段：P0–P7已推送，P7本地工程与最终冻结回归通过，功能提交 `f4d26dd64d18da9a02c96b2939925d17c8076a66` 已核对远端完整SHA；准确状态见[台账35](./35-p7-delivery-ledger.md)。本轮范围止于P7，不自动进入P8；三专业内容仍REVIEW，真实专业审核/用户试用和计时不因自动化通过而算完成。首次推荐AI润色仍按用户确认单列增强。Git交付、公网部署和完整MVP验收分别记录。

## 阅读顺序

1. [项目初始共识与讨论基线](./00-majorpilot-discussion-baseline.md)：历史探索记录，不作为当前实施规范；
2. [MVP 产品定义](./01-mvp-product-definition.md)：产品目标、范围和验收边界；
3. [信息架构与页面流程](./02-mvp-information-architecture.md)：学生端和管理端页面范围；
4. [技术约束与架构边界](./03-mvp-technical-constraints.md)：已确认技术基线和运行约束；
5. [模型服务评估](./04-model-provider-evaluation.md)：百炼优先的模型接入与评测方案；
6. [RuoYi 技术基线](./05-ruoyi-baseline-selection.md)：RuoYi 版本、双前端和账户隔离决策；
7. [领域模型与数据边界](./06-domain-model-and-data-boundaries.md)：领域对象、生命周期和数据责任；
8. [设计阶段完成标准](./07-design-stage-definition-of-done.md)：详细设计交付物和完成审计入口；
9. [信息收集与推荐设计](./08-intake-and-recommendation-design.md)：问卷、规则、理由和后续推荐；
10. [三个专业任务设计](./09-three-major-task-designs.md)：AI、Data Science 和 Business Analytics 的内容合同；
11. [报告与证据设计](./10-report-and-evidence-design.md)：证据白名单、报告结构和降级；
12. [逻辑数据模型](./11-logical-data-model.md)：表、关系、约束、事务和留存；
13. [API 契约设计](./12-api-contract-design.md)：公开、学生和管理 API；
14. [分析、安全与隐私设计](./13-analytics-security-and-privacy-design.md)：事件、指标、威胁和数据权利；
15. [页面流程与低保真线框](./14-ui-flow-and-wireframes.md)：关键布局与页面状态；
16. [工程与测试设计](./15-engineering-and-test-design.md)：工具链、目录、迁移、运行和测试门禁；
17. [实施路线与需求追溯](./16-implementation-roadmap-and-traceability.md)：P0–P8、FR/NFR 和交付标准；
18. [设计阶段复核与修订记录](./17-design-stage-completion-audit.md)：本轮问题的修订追溯、两项用户确认、D1–D15 设计证据和未验证实施边界。

根目录的 [领域语言](../CONTEXT.md) 是所有文档和后续代码命名的词汇基线。

实施新增记录：[百炼与契约验证](./18-p0-ai-spike.md)、[浏览器执行验证](./19-p0-browser-execution-spike.md)、[P0 实施与验证汇总](./20-p0-implementation-evidence.md)。本地启动入口见 [根 README](../README.md)，固定来源与补丁见 [UPSTREAM](../UPSTREAM.md)。

当前实施：[P1 实施与交付记录](./21-p1-implementation-and-delivery.md)、[P1 视觉方向与截图比对](./22-p1-visual-direction.md)。

当前推进：[P2–P6实施与验收记录](./23-p2-to-p6-delivery-ledger.md)、[P2工作区视觉与真实截图](./24-p2-workspace-visual-direction.md)、[P3实施接缝](./25-p3-engineering-plan.md)、[P3 AI视觉验收](./26-p3-ai-visual-direction.md)、[P4 DS实施接缝](./27-p4-engineering-plan.md)、[P4 DS视觉合同](./28-p4-ds-visual-direction.md)、[P5 BA实施接缝](./29-p5-engineering-plan.md)、[P5 BA视觉合同](./30-p5-ba-visual-direction.md)、[P6报告工程合同](./31-p6-engineering-plan.md)、[P6报告视觉合同](./32-p6-report-visual-direction.md)。各阶段工程验收和真人门禁分别记录；P6网页、实际打印和重启恢复已通过，Git结果见交付记录。

设计校验入口：[check-design.mjs](./validation/check-design.mjs)。它检查文档结构与规则示例，不代替应用测试。阅读本轮变化可以先看 `17`，再按其中的问题编号进入专题设计。

P7 当前记录：[工程合同](./33-p7-engineering-plan.md)、[视觉合同](./34-p7-visual-contract.md)、[验收与交付台账](./35-p7-delivery-ledger.md)。

2026-09-21 最新真人验收修订：[完整产品流程与可定位反馈](./36-human-acceptance-product-flow.md)、[本地授权与历史证据决策](./adr/0001-local-product-release-and-historical-evidence.md)。本地实现与真实报告/比较流程已通过；它取代旧“预览永不报告”的绝对限制，但不代替专业审核、计时、P8或公开部署门禁。

## 文档状态含义

此前报告质量研究稿已撤下并留存：[完整上下文与作答分析 v2](./37-report-answer-analysis-v2.md)、[分析来源与版本决策](./adr/0002-evidence-grounded-answer-analysis.md)、[必经审校改写决策](./adr/0003-required-analysis-refinement.md)、[预绑定评价对象决策](./adr/0004-prebound-answer-analysis.md)。新报告按40实施；旧研究稿及未完成代码不是已验收功能。用户要求优先分析质量，真实调用成功、结构验证及模型审校均不代替内容质量验收。

- **历史基线**：保留当时问题和假设，后续文档可以取代其中的实施判断；
- **确认稿／已确认**：当前设计基线，修改需要说明原因和影响；
- **讨论稿**：允许继续细化，不能直接视为完整开发规格；
- **已验证实施基线**：不仅完成文档决策，还经过目标环境运行或测试验证。

## 冲突处理顺序

出现冲突时按以下顺序处理：

1. 明确的最新确认文档优先于较早文档；
2. 专题设计优先于上位文档中的概述，但不得扩大上位文档明确排除的范围；
3. `00` 只用于理解历史，不覆盖 `01`–后续文档；
4. 仍无法判断时停止实施并记录冲突，不静默选择更方便的解释。
