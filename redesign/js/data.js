/* MajorPilot redesign — shared scenario data.
   ONE fictional problem (LumenLearn's completion drop) seen through three lenses.
   All three lenses MUST use these numbers; they are internally consistent:
   - Overall 28-day completion fell from 27.0% (cohorts 1–6) to 20.5% (cohorts 7–12).
   - BA: the biggest leak opened at "Active in week 1 → Started an assignment" (75% → 62.5%).
   - DS: about half the drop is mix (partner-channel signups rose from 25% to 50%);
         the other half is real (organic 30%→27%, partner 18%→14%).
   - AI: the help-request router misroutes content questions ("error in the formula")
         to Tech support, so stuck learners wait longer — one plausible contributor to the
         assignment-step leak. */
window.MP = window.MP || {};

MP.data = {
  company: { en: "LumenLearn", zh: "LumenLearn" },
  fictional: { en: "LumenLearn is a fictional online learning platform. All numbers are teaching data.", zh: "LumenLearn 是虚构的在线学习平台，所有数字均为教学数据。" },
  situation: {
    en: "LumenLearn's 28-day course completion rate dropped from 27.0% to 20.5%. The product lead wants to know what happened and what to do first.",
    zh: "LumenLearn 的 28 天课程完成率从 27.0% 降到 20.5%。产品负责人想知道发生了什么，以及应该先做什么。"
  },
  periods: {
    earlier: { en: "Cohorts 1–6", zh: "第 1–6 批", short: { en: "Earlier", zh: "前期" } },
    recent: { en: "Cohorts 7–12", zh: "第 7–12 批", short: { en: "Recent", zh: "近期" } }
  },

  /* ---------- BA: funnel (each learner observed 28 days after signup) ---------- */
  funnelSteps: [
    { id: "signup", en: "Signed up", zh: "报名" },
    { id: "lesson", en: "Started first lesson", zh: "开始首课" },
    { id: "week1", en: "Active in week 1", zh: "首周活跃" },
    { id: "assign", en: "Started an assignment", zh: "开始作业" },
    { id: "submit", en: "Submitted assignment", zh: "提交作业" },
    { id: "complete", en: "Completed course", zh: "完成课程" }
  ],
  funnel: {
    earlier: [4800, 3840, 2880, 2160, 1728, 1296],
    recent: [6000, 4680, 3276, 2048, 1640, 1230]
  },
  // One cohort signs up per week (so "per month" ≈ 4 cohorts). Lenses that plan tests use this cadence.
  cohortCadence: { perWeek: 1, en: "one cohort signs up each week", zh: "每周有一批学员报名" },
  // step-to-step conversion (%), derived: earlier 80/75/75/80/75 ; recent 78/70/62.5/80.1/75

  /* ---------- DS: per-cohort completion and channel mix ---------- */
  cohorts: [
    { n: 1, signups: 800, completed: 220, partnerShare: 0.24 },
    { n: 2, signups: 790, completed: 210, partnerShare: 0.25 },
    { n: 3, signups: 810, completed: 222, partnerShare: 0.25 },
    { n: 4, signups: 800, completed: 212, partnerShare: 0.25 },
    { n: 5, signups: 805, completed: 220, partnerShare: 0.25 },
    { n: 6, signups: 795, completed: 212, partnerShare: 0.26 },
    { n: 7, signups: 900, completed: 207, partnerShare: 0.40 },
    { n: 8, signups: 950, completed: 204, partnerShare: 0.45 },
    { n: 9, signups: 1000, completed: 205, partnerShare: 0.50 },
    { n: 10, signups: 1050, completed: 210, partnerShare: 0.52 },
    { n: 11, signups: 1050, completed: 199, partnerShare: 0.55 },
    { n: 12, signups: 1050, completed: 205, partnerShare: 0.56 }
  ],
  channels: {
    // signups / completed by acquisition channel
    earlier: { organic: { signups: 3600, completed: 1080 }, partner: { signups: 1200, completed: 216 } }, // 30% / 18%, total 27.0%
    recent: { organic: { signups: 3000, completed: 810 }, partner: { signups: 3000, completed: 420 } }    // 27% / 14%, total 20.5%
  },
  channelNames: { organic: { en: "Found us directly", zh: "自然来源" }, partner: { en: "Partner offer", zh: "合作渠道" } },
  // If recent cohorts had the earlier mix (75% organic): .75*27 + .25*14 = 23.75%  → mix explains ~3.25 of the 6.5-point drop.
  reweighted: 23.75,

  /* ---------- AI: help-request router ---------- */
  routes: [
    { id: "tech", en: "Tech support", zh: "技术支持" },
    { id: "content", en: "Course content (TA)", zh: "课程内容（助教）" },
    { id: "billing", en: "Billing", zh: "账单" },
    { id: "account", en: "Account", zh: "账户" }
  ],
  // evaluation set: 200 messages; router auto-handles those above a confidence threshold, the rest go to a person
  router: {
    baseline: { auto: 150, correct: 123, human: 50, errors: { contentToTech: 15, techToContent: 4, billingAccount: 5, other: 3 } },
    options: {
      examples: { auto: 152, correct: 134, human: 48, errors: { contentToTech: 5, techToContent: 7, billingAccount: 5, other: 1 } },
      threshold: { auto: 118, correct: 106, human: 82, errors: { contentToTech: 6, techToContent: 2, billingAccount: 3, other: 1 } },
      definition: { auto: 150, correct: 128, human: 50, errors: { contentToTech: 10, techToContent: 4, billingAccount: 5, other: 3 } }
    }
  },
  // sample misrouted messages (predicted → should be)
  misrouted: [
    { id: "M-014", en: "I keep getting an error in the formula for question 3 — what am I doing wrong?", zh: "第 3 题的公式一直报错，我哪里做错了？", pred: "tech", truth: "content" },
    { id: "M-027", en: "The assignment says my answer doesn't work but I followed the lesson.", zh: "作业说我的答案不对，但我是按课程做的。", pred: "tech", truth: "content" },
    { id: "M-031", en: "Video won't load on my phone since yesterday.", zh: "从昨天开始手机上视频加载不出来。", pred: "tech", truth: "tech" },
    { id: "M-042", en: "Can't figure out why my chart in step 4 looks broken.", zh: "不明白为什么第 4 步我的图表看起来是坏的。", pred: "tech", truth: "content" },
    { id: "M-058", en: "I was charged twice this month.", zh: "这个月被扣了两次费。", pred: "account", truth: "billing" },
    { id: "M-063", en: "Error: the example code from lesson 2 gives a different number than the video.", zh: "错误：第 2 课的示例代码算出的数和视频里不一样。", pred: "tech", truth: "content" },
    { id: "M-071", en: "How do I change the email on my profile?", zh: "怎么修改资料里的邮箱？", pred: "account", truth: "account" },
    { id: "M-088", en: "The quiz crashed when I submitted — did it save?", zh: "提交测验时页面崩了，保存了吗？", pred: "content", truth: "tech" }
  ]
};

/* ---------- glossary (use in copy as [[id]] or [[id|label]]) ---------- */
MP.glossary = {
  rate: { w: { en: "Conversion rate", zh: "转化率" }, def: { en: "Of the people who reached one step, the share who reached the next.", zh: "到达某一步的人中，继续到达下一步的比例。" } },
  denominator: { w: { en: "Denominator", zh: "分母" }, def: { en: "The group a percentage is “out of.” Change the group and the same count tells a different story.", zh: "比例的“基数”。换一个基数，同样的人数会讲出不同的故事。" } },
  cohort: { w: { en: "Cohort", zh: "批次" }, def: { en: "A group of learners who signed up in the same period and are followed for the same 28 days.", zh: "同一时期报名、并观察相同 28 天的一组学员。" } },
  funnel: { w: { en: "Funnel", zh: "漏斗" }, def: { en: "The sequence of steps a learner goes through, with how many make it to each step.", zh: "学员依次经过的步骤，以及每一步还剩多少人。" } },
  guardrail: { w: { en: "Guardrail metric", zh: "护栏指标" }, def: { en: "A number you watch to make sure your fix doesn't quietly break something else.", zh: "用来确认改动没有悄悄伤害其他方面的指标。" } },
  test: { w: { en: "Small test (A/B)", zh: "小范围试验（A/B）" }, def: { en: "Give the change to some learners and not others, then compare — so you learn whether it works before rolling it out.", zh: "只让一部分学员用新方案，与其他人比较，先弄清是否有效再推广。" } },
  mix: { w: { en: "Mix shift", zh: "构成变化" }, def: { en: "When the overall number moves because the kinds of people changed, not because anyone's behavior changed.", zh: "整体数字变化是因为人群构成变了，而不是每个人的行为变了。" } },
  noise: { w: { en: "Noise", zh: "随机波动" }, def: { en: "Ups and downs you'd expect by chance, even if nothing really changed.", zh: "即使什么都没变，也会因偶然出现的起伏。" } },
  confounder: { w: { en: "Confounder", zh: "混杂因素" }, def: { en: "Something else that changed at the same time and could explain the result.", zh: "同时发生、也可能解释结果的其他变化。" } },
  router: { w: { en: "Router (classifier)", zh: "分流器（分类器）" }, def: { en: "A model that reads a message and decides which team should handle it.", zh: "读取消息并决定交给哪个团队处理的模型。" } },
  threshold: { w: { en: "Confidence threshold", zh: "置信度阈值" }, def: { en: "How sure the model must be before it acts on its own; below it, a person decides.", zh: "模型要多有把握才自动处理；低于它就交给人工。" } },
  precision: { w: { en: "Auto-handled accuracy", zh: "自动处理准确率" }, def: { en: "Of the messages the model handled itself, the share it got right.", zh: "模型自己处理的消息中，分对的比例。" } },
  coverage: { w: { en: "Coverage", zh: "覆盖率" }, def: { en: "The share of all messages the model handles without a person.", zh: "所有消息中，无需人工、由模型处理的比例。" } },
  tradeoff: { w: { en: "Trade-off", zh: "取舍" }, def: { en: "Improving one thing at the cost of another — e.g., fewer mistakes but more human work.", zh: "以一方面为代价换取另一方面，例如错误更少但人工更多。" } }
};

/* ---------- lens identities (copy shared by home / explore / dashboard / brief) ----------
   zh questions carry \u200b (zero-width space) at phrase boundaries. Put class "lens-q" on any element
   showing a question: in zh it breaks only at punctuation and these hints, never inside a word. */
MP.lensInfo = {
  ba: {
    name: { en: "Business Analytics", zh: "商业分析" }, short: "BA",
    question: { en: "Which step should we fix first — and how will we know it worked?", zh: "应该先修哪一步？\u200b怎么知道改了有用？" },
    oneLine: { en: "Turn a drop in a number into one action you can test.", zh: "把一个指标的下降，变成一个可以验证的行动。" },
    handIn: { en: "A one-page recommendation with a small test", zh: "一页行动建议，附小范围试验" },
    done: { en: "A decision someone can act on, with its risk stated", zh: "一个能被执行的决定，并写明风险" },
    minutes: 15
  },
  ds: {
    name: { en: "Data Science", zh: "数据科学" }, short: "DS",
    question: { en: "Is the drop real — or did the mix of learners change?", zh: "下降是真的吗，\u200b还是学员构成变了？" },
    oneLine: { en: "Check how much of a story the data can actually support.", zh: "检查数据到底能支撑多大的结论。" },
    handIn: { en: "An evidence summary with what's still uncertain", zh: "一份证据小结，写明仍不确定的部分" },
    done: { en: "Evidence that's been checked, with its limits stated", zh: "经过检验的证据，并写明边界" },
    minutes: 15
  },
  ai: {
    name: { en: "Artificial Intelligence", zh: "人工智能" }, short: "AI",
    question: { en: "Why does the help router send stuck learners to the wrong team?", zh: "为什么求助分流器\u200b把卡住的学员\u200b分错了团队？" },
    oneLine: { en: "Find one kind of model mistake, change one thing, and weigh the cost.", zh: "找出一种模型错误，只改一处，再权衡代价。" },
    handIn: { en: "A model-change note: what improved, what it cost", zh: "一份模型改动说明：改善了什么、代价是什么" },
    done: { en: "A change you can defend, with its trade-off stated", zh: "一个说得清的改动，并写明取舍" },
    minutes: 15
  }
};
MP.lensOrder = ["ba", "ds", "ai"];

/* ---------- optional profile ("Tell us a bit more" on home, "About you" on the dashboard) ---------- */
MP.profileOptions = {
  stage: [
    { id: "undergrad", en: "In college", zh: "在读本科" },
    { id: "recent", en: "Recently graduated", zh: "刚毕业" },
    { id: "working", en: "Working", zh: "已工作" },
    { id: "exploring", en: "Just exploring", zh: "随便看看" }
  ],
  background: [
    { id: "business", en: "Business or economics", zh: "商科或经济" },
    { id: "technical", en: "Engineering, CS, or math", zh: "工科、计算机或数学" },
    { id: "social", en: "Social sciences or humanities", zh: "社科或人文" },
    { id: "other", en: "Something else", zh: "其他" }
  ],
  regions: [
    { id: "us", en: "United States", zh: "美国" },
    { id: "uk", en: "United Kingdom", zh: "英国" },
    { id: "eu", en: "Europe", zh: "欧洲" },
    { id: "ca", en: "Canada", zh: "加拿大" },
    { id: "au", en: "Australia", zh: "澳大利亚" },
    { id: "asia", en: "Hong Kong or Singapore", zh: "中国香港或新加坡" },
    { id: "open", en: "Not sure yet", zh: "还没想好" }
  ]
};
