/* MajorPilot redesign — HOME (#/home). Owned by the "front" builder.
   Pitch direction "Living data": the shared problem is the hero. The hero figure is drawn from MP.data
   (12 weekly cohorts → completion line → three lens beams), the Quick Start lights a beam, then: facts strip,
   the ink "shared problem" band (pull numbers + Fig. 2), three lens columns topped by their own data glyphs,
   Look · Try · Keep, a real Brief preview, and the ink trust close that runs into the colophon.
   Motion: the full hero intro plays once per session (#view.first, or MP.replay via the figure's Replay);
   later arrivals get core's short settle. Every base style is the final visible state (see front.css). */
(function () {
  "use strict";
  const t = (x) => MP.t(x);
  const h = MP.h;
  const LV = MP.live;
  const fill = (s, o) => Object.keys(o).reduce((a, k) => a.split("{" + k + "}").join(o[k]), s);
  const fx = (v) => (+v).toFixed(1);
  const f1 = (x) => MP.pct(x, 1), f0 = (x) => MP.pct(x, 0);
  const zh = () => MP.lang() === "zh";

  /* ---------------- copy ---------------- */
  const C = {
    eyebrow: { en: "Weighing a BA, DS or AI master's?", zh: "在考虑商业分析、数据科学\u200b或 AI 硕士？" },
    headA: { en: "See the work", zh: "别只看专业介绍，" },
    headB: { en: '<span class="it">before</span> <span class="nowrap">you choose</span> the degree.', zh: "先试试你会做什么。" },
    lede: {
      en: "Try a short slice of real work in each field, all on one shared, made-up problem.",
      zh: "在同一个虚构的业务问题上，亲手试做每个领域的一小段真实工作。"
    },
    checks: [{ en: "No sign-up", zh: "无需注册" }, { en: "No scores", zh: "不打分" }, { en: "About {n} min a lens", zh: "每个视角约 {n} 分钟" }],
    jump: { en: "Start in two questions", zh: "两个问题，马上开始" },
    jumpBack: { en: "See where you left off", zh: "看看上次停在哪里" },
    qsTitle: { en: "Quick start", zh: "快速开始" },
    qsMeta: { en: "Two questions · no sign-up", zh: "两个问题 · 无需注册" },
    q1: { en: "Which fields are you weighing?", zh: "你在考虑哪些方向？" },
    q1sub: { en: "Pick any that apply.", zh: "可以多选。" },
    q2: { en: "What do you want to find out?", zh: "你最想弄清楚什么？" },
    q2sub: { en: "Optional.", zh: "可选。" },
    notSure: { en: "Not sure yet", zh: "还没想好" },
    asks: {
      diff: { en: "What's the actual difference?", zh: "它们到底有什么不同？" },
      day: { en: "What would I do day to day?", zh: "每天具体会做什么？" },
      keep: { en: "Could I keep up?", zh: "我能跟得上吗？" },
      prep: { en: "What should I prepare?", zh: "我该提前准备什么？" }
    },
    startHere: { en: "Start here", zh: "从这里开始" },
    emptyLine: { en: "Pick a field and one of these lights up.", zh: "选一个方向，对应的那条线就会亮起来。" },
    emptySub: { en: "That's your suggested starting point. You can switch anytime.", zh: "那就是建议的起点，之后随时可以换。" },
    seeAll: { en: "See all three lenses first", zh: "先看看三个视角" },
    startLens: { en: "Start the {x} lens", zh: "开始 {x} 视角" },
    reviewLens: { en: "Look back at the {x} lens", zh: "回看 {x} 视角" },
    seeLenses: { en: "Compare the three lenses", zh: "比较三个视角" },
    allThree: { en: "All three, side by side", zh: "三个视角并排看" },
    reasons: {
      ai_only: { en: "You'll go through the messages a model got wrong, then change one thing: the everyday loop of applied AI.", zh: "你会逐条看模型分错的消息，然后只改动一处——这正是应用 AI 的日常循环。" },
      ai_mix: { en: "AI is the most hands-on of your picks. All three lenses share one problem, so switching later is easy.", zh: "在你选的方向里，AI 最需要动手。三个视角用的是同一个问题，之后切换很方便。" },
      ba_pair: { en: "BA starts with the plainest question (where do learners drop off?), and that makes the DS lens easier afterward.", zh: "BA 从最直接的问题入手：学员在哪一步流失。先做它，再做 DS 会更顺手。" },
      ds_pair: { en: "With a technical background, start by checking whether the drop is real. BA picks up from there.", zh: "你有技术背景，可以先检验这次下降是不是真的，再用 BA 接着往下做。" },
      ba_only: { en: "You'll find where learners slip away and pick one fix you can test: BA in miniature.", zh: "你会找到学员流失的环节，并选出一个可以验证的改进——这就是缩小版的 BA。" },
      ds_only: { en: "You'll check whether a worrying drop is real, or just a change in who signed up. That's the heart of DS.", zh: "你会检验一次令人担心的下降是真的，还是只是报名的人变了。这正是 DS 的核心。" },
      explore: { en: "No problem. See all three lenses on one page, then try the one that pulls you in.", zh: "没关系。先在一页里看看三个视角，再试最吸引你的那个。" }
    },
    tails: {
      diff: { en: "Then try a second lens on the same problem. The difference shows up fast.", zh: "做完再用同一个问题试另一个视角，差别一目了然。" },
      day: { en: "Each step is a small version of something people in this field do in a normal week.", zh: "每一步都是这个领域日常工作的缩小版。" },
      keep: { en: "Step 1 takes under a minute, and a hint is always one click away.", zh: "第一步不到一分钟，提示随时一键可看。" },
      prep: { en: "Your Brief will note what the work leaned on, so you know what to practice.", zh: "你的小结会记下这份工作用到了什么，方便你知道该准备什么。" }
    },
    wbTitle: { en: "Welcome back", zh: "欢迎回来" },
    wbMeta: { en: "Your work is saved on this device", zh: "你的进度已保存在本设备" },
    wbResume: { en: "You're {n} into the {x} lens.", zh: "你已在{x}视角​做了 {n} 步。" },
    wbOpened: { en: "You've opened the {x} lens.", zh: "你已打开​{x}视角。" },
    wbFinished: { en: "You've finished {list}.", zh: "你已完成 {list}。" },
    wbAll: { en: "You've finished all three lenses.", zh: "三个视角你都完成了。" },
    wbUpNext: { en: "Up next, step {i}: {x}", zh: "接下来是第 {i} 步：{x}" },
    wbNextLens: { en: "Next, the {x} lens asks:", zh: "接下来，{x}视角要回答：" },
    wbAllSub: { en: "Your Brief pulls all three together on one page.", zh: "你的小结把三个视角汇总在了一页里。" },
    wbLenses: { en: "Your lenses", zh: "你的视角" },
    wbDone: { en: "Finished", zh: "已完成" },
    wbPart: { en: "{a} of {b} steps", zh: "已做 {a}/{b} 步" },
    wbNew: { en: "Not started", zh: "未开始" },
    wbPick: { en: "Pick up where you left off", zh: "从上次停下的地方继续" },
    wbChange: { en: "Change my answers", zh: "修改我的回答" },
    wbBack: { en: "Back to my progress", zh: "回到我的进度" },
    more: { en: "Tell us a bit more", zh: "再多说一点" },
    moreSub: { en: "Optional. Helps us phrase suggestions.", zh: "可选，让建议更贴近你。" },
    moreNote: { en: "Nothing here limits what you can try. Change or clear it anytime.", zh: "这些不会限制你能试什么，随时可以修改或清空。" },
    stage: { en: "Where are you now?", zh: "你现在处在哪个阶段？" },
    stages: { undergrad: { en: "In college", zh: "在读本科" }, recent: { en: "Recently graduated", zh: "刚毕业" }, working: { en: "Working", zh: "已工作" }, exploring: { en: "Just exploring", zh: "随便看看" } },
    background: { en: "Your background", zh: "你的背景" },
    backgrounds: { business: { en: "Business or economics", zh: "商科或经济" }, technical: { en: "Engineering, CS, or math", zh: "工科、计算机或数学" }, social: { en: "Social sciences or humanities", zh: "社科或人文" }, other: { en: "Something else", zh: "其他" } },
    regions: { en: "Where might you study?", zh: "可能去哪里读？" },
    regionList: { us: { en: "United States", zh: "美国" }, uk: { en: "United Kingdom", zh: "英国" }, eu: { en: "Europe", zh: "欧洲" }, ca: { en: "Canada", zh: "加拿大" }, au: { en: "Australia", zh: "澳大利亚" }, asia: { en: "Hong Kong or Singapore", zh: "中国香港或新加坡" }, open: { en: "Not sure yet", zh: "还没想好" } },

    factsLabel: { en: "MajorPilot in four numbers", zh: "用四个数字看 MajorPilot" },
    facts: [
      { en: "shared, made-up problem", zh: "共同的虚构问题", u: { zh: "个" } },
      { en: "lenses on it: BA, DS and AI", zh: "视角：BA、DS 和 AI", u: { zh: "个" } },
      { en: "minutes or so a lens, and you can stop anytime", zh: "左右做完一个视角，随时可停", u: { zh: "分钟" } },
      { en: "fit scores or admission predictions", zh: "匹配分数与录取预测", u: { zh: "个" } }
    ],

    probKick: { en: "The shared problem", zh: "共同的问题" },
    probTitle: { en: "One number fell. <span class=\"it\">Nobody knows why yet.</span>", zh: "一个数字掉了，​还没人知道为什么。" },
    probBody: {
      en: "LumenLearn, a made-up online course platform, watched its 28-day completion rate slide. The product lead wants to know what happened, and what to do first.",
      zh: "LumenLearn 是一家虚构的在线课程平台，它的 28 天完成率一路下滑。产品负责人想知道发生了什么，以及应该先做什么。"
    },
    pullE: { en: "Cohorts 1–6 · earlier", zh: "第 1–6 批 · 前期" },
    pullR: { en: "Cohorts 7–12 · recent", zh: "第 7–12 批 · 近期" },
    pullAlt: { en: "28-day completion fell from {a} to {b}.", zh: "28 天完成率从 {a} 降到 {b}。" },
    fig2: { en: "Fig. 2 · Inside the 6.5 points", zh: "图 2 · 拆开这 6.5 个百分点" },
    fig2Pill: { en: "From the DS lens", zh: "来自 DS 视角" },
    brE: { en: "Earlier", zh: "前期" }, brR: { en: "Recent", zh: "近期" },
    brMix: { en: "Who signed up", zh: "报名人群变了" },
    brReal: { en: "Real drop", zh: "真实下降" },
    brMixS: { en: 'partner share <span class="nowrap">{a} → {b}</span>', zh: '合作渠道 <span class="nowrap">{a}→{b}</span>' },
    brRealS: { en: "both channels fell", zh: "两个渠道都降了" },
    brAxis: { en: "Axis starts at {v}", zh: "纵轴从 {v} 起" },
    brNote: { en: "Had recent cohorts kept the earlier mix, completion would be {w}. So about half the fall is a change in who signed up, and half is real, inside both channels. Nobody knows why yet.", zh: "如果近期批次保持前期的报名构成，完成率应是 {w}。所以大约一半的下降来自报名人群的变化，另一半是真实的，两个渠道里都有。原因还不知道。" },
    fig2Alt: { en: "Bridge chart: completion fell from {a} to {b}. {m} points come from a change in who signed up (partner share {p0} to {p1}); {r} points are a real drop within both channels. With the earlier mix, recent completion would be {w}.", zh: "桥形图：完成率从 {a} 降到 {b}。其中 {m} 个百分点来自报名人群的变化（合作渠道占比从 {p0} 升到 {p1}），{r} 个百分点是两个渠道内部的真实下降。按前期构成计算，近期完成率应为 {w}。" },
    askK: { en: "The product lead asks", zh: "产品负责人的问题" },
    ask: { en: "“What happened, and what should we do first?”", zh: "“发生了什么？我们应该先做什么<span class=\"zp\">？</span>”" },
    sideBySide: { en: "See the three lenses side by side", zh: "并排看看三个视角" },

    lensKick: { en: "Three ways in", zh: "三种切入方式" },
    lensTitle: { en: "One problem, <span class=\"it\">three lenses.</span>", zh: "同一个问题，​三种视角。" },
    lensAside: { en: "Each lens opens with its own slice of the same data.", zh: "每个视角都从同一份数据的不同切面入手。" },
    youHandIn: { en: "You'd hand in", zh: "你会交出" },
    tryLens: { en: "Try this lens", zh: "试试这个视角" },
    reviewShort: { en: "Look back at this lens", zh: "回看这个视角" },
    contShort: { en: "Continue this lens", zh: "继续这个视角" },

    howKick: { en: "How it works", zh: "怎么用" },
    howTitle: { en: "Three calm steps.", zh: "三个从容的步骤。" },
    howAside: { en: "Nothing is timed, and nothing is graded. Stop whenever you like.", zh: "不计时，也不打分，随时可以停下。" },
    how: [
      { w: { en: "Look", zh: "看" }, d: { en: "See the problem, and how each field would go about it, side by side.", zh: "并排看看这个问题，以及每个领域会怎么入手。" } },
      { w: { en: "Try", zh: "试" }, d: { en: "Do a short slice of the work in your browser. Practitioner notes appear as you go, never a grade.", zh: "直接在浏览器里做一小段真实工作。每做一步就能看到从业者的思路，从不打分。" } },
      { w: { en: "Keep", zh: "留" }, d: { en: "What you did becomes a one-page Brief to revisit, or to share with an advisor or family.", zh: "你做过的一切会整理成一页小结，可以回看，也可以给顾问或家人看。" } }
    ],
    keepKick: { en: "What you keep", zh: "你能留下什么" },
    keepTitle: { en: "A one-page Brief, built from what you actually did.", zh: "一页小结，​只写你真正做过的事。" },
    keepBody: { en: "Not a score. Your choices, what stood out to you, and an honest section on what a short try can't tell you.", zh: "不是分数，而是你的选择、让你印象深的地方，以及一段坦白的说明：短短一试说明不了什么。" },
    keepMine: { en: "Open my Brief", zh: "打开我的小结" },
    keepSee: { en: "See what a Brief looks like", zh: "看看小结长什么样" },
    bTitle: { en: "My Brief", zh: "我的小结" },
    bExample: { en: "Example", zh: "示例" },
    bYours: { en: "Yours · {n} lenses", zh: "你的 · {n} 个视角" },
    bYours1: { en: "Yours · 1 lens", zh: "你的 · 1 个视角" },
    bPage: { en: "One page", zh: "一页" },
    bShort: { en: "In short", zh: "简而言之" },
    bRows: [{ en: "What you did", zh: "你做了什么" }, { en: "What stood out to you", zh: "让你印象深的地方" }, { en: "What this can't tell you", zh: "这说明不了什么" }],
    bExBA: { en: "You traced the funnel and chose to fix “{a} → {b}” first ({c} → {d}).", zh: "你沿着漏斗查找，决定先改“{a} → {b}”（{c} → {d}）。" },
    bExDS: { en: "About half the {d}-point drop is a change in who signed up; the other half is real.", zh: "{d} 个百分点的下降，约一半来自报名人群的变化，另一半是真实的。" },
    bNext: { en: "Next: try the {x} lens on the same problem.", zh: "下一步：用同一个问题试试{x}视角。" },
    bNextAll: { en: "Next: share it with an advisor, or print it.", zh: "下一步：拿给顾问看看，或者打印出来。" },
    bAlt: { en: "Preview of a one-page Brief", zh: "一页小结的预览" },

    trustKick: { en: "Our promise", zh: "我们的承诺" },
    trust: [{ en: "No fit scores.", zh: "不打匹配分。" }, { en: "No admission predictions.", zh: "不预测录取。" }, { en: "You decide.", zh: "由你来决定。" }],
    trustSub: { en: "Your work saves on this device. An account is optional, and only for picking up on another one.", zh: "进度会保存在本设备上。账户是可选的，只用于在其他设备上继续。" }
  };
  MP.homeCopy = C;

  /* figure copy */
  const F = {
    fig: { en: "Fig. 1 · LumenLearn", zh: "图 1 · LumenLearn" },
    teach: { en: "Teaching data", zh: "教学数据" },
    replay: { en: "Replay", zh: "重播" },
    replayL: { en: "Replay the figure", zh: "重播这张图的动画" },
    readK: { en: "28-day course completion", zh: "28 天课程完成率" },
    readS: { en: "−{d} points across {n} weekly cohorts", zh: "{n} 个每周批次，下降 {d} 个百分点" },
    axisE: { en: "Cohorts 1–6", zh: "第 1–6 批" },
    axisR: { en: "7–12", zh: "第 7–12 批" },
    strip: { en: "Signups per cohort · partner offer in blue", zh: "每批报名人数 · 蓝色为合作渠道" },
    gap: { en: "−{d} pts", zh: "−{d}" },
    lvlE: { en: "earlier avg {v}", zh: "前期平均 {v}" },
    lvlR: { en: "recent avg {v}", zh: "近期平均 {v}" },
    nodes: {
      ba: { q: { en: "Where does the funnel leak?", zh: "漏斗在哪一步漏？" }, d: { en: "{n} steps · earlier vs recent", zh: "{n} 步 · 前后对比" } },
      ds: { q: { en: "A real drop, or a new mix?", zh: "真的下降，​还是人群变了？" }, d: { en: 'partner share <span class="nowrap">{a} → {b}</span>', zh: '合作渠道 <span class="nowrap">{a}→{b}</span>' } },
      ai: { q: { en: "Why are stuck learners misrouted?", zh: "卡住的学员​为什么被分错？" }, d: { en: "{n} help messages", zh: "{n} 条求助消息" } }
    },
    alt: {
      en: "Chart: LumenLearn's 28-day completion by weekly cohort, from {a} in cohort 1 to {b} in cohort 12; earlier cohorts averaged {e}, recent ones {r}. Partner-offer signups grew from {p0} to {p1} of each cohort. The line then splits into three lenses: Business Analytics asks where the funnel leaks, Data Science asks whether the drop is real or a change in who signed up, and AI asks why stuck learners' help requests are misrouted.",
      zh: "图表：LumenLearn 各周批次的 28 天完成率，从第 1 批的 {a} 降到第 12 批的 {b}；前期平均 {e}，近期 {r}。合作渠道报名占比从 {p0} 升到 {p1}。折线随后分成三个视角：商业分析问漏斗在哪一步漏，数据科学问下降是真的还是人群变了，AI 问卡住学员的求助为什么被分错。"
    }
  };

  /* ---------------- logic ---------------- */
  /** Returns {lens: "ba"|"ds"|"ai"|"explore"|null, why: key} from the quick start + optional background. */
  function recommend() {
    const f = MP.state.qs.fields || [];
    const tech = (MP.state.profile || {}).background === "technical";
    if (!f.length) return { lens: null };
    if (f.includes("none")) return { lens: "explore", why: "explore" };
    if (f.includes("ai")) return { lens: "ai", why: f.length > 1 ? "ai_mix" : "ai_only" };
    if (f.includes("ds") && f.includes("ba")) return tech ? { lens: "ds", why: "ds_pair" } : { lens: "ba", why: "ba_pair" };
    if (f.includes("ds")) return { lens: "ds", why: "ds_only" };
    return { lens: "ba", why: "ba_only" };
  }
  function syncRecommended() {
    const r = recommend();
    MP.state.recommended = r.lens && r.lens !== "explore" ? r.lens : "";
  }
  MP.homeRecommend = recommend;
  const picked = () => (MP.state.qs.fields || []).filter((x) => MP.lensInfo[x]);
  const anyStarted = () => MP.lensOrder.some((id) => MP.lenses[id] && MP.progress(id).started);
  const lensName = (id) => (zh() ? t(MP.lensInfo[id].name) : MP.lensInfo[id].short);

  /* ================= the instrument: drawn from MP.data =================
     layout "row" (desktop hero: line → beams to the right, with the signups strip) or "mini" (phones: compact).
     o: {pick: [ids], rec: id, names: true (node shows the lens name instead of the question), levels: true (period
     averages labelled), strip: false}. Text sits in HTML positioned in % of the same aspect box, so it stays ≥13px
     whatever the figure's rendered width. */
  const GEO = {
    row: { W: 680, H: 384, cx0: 10, cx1: 372, yHi: 26, yLo: 246, ex: 452, ys: [44, 180, 316], c1: 48, c2: 44, fan: 12, dot: 3.4, last: 5.2, nl: 18, strip: true },
    mini: { W: 360, H: 196, cx0: 6, cx1: 186, yHi: 14, yLo: 150, ex: 230, ys: [30, 98, 166], c1: 26, c2: 22, fan: 7, dot: 2.6, last: 4, nl: 14, strip: false }
  };
  function instrument(layout, o) {
    o = o || {};
    const g = GEO[layout], pk = o.pick || [], rec = o.rec || "";
    const beamCls = (id) => (pk.includes(id) ? " on" : "") + (rec === id ? " rec" : "");
    const R = LV.rates, n = R.length, W = g.W, H = g.H;
    const X = (i) => g.cx0 + i * (g.cx1 - g.cx0) / (n - 1);
    const Y = (r) => g.yLo - (r - 0.17) / 0.12 * (g.yLo - g.yHi);
    const xd = (X(5) + X(6)) / 2, mE = Y(LV.earlier), mR = Y(LV.recent);
    const sx = X(n - 1), sy = Y(R[n - 1]);
    const id0 = "hf-" + layout + (o.key || "");
    const pct = (v) => fx(v * 100);
    const lab = (x, y, cls, html) => `<span class="hf-t ${cls}" style="left:${pct(x / W)}%;top:${pct(y / H)}%">${html}</span>`;
    const out = [];
    const off = fx((xd - g.cx0) / (g.cx1 - g.cx0));
    out.push(`<svg class="hf-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs>`);
    out.push(`<pattern id="${id0}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hf-hatch"/></pattern>`);
    out.push(`<linearGradient id="${id0}-ink" gradientUnits="userSpaceOnUse" x1="${fx(g.cx0)}" x2="${fx(g.cx1)}" y1="0" y2="0"><stop offset="${off}" style="stop-color:var(--ink)"/><stop offset="${off}" style="stop-color:var(--orange)"/></linearGradient>`);
    MP.lensOrder.forEach((id, k) => {
      out.push(`<linearGradient id="${id0}-fan-${id}" gradientUnits="userSpaceOnUse" x1="${fx(sx)}" y1="0" x2="${g.ex}" y2="0"><stop offset="0" style="stop-color:var(--${id});stop-opacity:0"/><stop offset="1" style="stop-color:var(--${id});stop-opacity:.13"/></linearGradient>`);
    });
    out.push(`</defs>`);
    const labels = [];
    // grid + its labels
    [0.25, 0.2].forEach((v, k) => {
      const y = Y(v);
      out.push(`<line class="hf-gl" style="--i:${k}" x1="0" x2="${fx(g.cx1 + 8)}" y1="${fx(y)}" y2="${fx(y)}"/>`);
      if (layout === "row") labels.push(lab(0, y, "gt", MP.pct(v, 0)));
    });
    out.push(`<line class="hf-div" x1="${fx(xd)}" x2="${fx(xd)}" y1="${g.yHi - 10}" y2="${g.strip && o.strip !== false ? H - 26 : g.yLo + 6}"/>`);
    // the gap: what the recent cohorts lost against the earlier level (hatched)
    const gap = [[X(5), mE]].concat(R.slice(5).map((r, j) => [X(5 + j), Y(r)])).concat([[X(11), mE]]);
    out.push(`<polygon class="hf-gap" fill="url(#${id0}-hatch)" points="${gap.map((p) => fx(p[0]) + "," + fx(p[1])).join(" ")}"/>`);
    out.push(`<line class="hf-mean e" x1="${fx(X(0) - 6)}" x2="${fx(X(5))}" y1="${fx(mE)}" y2="${fx(mE)}"/><line class="hf-mean e2" x1="${fx(X(5))}" x2="${fx(X(11) + 6)}" y1="${fx(mE)}" y2="${fx(mE)}"/>`);
    out.push(`<line class="hf-mean r" x1="${fx(X(6) - 6)}" x2="${fx(X(11) + 6)}" y1="${fx(mR)}" y2="${fx(mR)}"/>`);
    const gx = (X(8) + X(9)) / 2, gy = (mE + Y((R[8] + R[9]) / 2)) / 2;
    labels.push(lab(gx, gy, "gap", fill(t(F.gap), { d: MP.n(LV.drop, 1) })));
    if (o.levels) {
      labels.push(lab(X(6) + 6, mE - 8, "lvl e", fill(t(F.lvlE), { v: f1(LV.earlier) })));
      labels.push(lab(X(6) - 14, mR, "lvl r", fill(t(F.lvlR), { v: f1(LV.recent) })));
    }
    if (layout === "row") {
      labels.push(lab(X(0), g.yLo + 14, "ax", t(F.axisE)));
      labels.push(lab(X(6), g.yLo + 14, "ax", t(F.axisR)));
    }
    // signups strip (desktop)
    if (g.strip && o.strip !== false) {
      const base = H - 30, mh = 54;
      MP.data.cohorts.forEach((c, i) => {
        const hh = c.signups / LV.maxSignups * mh, hp = hh * c.partnerShare;
        out.push(`<g class="hf-col" style="--i:${i}"><rect class="o" x="${fx(X(i) - 9)}" y="${fx(base - hh)}" width="18" height="${fx(hh - hp - 1.5)}" rx="1"/><rect class="p" x="${fx(X(i) - 9)}" y="${fx(base - hp)}" width="18" height="${fx(hp)}" rx="1"/></g>`);
      });
      labels.push(lab(0, H - 2, "ax strip", t(F.strip)));
    }
    // the three lens beams (under the line, so the split point sits on top)
    MP.lensOrder.forEach((id, k) => {
      const ex = g.ex, ey = g.ys[k];
      const p = `M${fx(sx)},${fx(sy)} C${fx(sx + g.c1)},${fx(sy)} ${fx(ex - g.c2)},${ey} ${ex},${ey}`;
      const fan = `M${fx(sx)},${fx(sy)} C${fx(sx + g.c1)},${fx(sy)} ${fx(ex - g.c2)},${ey - g.fan - 3} ${ex},${ey - g.fan} L${ex},${ey + g.fan} C${fx(ex - g.c2)},${ey + g.fan + 3} ${fx(sx + g.c1)},${fx(sy)} ${fx(sx)},${fx(sy)}Z`;
      out.push(`<g class="hf-bm ${id}${beamCls(id)}" data-rd-src="hm-beam-${id}" style="--k:${k}"><path class="fan" fill="url(#${id0}-fan-${id})" d="${fan}"/><path class="beam" pathLength="1" d="${p}"/><path class="pulse" pathLength="1" d="${p}"/><circle class="halo" cx="${ex}" cy="${ey}" r="${layout === "row" ? 12 : 9}"/><circle class="node" cx="${ex}" cy="${ey}" r="${layout === "row" ? 6 : 4.6}"/></g>`);
    });
    // the completion line + dots
    const d = R.map((r, i) => (i ? "L" : "M") + fx(X(i)) + "," + fx(Y(r))).join(" ");
    out.push(`<path class="hf-line" style="stroke:url(#${id0}-ink)" pathLength="1" d="${d}"/>`);
    R.forEach((r, i) => out.push(`<circle class="hf-dot${i > 5 ? " r" : ""}${i === n - 1 ? " last" : ""}" style="--i:${i}" cx="${fx(X(i))}" cy="${fx(Y(r))}" r="${i === n - 1 ? g.last : g.dot}"/>`));
    out.push(`<circle class="hf-split" cx="${fx(sx)}" cy="${fx(sy)}" r="${layout === "row" ? 11 : 8}"/>`);
    out.push(`</svg>`);
    // beam-end labels
    MP.lensOrder.forEach((id, k) => {
      const ey = g.ys[k], N = F.nodes[id], info = MP.lensInfo[id];
      const dl = id === "ba" ? fill(t(N.d), { n: MP.n(MP.data.funnelSteps.length) }) : id === "ds" ? fill(t(N.d), { a: f0(LV.partner[0]), b: f0(LV.partner[1]) }) : fill(t(N.d), { n: MP.n(LV.routerTotal) });
      const body = o.names || layout === "mini" ? `<span class="hf-node-n">${t(info.name)}</span>` : `<span class="hf-node-q lens-q">${t(N.q)}</span><span class="hf-node-d">${dl}</span>`;
      labels.push(`<div class="hf-node ${id}${beamCls(id)}" style="left:${pct((g.ex + g.nl) / W)}%;top:${pct(ey / H)}%;--k:${k}"><span class="hf-node-k"><i></i>${info.short}</span>${body}</div>`);
    });
    return `<div class="hf-box ${layout}" style="aspect-ratio:${W}/${H}">${out.join("")}${labels.join("")}</div>`;
  }
  function figAlt() {
    return fill(t(F.alt), { a: f1(LV.rates[0]), b: f1(LV.rates[11]), e: f1(LV.earlier), r: f1(LV.recent), p0: f0(LV.partner[0]), p1: f0(LV.partner[1]) });
  }
  const ARROW = '<svg class="ar" viewBox="0 0 32 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1,10 H30 M23,3 L30,10 L23,17"/></svg>';
  /** Shared with Explore (MP.front.instrument / readout). */
  MP.front = {
    instrument, figAlt, F,
    readout(intro, cls) {
      const cnt = (from, d, dur) => (intro ? ` data-ld-count${from != null ? ` data-ld-from="${from}"` : ""} data-ld-delay="${d}" data-ld-dur="${dur}"` : "");
      return `<div class="hf-read ${cls || ""}"><span class="ld-label">${t(F.readK)}</span>
        <div class="ld-readout hf-readout"><span${cnt(null, 100, 600)}>${f1(LV.earlier)}</span>${ARROW}<span class="sr-only">${t({ en: " to ", zh: " 降至 " })}</span><em${cnt((LV.earlier * 100).toFixed(1), 500, 900)}>${f1(LV.recent)}</em></div>
        <span class="hf-read-s">${fill(t(F.readS), { d: MP.n(LV.drop, 1), n: MP.n(MP.data.cohorts.length) })}</span></div>`;
    }
  };

  let lastPick = null, arrT = 0, replayNext = false;
  function heroFigure(intro) {
    // returning student (welcome-back panel showing): light the beam the panel's one primary points at
    const back = anyStarted() && !editing, ns = back ? MP.nextStep() : null;
    const pk = back ? (ns ? [ns.lens] : MP.lensOrder.slice()) : picked();
    const rec = back ? (ns ? ns.lens : "") : recommend().lens || "";
    const key = pk.join(",") + "|" + rec, changed = lastPick !== null && key !== lastPick;
    lastPick = key;
    const pt = -((performance.now() - arrT) / 1000);
    return `<figure class="hf hm-fig${pk.length ? " has-pick" : ""}${changed ? " just" : ""}" style="--pt:${pt.toFixed(2)}s">
      <div class="ld-cap"><span class="ld-label">${h.capLabel(t(F.fig))}</span><span class="hf-cap-r">${LV.motionOK() ? `<button type="button" class="hf-replay" data-action="home-replay" data-fk="home-replay" aria-label="${h.esc(t(F.replayL))}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/></svg><span>${t(F.replay)}</span></button>` : ""}<span class="ld-pill">${t(F.teach)}</span></span></div>
      <div class="hf-body" role="img" aria-label="${h.esc(figAlt())}">
        ${MP.front.readout(intro)}
        ${instrument("row", { pick: pk, rec })}${instrument("mini", { pick: pk, rec })}
      </div>
    </figure>`;
  }

  /* ================= AI-7 · Quick Start "in your own words" (AI-LAYER.md §2 AI-7) =================
     No model: the student's sentence is read by deterministic rules (lexicons per lens, worry markers, negation,
     interest verbs), then PRESENTED through the shared kit (MP.ai.block: reading trace that names their phrases and
     lights the beam each one points to, natural-pace streaming, their own words quoted back).
     Upstream rule (MajorPilot doc 08): free text NEVER changes the ranking. Q1 picks decide MP.state.recommended exactly
     as before; the words only rewrite the reason as context, or (Q1 empty / Not sure) say which way they lean and
     outline that Q1 option. Nothing is auto-checked. The text is private: MP.state.qs.text (draft) / qs.said (what was
     read) stay on this device and never reach the Brief, Advisor/Family or Program views. */
  const S7 = {
    label: { en: "Or say it in your own words", zh: "或者用你自己的话说" },
    sub: { en: "Optional · stays on this device", zh: "可选 · 只保存在本设备" },
    hint: { en: "Read when you press Enter or leave the box", zh: "按回车或离开输入框时读取" },
    go: { en: "Read my words", zh: "读一读我的话" },
    ph: [
      { en: "e.g. I like economics but I'm not sure I can code", zh: "比如：我学经济，但不确定自己会不会写代码" },
      { en: "e.g. I'm curious why numbers change, and I like research", zh: "比如：想做跟产品决策有关的工作" },
      { en: "e.g. AI sounds exciting, but is the math hard?", zh: "比如：对 AI 很心动，但担心数学跟不上" }
    ],
    fromWords: { en: "From your words", zh: "从你的话里" },
    yourWords: (R) => ({ en: `Your words · ${R.words} ${R.words === 1 ? "word" : "words"}`, zh: `你的话 · ${R.words} ${R.zh ? "字" : "个词"}` }),
    boundary: { en: "Where your words point, not a fit score. All three stay open.", zh: "这只是你的话指向的方向，不是匹配分。三个视角都可以试。" },
    wbK: { en: "Since you started", zh: "开始以来" }
  };
  /* lexicons: [word, lens, weight] — weight 2 = a phrase. en matched on word boundaries, zh as substrings. */
  const LEX = [
    // AI
    ["machine learning", "ai", 2], ["deep learning", "ai", 2], ["artificial intelligence", "ai", 2], ["neural network", "ai", 2], ["neural networks", "ai", 2], ["build models", "ai", 2], ["computer vision", "ai", 2],
    ["model", "ai", 1], ["models", "ai", 1], ["ML", "ai", 1], ["LLM", "ai", 1], ["LLMs", "ai", 1], ["chatbot", "ai", 1], ["chatbots", "ai", 1], ["neural", "ai", 1], ["automate", "ai", 1], ["automation", "ai", 1], ["AI", "ai", 1], ["NLP", "ai", 1], ["GPT", "ai", 1], ["algorithm", "ai", 1], ["algorithms", "ai", 1],
    ["机器学习", "ai", 2], ["深度学习", "ai", 2], ["人工智能", "ai", 2], ["神经网络", "ai", 2], ["大模型", "ai", 2], ["聊天机器人", "ai", 2], ["模型", "ai", 1], ["算法", "ai", 1], ["自动化", "ai", 1],
    // DS
    ["why numbers change", "ds", 2], ["data science", "ds", 2], ["figuring out why", "ds", 2], ["cause and effect", "ds", 2], ["data analysis", "ds", 2],
    ["statistics", "ds", 1], ["stats", "ds", 1], ["statistical", "ds", 1], ["data", "ds", 1], ["experiment", "ds", 1], ["experiments", "ds", 1], ["causal", "ds", 1], ["causality", "ds", 1], ["uncertainty", "ds", 1], ["research", "ds", 1], ["evidence", "ds", 1], ["hypothesis", "ds", 1], ["patterns", "ds", 1],
    ["数据科学", "ds", 2], ["为什么会变", "ds", 2], ["统计", "ds", 1], ["数据", "ds", 1], ["实验", "ds", 1], ["因果", "ds", 1], ["波动", "ds", 1], ["研究", "ds", 1], ["规律", "ds", 1],
    // BA
    ["product decisions", "ba", 2], ["make decisions", "ba", 2], ["business analytics", "ba", 2], ["product manager", "ba", 2], ["help people decide", "ba", 2],
    ["drop off", "ba", 2], ["drop-off", "ba", 2], ["drops off", "ba", 2], ["take off", "ba", 2], ["takes off", "ba", 2], ["what a team should change", "ba", 2], ["what to change", "ba", 2], ["should change", "ba", 2], ["user behavior", "ba", 2], ["user behaviour", "ba", 2],
    ["churn", "ba", 1], ["retention", "ba", 1], ["users", "ba", 1], ["customers", "ba", 1], ["app", "ba", 1], ["apps", "ba", 1], ["team", "ba", 1], ["teams", "ba", 1], ["growth", "ba", 1], ["Excel", "ba", 1], ["spreadsheets", "ba", 1],
    ["business", "ba", 1], ["product", "ba", 1], ["products", "ba", 1], ["strategy", "ba", 1], ["consulting", "ba", 1], ["consultant", "ba", 1], ["marketing", "ba", 1], ["finance", "ba", 1], ["decision", "ba", 1], ["decisions", "ba", 1], ["management", "ba", 1], ["operations", "ba", 1], ["startup", "ba", 1],
    ["产品决策", "ba", 2], ["商业分析", "ba", 2], ["用户流失", "ba", 2], ["流失", "ba", 1], ["留存", "ba", 1], ["增长", "ba", 1], ["用户", "ba", 1], ["团队", "ba", 1], ["商业", "ba", 1], ["产品", "ba", 1], ["咨询", "ba", 1], ["营销", "ba", 1], ["市场", "ba", 1], ["决策", "ba", 1], ["管理", "ba", 1], ["运营", "ba", 1], ["金融", "ba", 1], ["战略", "ba", 1], ["创业", "ba", 1]
  ];
  /* worries, in the order they are answered (at most two lines) */
  const WORRY = [
    ["code", ["code", "coding", "coded", "programming", "programmed", "python", "SQL", "编程", "写代码", "代码", "Python"]],
    ["math", ["math", "maths", "mathematics", "calculus", "numbers", "数学", "高数", "微积分", "数字"]],
    ["fit", ["fit", "suit", "suits", "suited", "right for me", "good at", "talent", "适合", "擅长", "天赋", "对路"]],
    ["jobs", ["job", "jobs", "salary", "salaries", "pay", "pays", "paying", "money", "career", "careers", "employment", "hiring", "就业", "薪资", "工资", "找工作", "薪水", "前景", "赚钱"]],
    ["background", ["no background", "no experience", "beginner", "never studied", "from scratch", "零基础", "没基础", "没有基础", "跨专业", "转专业"]],
    ["time", ["time", "busy", "how long", "时间", "多久", "太忙"]],
    ["family", ["parents", "parent", "family", "mom", "dad", "家人", "父母", "爸妈", "家里"]],
    ["difference", ["difference", "differences", "different", "differ", "versus", "vs", "区别", "不同", "差别", "不一样"]]
  ];
  const NOQUOTE = { fit: 1, family: 1, time: 1, difference: 1 };   // answered without echoing (a fit phrase must never be quoted back)
  const INTEREST_EN = [["keep wondering", "keep wondering"], ["wondering", "wonder"], ["wonder", "wonder"], ["want to understand", "want to understand"], ["really like", "really like"], ["like", "like"], ["love", "love"], ["enjoy", "enjoy"], ["enjoyed", "enjoyed"], ["want to", "want to"], ["interested in", "are interested in"], ["curious about", "are curious about"], ["fascinated by", "are fascinated by"], ["passionate about", "are passionate about"], ["drawn to", "are drawn to"], ["into", "are into"]];
  const INTEREST_ZH = ["喜欢", "想做", "想学", "想从事", "好奇", "想搞"];
  const NEG_EN = /\b(don'?t|do not|doesn'?t|not|never|hate|hated|dislike|can'?t stand|no interest in|not into|bored by)\b[^,;.!?]{0,18}$/i;
  const NEG_ZH = /(不|没|讨厌|烦|怕)[^，。；！？]{0,3}$/;
  const WORRY_EN = /\b(not sure|unsure|worried|worry|afraid|afraid of|scared|scare|nervous|can'?t|cannot|don'?t know|weak|bad at|not great at|not good at|struggle|need|never|never really|haven'?t)\b/i;
  const WORRY_ZH = /(不确定|担心|怕|害怕|不会|不太会|不懂|跟不上|没学过|没写过|需要)/;
  const isZhText = (s) => /[㐀-鿿]/.test(s);
  const T7len = (s) => MP.ai.text.chars(s);

  /** Read the student's sentence. Pure function of the text. */
  function readWords(said) {
    const T7 = MP.ai.text, s = String(said || "").trim();
    const zhT = isZhText(s);
    const out = { said: s, words: zhT ? T7.chars(s) : T7.words(s), zh: zhT, score: { ba: 0, ds: 0, ai: 0 }, best: {}, negs: [], worries: [], hits: 0 };
    if (!s) return out;
    out.tooShort = zhT ? T7.chars(s) < 5 : T7.words(s) < 4;
    const B = /[,;:—–，、；：.!?。！？\n]/;
    const clauseStart = (i) => { let a = i; while (a > 0 && !B.test(s[a - 1])) a--; return a; };
    const clauseEnd = (i) => { let b = i; while (b < s.length && !B.test(s[b])) b++; return b; };
    // interest matches, longest first, no overlaps
    const ms = [];
    LEX.forEach(([w, lens, wt]) => T7.find(s, [w]).forEach((m) => ms.push({ s: m.s, e: m.e, w, lens, wt })));
    ms.sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s);
    const taken = [];
    const free = (m) => !taken.some((x) => m.s < x.e && m.e > x.s);
    ms.forEach((m) => { if (free(m)) taken.push(m); });
    taken.sort((a, b) => a.s - b.s);
    taken.forEach((m) => {
      const a = clauseStart(m.s), before = s.slice(a, m.s);
      const ng = (zhT ? NEG_ZH : NEG_EN).exec(before);
      if (ng) { out.negs.push({ lens: m.lens, q: s.slice(a + ng.index, m.e).trim() }); return; }
      out.score[m.lens] += m.wt; out.hits++;
      // the quote: the student's own phrase, from just after an interest verb (when there is one) to the end of the match
      let qs = m.s, qe = m.e, verb = "";
      if (zhT) {
        const v = INTEREST_ZH.map((x) => ({ x, i: before.lastIndexOf(x) })).filter((o) => o.i >= 0 && before.length - (o.i + o.x.length) <= 6).sort((p, q) => q.i - p.i)[0];
        if (v) { verb = v.x; qs = a + v.i + v.x.length; }
        const ce = clauseEnd(m.e), tz = s.slice(m.e, ce);
        if (ce - m.e <= 5 || (ce - m.e <= 9 && /心动|感兴趣|有兴趣|好奇|喜欢/.test(tz))) qe = ce;
        if (qe - qs > 14) { qs = m.s; qe = m.e; }
      } else {
        const low = before.toLowerCase();
        let best = null;
        INTEREST_EN.forEach(([x, disp]) => { const re = new RegExp("\\b" + x.replace(/ /g, "\\s+") + "\\s+", "gi"); let r; while ((r = re.exec(low))) { const end = r.index + r[0].length; const gap = low.slice(end).trim().split(/\s+/).filter(Boolean).length; if (gap <= 3 && (!best || end > best.end)) best = { end, disp }; } });
        if (best) { verb = best.disp; qs = a + best.end; }
        const tail = s.slice(m.e, clauseEnd(m.e)).trim().split(/\s+/).filter(Boolean);
        if (tail.length && tail.length <= 2) qe = clauseEnd(m.e);
        if (s.slice(qs, qe).split(/\s+/).length > 8) { qs = m.s; qe = m.e; verb = ""; }
      }
      let q = s.slice(qs, qe).trim().replace(/^[,;:—–，、；：\s]+|[,;:—–，、；：\s]+$/g, "");
      if (!MP.ai.check(q).ok) { q = s.slice(m.s, m.e); verb = ""; }      // never echo a phrase the kit would refuse
      const cur = out.best[m.lens];
      if (!cur || m.wt > cur.wt) out.best[m.lens] = { q, verb, wt: m.wt, w: m.w, at: m.s };
    });
    // worries: a worry marker shortly before the topic word becomes part of the quote ("not sure I can code")
    WORRY.forEach(([k, words]) => {
      const hit = T7.find(s, words)[0]; if (!hit) return;
      const a = clauseStart(hit.s), before = s.slice(a, hit.s);
      let qs = hit.s;
      const mk = (zhT ? WORRY_ZH : WORRY_EN).exec(before);
      const marked = !!(mk && (zhT ? before.length - mk.index <= 10 : before.slice(mk.index).split(/\s+/).length <= 6));
      if (marked) qs = a + mk.index;
      // a worry can also come right after the topic ("数学不太好", "math scares me"): then quote up to the clause end
      let qe = hit.e;
      const ce = clauseEnd(hit.e), after = s.slice(hit.e, ce);
      const AFTER = zhT ? /^.{0,3}(不太好|不好|很差|一般|跟不上|吃力|头疼|让我怕|让我害怕|害怕)/ : /^\s+(is|are|was|scares?|frightens?|worries?|isn'?t|aren'?t)\b/i;
      const markedAfter = !marked && AFTER.test(after) && (zhT ? ce - hit.e <= 8 : after.trim().split(/\s+/).length <= 4);
      if (markedAfter) qe = ce;
      // "不确定自己代码够不够用" / "not sure I can code well enough": a short tail after the topic belongs to the worry
      if (marked && (zhT ? ce - hit.e <= 6 : after.trim().split(/\s+/).filter(Boolean).length <= 3)) qe = ce;
      let se = hit.e; while (se < s.length && !/[.!?。！？\n]/.test(s[se])) se++;
      const asked = /[?？吗]/.test(s.slice(hit.s, se + 1));
      const marked2 = marked || markedAfter;
      // "I love coding" is not a worry: code / math / time count only when worded as a worry or a question;
      // "difference" only as a comparison ("between", "vs", a question), not "make a difference"
      if ((k === "code" || k === "math" || k === "time") && !marked2 && !asked) return;
      if (k === "difference" && !zhT && !asked && !/\b(between|vs|versus)\b/i.test(s)) return;
      let q = NOQUOTE[k] ? "" : s.slice(qs, qe).trim();
      if (q && !MP.ai.check(q).ok) q = "";
      if (q && (k === "jobs" || k === "background") && (zhT ? T7.chars(q) < 3 : q.split(/\s+/).length < 2)) q = "";
      out.worries.push({ k, q, at: hit.s });
    });
    const sc = out.score, top = Math.max(sc.ba, sc.ds, sc.ai);
    if (top > 0) {
      const tech = (MP.state.profile || {}).background === "technical";
      const tied = MP.lensOrder.filter((id) => sc[id] === top);
      // ties follow the existing Quick Start rule order: AI → (BA, or DS with a technical background) → DS → BA
      out.lean = tied.includes("ai") ? "ai" : tied.includes("ba") && tied.includes("ds") ? (tech ? "ds" : "ba") : tied[0];
    }
    return out;
  }

  const Q = (q, lens) => ({ q, lens });
  const nm = (id) => t(MP.lensInfo[id].name);
  const LENS_LINE = {
    ds: [{ en: "That's the heart of the DS lens: checking whether a drop is real, or just a change in who signed up.", zh: "这正是 DS 视角的核心：判断一次下降是真的，还是只是报名的人变了。" },
      { en: "The DS lens is built around exactly that: is LumenLearn's drop real, or did the mix of learners change?", zh: "DS 视角围绕的就是这个问题：LumenLearn 的下降是真的，还是学员构成变了？" }],
    ba: [{ en: "The BA lens ends in exactly that kind of work: a one-page recommendation a product lead can act on.", zh: "商业分析视角最后要交的，正是一页写给产品负责人的行动建议。" },
      { en: "In the BA lens you find where learners drop off, pick one fix you can test, and write it up for the product lead.", zh: "在 BA 视角里，你要找到学员流失的环节，选一个能验证的改进，再写给产品负责人。" }],
    ai: [{ en: "In the AI lens you read the help messages a model got wrong, change one thing, and run it again on the same {n} messages.", zh: "在 AI 视角里，你会逐条看模型分错的求助消息，只改一处，再在同样的 {n} 条消息上跑一遍。" },
      { en: "The AI lens is a real model problem: why a help router misroutes stuck learners, and what one change costs.", zh: "AI 视角是一道真实的模型问题：求助分流器为什么把卡住的学员分错，改一处又要付出什么代价。" }]
  };
  function worryLine(w) {
    const q = w.q ? Q(w.q) : null;
    const L = {
      code: q ? { en: ["On ", q, ": none of the three lenses needs code; everything runs in the browser. How much code a program expects is worth asking them directly."], zh: ["关于", q, "：这里的三个视角都不用写代码，全部在浏览器里完成。硕士项目要求多少编程，值得直接问问项目方。"] }
        : { en: ["On coding: none of the three lenses needs it; everything runs in the browser."], zh: ["关于编程：这里的三个视角都不用写代码，全部在浏览器里完成。"] },
      math: { en: [q ? "On " : "On math", q || "", ": the steps use percentages and simple ratios, and every number is worked out on screen with you."], zh: ["关于", q || "数学", "：这里用到的是百分比和简单的比值，每个数字都会在屏幕上和你一起算出来。"] },
      fit: { en: ["Nobody here will tell you which field is right for you. Trying a slice of the work is how you find out what it's like."], zh: ["这里不会替你判断哪个方向更对路。亲手试一小段工作，才知道它是什么样子。"] },
      jobs: { en: [q ? "On " : "", q || "", q ? ": we can't speak to jobs or pay; we can show you the work." : "We can't speak to jobs or pay; we can show you the work."], zh: [q ? "关于" : "", q || "", q ? "：我们没法谈就业和薪资，但可以让你看到真实的工作。" : "我们没法谈就业和薪资，但可以让你看到真实的工作。"] },
      background: { en: [q ? "On " : "", q || "", q ? ": no background needed. Each lens starts from scratch, and step 1 takes under a minute." : "No background needed: each lens starts from scratch, and step 1 takes under a minute."], zh: [q ? "关于" : "", q || "", q ? "：不需要基础。每个视角都从零开始，第一步不到一分钟。" : "不需要基础：每个视角都从零开始，第一步不到一分钟。"] },
      time: { en: ["Each lens takes about 15 minutes, saves on this device, and you can stop anytime."], zh: ["每个视角大约 15 分钟，进度存在本设备上，随时可以停。"] },
      family: { en: ["If family is part of the decision, your Brief has a Family view, written in plain words."], zh: ["如果家人也会参与决定，你的小结有一个家人版，用的是通俗的说法。"] },
      difference: { en: ["On how they differ: Explore puts all three side by side, on the same problem."], zh: ["想看区别的话，探索页把三个视角放在同一个问题上并排对比。"] }
    };
    return L[w.k];
  }
  /** Compose the response for the current Quick Start. Returns {body, trace, unsure, lean, replaces} or null (no text). */
  function composeWords() {
    const said = (MP.state.qs.said || "").trim();
    if (!said) return null;
    const r = recommend(), R = readWords(said), seed = MP.ai.hash(said);
    const pick = (list, k) => list[(seed + (k || 0)) % list.length];
    const L = r.lens && r.lens !== "explore" ? r.lens : "";
    const f = picked();
    const paras = [], tr = [];
    // trace: the phrases it actually read, each naming the beam it points to (and lighting it)
    MP.lensOrder.forEach((id) => { const b = R.best[id]; if (b) tr.push({ at: b.at, label: { en: `‘${b.q}’ → ${MP.lensInfo[id].short}`, zh: `“${b.q}” → ${MP.lensInfo[id].short}` }, src: "hm-beam-" + id }); });
    R.worries.slice(0, 2).forEach((w) => { if (w.q) tr.push({ at: w.at, label: { en: `‘${w.q}’`, zh: `“${w.q}”` } }); });
    tr.sort((a, b) => a.at - b.at);
    const trace = tr.length ? tr : [S7.yourWords(R)];
    let replaces = false;
    const second = MP.lensOrder.filter((id) => id !== (L || R.lean) && R.best[id]).sort((a, b) => R.score[b] - R.score[a])[0];
    const alsoLine = (id) => {
      const b = R.best[id], inPicks = f.includes(id);
      return inPicks
        ? pick([{ en: ["You also mentioned ", Q(b.q, id), ". That's the ", MP.lensInfo[id].short, " lens you picked too; it uses the same data, so it's an easy second step."], zh: ["你也提到了", Q(b.q, id), "，这正是你同时勾选的 ", MP.lensInfo[id].short, " 视角，用的是同一份数据，可以接着做。"] },
          { en: ["And ", Q(b.q, id), " is what the ", MP.lensInfo[id].short, " lens you also picked is about. Same LumenLearn data, so it follows on naturally."], zh: ["至于", Q(b.q, id), "，正是你也勾选的 ", MP.lensInfo[id].short, " 视角要做的事。数据是同一份，接着做很自然。"] }], 1)
        : pick([{ en: ["You also mentioned ", Q(b.q, id), "; the ", MP.lensInfo[id].short, " lens covers that, on the same data."], zh: ["你也提到了", Q(b.q, id), "，", MP.lensInfo[id].short, " 视角讲的就是这个，用的是同一份数据。"] },
          { en: ["There's some ", MP.lensInfo[id].short, " in what you wrote, too (", Q(b.q, id), "). All three lenses share one problem, so it's easy to try next."], zh: ["你的话里也有一点 ", MP.lensInfo[id].short, " 的影子（", Q(b.q, id), "）。三个视角用的是同一个问题，之后很容易接着试。"] }], 1);
    };
    const negLine = (n) => {
      const keep = L && n.lens === L;
      return { en: ["I read ", Q(n.q), " as a doubt about ", MP.lensInfo[n.lens].short, ", not a pull toward it.", keep ? " You still picked it above, so it stays where you start; step 1 takes under a minute." : ""],
        zh: ["我把", Q(n.q), "理解为对 ", MP.lensInfo[n.lens].short, " 有些顾虑，没有当作偏向它。", keep ? "不过你在上面选了它，所以起点不变，第一步不到一分钟。" : ""] };
    };
    if (L) {
      const b = R.best[L];
      if (b) {
        replaces = true;
        // the interest verb is the student's own word, in the language they wrote in: it is used only when that is
        // also the UI language (a zh UI never says "你说like…"); otherwise the frame drops it and quotes the phrase
        const vEn = !R.zh && b.verb, vZh = R.zh && b.verb;
        const one = R.zh ? T7len(b.q) <= 2 : !/\s/.test(b.q.trim());   // a single word is "a word", never "a phrase"
        const opener = pick([
          { en: vEn ? ["You said you " + b.verb + " ", Q(b.q, L), ". "] : one ? ["You mention ", Q(b.q, L), ". "] : ["You wrote ", Q(b.q, L), ". "],
            zh: vZh ? ["你说" + b.verb, Q(b.q, L), "，"] : one ? ["你提到了", Q(b.q, L), "。"] : ["你写到", Q(b.q, L), "，"] },
          { en: vEn ? ["You wrote that you " + b.verb + " ", Q(b.q, L), ". "] : one ? ["You bring up ", Q(b.q, L), ". "] : ["One phrase stood out: ", Q(b.q, L), ". "],
            zh: vZh ? ["你写到" + b.verb, Q(b.q, L), "。"] : one ? ["你的话里提到了", Q(b.q, L), "。"] : ["你的话里有一句：", Q(b.q, L), "。"] }]);
        // after a bare word, the lens line must stand on its own ("that kind of work" would point back at one word)
        // BA's "that kind of work" line only follows words about deciding; other BA words get the line that names the work
        const line = one || (L === "ba" && !/decision|decide|product manager|business analytics|决策|商业分析/i.test(b.w)) ? LENS_LINE[L][1] : pick(LENS_LINE[L], 2);
        paras.push([opener, { en: line.en.replace("{n}", MP.n(LV.routerTotal)), zh: line.zh.replace("{n}", MP.n(LV.routerTotal)) }]);
      }
      R.negs.filter((n) => n.lens === L).slice(0, 1).forEach((n) => paras.push([negLine(n)]));
      if (second) paras.push([alsoLine(second)]);
    } else if (R.lean) {
      const b = R.best[R.lean];
      paras.push([pick([{ en: ["Your words lean toward ", { b: nm(R.lean) }, ": you wrote ", Q(b.q, R.lean), ". Tap it in question 1 to start there."], zh: ["你的话更偏向", { b: nm(R.lean) }, "：你写到了", Q(b.q, R.lean), "。想从那里开始，就在第 1 题里点选它。"] },
        { en: ["Reading ", Q(b.q, R.lean), ", your words lean toward ", { b: nm(R.lean) }, ". Tap it in question 1 if you'd like to start there."], zh: ["从", Q(b.q, R.lean), "来看，你的话偏向", { b: nm(R.lean) }, "。想从那里开始，就在第 1 题里点选它。"] }])]);
      if (second) paras.push([alsoLine(second)]);
    }
    if (!L || !R.negs.some((n) => n.lens === L)) R.negs.slice(0, 1).forEach((n) => paras.push([negLine(n)]));
    R.worries.slice(0, 2).forEach((w) => paras.push([worryLine(w)]));
    let unsure = false;
    if (!paras.length) {
      unsure = true;
      paras.push([R.tooShort
        ? { en: ["That's a bit short for me to read much into. A sentence about what you enjoy, or what worries you, gives me more to go on."], zh: ["这句有点短，我还读不出什么。说说你喜欢什么、或者担心什么，我就有更多可以参考的。"] }
        : { en: ["I couldn't tell which way your words lean, and that's fine. Explore shows all three side by side."], zh: ["从你的话里还看不出偏向哪边，这很正常。探索页里可以把三个视角并排看。"] }]);
    } else if (!L && !R.lean && R.worries.length) {
      paras.push([{ en: ["I couldn't tell which field your words lean toward, so question 1 is still yours to answer."], zh: ["从你的话里看不出偏向哪个方向，所以第 1 题还是由你来选。"] }]);
    }
    // "where your words point" is only said when the reply actually named a direction
    const points = !unsure && (replaces || (!L && !!R.lean) || !!second);
    return { body: paras, trace, unsure, points, lean: L ? "" : (R.lean || ""), replaces, R, said };
  }
  /** The streamed response block (or "" when nothing was read). */
  function wordsBlock(c, fallback) {
    if (!c) return "";
    const known = [LV.routerTotal, MP.lensInfo.ba.minutes, 15];
    const html = MP.ai.block({
      key: "qs.words", fp: MP.ai.fp([c.said, MP.state.qs.fields || [], recommend().lens || ""]),
      kind: "line", cap: 1800, trace: c.trace, traceDone: t(S7.fromWords), body: c.body, unsure: c.unsure,
      cls: "hm-said", live: false, grow: false,
      check: { numbers: known, sources: [c.said] }, fallback: fallback || ""
    });
    // the phrases it read stay visible as small quoted chips (the trace's list, open)
    return html.replace('<details class="rd-trace-done">', '<details class="rd-trace-done" open>');
  }
  /** Tag the split mark's beams so trace items / chips can light them. */
  const beamSrc = (svg) => svg.replace(/class="bm (ba|ds|ai)/g, 'data-rd-src="hm-beam-$1" class="bm $1');
  function sayBox() {
    const v = MP.state.qs.text || "";
    return `<div class="hm-say"><label class="hm-say-l" for="qs-say">${t(S7.label)}<span class="hm-qsub">${t(S7.sub)}</span></label>
      <div class="hm-say-box"><textarea class="textarea hm-say-ta" id="qs-say" rows="${v.length > 60 ? 3 : 2}" maxlength="280" data-input="home-say" data-change="home-say-done" data-fk="qs-say" placeholder="${h.esc(t(S7.ph[0]))}">${h.esc(v)}</textarea>
        <button type="button" class="hm-say-go" data-action="home-say-go" data-fk="home-say-go" aria-label="${h.esc(t(S7.go))}" title="${h.esc(t(S7.go))}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg></button></div>
      <p class="hm-say-hint">${t(S7.hint)}</p></div>`;
  }

  /* ---------------- quick start ---------------- */
  function q1(lean) {
    const f = MP.state.qs.fields || [];
    const opts = MP.lensOrder.map((id) => {
      const i = MP.lensInfo[id];
      return h.option(`<span class="hm-code ${id}">${i.short}</span><span class="hm-opt-t">${t(i.name)}</span>`, "", "home-field", id, f.includes(id), { multi: true, cls: "hm-opt" + (lean === id ? " is-lean" : "") });
    }).join("") + h.option(`<span class="hm-code none">?</span><span class="hm-opt-t">${t(C.notSure)}</span>`, "", "home-field", "none", f.includes("none"), { multi: true, cls: "hm-opt" });
    return `<div class="hm-q" role="group" aria-labelledby="qs-q1"><div class="hm-legend" id="qs-q1"><span class="hm-qn">1</span><span>${t(C.q1)}<span class="hm-qsub">${t(C.q1sub)}</span></span></div>
      <div class="hm-opts">${opts}</div></div>`;
  }
  function q2(foot) {
    const a = MP.state.qs.ask || "";
    const opts = Object.keys(C.asks).map((k) => h.option(`<span class="hm-opt-t">${t(C.asks[k])}</span>`, "", "home-ask", k, a === k, { cls: "hm-opt hm-ask" })).join("");
    return `<div class="hm-q hm-q2"><div class="hm-legend" id="qs-q2"><span class="hm-qn">2</span><span>${t(C.q2)}<span class="hm-qsub">${t(C.q2sub)}</span></span></div>
      <div class="hm-opts" role="radiogroup" aria-labelledby="qs-q2">${opts}</div>${foot || ""}</div>`;
  }
  /** A returning student who changes their answers may land on a lens they've already started or finished. */
  function startLabel(id) {
    const p = MP.progress(id), info = MP.lensInfo[id];
    if (p.complete) return t(C.reviewLens).replace("{x}", info.short);
    if (p.started) return MP.ui("continueLens", { x: MP.lensInfo[id].short });
    return t(C.startLens).replace("{x}", info.short);
  }
  let lastRec = null;
  function result(c) {
    const r = recommend(), ask = MP.state.qs.ask, key = r.lens || "";
    const just = lastRec !== null && key !== lastRec; lastRec = key;
    const head = `<span class="ld-label hm-res-k">${t(C.startHere)}</span>`;
    const bound = c && c.points ? `<p class="hm-res-bound">${t(S7.boundary)}</p>` : "";
    if (!r.lens) {
      // free text never picks a lens: the mark stays dashed, the leaned beam only thickens ("not yet")
      const said = c ? wordsBlock(c) : "";
      return `<div class="hm-res is-empty${c && c.lean ? " lean-" + c.lean : ""}" aria-live="polite">${head}
        <div class="hm-res-mark">${beamSrc(MP.draw.splitMark("", { labels: true }))}</div>
        <p class="hm-res-line">${t(C.emptyLine)}</p>${said ? said : `<p class="hm-res-sub">${t(C.emptySub)}</p>`}${bound}
        <div class="hm-res-act">${h.link(t(C.seeAll) + " →", "go", "#/explore")}</div></div>`;
    }
    if (r.lens === "explore") {
      return `<div class="hm-res slab on-ink${just ? " is-new" : ""}${c && c.lean ? " lean-" + c.lean : ""}" aria-live="polite">${head}
        <div class="hm-res-mark">${beamSrc(MP.draw.splitMark("all", { labels: true, just }))}</div>
        <p class="hm-res-name">${t(C.allThree)}</p><p class="hm-res-why">${t(C.reasons.explore)}</p>${c ? wordsBlock(c) : ""}${bound}
        <div class="hm-res-act">${h.primary(t(C.seeLenses), "go", "#/explore", { fk: "qs-cta" })}</div></div>`;
    }
    const info = MP.lensInfo[r.lens];
    const why = `<p class="hm-res-why">${t(C.reasons[r.why])}</p>`;
    // the reason itself is rewritten (as context, quoting them) only when their words name this lens's kind of work
    const said = c ? wordsBlock(c, c.replaces ? why : "") : "";
    return `<div class="hm-res slab s-${r.lens} lens-${r.lens}${just ? " is-new" : ""}" aria-live="polite">${head}
      <div class="hm-res-mark">${beamSrc(MP.draw.splitMark(r.lens, { labels: true, just }))}</div>
      <p class="hm-res-name">${t(info.name)}</p>
      ${c && c.replaces ? said : why + said}
      ${ask && C.tails[ask] ? `<p class="hm-res-tail">${t(C.tails[ask])}</p>` : ""}${bound}
      <div class="hm-res-act">${h.primary(startLabel(r.lens), "home-start", r.lens, { lens: r.lens, fk: "qs-cta" })}
        ${h.link(t(C.seeAll) + " →", "go", "#/explore")}</div></div>`;
  }

  /** Welcome back: if their Quick Start words carried a coding / math worry, one grounded line about what the work
      since then actually needed (counts only; private to this device). */
  function wbEcho() {
    try {
      const said = (MP.state.qs.said || "").trim(); if (!said) return "";
      const w = readWords(said).worries.find((x) => (x.k === "code" || x.k === "math") && x.q);
      const n = MP.lensOrder.reduce((a, id) => a + (MP.lenses[id] ? MP.progress(id).contentDone : 0), 0);
      if (!w || n < 2) return "";
      const body = w.k === "code"
        ? { en: ["In Quick Start you wrote ", Q(w.q), ". You've done ", { b: MP.n(n) }, " steps so far, and none of them needed code."], zh: ["你在快速开始里写过", Q(w.q), "。到现在你做了 ", { b: MP.n(n) }, " 步，没有一步需要写代码。"] }
        : { en: ["In Quick Start you wrote ", Q(w.q), ". In the ", { b: MP.n(n) }, " steps you've done so far, the math was percentages and ratios, worked out on screen."], zh: ["你在快速开始里写过", Q(w.q), "。到现在做的 ", { b: MP.n(n) }, " 步里，用到的数学是百分比和比值，都在屏幕上算好了。"] };
      return MP.ai.block({ key: "qs.wb", fp: MP.ai.fp([said, n]), kind: "line", cls: "hm-wb-echo", live: false,
        trace: [{ en: "Your Quick Start words", zh: "你在快速开始写的话" }, { en: `${n} steps done`, zh: `已做 ${n} 步` }],
        body, check: { numbers: [n], sources: [said] }, fallback: "" });
    } catch (e) { return ""; }
  }

  /* returning student: a small welcome-back panel replaces the quiz until they ask to change their answers */
  let editing = false;
  function welcomeBack() {
    const ns = MP.nextStep();
    const done = MP.lensOrder.filter((id) => MP.lenses[id] && MP.progress(id).complete);
    const list = done.map((id) => MP.lensInfo[id].short).join(zh() ? " 和 " : " and ");
    let line, sub, cta, ctaLens = "";
    if (ns && ns.resume) {
      const p = MP.progress(ns.lens), steps = MP.lensSteps(ns.lens), i = Math.max(0, steps.findIndex((x) => x.id === ns.step));
      const n = zh() ? String(p.done) : p.done === 1 ? "1 step" : p.done + " steps";
      line = MP.t(p.done ? C.wbResume : C.wbOpened).replace("{n}", n).replace("{x}", lensName(ns.lens));
      sub = MP.t(C.wbUpNext).replace("{i}", i + 1).replace("{x}", `<span class="hm-wb-step">${t(steps[i].title)}</span>`);
      cta = h.primary(t(C.wbPick), "go", `#/lens/${ns.lens}/${ns.step}`, { lens: ns.lens, fk: "qs-cta" });
      ctaLens = ns.lens;
    } else if (ns) {
      line = MP.t(C.wbFinished).replace("{list}", list);
      sub = MP.t(C.wbNextLens).replace("{x}", lensName(ns.lens)) + ` <span class="hm-wb-step lens-q">${t(MP.lensInfo[ns.lens].question)}</span>`;
      cta = h.primary(MP.ui("tryNext", { x: MP.lensInfo[ns.lens].short }), "go", "#/lens/" + ns.lens, { lens: ns.lens, fk: "qs-cta" });
      ctaLens = ns.lens;
    } else {
      line = t(C.wbAll); sub = t(C.wbAllSub);
      cta = h.primary(MP.ui("seeBrief"), "go", "#/brief", { fk: "qs-cta" });
    }
    const rows = MP.lensOrder.filter((id) => MP.lenses[id]).map((id) => {
      const p = MP.progress(id);
      const st = p.complete ? t(C.wbDone) : p.started ? MP.t(C.wbPart).replace("{a}", p.done).replace("{b}", p.total) : t(C.wbNew);
      return `<li class="lens-${id} ${p.complete ? "is-done" : p.started ? "is-part" : ""}">${h.lensTag(id, { short: true })}${MP.draw.beam(p.complete ? 1 : p.done / p.total, 0, p.total)}<span class="hm-wb-st">${p.complete ? '<i aria-hidden="true">✓</i>' : ""}${st}</span></li>`;
    }).join("");
    return `<section class="hm-qs is-back" id="quick-start" aria-labelledby="qs-title">
      <div class="hm-qs-head"><h2 class="hm-qs-title" id="qs-title">${t(C.wbTitle)}</h2><span class="ld-label">${t(C.wbMeta)}</span></div>
      <div class="hm-qs-grid hm-wb">
        <div class="hm-q hm-wb-main"><p class="hm-wb-line">${line}</p><p class="hm-wb-sub">${sub}</p>${wbEcho()}</div>
        <div class="hm-q hm-wb-list"><span class="ld-label">${t(C.wbLenses)}</span><ul>${rows}</ul></div>
        <div class="hm-res slab hm-wb-act ${ctaLens ? "s-" + ctaLens + " lens-" + ctaLens : "on-ink"}"><div class="hm-res-mark">${MP.draw.splitMark(ctaLens || "all", { labels: true })}</div><div class="hm-res-act">${cta}${h.link(t(C.wbChange), "home-qs-edit", "1")}</div></div>
      </div>
    </section>`;
  }
  function more() {
    const p = MP.state.profile || {};
    const grp = (title, key, list, multi) => `<div class="hm-more-g" role="group" aria-label="${h.esc(t(title))}"><div class="hm-more-t">${t(title)}</div>
      <div class="chips">${Object.keys(list).map((v) => h.chip(t(list[v]), "home-prof", key + ":" + v, multi ? (p[key] || []).includes(v) : p[key] === v, { sm: true })).join("")}</div></div>`;
    const summary = `<span>${t(C.more)}</span><span class="hm-more-sub">${t(C.moreSub)}</span>`;
    const body = `<div class="hm-more">${grp(C.stage, "stage", C.stages)}${grp(C.background, "background", C.backgrounds)}${grp(C.regions, "regions", C.regionList, true)}</div>
      <p class="hm-more-note">${t(C.moreNote)}</p>`;
    return h.fold("home-more", summary, body);
  }
  function quickStart() {
    if (anyStarted() && !editing) return welcomeBack();
    let c = null;
    try { c = composeWords(); } catch (e) { console.error(e); c = null; }   // any failure → today's copy, no AI styling
    return `<section class="hm-qs" id="quick-start" aria-labelledby="qs-title">
      <div class="hm-qs-head"><h2 class="hm-qs-title" id="qs-title">${t(C.qsTitle)}</h2><span class="ld-label">${t(C.qsMeta)}</span>${anyStarted() ? `<span class="hm-qs-back">${h.quiet("← " + t(C.wbBack), "home-qs-edit", "0")}</span>` : ""}</div>
      <div class="hm-qs-grid">${q1(c && c.lean)}${q2(sayBox() + `<div class="hm-qs-more in-col">${more()}</div>`)}${result(c)}</div>
    </section>`;
  }

  /* ---------------- 0 · hero ---------------- */
  function hero(intro) {
    const mins = MP.lensInfo[MP.lensOrder[0]].minutes;
    return `<section class="hm-hero" aria-labelledby="home-h1">
      <div class="container">
        <div class="hm-hero-grid">
          <div class="hm-copy">
            <p class="eyebrow hm-eyebrow"><span class="hm-trio" aria-hidden="true"><i class="ba"></i><i class="ds"></i><i class="ai"></i></span><span>${t(C.eyebrow)}</span></p>
            <h1 class="display hm-h1" id="home-h1"><span class="l1">${t(C.headA)}</span> <span class="l2">${t(C.headB)}</span></h1>
            <p class="lede hm-lede">${t(C.lede)}</p>
            <ul class="hm-checks">${C.checks.map((c) => `<li><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4 5 8.8 9.6 3.4"/></svg>${fill(t(c), { n: mins })}</li>`).join("")}</ul>
            <p class="hm-jump-row"><a class="hm-jump" href="#quick-start" data-action="home-jump" data-fk="home-jump">${t(anyStarted() && !editing ? C.jumpBack : C.jump)}<span aria-hidden="true">↓</span></a></p>
          </div>
          ${heroFigure(intro)}
        </div>
        ${quickStart()}
      </div>
    </section>`;
  }

  /* ---------------- facts: the one-line pitch ---------------- */
  function facts() {
    const v = [1, MP.lensOrder.length, "~" + MP.lensInfo[MP.lensOrder[0]].minutes, 0];
    return `<section class="hm-facts" aria-label="${h.esc(t(C.factsLabel))}"><div class="container"><dl class="hm-facts-dl">${C.facts.map((f, i) => {
      const u = f.u && zh() ? `<small>${f.u.zh}</small>` : "";
      return `<div class="hm-fact${i === 3 ? " zero" : ""}" data-reveal style="--d:${(i * 0.08).toFixed(2)}s"><dt class="ld-num">${v[i]}${u}</dt><dd>${t(f)}</dd></div>`;
    }).join("")}</dl></div></section>`;
  }

  /* ---------------- 01 · the shared problem (ink) ---------------- */
  /** Fig. 2: the DS "bridge" — what the hero line can't show: half the fall is mix, half is real. All from MP.data. */
  function bridge() {
    const ch = MP.data.channels, E = LV.earlier * 100, R = LV.recent * 100, W = MP.data.reweighted;
    const share = (p) => p.partner.signups / (p.partner.signups + p.organic.signups);
    const p0 = f0(share(ch.earlier)), p1 = f0(share(ch.recent));
    const lo = Math.floor(R) - 3, hi = Math.ceil(E) + 1, Yp = (v) => fx((v - lo) / (hi - lo) * 100);
    const pts = (v) => MP.n(v, 2).replace(/0$/, "");
    const mix = E - W, real = W - R;
    const alt = fill(t(C.fig2Alt), { a: f1(LV.earlier), b: f1(LV.recent), m: pts(mix), r: pts(real), p0, p1, w: MP.pct(W / 100, 2) });
    const col = (cls, b, top, val, name, sub, i) => `<div class="hm-br-col ${cls}" style="--i:${i}">
        <div class="hm-br-bar" style="bottom:${Yp(b)}%;height:${fx((top - b) / (hi - lo) * 100)}%"><span class="v ld-num">${val}</span></div>
        <div class="hm-br-x"><span class="n">${name}</span>${sub ? `<span class="s">${sub}</span>` : ""}</div></div>`;
    return `<figure class="hm-fig2 ld-reveal">
      ${h.figCap(t(C.fig2), t(C.fig2Pill))}
      <div class="hm-br" role="img" aria-label="${h.esc(alt)}">
        <div class="hm-br-plot">
          <i class="hm-br-lvl" style="bottom:${Yp(E)}%;--a:0;--b:2"></i><i class="hm-br-lvl" style="bottom:${Yp(W)}%;--a:1;--b:3"></i><i class="hm-br-lvl r" style="bottom:${Yp(R)}%;--a:2;--b:4"></i>
          ${col("e", lo, E, f1(LV.earlier), t(C.brE), "", 0)}
          ${col("m", W, E, "−" + pts(mix), t(C.brMix), fill(t(C.brMixS), { a: p0, b: p1 }), 1)}
          ${col("q", R, W, "−" + pts(real), t(C.brReal), t(C.brRealS), 2)}
          ${col("r", lo, R, `<em>${f1(LV.recent)}</em>`, t(C.brR), "", 3)}
        </div>
        <span class="hm-br-axis ld-label">${fill(t(C.brAxis), { v: MP.pct(lo / 100, 0) })}</span>
      </div>
      <p class="hm-br-note">${fill(t(C.brNote), { w: `<b class="nowrap">${MP.pct(W / 100, 2)}</b>` })}</p>
    </figure>`;
  }
  function problem() {
    const a = f1(LV.earlier), b = f1(LV.recent);
    return `<section class="ink-band hm-prob" aria-labelledby="home-prob"><div class="container">
      ${h.chapter("01", t(C.probKick), t(C.probTitle), { id: "home-prob", cls: "h1" })}
      <div class="hm-pull ld-reveal" role="img" aria-label="${h.esc(fill(t(C.pullAlt), { a, b }))}">
        <div class="hm-pull-a"><span class="n ld-num">${a}</span><span class="ld-label">${t(C.pullE)}</span></div>
        <svg class="hm-pull-ar" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 20h112M100 6l14 14-14 14"/></svg>
        <div class="hm-pull-b"><span class="n ld-num"><em>${b}</em></span><span class="ld-label">${t(C.pullR)}</span></div>
      </div>
      <div class="hm-prob-body">
        <div class="hm-prob-text" data-reveal>
          <p class="stand">${t(C.probBody)}</p>
          <div class="hm-lead-ask"><span class="ld-label">${t(C.askK)}</span><p>${t(C.ask)}</p></div>
          <p>${h.link(t(C.sideBySide) + " →", "go", "#/explore")}</p>
        </div>
        ${bridge()}
      </div>
    </div></section>`;
  }

  /* ---------------- 02 · three lenses, each topped by its own data ---------------- */
  function lenses() {
    const col = (id) => {
      const i = MP.lensInfo[id], p = MP.progress(id);
      const label = p.complete ? t(C.reviewShort) : p.started ? t(C.contShort) : t(C.tryLens);
      return `<article class="hm-lcol lens-${id}" aria-labelledby="hm-lq-${id}">
        <span class="hm-spot" aria-hidden="true"></span>
        ${h.glyphBox(id)}
        <div class="hm-lhead">${h.lensTag(id)}<h3 class="hm-lq lens-q" id="hm-lq-${id}">${t(i.question)}</h3></div>
        <p class="hm-lone">${t(i.oneLine)}</p>
        <div class="hm-lhand"><span class="ld-label">${t(C.youHandIn)}</span><span>${t(i.handIn)}</span></div>
        <div class="hm-ltry">${h.link(label + " →", "home-try", id)}</div>
      </article>`;
    };
    return `<section class="hm-sec hm-lenses" aria-labelledby="home-lenses"><div class="container">
      ${h.chapter("02", t(C.lensKick), t(C.lensTitle), { id: "home-lenses", cls: "h1", aside: t(C.lensAside) })}
      <div class="hm-lcols">${MP.lensOrder.map(col).join("")}</div>
    </div></section>`;
  }

  /* ---------------- 03 · how it works + what you keep ---------------- */
  function briefCard() {
    const done = MP.lensOrder.filter((id) => MP.lenses[id] && MP.progress(id).complete);
    let lines = [];
    if (done.length) {
      lines = done.slice(0, 2).map((id) => {
        try { const s = MP.lenses[id].summary(MP.ls(id)); return s && s.did ? { id, html: t(s.did) } : null; } catch (e) { return null; }
      }).filter(Boolean);
    }
    const mine = lines.length > 0;
    if (!mine) {
      const S = MP.data.funnelSteps, L = LV.leak;
      lines = [
        { id: "ba", html: fill(t(C.bExBA), { a: t(S[L.i]), b: t(S[L.i + 1]), c: f1(L.rE), d: f1(L.rR) }) },
        { id: "ds", html: fill(t(C.bExDS), { d: MP.n(LV.drop, 1) }) }
      ];
    }
    const lit = mine ? done : ["ba", "ds"];
    const nx = mine ? MP.nextLens() : "ai";
    const next = nx ? fill(t(C.bNext), { x: lensName(nx) }) : t(C.bNextAll);
    const tag = mine ? (done.length === 1 ? t(C.bYours1) : fill(t(C.bYours), { n: done.length })) : t(C.bExample);
    return `<figure class="hm-brief" aria-label="${h.esc(t(C.bAlt))}">
      ${h.briefSheet({ lines: lines.map((l) => l.html).concat(next), lit, tag, cls: "hm-brief-paper" })}
    </figure>`;
  }
  function how() {
    const done = MP.lensOrder.some((id) => MP.lenses[id] && MP.progress(id).complete);
    return `<section class="hm-sec hm-how" aria-labelledby="home-how"><div class="container">
      ${h.chapter("03", t(C.howKick), t(C.howTitle), { id: "home-how", cls: "h1", aside: t(C.howAside) })}
      <ol class="hm-how-list ld-reveal">${C.how.map((s, i) => `<li style="--i:${i}"><span class="hm-how-rule" aria-hidden="true"></span><span class="hm-how-n">${String(i + 1).padStart(2, "0")}</span><span class="hm-how-w w${i}">${t(s.w)}</span><p>${t(s.d)}</p></li>`).join("")}</ol>
      <div class="hm-keep">
        <div class="hm-keep-text" data-reveal>
          <span class="ld-label">${t(C.keepKick)}</span>
          <h3 class="h2 hm-keep-t">${t(C.keepTitle)}</h3>
          <p class="hm-keep-b">${t(C.keepBody)}</p>
          <p>${h.link((done ? t(C.keepMine) : t(C.keepSee)) + " →", "go", "#/brief")}</p>
        </div>
        <div class="hm-keep-card ld-reveal">${briefCard()}</div>
      </div>
    </div></section>`;
  }

  /* ---------------- trust close (ink) → runs into the ink colophon ---------------- */
  function trust() {
    return `<section class="ink-band hm-trust" aria-labelledby="home-trust"><div class="container">
      <div class="hm-trust-top">${MP.draw.splitMark("all")}<span class="ld-label" id="home-trust">${t(C.trustKick)}</span></div>
      <p class="hm-trust-line">${C.trust.map((x, i) => `<span class="tl${i}" data-reveal style="--d:${(i * 0.12).toFixed(2)}s">${i === 2 ? `<em>${t(x)}</em>` : t(x)}</span>`).join(zh() ? "" : " ")}</p>
      <p class="hm-trust-sub">${t(C.trustSub)}</p>
    </div></section>`;
  }

  MP.pages.home = {
    render() {
      syncRecommended();
      // a fresh arrival (not a re-render after a click): restart the ambient pulse clock
      const arriving = replayNext || !document.querySelector("#view .pg-home");
      if (arriving) arrT = performance.now();
      const intro = replayNext || MP.firstVisit("home");
      replayNext = false;
      return `<div class="pg-home${intro ? " is-intro" : ""}">${hero(intro)}${facts()}${problem()}${lenses()}${how()}${trust()}</div>`;
    }
  };

  /* ---------------- actions ---------------- */
  MP.on("home-field", (el, id) => {
    let f = (MP.state.qs.fields || []).slice();
    if (id === "none") f = f.includes("none") ? [] : ["none"];
    else { f = f.filter((x) => x !== "none"); f = f.includes(id) ? f.filter((x) => x !== id) : f.concat(id).slice(-3); }
    MP.state.qs.fields = f; syncRecommended();
    if (MP.state.qs.said && MP.ai) MP.ai.bump("qs.words");   // a changed pick re-reads the same words quickly
    MP.commit();
  });
  MP.on("home-qs-edit", (el, v) => { editing = v === "1"; MP.commit(); });
  /* AI-7: the box is read on Enter, on leaving it, or via the small → button; never on every keystroke */
  function readSaid(o) {
    const ta = document.getElementById("qs-say");
    const v = (ta ? ta.value : MP.state.qs.text || "").trim();
    MP.state.qs.text = ta ? ta.value : MP.state.qs.text;
    if (v === (MP.state.qs.said || "")) { MP.save(); return false; }
    MP.state.qs.said = v; MP.save();
    const go = () => {
      MP.commit();
      if (o && o.reveal && v) {
        const res = document.querySelector(".pg-home .hm-res");
        if (res) { const rr = res.getBoundingClientRect(); if (rr.top > innerHeight - 160 || rr.bottom < 80) res.scrollIntoView({ block: "start", behavior: LV.motionOK() ? "smooth" : "auto" }); }
      }
    };
    if (o && o.defer) setTimeout(go, 160); else go();   // deferred on blur: a click that caused the blur lands first
    return true;
  }
  MP.onInput("home-say", (el) => { MP.state.qs.text = el.value; MP.save(); });
  MP.onInput("home-say-done", () => readSaid({ defer: true }));
  MP.on("home-say-go", () => readSaid({ reveal: true }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || !e.target || e.target.id !== "qs-say") return;
    e.preventDefault(); readSaid({ reveal: true });
  });
  // rotating example in the empty box (only when motion is allowed, the box is empty and not focused)
  let phI = 0;
  setInterval(() => {
    const ta = document.getElementById("qs-say");
    if (!ta || ta.value || document.activeElement === ta || !LV.motionOK()) return;
    phI = (phI + 1) % S7.ph.length; ta.setAttribute("placeholder", t(S7.ph[phI]));
  }, 4200);
  MP.on("home-ask", (el, k) => { MP.state.qs.ask = MP.state.qs.ask === k ? "" : k; MP.commit(); });
  MP.on("home-prof", (el, arg) => {
    const [key, v] = arg.split(":"); const p = MP.state.profile = MP.state.profile || { stage: "", background: "", regions: [] };
    if (key === "regions") {
      let r = (p.regions || []).slice();
      if (v === "open") r = r.includes("open") ? [] : ["open"];
      else { r = r.filter((x) => x !== "open"); r = r.includes(v) ? r.filter((x) => x !== v) : r.concat(v); }
      p.regions = r;
    } else p[key] = p[key] === v ? "" : v;
    syncRecommended(); MP.commit();
  });
  MP.on("home-start", (el, id) => { MP.state.recommended = id; MP.save(); MP.go("#/lens/" + id + (MP.progress(id).complete ? "/done" : "")); });
  MP.on("home-try", (el, id) => { if (!MP.state.recommended) MP.state.recommended = id; MP.save(); MP.go("#/lens/" + id + (MP.progress(id).complete ? "/done" : "")); });
  MP.on("home-replay", () => { replayNext = true; MP.replay(); });
  MP.on("home-jump", () => {
    const qs = document.getElementById("quick-start"); if (!qs) return;
    qs.scrollIntoView({ behavior: LV.motionOK() ? "smooth" : "auto", block: "start" });
    const f = qs.querySelector(".hm-opt, .btn-primary"); if (f) f.focus({ preventScroll: true });
  });

  /* lens columns: a faint lens-coloured spotlight follows a fine pointer */
  if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", (e) => {
      const c = e.target && e.target.closest ? e.target.closest(".hm-lcol") : null; if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px"); c.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
    }, { passive: true });
  }
})();
