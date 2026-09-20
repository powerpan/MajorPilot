# MajorPilot MVP 信息收集与推荐规则设计

> 状态：详细设计修订稿 v0.2  
> 更新日期：2026-09-20  
> 适用范围：首次信息收集、首个专业推荐、改选和下一专业推荐  
> 关联文档：[产品定义](./01-mvp-product-definition.md) · [信息架构](./02-mvp-information-architecture.md) · [领域模型](./06-domain-model-and-data-boundaries.md) · [领域语言](../CONTEXT.md)

## 1. 设计目标

信息收集需要在 3–5 分钟内完成，并同时服务于：

- 产生第一次专业体验的透明建议；
- 生成不过度推断的推荐解释；
- 决定任务中需要提供的基础说明；
- 支持后续产品分析；
- 避免采集成绩单、GPA、简历等当前不必要的敏感材料。

推荐结果表示“先体验哪个专业最有信息价值”，不表示“最适合哪个专业”。

## 2. 问卷版本与提交规则

- 每次完整提交形成一个不可覆盖的 Decision Profile；
- 问卷内容、选项和字段含义使用独立版本号；
- 注册前按步骤自动保存到 Intake Session；
- 修改已提交信息并重新推荐时创建新的 Decision Profile，不覆盖旧版本；
- 未提交草稿不能产生正式 Initial Recommendation；
- 自由文本不是推荐规则的直接输入，MVP 只用于解释上下文和产品研究；
- AI 不读取自由文本来改变规则推荐结果；
- 每个字段都需要有“为什么询问”的简短说明。

## 3. MVP 问卷字段

问卷共 12 个页面问题，其中 10 个必填、2 个可跳过。矩阵中的多个选项仍算一个页面问题。

| 序号 | 字段标识 | 页面问题 | 类型与选项 | 必填 | 主要用途 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `application_stage` | 你目前处于什么阶段？ | 探索方向／研究项目／准备申请／已经申请／持有录取结果 | 是 | 分析用户阶段和解释语气 |
| 2 | `target_intake_window` | 你预计何时开始硕士学习？ | 6个月内／6–12个月／12–24个月／24个月以后／不确定 | 是 | 判断决策紧迫度，不参与专业排序 |
| 3 | `target_regions` | 你主要考虑哪些地区？ | 香港／新加坡／英国，可多选 | 是 | 确认首批服务范围 |
| 4 | `current_field` | 你目前的学习或工作背景更接近哪一类？ | 计算机与工程／数学与统计／商科与经济／自然与生命科学／社科与人文／其他 | 是 | 调整术语说明，不作为专业门槛 |
| 5 | `current_field_text` | 如果愿意，可以补充你的具体专业或方向 | 最多80字自由文本 | 否 | 报告背景和研究分析，不进入排序 |
| 6 | `considered_majors` | 你目前正在考虑哪些方向？ | AI／Data Science／Business Analytics，可选1–3项 | 是 | 推荐优先级信号 |
| 7 | `major_familiarity` | 你对三个方向分别了解多少？ | 未了解／看过介绍／做过课程或小项目／有较多实践，三行矩阵 | 是 | 判断探索价值和解释深度 |
| 8 | `foundation_self_view` | 你如何描述当前基础？ | 编程、数学统计、数据分析、商业问题四行；未接触／入门／能完成基础任务／较熟悉 | 是 | 任务支持方式，不作为排除条件 |
| 9 | `scenario_preference` | 哪种工作情境最想先体验？ | 给三种中立情境排序，可并列，也可全部“同样想试” | 是 | 首要推荐信号；只有并列才使用辅助信号 |
| 10 | `work_elements` | 哪些工作环节更吸引你？ | 最多选3项：检查错误、调整实验、清理数据、解释图表、定义指标、提出行动、表达结论 | 是 | 次级推荐信号 |
| 11 | `decision_uncertainties` | 你最想通过体验弄清哪些问题？ | 最多选2项：日常工作、兴趣、学习难度、现有基础、专业差异、未来发展 | 是 | 推荐解释和报告关注点 |
| 12 | `main_question` / `acquisition_channel` | 还有什么困惑？你从哪里知道我们？ | 困惑最多300字，可跳过；来源含不愿回答 | 否／是 | 产品研究和渠道分析，不进入排序 |

第 12 页可以同时容纳两个短字段，但不得因为渠道字段阻止用户获得推荐；“不愿回答”是有效提交值。

## 4. 中立情境文案

问卷不得直接用“你喜欢 AI 吗”作为主要信号。三种情境使用同等长度和吸引力的描述：

- **改进模型行为**：检查一个系统为什么判断错误，调整有限规则或示例，再比较变化；
- **用数据检验判断**：整理一组不完美的数据，寻找关系，并说明哪些结论不能确定；
- **把指标变化转成行动**：拆解业务指标的变化，找到优先问题，并提出可验证的行动。

展示顺序在一次问卷中保持稳定，但可以按问卷版本平衡三项的长期展示顺序。不能根据用户背景隐藏其中某项。

## 5. Initial Recommendation 规则

### 5.1 排序原则

三个 Major 使用相同的分层比较规则，不计算或展示“适配度总分”：

1. `scenario_preference` 的 rank 升序；每个 Major 恰好一次，rank 使用从1开始的连续整数，允许 `[1,1,2]`、`[1,2,2]`、`[1,1,1]`，不允许缺项或 `[1,3,3]`；
2. rank 相同，优先 `considered_majors` 中的方向；
3. 仍相同，先按已选 `work_elements` 的“强”关联项数降序，再按“中”关联项数降序；弱关联不计数、不加负分；
4. 仍相同且候选均在考虑范围，按 familiarity 从未了解(0)到较多实践(3)升序；不在考虑范围的方向这一键统一为4，不用陌生程度挤占明确偏好；
5. 完全相同使用本规则版本固定顺序：Data Science → AI → Business Analytics。

规则采用字典序 tuple `(rank, considered?0:1, -strongCount, -mediumCount, explorationOrder, fixedOrder)`，不使用模糊的“接近”阈值，不把信号相加成能力分数。严格首选永远优先于辅助信息；第二、三名也按相同规则排序。初始最高 rank 组有多个 Major 时 `tieDetected=true`，记录选出第一名实际用到的最后一个比较键。此算法已由用户确认：允许并列，辅助信息仅用于打破平局。

`work_elements` 至少1项、最多3项，`decision_uncertainties` 至少1项、最多2项；重复值和未声明枚举拒绝。服务端重新计算所有排序键，不接受客户端提交分数、排名结果或理由代码。内部字段只表达“体验优先级”，不使用 `fit_score`、`suitability`。

### 5.2 工作环节映射

| 工作环节 | AI | Data Science | Business Analytics |
| --- | ---: | ---: | ---: |
| 检查错误 | 强 | 中 | 弱 |
| 调整实验 | 强 | 中 | 中 |
| 清理数据 | 弱 | 强 | 中 |
| 解释图表 | 中 | 强 | 强 |
| 定义指标 | 弱 | 中 | 强 |
| 提出行动 | 中 | 中 | 强 |
| 表达结论 | 中 | 强 | 强 |

“强／中／弱”只用于确定工作环节与体验内容的相关程度，不代表学生能力或专业价值。

### 5.3 不参与排序的字段

以下字段不能降低某个 Major 的推荐优先级：

- 本科或当前专业类别；
- 编程基础；
- 数学统计基础；
- 商业知识基础；
- 申请阶段和目标时间；
- 获客渠道；
- 自由文本中的措辞。

这些信息可以用于说明“任务会提供哪些支持”以及报告中的背景边界。基础较弱不等于不适合体验。

## 6. Recommendation Reason

规则输出使用白名单 Reason Code。首版至少包括：

| Reason Code | 用户可见含义 |
| --- | --- |
| `SCENARIO_FIRST_AI` | 最想先体验检查和改进模型行为 |
| `SCENARIO_FIRST_DS` | 最想先体验用数据检验判断 |
| `SCENARIO_FIRST_BA` | 最想先体验把指标变化转成行动 |
| `SCENARIO_TIED` | 把这个方向与其他情境列为同等优先 |
| `CURRENTLY_CONSIDERING` | 已经把该方向列入考虑范围 |
| `WORK_STYLE_ALIGNMENT` | 选择的工作环节与该体验内容重合较多 |
| `HIGH_EXPLORATION_VALUE` | 正在考虑但目前了解较少，先体验有助于减少未知 |
| `TIE_BREAK_BASELINE` | 多个方向信号接近，先建立一个可比较的体验基准 |
| `EXPERIENCE_ORDER_ONLY` | 本建议只安排尝试顺序，不是适配判断，可自由改选 |

页面显示 2–4 条说明，并标记 `reasonType=RANKING/CONTEXT/BOUNDARY`，不把背景说明冒充改变排名的依据。第一条是唯一首选对应的 SCENARIO_FIRST，或并列时的 SCENARIO_TIED；若并列，用实际决定第一名的键追加 CURRENTLY_CONSIDERING／WORK_STYLE_ALIGNMENT／HIGH_EXPLORATION_VALUE／TIE_BREAK_BASELINE。最多再选一条真实且不重复的考虑范围或工作环节 CONTEXT；最后固定 EXPERIENCE_ORDER_ONLY（BOUNDARY）。不满足某条理由前提时不得凑数：只有一个排序理由时用它加边界说明达到两条。AI 只能润色这些白名单说明，不能添加人格、天赋、职业成功或录取概率判断。

## 7. 推荐输出结构

一次 Initial Recommendation 至少产生：

- 主推荐 Major；
- 另外两个 Major 的稳定顺序；
- 2–4 个带 reasonType 的 Recommendation Reason（包含1条边界说明，不要求虚构多个排序原因）；
- 三个 Major 的简短差异；
- 基础支持说明；
- 规则版本、问卷版本和解释版本；
- 生成时间；
- 是否存在平局及使用的平局规则。

注册前页面显示真实主推荐和核心理由。完整规则明细保存在后端，不把内部排序数据伪装成精确科学结论。

## 8. Override 设计

学生注册后可以选择主推荐以外的任意 Major。Override 不需要审批，也不降低后续服务质量。

可以自愿询问改选原因：

- 本来就更想先体验另一个方向；
- 想先体验更熟悉的方向；
- 想先体验最陌生的方向；
- 时间或任务形式更合适；
- 其他；
- 不愿回答。

改选原因用于产品分析，不能在报告中被解释为专业偏好证据，除非学生在 Reflection 中再次明确表达。

## 9. Next Recommendation 规则

完成一个 Major Experience 后只在尚未 Closed 的其他 Major 中推荐下一项；READY／PAUSED 的已有运行是“继续”候选，不创建第二次体验。规则只读取本次关闭时固定的 profile、完成集合和 `09` 定义的 Reflection `next_work_style`；AI 追问和自由文本不能改变排序。

1. 无候选：返回 `ALL_COMPLETED`，不产生虚构的下一专业；
2. 只有一个候选：推荐它，理由 `ONLY_REMAINING`；
3. `next_work_style` 明确映射到候选时优先它，理由 `EXPLICIT_NEXT_STYLE`；
4. 无明确选择、跳过或指向已完成方向时，按下表相邻默认路径，理由 `ADJACENT_BASELINE`；
5. 默认路径已完成时使用剩余候选；如有多个并列候选，按初始规则固定顺序 DS → AI → BA。

`decision_uncertainties` 的“兴趣／学习难度”等没有天然唯一专业映射，只影响解释关注点，不参与 NEXT 排序。建议记录生成时的完成集合、source Run、profile、反思字段与规则版本。新的体验完成产生新的 NEXT，不能覆盖前一份报告所引用的旧建议。

主要比较路径：

| 已完成 | 希望继续验证 | 建议下一项 |
| --- | --- | --- |
| AI | 数据推理、统计和不确定性 | Data Science |
| AI | 指标、业务判断和行动 | Business Analytics |
| Data Science | 模型行为、错误模式和迭代 | AI |
| Data Science | 指标决策和行动设计 | Business Analytics |
| Business Analytics | 数据清理、统计关系和不确定性 | Data Science |
| Business Analytics | 模型实验和错误分析 | AI |

如果 Reflection 没有足够信号，默认先推荐相邻路径：AI → Data Science、Data Science → Business Analytics、Business Analytics → Data Science。学生仍可自由改选。

工作方式枚举为 `MODEL_ITERATION`→AI、`DATA_REASONING`→DS、`BUSINESS_ACTION`→BA、`UNSURE`／跳过→默认路径。已完成项不重新推荐。暂不可用专业仍可展示方向说明，但推荐结果必须返回 `availability=UNAVAILABLE`，不能静默更换规则第一名；同时列出可开始的替代项。已有 Paused Run 只要固定资产可用，即使版本已退役也可继续。只有候选全部完成才用 ALL_COMPLETED，不把暂不可用解释成已完成。

## 10. 版本和重新推荐

- 每次推荐绑定一个 Decision Profile；
- 修改信息后重新推荐会产生新记录，不覆盖历史；
- 已经开始的 Experience Run 不因重新推荐而切换 Major 或 Task Version；
- 旧 Experience Report 保持生成时使用的背景和证据快照；
- 最新推荐只影响尚未开始的体验入口；
- 推荐规则升级不自动重算历史记录；
- 内部分析比较推荐效果时必须按规则版本分组。

## 11. 边界场景

| 场景 | 处理 |
| --- | --- |
| 只考虑一个 Major | 可以推荐该 Major；仍展示另外两个方向的差异 |
| 三个情境完全并列 | 使用考虑范围、工作环节、探索价值和版本化平局顺序 |
| 编程和数学均为“未接触” | 不排除 AI 或 DS；明确任务提供模板和基础解释 |
| 背景与情境偏好看起来矛盾 | 以学生当前想体验的工作方式为优先，不用背景纠正偏好 |
| 自由文本写了另一个专业 | 不改变三项规则排序；用于后续产品研究 |
| AI 解释失败 | 仍显示规则生成的结构化理由，不阻止注册和开始体验 |
| 用户返回修改草稿 | 未提交前更新同一个 Intake Session；提交后创建新 Decision Profile |
| 重复提交 | 返回同一推荐结果，不重复产生相互冲突记录 |

## 12. 验收条件

1. 完成 10 个必填问题的典型用户可在 3–5 分钟内提交；
2. 相同问卷版本、规则版本和答案得到相同主推荐及理由代码；
3. 调整自由文本不会改变主推荐；
4. 单独降低编程或数学自评不会自动把 AI 或 DS 排到最后；
5. 推荐页在注册前显示真实结果；
6. AI 服务不可用时仍能显示结构化推荐理由；
7. Override 后保存推荐项、实际选择和可选原因；
8. 修改信息重新推荐不会改变已经开始的体验；
9. 内部分析能够按问卷版本和规则版本比较推荐接受率；
10. 页面和报告中不存在适配度总分、人格标签或录取概率。

## 13. 推荐黄金样例与反例

缩写 AI／DS／BA 分别对应正式 Major code；rank 按 AI、DS、BA 顺序列出。未特别说明时 considered 为全部、familiarity 均为1。以下是设计预期值，须在 P1 转为同值自动测试，不能把本表当应用测试已通过。

| ID | rank | considered（覆盖默认时） | work_elements | familiarity（AI,DS,BA） | 预期顺序 | 第一名决定键 |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | 1,2,3 | BA | 定义指标 | 3,0,0 | AI,DS,BA | rank |
| I02 | 1,1,2 | DS | 检查错误 | 1,1,1 | DS,AI,BA | considered |
| I03 | 1,1,1 | 全部 | 检查错误、调整实验 | 1,1,1 | AI,DS,BA | strongCount |
| I04 | 1,1,1 | 全部 | 清理数据、表达结论 | 1,1,1 | DS,BA,AI | strongCount |
| I05 | 1,1,1 | 全部 | 定义指标、提出行动 | 1,1,1 | BA,DS,AI | strongCount |
| I06 | 1,1,1 | 全部 | 表达结论 | 1,3,0 | BA,DS,AI | familiarity |
| I07 | 1,1,1 | 全部 | 表达结论 | 1,1,1 | DS,BA,AI | fixedOrder |
| I08 | 1,1,1 | 全部 | 检查错误、清理数据 | 1,1,1 | DS,AI,BA | mediumCount |
| I09 | 1,2,2 | 全部 | 定义指标 | 1,1,1 | AI,BA,DS | rank |

负向样例：缺少 BA、重复 Major、rank 为1/3/3、work_elements 为空或4项都返回422；I01 更改渠道、自由文本、编程基础后顺序不变；I01 不能声称 CURRENTLY_CONSIDERING(AI)，其说明至少是 SCENARIO_FIRST_AI + EXPERIENCE_ORDER_ONLY。

| ID | 已完成集合／本次完成 | next_work_style | 预期 |
| --- | --- | --- | --- |
| N01 | AI／AI | BUSINESS_ACTION | BA，EXPLICIT_NEXT_STYLE |
| N02 | AI／AI | UNSURE | DS，ADJACENT_BASELINE |
| N03 | DS／DS | MODEL_ITERATION | AI，EXPLICIT_NEXT_STYLE |
| N04 | BA／BA | 跳过 | DS，ADJACENT_BASELINE |
| N05 | AI,DS／DS | MODEL_ITERATION | BA，ONLY_REMAINING |
| N06 | AI,BA／BA | BUSINESS_ACTION | DS，ONLY_REMAINING |
| N07 | AI,DS,BA／BA | UNSURE | ALL_COMPLETED，无 Recommendation |
| N08 | AI／AI，DS 已暂停 | DATA_REASONING | 继续同一个 DS Run，不新建 attempt |
| N09 | AI／AI，DS 无可用内容 | UNSURE | DS，availability=UNAVAILABLE；展示 BA 可选入口，不伪造改选 |
