/* MajorPilot redesign — "My progress" dashboard (#/dashboard). Owner: progress.
   Reads only the contract APIs (MP.lensSteps, MP.ls, MP.progress, MP.nextStep, MP.lensInfo)
   and stays calm when a lens module hasn't loaded yet (MP.lenses[id] undefined). */
(function () {
  "use strict";
  const esc = MP.h.esc;
  const T = (en, zh) => MP.t({ en, zh });
  const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  const zh = () => MP.lang() === "zh";
  const PLACEHOLDER_STEPS = 6; // 5 content steps + core "reflect" (CONTRACT §5)

  /* ---------- copy ---------- */
  const C = {
    nextStep: { en: "Next step", zh: "下一步" },
    resumeKicker: { en: "Pick up where you left off", zh: "从上次停下的地方继续" },
    startKicker: { en: "A good place to start", zh: "建议从这里开始" },
    fromQuick: { en: "Suggested from your Quick Start answers.", zh: "根据你在快速开始里的回答推荐。" },
    resumeCta: { en: "Continue where I left off", zh: "从上次的地方继续" },
    skimKicker: { en: "You skipped some steps", zh: "你跳过了一些步骤" },
    skimLead: { en: "You've looked through {name}, but nothing is handed in yet. Do any {k} of its {n} steps and your Brief will include it.", zh: "你已经浏览完{name}视角的全部步骤，所以暂时还没有交付物。完成其中任意 {k} 步，小结里就会写进这个视角。" },
    skimCta: { en: "Back to a skipped step", zh: "回到跳过的步骤" }, // same label as core's MP.ui("backToSkipped")
    startCta: { en: "Start {name}", zh: "从 {short} 开始" },
    otherLens: { en: "Or pick a different lens", zh: "或者换一个视角" },
    minsLeft: { en: "About {n} min left", zh: "还剩约 {n} 分钟" },
    stepsTime: { en: "{n} short steps · about {m} min", zh: "{n} 个小步骤 · 约 {m} 分钟" },
    stopAnytime: { en: "stop anytime", zh: "随时可停" },
    handIn: { en: "What you'll hand in", zh: "你最后会交出" },
    handInShort: { en: "You'll hand in", zh: "最后交出" },
    building: { en: "What you're building", zh: "你正在完成的成果" },
    doneMeans: { en: "Done means", zh: "完成的标准" },
    allDoneTitle: { en: "Read your Brief, then share it if you like.", zh: "读一读你的小结，愿意的话再分享出去。" },
    allDoneLead: { en: "You've tried all three lenses. Your Brief pulls together what you did, what stood out to you, and what to look into next.", zh: "三个视角你都试过了。小结汇总了你做了什么、哪些地方让你在意，以及接下来可以了解什么。" },
    allDoneCta: { en: "Open my Brief", zh: "打开我的小结" },
    allDoneKicker: { en: "All three lenses tried", zh: "三个视角都试过了" },
    allDoneMeta: { en: "One page · yours to keep or share", zh: "一页纸 · 可以留着，也可以分享" },

    lanesTitle: { en: "Your three lenses", zh: "你的三个视角" },
    lanesAside: { en: "One LumenLearn problem, three ways in.", zh: "同一个 LumenLearn 问题，三种切入方式。" },
    stNew: { en: "Not started", zh: "未开始" },
    stProgress: { en: "In progress", zh: "进行中" },
    stComplete: { en: "Complete", zh: "已完成" },
    stSkim: { en: "Looked through", zh: "已浏览" },
    skimCount: { en: "{a} of {b} steps done · {n} skipped", zh: "完成 {a}/{b} 步 · 跳过 {n} 步" },
    capSkipped: { en: "First skipped", zh: "第一个跳过的" },
    skipped: { en: "{n} skipped", zh: "跳过 {n} 步" },
    lastFelt: { en: "Last felt", zh: "最近感受" },
    after: { en: "after “{s}”", zh: "做完“{s}”后" },
    hardToo: { en: "marked hard", zh: "标记为有难度" },
    noFeel: { en: "No feelings noted yet", zh: "还没有记录感受" },
    newMeta: { en: "About {m} min · stop anytime", zh: "约 {m} 分钟 · 随时可停" },
    soon: { en: "Being prepared", zh: "正在准备中" },
    aStart: { en: "Start", zh: "开始" },
    aContinue: { en: "Continue", zh: "继续" },
    aReview: { en: "Review", zh: "回看" },
    capNext: { en: "Next", zh: "下一步" },
    capFirst: { en: "Starts with", zh: "第一步" },
    capHanded: { en: "Handed in", zh: "已交出" },
    trackLabel: { en: "{name}: {a} of {b} steps done", zh: "{name}：已完成 {a}/{b} 步" },

    madeTitle: { en: "What you've made", zh: "你的成果" },
    madeAside: { en: "Built from your own work. Nothing is scored.", zh: "全部来自你自己的操作，不打分。" },
    briefTitle: { en: "Your Brief", zh: "你的小结" },
    briefBody: { en: "A one-page summary of what you did, what stood out to you, and what to try next.", zh: "一页纸，写清你做了什么、哪些地方让你在意、下一步可以试什么。" },
    briefLocked: { en: "Finish one lens to unlock your Brief", zh: "完成一个视角即可解锁小结" },
    closest: { en: "Closest: {lens}, {n} to go", zh: "最接近的是{lens}，还差 {n} 步" },
    closestZero: { en: "Closest: {lens}, just one click from done", zh: "最接近的是{lens}，只差最后一步确认" },
    closestOne: { en: "Closest: {lens}, one step to go", zh: "最接近的是{lens}，只差 1 步" },
    anyLens: { en: "Any lens will do, about 15 minutes.", zh: "任意一个视角都可以，大约 15 分钟。" },
    briefReady: { en: "Ready to read", zh: "可以阅读了" },
    briefGrows: { en: "It grows as you finish more lenses.", zh: "完成更多视角，小结会随之补充。" },
    briefOpen: { en: "Open my Brief", zh: "打开我的小结" },
    nLens: { en: ["{n} lens", "{n} lenses"], zh: "{n} 个视角" },
    nEnjoyed: { en: ["{n} step you enjoyed", "{n} steps you enjoyed"], zh: "{n} 个喜欢的步骤" },
    nRefl: { en: ["{n} reflection", "{n} reflections"], zh: "{n} 条回顾" },
    cmpTitle: { en: "Compare lenses", zh: "比较视角" },
    cmpBody: { en: "Your finished lenses side by side: your main move, what you handed in, and how each one felt.", zh: "把做完的视角并排放：你的主要做法、交出的成果，以及各自的感受。" },
    cmpLocked: { en: "Finish two lenses to compare them", zh: "完成两个视角后就可以比较" },
    cmpProgress: { en: "{k} of 2 finished", zh: "已完成 {k}/2" },
    cmpReady: { en: "Ready to compare", zh: "可以比较了" },
    cmpOpen2: { en: "Compare {a} and {b}", zh: "比较 {a} 和 {b}" },
    cmpOpen3: { en: "Compare all three", zh: "比较全部三个视角" },
    cmpAfter3: { en: "Try a third lens and it joins the table.", zh: "再试一个视角，它也会加入比较。" },

    aboutTitle: { en: "About you", zh: "关于你" },
    aboutAside: { en: "Optional. It only shapes which examples we suggest.", zh: "可选，只影响我们推荐的示例。" },
    curious: { en: "Curious about", zh: "感兴趣" },
    nothingYet: { en: "Nothing shared yet, and that's fine", zh: "还没有填写，也没关系" },
    edit: { en: "Edit", zh: "编辑" },
    add: { en: "Add a few details", zh: "补充几项信息" },
    mTitle: { en: "A bit about you", zh: "简单介绍一下你" },
    mLead: { en: "All optional, and you can change it anytime. We never turn this into a score.", zh: "全部可选，随时可以修改。我们不会把它变成任何评分。" },
    mStage: { en: "Where are you now?", zh: "你现在处在哪个阶段？" },
    mBg: { en: "Your background", zh: "你的背景" },
    mRegions: { en: "Where might you study?", zh: "可能去哪里读？" },
    pickAny: { en: "pick any", zh: "可多选" },
    mDone: { en: "Done", zh: "完成" },
    mClear: { en: "Clear all", zh: "全部清除" },

    saveTitle: { en: "Your work is saved on this device.", zh: "你的进度已经保存在这台设备上。" },
    saveBody: { en: "Sign in with your email to pick up where you left off on another device.", zh: "用邮箱登录后，可以换一台设备接着体验。" },
    notNow: { en: "Not now", zh: "暂不" },
    savedTo: { en: "Account progress", zh: "账户进度" },

    h1New: { en: "Your three lenses, *all in one place.*", zh: "三个视角，都在这里。" },
    h1Partway: { en: "You're partway into {name}.", zh: "你已经开始体验\u200b{name}了。" },
    h1Skim: { en: "You've looked through {name}.", zh: "你已经浏览过\u200b{name}了。" },
    h1Some: { en: "You've finished {k} of three lenses.", zh: "三个视角，你已完成{k}个。" },
    h1All: { en: "All three lenses, *done.*", zh: "三个视角，全部完成。" },
    ledeNew: { en: "Nothing started yet. The next step below takes about 15 minutes, and you can stop whenever you like.", zh: "还没有开始。下面的第一步大约 15 分钟，随时可以停下。" },
    ledeMid: { en: "Everything saves on this device as you go, and nothing here is graded.", zh: "所有内容随时自动保存在本设备，这里的一切都不打分。" },
    ledeMidAcct: { en: "Everything saves to your account as you go, and nothing here is graded.", zh: "所有内容随时自动保存到你的账户，这里的一切都不打分。" },

    /* living data */
    figK: { en: "Fig. 1 · Three ways in", zh: "图 1 · 三种切入" },
    figSub: { en: "28-day completion · {n} weekly cohorts", zh: "28 天完成率 · {n} 个每周批次" },
    figAxis: { en: "Cohorts 1–{n}", zh: "第 1–{n} 批" },
    figAlt: { en: "LumenLearn's 28-day completion fell from {a} to {b} across {n} cohorts; it splits into your three lenses. {list}.", zh: "LumenLearn 的 28 天完成率在 {n} 个批次中从 {a} 降到 {b}，并分成你的三个视角。{list}。" },
    figSt: { complete: { en: "Complete", zh: "已完成" }, progress: { en: "Step {a} of {b}", zh: "第 {a}/{b} 步" }, skimmed: { en: "Looked through", zh: "已浏览" }, new: { en: "Not started", zh: "未开始" } },
    replay: { en: "Replay the drawing", zh: "重播图表动画" },
    lanesK: { en: "Progress map", zh: "进度图" },
    madeK: { en: "What you keep", zh: "你能带走的" },
    aboutK: { en: "Optional", zh: "可选" },
    stepsK: { en: "steps", zh: "步" },
    docIn: { en: "In short", zh: "简而言之" },
    docDid: { en: "What you did", zh: "你做了什么" },
    docCant: { en: "What this can't tell you", zh: "这份小结说明不了什么" }
  };
  const c = (k, vars) => fill(MP.t(C[k]), vars || {});
  const plural = (k, n) => { const v = C[k]; const s = zh() ? v.zh : v.en[n === 1 ? 0 : 1]; return fill(s, { n: MP.n(n) }); };

  /* ---------- optional profile options (prefer shared ones if core adds MP.profileOptions) ---------- */
  const OPTS = { // same ids and labels as the Quick Start "Tell us a bit more" fold on home
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
  const opts = (g) => { const ext = MP.profileOptions && MP.profileOptions[g]; return Array.isArray(ext) && ext.length ? ext : OPTS[g]; };
  const optLabel = (g, id) => { const o = opts(g).find((x) => x.id === id) || OPTS[g].find((x) => x.id === id); return o ? MP.t(o.label || o) : String(id); };
  const profile = () => { const p = MP.state.profile || (MP.state.profile = { stage: "", background: "", regions: [] }); if (!Array.isArray(p.regions)) p.regions = []; return p; };

  /* ---------- lens view model ---------- */
  const nContent = (id) => (MP.lenses[id] && MP.lenses[id].steps ? MP.lenses[id].steps.length : PLACEHOLDER_STEPS - 1);
  /** Content steps needed for a lens to count as finished (core's MP.SUBSTANTIVE). */
  const need = (id) => Math.min(MP.SUBSTANTIVE || 3, nContent(id));
  function model(id) {
    const info = MP.lensInfo[id], ready = !!MP.lenses[id];
    const ls = MP.state.lenses[id] || null;
    const steps = ready ? MP.lensSteps(id) : [];
    const p = ready ? MP.progress(id) : { done: 0, total: PLACEHOLDER_STEPS, started: !!(ls && ls.startedAt), complete: !!(ls && ls.completedAt) };
    const st = (sid) => (ls && ls.steps && ls.steps[sid]) || {};
    const status = p.complete ? "complete" : p.skimmed ? "skimmed" : p.started ? "progress" : "new";
    const skipped = steps.filter((s) => st(s.id).skipped && !st(s.id).done).length;
    let feel = null;
    steps.forEach((s) => { const x = st(s.id); if (x.energy) feel = { v: x.energy, step: s, hard: !!x.hard }; });
    const curIdx = status === "progress" && ls ? steps.findIndex((s) => s.id === ls.cur) : -1;
    // a looked-through lens needs a few real steps (not every step) to count as finished
    const left = status === "skimmed" ? Math.max(1, need(id) - (p.contentDone || 0)) : Math.max(0, p.total - p.done);
    const open = status === "skimmed" && MP.firstOpenStep ? MP.firstOpenStep(id) : null;
    return { id, info, ready, ls, steps, p, st, status, skipped, feel, curIdx, left, open };
  }
  /** First sentence only, so the hero never ends mid-thought (glossary [[markup]] survives). */
  const firstSentence = (txt) => { const m = String(txt).match(/^[\s\S]*?(?:[。！？]|[.!?](?=\s|$))/); return m ? m[0] : String(txt); };
  /** zh headings: keep each punctuation-delimited phrase together so lines break between phrases, not inside words. */
  const ph = (txt) => {
    const t = esc(txt);
    if (!zh()) return t;
    const glue = (x) => x.replace(/([\u4e00-\u9fff]{2}[，。？！：；、]*)$/, '<span class="dsh-nb">$1</span>'); // no one-character orphan line
    const parts = t.match(/[^，。？！：；、]+[，。？！：；、]*/g) || [t];
    return parts.length < 2 ? glue(t) : parts.map((x) => `<span class="dsh-ph">${glue(x)}</span>`).join("");
  };
  const name = (id) => MP.t(MP.lensInfo[id].name);
  const minsLeft = (m) => Math.max(2, Math.round(m.info.minutes * (1 - m.p.done / Math.max(1, m.p.total))));

  /* ---------- small pieces ---------- */
  /** *word* in copy → the italic Newsreader accent (en only; zh .it stays upright). Runs on already-escaped html. */
  const accent = (html) => html.replace(/\*([^*]+)\*/g, '<span class="it">$1</span>');
  function track(m, o) {
    o = o || {};
    const n = m.ready ? m.steps.length : PLACEHOLDER_STEPS;
    let html = "";
    for (let i = 0; i < n; i++) {
      const s = m.steps[i], x = s ? m.st(s.id) : {};
      const cur = i === m.curIdx;
      const cls = [x.done ? "done" : x.skipped ? "skip" : "", cur ? "cur" : ""].join(" ").trim();
      // step names appear as a hover tooltip on each dot; one caption under the track says what matters
      const tip = o.tips && s ? ` data-tip="${esc(MP.t(s.short || s.title))}"` : "";
      // the current step's glow is a real element (it breathes 3 times on arrival, then rests)
      html += `<li class="${cls}" style="--i:${i}"${tip}><span class="d">${cur ? '<i class="ring"></i>' : ""}</span></li>`;
    }
    const aria = c("trackLabel", { name: name(m.id), a: MP.n(m.p.done), b: MP.n(m.p.total) });
    return `<ol class="dsh-track ${o.cls || ""}" style="--n:${n}" role="img" aria-label="${esc(aria)}">${html}</ol>`;
  }
  /** One calm line under a lane's track: the next step, the first step, or what was handed in. */
  function trackCap(m) {
    let k, v;
    if (m.status === "complete") { k = c("capHanded"); v = MP.t(m.info.handIn); }
    else if (!m.ready) return "";
    else if (m.status === "skimmed") {
      if (!m.open) return "";
      k = c("capSkipped"); v = MP.t(m.open.short || m.open.title);
    } else if (m.status === "progress") {
      const s = m.curIdx >= 0 ? m.steps[m.curIdx] : m.steps.find((x) => !m.st(x.id).done);
      if (!s) return "";
      k = c("capNext"); v = MP.t(s.short || s.title);
    } else { k = c("capFirst"); v = MP.t(m.steps[0].short || m.steps[0].title); }
    return `<p class="dsh-track-cap"><span class="k">${k}</span><span class="v">${esc(v)}</span></p>`;
  }
  function meter(v) {
    const lv = { enjoyed: 3, neutral: 2, drained: 1 }[v] || 0;
    return `<span class="dsh-meter" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= lv ? "on" : ""}"></i>`).join("")}</span>`;
  }
  /** A small reading ring in the "Last felt" cell of the lens row the Noticed line is about. */
  const obsDot = (m) => (m.noticed && MP.ai ? `<span class="dsh-obs-dot" title="${esc(MP.t(AIW.dotTip))}">${MP.ai.mark({ size: 12 })}<span class="sr-only">${esc(MP.t(AIW.dotTip))}</span></span>` : "");
  function feelLine(m) {
    if (!m.feel) return `<div class="dsh-feel none">${obsDot(m)}${c("noFeel")}</div>`;
    const word = MP.t(MP.UI.feelings[m.feel.v]);
    const where = c("after", { s: esc(MP.t(m.feel.step.short || m.feel.step.title)) });
    return `<div class="dsh-feel"><span class="k">${c("lastFelt")}</span>
      <span class="v">${meter(m.feel.v)}<b>${esc(word)}</b>${obsDot(m)}</span>
      <span class="w">${where}${m.feel.hard ? ` · ${c("hardToo")}` : ""}</span></div>`;
  }
  function statusTag(m) {
    const k = { new: "stNew", progress: "stProgress", skimmed: "stSkim", complete: "stComplete" }[m.status];
    return `<span class="dsh-status ${m.status}"><i aria-hidden="true"></i>${c(k)}</span>`;
  }
  /** Steps done as a large Newsreader fraction (content basis for a looked-through lens, like its copy). */
  function frac(m) {
    const skim = m.status === "skimmed";
    const a = skim ? m.p.contentDone : m.status === "new" ? 0 : m.p.done;
    const b = skim ? m.p.contentTotal : m.ready ? m.p.total : PLACEHOLDER_STEPS;
    return `<span class="dsh-frac num" aria-hidden="true"><b${a ? " data-ld-count" : ""}>${MP.n(a || 0)}</b><i>/${MP.n(b)}</i></span>`;
  }

  /* ---------- living data: the problem line splits into three lens beams, each a track of the student's real steps ---------- */
  function progressFig(models, focus) {
    const W = 540, H = 300, L = MP.live, nC = L.rates.length, half = Math.floor(nC / 2);
    const sp = L.sparkPath(156, 64, 3), ox = 4, oy = 88;
    const pts = L.rates.map((r, i) => [ox + sp.x(i), oy + sp.y(r)]);
    const seg = (a, b) => pts.slice(a, b).map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const [ex0, ey0] = pts[nC - 1];
    const divX = (pts[half - 1][0] + pts[half][0]) / 2;
    const ys = { ba: 50, ds: 150, ai: 250 }, tx0 = 272, tx1 = 530;
    let svg = `<svg class="ldp-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
    svg += `<line class="ldp-div" x1="${divX.toFixed(1)}" x2="${divX.toFixed(1)}" y1="${oy - 10}" y2="${oy + 74}"/>`;
    svg += `<path class="ldp-spark" pathLength="1" d="${seg(0, half)}"/><path class="ldp-spark rec" pathLength="1" d="${seg(half - 1, nC)}"/>`;
    const labels = [], alts = [];
    MP.lensOrder.forEach((id, k) => {
      const m = models[id], y = ys[id];
      const n = m.ready ? m.steps.length : PLACEHOLDER_STEPS;
      const xs = Array.from({ length: n }, (_, i) => tx0 + i * (tx1 - tx0) / (n - 1));
      let lastSeen = -1, lastDone = -1;
      for (let i = 0; i < n; i++) { const s0 = m.steps[i], x = s0 ? m.st(s0.id) : {}; if (x.done || x.skipped) lastSeen = i; if (x.done) lastDone = i; }
      const cur = m.status === "progress" ? (m.curIdx >= 0 ? m.curIdx : Math.min(n - 1, lastSeen + 1)) : -1;
      // the solid fill runs to the current step or the last step actually done (skipped steps alone don't fill it)
      const reach = m.status === "complete" ? n - 1 : Math.max(lastDone, cur);
      const on = focus === "all" || id === focus;
      svg += `<g class="ldp-lane ${id}${on ? " is-focus" : ""}" style="--k:${k}">`;
      svg += `<path class="ldp-beam" pathLength="1" d="M${ex0.toFixed(1)},${ey0.toFixed(1)} C${(ex0 + 54).toFixed(1)},${ey0.toFixed(1)} ${tx0 - 60},${y} ${tx0},${y}"/>`;
      svg += `<line class="ldp-rail" x1="${tx0}" x2="${tx1}" y1="${y}" y2="${y}"/>`;
      if (reach > 0) svg += `<line class="ldp-fill" x1="${tx0}" x2="${xs[reach].toFixed(1)}" y1="${y}" y2="${y}"/>`;
      xs.forEach((x, i) => {
        const s0 = m.steps[i], st = s0 ? m.st(s0.id) : {};
        const cls = i === cur ? "cur" : st.done ? "done" : st.skipped ? "skip" : "todo";
        if (cls === "cur") svg += `<circle class="ldp-glow" cx="${x.toFixed(1)}" cy="${y}" r="7"/>`;
        svg += `<circle class="ldp-n ${cls}" style="--i:${i}" cx="${x.toFixed(1)}" cy="${y}" r="${cls === "cur" ? 6.5 : 5.5}"/>`;
      });
      svg += `</g>`;
      const word = fill(MP.t(C.figSt[m.status]), { a: MP.n(Math.max(1, cur + 1)), b: MP.n(n) });
      labels.push(`<span class="ldp-lab ${id}${on ? " is-focus" : ""}" style="left:${(tx0 / W * 100).toFixed(2)}%;top:${((y - 15) / H * 100).toFixed(2)}%"><b>${MP.lensInfo[id].short}</b>${esc(word)}</span>`);
      alts.push(`${MP.lensInfo[id].short}: ${word}`);
    });
    svg += `<circle class="ldp-split" cx="${ex0.toFixed(1)}" cy="${ey0.toFixed(1)}" r="5.5"/></svg>`;
    labels.push(`<span class="ldp-axis" style="left:${(ox / W * 100).toFixed(2)}%;top:${((oy + 78) / H * 100).toFixed(2)}%">${c("figAxis", { n: MP.n(nC) })}</span>`);
    const alt = c("figAlt", { a: MP.pct(L.earlier, 1), b: MP.pct(L.recent, 1), n: MP.n(nC), list: alts.join(zh() ? "；" : "; ") });
    return `<figure class="ldp" data-action="dash-replay" title="${esc(c("replay"))}">
      <figcaption class="ldp-cap"><span class="ldp-cap-t"><span class="ld-label">${c("figK")}</span><span class="ldp-sub">${c("figSub", { n: MP.n(nC) })}</span></span>${MP.h.readout({ size: "md", count: true })}</figcaption>
      <div class="ldp-box" role="img" aria-label="${esc(alt)}" style="aspect-ratio:${W}/${H}">${svg}${labels.join("")}</div>
    </figure>`;
  }

  /* =====================================================================================================
     AI-6 · "Noticed" + "Why this next" (AI-LAYER.md §2 AI-6). No model: every line is composed here, by rules,
     from the student's own marks (hard / enjoyed / drained), hint use, skipped steps, reflection picks, notes and
     follow-up answers, and the cross-lens choices that MP.nextStep() already acted on. Validated with MP.ai.check
     (banned lexicon, known numbers, quotes that really exist), then handed to MP.ai.block, which presents it.
     Coach, never grader: it points at what the student did; it never scores, ranks or says what they are good at.
     ===================================================================================================== */
  const AIW = {
    kick: { en: "Noticed", zh: "留意到" },
    another: { en: "Another", zh: "换一条" },
    notUseful: { en: "Not useful", zh: "没帮助" },
    dotTip: { en: "The Noticed line above is about this lens", zh: "上方“留意到”说的是这个视角" },
    tMarks: (n) => ({ en: `${n} ${n === 1 ? "feeling" : "feelings"} you flagged`, zh: `你标的 ${n} 处感受` }),
    tLens: (s, a, b) => ({ en: `${s} ${a}/${b}`, zh: `${s} ${a}/${b}` }),
    tHints: (n) => ({ en: `${n} ${n === 1 ? "hint" : "hints"}`, zh: `提示 ${n} 条` }),
    tRefl: (n) => ({ en: `${n} ${n === 1 ? "reflection" : "reflections"}`, zh: `回顾 ${n} 条` }),
    tSkip: (n) => ({ en: `${n} skipped`, zh: `跳过 ${n} 步` }),
    tNothing: { en: "Your three lenses · nothing started", zh: "三个视角 · 都还没开始" },
    traceDone: (n) => ({ en: `Read ${n} ${n === 1 ? "thing" : "things"} in your work`, zh: `读了你的 ${n} 处记录` })
  };
  const EN_N = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const ZH_N = ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];
  const enN = (n) => EN_N[n] || String(n), zhN = (n) => ZH_N[n] || String(n);
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const noZw = (s) => String(s || "").replace(/​/g, "");
  /** A step title as the student saw it, in both languages (the ​ phrase hints stripped for quoting). */
  const ttl = (s) => ({ en: noZw(s.title.en), zh: noZw(s.title.zh || s.title.en) });

  /** zh prose: keep the last few characters of a line together, so a paragraph never ends on a lone "题。". */
  /** A quoted title that ends in ? or ! needs no extra full stop after it ("…real change?”." → "…real change?”"). */
  const tidy = (b) => (typeof b === "string" ? b.replace(/([?!？！])”[.。]/g, "$1”") : Array.isArray(b) ? b.map(tidy) : b);
  const glueStr = (x) => x.replace(/([\u4e00-\u9fff“”]{3}[\u4e00-\u9fff“”，。？！]{1,2})$/, '<span class="nowrap">$1</span>');
  function glueZh(body) {
    if (typeof body === "string") return glueStr(body);
    if (!Array.isArray(body)) return body;
    const out = body.slice();
    for (let i = out.length - 1; i >= 0; i--) { if (typeof out[i] === "string") { out[i] = glueStr(out[i]); break; } if (!(out[i] && out[i].cite)) break; }
    return out;
  }
  /** Everything AI-6 reads, gathered once per render. Lenses whose module hasn't loaded are skipped. */
  function evidence() {
    const lenses = [];
    MP.lensOrder.forEach((id) => {
      const L = MP.lenses[id]; if (!L || !L.steps) return;
      const ls = MP.state.lenses[id]; if (!ls) return;
      const all = MP.lensSteps(id), p = MP.progress(id);
      const steps = L.steps.map((s) => {
        const x = (ls.steps && ls.steps[s.id]) || {};
        return { lens: id, id: s.id, n: all.findIndex((y) => y.id === s.id) + 1, t: ttl(s), done: !!x.done, skipped: !!x.skipped && !x.done, energy: x.energy || "", hard: !!x.hard, hints: x.hints || 0 };
      });
      const refl = ls.refl || {};
      lenses.push({ id, short: MP.lensInfo[id].short, ls, p, steps, refl, note: String(refl.note || "").trim(), follow: refl.follow || null,
        reflN: all.findIndex((y) => y.id === "reflect") + 1, started: p.started || steps.some((s) => s.done || s.skipped) });
    });
    const steps = lenses.reduce((a, l) => a.concat(l.steps), []);
    return { lenses, steps, by: (id) => lenses.find((l) => l.id === id) || null };
  }

  /** The reading trace: what this line looked at. */
  function noticedTrace(E) {
    const items = [];
    E.lenses.filter((l) => l.started).forEach((l) => items.push(AIW.tLens(l.short, l.p.contentDone, l.p.contentTotal)));
    const marks = E.steps.filter((s) => s.energy || s.hard).length;
    const hints = E.steps.reduce((a, s) => a + s.hints, 0);
    const refl = E.lenses.filter((l) => l.note || (l.refl.pick && l.refl.pick !== "")).length;
    const skip = E.steps.filter((s) => s.skipped).length;
    if (marks) items.push(AIW.tMarks(marks));
    if (hints) items.push(AIW.tHints(hints));
    if (refl) items.push(AIW.tRefl(refl));
    if (skip) items.push(AIW.tSkip(skip));
    if (!items.length) items.push(AIW.tNothing);
    return items.slice(0, 6);
  }

  /* ---- Noticed: rules, each with a score and 2 phrasings; a rule whose slots can't all be filled from real evidence
         returns nothing (never padded). ---- */
  const q = (t) => ({ en: `“${t.en}”`, zh: `“${t.zh}”` });
  function rules(E) {
    const out = [];
    const add = (o) => out.push(o);
    const S = (s) => ({ lens: s.lens, step: s.id });
    const pickOf = (s) => { const l = E.by(s.lens); return l && l.refl.pick === s.id; };

    // 1 · hard AND enjoyed on the same step (two in different lenses → one combined line)
    const hj = E.steps.filter((s) => s.hard && s.energy === "enjoyed");
    const hjPair = [];
    hj.forEach((s) => { if (hjPair.length < 2 && !hjPair.some((x) => x.lens === s.lens)) hjPair.push(s); });
    if (hjPair.length === 2) {
      const [a, b] = hjPair, ta = q(a.t), tb = q(b.t);
      const both = pickOf(a) && pickOf(b), tail = pickOf(a) ? a : pickOf(b) ? b : null;
      const tE = both ? " Both are also the steps you said you'd do every week." : tail ? ` The ${tail.lens.toUpperCase()} one is also the step you said you'd do every week.` : "";
      const tZ = both ? "这两步，也都是你说愿意每周做的。" : tail ? `其中 ${tail.lens.toUpperCase()} 的那一步，也是你说愿意每周做的。` : "";
      add({ id: "hardjoy2", score: 95, lenses: [a.lens, b.lens], cites: [S(a), S(b)], v: [
        { en: `Twice now, the step you marked hard was also one you enjoyed: ${ta.en} in ${a.lens.toUpperCase()} and ${tb.en} in ${b.lens.toUpperCase()}.${tE}`,
          zh: `已经两次了：你标为有难度的那一步，恰好也是你喜欢的：${a.lens.toUpperCase()} 的${ta.zh}和 ${b.lens.toUpperCase()} 的${tb.zh}。${tZ}` },
        { en: `${ta.en} in ${a.lens.toUpperCase()} and ${tb.en} in ${b.lens.toUpperCase()} have something in common: you marked both hard, and you enjoyed both.${tE}`,
          zh: `${a.lens.toUpperCase()} 的${ta.zh}和 ${b.lens.toUpperCase()} 的${tb.zh}有个共同点：两步你都标了有难度，也都标了喜欢。${tZ}` }] });
    } else if (hj.length) {
      const s = hj[0], t = q(s.t), N = s.lens.toUpperCase(), only = hj.filter((x) => x.lens === s.lens).length === 1;
      const tE = pickOf(s) ? " It's also the step you said you'd do every week." : "", tZ = pickOf(s) ? "这也是你说愿意每周做的那一步。" : "";
      add({ id: "hardjoy." + s.lens + "." + s.id, score: 88, lenses: [s.lens], cites: [S(s)], v: [
        { en: `You marked ${t.en} in ${N} as hard, and enjoyed it anyway.${tE}`, zh: `${N} 的${t.zh}你标了有难度，但也标了喜欢。${tZ}` },
        { en: only ? `${t.en} is the one step in ${N} that was both hard and enjoyable for you.${tE}` : `Hard and enjoyable at once: that's how you marked ${t.en} in ${N}.${tE}`,
          zh: only ? `在 ${N} 里，${t.zh}是唯一一步既难、你又喜欢的。${tZ}` : `又难又喜欢：这是你给 ${N} 的${t.zh}留下的标记。${tZ}` }] });
    }

    // 2 · hints ≥ 2 on a step, then finished it (this is the student's own dashboard, so hint use may show here)
    const hs = E.steps.filter((s) => s.hints >= 2 && s.done).sort((a, b) => b.hints - a.hints)[0];
    if (hs) {
      const t = q(hs.t), N = hs.lens.toUpperCase();
      const hE = hs.hard ? " You'd marked it hard, too." : "", hZ = hs.hard ? "你也把它标成了有难度。" : "";
      add({ id: "hints." + hs.lens + "." + hs.id, score: hs.hints >= 3 ? 82 : 80, lenses: [hs.lens], cites: [S(hs)], v: hs.hints >= 3 ? [
        { en: `You opened the worked example on ${t.en}, then finished the step yourself.${hE}`, zh: `在${t.zh}这一步，你看了示例，然后自己做完了。${hZ}` },
        { en: `On ${t.en} in ${N} you went all the way to the worked example, and still did the step yourself.${hE}`, zh: `${N} 的${t.zh}你一直看到了示例，最后还是自己动手做完的。${hZ}` }] : [
        { en: `${t.en} in ${N} took two hints, and then you finished it.${hE}`, zh: `${N} 的${t.zh}你看了两条提示，然后把这一步做完了。${hZ}` },
        { en: `You asked for two hints on ${t.en} and kept going to the end of the step.${hE}`, zh: `在${t.zh}上你要了两次提示，然后接着把这一步做完了。${hZ}` }] });
    }

    // 3 · a reflection follow-up answer, tied back to its step
    E.lenses.forEach((l) => {
      const f = l.follow; if (!f || !f.a || f.a === "skip" || f.a === "unsure") return;
      const pickS = l.steps.find((s) => s.id === l.refl.pick), N = l.short;
      const R = { lens: l.id, step: "reflect" };
      const P = pickS ? q(pickS.t) : null;
      let v = null, cite = pickS ? S(pickS) : R;
      if (f.a === "good" && P) v = [
        { en: `You said ${P.en} was hard in a good way, not just hard. Worth noticing whether another lens gives you that feeling too.`, zh: `你说${P.zh}是“难得有意思”，不只是难。可以留意一下，别的视角会不会也给你这种感觉。` },
        { en: `Hard in a good way: that's how you described ${P.en} in ${N}. If a second lens feels like that, it'll show in your Brief.`, zh: `“难得有意思”，是你对 ${N} 的${P.zh}的说法。如果另一个视角也是这种感觉，小结里会看得到。` }];
      else if (f.a === "just" && P) v = [
        { en: `You said ${P.en} was just hard, not hard in a good way. That's useful to know too.`, zh: `你说${P.zh}就是难，不是难得有意思。这也是有用的信息。` },
        { en: `For ${P.en} in ${N}, your answer was "just hard". Knowing which kind of hard you don't enjoy helps as much as the reverse.`, zh: `对 ${N} 的${P.zh}，你的回答是“就是难”。知道自己不喜欢哪种难，和知道喜欢哪种一样有用。` }];
      else if ((f.a === "numbers" || f.a === "deciding" || f.a === "both") && P) {
        const w = { numbers: ["the numbers themselves", "数字本身"], deciding: ["deciding what to do with them", "拿数字来做决定"], both: ["both the numbers and the deciding", "数字和做决定两样都有"] }[f.a];
        v = [{ en: `On ${P.en}, what pulled you in was ${w[0]}.`, zh: `在${P.zh}这一步，吸引你的是${w[1]}。` },
          { en: `You enjoyed ${P.en} in ${N}, and you put it down to ${w[0]}.`, zh: `${N} 的${P.zh}你喜欢，你说原因是${w[1]}。` }];
      } else if ((f.a === "problem" || f.a === "way" || f.a === "work") && l.refl.pick === "none") {
        const isW = f.a === "work" || f.a === "way";
        v = [{ en: isW ? `None of ${N}'s steps pulled you in, and you said it was the kind of work, not the problem.` : `None of ${N}'s steps pulled you in, and you said it was the LumenLearn problem, not the kind of work.`,
          zh: isW ? `${N} 的步骤都没太吸引你，你说原因在这类工作，而不是这个问题。` : `${N} 的步骤都没太吸引你，你说原因在 LumenLearn 这个问题，而不是这类工作。` },
        { en: isW ? `In ${N}, it was the way of working that didn't land for you, not the problem. That's a clear signal to bring to an advisor.` : `In ${N}, it was the problem that didn't land, not the way of working, so the same kind of work on another problem might feel different.`,
          zh: isW ? `在 ${N} 里，没打动你的是这种做事方式，而不是问题本身。这一点值得拿去和顾问聊聊。` : `在 ${N} 里，没打动你的是问题本身，而不是做事方式；换一个问题，同样的工作也许感觉就不一样。` }];
        cite = R;
      } else if ((f.a === "problem" || f.a === "way") && P) {
        const isW = f.a === "way";
        v = [{ en: `You picked ${P.en} for ${isW ? "the way of working" : "the problem itself"}, not ${isW ? "the problem" : "the way of working"}.`, zh: `你选${P.zh}，看重的是${isW ? "这种做事方式" : "问题本身"}，而不是${isW ? "问题本身" : "做事方式"}。` },
          { en: `What made ${P.en} your pick in ${N}: ${isW ? "the way of working" : "the problem itself"}, by your own answer.`, zh: `按你自己的回答，让你选 ${N} 的${P.zh}的，是${isW ? "这种做事方式" : "问题本身"}。` }];
      } else if ((f.a === "topic" || f.a === "surprise")) {
        const isT = f.a === "topic";
        v = [{ en: `In your ${N} reflection, ${isT ? "the topic stayed with you more than the surprise" : "the surprise itself stayed with you more than the topic"}.`, zh: `在 ${N} 的回顾里，留下印象的是${isT ? "话题本身，而不是那一下的意外" : "那一下的意外，而不是话题本身"}。` },
          { en: `You said it was ${isT ? "the topic, not the surprise," : "the surprise, not the topic,"} that stayed with you in ${N}.`, zh: `你说在 ${N} 里记住的是${isT ? "话题本身" : "那份意外"}。` }];
        cite = R;
      } else if (/^step:/.test(f.a)) {
        const s = l.steps.find((x) => x.id === f.a.slice(5)); if (!s) return;
        const T2 = q(s.t), X = MP.ai.text, ng = l.note ? X.find(l.note, MP.ai.lex.negative)[0] : null;
        const cl = ng ? X.clause(l.note, ng.s, { maxWords: 9, maxChars: 18 }) : null;
        const Q = cl && cl.text ? { q: X.quote(l.note, cl.s, cl.e), lens: l.id } : null;
        v = Q ? [{ en: ["You wrote ", Q, ` in your ${N} reflection, and traced it back to ${T2.en}. Knowing which step did it is more useful than the feeling alone.`],
            zh: [`你在 ${N} 的回顾里写了`, Q, `，又把它归到${T2.zh}这一步。知道是哪一步，比只记下感觉更有用。`] },
          { en: [`In ${N}, the step behind `, Q, ` was ${T2.en}, by your own answer.`], zh: [`按你自己的回答，`, Q, `说的是 ${N} 的${T2.zh}这一步。`] }]
          : [{ en: `You traced the feeling in your ${N} reflection back to ${T2.en}.`, zh: `你在 ${N} 的回顾里，把那种感觉归到了${T2.zh}这一步。` },
          { en: `In ${N}, ${T2.en} is the step you named when you said how it felt.`, zh: `说到 ${N} 给你的感觉时，你点的是${T2.zh}这一步。` }];
        cite = S(s);
      }
      if (v) add({ id: "follow." + l.id, score: 86, lenses: [l.id], cites: [cite], v });
    });

    // 4 · the student's own words: a surprise / "it clicked" moment, or a draining one, quoted exactly
    E.lenses.forEach((l) => {
      if (!l.note) return;
      const X = MP.ai.text, LX = MP.ai.lex;
      const sur = X.find(l.note, LX.surprise)[0], neg = !sur && X.find(l.note, LX.negative)[0];
      const hit = sur || neg; if (!hit) return;
      const c = X.clause(l.note, hit.s, { maxWords: 10, maxChars: 22 });
      const qt = X.quote(l.note, c.s, c.e); if (!qt || X.chars(qt) < 4) return;
      const N = l.short, Q = { q: qt, lens: l.id }, R = { lens: l.id, step: "reflect" };
      if (sur) add({ id: "note." + l.id, score: 76 - E.lenses.indexOf(l), lenses: [l.id], cites: [R], src: [l.note], v: [
        { en: [`In your ${N} reflection you wrote `, Q, ". Worth asking which other lens gives you a moment like that."], zh: [`你在 ${N} 的回顾里写道`, Q, "。可以留意一下：别的视角会不会也给你这样的时刻。"] },
        { en: [`You described a moment in ${N}: `, Q, ". If another lens gives you one, your Brief will set them side by side."], zh: [`你在 ${N} 里记下了这样一刻：`, Q, "。如果另一个视角也有这样的时刻，小结里会把它们并排放。"] }] });
      else add({ id: "noteneg." + l.id, score: 62, lenses: [l.id], cites: [R], src: [l.note], v: [
        { en: [`You wrote `, Q, ` about ${N}. That's worth keeping: knowing which parts drain you is as useful as knowing which don't.`], zh: [`你在 ${N} 的回顾里写了`, Q, "。这条值得留着：知道哪些部分让你累，和知道哪些不累一样有用。"] },
        { en: [`Your ${N} note says `, Q, ". If a second lens feels different, that contrast will be the interesting part of your Brief."], zh: [`你给 ${N} 的感受是`, Q, "。如果另一个视角感觉不一样，这个对比会是小结里最值得看的部分。"] }] });
    });

    // 5 · same lens, opposite feelings (enjoyed one step, drained by another)
    E.lenses.forEach((l) => {
      const a = l.steps.find((s) => s.energy === "enjoyed"), b = l.steps.find((s) => s.energy === "drained");
      if (!a || !b) return;
      const ta = q(a.t), tb = q(b.t), N = l.short;
      add({ id: "contrast." + l.id, score: 74, lenses: [l.id], cites: [S(a), S(b)], v: [
        { en: `In ${N}, you enjoyed ${ta.en} but ${tb.en} drained you: same data, a different kind of task.`, zh: `在 ${N} 里，你喜欢${ta.zh}，而${tb.zh}让你有点累：数据是同一份，只是任务的类型不同。` },
        { en: `Same lens, different feelings: you enjoyed ${ta.en} in ${N} and marked ${tb.en} as draining.`, zh: `同一个视角，感受却不同：${N} 的${ta.zh}你喜欢，${tb.zh}让你有点累。` }] });
    });

    // 6 · skipped steps still open in a lens
    E.lenses.forEach((l) => {
      const open = l.steps.filter((s) => s.skipped); if (!open.length || l.p.complete) return;
      const s = open[0], t = q(s.t), N = l.short, k = open.length;
      const mins = Math.max(2, Math.round(MP.lensInfo[l.id].minutes / Math.max(1, l.steps.length)));
      const skim = l.p.skimmed, need1 = skim && l.p.needed === 1;
      const nE = need1 ? (k === 1 ? ` Doing it puts ${N} into your Brief.` : ` Doing any one of them puts ${N} into your Brief.`) : "";
      const nZ = need1 ? (k === 1 ? `做完它，小结里就会有 ${N}。` : `其中任做一步，小结里就会有 ${N}。`) : "";
      add({ id: "open." + l.id, score: skim ? 78 : 70, lenses: [l.id], cites: [S(s)], nums: [mins], v: [
        k === 1 ? { en: `One step in ${N} is still open: ${t.en}, about ${mins} minutes.${nE}`, zh: `${N} 里还有一步没做：${t.zh}，大约 ${mins} 分钟。${nZ}` }
          : { en: `${cap1(enN(k))} steps in ${N} are still open, starting with ${t.en}.${nE}`, zh: `${N} 里还有${zhN(k)}步没做，第一步是${t.zh}。${nZ}` },
        { en: `You skipped ${t.en} in ${N}; it's still there whenever you want it.${nE}`, zh: `你跳过了 ${N} 的${t.zh}，随时可以回去补上。${nZ}` }] });
    });

    // 7 · steps done but no feelings marked yet
    E.lenses.forEach((l) => {
      const done = l.steps.filter((s) => s.done).length;
      if (done < 2 || l.steps.some((s) => s.energy || s.hard)) return;
      const N = l.short;
      if (l.p.complete) { add({ id: "nofeel." + l.id, score: 40, lenses: [l.id], cites: [S(l.steps.filter((s) => s.done).slice(-1)[0])], v: [
        { en: `You finished ${N} without marking how any step felt. One quick mark on the steps you remember gives your Brief something real to say.`, zh: `你做完了 ${N}，但一步都没有标感受。给还记得的几步随手标一下，小结里才写得出真东西。` },
        { en: `${N} is done, with no feelings marked. Without them I can tell which steps you finished, not which ones you liked.`, zh: `${N} 已经做完，但没有标任何感受。没有它们，我只看得出你做完了哪些，看不出你喜欢哪些。` }] }); return; }
      add({ id: "nofeel." + l.id, score: 40, lenses: [l.id], cites: [S(l.steps.filter((s) => s.done).slice(-1)[0])], v: [
        { en: `You've done ${enN(done)} steps in ${N} without marking how any of them felt. One quick mark gives your Brief something real to say about what stood out.`, zh: `你在 ${N} 里做了${zhN(done)}步，但还没标过感受。随手标一下，小结里才写得出哪些地方让你在意。` },
        { en: `${cap1(enN(done))} steps into ${N}, and no feelings marked yet. Without them I can't tell which parts you liked, only which you finished.`, zh: `${N} 已经做了${zhN(done)}步，还没有一处感受标记。没有它们，我只看得出你做完了哪些，看不出你喜欢哪些。` }] });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  /** Fallback (rule 5 of the spec): time since the last session + steps left. The one place Date.now() reaches text. */
  function fallbackObs(E) {
    const dash = MP.ai.state().dash, now = Date.now(), H = 3600e3, D = 864e5;
    const inProg = E.lenses.find((l) => l.started && !l.p.complete);
    const thin = E.steps.filter((s) => s.done).length < 2 && !E.steps.some((s) => s.energy || s.hard);
    if (!E.lenses.some((l) => l.started)) return { id: "empty", unsure: true, lenses: [], cites: [], v: [
      { en: "Nothing to notice yet. Once you've done a step or two and marked how they felt, this line will point out what stands out.", zh: "现在还看不出什么。做一两步、标一下感受之后，这里会指出值得留意的地方。" }] };
    if (thin && inProg) return { id: "thin." + inProg.id, unsure: true, lenses: [inProg.id], cites: [], v: [
      { en: `Only a step into ${inProg.short}, there isn't much to read yet. Mark how the next step feels and there'll be something to point at.`, zh: `${inProg.short} 才刚开始，能看出的还不多。下一步做完标一下感受，这里就有东西可说了。` },
      { en: `I can't tell much from one step in ${inProg.short}. A feeling mark or two on the next steps will change that.`, zh: `只凭 ${inProg.short} 的一步，我还看不出什么。后面几步标一两处感受，就不一样了。` }] };
    if (!inProg) return null;
    const left = Math.max(1, inProg.p.total - inProg.p.done);
    let when = null, mode = "";
    if (dash.prevAt && now - dash.prevAt > H) { when = dash.prevAt; mode = "here"; }
    else if (inProg.ls.startedAt && now - inProg.ls.startedAt > H) { when = inProg.ls.startedAt; mode = "start"; }
    const days = when ? Math.floor((now - when) / D) : -1;
    const wE = days === 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
    const wZ = days === 0 ? "今天早些时候" : days === 1 ? "昨天" : `${days} 天前`;
    const N = inProg.short, lE = left === 1 ? "one step" : `${enN(left)} steps`, lZ = `${zhN(left)}步`;
    const hE = mode === "here" ? `You were last here ${wE}` : mode === "start" ? `You started ${N} ${wE}` : "";
    const hZ = mode === "here" ? `你上次来是${wZ}` : mode === "start" ? `你${wZ}开始了 ${N}` : "";
    return { id: "time." + inProg.id, score: 10, lenses: [inProg.id], cites: [], nums: days > 0 ? [days] : [], v: [
      { en: hE ? `${hE}; you're ${lE} from finishing ${N}.` : `You're ${lE} from finishing ${N}.`, zh: hZ ? `${hZ}；离做完 ${N} 还差${lZ}。` : `离做完 ${N} 还差${lZ}。` },
      { en: hE ? `${hE}. ${cap1(lE)} left, and your earlier answers are saved as you left them.` : `${cap1(lE)} left in ${N}, and your earlier answers are saved as you left them.`,
        zh: hZ ? `${hZ}。还剩${lZ}，之前的回答都原样保存着。` : `${N} 还剩${lZ}，之前的回答都原样保存着。` }] };
  }

  /** All usable observations for this student, validated in both languages, hidden ones removed. */
  function observations(E) {
    const hidden = MP.ai.state().dash.hidden || [];
    const sources = E.lenses.map((l) => l.note).filter(Boolean)
      .concat(E.steps.map((s) => s.t.en), E.steps.map((s) => s.t.zh),
        ["难得有意思", "就是难"], ...E.lenses.map((l) => (l.follow && l.follow.chips || []).map((c) => [c.en, c.zh])).flat());
    const ok = (o) => o.v.every((x) => ["en", "zh"].every((lg) => MP.ai.check(x[lg], { numbers: (o.nums || []).concat([0]), sources }).ok));
    const list = rules(E).filter((o) => !hidden.includes(o.id) && ok(o));
    const fb = fallbackObs(E);
    if (fb && !hidden.includes(fb.id) && ok(fb) && (!list.length || !fb.unsure)) list.push(fb);
    return list;
  }

  /** Arrival = the dashboard isn't on screen yet (a language switch or click re-render keeps the same visit). */
  const arriving = () => !document.querySelector("#view .pg-dash");
  /** Pick this visit's observation: the top one not shown in the last 2 visits (rotation in MP.state.ai.dash). */
  function currentObs(list) {
    const dash = MP.ai.state().dash;
    if (!Array.isArray(dash.shown)) dash.shown = [];
    const byId = (id) => list.find((o) => o.id === id);
    const arrive = arriving();
    if (arrive) { dash.prevAt = dash.at || null; dash.at = Date.now(); }
    if (!arrive && dash.cur && byId(dash.cur)) return byId(dash.cur);
    if (!list.length) { dash.cur = ""; return null; }
    const recent = arrive ? dash.shown.slice(0, 2) : [];
    const o = list.find((x) => !recent.includes(x.id)) || list[0];
    dash.cur = o.id;
    if (arrive && !o.unsure && dash.shown[0] !== o.id) { dash.shown.unshift(o.id); dash.shown = dash.shown.slice(0, 6); }
    MP.save();
    return o;
  }

  /** The Noticed block (ink: ring + NOTICED kicker + a serif sentence + one cite chip; Another / Not useful on hover). */
  function noticedHTML(E, list, o) {
    if (!MP.ai || !o) return "";
    const key = "dash.noticed", rk = "dash.n." + o.id;
    const vi = MP.ai.variant(rk, o.v.length, MP.ai.hash(o.id));
    const body = o.v[vi];
    const many = list.filter((x) => !x.unsure).length;
    const acts = o.unsure ? "" : MP.ai.actions({ regen: ["dash-ai-next", o.id], dismiss: ["dash-ai-hide", o.id],
      labels: { regen: AIW.another, dismiss: AIW.notUseful } }).replace(/data-fk="dash-ai-(next|hide):[^"]*"/g, 'data-fk="dash-ai-$1"');
    const trace = noticedTrace(E);
    return `<div class="dsh-noticed${o.unsure ? " is-unsure" : ""}${many > 1 ? " has-more" : ""}" data-obs="${esc(o.id)}">${MP.ai.block({
      key, fp: MP.ai.fp([o.id, vi]), kind: "ink", live: false, kicker: MP.t(AIW.kick), unsure: !!o.unsure,
      trace,
      body: { en: tidy(body.en), zh: glueZh(tidy(body.zh)) }, lens: o.lenses[0] || "",
      cites: (o.cites || []).slice(0, 2), actions: acts, cls: "dsh-ai", label: MP.t(AIW.kick) })}</div>`;
  }

  /* ---- Why this next: MP.nextStep() decides (never reordered); this only explains it, from cross-lens hooks. ---- */
  function hooksInto(T, E) {
    const H = [];
    const step = (lens, sid) => { const l = E.by(lens); const s = l && l.steps.find((x) => x.id === sid); return s ? s.n : 0; };
    const ba = E.by("ba"), ds = E.by("ds"), ai = E.by("ai");
    const bd = ba ? ba.ls.data || {} : {}, dd = ds ? ds.ls.data || {} : {}, ad = ai ? ai.ls.data || {} : {};
    const bChecks = Array.isArray(bd.checks) ? bd.checks : [];
    const bDone = ba && (ba.ls.steps.missing || {}).done, dDone = ds && (ds.ls.steps.conclude || {}).done, aDone = ai && (ai.ls.steps.errors || {}).done;
    const n3 = step("ba", "missing");
    if (T === "ai" && bDone && bChecks.includes("help")) H.push({ id: "ba-help", n3, cite: { lens: "ba", step: "missing" }, en: `the help-request question you raised in BA step ${n3}`, zh: `你在 BA 第 ${n3} 步提出的求助问题` });
    if (T === "ai" && dDone && dd.next === "help") H.push({ id: "ds-help", cite: { lens: "ds", step: "conclude" }, en: "the help-request check you picked as DS's next step", zh: "你在 DS 里选的下一步：查求助记录" });
    if (T === "ds" && bDone && bChecks.includes("mix")) H.push({ id: "ba-mix", cite: { lens: "ba", step: "missing" }, en: `the who-signed-up question you raised in BA step ${n3}`, zh: `你在 BA 第 ${n3} 步提出的“报名的人变了没有”` });
    if (T === "ba" && dDone && dd.next === "funnel") H.push({ id: "ds-funnel", cite: { lens: "ds", step: "conclude" }, en: "the funnel check you picked as DS's next step", zh: "你在 DS 里选的下一步：去看漏斗" });
    if (T === "ba" && aDone && ad.err && ad.err.pattern === "content") H.push({ id: "ai-content", cite: { lens: "ai", step: "errors" }, en: `the stuck-on-assignment messages you found in AI step ${step("ai", "errors")}`, zh: `你在 AI 第 ${step("ai", "errors")} 步发现的、卡在作业上的求助消息` });
    return H.slice(0, 2);
  }
  function whyCompose(E, ns, m) {
    if (!ns) return null;
    const T = ns.lens, N = MP.lensInfo[T].short, H = hooksInto(T, E);
    const l = E.by(T), skim = m.status === "skimmed";
    const idx = m.steps.findIndex((s) => s.id === ns.step) + 1, tot = m.steps.length;
    const hk = (lg) => H.map((h) => h[lg]);
    const cites = H.map((h) => ({ cite: h.cite }));
    const base = MP.ai.hash(T + ns.step + H.map((h) => h.id).join());
    let v = null, id = "";
    const hb = H.find((h) => h.id === "ba-help"), hd = H.find((h) => h.id === "ds-help");
    if (hb && hd) {
      id = "hook.help2";
      const n3 = hb.n3;
      v = ns.resume && !skim ? [
        { en: [`You stopped at step ${idx} of ${N}. Your BA step ${n3} check and your DS next step both asked whether stuck learners got help in time; this lens is where that gets answered.`, ...cites], zh: [`你停在 ${N} 的第 ${idx} 步。你在 BA 第 ${n3} 步的检查和在 DS 选的下一步，问的是同一件事：卡住的学员有没有及时得到帮助。答案就在这个视角里。`, ...cites] }]
        : [{ en: [`Both your BA step ${n3} check and your DS next step asked whether stuck learners got help in time. This lens answers it.`, ...cites], zh: [`你在 BA 第 ${n3} 步的检查和在 DS 选的下一步，问的是同一件事：卡住的学员有没有及时得到帮助。这个视角回答的正是它。`, ...cites] },
          { en: [`Your BA step ${n3} check and your DS next step point at the same question: did stuck learners get help in time? ${N} is where you find out.`, ...cites], zh: [`你在 BA 第 ${n3} 步的检查和在 DS 选的下一步，指向同一个问题：卡住的学员有没有及时得到帮助？答案在 ${N} 里。`, ...cites] }];
    } else if (H.length) {
      id = "hook." + H.map((h) => h.id).join("+");
      const [h1, h2] = [hk("en"), hk("zh")];
      const jE = h1.length > 1 ? `${h1[0]} and ${h1[1]}` : h1[0], jZ = h2.length > 1 ? `${h2[0]}，也是${h2[1]}` : h2[0];
      v = ns.resume && !skim ? [
        { en: [`The ${N} lens picks up ${jE}; it's where you stopped.`, ...cites], zh: [`你停在了 ${N} 视角，它追的正是${jZ}。`, ...cites] },
        { en: [`You stopped at step ${idx} of ${N}. This lens is where ${jE} ${h1.length > 1 ? "get" : "gets"} answered.`, ...cites], zh: [`你停在 ${N} 的第 ${idx} 步。${jZ}，就在这个视角里找答案。`, ...cites] }]
        : [{ en: [`${N} is next in line, and it follows ${jE}.`, ...cites], zh: [`下一个是 ${N}，它接着的正是${jZ}。`, ...cites] },
          { en: [`This lens is where ${jE} ${h1.length > 1 ? "get" : "gets"} answered.`, ...cites], zh: [`${jZ}，就在这个视角里找答案。`, ...cites] }];
    } else if (ns.resume && !skim && l) {
      id = "resume";
      v = [{ en: `Your earlier answers in ${N} are saved as you left them; step ${idx} of ${tot} is the next one in order.`, zh: `你在 ${N} 里的回答都原样保存着，接下来按顺序是第 ${idx}/${tot} 步。` },
        { en: `${cap1(enN(l.p.contentDone))} ${l.p.contentDone === 1 ? "step" : "steps"} of ${N} done; this is the next one in order.`, zh: `${N} 已经做了${zhN(l.p.contentDone)}步，这是顺下来的下一步。` }];
    } else if (skim) return null;   // the hero lead already says what a looked-through lens needs
    else if (MP.state.recommended === T && (MP.state.qs.fields || []).filter((f) => MP.lensInfo[f]).length) {
      const fs = MP.state.qs.fields.filter((f) => MP.lensInfo[f]).map((f) => MP.lensInfo[f].short);
      const lE = fs.length > 1 ? fs.slice(0, -1).join(", ") + " and " + fs[fs.length - 1] : fs[0], lZ = fs.join("、");
      id = "quick";
      v = fs.length > 1 ? [{ en: `You picked ${lE} in Quick Start, so ${N} comes first; the others stay open.`, zh: `你在快速开始里选了 ${lZ}，所以先从 ${N} 开始，其他视角随时可试。` },
        { en: `From your Quick Start picks (${lE}): ${N} first, then the rest on the same data.`, zh: `根据你在快速开始里的选择（${lZ}）：先做 ${N}，其余的用同一份数据接着试。` }]
        : [{ en: `You picked ${N} in Quick Start, so it's first.`, zh: `你在快速开始里选了 ${N}，所以从它开始。` }];
    } else if (E.lenses.some((x) => x.started)) {
      id = "neutral";
      v = [{ en: "Same LumenLearn data, a different way in: about 15 minutes.", zh: "同一份 LumenLearn 数据，换个角度进去，大约 15 分钟。" }];
    } else {
      id = "first";
      v = [{ en: "A good first lens: step 1 takes under a minute, and you can stop anytime.", zh: "从这里开始就好：第 1 步不到一分钟，随时可以停。" }];
    }
    const vi = MP.ai.hash(id + base) % v.length;
    return { id, body: v[vi], fp: MP.ai.fp([T, ns.step, id, vi]) };
  }
  function whyHTML(E, ns, m) {
    if (!MP.ai || !ns) return "";
    const w = whyCompose(E, ns, m); if (!w) return "";
    const nums = [m.steps.length, 15];
    if (!MP.ai.check(w.body.en, { numbers: nums }).ok || !MP.ai.check(w.body.zh, { numbers: nums }).ok) return "";
    const mark = { html: MP.ai.mark({ size: 13, cls: "dsh-why-mark" }) + " " };
    return MP.ai.block({ key: "dash.why", fp: w.fp, kind: "ink", live: false, cap: 1300, cls: "dsh-whyai",
      body: { en: [mark, tidy(w.body.en)], zh: [mark, glueZh(tidy(w.body.zh))] } });
  }

  /* ---------- 1 · next-step hero (ink stage: the student's next move beside the problem itself) ---------- */
  function hero(models, ai) {
    const all = MP.lensOrder.map((id) => models[id]);
    if (all.every((m) => m.status === "complete")) return heroAllDone(all, models, ai);
    const ns = MP.nextStep();
    let id, stepId = null, resume = false;
    if (ns) { id = ns.lens; stepId = ns.step; resume = ns.resume; }
    else { // lens modules not loaded yet: point at the suggested lens anyway
      const prog = all.find((m) => m.status === "progress") || all.find((m) => m.status === "skimmed");
      id = prog ? prog.id : (MP.state.recommended && MP.lensInfo[MP.state.recommended] ? MP.state.recommended : (all.find((m) => m.status !== "complete") || all[0]).id);
      resume = !!prog;
    }
    const m = models[id], info = m.info, skim = m.status === "skimmed";
    const idx = stepId ? m.steps.findIndex((s) => s.id === stepId) : -1;
    const step = idx >= 0 ? m.steps[idx] : null;

    let kicker, title, lead, meta, cta, href, isQ = false;
    if (resume) {
      kicker = skim ? c("skimKicker") : c("resumeKicker");
      title = step ? ph(MP.t(step.title)) : esc(MP.t(info.question)); isQ = !step;
      lead = skim ? ph(c("skimLead", { name: name(id), k: MP.n(need(id)), n: MP.n(nContent(id)) }))
        : step && step.lead ? MP.fmt(firstSentence(MP.t(step.lead))) : esc(MP.t(info.oneLine));
      meta = skim ? `<span>${c("skimCount", { a: MP.n(m.p.contentDone), b: MP.n(m.p.contentTotal), n: MP.n(m.p.contentSkipped) })}</span>`
        : `${step ? `<span>${MP.ui("stepOf", { a: MP.n(idx + 1), b: MP.n(m.steps.length) })}</span><span class="sep" aria-hidden="true">·</span>` : ""}<span>${c("minsLeft", { n: MP.n(minsLeft(m)) })}</span>`;
      cta = skim ? c("skimCta") : c("resumeCta");
      href = step ? `#/lens/${id}/${stepId}` : `#/lens/${id}`;
    } else {
      kicker = c("startKicker");
      title = esc(MP.t(info.question)); isQ = true;
      lead = ph(MP.t(info.oneLine)) + (MP.state.recommended === id && !MP.ai ? ` <span class="dsh-why">${c("fromQuick")}</span>` : "");
      meta = `<span>${c("stepsTime", { n: MP.n(m.ready ? m.steps.length : PLACEHOLDER_STEPS), m: MP.n(info.minutes) })}</span><span class="sep" aria-hidden="true">·</span><span>${c("stopAnytime")}</span>`;
      cta = c("startCta", { name: name(id), short: info.short });
      href = `#/lens/${id}`;
    }

    return `<section class="dsh-hero on-ink l-${id}" aria-labelledby="dsh-next-h">
      <div class="dsh-hero-main">
        <div class="dsh-kicker"><span class="ld-label">${c("nextStep")}</span><span class="dsh-kick-sep" aria-hidden="true"></span><span class="dsh-kick-txt">${kicker}</span></div>
        <div class="dsh-hero-tag">${MP.h.lensTag(id)}</div>
        <h2 class="dsh-hero-title${isQ ? " lens-q" : ""}" id="dsh-next-h">${title}</h2>
        ${whyHTML(ai.E, ns, m)}
        <p class="dsh-hero-lead${skim && resume ? " is-full" : ""}">${lead}</p>
        <div class="dsh-hero-meta">${resume ? track(m, { cls: "mini" }) : ""}<span class="dsh-hero-meta-t">${meta}</span></div>
        ${noticedHTML(ai.E, ai.list, ai.obs)}
        <div class="dsh-hero-cta">${MP.h.primary(cta, "go", href, { lens: id, fk: "dash-next" })}
          ${MP.h.quiet(c("otherLens") + " →", "go", "#/explore")}</div>
      </div>
      <div class="dsh-hero-side">${progressFig(models, id)}
        <dl class="dsh-means">
          <div><dt>${resume ? c("building") : c("handIn")}</dt><dd>${esc(MP.t(info.handIn))}</dd></div>
          <div><dt>${c("doneMeans")}</dt><dd>${esc(MP.t(info.done))}</dd></div>
        </dl></div>
    </section>`;
  }
  function heroAllDone(all, models, ai) {
    const k = counts(all);
    const stats = [plural("nLens", 3), k.enjoyed ? plural("nEnjoyed", k.enjoyed) : "", k.refl ? plural("nRefl", k.refl) : ""].filter(Boolean);
    return `<section class="dsh-hero on-ink l-all" aria-labelledby="dsh-next-h">
      <div class="dsh-hero-main">
        <div class="dsh-kicker"><span class="ld-label">${c("nextStep")}</span><span class="dsh-kick-sep" aria-hidden="true"></span><span class="dsh-kick-txt">${c("allDoneKicker")}</span></div>
        <div class="dsh-hero-tag dsh-trio">${MP.lensOrder.map((id) => MP.h.lensTag(id, { short: true })).join("")}</div>
        <h2 class="dsh-hero-title" id="dsh-next-h">${ph(c("allDoneTitle"))}</h2>
        <p class="dsh-hero-lead is-full">${ph(c("allDoneLead"))}</p>
        <div class="dsh-hero-meta"><span class="dsh-hero-meta-t">${stats.map((x) => `<span>${x}</span>`).join('<span class="sep" aria-hidden="true">·</span>')}</span></div>
        ${noticedHTML(ai.E, ai.list, ai.obs)}
        <div class="dsh-hero-cta">${MP.h.primary(c("allDoneCta"), "go", "#/brief", { fk: "dash-next" })}
          ${MP.h.quiet(c("cmpOpen3") + " →", "go", "#/compare")}</div>
      </div>
      <div class="dsh-hero-side">${progressFig(models, "all")}
        <dl class="dsh-means"><div><dt>${c("briefReady")}</dt><dd>${c("allDoneMeta")}</dd></div></dl></div>
    </section>`;
  }

  /* ---------- 2 · three-lens progress map ---------- */
  function lane(m, i) {
    const id = m.id;
    let action = "";
    if (m.ready) {
      if (m.status === "complete") action = MP.h.secondary(c("aReview"), "go", `#/lens/${id}/done`, { sm: true, fk: "dash-lane:" + id });
      else if (m.status === "skimmed") action = MP.h.secondary(c("skimCta"), "go", `#/lens/${id}/${m.open ? m.open.id : ""}`.replace(/\/$/, ""), { sm: true, fk: "dash-lane:" + id });
      else if (m.status === "progress") action = MP.h.secondary(c("aContinue") + " →", "go", `#/lens/${id}/${(m.ls && m.ls.cur) || ""}`.replace(/\/$/, ""), { sm: true, fk: "dash-lane:" + id });
      else action = MP.h.secondary(c("aStart"), "go", `#/lens/${id}`, { sm: true, fk: "dash-lane:" + id });
    } else action = `<span class="dsh-soon">${c("soon")}</span>`;

    // the fraction already says "3/6": the line under the status adds only what it doesn't
    const count = m.status === "new" ? c("newMeta", { m: MP.n(m.info.minutes) })
      : m.status === "skimmed" ? c("skimCount", { a: MP.n(m.p.contentDone), b: MP.n(m.p.contentTotal), n: MP.n(m.p.contentSkipped) })
      : m.status === "progress" ? [c("minsLeft", { n: MP.n(minsLeft(m)) }), m.skipped ? c("skipped", { n: MP.n(m.skipped) }) : ""].filter(Boolean).join(" · ")
      : m.skipped ? c("skipped", { n: MP.n(m.skipped) }) : "";

    return `<li class="dsh-lane l-${id} is-${m.status} ld-reveal" style="--k:${i}" data-rd-src="dsh-lane-${id}">
      <div class="dsh-lane-id">${MP.h.lensTag(id)}<h3 class="dsh-lane-q lens-q">${esc(MP.t(m.info.question))}</h3></div>
      <div class="dsh-lane-track">${track(m, { tips: true })}${trackCap(m)}</div>
      <div class="dsh-lane-meta">
        <div class="dsh-lane-st">${frac(m)}<span class="dsh-lane-stt">${statusTag(m)}${count ? `<span class="dsh-count">${count}</span>` : ""}</span></div>
        ${m.status === "new" ? `<div class="dsh-feel none">${obsDot(m)}${esc(MP.t(m.info.oneLine))}</div>` : feelLine(m)}
      </div>
      <div class="dsh-lane-act">${action}</div>
    </li>`;
  }

  /* ---------- 3 & 4 · Brief and Compare ---------- */
  function counts(all) {
    let enjoyed = 0, refl = 0;
    all.forEach((m) => {
      if (!m.ls) return;
      Object.values(m.ls.steps || {}).forEach((x) => { if (x && x.energy === "enjoyed") enjoyed++; });
      if (m.ls.refl && ((m.ls.refl.note || "").trim() || m.ls.refl.pick)) refl++;
    });
    return { enjoyed, refl, complete: all.filter((m) => m.status === "complete") };
  }
  function briefCard(all) {
    const k = counts(all), n = k.complete.length;
    if (!n) {
      const prog = all.filter((m) => (m.status === "progress" || m.status === "skimmed") && m.ready).sort((a, b) => a.left - b.left)[0];
      const hint = prog ? (prog.left <= 0 ? c("closestZero", { lens: esc(prog.info.short) }) : prog.left === 1 ? c("closestOne", { lens: esc(prog.info.short) }) : c("closest", { lens: esc(prog.info.short), n: zh() ? MP.n(prog.left) : `${MP.n(prog.left)} ${prog.left === 1 ? "step" : "steps"}` })) : ph(c("anyLens"));
      return `<article class="dsh-card is-locked ld-reveal">
        <div class="dsh-card-txt">
          <span class="ld-label">${c("briefTitle")}</span>
          <h3 class="dsh-card-t">${c("briefLocked")}</h3>
          <p class="dsh-card-b">${c("briefBody")}</p>
          <div class="dsh-lock"><span class="dsh-lock-i" aria-hidden="true">${LOCK}</span><span>${hint}</span></div>
        </div>
        <div class="dsh-mini-doc is-faded" aria-hidden="true">${miniDoc([])}</div>
      </article>`;
    }
    let did = "";
    try { const L = MP.lenses[k.complete[0].id]; const s = L && L.summary ? L.summary(k.complete[0].ls) : null; if (s && s.did) did = MP.t(s.did); } catch (e) { did = ""; }
    return `<article class="dsh-card is-ready ld-panel ld-reveal">
      <div class="dsh-card-txt">
        <div class="dsh-card-k"><span class="dsh-ok" aria-hidden="true">✓</span>${c("briefReady")}</div>
        <h3 class="dsh-card-t">${c("briefTitle")}</h3>
        ${did ? `<p class="dsh-quote">${esc(did)}</p>` : `<p class="dsh-card-b">${c("briefBody")}</p>`}
        <ul class="dsh-counts"><li>${plural("nLens", n)}</li>${k.enjoyed ? `<li>${plural("nEnjoyed", k.enjoyed)}</li>` : ""}${k.refl ? `<li>${plural("nRefl", k.refl)}</li>` : ""}</ul>
        <div class="dsh-card-a">${MP.h.link(c("briefOpen") + " →", "go", "#/brief")}${n < 3 ? `<span class="dsh-card-note">${c("briefGrows")}</span>` : ""}</div>
      </div>
      <div class="dsh-mini-doc" aria-hidden="true">${miniDoc(k.complete.map((m) => m.id))}</div>
    </article>`;
  }
  /** The Brief as a small floating paper sheet: the shared MP.h.briefSheet (same picture as home and the real Brief). */
  function miniDoc(ids) {
    const lines = [];
    ids.slice(0, 2).forEach((id) => { try { const s = MP.lenses[id].summary(MP.ls(id)); if (s && s.did) lines.push(MP.t(s.did)); } catch (e) { /* keep going */ } });
    if (lines.length) {
      const nx = MP.nextLens ? MP.nextLens() : null;
      lines.push(nx ? MP.t({ en: `Next: try the ${MP.lensInfo[nx].short} lens on the same problem.`, zh: `下一步：用同一个问题试试 ${MP.lensInfo[nx].short} 视角。` }) : MP.t({ en: "Next: share it with an advisor, or print it.", zh: "下一步：拿给顾问看看，或者打印出来。" }));
    }
    return MP.h.briefSheet({ lines, lit: ids, size: "sm", cls: "dsh-doc" + (ids.length ? "" : " is-locked") });
  }
  function compareCard(all) {
    const done = all.filter((m) => m.status === "complete"), k = done.length;
    // the split mark at a readable size: a beam turns solid once that lens is complete (miniature glyphs were specks here)
    const cols = `<span class="dsh-cmark ld-grid">${MP.draw.splitMark(done.map((m) => m.id), { labels: true })}</span>`;
    if (k < 2) {
      return `<article class="dsh-card is-locked ld-reveal">
        <div class="dsh-card-txt">
          <span class="ld-label">${c("cmpTitle")}</span>
          <h3 class="dsh-card-t">${c("cmpLocked")}</h3>
          <p class="dsh-card-b">${c("cmpBody")}</p>
          <div class="dsh-lock"><span class="dsh-lock-i" aria-hidden="true">${LOCK}</span><span>${c("cmpProgress", { k: MP.n(k) })}</span></div>
        </div>
        <div class="dsh-cols" aria-hidden="true">${cols}</div>
      </article>`;
    }
    const label = k >= 3 ? c("cmpOpen3") : c("cmpOpen2", { a: done[0].info.short, b: done[1].info.short });
    return `<article class="dsh-card is-ready ld-panel ld-reveal">
      <div class="dsh-card-txt">
        <div class="dsh-card-k"><span class="dsh-ok" aria-hidden="true">✓</span>${c("cmpReady")}</div>
        <h3 class="dsh-card-t">${c("cmpTitle")}</h3>
        <p class="dsh-card-b">${c("cmpBody")}</p>
        <div class="dsh-card-a">${MP.h.link(label + " →", "go", "#/compare")}${k < 3 ? `<span class="dsh-card-note">${c("cmpAfter3")}</span>` : ""}</div>
      </div>
      <div class="dsh-cols" aria-hidden="true">${cols}</div>
    </article>`;
  }
  const LOCK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="9" width="12" height="8.5" rx="1.8"/><path d="M6.8 9V6.6a3.2 3.2 0 0 1 6.4 0V9"/></svg>';

  /* ---------- 5 & 6 · profile tags and optional save ---------- */
  function about() {
    const p = profile(), qs = MP.state.qs || { fields: [] };
    const tags = [];
    const fields = (qs.fields || []).filter((f) => MP.lensInfo[f]);
    if (fields.length) tags.push(`<span class="dsh-tag lensy"><span class="k">${c("curious")}</span>${fields.map((f) => `<span class="lf"><i class="l-${f}"></i>${MP.lensInfo[f].short}</span>`).join("")}</span>`);
    if (p.stage) tags.push(`<span class="dsh-tag">${esc(optLabel("stage", p.stage))}</span>`);
    if (p.background) tags.push(`<span class="dsh-tag">${esc(optLabel("background", p.background))}</span>`);
    p.regions.forEach((r) => tags.push(`<span class="dsh-tag">${PIN}${esc(optLabel("regions", r))}</span>`));
    const empty = !p.stage && !p.background && !p.regions.length;
    return `<div class="dsh-about">
      <div class="dsh-tags">${tags.join("")}${empty ? `<span class="dsh-tag ghost">${c("nothingYet")}</span>` : ""}
        <span class="dsh-about-a">${MP.h.quiet((empty ? c("add") : c("edit")) + (empty ? " →" : ""), "dash-edit", "")}</span></div>
    </div>`;
  }
  const PIN = '<svg class="pin" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z"/><circle cx="8" cy="6.6" r="1.6"/></svg>';
  function savePrompt() {
    if (MP.cloud?.email) return `<div class="dsh-save is-saved"><span class="dsh-save-i" aria-hidden="true">${CLOUD}</span><div><b>${c("savedTo")}</b><span class="s">${esc(MP.cloud.status())}</span></div></div>`;
    if (MP.state.ui && MP.state.ui.dashSaveHidden) return "";
    return `<div class="dsh-save">
      <span class="dsh-save-i" aria-hidden="true">${DEVICE}</span>
      <div class="dsh-save-txt"><b>${c("saveTitle")}</b><span class="s">${c("saveBody")}</span>
        <div class="dsh-save-a">${MP.h.secondary(MP.ui("saveProgress"), "account", "", { sm: true, fk: "dash-save" })}${MP.h.quiet(c("notNow"), "dash-save-hide", "")}</div></div>
    </div>`;
  }
  const DEVICE = '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="6" width="16" height="11" rx="1.5"/><path d="M1.5 20h19"/><rect x="20" y="10" width="6.5" height="12" rx="1.4"/><path d="M22.4 19.6h1.7"/></svg>';
  const CLOUD = '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h12.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 8.4 12.3 4 4 0 0 0 8 20z"/><path d="M11 15.4l2.2 2.1 4-4.2"/></svg>';

  function profileModal() {
    const p = profile();
    const group = (g, label, multi) => `<fieldset class="dsh-m-g"><legend>${label}${multi ? `<span class="opt">${c("pickAny")}</span>` : ""}</legend>
      <div class="chips">${opts(g).map((o) => MP.h.chip(esc(MP.t(o.label || o)), "dash-prof", g + ":" + o.id, multi ? p.regions.includes(o.id) : p[g] === o.id, { sm: true })).join("")}</div></fieldset>`;
    return `<div class="dsh-modal">
      <div class="dsh-m-h"><h2 class="h2" id="dsh-m-title">${c("mTitle")}</h2><p class="muted">${c("mLead")}</p></div>
      ${group("stage", c("mStage"))}${group("background", c("mBg"))}${group("regions", c("mRegions"), true)}
      <div class="dsh-m-a">${MP.h.quiet(c("mClear"), "dash-prof-clear", "")}${MP.h.primary(c("mDone"), "dash-prof-done", "", { sm: true })}</div>
    </div>`;
  }

  /* ---------- page ---------- */
  /** Numbered chapter opener (shared .ch-open): italic orange numeral, mono kicker, serif title, aside. */
  function sec(num, kicker, title, aside, body, cls) {
    return `<section class="dsh-sec ${cls || ""}" aria-labelledby="dsh-s${num}">
      ${MP.h.chapter(String(num).padStart(2, "0"), kicker, title, { cls: "h2", id: "dsh-s" + num, aside })}
      ${body}</section>`;
  }

  MP.pages.dashboard = {
    render() {
      const models = {}; MP.lensOrder.forEach((id) => { models[id] = model(id); });
      // AI-6: gather the evidence once, choose this visit's observation, mark the row(s) it is about
      const ai = { E: null, list: [], obs: null };
      if (MP.ai) {
        try { ai.E = evidence(); ai.list = observations(ai.E); ai.obs = currentObs(ai.list); }
        catch (e) { console.error(e); ai.obs = null; ai.E = ai.E || { lenses: [], steps: [], by: () => null }; }
        if (ai.obs) (ai.obs.lenses || []).forEach((id) => { if (models[id]) models[id].noticed = true; });
      }
      const all = MP.lensOrder.map((id) => models[id]);
      const k = all.filter((m) => m.status === "complete").length;
      const prog = all.find((m) => m.status === "progress") || all.find((m) => m.status === "skimmed");
      const lede = c(k || prog ? (MP.cloud?.email ? "ledeMidAcct" : "ledeMid") : "ledeNew");
      // the headline's one italic accent (en): the count, the lens, or "done"
      const it = (x) => (zh() ? esc(x) : `<span class="it">${esc(x)}</span>`);
      let h1;
      if (k === 3) h1 = accent(ph(c("h1All")));
      else if (k > 0) h1 = fill(ph(MP.t(C.h1Some)), { k: it((zh() ? ["零", "一", "两"] : ["zero", "one", "two"])[k]) });
      else if (prog) h1 = fill(ph(MP.t(C[prog.status === "skimmed" ? "h1Skim" : "h1Partway"])), { name: it(name(prog.id)) });
      else h1 = accent(ph(c("h1New")));

      return `<div class="container page pg-dash">
        <header class="dsh-head">
          <span class="eyebrow">${MP.ui("progress")}</span>
          <h1 class="dsh-h1">${h1}</h1>
          <p class="dsh-lede">${ph(lede)}</p>
        </header>
        ${hero(models, ai)}
        ${sec(1, c("lanesK"), c("lanesTitle"), ph(c("lanesAside")), `<ol class="dsh-lanes${all.some((m) => m.status === "skimmed") ? " has-skim" : ""}">${all.map(lane).join("")}</ol>`)}
        ${sec(2, c("madeK"), c("madeTitle"), ph(c("madeAside")), `<div class="dsh-made">${briefCard(all)}${compareCard(all)}</div>`)}
        ${sec(3, c("aboutK"), c("aboutTitle"), ph(c("aboutAside")), `<div class="dsh-you">${about()}${savePrompt()}</div>`, "dsh-sec-you")}
      </div>`;
    },
    /** Later arrivals this session only settle (core's .again): keep the numbers still too. */
    mount(root) {
      const v = root.querySelector("#view");
      if (v && v.classList.contains("again")) v.querySelectorAll(".pg-dash [data-ld-count]").forEach((x) => x.removeAttribute("data-ld-count"));
    }
  };

  /* ---------- actions ---------- */
  MP.on("dash-edit", () => {
    MP.modal(profileModal());
    const m = document.querySelector("#overlay .modal");
    if (m) { m.classList.add("dsh-modal-wrap"); m.setAttribute("aria-labelledby", "dsh-m-title"); }
  });
  MP.on("dash-prof", (el, arg) => {
    const [g, v] = String(arg).split(":"), p = profile();
    if (g === "regions") { const i = p.regions.indexOf(v); if (i >= 0) p.regions.splice(i, 1); else p.regions.push(v); }
    else p[g] = p[g] === v ? "" : v;
    MP.save();
    document.querySelectorAll(`#overlay [data-action="dash-prof"]`).forEach((b) => {
      const [bg, bv] = b.dataset.arg.split(":");
      b.setAttribute("aria-pressed", String(bg === "regions" ? p.regions.includes(bv) : p[bg] === bv));
    });
    MP.render(); // refresh the tags underneath; the modal lives in #overlay and stays open
  });
  MP.on("dash-prof-clear", () => {
    const p = profile(); p.stage = ""; p.background = ""; p.regions = [];
    MP.save();
    document.querySelectorAll(`#overlay [data-action="dash-prof"]`).forEach((b) => b.setAttribute("aria-pressed", "false"));
    MP.render();
  });
  MP.on("dash-prof-done", () => { MP.closeModal(); MP.commit(); const b = document.querySelector('[data-action="dash-edit"]'); if (b) b.focus({ preventScroll: true }); });
  MP.on("dash-replay", () => { if (MP.live && MP.live.motionOK()) MP.replay(); });
  /* AI-6 controls: "Another" shows the next observation (wrapping round → a new phrasing); "Not useful" hides it for good. */
  function obsList() { return observations(evidence()); }
  MP.on("dash-ai-next", (el, id) => {
    const list = obsList().filter((o) => !o.unsure), dash = MP.ai.state().dash;
    if (!list.length) return;
    const i = list.findIndex((o) => o.id === id), j = (i + 1) % list.length, nx = list[j];
    if (i < 0 || j <= i) MP.ai.bump("dash.n." + nx.id);       // wrapped round: same finding, new wording
    MP.ai.bump("dash.noticed");
    dash.cur = nx.id; if (dash.shown && dash.shown.length) dash.shown[0] = nx.id; else dash.shown = [nx.id];
    MP.commit();
  });
  MP.on("dash-ai-hide", (el, id) => {
    const dash = MP.ai.state().dash; dash.hidden = (dash.hidden || []).concat(id);
    MP.ai.feedback("dash.n." + id, "hide");
    const list = obsList(); dash.cur = list.length ? list[0].id : "";
    MP.ai.announce(MP.t({ en: "Hidden. It won't come back.", zh: "已隐藏，不会再出现。" }));
    MP.commit();
    // the next observation's controls take focus; with none left, the Noticed block itself
    const f = document.querySelector('[data-fk="dash-ai-hide"]') || document.querySelector(".dsh-noticed");
    if (f) { if (!f.matches("button")) f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
  });
  MP.on("dash-save-hide", () => { MP.state.ui = MP.state.ui || { folds: {} }; MP.state.ui.dashSaveHidden = true; MP.commit(); });
})();
