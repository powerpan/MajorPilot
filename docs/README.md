# MajorPilot 设计文档索引

> 更新日期：2026-09-20  
> 当前阶段：P0 本地技术基线实施与约定范围验证完成；尚未开始 P1。最新运行证据及保留门禁以 P0 专题与实施记录为准，不以设计文档中的覆盖状态代替。

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

设计校验入口：[check-design.mjs](./validation/check-design.mjs)。它检查文档结构与规则示例，不代替应用测试。阅读本轮变化可以先看 `17`，再按其中的问题编号进入专题设计。

## 文档状态含义

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
