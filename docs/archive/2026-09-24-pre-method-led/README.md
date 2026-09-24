# 方法主线改版前的设计留存

归档日期：2026-09-24。按用户要求撤下旧案例／报告设计，保留正文供回溯。当前实施规范是 [38–41](../../38-method-led-experience-redesign.md)，切换与实施进度见 [42](../../42-method-led-implementation-ledger.md)。

## 留存范围

| 原编号 | 归档内容 | 新版替代 |
| --- | --- | --- |
| [09](./09-three-major-task-designs.md) | 三专业旧任务脚本和计算合同 | 39；历史计算机制保留复用 |
| [10](./10-report-and-evidence-design.md) | 旧证据与报告结构 | 40；证据归属边界保留 |
| [25](./25-p3-engineering-plan.md)、[26](./26-p3-ai-visual-direction.md) | AI 工程与页面设计 | 39、41 |
| [27](./27-p4-engineering-plan.md)、[28](./28-p4-ds-visual-direction.md) | DS 工程与页面设计 | 39、41 |
| [29](./29-p5-engineering-plan.md)、[30](./30-p5-ba-visual-direction.md) | BA 工程与页面设计 | 39、41 |
| [31](./31-p6-engineering-plan.md)、[32](./32-p6-report-visual-direction.md) | 报告工程与页面设计 | 40 |

原路径保留指向本目录的入口，不再展示旧规范。产品定位、身份账户、技术架构、安全隐私、NEXT 推荐和历史交付记录未撤下。未验收的报告 v2 工作副本不因本次归档获得验收；其分析机制只能在新报告合同和质量验证通过后复用。

另留存未提交的[37 报告质量修订工作副本](./37-report-answer-analysis-v2.md)及[ADR 0002](./adr/0002-evidence-grounded-answer-analysis.md)、[ADR 0003](./adr/0003-required-analysis-refinement.md)、[ADR 0004](./adr/0004-prebound-answer-analysis.md)。这四份原文逐字保留，清单标记为 `untracked-working-draft-not-accepted`；原路径也已改为历史指针，不能当作已验收功能说明。

## 怎样回溯

[manifest.json](./manifest.json) 记录来源提交、原路径、归档和原始正文的 SHA-256。正文只调整相对 Markdown 链接：同批归档文件互相引用，其他链接回到项目现有路径；09／10 的6处行末双空格换行等价转为 `<br>`，行号记录在清单。不改写旧设计内容。`scripts/check-design-archive.mjs` 可反向还原这两类格式调整并核对原始正文哈希。

09／25–30／32 来自来源提交；10／31 还包含归档前工作区已有的报告 v2 修订说明，清单用 `hadUncommittedChanges` 单独标记。这些说明留存原貌，不表示其中的实现或验收宣称已被本次确认。

已发布 `content/*/1.0.0`、执行过的迁移、学生作答、历史报告和数据库不因文档归档而删除或改写。这里不是数据库备份，也不是回滚运行程序的开关。
