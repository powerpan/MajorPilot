/* MajorPilot redesign — EXPLORE (#/explore). Owned by the "front" builder.
   The shared LumenLearn situation (the Living-data instrument, shared with home via MP.front), three lens columns side by side with a
   teaching-example preview of what you'd hand in, one primary CTA (recommended lens),
   "Where they overlap", and a short honesty note. */
(function () {
  "use strict";
  const t = (x) => MP.t(x);
  const h = MP.h;
  const D = () => MP.data;

  /* ---------------- numbers (computed from MP.data) ---------------- */
  function nums() {
    const d = D(), ch = d.channels, f = d.funnel, r = d.router;
    const rate = (p) => (ch[p].organic.completed + ch[p].partner.completed) / (ch[p].organic.signups + ch[p].partner.signups);
    const early = rate("earlier"), recent = rate("recent");
    const conv = (p, i) => f[p][i + 1] / f[p][i];
    return {
      early, recent, dropPts: (early - recent) * 100,
      assignEarly: conv("earlier", 2), assignRecent: conv("recent", 2),
      reweighted: d.reweighted / 100,
      partnerEarly: ch.earlier.partner.signups / (ch.earlier.organic.signups + ch.earlier.partner.signups),
      partnerRecent: ch.recent.partner.signups / (ch.recent.organic.signups + ch.recent.partner.signups),
      c2tBefore: r.baseline.errors.contentToTech, c2tAfter: r.options.examples.errors.contentToTech,
      t2cBefore: r.baseline.errors.techToContent, t2cAfter: r.options.examples.errors.techToContent,
      routerTotal: r.baseline.auto + r.baseline.human
    };
  }
  const pts = (x) => MP.n(x, 1);

  /* ---------------- copy ---------------- */
  const C = {
    eyebrow: { en: "Explore · one problem, three lenses", zh: "探索专业 · 同一个问题，三种视角" },
    title: { en: "One problem. <span class=\"it\">Three ways</span> to work&nbsp;on&nbsp;it.", zh: "同一个问题，\u200b三种做法。" },
    headMark: { en: "Same data · three ways in", zh: "同一份数据 · 三种切入" },
    sitTitle: { en: "Completion fell, and it hasn't come back.", zh: "完成率掉了下来，\u200b一直没有回升。" },
    figCap: { en: "Fig. 1 · 28-day completion by signup cohort", zh: "图 1 · 各报名批次的 28 天完成率" },
    chartBeams: { en: "The line then splits into the three lenses: Business Analytics, Data Science and AI.", zh: "折线随后分成三个视角：商业分析、数据科学和 AI。" },
    lede: {
      en: "Every lens works on the same made-up company and the same numbers. See how the work differs, then try the one that pulls you in.",
      zh: "三个视角都基于同一家虚构公司、同一组数字。先看看工作方式有什么不同，再试试最吸引你的那个。"
    },
    sitLabel: { en: "The situation", zh: "情境" },
    askLabel: { en: "The product lead asks", zh: "产品负责人的问题" },
    ask: { en: "“What happened, and what should we do first?”", zh: "发生了什么？我们应该先做什么？" },
    earlier: { en: "Cohorts 1–6", zh: "第 1–6 批" },
    recent: { en: "Cohorts 7–12", zh: "第 7–12 批" },
    drop: { en: "points lower", zh: "个百分点的降幅" },
    sitBody: {
      en: "A new group of learners signs up for LumenLearn's courses every week. Starting around cohort 7, the share who finish within 28 days fell, and it hasn't come back.",
      zh: "LumenLearn 的课程每周都有一批新学员报名。大约从第 7 批开始，28 天内完成课程的比例掉了下来，之后一直没有回升。"
    },
    chartTitle: { en: "28-day completion, by signup cohort", zh: "各报名批次的 28 天完成率" },
    chartNote: { en: "Each cohort is {a}–{b} learners, followed for 28 days.", zh: "每批 {a}–{b} 名学员，各跟踪 28 天。" },
    cohortWord: { en: "Cohort", zh: "批次" },

    lensesEyebrow: { en: "Three ways in", zh: "三种切入方式" },
    lensesTitle: { en: "Same problem, different questions.", zh: "同一个问题，不同的提问方式。" },
    suggestedFrom: { en: "From your quick start, we'd begin with {x}. Any lens is a fine place to start.", zh: "根据你的快速开始，建议先试 {x}。从哪个视角开始都可以。" },
    suggestedDefault: { en: "Not sure? {x} is the gentlest way in. Any lens is a fine place to start.", zh: "拿不准的话，{x} 最容易上手。从哪个视角开始都可以。" },
    suggested: { en: "Suggested start", zh: "建议先试" },
    kQuestion: { en: "The question", zh: "要回答的问题" },
    kDo: { en: "What you'd actually do", zh: "你实际会做的事" },
    kHand: { en: "What you hand in", zh: "你会交出什么" },
    kDone: { en: "What “done” means", zh: "怎样算完成" },
    teaching: { en: "Teaching example", zh: "教学示例" },
    start: { en: "Start {x}", zh: "开始 {x}" },
    review: { en: "Review {x}", zh: "回看 {x}" },
    cont: { en: "Continue {x} ({a} of {b})", zh: "继续 {x}（已完成 {a}/{b}）" },
    stDone: { en: "Finished", zh: "已完成" },
    stPart: { en: "{a} of {b}", zh: "已做 {a}/{b} 步" },
    pickUp: { en: "Pick up here", zh: "从这里继续" },
    moreFold: { en: "What you'd hand in", zh: "你会交出什么" },
    lineDone: { en: "You've finished {list}. ", zh: "{list} 已完成。" },
    lineResume: { en: "You're {n} into the {x} lens. Pick up there whenever you like.", zh: "你已在{x}视角做了 {n} 步，随时可以接着做。" },
    lineOpened: { en: "You've opened the {x} lens. Pick up there whenever you like.", zh: "你已打开{x}视角，随时可以接着做。" },
    lineNext: { en: "{x} is a natural next step. Any lens is a fine place to go next.", zh: "接下来可以试试 {x}。选哪个视角都可以。" },
    lineAll: { en: "That's all three. Revisit any of them, or see how they compare in your Brief.", zh: "三个视角都做完了。可以随时回看，也可以在小结里看看它们的对比。" },
    startWith: { en: "Start with {x}", zh: "从 {x} 开始" },

    ovEyebrow: { en: "Where they overlap", zh: "它们在哪里交汇" },
    ovTitle: { en: "Same learners, same numbers. Each lens picks up where another leaves off.", zh: "同一批学员、同一组数字，\u200b三个视角环环相扣。" },
    habitsTitle: { en: "Habits all three share", zh: "三者共有的习惯" },
    habits: [
      { en: "Ask “out of how many?” before trusting a percentage.", zh: "先问“基数是多少”，再相信百分比。" },
      { en: "Change one thing at a time, so you can learn from the result.", zh: "一次只改一处，才能看懂结果。" },
      { en: "Say plainly what the evidence can't tell you yet.", zh: "直说证据还说明不了什么。" }
    ],
    noteTitle: { en: "A note on what this is", zh: "关于这里的内容" },
    note: {
      en: "This is a field-level sketch of the work, not a description of any program. Master's programs differ a lot in what they teach and how. LumenLearn is fictional, and every number here is teaching data.",
      zh: "这里展示的是领域层面的工作样貌，并不代表任何具体项目。不同硕士项目的教学内容和方式差别很大。LumenLearn 是虚构的，这里的每个数字都是教学数据。"
    }
  };

  function lensCopy(n) {
    return {
      ba: {
        do: [
          { en: "Read a six-step funnel and find where learners slip away", zh: "读一个六步漏斗，找出学员流失的环节" },
          { en: "Pick one fix and design a small test with a guardrail", zh: "选一个改进，设计一个带护栏指标的小试验" },
          { en: "Write a one-page recommendation someone can act on", zh: "写一页能被直接执行的行动建议" }
        ],
        doc: {
          title: { en: "Recommendation", zh: "行动建议" },
          rows: [
            [{ en: "Do", zh: "建议" }, { en: "Kick-off email + 15-min office hours before assignment 1.", zh: "首次作业前发启动邮件，并开 15 分钟答疑。" }],
            [{ en: "Why", zh: "原因" }, { en: "Assignment starts fell " + MP.pct(n.assignEarly) + "\u00a0→\u00a0" + MP.pct(n.assignRecent) + ".", zh: "开始作业的比例 " + MP.pct(n.assignEarly) + " → " + MP.pct(n.assignRecent) + "。" }],
            [{ en: "Risk", zh: "风险" }, { en: "Extra email may annoy learners already on track.", zh: "邮件变多，可能打扰本就顺利的学员。" }],
            [{ en: "Measure", zh: "衡量" }, { en: "Assignment starts; guardrail: unsubscribes.", zh: "作业开始率；护栏指标：退订率。" }]
          ]
        }
      },
      ds: {
        do: [
          { en: "Check whether a dip is bigger than normal wobble", zh: "判断一次下滑是否超出正常波动" },
          { en: "Split learners by channel to separate mix from real change", zh: "按来源渠道拆分，区分构成变化和真实变化" },
          { en: "Say how sure you are, and what you still can't say", zh: "说清楚有多确定，以及还不能下什么结论" }
        ],
        doc: {
          title: { en: "Evidence summary", zh: "证据小结" },
          rows: [
            [{ en: "Found", zh: "发现" }, { en: "About half the " + pts(n.dropPts) + "-pt drop is mix; half is real.", zh: pts(n.dropPts) + " 个点的下降，约一半是构成变化，一半是真实下降。" }],
            [{ en: "How sure", zh: "把握" }, { en: "Fairly. The drop after cohort 6 is beyond normal wobble.", zh: "比较有把握：第 6 批之后的下降超出正常波动。" }],
            [{ en: "Unknown", zh: "未知" }, { en: "Why each group's completion fell.", zh: "各组内部的完成率为何下降。" }],
            [{ en: "Don't", zh: "勿用于" }, { en: "Blame course content on this alone.", zh: "仅凭这点就归咎于课程内容。" }]
          ]
        }
      },
      ai: {
        do: [
          { en: "Read a help router's results and a sample of misrouted messages", zh: "读求助分流器的结果，和一批被分错的示例消息" },
          { en: "Change one thing, then re-run it on the same " + n.routerTotal + " messages", zh: "只改一处，再用同样的 " + n.routerTotal + " 条消息重跑" },
          { en: "Weigh what improved against what it cost", zh: "权衡改善了什么、又付出了什么代价" }
        ],
        doc: {
          title: { en: "Model-change note", zh: "模型改动说明" },
          rows: [
            [{ en: "Changed", zh: "改动" }, { en: "Added 10 content examples to the router.", zh: "给分流器补充 10 条课程内容示例。" }],
            [{ en: "Better", zh: "改善" }, { en: "Content questions sent to Tech: " + n.c2tBefore + "\u00a0→\u00a0" + n.c2tAfter + ".", zh: "内容问题被分到技术支持：" + n.c2tBefore + " → " + n.c2tAfter + "。" }],
            [{ en: "Cost", zh: "代价" }, { en: "Tech issues sent to TAs: " + n.t2cBefore + "\u00a0→\u00a0" + n.t2cAfter + ".", zh: "技术问题被分给助教：" + n.t2cBefore + " → " + n.t2cAfter + "。" }],
            [{ en: "Watch", zh: "观察" }, { en: "Whether stuck learners get help sooner.", zh: "卡住的学员能否更快得到帮助。" }]
          ]
        }
      }
    };
  }

  /* ---------------- sections ---------------- */
  function head() {
    return `<header class="ex-head">
      <div class="ex-head-l">
        <p class="eyebrow ex-eyebrow">${t(C.eyebrow)}</p>
        <h1 class="display ex-title">${t(C.title)}</h1>
        <p class="lede ex-lede">${t(C.lede)}</p>
      </div>
      <div class="ex-head-r" aria-hidden="true">${MP.draw.splitMark("all", { labels: true })}<span class="ld-label">${t(C.headMark)}</span></div>
    </header>`;
  }

  function situation(n, intro) {
    const F = MP.front;
    const rates = D().cohorts.map((c) => c.completed / c.signups);
    const label = `${t(C.chartTitle)}. ${t(C.earlier)}: ${MP.pct(n.early)}; ${t(C.recent)}: ${MP.pct(n.recent)}. ` + rates.map((v, i) => `${t(C.cohortWord)} ${i + 1}: ${MP.pct(v)}`).join(", ") + ". " + t(C.chartBeams);
    return `<section class="ex-sit" aria-labelledby="ex-sit-h">
      ${h.chapter("01", t(C.sitLabel), t(C.sitTitle), { id: "ex-sit-h", cls: "h1" })}
      <div class="ex-sit-grid">
        <div class="ex-sit-text">
          ${F.readout(intro, "ex-read")}
          <p class="stand ex-sit-body">${t(C.sitBody)}</p>
          <div class="ex-ask"><span class="ld-label">${t(C.askLabel)}</span><p>${t(C.ask)}</p></div>
        </div>
        <figure class="hf ex-fig ld-reveal">
          ${h.figCap(t(C.figCap))}
          <div class="hf-body" role="img" aria-label="${h.esc(label)}">
            ${F.instrument("row", { names: true, key: "ex" })}${F.instrument("mini", { key: "ex" })}
          </div>
          <p class="ex-fig-note">${t(C.chartNote).replace("{a}", MP.n(Math.min(...D().cohorts.map((c) => c.signups)))).replace("{b}", MP.n(MP.live.maxSignups))}</p>
        </figure>
      </div>
    </section>`;
  }

  /** A teaching-example document, drawn as a sheet of paper (no image). */
  function docPreview(doc, id) {
    return `<figure class="ex-doc lens-${id}" aria-label="${h.esc(t(C.teaching) + ": " + t(doc.title))}">
      <div class="ex-doc-sheet">
        <div class="ex-doc-top"><span class="ex-doc-stamp">${t(C.teaching)}</span><span class="ex-doc-co">LumenLearn</span></div>
        <div class="ex-doc-title">${t(doc.title)}</div>
        <dl>${doc.rows.map(([k, v]) => `<div><dt>${t(k)}</dt><dd>${t(v)}</dd></div>`).join("")}</dl>
      </div>
    </figure>`;
  }

  /** What the button on a lens column should say, given the student's progress. */
  function lensState(id) {
    const p = MP.progress(id);
    return { p, status: p.complete ? "complete" : p.started ? "started" : "new" };
  }
  const nameIn = (id) => (MP.lang() === "zh" ? t(MP.lensInfo[id].name) : MP.lensInfo[id].short);

  function colButton(id, isPrimary, resume) {
    const i = MP.lensInfo[id], { p, status } = lensState(id), fk = "ex-start-" + id;
    if (isPrimary) {
      const label = resume ? MP.ui("continueLens", { x: i.short }) : MP.t(C.startWith).replace("{x}", i.short);
      return h.primary(label, "explore-start", id, { sm: true, lens: id, fk });
    }
    if (status === "complete") return h.secondary(MP.t(C.review).replace("{x}", i.short), "explore-start", id, { fk });
    if (status === "started") return h.secondary(MP.t(C.cont).replace("{x}", i.short).replace("{a}", p.done).replace("{b}", p.total) + " →", "explore-start", id, { fk });
    return h.secondary(MP.t(C.start).replace("{x}", i.short) + " →", "explore-start", id, { fk });
  }

  function statusPill(id) {
    const { p, status } = lensState(id);
    if (status === "complete") return `<span class="ex-st done"><i aria-hidden="true">✓</i>${t(C.stDone)}</span>`;
    if (status === "started") return `<span class="ex-st part">${MP.draw.beam(p.done / p.total, 0, p.total)}${MP.t(C.stPart).replace("{a}", p.done).replace("{b}", p.total)}</span>`;
    return "";
  }

  function lensCol(id, primaryId, resume, copy) {
    const i = MP.lensInfo[id], c = copy[id], isRec = id === primaryId;
    const handIn = `<span class="ld-label">${t(C.kHand)}</span><p class="ex-hand">${t(i.handIn)}</p>${docPreview(c.doc, id)}`;
    const done = `<span class="ld-label">${t(C.kDone)}</span><p class="ex-done">${t(i.done)}</p>`;
    // phones: the hand-in preview and "done" fold away so three cards don't become a 3,000px scroll
    const narrow = h.fold("ex-more-" + id, `<span class="ex-more-s"><span>${t(C.moreFold)}</span><span class="ex-more-sub">${t(i.handIn)}</span></span>`, `<div class="ex-more-b">${docPreview(c.doc, id)}<div class="ex-more-done">${done}</div></div>`);
    return `<article class="ex-col lens-${id} ${isRec ? "is-rec" : ""}" aria-labelledby="ex-q-${id}">
      ${isRec ? `<span class="ex-rec">${t(resume ? C.pickUp : C.suggested)}</span>` : ""}
      <div class="ex-glyph">${h.glyphBox(id)}</div>
      <div class="ex-col-top">${h.lensTag(id)}${statusPill(id)}</div>
      <div class="ex-cell ex-q"><span class="ld-label">${t(C.kQuestion)}</span><h3 id="ex-q-${id}" class="lens-q">${t(i.question)}</h3></div>
      <div class="ex-cell ex-docell"><span class="ld-label">${t(C.kDo)}</span><ol class="ex-do">${c.do.map((d) => `<li>${t(d)}</li>`).join("")}</ol></div>
      <div class="ex-cell ex-wide ex-handcell">${handIn}</div>
      <div class="ex-cell ex-wide ex-donecell">${done}</div>
      <div class="ex-cell ex-narrow">${narrow}</div>
      <div class="ex-cell ex-foot"><span class="ex-time">${MP.ui("minutes", { n: i.minutes })} · ${MP.ui("stopAnytime")}</span>${colButton(id, isRec, resume)}</div>
    </article>`;
  }

  /** The line beside the section heading: a suggestion for newcomers, a status recap for returning students. */
  function recLine(primaryId, resume, fromQs) {
    const done = MP.lensOrder.filter((id) => MP.lenses[id] && lensState(id).status === "complete");
    const list = (ids) => ids.map((id) => MP.lensInfo[id].short).join(MP.lang() === "zh" ? " 和 " : " and ");
    if (resume) {
      const p = MP.progress(primaryId), nm = `<b>${nameIn(primaryId)}</b>`;
      const a = done.length ? MP.t(C.lineDone).replace("{list}", list(done)) : "";
      return a + MP.t(p.done ? C.lineResume : C.lineOpened).replace("{x}", nm).replace("{n}", MP.lang() === "zh" ? p.done : p.done === 1 ? "1 step" : p.done + " steps");
    }
    if (done.length) {
      const a = MP.t(C.lineDone).replace("{list}", list(done));
      return primaryId ? a + MP.t(C.lineNext).replace("{x}", `<b>${MP.lensInfo[primaryId].short} · ${t(MP.lensInfo[primaryId].name)}</b>`) : MP.t(C.lineAll);
    }
    return MP.t(fromQs ? C.suggestedFrom : C.suggestedDefault).replace("{x}", `<b>${MP.lensInfo[primaryId].short} · ${t(MP.lensInfo[primaryId].name)}</b>`);
  }

  function lenses(n) {
    const rec = MP.lenses[MP.state.recommended] || MP.lensInfo[MP.state.recommended] ? MP.state.recommended : "";
    const anyWork = MP.lensOrder.some((id) => lensState(id).status !== "new");
    // one primary: where the student left off, else the next lens, else the recommendation (BA for newcomers)
    const ns = anyWork ? MP.nextStep() : null;
    const primaryId = anyWork ? (ns ? ns.lens : "") : (rec || "ba");
    const resume = !!(ns && ns.resume);
    const copy = lensCopy(n);
    return `<section class="ex-lenses" aria-labelledby="ex-lenses-h">
      ${h.chapter("02", t(C.lensesEyebrow), t(C.lensesTitle), { id: "ex-lenses-h", cls: "h1", aside: recLine(primaryId, resume, !!rec) })}
      <div class="ex-cols">${MP.lensOrder.map((id) => lensCol(id, primaryId, resume, copy)).join("")}</div>
    </section>`;
  }

  function overlap(n) {
    const nodes = [
      { id: "ba", v: { en: "Finds where the funnel leaks", zh: "找到漏斗的漏点" }, d: { en: "Active in week 1 → started an assignment: <span class=\"nowrap\">" + MP.pct(n.assignEarly) + " → " + MP.pct(n.assignRecent) + "</span>.", zh: "首周活跃 → 开始作业：<span class=\"nowrap\">" + MP.pct(n.assignEarly) + " → " + MP.pct(n.assignRecent) + "</span>。" } },
      { id: "ds", v: { en: "Checks whether the drop is real", zh: "检验下降是否真实" }, d: { en: "Partner signups rose from " + MP.pct(n.partnerEarly, 0) + " to " + MP.pct(n.partnerRecent, 0) + ". About half the drop is that mix; half is real.", zh: "合作渠道报名占比从 " + MP.pct(n.partnerEarly, 0) + " 升到 " + MP.pct(n.partnerRecent, 0) + "。约一半的下降来自构成变化，另一半是真实的。" } },
      { id: "ai", v: { en: "Finds one reason learners stall", zh: "找出学员卡住的一个原因" }, d: { en: "Stuck learners' questions get sent to Tech support instead of a TA, so help arrives late.", zh: "卡住的学员提问时被分到技术支持而不是助教，帮助来得太晚。" } }
    ];
    return `<section class="ink-band ex-ov" aria-labelledby="ex-ov-h">
      <div class="container">
        ${h.chapter("03", t(C.ovEyebrow), t(C.ovTitle), { id: "ex-ov-h", cls: "h2" })}
        <ol class="ex-relay ld-reveal">${nodes.map((nd, i) => `<li class="ex-node lens-${nd.id}" style="--i:${i}">
            <span class="ex-node-dot" aria-hidden="true"></span>
            ${h.lensTag(nd.id)}
            <p class="ex-node-v">${t(nd.v)}</p>
            <p class="ex-node-d">${t(nd.d)}</p>
          </li>`).join("")}</ol>
        <div class="ex-habits"><span class="ld-label">${t(C.habitsTitle)}</span><ul>${C.habits.map((x) => `<li>${t(x)}</li>`).join("")}</ul></div>
      </div>
    </section>`;
  }

  function honesty() {
    return `<aside class="ex-note" aria-label="${h.esc(t(C.noteTitle))}">
      <span class="ex-note-i" aria-hidden="true">i</span>
      <div><p class="ex-note-t">${t(C.noteTitle)}</p><p>${t(C.note)}</p></div>
    </aside>`;
  }

  MP.pages.explore = {
    render() {
      const n = nums(), intro = MP.firstVisit("explore");
      return `<div class="pg-explore"><div class="container">${head()}${situation(n, intro)}${lenses(n)}</div>${overlap(n)}<div class="container">${honesty()}</div></div>`;
    }
  };

  MP.on("explore-start", (el, id) => {
    if (!MP.state.recommended) MP.state.recommended = id;
    MP.save();
    // finished lenses open on what was handed in; everything else resumes where the student left off
    MP.go("#/lens/" + id + (MP.progress(id).complete ? "/done" : ""));
  });
})();
