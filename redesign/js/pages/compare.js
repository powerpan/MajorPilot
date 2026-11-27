/* MajorPilot redesign — Compare (#/compare): finished lenses side by side, only where there's evidence.
   Owned by the brief builder. Uses MP.briefKit from brief.js. */
(function () {
  "use strict";
  const MP = window.MP;
  const T = (en, zh) => MP.t({ en, zh });
  const K = () => MP.briefKit;

  const shortDate = (ts) => new Date(ts).toLocaleDateString(MP.lang() === "zh" ? "zh-CN" : "en-US", { month: MP.lang() === "zh" ? "long" : "short", day: "numeric" });
  const PRINT_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 18H4.5A1.5 1.5 0 0 1 3 16.5v-6A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H17"/><path d="M7 14h10v7H7z"/></svg>`;

  const OVERLAP = {
    "ba+ds": { en: "Both ask who is inside the number before acting on it. BA found where learners leave; DS checked how much of the drop came from a change in who signed up.", zh: "两者都会先问：这个数字里到底是哪些人。BA 找到学员在哪一步离开；DS 检查了下降中有多少来自报名人群的变化。" },
    "ai+ba": { en: "Both follow the same leak: learners who stall at their first assignment. BA measured where it happens; AI looked at why their requests for help reach the wrong team.", zh: "两者追的是同一个流失点：卡在第一份作业的学员。BA 衡量它发生在哪里；AI 研究他们的求助为什么被分错团队。" },
    "ai+ds": { en: "Both refuse to trust a single number. DS separated noise and mix from real change; AI weighed accuracy against coverage before calling a change better.", zh: "两者都不轻信单个数字。DS 把随机波动和人群构成从真实变化中分开；AI 在判断改动是否更好之前，先权衡准确率与覆盖率。" },
    "ai+ba+ds": { en: "Three angles on one problem. BA found where learners leave, DS showed how much of the drop is real, and AI found one reason stuck learners don't get the right help.", zh: "同一个问题的三个角度：BA 找到学员在哪里离开，DS 说明下降有多少是真的，AI 找到卡住的学员得不到对口帮助的一个原因。" }
  };
  const SKILLS = [
    { en: "Reading percentages carefully", zh: "仔细读懂百分比" },
    { en: "Saying what you can't conclude yet", zh: "说清还不能下的结论" },
    { en: "Turning a finding into a next step", zh: "把发现变成下一步" },
    { en: "Writing for someone who has to decide", zh: "为要做决定的人写作" }
  ];

  /** Page head: mono kicker, display title, standfirst; the split mark (finished lenses lit) and tools on the right. */
  function head(done, title, sub, tools) {
    const k = K();
    return `<header class="cmp-head">
      <div class="cmp-head-l"><span class="eyebrow">${T("Compare", "比较")} <span aria-hidden="true">·</span> ${MP.t({ en: `${done.length} of ${k.ids().length} lenses finished`, zh: `已完成 <span class="num">${done.length}/${k.ids().length}</span> 个视角` })}</span>
        <h1 class="cmp-title">${title}</h1>
        <p class="cmp-sub">${sub}</p></div>
      <div class="cmp-head-r">${k.mark(done, { labels: true })}
        ${tools ? `<div class="cmp-tools no-print">${MP.h.quiet("← " + T("My Brief", "我的小结"), "go", "#/brief")}${MP.h.secondary(PRINT_ICON + T("Print", "打印"), "bf-print", "", { sm: true })}</div>` : ""}</div>
    </header>`;
  }

  const need = (id) => Math.min(MP.SUBSTANTIVE || 3, MP.lenses[id].steps.length);
  function locked(done) {
    const k = K();
    const ns = MP.nextStep();
    const nextId = ns ? ns.lens : (k.ids().find((id) => !done.includes(id)) || null);
    const slots = done.map((id) => {
      const s = k.summary(id);
      return `<div class="cmp-slot filled lens-${id} ${id}">${k.glyph(id, "cmp-slot-fig")}${MP.h.lensTag(id)}
        <span class="k">${T("Your main move", "你的关键一步")}</span>
        <div class="q">${s && s.move ? MP.t(s.move) : MP.t(MP.lensInfo[id].oneLine)}</div>
        ${s && s.artifact && s.artifact.title && k.handedIn(id) ? `<div class="s">${T("Handed in: ", "交付物：")}${MP.t(s.artifact.title)}</div>` : ""}
      </div>`;
    });
    const openSlot = (id, isNext) => {
      const skim = !!(id && k.skim(id));
      return `<div class="cmp-slot open${skim ? " skim" : ""}${id ? " lens-" + id : ""}">${id ? k.glyph(id, "cmp-slot-fig ghost") : `<span class="cmp-slot-fig ghost blank" aria-hidden="true"><span class="ld-gbox ld-grid"><span class="plus">+</span></span></span>`}
        <span class="k">${skim ? MP.t({ en: `${k.short(id)} · Looked through — nothing handed in yet`, zh: `${k.short(id)} · 已浏览，还没有交付物` }) : isNext && id ? MP.t({ en: `Next: ${k.short(id)}`, zh: `下一个：${k.short(id)}` }) : T("A second lens", "第二个视角")}</span>
        <div class="q${id ? " lens-q" : ""}">${id ? MP.t(MP.lensInfo[id].question) : T("Any lens you finish next lands here.", "你接下来完成的视角会放在这里。")}</div>
        <div class="s">${skim ? MP.t({ en: `You skipped ${MP.progress(id).contentSkipped === 1 ? "1 step" : MP.progress(id).contentSkipped + " steps"}. Doing ${need(id)} of its ${MP.lenses[id].steps.length} steps puts it on this page.`, zh: `你跳过了 ${MP.progress(id).contentSkipped} 步。完成其中任意 ${need(id)} 步，它就会出现在这里。` }) : T("About 15 minutes. Stop anytime; your work saves itself.", "约 15 分钟。随时能停，进度会自动保存。")}</div></div>`;
    };
    while (slots.length < 2) slots.push(openSlot(slots.length === done.length ? nextId : null, slots.length === done.length));
    const p = ns && ns.resume ? MP.progress(ns.lens) : null;
    const label = ns ? (p && p.skimmed ? MP.ui("backToSkipped") : ns.resume ? MP.t({ en: `Continue the ${k.short(ns.lens)} lens`, zh: `继续 ${k.short(ns.lens)} 视角` }) : MP.t({ en: `Try the ${k.short(ns.lens)} lens`, zh: `试试 ${k.short(ns.lens)} 视角` })) : T("Explore the lenses", "看看三个视角");
    return `<div class="container pg-compare is-locked"><div class="cmp-wrap">
      ${head(done, MP.t({ en: `Side by side, once there are <span class="it">two</span>`, zh: "做完两个视角，\u200b就能并排看" }), done.length
          ? MP.t({ en: `You've finished one lens. One more and this page lines them up: your main move, what you handed in, and what you enjoyed.${p ? (p.skimmed ? ` You've looked through ${k.short(ns.lens)}, but nothing is handed in yet.` : ` You're already ${p.done} of ${p.total} steps into ${k.short(ns.lens)}.`) : ""}`, zh: `你已经完成了一个视角。再完成一个，这里就会把它们并排列出：你的关键一步、交出的东西、喜欢的部分。${p ? (p.skimmed ? `你浏览过 ${k.short(ns.lens)}，但还没有交付物。` : `你在 ${k.short(ns.lens)} 已完成 ${p.done}/${p.total} 步。`) : ""}` })
          : T("Comparing needs two finished lenses, so there's evidence on both sides. Each one takes about 15 minutes.", "比较需要两个做完的视角，这样两边都有依据。每个视角约 15 分钟。"), false)}
      <div class="cmp-locked">${slots.join("")}</div>
      <div class="cmp-lock-cta">${MP.h.primary(label, "go", ns ? `#/lens/${ns.lens}/${ns.step}` : "#/explore", { lens: ns ? ns.lens : undefined, fk: "cmp-next" })}
        ${done.length ? MP.h.link(T("Read my Brief", "查看我的小结") + " →", "go", "#/brief") : MP.h.link(T("See all three lenses", "看看三个视角") + " →", "go", "#/explore")}</div>
    </div></div>`;
  }

  /* =====================================================================================================
     AI-5 · The thread across your lenses. No model: keyword bridges between the student's own artifacts and choices
     (AI-LAYER.md AI-5), each quoting their words as exact substrings and citing the step behind every figure. Up to two
     bridges; none → the fixed overlap sentence with no AI styling. Composition is a pure function of state + data +
     lang + regen; the language is not in the fingerprint (a language switch never re-streams).
     ===================================================================================================== */
  const AI = MP.ai;
  const tx = (en, zh) => (MP.lang() === "zh" ? zh : en);
  const LXT = {
    mix: { en: ["partner", "partners", "partner-offer", "mix", "who signed up", "channel", "channels"], zh: ["合作", "渠道", "构成", "报名人群"] },
    help: { en: ["help", "misrouted", "stuck", "support"], zh: ["求助", "帮助", "分错", "卡住"] },
    funnel: { en: ["funnel", "step", "assignment"], zh: ["漏斗", "哪一步", "作业"] }
  };
  /** Figures, all computed from MP.data. */
  function figs() {
    const D = MP.data, ch = D.channels;
    const rate = (p) => (ch[p].organic.completed + ch[p].partner.completed) / (ch[p].organic.signups + ch[p].partner.signups) * 100;
    const pE = rate("earlier"), pR = rate("recent"), drop = pE - pR, mix = D.reweighted - pR;
    const lk = MP.live.leak, R = D.router.baseline;
    const r1 = (x) => MP.n(Math.round(x * 10) / 10, 1);
    return { drop: MP.n(Math.round(drop * 10) / 10, 1), mix: MP.n(Math.round(mix * 100) / 100, 2), rE: r1(lk.rE * 100) + "%", rR: r1(lk.rR * 100) + "%", leakI: lk.i,
      ct: R.errors.contentToTech, wrong: R.auto - R.correct, known: [pE, pR, drop, mix, D.reweighted, lk.rE * 100, lk.rR * 100, R.errors.contentToTech, R.auto - R.correct, R.auto, R.human] };
  }
  /** A clause of the student's text around a lexicon hit (exact substring; nested curly quotes → single). */
  function clauseAt(s, lex) {
    s = String(s || ""); if (!s.trim()) return "";
    const hit = AI.text.find(s, lex)[0]; if (!hit) return "";
    const c = K().clause(s, hit.s, { maxWords: 16, maxChars: 26 });
    const zh = AI.text.lang(c.text) === "zh";
    if (!c.text || (zh ? AI.text.chars(c.text) < 5 : AI.text.words(c.text) < 3)) return "";
    return AI.text.quote(s, c.s, c.e).replace(/“/g, "‘").replace(/”/g, "’");
  }
  /** Bridges that fire for this student, in priority order. Each: {id, lenses, trace, segs(v) → segments, n}. */
  function bridges() {
    const k = K(), done = k.complete(), has = (id) => done.includes(id);
    const ls = (id) => MP.ls(id), d = (id) => ls(id).data || {};
    const f = figs(), out = [];
    const T3 = (id) => (k.texts ? k.texts(id) : {});
    const ba = has("ba") ? T3("ba") : {}, ds = has("ds") ? T3("ds") : {};
    const C = (lens, step, label) => ({ cite: { lens, step, label, src: undefined } });
    const memo = { en: "BA·memo", zh: "BA·建议" }, sum = { en: "DS·summary", zh: "DS·小结" };
    const nw = (a, b) => ({ nw: `${a} → ${b}` });
    // 1 · mix: BA named the who-signed-up risk; DS measured it
    if (has("ba") && has("ds") && d("ds").split === "half") {
      const qb = clauseAt(ba.risk, LXT.mix) || clauseAt(Object.values(ba).join(" \n"), LXT.mix);
      const checked = (d("ba").checks || []).includes("mix");
      const qd = clauseAt(ds.found, LXT.mix);
      if (qb || checked) {
        const baPart = qb
          ? [tx("In your memo you named a risk: ", "你在建议里把一个风险写成："), { q: qb, lens: "ba" }, " ", C("ba", "memo", memo), tx(". ", "。")]
          : [tx("Before acting, you flagged who signed up as something to check ", "动手之前，你把“谁来报名”列为要先查的事"), C("ba", "missing"), tx(". ", "。")];
        const zh = MP.lang() === "zh", hasNum = qd && qd.includes(f.mix);
        const dsPart = qd
          ? (zh ? ["证据小结里，你给出了它的大小：", { q: qd, lens: "ds" }, " ", C("ds", "summary", sum)].concat(hasNum ? ["。"] : [`：${f.drop} 个百分点里约 `, { b: f.mix }, " 个来自构成变化。"])
            : ["Your evidence summary sized it: ", { q: qd, lens: "ds" }, " ", C("ds", "summary", sum)].concat(hasNum ? ["."] : [", about ", { b: f.mix }, ` of the ${f.drop} points.`]))
          : (zh ? ["在 DS 里你算出了它的大小：", `${f.drop} 个百分点里约 `, { b: f.mix }, " 个来自构成变化 ", C("ds", "split"), "。"]
            : ["In DS you measured it: about ", { b: f.mix }, ` of the ${f.drop}-point drop comes from that change in mix `, C("ds", "split"), "."]);
        const num = zh ? [`DS 给它算了数：${f.drop} 个百分点里约 `, { b: f.mix }, " 个来自构成变化 ", C("ds", "split")] : ["DS put a number on it: about ", { b: f.mix }, ` of the ${f.drop}-point drop comes from that change in who signed up `, C("ds", "split")];
        const alt = [tx("The same worry runs through both lenses. ", "两个视角里，是同一个担心。")].concat(num, qd && !hasNum ? [tx(", and your summary says it ", "；你的小结里写的是"), { q: qd, lens: "ds" }, tx(". ", "。")] : [tx(". ", "。")],
          qb ? [tx("BA had already named it as a risk: ", "BA 里你早已把它列为风险："), { q: qb, lens: "ba" }, " ", C("ba", "memo", memo), tx(".", "。")] : [tx("BA had already flagged it before acting ", "BA 里你在动手之前就把它列出来了"), C("ba", "missing"), tx(".", "。")]);
        out.push({ id: "mix", lenses: ["ba", "ds"], trace: [qb ? tx("Your memo · Risk", "你的建议 · 风险") : tx("BA step 3 · your checks", "BA 第 3 步 · 你的核查"), qd ? tx("Your evidence summary", "你的证据小结") : tx("DS step 3 · the split", "DS 第 3 步 · 拆分")],
          v: [() => baPart.concat(dsPart), () => alt] });
      }
    }
    // 2 · funnel: DS asked where; BA had already found it
    if (has("ba") && has("ds") && d("ds").next === "funnel" && d("ba").tr === f.leakI) {
      out.push({ id: "funnel", lenses: ["ds", "ba"], trace: [tx("DS step 4 · your next check", "DS 第 4 步 · 你选的下一步"), tx("BA step 2 · your pick", "BA 第 2 步 · 你的选择")], v: [
        () => [tx("And when DS asked where in the course the drop happens ", "DS 问下降发生在课程哪一步"), C("ds", "conclude"), tx(", your BA funnel had already found it: ", "，你在 BA 的漏斗里已经找到了："), nw(f.rE, f.rR), " ", C("ba", "funnel"), tx(".", "。")],
        () => [tx("Your DS next step, look at the funnel ", "你在 DS 选的下一步是看漏斗"), C("ds", "conclude"), tx(", is the step you'd already picked in BA: ", "，而那一步你在 BA 里已经选过了："), nw(f.rE, f.rR), " ", C("ba", "funnel"), tx(".", "。")]
      ] });
    }
    // 3 · help: BA asked whether stuck learners got help; AI found where their messages go
    const baHelp = has("ba") && ((d("ba").checks || []).includes("help") || !!clauseAt(ba.risk, LXT.help));
    const aiContent = d("ai").err && d("ai").err.pattern === "content";
    if (baHelp && has("ai") && aiContent) {
      const qh = clauseAt(ba.risk, LXT.help);
      out.push({ id: "help", lenses: ["ba", "ai"], trace: [qh ? tx("Your memo · Risk", "你的建议 · 风险") : tx("BA step 3 · your checks", "BA 第 3 步 · 你的核查"), tx("AI step 2 · the pattern you named", "AI 第 2 步 · 你指出的规律")], v: [
        () => (qh ? [tx("Your memo wondered whether ", "你在建议里怀疑"), { q: qh, lens: "ba" }, " ", C("ba", "memo", memo)] : [tx("In BA you asked whether stuck learners got help in time ", "你在 BA 里问过：卡住的学员有没有及时得到帮助"), C("ba", "missing")])
          .concat([tx(". In AI you found where their messages go: ", "。在 AI 里你找到了他们的求助去了哪里："), { b: `${f.ct} / ${f.wrong}` }, tx(" of the router's mistakes send content questions to Tech support ", " 个分流错误，是把内容问题分给了技术支持"), C("ai", "errors"), tx(".", "。")]),
        () => [tx("AI answered a question BA raised: ", "AI 回答了 BA 提出的问题："), { b: String(f.ct) }, tx(` of ${f.wrong} mistakes send stuck learners' content questions to Tech support `, ` 个错误（共 ${f.wrong} 个），把卡住学员的内容问题分给了技术支持`), C("ai", "errors"), tx(", the help you'd wanted to check ", "，正是你想核查的求助"), C("ba", "missing"), tx(".", "。")]
      ] });
    }
    // 4 · DS left "why" open → AI
    if (has("ds") && has("ai") && d("ds").next === "help" && aiContent) {
      out.push({ id: "dshelp", lenses: ["ds", "ai"], trace: [tx("DS step 4 · your next check", "DS 第 4 步 · 你选的下一步"), tx("AI step 2 · the pattern you named", "AI 第 2 步 · 你指出的规律")], v: [
        () => [tx("DS left the why open, and you chose to check help requests next ", "DS 没有回答“为什么”，你选的下一步是查求助"), C("ds", "conclude"), tx(". AI found one candidate: ", "。AI 找到了一个可能的原因："), { b: `${f.ct} / ${f.wrong}` }, tx(" mistakes send content questions to Tech support ", " 个错误把内容问题分给了技术支持"), C("ai", "errors"), tx(".", "。")]
      ] });
    }
    // 5 · the help question is still open (AI not finished)
    const askedHelp = baHelp || (has("ds") && d("ds").next === "help");
    if (askedHelp && !has("ai")) {
      const p = MP.progress("ai"), from = baHelp ? C("ba", "missing") : C("ds", "conclude");
      out.push({ id: "helpopen", lenses: [baHelp ? "ba" : "ds"], trace: [baHelp ? tx("BA step 3 · your checks", "BA 第 3 步 · 你的核查") : tx("DS step 4 · your next check", "DS 第 4 步 · 你选的下一步"), tx("AI lens · progress", "AI 视角 · 进度")], v: [
        () => [tx("One question is still open: whether stuck learners got help in time ", "还有一个问题没回答：卡住的学员有没有及时得到帮助"), from, tx(". The AI lens is where that gets answered", "。答案在 AI 视角里"), p.done ? tx(`; you're ${p.done} of ${p.total} steps in.`, `；你已完成 ${p.done}/${p.total} 步。`) : tx(".", "。")]
      ] });
    }
    return out;
  }
  function sources() {
    const k = K(), s = [];
    k.complete().forEach((id) => Object.values(k.texts ? k.texts(id) : {}).forEach((t) => { s.push(t, t.replace(/“/g, "‘").replace(/”/g, "’")); }));
    return s;
  }
  /** Compose up to `max` bridges (optionally only those touching `lens`); validated; null when none fires. */
  function composeThread(o) {
    if (!AI || !K() || !K().texts) return null;
    let all; try { all = bridges(); } catch (e) { console.warn("thread failed", e); return null; }
    if (o.lens) all = all.filter((b) => b.lenses.includes(o.lens));
    const key = o.key, chk = { numbers: figs().known, sources: sources() };
    const out = [];
    for (const b of all) {
      if (out.length >= (o.max || 2)) break;
      const n = b.v.length, start = AI.variant(key, n, AI.hash(b.id) + (o.base || 0));
      for (let i = 0; i < n; i++) { const segs = b.v[(start + i) % n](); if (AI.check(segs, chk).ok) { out.push({ b, segs, i: (start + i) % n }); break; } }
    }
    return out.length ? out : null;
  }
  const traceOf = (picked) => { const t = []; picked.forEach((p) => p.b.trace.forEach((x) => { if (!t.includes(x)) t.push(x); })); return t.slice(0, 5); };
  const sig = () => { const k = K(); return AI.fp(k.complete().map((id) => [id, MP.ls(id).data && (MP.ls(id).data.memo || MP.ls(id).data.sum || MP.ls(id).data.note), MP.ls(id).data && [MP.ls(id).data.split, MP.ls(id).data.next, MP.ls(id).data.tr, MP.ls(id).data.checks, MP.ls(id).data.err && MP.ls(id).data.err.pattern]])); };
  const amerH = (h) => (MP.lang() === "zh" ? h : K().amer(h));
  /** The band's thread (compare page). Returns html or "" (caller keeps the fixed sentence). */
  function bandThread() {
    const key = "compare.thread", picked = composeThread({ key, max: 2 });
    if (!picked) return "";
    const n = Math.max(...picked.map((p) => p.b.v.length));
    return amerH(AI.block({ key, fp: AI.fp([sig(), picked.map((p) => p.b.id + ":" + p.i)]), kind: "ink", live: false, cls: "cmp-thread",
      trace: traceOf(picked), traceDone: MP.t({ en: "The thread across your lenses · quoted from your work", zh: "跨视角的线索 · 引自你的作答" }),
      body: picked.map((p) => p.segs), cap: 2600,
      actions: n > 1 ? AI.actions({ regen: ["cmp-thread-regen", ""], count: { en: `${(AI.state().regen[key] || 0) % n + 1} of ${n}`, zh: `${(AI.state().regen[key] || 0) % n + 1}/${n}` }, labels: { regen: { en: "Another wording", zh: "换个说法" } } }) : "" }));
  }
  MP.on("cmp-thread-regen", () => { AI.bump("compare.thread"); MP.commit(); });

  MP.pages.compare = {
    /** AI-5 on a lens done screen (core calls this when ≥ 2 lenses are complete): one line, about this lens. */
    thread(o) {
      o = o || {};
      if (!AI || !K()) return "";
      const key = "compare.thread.done." + (o.lens || "");
      // a different wording from the Compare band (base offset), so a student who sees both never reads it twice
      const picked = composeThread({ key, max: 1, lens: o.lens, base: 1 });
      if (!picked) return "";
      const p = picked[0];
      return amerH(AI.block({ key, fp: AI.fp([sig(), p.b.id, p.i]), kind: "note", live: false, cls: "cmp-thread-done", lens: o.lens,
        kicker: MP.t({ en: "Across your lenses", zh: "跨视角来看" }), trace: p.b.trace, body: p.segs }));
    },
    render() {
      const k = K();
      if (!k) return `<div class="container page"><p class="lede">${T("Loading…", "加载中…")}</p></div>`;
      const done = k.complete();
      if (done.length < 2) return locked(done);
      const S = {}; done.forEach((id) => { S[id] = k.summary(id); });
      const F = {}; done.forEach((id) => { F[id] = k.feel([id]); });
      const titles = (arr) => arr.map((x) => k.q(k.stepTitle(x.step)));
      const list = (items) => `<ul>${items.map((h) => `<li>${h}</li>`).join("")}</ul>`;

      const rows = [
        { key: "q", label: T("The question", "要回答的问题"), cls: "q", cell: (id) => MP.t(MP.lensInfo[id].question) },
        { key: "move", label: T("Your main move", "你的关键一步"), cls: "move", ev: true, cell: (id) => S[id] && S[id].move ? MP.t(S[id].move) : "" },
        { key: "hand", label: T("What you handed in", "你交出的东西"), ev: true, cell: (id) => S[id] && S[id].artifact && S[id].artifact.title && k.handedIn(id)
            ? `<div class="art">${MP.t(S[id].artifact.title)}</div>${S[id].artifact.html ? `<button type="button" class="read no-print" data-action="bf-art" data-arg="${id}" data-fk="cmp-art:${id}">${T("Read it", "查看")}</button>` : ""}` : "" },
        { key: "enjoyed", label: T("What you enjoyed", "你喜欢的部分"), ev: true, feel: true, cell: (id) => {
            const p = k.pick(id);
            const items = titles(F[id].enjoyed.filter((x) => !p || x.step.id !== p.id)).map((t) => MP.h.ev("said") + `<span>${t}</span>`);
            if (p) items.unshift(MP.h.ev("said") + `<span>${MP.t({ en: `Would do every week: ${k.q(k.stepTitle(p))}`, zh: `愿意每周都做：${k.q(k.stepTitle(p))}` })}</span>`);
            return items.length ? list(items.slice(0, 4)) : "";
          } },
        { key: "hard", label: T("What felt hard", "觉得难的部分"), ev: true, feel: true, cell: (id) => {
            const hard = F[id].hard.concat(F[id].drained.filter((x) => !x.st.hard));
            return hard.length ? list(hard.slice(0, 3).map((x) => MP.h.ev("said") + `<span>${k.q(k.stepTitle(x.step))}${x.st.hard ? "" : `<span class="faint"> · ${T("drained you", "有点累")}</span>`}</span>`)) : "";
          } },
        { key: "done", label: T("What “done” means", "怎样算做完"), sub: T("in this kind of work", "在这类工作中"), cell: (id) => MP.t(MP.lensInfo[id].done) }
      ];
      const shown = [], thin = [];
      rows.forEach((r) => { const cells = done.map((id) => r.cell(id)); if (cells.every((c) => c)) shown.push([r, cells]); else thin.push(r); });

      const cols = `<div class="cmp-corner"><span class="ld-label">${T("Fig. 1 · Each lens's own data", "图 1 · 各视角的数据")}</span></div><div class="cmp-heads">${done.map((id) => `<div class="cmp-colh lens-${id} ${id}">${MP.h.glyphBox(id)}<div class="cmp-colh-t">${MP.h.lensTag(id, { short: true })}<div class="nm">${k.name(id)}</div></div><div class="when">${MP.ls(id).completedAt ? MP.t({ en: "Finished ", zh: "完成于 " }) + shortDate(MP.ls(id).completedAt) : ""}</div></div>`).join("")}</div>`;
      const body = shown.map(([r, cells]) => `<div class="cmp-row"><div class="cmp-lab ld-label">${r.label}${r.sub ? `<small>${r.sub}</small>` : ""}</div>${cells.map((c, i) => `<div class="cmp-cell ${r.cls || ""} ${done[i]}">${MP.h.lensTag(done[i], { short: true })}<div${r.key === "q" ? ' class="lens-q"' : ""}>${k.amer(c)}</div></div>`).join("")}</div>`).join("");
      const thinLine = thin.length ? `<div class="cmp-thin">${MP.h.ev("limit")}<span><b>${T("Not enough yet to compare:", "还不够比较：")}</b>${MP.lang() === "zh" ? "" : " "}${k.join(thin.map((r) => MP.lang() === "zh" ? r.label : r.label.charAt(0).toLowerCase() + r.label.slice(1)))}${T(".", "。")}${thin.some((r) => r.feel) ? (MP.lang() === "zh" ? "" : " ") + T("Marking how each step feels fills this in.", "在步骤里标记感受，这里就会补上。") : ""}</span></div>` : "";

      const key = done.slice().sort().join("+");
      const ov = OVERLAP[key] || OVERLAP[done.slice(0, 2).sort().join("+")];
      let thread = ""; try { thread = AI ? bandThread() : ""; } catch (e) { console.warn("thread failed", e); thread = ""; }
      const overlap = ov ? `<section class="cmp-overlap on-ink" aria-labelledby="cmp-ov-h" data-reveal>
        <div class="cmp-ov-l"><span class="ld-label" id="cmp-ov-h">${T("Where they overlap", "它们的交集")}</span>${k.mark(done, { labels: true })}</div>
        <div>${thread || `<p class="cmp-ov-t">${MP.t(ov)}</p>`}
          <div class="cmp-ov-k ld-label">${T("Skills used in each", "每个视角都用到的能力")}</div>
          <ul class="cmp-ov-skills">${SKILLS.map((s) => `<li>${MP.t(s)}</li>`).join("")}</ul></div>
      </section>` : "";

      const rest = k.ids().filter((id) => !done.includes(id));
      const ns = MP.nextStep();
      const nextId = ns && rest.includes(ns.lens) ? ns.lens : rest[0];
      const nextSkim = !!(nextId && k.skim(nextId));
      const next = nextId ? `<div class="cmp-next lens-${nextId} no-print">${k.glyph(nextId, "cmp-next-fig")}<div class="cmp-next-t"><span class="eyebrow">${nextSkim ? MP.t({ en: `${k.short(nextId)} · Looked through — nothing handed in yet`, zh: `${k.short(nextId)} · 已浏览，还没有交付物` }) : ns && ns.resume && ns.lens === nextId ? T("Finish the third lens", "把第三个视角做完") : T("Add the third lens", "加上第三个视角")}</span>
          <span class="cmp-next-q lens-q">${MP.t(MP.lensInfo[nextId].question)}</span></div>
          ${MP.h.primary(nextSkim ? MP.ui("backToSkipped") : ns && ns.resume && ns.lens === nextId ? MP.t({ en: `Continue the ${k.short(nextId)} lens`, zh: `继续 ${k.short(nextId)} 视角` }) : MP.t({ en: `Try the ${k.short(nextId)} lens`, zh: `试试 ${k.short(nextId)} 视角` }), "go", `#/lens/${nextId}/${nextSkim ? MP.firstOpenStep(nextId).id : ns && ns.lens === nextId ? ns.step : MP.lensSteps(nextId)[0].id}`, { lens: nextId, fk: "cmp-next" })}</div>`
        : `<div class="cmp-next no-print"><div class="cmp-next-t"><span class="eyebrow">${T("All three done", "三个视角都完成了")}</span><span class="cmp-next-q">${T("You've seen the same problem from every side. What you do with that is up to you.", "你已经从每个角度看过同一个问题。接下来怎么选，由你决定。")}</span></div>${MP.h.secondary(T("Back to my Brief", "回到我的小结"), "go", "#/brief")}</div>`;

      return `<div class="container pg-compare"><div class="cmp-wrap">
        ${head(done, MP.t({ en: `Side <span class="it">by</span> side`, zh: "并排看看" }), T("Only what you actually did, one lens per column. No totals and no winner. The choice stays yours.", "只放你真正做过的内容，一个视角一列。没有总分，也没有输赢，决定权在你。"), true)}
        <div class="cmp-grid" style="--cols:${done.length}">${cols}${body}</div>
        ${thinLine || `<div class="cmp-end"></div>`}
        ${overlap}
        ${next}
        <p class="cmp-honest">${T("Built only from what you did and marked. Programs differ, so treat this as a starting point for your own questions.", "只根据你做过和标记过的内容生成。各项目不同，请把它当作提出自己问题的起点。")}</p>
      </div></div>`;
    }
  };
})();
