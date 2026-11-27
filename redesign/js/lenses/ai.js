/* MajorPilot redesign — AI lens.
   "Why does the help router send stuck learners to the wrong team?"
   Five content steps: numbers · errors · change · tradeoff · note (core appends "reflect"). */
(function () {
  "use strict";
  const MP = window.MP;
  const D = MP.data, RT = D.router, B = RT.baseline;
  const t = (x) => MP.t(x), esc = MP.h.esc;
  const L = (en, zh) => ({ en, zh });
  const isZh = () => MP.lang() === "zh";

  /* ---------------- state ---------------- */
  function data(ls) {
    const d = ls.data || (ls.data = {});
    d.num = Object.assign({ acc: "", cov: "" }, d.num);
    d.err = Object.assign({ pattern: "", cited: [], hl: false }, d.err);
    d.chg = Object.assign({ opt: "", better: [], worse: [], ran: [] }, d.chg);
    d.tr = Object.assign({ ans: "", why: [], staff: 30 }, d.tr);
    d.note = Object.assign({ changed: "", improved: "", cost: "", watch: "" }, d.note);
    return d;
  }
  const cur = () => data(MP.ls("ai"));

  /* ---------------- numbers & formatting ---------------- */
  const WRONG = B.auto - B.correct;                       // 27
  const TOTAL = B.auto + B.human;                         // 200
  const accOf = (r) => r.correct / r.auto;
  function pc(a, b) { const v = Math.round((a / b) * 1000) / 10; return MP.n(v, v % 1 ? 1 : 0) + "%"; }
  /** Accuracy with one decimal, always (82.0% → 88.2%), so before/after values line up. */
  const pc1 = (a, b) => MP.n(Math.round((a / b) * 1000) / 10, 1) + "%";
  const pcr = (r) => pc1(r.correct, r.auto);
  /** Serial list: "a, b, and c" / "a、b和c". */
  function listJoin(items) {
    if (items.length < 2) return items.join("");
    if (isZh()) return items.slice(0, -1).join("、") + "和" + items[items.length - 1];
    return items.length === 2 ? items.join(" and ") : items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }
  /** Inner quotes inside an outer quotation: “x” → ‘x’. */
  const innerQ = (s) => s.replace(/“/g, "‘").replace(/”/g, "’");
  const route = (id) => t(D.routes.find((r) => r.id === id) || { en: id, zh: id });
  const dPts = (v) => MP.n(Math.round(Math.abs(v) * 10) / 10, 1) + (isZh() ? " 个百分点" : " pts");
  /** Neutral direction text for the before/after table — no grading. Moves of ≤2 messages or ≤2 pts read as "about the same". */
  function dirText(diff, kind) {
    const mag = kind === "pct" ? Math.round(Math.abs(diff) * 1000) / 10 : Math.abs(diff);
    if (mag < 1e-9) return { cls: "same", txt: t(L("no change", "不变")) };
    if (mag <= 2) return { cls: "same", txt: t(L("about the same", "基本持平")) };
    const n = kind === "pct" ? MP.n(mag, 1) : MP.n(mag);
    if (kind === "pct") return { cls: "", txt: diff > 0 ? t(L(`up ${n} pts`, `提高 ${n} 个百分点`)) : t(L(`down ${n} pts`, `降低 ${n} 个百分点`)) };
    return { cls: "", txt: diff > 0 ? t(L(`up ${n}`, `多了 ${n}`)) : t(L(`down ${n}`, `少了 ${n}`)) };
  }
  const PLANS = { A: { auto: 100, correct: 81 }, B: { auto: 60, correct: 57 }, total: 100 };
  const msgWrong = D.misrouted.filter((m) => m.pred !== m.truth);
  const msgCT = msgWrong.filter((m) => m.pred === "tech" && m.truth === "content");

  /* ---------------- small builders ---------------- */
  /** Unit grid (waffle), filled column by column so it reads left → right.
      parts = [[cls, count], ...]; cls r = right team (ink) · w = content→tech mistake (vermilion) ·
      w2 = other mistake (vermilion outline) · h = sent to a person (soft grey). Each cell carries --i (its column) for intros. */
  function grid(parts, o) {
    const S = 10, G = 3, P = S + G, rows = o.rows, cols = o.cols;
    let i = 0, cells = "";
    parts.forEach(([k, n]) => {
      for (let j = 0; j < n; j++, i++) {
        const c = Math.floor(i / rows), r = i % rows, x = c * P, y = r * P, st = ` style="--i:${c}"`;
        cells += k === "w2"
          ? `<rect class="w2" x="${x + 0.75}" y="${y + 0.75}" width="${S - 1.5}" height="${S - 1.5}" rx="1.4"${st}/>`
          : `<rect class="${k}" x="${x}" y="${y}" width="${S}" height="${S}" rx="1.8"${st}/>`;
      }
    });
    return `<svg class="ai-grid ${o.cls || ""}" viewBox="0 0 ${cols * P - G} ${rows * P - G}" role="img" aria-label="${esc(o.label)}">${cells}</svg>`;
  }
  const sw = (k) => `<i class="ai-sw ${k}" aria-hidden="true"></i>`;
  const pad2 = (n) => String(n).padStart(2, "0");
  /** Section opener inside a work panel: mono lens-ink numeral + serif question. */
  const secH = (n, label, aside) => `<div class="ai-sec-h"><span class="ai-n">${pad2(n)}</span><h2 class="ai-sec-t">${label}</h2>${aside ? `<span class="ai-sec-aside">${aside}</span>` : ""}</div>`;
  /** Figure caption (mono label + "Teaching data" pill). */
  const fig = (lab, pill) => MP.h.figCap(t(lab), pill);
  /** "15 → 5" readout in the shared .ld-readout voice (light Newsreader, drawn arrow, the new value in orange italic). */
  const ro = (a, b, o) => `<span class="ld-readout ${(o && o.size) || "md"} ai-ro"><span>${a}</span><svg class="ar" viewBox="0 0 32 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1,10 H30 M23,3 L30,10 L23,17"/></svg><span class="sr-only">${t(L(" to ", " → "))}</span><em>${b}</em></span>`;
  function toggle(arr, v) { const i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); return arr; }
  /* blocks that appear after a click (not on arrival) get .ai-new once, so their own intro plays (see mount) */
  const shown = {};
  let runClicked = false;

  /* =====================================================================
     Step 1 — numbers
     ===================================================================== */
  const NUMQ = {
    acc: {
      eq: `<span class="n-r">${B.correct}</span><i>÷</i><span class="n-a">${B.auto}</span>`, res: () => pc(B.correct, B.auto),
      ask: L("What does this number describe?", "这个数字描述的是什么？"),
      opts: [
        ["all", L("How often the router is right across all 200 messages", "分流器在全部 200 条消息上的正确率")],
        ["handled", L("How often it's right when it decides on its own", "它自己做决定时，分对的比例")],
        ["share", L("How much of the work it takes off people's hands", "它替人工分担了多少工作")]
      ], key: "handled"
    },
    cov: {
      eq: `<span class="n-a">${B.auto}</span><i>÷</i><span class="n-t">${TOTAL}</span>`, res: () => pc(B.auto, TOTAL),
      ask: L("And this one?", "那这个呢？"),
      opts: [
        ["right", L("How often the router is right", "分流器分对的比例")],
        ["learners", L("The share of learners who got the right help", "得到正确帮助的学员比例")],
        ["cover", L("The share of messages it handles without a person", "无需人工、由它处理的消息比例")]
      ], key: "cover"
    }
  };
  function renderNumbers(ls) {
    const d = data(ls);
    const g = grid([["r", B.correct], ["w", WRONG], ["h", B.human]], {
      cols: 20, rows: 10, cls: "ai-grid-lg",
      label: t(L(`Grid of ${TOTAL} messages: ${B.correct} handled by the router and routed right, ${WRONG} handled but sent to the wrong team, ${B.human} sent to a person.`,
        `${TOTAL} 条消息的网格：分流器自动处理并分对 ${B.correct} 条，自动处理但分错 ${WRONG} 条，转给人工 ${B.human} 条。`))
    });
    const q = (key, i) => {
      const Q = NUMQ[key];
      return `<div class="ai-q" data-q="${key}" data-rd-src="ai-q-${key}">
        <div class="ai-q-k"><span class="ai-n">${pad2(i)}</span><span class="ld-label">${key === "acc" ? t(L("Out of what it handled", "以它处理的为基数")) : t(L("Out of every message", "以全部消息为基数"))}</span></div>
        <div class="ai-eq num">${Q.eq}<i>=</i><em data-ld-count data-ld-delay="${key === "acc" ? 700 : 850}">${Q.res()}</em></div>
        <p class="ai-ask">${t(Q.ask)}</p>
        <div class="options ai-opts-sm">${Q.opts.map(([id, lab]) => MP.h.option(t(lab), "", "ai-num", key + ":" + id, d.num[key] === id)).join("")}</div>
      </div>`;
    };
    return `<div class="work ai-nums">
      ${fig(L("Fig. 1 · One square per message", "图 1 · 每格一条消息"))}
      <div class="ai-fig">
        <div class="ai-fig-main">
          <div class="ai-brackets" aria-hidden="true">
            <span class="b-auto" style="flex:${B.auto}"><em><span class="lg">${t(L("Handled by the router", "分流器自动处理"))}</span><span class="sm">${t(L("Router", "分流器"))}</span></em><b class="num">${B.auto}</b></span>
            <span class="b-human" style="flex:${B.human}"><em>${t(L("People", "转人工"))}</em><b class="num">${B.human}</b></span>
          </div>
          ${g.replace('class="ai-grid ', 'class="ai-grid ai-pop ')}
          <div class="ai-brace" aria-hidden="true"><span>${t(L(`All ${TOTAL} help messages`, `全部 ${TOTAL} 条求助消息`))}</span></div>
        </div>
        <ul class="ai-key">
          <li class="k-r">${sw("r")}<b class="num" data-ld-count data-ld-delay="250">${B.correct}</b><span>${t(L("handled and sent to the right team", "自动处理，<span class=\"ai-nw\">分对了团队</span>"))}</span></li>
          <li class="k-w">${sw("w")}<b class="num" data-ld-count data-ld-delay="350">${WRONG}</b><span>${t(L("handled but sent to the wrong team", "自动处理，<span class=\"ai-nw\">但分错了团队</span>"))}</span></li>
          <li class="k-h">${sw("h")}<b class="num" data-ld-count data-ld-delay="450">${B.human}</b><span>${t(L("not sure enough — a person decides", "把握不够，<span class=\"ai-nw\">交给人工判断</span>"))}</span></li>
        </ul>
      </div>
      <p class="ai-tip">${t(L("Point at a question below — the grid shows which messages it counts.", "指向下面的题目，网格会标出它统计的是哪些消息。"))}</p>
      <div class="ai-qs">${q("acc", 1)}${q("cov", 2)}</div>
    </div>`;
  }

  /* =====================================================================
     Step 2 — errors
     ===================================================================== */
  const HL = { en: /(error|doesn(?:'|’|&#39;)t work|broken|crashed|won(?:'|’|&#39;)t load)/gi, zh: /(报错|错误|不对|坏的|崩了|加载不出来)/g };
  const PATTERNS = [
    ["content", L("Content questions that mention “error” or “doesn’t work” get sent to Tech support", "提到“报错”“不对”的课程内容问题被分到了技术支持")],
    ["billing", L("Billing and Account questions get mixed up", "账单和账户问题被混在一起")],
    ["random", L("It looks random — no clear pattern", "看起来是随机的，没有明显规律")]
  ];
  function msgText(m, hl) {
    let s = esc(t(m));
    if (hl) s = s.replace(isZh() ? HL.zh : HL.en, '<mark class="ai-hl">$1</mark>');
    return s;
  }
  function renderErrors(ls) {
    const d = data(ls), n = d.err.cited.length, ready = stepErrors.ready(ls);
    const cards = D.misrouted.map((m, i) => {
      const wrong = m.pred !== m.truth, on = d.err.cited.includes(m.id);
      return `<button class="ai-msg ${wrong ? "wrong" : "right"}" data-rd-src="ai-m-${m.id}" style="--i:${i}" aria-pressed="${on}" data-action="ai-cite" data-arg="${m.id}" data-fk="ai-cite:${m.id}">
        <span class="ai-msg-top"><span class="ai-id">${m.id}</span><span class="ai-verdict">${wrong ? t(L("Wrong team", "分错了")) : "✓ " + t(L("Right team", "分对了"))}</span>
          <span class="ai-cite"><span class="ai-cite-l">${on ? t(L("Cited", "已引用")) : t(L("Cite", "引用"))}</span><span class="ai-cite-o" aria-hidden="true">${on ? "✓" : ""}</span></span></span>
        <span class="ai-msg-q">${msgText(m, d.err.hl)}</span>
        <span class="ai-route" data-lbl="${esc(t(L("Router sent to → should go to", "分流器分到 → 应该分到")))}">
          <span class="ai-rt"><span class="lbl">${t(L("Router sent to", "分流器分到"))}</span><span class="val ${wrong ? "bad" : ""}">${route(m.pred)}</span></span>
          <span class="ai-rt-arr" aria-hidden="true">→</span>
          <span class="ai-rt"><span class="lbl">${t(L("Should go to", "应该分到"))}</span><span class="val">${route(m.truth)}</span></span>
        </span>
      </button>`;
    }).join("");
    const dots = [0, 1].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    let html = `<div class="work ai-errs">
      <div class="ai-toolbar">
        ${secH(1, t(L("Cite at least two", "至少引用两条")), `<span class="ai-count-n" aria-live="polite"><span class="ai-dots" aria-hidden="true">${dots}</span>${t(L(`${n} cited`, `已引用 ${n} 条`))}</span>`)}
        <button type="button" class="ai-switch" data-rd-src="ai-hl" role="switch" aria-checked="${!!d.err.hl}" data-action="ai-hl" data-fk="ai-hl"><span class="tr" aria-hidden="true"></span>${t(L("Highlight words like “error”", "高亮“报错”这类词"))}</button>
      </div>
      <div class="ai-msgs">${cards}</div>
      <div class="ai-sec">${secH(2, t(L("What pattern do you see?", "你看到了什么规律？")))}
        <div class="options">${PATTERNS.map(([id, lab]) => MP.h.option(t(lab), "", "ai-pattern", id, d.err.pattern === id)).join("")}</div>
      </div>
    </div>`;
    if (ready) {
      const E = B.errors, rows = [
        ["contentToTech", L("Content question → Tech support", "内容问题 → 技术支持"), "w"],
        ["billingAccount", L("Billing ↔ Account mix-ups", "账单 ↔ 账户混淆"), "w2"],
        ["techToContent", L("Tech problem → Course content", "技术问题 → 课程内容"), "w2"],
        ["other", L("Other", "其他"), "w2"]
      ];
      // one square per mistake, so the bars share a unit with the waffle in step 1
      const sq = (k, c) => Array.from({ length: E[k] }, () => `<i class="${c}"></i>`).join("");
      html += `<div class="work ai-break" data-rd-src="ai-break">
        ${fig(L(`Fig. 2 · ${WRONG} mistakes by type`, `图 2 · ${WRONG} 个错误，按类型`))}
        <div class="ai-break-h"><h3 class="h3">${t(L(`Every mistake among the ${B.auto} it handled — one square each`, `<span class="ai-nw">它自动处理的 ${B.auto} 条里，</span><span class="ai-nw">每个错误一格</span>`))}</h3>
          <div class="ai-break-big"><b class="num" data-ld-count>${E.contentToTech}</b><span class="of num">/${WRONG}</span><span class="t">${t(L("are content questions sent to Tech support", "是内容问题<span class=\"ai-nw\">被分到了技术支持</span>"))}</span></div></div>
        <div class="ai-bars" role="img" aria-label="${esc(rows.map((r) => t(r[1]) + ": " + E[r[0]]).join("; "))}">
          ${rows.map(([k, lab, c], i) => `<div class="ai-bar-row ${k === "contentToTech" ? "top" : ""}" style="--i:${i}"><span class="k">${t(lab)}</span><span class="sq" aria-hidden="true">${sq(k, c)}</span><span class="v num">${E[k]}</span></div>`).join("")}
        </div>
      </div>`;
    }
    return html;
  }

  /* =====================================================================
     Step 3 — change
     ===================================================================== */
  const OPTS = {
    examples: { title: L("Add 10 content examples", "补充 10 条课程内容示例"), sub: L("Show the router what content questions that mention “error” look like.", "让分流器见识提到“报错”的课程内容问题长什么样。"),
      did: L("added 10 content examples", "补充了 10 条课程内容示例") },
    threshold: { title: L("Raise the confidence threshold", "提高置信度阈值"), sub: L("From 0.60 to 0.75 — the router acts only when it's more sure.", "从 0.60 提到 0.75，只有更有把握时才自动处理。"),
      did: L("raised the confidence threshold to 0.75", "把置信度阈值提到 0.75") },
    definition: { title: L("Rewrite the team definitions", "改写各团队的类别定义"), sub: L("Make “Course content” clearly cover formulas, code and exercises.", "写明“课程内容”包括公式、代码和练习题。"),
      did: L("rewrote the team definitions", "改写了团队类别定义") }
  };
  const BETTER = [
    ["fewerCT", L("Fewer content → tech mistakes", "内容→技术的错误变少")],
    ["acc", L("Higher accuracy on what it handles", "自动处理的准确率更高")],
    ["cover", L("It handles more on its own", "能自动处理更多消息")]
  ];
  const WORSE = [
    ["people", L("More work for people", "人工工作量变多")],
    ["newerr", L("New mistakes in another direction", "出现别的方向的新错误")],
    ["none", L("Nothing much", "没什么会变差")]
  ];
  const errUp = (a) => ["techToContent", "billingAccount", "other"].filter((k) => a.errors[k] > B.errors[k]);
  const ERRNAME = { techToContent: L("tech → content", "技术→内容"), billingAccount: L("billing ↔ account", "账单↔账户"), other: L("other", "其他") };
  function predCheck(id, A) {
    switch (id) {
      case "fewerCT": return [A.errors.contentToTech < B.errors.contentToTech, `${B.errors.contentToTech} → ${A.errors.contentToTech}`];
      case "acc": return [accOf(A) > accOf(B), `${pcr(B)} → ${pcr(A)}`];
      case "cover": return [A.auto > B.auto, `${B.auto} → ${A.auto}`];
      case "people": return [A.human > B.human, `${B.human} → ${A.human}`];
      case "newerr": { const up = errUp(A); return [up.length > 0, up.length ? up.map((k) => `${t(ERRNAME[k])} ${B.errors[k]} → ${A.errors[k]}`).join(", ") : t(L("no mistake type rose", "没有哪类错误增加"))]; }
      case "none": { const bad = A.human > B.human || errUp(A).length > 0; return [!bad, bad ? t(L("something did get worse", "确实有指标变差了")) : t(L("no metric got worse", "没有指标变差"))]; }
    }
    return [false, ""];
  }
  const METRICS = [
    ["auto", L("Handled automatically", "自动处理"), (r) => r.auto, "int", 1],
    ["acc", L("Accuracy on what it handled", "自动处理的准确率"), (r) => accOf(r), "pct", 1],
    ["human", L("Sent to a person", "转给人工"), (r) => r.human, "int", -1],
    ["ct", L("Content → tech mistakes", "内容→技术的错误"), (r) => r.errors.contentToTech, "int", -1],
    ["tc", L("Tech → content mistakes", "技术→内容的错误"), (r) => r.errors.techToContent, "int", -1]
  ];
  function gridParts(r) { const ct = r.errors.contentToTech; return [["r", r.correct], ["w", ct], ["w2", r.auto - r.correct - ct], ["h", r.human]]; }
  function gridCaption(r) { return t(L(`${r.correct} right · ${r.auto - r.correct} wrong · ${r.human} to a person`, `分对 ${r.correct} · 分错 ${r.auto - r.correct} · 转人工 ${r.human}`)); }
  function gridLabel(r, which) { return t(L(`${which}: ${r.correct} right, ${r.errors.contentToTech} content-to-tech mistakes, ${r.auto - r.correct - r.errors.contentToTech} other mistakes, ${r.human} sent to a person.`, `${which}：分对 ${r.correct} 条，内容→技术错误 ${r.errors.contentToTech} 条，其他错误 ${r.auto - r.correct - r.errors.contentToTech} 条，转人工 ${r.human} 条。`)); }

  function renderChange(ls) {
    const d = data(ls), c = d.chg, ran = c.opt && c.ran.includes(c.opt), canRun = c.opt && (c.better.length + c.worse.length) > 0;
    let html = `<div class="work ai-chg">
      <div class="ai-sec">${secH(1, t(L("Pick one change", "选一处改动")))}
        <div class="options ai-opts3">${Object.keys(OPTS).map((k) => MP.h.option(t(OPTS[k].title), t(OPTS[k].sub), "ai-opt", k, c.opt === k)).join("")}</div></div>
      <div class="ai-sec">${secH(2, t(L("Predict first", "先预测")), t(L("Your guess is the point — there's no wrong one.", "重点是你的猜测，没有对错。")))}
        <div class="ai-pred">
          <div><div class="ai-pred-l">${sw("up")}${t(L("Should get better", "应该会变好"))}</div><div class="chips">${BETTER.map(([id, lab]) => MP.h.chip(t(lab), "ai-better", id, c.better.includes(id), { sm: true })).join("")}</div></div>
          <div><div class="ai-pred-l">${sw("down")}${t(L("Might get worse", "可能会变差"))}</div><div class="chips">${WORSE.map(([id, lab]) => MP.h.chip(t(lab), "ai-worse", id, c.worse.includes(id), { sm: true })).join("")}</div></div>
        </div></div>
      <div class="ai-sec">${secH(3, t(L("Run it", "运行")))}
        <div class="ai-runrow">${ran
          ? `<span class="ai-ran">✓ ${t(L(`Ran on the same ${TOTAL} messages`, `已在同样的 ${TOTAL} 条消息上运行`))}</span><span class="small muted">${t(L("Pick a different change above to compare.", "想比较的话，可以在上面换一处改动。"))}</span>`
          : `<button class="btn-secondary ai-run" data-action="ai-run" data-fk="ai-run" ${canRun ? "" : "disabled"}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>${t(L(`Run on the same ${TOTAL} messages`, `在同样的 ${TOTAL} 条消息上运行`))}</button>
             <span class="small muted">${canRun ? t(L("Same messages as before, so the comparison is fair.", "用的还是原来那批消息，比较才公平。")) : t(L("Pick a change and make at least one prediction first.", "先选一处改动，并至少做一个预测。"))}</span>`}</div></div>
    </div>`;
    if (ran) {
      const A = RT.options[c.opt];
      const metric = ([id, lab, f, kind]) => {
        const b = f(B), a = f(A), dt = dirText(a - b, kind), target = id === "ct";
        const show = (v) => kind === "pct" ? MP.n(Math.round(v * 1000) / 10, 1) + "%" : MP.n(v);
        return `<div class="ai-m${target ? " is-target" : ""}" role="row"><span class="k" role="rowheader">${t(lab)}${target ? `<span class="ai-target">${t(L("the target", "改动目标"))}</span>` : ""}</span>
          <span class="b num" role="cell">${show(b)}</span><span class="arr" aria-hidden="true">→</span>
          <span class="a num" role="cell" data-ai-from="${kind === "pct" ? Math.round(b * 1000) / 10 : b}">${show(a)}</span>
          <span class="dd ${dt.cls}" role="cell">${dt.txt}</span></div>`;
      };
      const dAcc = (accOf(A) - accOf(B)) * 100;
      const preds = c.better.concat(c.worse);
      const held = preds.filter((p) => predCheck(p, A)[0]).length;
      const panel = (r, which, after) => `<figure class="${after ? "after" : "before"}">
          <figcaption><span class="ld-label">${which}</span><span class="ai-acc"><span class="ai-acc-k">${t(L("accuracy", "准确率"))}</span> <b class="num">${pcr(r)}</b>${after && Math.abs(dAcc) >= 0.05 ? `<span class="ai-delta ${dAcc > 0 ? "up" : "down"}">${dAcc > 0 ? "▲" : "▼"}&nbsp;${dPts(dAcc)}</span>` : ""}</span></figcaption>
          ${grid(gridParts(r), { cols: 20, rows: 10, cls: after ? "ai-g-after" : "", label: gridLabel(r, which) })}
          <div class="ai-cap num">${gridCaption(r)}</div></figure>`;
      html += `<div class="work ai-results" id="ai-results" data-rd-src="ai-results">
        ${fig(L(`Fig. 3 · Same ${TOTAL} messages, before → after`, `图 3 · 同样 ${TOTAL} 条消息，改动前后`))}
        <div class="ai-res-h">
          <div class="ai-res-t"><span class="ld-label">${t(L("Your change", "你的改动"))}</span><h3 class="h2">${t(OPTS[c.opt].title)}</h3></div>
          <div class="ai-res-big"><span class="ld-label">${t(L("Content → tech mistakes", "内容→技术的错误"))}</span>${ro(MP.n(B.errors.contentToTech), MP.n(A.errors.contentToTech))}</div>
        </div>
        <div class="ai-ba">${panel(B, t(L("Before", "改动前")), false)}<span class="ai-ba-ar" aria-hidden="true"><svg viewBox="0 0 28 20"><path pathLength="1" d="M1,10 H26 M19,3 L26,10 L19,17"/></svg></span>${panel(A, t(L("After", "改动后")), true)}</div>
        <div class="ai-legend">${[["r", L("right team", "分对")], ["w", L("content → tech mistake", "内容→技术错误")], ["w2", L("other mistake", "其他错误")], ["h", L("sent to a person", "转给人工")]].map(([k, lab]) => `<span>${sw(k)}${t(lab)}</span>`).join("")}</div>
        <div class="ai-metrics" role="table" aria-label="${esc(t(L("Before and after", "改动前后对比")))}">
          <div class="ai-m ai-m-h" role="row"><span class="k" role="columnheader">${t(L(`Same ${TOTAL} messages`, `同样 ${TOTAL} 条消息`))}</span><span class="b" role="columnheader">${t(L("Before", "改动前"))}</span><span class="arr"></span><span class="a" role="columnheader">${t(L("After", "改动后"))}</span><span class="dd" role="columnheader">${t(L("Change", "变化"))}</span></div>
          ${METRICS.map(metric).join("")}
        </div>
        ${preds.length ? `<div class="ai-check"><div class="ai-check-h"><span class="ld-label">${t(L("Your predictions, checked", "核对你的预测"))}</span><span class="ai-check-n num">${t(L(`${held} of ${preds.length} showed up`, `${preds.length} 个中有 ${held} 个出现了`))}</span></div>
          <ul>${preds.map((p) => { const [ok, ev] = predCheck(p, A), lab = (BETTER.concat(WORSE)).find((x) => x[0] === p)[1], up = c.better.includes(p);
            return `<li>${sw(up ? "up" : "down")}<span class="p">${t(lab)}</span><span class="o ${ok ? "yes" : "no"}">${ok ? t(L("Happened", "出现了")) : t(L("Didn't happen", "没有出现"))}</span><span class="e num">${ev}</span></li>`; }).join("")}</ul></div>` : ""}
      </div>`;
    }
    return html;
  }

  /* =====================================================================
     Step 4 — tradeoff
     ===================================================================== */
  const ANS = [
    ["yes", L("Yes — 95% beats 81%", "是，95% 比 81% 高")],
    ["no", L("No — A handles more messages", "不是，A 处理的消息更多")],
    ["depends", L("It depends", "要看情况")]
  ];
  const WHY = [
    ["acc", L("Accuracy when it acts", "自动处理时的准确率")],
    ["cover", L("How many it handles", "能处理多少消息")],
    ["staff", L("Staff time for the rest", "处理剩余消息的人手")],
    ["cost", L("What a wrong route costs a learner", "分错一次对学员的代价")]
  ];
  function planPanel(id) {
    const p = PLANS[id], wrong = p.auto - p.correct, human = PLANS.total - p.auto;
    const g = grid([["r", p.correct], ["w", wrong], ["h", human]], { cols: 10, rows: 10, cls: "ai-grid-sq ai-pop",
      label: t(L(`Plan ${id}: ${p.correct} right, ${wrong} wrong team, ${human} left for people, out of ${PLANS.total}.`, `方案 ${id}：${PLANS.total} 条中分对 ${p.correct} 条、分错 ${wrong} 条、留给人工 ${human} 条。`)) });
    return `<div class="ai-plan ai-plan-${id.toLowerCase()}" data-rd-src="ai-plan-${id.toLowerCase()}">
      <div class="ai-plan-h"><span class="ai-plan-id">${t(L("Plan", "方案"))} <b>${id}</b></span>
        <span class="ai-plan-acc num" data-ld-count data-ld-delay="${id === "A" ? 300 : 450}">${pc(p.correct, p.auto)}</span></div>
      <div class="ai-plan-sub">${t(L(`right when it acts · <span class="nowrap">${p.correct} of ${p.auto}</span>`, `自动处理时的准确率 · <span class="nowrap">${p.auto} 条中对 ${p.correct} 条</span>`))}</div>
      ${g}
      <dl class="ai-plan-facts">
        <div><dt>${t(L("Handles", "自动处理"))}</dt><dd class="num">${p.auto}</dd></div>
        <div class="f-w"><dt>${t(L("Wrong team", "分错"))}</dt><dd class="num">${wrong}</dd></div>
        <div class="f-h"><dt>${t(L("To people", "留给人工"))}</dt><dd class="num">${human}</dd></div>
      </dl></div>`;
  }
  const NEED = PLANS.total - PLANS.B.auto, SLOTS = 60;   // Plan B hands people 40 of every 100; the slider runs 0–60
  function staffLine(s) {
    const need = NEED;
    if (s >= need) return t(L(`Plan B fits: it hands people ${need} messages, and your team has room for ${s}.`, `方案 B 可行：它交给人工 ${need} 条，你的团队能处理 ${s} 条。`));
    return t(L(`Plan B overflows: it hands people ${need} messages, but your team has room for ${s} — ${need - s} would wait.`, `方案 B 超载：它交给人工 ${need} 条，团队只能处理 ${s} 条，有 ${need - s} 条要排队等。`));
  }
  /** Slot i of the capacity strip: rd = read by your team · wt = would wait · sp = spare room · "" = beyond both. */
  const slotCls = (i, s) => (i < NEED ? (i < s ? "rd" : "wt") : (i < s ? "sp" : ""));
  function staffStats(s) {
    const wait = Math.max(0, NEED - s), spare = Math.max(0, s - NEED);
    return [
      ["need", L("Plan B sends", "方案 B 交人工"), NEED, ""],
      ["read", L("Team reads", "团队能读"), Math.min(s, NEED), ""],
      wait ? ["wait", L("Would wait", "要排队"), wait, "warn"] : ["spare", L("Spare", "余量"), spare, "ok"]
    ];
  }
  const statsHtml = (s) => staffStats(s).map(([k, lab, v, c]) => `<div class="st-${k} ${c}"><dt>${t(lab)}</dt><dd class="num">${v}</dd></div>`).join("");
  function renderTradeoff(ls) {
    const d = data(ls), tr = d.tr, s = tr.staff;
    const slots = Array.from({ length: SLOTS }, (_, i) => `<i class="${slotCls(i, s)}"></i>`).join("");
    return `<div class="work ai-tr">
      ${fig(L(`Fig. 4 · Two plans, ${PLANS.total} new messages`, `图 4 · 两个方案，${PLANS.total} 条新消息`))}
      <div class="ai-plans">${planPanel("A")}<div class="ai-vs" aria-hidden="true">${t(L("vs", "对比"))}</div>${planPanel("B")}</div>
      <div class="ai-legend">${[["r", L("right team", "分对")], ["w", L("wrong team", "分错")], ["h", L("left for people", "留给人工")]].map(([k, lab]) => `<span>${sw(k)}${t(lab)}</span>`).join("")}</div>
      <div class="ai-sec">${secH(1, t(L("Is Plan B better?", "方案 B 更好吗？")))}
        <div class="options ai-opts3">${ANS.map(([id, lab]) => MP.h.option(t(lab), "", "ai-ans", id, tr.ans === id)).join("")}</div></div>
      <div class="ai-sec">${secH(2, t(L("What does your answer rest on?", "你的判断基于什么？")), t(L("Pick any.", "可多选。")))}
        <div class="chips">${WHY.map(([id, lab]) => MP.h.chip(t(lab), "ai-why", id, tr.why.includes(id))).join("")}</div></div>
      <div class="ai-staff" data-rd-src="ai-staff">
        ${fig(L("Try it · Your team's time", "试一试 · 团队人手"), false)}
        <div class="ai-staff-h">
          <label for="ai-staff">${t(L(`Your team can read <b class="num" id="ai-staff-v">${s}</b> of every ${PLANS.total} messages by hand`, `你的团队每 ${PLANS.total} 条消息能人工处理 <span class="nowrap"><b class="num" id="ai-staff-v">${s}</b> 条</span>`))}</label>
          <dl class="ai-staff-st" id="ai-staff-st">${statsHtml(s)}</dl>
        </div>
        <div class="ai-staff-track">
          <input type="range" class="mp-range" id="ai-staff" min="0" max="${SLOTS}" step="5" value="${s}" data-input="ai-staff" aria-describedby="ai-staff-out">
          <div class="ai-slots" id="ai-slots" aria-hidden="true">${slots}</div>
          <span class="ai-staff-mark" style="--at:${(NEED / SLOTS).toFixed(4)}" aria-hidden="true"><i></i><span>${t(L(`Plan B needs ${NEED}`, `方案 B 需要 ${NEED}`))}</span></span>
        </div>
        <div class="ai-legend ai-slot-key" aria-hidden="true"><span><i class="ai-sk rd"></i>${t(L("read by your team", "团队读完"))}</span><span><i class="ai-sk wt"></i>${t(L("would wait", "要排队等"))}</span><span><i class="ai-sk sp"></i>${t(L("spare room", "余量"))}</span></div>
        <p class="ai-staff-out" id="ai-staff-out" aria-live="polite">${staffLine(s)}</p>
        <p class="ai-staff-a">${t(L(`Plan A needs no one — but <b class="num">${PLANS.A.auto - PLANS.A.correct}</b> learners reach the wrong team first.`, `方案 A 不需要人工，但有 <b class="num">${PLANS.A.auto - PLANS.A.correct}</b> 位学员会先被分到错的团队。`))}</p>
      </div>
    </div>`;
  }

  /* =====================================================================
     Step 5 — note
     ===================================================================== */
  const NOTE = [
    ["changed", L("What I changed", "我改了什么"), L("One change, in one sentence.", "一句话说清你改的那一处。")],
    ["improved", L("What improved", "改善了什么"), L("Use the numbers from your run.", "用你运行得到的数字。")],
    ["cost", L("What it cost", "代价是什么"), L("What got worse, or who does more work?", "什么变差了？谁的工作变多了？")],
    ["watch", L("What I'd watch next", "接下来要关注什么"), L("What would you check on new messages?", "在新消息上你会检查什么？")]
  ];
  function ranOpt(d) { return d.chg.opt && d.chg.ran.includes(d.chg.opt) ? d.chg.opt : (d.chg.ran[d.chg.ran.length - 1] || ""); }
  function starters(d) {
    const o = ranOpt(d), A = o ? RT.options[o] : null;
    const changed = {
      examples: L("I added 10 labeled examples of course-content questions that mention “error” to the router's training data, and changed nothing else.", "我给分流器补充了 10 条带标注的、提到“报错”的课程内容问题示例，其他什么都没改。"),
      threshold: L("I raised the confidence threshold from 0.60 to 0.75, so the router only acts on its own when it's more sure.", "我把置信度阈值从 0.60 提到 0.75，让分流器只在更有把握时才自动处理。"),
      definition: L("I rewrote the team definitions so “Course content” clearly covers formulas, code and exercises.", "我改写了团队类别定义，写明“课程内容”包括公式、代码和练习题。")
    };
    const out = {};
    if (!A) {
      out.changed = L("I changed one thing in the router: ", "我只改了分流器的一处：");
      out.improved = L(`On the same ${TOTAL} messages, `, `在同样的 ${TOTAL} 条消息上，`);
      out.cost = L("The trade-off was ", "代价是");
      out.watch = L("Next I'd re-test on fresh messages and watch how long stuck learners wait for the right team.", "接下来我会用新的消息再测一次，并关注卡住的学员要等多久才能找到对的团队。");
      return out;
    }
    out.changed = changed[o];
    out.improved = L(`On the same ${TOTAL} messages, content → tech mistakes went from ${B.errors.contentToTech} to ${A.errors.contentToTech}, and accuracy on handled messages went from ${pcr(B)} to ${pcr(A)}.`,
      `在同样的 ${TOTAL} 条消息上，内容→技术的错误从 ${B.errors.contentToTech} 条变为 ${A.errors.contentToTech} 条，自动处理的准确率从 ${pcr(B)} 变为 ${pcr(A)}。`);
    const costs = [];
    if (A.human > B.human) costs.push(L(`${A.human - B.human} more messages now go to a person (${B.human} → ${A.human}).`, `转给人工的消息多了 ${A.human - B.human} 条（${B.human} → ${A.human}）。`));
    errUp(A).forEach((k) => costs.push(k === "techToContent"
      ? L(`Tech → content mistakes rose from ${B.errors[k]} to ${A.errors[k]}, so some real tech problems now reach TAs first.`, `技术→内容的错误从 ${B.errors[k]} 条增加到 ${A.errors[k]} 条，一些真正的技术问题会先到助教那里。`)
      : L(`${t(ERRNAME[k])} mistakes rose from ${B.errors[k]} to ${A.errors[k]}.`, `${t(ERRNAME[k])}错误从 ${B.errors[k]} 条增加到 ${A.errors[k]} 条。`)));
    if (!costs.length) costs.push(L(`Nothing got worse on these ${TOTAL} messages, but the gain is modest: ${A.errors.contentToTech} content → tech mistakes remain.`, `在这 ${TOTAL} 条消息上没有指标变差，但改善有限：仍有 ${A.errors.contentToTech} 个内容→技术的错误。`));
    out.cost = { en: costs.map((x) => x.en).join(" "), zh: costs.map((x) => x.zh).join("") };
    const extraTC = A.errors.techToContent - B.errors.techToContent, extraH = A.human - B.human;
    const also = o === "examples" && extraTC > 0 ? L(` I'd also check that TAs can handle the ${extraTC} extra tech issues that now reach them.`, `我也会确认助教能应付多分到他们那里的 ${extraTC} 个技术问题。`)
      : o === "threshold" && extraH > 0 ? L(` I'd also check that the support team can read ${extraH} more messages.`, `我也会确认支持团队能多读 ${extraH} 条消息。`)
      : L("", "");
    out.watch = L("Next I'd re-test on a fresh week of messages and watch how long stuck learners wait for a first useful reply." + also.en,
      "接下来我会用新一周的消息再测一次，并关注卡住的学员要等多久才能得到第一条有用的回复。" + also.zh);
    return out;
  }
  function practitioner() {
    const A = RT.options.examples;
    return [
      ["changed", L("Added 10 labeled examples of course-content questions that mention “error” or “doesn’t work.” Nothing else changed.", "补充了 10 条带标注的、提到“报错”或“不对”的课程内容问题。其他都没动。")],
      ["improved", L(`On the same ${TOTAL} messages, content → tech mistakes fell from ${B.errors.contentToTech} to ${A.errors.contentToTech}; accuracy on handled messages rose from ${pcr(B)} to ${pcr(A)}.`, `在同样的 ${TOTAL} 条消息上，内容→技术的错误从 ${B.errors.contentToTech} 降到 ${A.errors.contentToTech}；自动处理准确率从 ${pcr(B)} 升到 ${pcr(A)}。`)],
      ["cost", L(`Tech → content mistakes rose from ${B.errors.techToContent} to ${A.errors.techToContent}. Some real tech problems (crashes, loading) now reach TAs first.`, `技术→内容的错误从 ${B.errors.techToContent} 升到 ${A.errors.techToContent}。部分真正的技术问题（崩溃、加载失败）会先到助教那里。`)],
      ["watch", L("Re-test on a fresh week of messages. Track how long stuck learners wait for a first useful reply, and whether assignment starts recover.", "用新一周的消息再测一次。跟踪卡住的学员多久能得到第一条有用的回复，以及“开始作业”的比例是否回升。")]
    ];
  }
  function noteReady(d) { return d.note.changed.trim().length >= 6 && d.note.improved.trim().length >= 6; }
  function noteBox(k, lab, ph, val, i, ls, rb) {
    const inner = `<div class="ai-nf"><label for="ai-note-${k}"><span class="ai-n">${pad2(i + 1)}</span><span class="ai-nf-l">${t(lab)}</span></label>
      <textarea class="textarea ai-ta" id="ai-note-${k}" rows="${k === "improved" ? 3 : 2}" data-input="ai-note" data-arg="${k}" data-fk="ai-note:${k}" placeholder="${esc(t(ph))}">${esc(val)}</textarea></div>`;
    return RD && ls ? RD.row(ls, k, inner, rb) : inner;
  }
  /** The run's numbers as before → after cells (note step + artifact). The target (content → tech) leads. */
  function runCells(A) {
    return [
      ["t", L("Content → tech", "内容→技术"), MP.n(B.errors.contentToTech), MP.n(A.errors.contentToTech)],
      ["", L("Accuracy", "准确率"), pcr(B), pcr(A)],
      ["", L("To a person", "转人工"), MP.n(B.human), MP.n(A.human)],
      ["", L("Tech → content", "技术→内容"), MP.n(B.errors.techToContent), MP.n(A.errors.techToContent)]
    ].map(([c, lab, b, a]) => `<div class="${c ? "is-t" : ""}"><dt class="ld-label">${t(lab)}</dt><dd class="num"><span>${b}</span><span class="ar" aria-hidden="true">→</span><span class="sr-only">${t(L(" to ", " → "))}</span><em>${a}</em></dd></div>`).join("");
  }
  function renderNote(ls) {
    const d = data(ls), o = ranOpt(d), A = o ? RT.options[o] : null;
    const strip = A
      ? `<div class="ai-runbox" data-rd-src="ai-runbox"><div class="ai-runbox-k"><span class="ld-label">${t(L("Your run", "你的运行结果"))}</span><span class="ai-runbox-o">${t(OPTS[o].title)}</span></div><dl class="ai-cells">${runCells(A)}</dl></div>`
      : `<div class="ai-runbox quiet"><p>${t(L("You haven't run a change in step 3 yet, so the starters will use general wording. You can go back anytime.", "你还没在第 3 步运行改动，所以开头句会用比较笼统的说法。随时可以回去补上。"))}</p></div>`;
    const P = practitioner();
    const nMore = ["cost", "watch"].filter((k) => d.note[k].trim()).length;
    const rb = RD ? RD.built(ls) : null, lr = RD && RD.on(ls) ? " lr-on" : "";
    return `<div class="work ai-note">
      ${fig(L("Model-change note · help router", "模型改动说明 · 求助分流器"), t(L("Draft", "草稿")))}
      <div class="ai-note-h"><h2 class="h2">${t(L(`Tested on the same ${TOTAL} messages`, `在同样的 ${TOTAL} 条消息上测试`))}</h2>
        <div class="ai-start"><div class="ai-start-b">${MP.h.secondary(t(L("Use sentence starters", "帮我起个头")), "ai-starters", "", { sm: true })}${RD ? RD.button(ls) : ""}</div><span class="ai-start-s">${t(L("Starters fill only empty boxes, from your own choices.", "开头句只填空着的框，内容来自你之前的选择。"))}</span></div></div>
      ${strip}
      <div class="ai-nfs lr-rows${lr}" id="ai-note-boxes">${NOTE.slice(0, 2).map(([k, lab, ph], i) => noteBox(k, lab, ph, d.note[k], i, ls, rb)).join("")}</div>
      ${MP.h.fold("ai-note-more", `<span class="ai-fold-t">${t(L("Two more parts", "另外两部分"))} <span class="ai-fold-sub">${t(L("optional", "可选"))}${nMore ? " · " + t(L(`${nMore} filled`, `已填 ${nMore} 项`)) : ""}</span></span>`,
        `<div class="ai-nfs lr-rows${lr}">${NOTE.slice(2).map(([k, lab, ph], i) => noteBox(k, lab, ph, d.note[k], i + 2, ls, rb)).join("")}</div>`)}
      ${MP.h.fold("ai-note-example", `<span class="ai-fold-t">${t(L("Compare with a practitioner's version", "对照一位从业者的写法"))} <span class="ld-pill ai-teach">${t(L("Teaching example", "教学示例"))}</span></span>`,
        `<div class="ai-pract">${P.map(([k, txt], i) => `<div class="ai-pract-r"><div class="lbl"><span class="ai-n">${pad2(i + 1)}</span>${t(NOTE[i][1])}</div><p>${t(txt)}</p></div>`).join("")}
          <p class="ai-pract-f">${t(L("One way to write it, not the answer. Notice the cost gets the same weight as the gain.", "这只是一种写法，不是标准答案。注意代价和收益写得一样具体。"))}</p></div>`)}
    </div>`;
  }

  /* ---------------- artifact ---------------- */
  function artifactHtml(d) {
    const o = ranOpt(d), A = o ? RT.options[o] : null;
    const parts = NOTE.filter(([k]) => d.note[k].trim());
    return `<div class="ai-art">
      <div class="ai-art-meta">${[t(L("Help router", "求助分流器")), A ? t(OPTS[o].title) : t(L("One change", "一处改动")), t(L(`Same ${TOTAL} messages`, `同样 ${TOTAL} 条消息`))].map((x) => `<span>${x}</span>`).join('<span class="sep" aria-hidden="true">·</span>')}</div>
      ${A ? `<div class="ai-art-fig">
        <figure>${grid(gridParts(B), { cols: 20, rows: 10, label: gridLabel(B, t(L("Before", "改动前"))) })}<figcaption class="ld-label">${t(L("Before", "改动前"))}</figcaption></figure>
        <span class="ai-art-ar" aria-hidden="true">→</span>
        <figure>${grid(gridParts(A), { cols: 20, rows: 10, label: gridLabel(A, t(L("After", "改动后"))) })}<figcaption class="ld-label">${t(L("After", "改动后"))}</figcaption></figure></div>
      <dl class="ai-cells ai-art-cells">${runCells(A)}</dl>` : ""}
      ${parts.length ? `<div class="ai-art-body">${parts.map(([k, lab]) => `<div class="ai-art-row"><div class="lbl">${t(lab)}</div><p>${esc(d.note[k]).replace(/\n/g, "<br>")}</p></div>`).join("")}</div>`
        : `<p class="muted">${t(L("The note hasn't been written yet.", "说明还没有写。"))}</p>`}
    </div>`;
  }

  /* =====================================================================
     Steps
     ===================================================================== */
  const stepNumbers = {
    id: "numbers",
    title: L("Read the router's results", "先读懂分流器的结果"),
    short: L("Read the numbers", "读数字"),
    lead: L(`LumenLearn's help [[router]] read ${TOTAL} messages from learners. It handled ${B.auto} on its own and passed ${B.human} to a person. Two percentages come out of that — and they answer different questions.`,
      `LumenLearn 的求助[[router|分流器]]读了 ${TOTAL} 条学员消息：自己处理了 ${B.auto} 条，把 ${B.human} 条<span class="ai-nw">交给人工。</span>由此能算出两个百分比，它们回答的是不同的问题。`),
    render: renderNumbers,
    ready: (ls) => { const d = data(ls); return !!(d.num.acc && d.num.cov); },
    reveal(ls) {
      const d = data(ls), okA = d.num.acc === NUMQ.acc.key, okC = d.num.cov === NUMQ.cov.key;
      const lab = (k) => t(NUMQ[k].opts.find((o) => o[0] === d.num[k])[1]).toLowerCase();
      const your = okA && okC
        ? L(`You matched each rate to what it's out of: ${pc(B.correct, B.auto)} is out of the ${B.auto} it handled; ${pc(B.auto, TOTAL)} is out of all ${TOTAL}.`, `你把每个比例都对上了它的基数：${pc(B.correct, B.auto)} 的基数是它处理的 ${B.auto} 条，${pc(B.auto, TOTAL)} 的基数是全部 ${TOTAL} 条。`)
        : L(`You read ${!okA ? `${B.correct} ÷ ${B.auto} as “${lab("acc")}.”` : `${B.auto} ÷ ${TOTAL} as “${lab("cov")}.”`} It's an easy slip — the two numbers sit side by side, but they're out of different groups.`,
          `你把${!okA ? ` ${B.correct} ÷ ${B.auto} ` : ` ${B.auto} ÷ ${TOTAL} `}理解成了“${!okA ? lab("acc") : lab("cov")}”。这很容易混：两个数字并排出现，但基数不同。`);
      return {
        trap: !(okA && okC), your,
        points: [
          L(`${pc(B.correct, B.auto)} is [[precision|accuracy on what it handled]]: ${B.correct} right out of the ${B.auto} it took on. ${pc(B.auto, TOTAL)} is [[coverage]]: ${B.auto} of all ${TOTAL} messages. Same router, two different [[denominator|denominators]].`,
            `${pc(B.correct, B.auto)} 是[[precision|自动处理准确率]]：它处理的 ${B.auto} 条里分对 ${B.correct} 条。${pc(B.auto, TOTAL)} 是[[coverage|覆盖率]]：全部 ${TOTAL} 条里它处理了 ${B.auto} 条。同一个分流器，两个不同的[[denominator|分母]]。`),
          L(`Out of all ${TOTAL}, the router alone got ${B.correct} right — ${pc(B.correct, TOTAL)}. The other ${B.human} still land on a person's desk.`,
            `放到全部 ${TOTAL} 条里看，分流器独自分对的是 ${B.correct} 条，即 ${pc(B.correct, TOTAL)}。另外 ${B.human} 条仍然要人来处理。`),
          L("Practitioners report the pair together. It's easy to raise accuracy by handling fewer messages — you'll see that in step 3.",
            "从业者会把这两个数一起报告。只处理更少的消息，准确率就很容易变高——第 3 步你会亲眼看到。")
        ]
      };
    },
    hints: [
      L("A percentage is always “out of” something. For each one, ask: out of which messages?", "百分比总有一个“基数”。每个数字都问一句：它是在哪些消息里算的？"),
      L(`${B.correct} ÷ ${B.auto} only looks at the messages the router handled itself. ${B.auto} ÷ ${TOTAL} looks at every message that came in.`, `${B.correct} ÷ ${B.auto} 只看分流器自己处理的消息；${B.auto} ÷ ${TOTAL} 看的是所有进来的消息。`),
      L(`Picture a new hire who answers ${B.auto} of ${TOTAL} emails and gets ${B.correct} of those right. “${pc(B.correct, B.auto)} right” is about the emails they answered; “${pc(B.auto, TOTAL)} answered” is about how much of the inbox they cover.`,
        `想象一位新同事：${TOTAL} 封邮件回了 ${B.auto} 封，其中 ${B.correct} 封回得对。“${pc(B.correct, B.auto)} 回得对”说的是他回过的邮件；“回了 ${pc(B.auto, TOTAL)}”说的是他覆盖了多少收件箱。`)
    ],
    shows: L("Model evaluation in machine-learning courses: reporting accuracy, coverage and similar rates — and always saying what each one is out of.",
      "机器学习课程里的模型评估：报告准确率、覆盖率等指标，并且始终说明每个指标的基数是什么。")
  };

  const stepErrors = {
    id: "errors",
    title: L("Read the mistakes, not just the score", "看错误本身，而不只是分数"),
    short: L("Read the mistakes", "看错误"),
    lead: L("Here are 8 messages from the ones it handled, with where the router sent each and where it should have gone. Tap at least two you'd point a teammate to, then name the pattern.",
      "下面是它处理过的 8 条消息，标出了分流器把它分到哪里、本该分到哪里。至少点选两条你会指给同事看的，再说出你看到的规律。"),
    render: renderErrors,
    ready: (ls) => { const d = data(ls); return !!d.err.pattern && d.err.cited.length >= 2; },
    reveal(ls) {
      const d = data(ls), nw = (id) => `<span class="ai-nw">${id}</span>`, ids = d.err.cited.slice().sort().map(nw).join(isZh() ? "、" : ", ");
      const contrast = d.err.cited.filter((id) => { const m = D.misrouted.find((x) => x.id === id); return m && m.pred === m.truth; });
      const patLab = innerQ(t(PATTERNS.find((p) => p[0] === d.err.pattern)[1]));
      let your = L(`You cited ${d.err.cited.length} messages (${ids}) and named: “${patLab}.”`, `你引用了 ${d.err.cited.length} 条消息（${ids}），并指出：“${patLab}”。`);
      if (d.err.pattern === "random") your = L(`You called it random. With only eight messages that's a fair worry — but ${msgCT.length} of the ${msgWrong.length} mistakes here have the same shape, and the full set agrees (${B.errors.contentToTech} of ${WRONG}).`,
        `你认为是随机的。只有 8 条消息时，这种担心很合理——但这里 ${msgWrong.length} 个错误里有 ${msgCT.length} 个是同一种情况，完整数据也一样（${WRONG} 个里有 ${B.errors.contentToTech} 个）。`);
      if (d.err.pattern === "billing") your = L(`You named billing/account mix-ups. They're real (${B.errors.billingAccount} of ${WRONG}), but a much smaller group than content → tech (${B.errors.contentToTech}).`,
        `你指出了账单和账户的混淆。这确实存在（${WRONG} 个里有 ${B.errors.billingAccount} 个），但比内容→技术（${B.errors.contentToTech} 个）少得多。`);
      const points = [
        L(`Content → Tech support is the biggest group: ${B.errors.contentToTech} of all ${WRONG} mistakes. Words like “error” or “doesn’t work” pull a message toward Tech even when the learner is stuck on the material.`,
          `内容问题被分到技术支持是最大的一类：${WRONG} 个错误里占 ${B.errors.contentToTech} 个。“报错”“不对”这类词会把消息拉向技术支持，哪怕学员其实是卡在了课程内容上。`),
        L("These are learners stuck on an assignment — the same step where the BA lens finds the biggest leak (75% → 62.5% start an assignment). A wrong route means a longer wait for the right help.",
          "这些正是卡在作业上的学员——商业分析视角发现漏斗最大的缺口也在这一步（开始作业的比例从 75% 降到 62.5%）。分错团队，意味着要等更久才能得到对的帮助。"),
        contrast.length
          ? L(`You also cited ${listJoin(contrast.map(nw))}, which the router got right — a useful contrast. Real tech problems use the same words, so the fix can't just be “ignore the word error.”`, `你还引用了 ${contrast.map(nw).join("、")}，${contrast.length > 1 ? "这几条" : "这条"}分流器分对了——是很好的对照。真正的技术问题也会用同样的词，所以不能简单地“忽略‘报错’这个词”。`)
          : L("Pointing to specific messages makes a pattern checkable. Two of the eight were routed right — real tech problems use the same words, so the fix can't just be “ignore the word error.”", "指出具体的消息，规律才能被别人核对。8 条里有 2 条分对了——真正的技术问题也会用同样的词，所以不能简单地“忽略‘报错’这个词”。")
      ];
      return { trap: d.err.pattern === "random", your, points };
    },
    hints: [
      L("Skip the two that went to the right team. What do the other six have in common?", "先跳过分对的两条。剩下六条有什么共同点？"),
      L("Look at the words. Which messages mention an error or something not working — and where did they end up?", "看用词。哪些消息提到了报错或“不对”？它们最后被分到了哪里？"),
      L("For example, M-014 (“an error in the formula”) and M-063 (“the example code gives a different number”) are both questions about the material, but both went to Tech support.", "例如 M-014（“公式一直报错”）和 M-063（“示例代码算出的数不一样”）都是关于课程内容的问题，却都被分到了技术支持。")
    ],
    shows: L("Error analysis: reading what a model got wrong and grouping the mistakes — a core habit in applied machine learning and language-model projects.",
      "错误分析：逐条读模型分错的样本并归类——这是应用机器学习和语言模型项目里的基本功。")
  };

  const stepChange = {
    id: "change",
    title: L("Change one thing, then re-run", "只改一处，再跑一遍"),
    short: L("Change one thing", "改一处"),
    lead: L(`Pick one fix. Before you run it, predict what will get better and what might get worse — then test it on the same ${TOTAL} messages.`,
      `选一个改法。运行之前，先预测什么会变好、什么可能变差，再在同样的 ${TOTAL} 条消息上测试。`),
    render: renderChange,
    ready: (ls) => { const c = data(ls).chg; return !!c.opt && c.ran.includes(c.opt); },
    reveal(ls) {
      const c = data(ls).chg, A = RT.options[c.opt], preds = c.better.concat(c.worse), held = preds.filter((p) => predCheck(p, A)[0]).length;
      const by = {
        examples: L(`Adding examples fixed most content → tech mistakes (${B.errors.contentToTech} → ${A.errors.contentToTech}), but tech → content rose (${B.errors.techToContent} → ${A.errors.techToContent}): the router now sends some real tech problems to TAs.`,
          `补充示例修掉了大部分内容→技术的错误（${B.errors.contentToTech} → ${A.errors.contentToTech}），但技术→内容的错误增加了（${B.errors.techToContent} → ${A.errors.techToContent}）：一些真正的技术问题现在被分给了助教。`),
        threshold: L(`Raising the [[threshold]] lifts accuracy to ${pcr(A)}, but ${A.human - B.human} more messages go to people (${B.human} → ${A.human}). Accuracy rose partly because the router took on fewer messages.`,
          `提高[[threshold|置信度阈值]]让准确率升到 ${pcr(A)}，但转给人工的消息多了 ${A.human - B.human} 条（${B.human} → ${A.human}）。准确率变高，部分是因为分流器接手的消息变少了。`),
        definition: L(`Rewriting the definitions is a cheap, safe gain: content → tech fell ${B.errors.contentToTech} → ${A.errors.contentToTech} and nothing got worse — but it's small.`,
          `改写定义成本低、也安全：内容→技术的错误从 ${B.errors.contentToTech} 降到 ${A.errors.contentToTech}，没有指标变差——但改善不大。`)
      };
      return {
        your: preds.length === 1 ? (held ? L("Your prediction showed up.", "你的预测出现了。") : L("Your prediction didn't show up — worth asking why.", "你的预测没有出现——值得想想为什么。"))
          : preds.length ? L(`${held} of your ${preds.length} predictions showed up.`, `你的 ${preds.length} 个预测里，有 ${held} 个出现了。`) : null,
        points: [by[c.opt],
          L(`Every option runs on the same ${TOTAL} messages. Without that, you couldn't tell the effect of your change from a change in the messages.`, `每个改法都在同样的 ${TOTAL} 条消息上运行。否则你分不清结果变化是来自你的改动，还是来自消息本身。`),
          L("Practitioners expect a [[tradeoff]] and look for it on purpose. A fix with no visible cost usually means nobody has looked yet.", "从业者默认会有[[tradeoff|取舍]]，并且会主动去找。看不出代价的改动，往往只是还没人去看。")]
      };
    },
    hints: [
      L("Each fix pulls a different lever: what the model learns from, how sure it must be, or how the teams are described.", "每个改法动的是不同的杠杆：模型从什么里学、要多有把握才行动、团队是怎么描述的。"),
      L("Raising the threshold makes the router act only when it's very sure. What happens to the messages it's less sure about?", "提高阈值后，分流器只在很有把握时才行动。那些它没把握的消息会去哪里？"),
      L("Example prediction for adding content examples: “Fewer content → tech mistakes. Risk: it may start sending real tech problems to TAs.”", "补充内容示例的预测可以这样写：“内容→技术的错误会变少。风险：它可能开始把真正的技术问题分给助教。”")
    ],
    shows: L("Experiment loops in machine-learning courses: change one thing, re-run on a fixed test set, and compare before and after.",
      "机器学习课程里的实验循环：只改一处，在固定的测试集上重跑，比较前后差异。")
  };

  const stepTradeoff = {
    id: "tradeoff",
    title: L("Is the more accurate plan the better one?", "更准的方案就一定更好吗？"),
    short: L("Weigh the trade-off", "权衡取舍"),
    lead: L(`A new situation: two plans for the router, tested on the same ${PLANS.total} messages. Plan B is more accurate. Is it better?`,
      `换个情境：分流器有两个方案，<span class="nowrap">都在同样的 ${PLANS.total} 条</span><span class="nowrap">消息上测试过</span>。方案 B <span class="ai-nw">更准，它就更好吗？</span>`),
    render: renderTradeoff,
    ready: (ls) => { const tr = data(ls).tr; return !!tr.ans && tr.why.length > 0; },
    reveal(ls) {
      const tr = data(ls).tr, whyL = listJoin(WHY.filter((w) => tr.why.includes(w[0])).map((w) => isZh() ? t(w[1]) : t(w[1]).charAt(0).toLowerCase() + t(w[1]).slice(1)));
      const aw = PLANS.A.auto - PLANS.A.correct, bw = PLANS.B.auto - PLANS.B.correct, bh = PLANS.total - PLANS.B.auto;
      const your = {
        yes: L(`${pc(PLANS.B.correct, PLANS.B.auto)} beats ${pc(PLANS.A.correct, PLANS.A.auto)} only if the ${bh} messages Plan B passes to people don't count. Accuracy is measured on what each plan handles — and B handles less.`,
          `只有不把方案 B 交给人工的 ${bh} 条算进去，${pc(PLANS.B.correct, PLANS.B.auto)} 才比 ${pc(PLANS.A.correct, PLANS.A.auto)} 好。准确率只算每个方案自己处理的部分——而 B 处理得更少。`),
        no: L(`You picked A — fair if staff time is scarce. Just be sure ${aw} wrong routes is acceptable for learners who are already stuck.`, `你选了 A——人手紧张时这很合理。只是要确认：让 ${aw} 位本就卡住的学员先被分错，是可以接受的。`),
        depends: L(`You said it depends — on ${whyL}. That's how practitioners frame it.`, `你说要看情况——取决于${whyL}。从业者也是这样思考的。`)
      }[tr.ans];
      return {
        trap: tr.ans === "yes", your,
        points: [
          L(`Plan B is more accurate when it acts (${pc(PLANS.B.correct, PLANS.B.auto)} vs. ${pc(PLANS.A.correct, PLANS.A.auto)}) and makes fewer wrong routes (${bw} vs. ${aw}), but it leaves ${bh} of every ${PLANS.total} messages for people. Plan A asks people for nothing.`,
            `方案 B 自动处理时更准（${pc(PLANS.B.correct, PLANS.B.auto)} 对 ${pc(PLANS.A.correct, PLANS.A.auto)}），分错也更少（${bw} 对 ${aw}），但每 ${PLANS.total} 条要留 ${bh} 条给人工。方案 A 完全不需要人工。`),
          L("Which is better depends on what a wrong route costs a stuck learner, and whether the team has time for the extra reads. That's a [[tradeoff]], not a math answer.",
            "哪个更好，取决于分错一次对卡住的学员代价多大，以及团队有没有时间多读这些消息。这是[[tradeoff|取舍]]，不是算术题。"),
          L(`This is one set of ${PLANS.total} messages. On a fresh set, 81 and 57 could each shift by a few. Don't call one plan better from a single fixed test.`,
            `这只是一组 ${PLANS.total} 条消息。换一组新消息，81 和 57 都可能上下浮动几条。不要只凭一次固定的测试就断定哪个方案更好。`)
        ]
      };
    },
    hints: [
      L("Accuracy only counts the messages a plan handles. What happens to the rest?", "准确率只算方案自己处理的消息。剩下的怎么办？"),
      L(`Plan B leaves ${PLANS.total - PLANS.B.auto} of ${PLANS.total} messages for people. Is there someone to read them?`, `方案 B 把 ${PLANS.total} 条里的 ${PLANS.total - PLANS.B.auto} 条留给人工。有人来读吗？`),
      L("Example: “It depends. B makes fewer mistakes (3 vs. 19) but needs people for 40 messages. If the TA team is small, A may get learners help sooner.”", "示例：“要看情况。B 错得更少（3 对 19），但有 40 条需要人工。如果助教团队人少，A 可能让学员更快得到帮助。”")
    ],
    shows: L("Deciding how a model should behave — accuracy vs. coverage vs. human workload — comes up in applied AI, human-in-the-loop and AI product courses.",
      "决定模型该怎么取舍——准确率、覆盖率和人工工作量之间——是应用人工智能、人机协同和 AI 产品类课程里常见的问题。")
  };

  const stepNote = {
    id: "note",
    title: L("Write the model-change note", "写一份模型改动说明"),
    short: L("Write the note", "写说明"),
    lead: L("Four short parts a teammate could act on. Fill the first two; the rest are optional. Starters can draft from what you did.",
      "四个简短的部分，让同事看了就能接着做。先填前两项，其余可选。开头句会根据你做过的选择起草。"),
    render: renderNote,
    ready: (ls) => noteReady(data(ls)),
    reveal(ls) {
      const d = data(ls);
      return {
        your: d.note.cost.trim() ? L("You wrote down the cost, not just the gain.", "你写下了代价，而不只是收益。") : L("Your note covers the change and the gain. Adding the cost makes it a note others can trust.", "你的说明写了改动和收益。补上代价，别人才更信得过。"),
        points: [
          L("A good change note gives the cost the same weight as the gain — in numbers.", "好的改动说明，会把代价写得和收益一样具体，用数字说话。"),
          L(`Saying “the same ${TOTAL} messages” tells a reader the comparison is fair.`, `写明“同样的 ${TOTAL} 条消息”，读者就知道这个比较是公平的。`),
          L("“What I'd watch next” turns a one-time fix into something the team keeps checking — like how long stuck learners wait for help.", "“接下来要关注什么”能把一次性的修补变成团队持续检查的事——比如卡住的学员要等多久才能得到帮助。")
        ]
      };
    },
    hints: [
      L("Write it for a teammate who wasn't there: what you changed and what happened, in numbers.", "写给一位当时不在场的同事：你改了什么、结果如何，用数字说明。"),
      L("Give the cost the same sentence shape as the gain: “X went down, but Y went up.”", "把代价写成和收益一样的句式：“X 下降了，但 Y 上升了。”"),
      L(`Example: “Added 10 content examples. Content → tech mistakes fell from ${B.errors.contentToTech} to ${RT.options.examples.errors.contentToTech}. Cost: tech → content rose from ${B.errors.techToContent} to ${RT.options.examples.errors.techToContent}.”`,
        `示例：“补充了 10 条内容示例。内容→技术的错误从 ${B.errors.contentToTech} 降到 ${RT.options.examples.errors.contentToTech}。代价：技术→内容从 ${B.errors.techToContent} 升到 ${RT.options.examples.errors.techToContent}。”`)
    ],
    shows: L("Model cards and change notes: short write-ups of what a model change did and what it cost — common in capstone and team projects.",
      "模型卡片和改动说明：简短记录一次模型改动带来了什么、付出了什么——在毕业设计和团队项目里很常见。")
  };

  /* =====================================================================
     AI layer (the product's reading layer — not this lens's subject)
     AI-2 "Ask about this step" (step.ask) + AI-1 "second read" rules for the model-change note. Composed from the
     student's own picks/text and MP.data; before a step is ready, chips explain and point, never reveal.
     ===================================================================== */
  const AIK = MP.ai, X = AIK && AIK.text, T2 = L;
  const r1 = (x) => Math.round(x * 10) / 10;
  const lowF = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const accP = (r) => r1(accOf(r) * 100);
  const KN = (() => {
    const k = [TOTAL, B.auto, B.correct, B.human, WRONG, r1(B.correct / B.auto * 100), r1(B.auto / TOTAL * 100), r1(B.correct / TOTAL * 100), 0.6, 0.75, 0.60, 10, 100, 81, 57, 60, 95, 19, 40, 81.0, 95.0, 30];
    Object.values(B.errors).forEach((v) => k.push(v));
    Object.values(RT.options).forEach((A) => {
      k.push(A.auto, A.correct, A.human, accP(A), Math.abs(A.human - B.human), Math.abs(A.auto - B.auto), r1(Math.abs(accP(A) - accP(B))), Math.abs(A.errors.contentToTech - B.errors.contentToTech), r1(A.auto / TOTAL * 100));
      Object.values(A.errors).forEach((v) => k.push(v));
    });
    return k;
  })();
  const FAM = {
    examples: { en: ["example", "examples", "labeled", "labelled", "training data", "samples"], zh: ["示例", "样本", "例子", "标注"] },
    threshold: { en: ["threshold", "confidence", "0.75"], zh: ["阈值", "置信"] },
    definition: { en: ["definition", "definitions", "categories", "category", "team descriptions"], zh: ["定义", "类别"] }
  };
  const LX = {
    metric: { en: ["accuracy", "accurate", "coverage", "handled", "handles", "to a person", "people", "human", "humans", "mistakes", "errors", "wrong team", "wait", "waiting", "reply", "replies", "content → tech", "content to tech"], zh: ["准确率", "覆盖", "自动处理", "转人工", "人工", "错误", "分错", "等待", "回复", "内容→技术"] },
    acc: { en: ["accuracy", "accurate"], zh: ["准确率", "准确"] },
    cover: { en: ["coverage", "handles", "handled", "118", "to a person", "fewer messages", "sent to people"], zh: ["覆盖", "自动处理", "118", "转人工", "转给人工"] },
    human: { en: ["person", "people", "human", "humans", "staff", "support team", "by hand", "manual"], zh: ["人工", "转人工", "人手", "支持团队", "助教"] },
    nothing: { en: ["nothing", "none", "no cost", "no downside", "n/a", "nothing much"], zh: ["没什么", "没有代价", "无", "没有"] },
    nouns: { en: ["router", "threshold", "examples", "definitions", "accuracy", "messages", "model"], zh: ["分流器", "阈值", "示例", "定义", "准确率", "消息", "模型"] }
  };
  const famsIn = (H, k) => Object.keys(FAM).filter((f) => H.has(k, FAM[f]));
  const optLabels = () => { const o = []; Object.values(OPTS).forEach((x) => o.push(x.title.en, x.title.zh)); NOTE.forEach((x) => o.push(x[1].en, x[1].zh)); BETTER.concat(WORSE).forEach((x) => o.push(x[1].en, x[1].zh)); return o; };
  const runA = (c) => (c.o ? RT.options[c.o] : null);
  const RULES = [
    { id: "ai.oneChange", kind: "keep",
      test(F, c, H) { const f = famsIn(H, "changed"); if (f.length !== 1 || (c.o && f[0] !== c.o)) return null; return H.at("changed", H.find("changed", FAM[f[0]])[0]); },
      say() { return { g: [
        T2(["One change, named exactly. That's what makes the before and after comparable."], ["只改了一处，而且写得很准，前后才有可比性。"]),
        T2(["A teammate knows exactly what to undo if it goes wrong. Keep this line as it is."], ["万一出问题，同事一眼就知道该撤回什么。这一句保持原样。"]),
        T2(["One lever, clearly named. Anyone re-running this would make the same change."], ["只动了一个杠杆，而且写得清楚。任何人重跑，都会做出同样的改动。"])],
        why: T2(["Change two things at once and nobody can say which one moved the numbers."], ["同时改两处，就没人说得清是哪一处让数字变了。"]),
        cites: [{ lens: "ai", step: "change" }] }; } },
    { id: "ai.numbersMatched", kind: "keep",
      test(F, c, H) { const ns = H.known("improved"); return c.o && ns.length >= 2 ? H.at("improved", ns[0]) : null; },
      say() { return { g: [
        T2(["Your numbers match your run, with a before and an after. A teammate can check them against step 3."], ["你的数字和运行结果对得上，有改动前也有改动后。同事可以拿第 3 步去核对。"]),
        T2(["Before and after, both from the same messages. That's the comparison a reader trusts. Keep it."], ["改动前、改动后，都来自同一批消息。读者信得过的就是这种比较。保留。"]),
        T2(["Every figure here traces back to your run. Nothing to change in this line."], ["这里每个数字都能追溯到你的运行结果。这一句不用改。"])],
        why: T2(["A gain stated as a before and after, on the same messages, can't be mistaken for luck with a new batch."], ["在同一批消息上写明前后对比，收益就不会被误认为是换了一批消息的运气。"]),
        cites: [{ lens: "ai", step: "change" }] }; } },
    { id: "ai.costNamed", kind: "keep",
      test(F, c, H) { if (F.cost.empty || H.has("cost", LX.nothing)) return null; const n = H.known("cost")[0]; return n ? H.at("cost", n) : null; },
      say() { return { g: [
        T2(["You give the cost a number, the same way you gave the gain. That's what makes the note trustworthy."], ["你给代价也配了数字，和收益写得一样具体。这让说明更可信。"]),
        T2(["Cost in numbers, not just a warning. Keep it."], ["代价用数字写出来，而不只是一句提醒。保留。"])],
        cites: [{ lens: "ai", step: "change" }] }; } },

    { id: "ai.noRun", kind: "unsure", pri: 2,
      test(F, c, H) { return !c.o && !F.changed.empty ? H.box("changed") : null; },
      say() { return { g: [
        T2(["You haven't run a change in step 3 yet, so I can't check these numbers against anything. Running it takes a few seconds."], ["你还没在第 3 步运行改动，所以这些数字我没有东西可以核对。运行一次只要几秒钟。"]),
        T2(["I'm not sure what to compare this note with: there's no run from step 3 yet."], ["我不确定该拿什么来对照这份说明：第 3 步还没有运行结果。"])],
        cites: [{ lens: "ai", step: "change", go: true }] }; } },
    { id: "ai.numberUnknown", kind: "try", pri: 1,
      test(F, c, H) { for (const k of ["improved", "cost"]) { const n = H.unknown(k)[0]; if (n) return Object.assign(H.at(k, n), { x: { raw: n.raw } }); } return null; },
      say(F, c, a) { const A = runA(c), raw = esc(a.x.raw); const ref = A ? [{ nw: `${B.errors.contentToTech} → ${A.errors.contentToTech}` }] : [{ nw: `${B.correct} / ${B.auto}` }]; return { g: [
        T2(["I can't find ", { b: raw }, " in your run. ", A ? ["Content → tech mistakes went ", ref[0], " and accuracy ", { nw: `${pcr(B)} → ${pcr(A)}` }, "."] : ["The baseline is ", { b: pcr(B) }, " on the messages it handled."], " Is it from somewhere else?"], ["你的运行结果里我没找到 ", { b: raw }, "。", A ? ["内容→技术的错误是 ", ref[0], "，准确率是 ", { nw: `${pcr(B)} → ${pcr(A)}` }, "。"] : ["基线是自动处理部分的准确率 ", { b: pcr(B) }, "。"], "这个数是从别处来的吗？"]),
        T2(["Where does ", { b: raw }, " come from? It isn't in the before/after table from step 3."], [{ b: raw }, " 是哪里来的？第 3 步的前后对比表里没有这个数。"])],
        d: [T2(["Check ", { b: raw }, " against the table in step 3; it isn't there."], ["拿第 3 步的对比表核对一下 ", { b: raw }, "：表里没有。"])],
        why: T2(["A teammate re-running your change will compare numbers first. One that doesn't match makes them doubt the rest."], ["重跑你改动的同事，第一件事就是对数字。有一个对不上，其余的也会被怀疑。"]),
        cites: [{ lens: "ai", step: "change" }] }; } },
    { id: "ai.changedTwo", kind: "ask", pri: 2,
      test(F, c, H) { const f = famsIn(H, "changed"); if (f.length < 2) return null; return Object.assign(H.at("changed", H.find("changed", FAM[f[1]])[0]), { x: { f } }); },
      say(F, c, a) { const nm = (k) => OPTS[k].title, f = a.x.f; return { g: [
        T2(["This names two changes: ", { b: nm(f[0]).en }, " and ", { b: nm(f[1]).en }, ". ", c.o ? ["In step 3 you ran one: you ", OPTS[c.o].did.en, ". Which does the note describe?"] : "Which one does the note describe?"], ["这里写了两处改动：", { b: nm(f[0]).zh }, "和", { b: nm(f[1]).zh }, "。", c.o ? ["你在第 3 步只跑了一处（", OPTS[c.o].title.zh, "）。这份说明写的是哪一个？"] : "这份说明写的是哪一个？"]),
        T2(["If both changed, nobody can tell which one moved the numbers. If only one did, the other is worth deleting."], ["如果两处都改了，就没人说得清是哪一处让数字变了；如果只改了一处，另一处就该删掉。"])],
        d: [T2(["Name only the change you ran", c.o ? [": you ", OPTS[c.o].did.en] : "", "."], ["只写你实际运行的那一处", c.o ? ["：", OPTS[c.o].title.zh] : "", "。"])],
        why: T2(["A change note is a recipe for repeating the test; two ingredients where there was one breaks the recipe."], ["改动说明就是重复试验的配方；只放了一样料，却写成两样，配方就不对了。"]),
        cites: [{ lens: "ai", step: "change" }] }; },
      bit: T2("Changed now names one change", "“我改了什么”只写一处了") },
    { id: "ai.changedMismatch", kind: "ask", pri: 2,
      test(F, c, H) { const f = famsIn(H, "changed"); if (f.length !== 1 || !c.o || f[0] === c.o) return null; return Object.assign(H.at("changed", H.find("changed", FAM[f[0]])[0]), { x: { f: f[0] } }); },
      say(F, c, a) { return { g: [
        T2(["This describes one change (", { b: OPTS[a.x.f].title.en }, "), but in step 3 you ", { b: OPTS[c.o].did.en }, ". Which one should the numbers below go with?"], ["这里写的是", { b: OPTS[a.x.f].title.zh }, "，但你要汇报的运行是", { b: OPTS[c.o].title.zh }, "。下面的数字应该对应哪一个？"]),
        T2(["Your step 3 run and this line name different changes. A teammate would test the wrong thing."], ["你第 3 步的运行和这一句写的不是同一处改动。同事照着做，会测错东西。"])],
        cites: [{ lens: "ai", step: "change" }] }; } },
    { id: "ai.coverageShift", kind: "try", pri: 3,
      test(F, c, H) { if (c.o !== "threshold" || !H.has("improved", LX.acc) || H.has("improved", LX.cover)) return null; const h = H.find("improved", LX.acc)[0]; return H.at("improved", h); },
      say(F, c) { const A = runA(c); return { g: [
        T2(["Up from what to what, and out of how many? Your run shows ", { nw: `${pcr(B)} → ${pcr(A)}` }, " on the messages it handled, but it now handles ", { b: A.auto }, " of ", { b: TOTAL }, ", not ", { b: B.auto }, "."], ["从多少升到多少？分母是什么？你的运行结果是：自动处理部分的准确率 ", { nw: `${pcr(B)} → ${pcr(A)}` }, "，但自动处理的消息从 ", { b: B.auto }, " 条变成了 ", { b: TOTAL }, " 条里的 ", { b: A.auto }, " 条。"]),
        T2(["Accuracy rose partly because the router took on fewer messages: ", { nw: `${B.auto} → ${A.auto}` }, ". A reader needs both numbers to judge the gain."], ["准确率变高，部分是因为分流器接手的消息变少了：", { nw: `${B.auto} → ${A.auto}` }, "。读者要两个数字都看到，才能判断这份收益。"])],
        d: [T2(["Report the pair: accuracy ", { nw: `${pcr(B)} → ${pcr(A)}` }, ", handled ", { nw: `${B.auto} → ${A.auto}` }, "."], ["把两个数一起写：准确率 ", { nw: `${pcr(B)} → ${pcr(A)}` }, "，自动处理 ", { nw: `${B.auto} → ${A.auto}` }, "。"])],
        why: T2(["Accuracy only counts what the router handled; with a higher threshold it handles less, so accuracy alone overstates the gain."], ["准确率只算分流器自己处理的部分；阈值调高后它处理得更少，只看准确率会高估收益。"]),
        cites: [{ lens: "ai", step: "change", label: T2("AI·3 · your run", "AI·第3步 · 你的运行") }] }; },
      bit: T2("Improved now reports what it handles", "“改善”补上了处理量") },
    { id: "ai.costMissing", kind: "ask", pri: 3,
      test(F, c, H) { const A = runA(c); if (!A || !(A.human > B.human || errUp(A).length)) return null; if (F.cost.empty) return H.box("cost"); const h = H.find("cost", LX.nothing)[0]; return h && F.cost.words <= 6 ? H.at("cost", h) : null; },
      say(F, c) { const A = runA(c), up = errUp(A), dh = A.human - B.human;
        const g = dh > 0 ? [
          T2(["Your run sent ", { b: dh }, " more messages to a person (", { nw: `${B.human} → ${A.human}` }, "). Is that worth a line in what it cost? It's the first thing a support lead will ask."], ["这次改动让转人工的消息多了 ", { b: dh }, " 条（", { nw: `${B.human} → ${A.human}` }, "）。值得在“代价是什么”里写一句吗？支持团队负责人最先会问的就是这个。"]),
          T2(["Who reads the extra ", { b: dh }, " messages? Your run moved ", { nw: `${B.human} → ${A.human}` }, " to people. That's the cost a teammate needs to plan for."], ["多出来的 ", { b: dh }, " 条消息谁来读？你的运行让转人工从 ", { nw: `${B.human} → ${A.human}` }, "。这是同事需要提前安排的代价。"])]
          : [T2(["Your run fixed content → tech mistakes but ", { b: t(ERRNAME[up[0]]) }, " rose: ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, ". Is that worth a line in what it cost?"], ["你的运行修掉了内容→技术的错误，但", { b: t(ERRNAME[up[0]]) }, "的错误增加了：", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, "。值得在“代价是什么”里写一句吗？"]),
             T2(["Some real tech problems now reach TAs first: ", t(ERRNAME[up[0]]), " went ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, ". A teammate would want that written down."], ["一些真正的技术问题现在会先到助教那里：", t(ERRNAME[up[0]]), "从 ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, "。同事会希望你把这一点写下来。"])];
        return { g, d: [dh > 0 ? T2(["Add the cost: ", { nw: `${B.human} → ${A.human}` }, " messages to a person."], ["补上代价：转人工 ", { nw: `${B.human} → ${A.human}` }, " 条。"]) : T2(["Add the cost: ", t(ERRNAME[up[0]]), " ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, "."], ["补上代价：", t(ERRNAME[up[0]]), " ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }, "。"])],
          why: T2(["A gain without its cost reads like a free win, and the team that inherits the cost finds out last."], ["只写收益不写代价，读起来像白捡的好处，而承担代价的团队会最后才知道。"]),
          cites: [{ lens: "ai", step: "change", label: T2("AI·3 · your run", "AI·第3步 · 你的运行") }] }; },
      bit: T2("Cost now written down", "补上了代价") },
    { id: "ai.noNumbers", kind: "try", pri: 4,
      test(F, c, H) { if (!c.o || F.improved.empty || H.nums("improved").length || (c.o === "threshold" && H.has("improved", LX.acc))) return null; return H.sent("improved"); },
      say(F, c) { const A = runA(c), ct = `${B.errors.contentToTech} → ${A.errors.contentToTech}`, ac = `${pcr(B)} → ${pcr(A)}`; return { g: [
        T2(["How much? Your run has the numbers: content → tech mistakes ", { nw: ct }, ", accuracy on handled messages ", { nw: ac }, "."], ["改善了多少？你的运行结果里就有数字：内容→技术的错误 ", { nw: ct }, "，自动处理准确率 ", { nw: ac }, "。"]),
        T2(["A teammate will ask by how much. ", { nw: ct }, " is the number your change was aimed at."], ["同事会问：改善了多少？", { nw: ct }, " 正是你这次改动瞄准的数字。"])],
        d: [T2(["Put the run's numbers here: ", { nw: ct }, "; accuracy ", { nw: ac }, "."], ["把运行结果写进来：", { nw: ct }, "；准确率 ", { nw: ac }, "。"])],
        why: T2(["What improved is the claim; the before and after are the evidence."], ["“改善了什么”是主张，前后的数字是证据。"]),
        cites: [{ lens: "ai", step: "change", label: T2("AI·3 · your run", "AI·第3步 · 你的运行") }] }; } },
    { id: "ai.noDenominator", kind: "try", pri: 4,
      test(F, c, H) { if (!c.o || c.o === "threshold" || !H.has("improved", LX.acc) || H.known("improved").length >= 2) return null; return H.at("improved", H.find("improved", LX.acc)[0]); },
      say(F, c) { const A = runA(c); return { g: [
        T2(["Accuracy out of what? On the messages it handled, your run went ", { nw: `${pcr(B)} → ${pcr(A)}` }, " (", { b: A.correct }, " of ", { b: A.auto }, ")."], ["准确率的分母是什么？在它自动处理的消息上，你的运行结果是 ", { nw: `${pcr(B)} → ${pcr(A)}` }, "（", { b: A.auto }, " 条里对了 ", { b: A.correct }, " 条）。"]),
        T2(["Give accuracy its before, its after and what it's out of: ", { nw: `${pcr(B)} → ${pcr(A)}` }, " on handled messages."], ["准确率要写明前、后和分母：自动处理部分 ", { nw: `${pcr(B)} → ${pcr(A)}` }, "。"])],
        cites: [{ lens: "ai", step: "numbers" }] }; } },
    { id: "ai.predictionEcho", kind: "ask", pri: 5,
      test(F, c, H) { const A = runA(c); if (!A || F.cost.empty) return null; const pp = c.d.chg.worse.includes("people") && A.human > B.human && !H.has("cost", LX.human), pn = c.d.chg.worse.includes("none") && (A.human > B.human || errUp(A).length); return pp || pn ? Object.assign(H.sent("cost"), { x: { pn: !pp } }) : null; },
      say(F, c, a) { const A = runA(c), up = errUp(A); if (!a.x.pn) return { g: [
        T2(["You predicted more work for people, and your run agrees: ", { nw: `${B.human} → ${A.human}` }, ". This box doesn't mention it yet."], ["你预测人工的工作会变多，运行结果也证实了：", { nw: `${B.human} → ${A.human}` }, "。这一栏还没提到。"])], cites: [{ lens: "ai", step: "change" }] };
        const what = A.human > B.human ? T2(["sent to a person ", { nw: `${B.human} → ${A.human}` }], ["转人工 ", { nw: `${B.human} → ${A.human}` }]) : T2([t(ERRNAME[up[0]]), " ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }], [t(ERRNAME[up[0]]), " ", { nw: `${B.errors[up[0]]} → ${A.errors[up[0]]}` }]);
        return { g: [T2(["In step 3 you predicted nothing much would get worse. The run says otherwise: ", what.en, ". Worth saying here?"], ["你在第 3 步预测没什么会变差，运行结果却不一样：", what.zh, "。值得在这里写一句吗？"])], cites: [{ lens: "ai", step: "change" }] }; } },
    { id: "ai.watchVague", kind: "try", pri: 6,
      test(F, c, H) { if (F.watch.empty || H.has("watch", LX.metric) || H.nums("watch").length) return null; return H.sent("watch"); },
      say() { return { g: [
        T2(["What number would tell you it's working? For example, how long stuck learners wait for the right team, or content → tech mistakes on a fresh week."], ["什么数字能告诉你它在起作用？比如卡住的学员要等多久才找到对的团队，或者新一周消息里内容→技术的错误有多少。"]),
        T2(["Watch is easier to act on with one named measure in it."], ["“要关注什么”里点名一个具体指标，别人才好照着做。"])],
        cites: [{ lens: "ai", step: "errors" }] }; } },
    { id: "ai.watchEmpty", kind: "try", pri: 8,
      test(F, c) { return F.watch.empty && c.o ? { box: "watch" } : null; },
      say() { return { g: [
        T2(["Optional, but one test set is one test set. Re-running on a fresh week of messages is the natural next check."], ["可以不写。不过一组测试终究只是一组；用新一周的消息重跑，是很自然的下一步。"])],
        cites: [{ lens: "ai", step: "tradeoff" }] }; } }
  ];
  const RD = MP.lensRead ? MP.lensRead({
    lens: "ai", doc: T2("model-change note", "模型改动说明"),
    boxes: NOTE.map(([k, lab]) => ({ k, label: lab, fold: k === "cost" || k === "watch" ? "ai-note-more" : null,
      thin: k === "changed" ? T2("which one thing you changed in the router", "你在分流器里改的是哪一处") : k === "improved" ? T2("what got better, and out of how many messages", "什么变好了，分母是多少条消息") : null })),
    req: ["changed", "improved"], scan: "ai-note-boxes",
    text: (ls, k) => data(ls).note[k] || "", taId: (k) => "ai-note-" + k, store: (ls) => data(ls),
    nouns: LX.nouns, known: () => KN, sources: optLabels,
    topic: { en: ["router", "message", "messages", "threshold", "example", "examples", "definition", "definitions", "accuracy", "mistakes", "errors", "team", "tech", "content", "support", "model"], zh: ["分流", "消息", "阈值", "示例", "定义", "准确率", "错误", "团队", "技术", "内容", "模型", "人工"] },
    ctx(ls) { const d = data(ls); return { d, o: ranOpt(d) }; },
    trace(ls, c) { const o = []; if (c.o) o.push({ label: T2("your run", "你的运行结果"), src: "ai-runbox" }); if (c.d.chg.better.length + c.d.chg.worse.length) o.push({ label: T2("your step 3 predictions", "你第 3 步的预测") }); return o; },
    intro: [
      T2("I read it as a teammate who wasn't there would, checking each number against your run in step 3.", "我按一位当时不在场的同事的方式读，把每个数字和你第 3 步的运行结果对了一遍。"),
      T2("Read for a teammate picking this up tomorrow: one change, numbers that match the run, and the cost next to the gain.", "按明天要接手的同事来读：是不是只改了一处，数字和运行结果对不对得上，代价有没有和收益写在一起。")
    ],
    rules: RULES
  }) : null;

  /* ---------- AI-2: Ask about this step ---------- */
  const numLab = (k, v) => { const o = NUMQ[k].opts.find((x) => x[0] === v); return o ? o[1] : null; };
  stepNumbers.ask = {
    seen(ls) {
      const d = data(ls), a = numLab("acc", d.num.acc), c = numLab("cov", d.num.cov);
      if (!a && !c) return T2(["you haven't matched either number yet. Both come from the same ", TOTAL, " messages; they're out of different groups."], ["两个数字你都还没配对。它们来自同样的 ", TOTAL, " 条消息，只是基数不同。"]);
      const one = (k, lab) => T2([{ nw: k === "acc" ? `${B.correct} ÷ ${B.auto}` : `${B.auto} ÷ ${TOTAL}` }, " as ", { b: lowF(lab.en) }], [{ nw: k === "acc" ? `${B.correct} ÷ ${B.auto}` : `${B.auto} ÷ ${TOTAL}` }, " 理解为", { b: lab.zh }]);
      if (a && c) { const x = one("acc", a), y = one("cov", c); return T2(["you read ", x.en, ", and ", y.en, "."], ["你把 ", x.zh, "，把 ", y.zh, "。"]); }
      const x = one(a ? "acc" : "cov", a || c);
      return T2(["you read ", x.en, "; the other one is still open."], ["你把 ", x.zh, "；另一个还没选。"]);
    },
    term() { return T2(`Here, the router read ${TOTAL} messages: it handled ${B.auto} itself and passed ${B.human} to a person.`, `在这一步里，分流器读了 ${TOTAL} 条消息：自己处理了 ${B.auto} 条，把 ${B.human} 条交给人工。`); },
    chips() { return [{ id: "outof", q: T2("How do I tell what each one is out of?", "怎么看出每个数的基数？"), a() { return { variants: [
      T2(["Look at the number after the ÷. ", { b: B.auto }, " is only the messages the router handled itself; ", { b: TOTAL }, " is every message that came in. The grid shows both groups."], ["看 ÷ 后面的数。", { b: B.auto }, " 只是分流器自己处理的消息；", { b: TOTAL }, " 是所有进来的消息。网格里两组都画出来了。"]),
      T2(["Point at each question and watch which squares stay lit: those are the messages that number counts."], ["把鼠标指向每道题，看哪些格子保持高亮：那些就是这个数字统计的消息。"])],
      cites: [{ lens: "ai", step: "numbers", src: "ai-q-acc", label: T2(`${B.correct} ÷ ${B.auto}`, `${B.correct} ÷ ${B.auto}`) }, { lens: "ai", step: "numbers", src: "ai-q-cov", label: T2(`${B.auto} ÷ ${TOTAL}`, `${B.auto} ÷ ${TOTAL}`) }] }; } }]; }
  };
  stepErrors.ask = {
    seen(ls) {
      const d = data(ls), n = d.err.cited.length, ids = d.err.cited.slice().sort();
      const pat = d.err.pattern ? PATTERNS.find((p) => p[0] === d.err.pattern)[1] : null;
      let base;
      if (!n) base = T2(["you haven't tapped a message yet. Each card shows where the router sent it and where it should have gone."], ["你还没选任何消息。每张卡片都标出了分流器把它分到哪里、本该分到哪里。"]);
      else if (n === 1) base = T2(["you've tapped 1 message so far (", { b: ids[0] }, "). One more card with similar wording will show whether it's a pattern."], ["你目前选了 1 条消息（", { b: ids[0] }, "）。再选一条用词相似的，就能看出是不是规律。"]);
      else base = T2(["you've cited ", { b: n }, " messages (", { b: ids.join(", ") }, ")."], ["你已经引用了 ", { b: n }, " 条消息（", { b: ids.join("、") }, "）。"]);
      if (!pat) return base;
      return { en: [base.en, " Your pattern: ", { b: innerQ(lowF(pat.en)) }, "."], zh: [base.zh, "你看到的规律：", { b: innerQ(pat.zh) }, "。"] };
    },
    trace(ls) { const d = data(ls); return [t(T2("Step 2 · Read the mistakes", "第 2 步 · 看错误"))].concat(d.err.cited.slice(0, 3).map((id) => ({ label: id, src: "ai-m-" + id }))).concat(d.err.pattern ? [t(T2("your pattern", "你的规律"))] : [t(T2("8 message cards", "8 张消息卡片"))]); },
    chips(ls, ready) {
      const out = [], right = D.misrouted.filter((m) => m.pred === m.truth);
      if (ready) {
        out.push({ id: "size", q: T2("How big is this pattern in the full set?", "在完整数据里，这个规律有多大？"), a() { return { variants: [
          T2(["Across everything the router handled, content questions sent to Tech support are ", { b: B.errors.contentToTech }, " of its ", { b: WRONG }, " mistakes. The next biggest group, billing and account mix-ups, is ", { b: B.errors.billingAccount }, "."], ["在分流器处理的全部消息里，内容问题被分到技术支持的有 ", { b: B.errors.contentToTech }, " 个，占它 ", { b: WRONG }, " 个错误的大头。第二大的一类，账单和账户混淆，只有 ", { b: B.errors.billingAccount }, " 个。"]),
          T2([{ b: B.errors.contentToTech }, " of ", { b: WRONG }, ". The eight cards were a sample; the full count agrees with what the sample suggested."], [{ b: WRONG }, " 个里占 ", { b: B.errors.contentToTech }, " 个。8 张卡片只是样本，完整的统计和样本给出的印象一致。"])],
          cites: [{ lens: "ai", step: "errors", src: "ai-break", label: T2(`Fig. 2 · ${B.errors.contentToTech} of ${WRONG}`, `图 2 · ${WRONG} 个中 ${B.errors.contentToTech} 个`) }] }; } });
        out.push({ id: "ignore", q: T2("Why not just ignore the word error?", "为什么不干脆忽略“报错”这个词？"), a() { return { variants: [
          T2(["Because real tech problems use the same words. ", right.map((m) => m.id).join(" and "), " mention things breaking and the router sent them to Tech support, correctly. Drop the word and those would go astray instead."], ["因为真正的技术问题也会用同样的词。", right.map((m) => m.id).join("和"), "都提到东西坏了，分流器把它们分给技术支持，是分对了的。忽略这个词，出错的就会变成它们。"]),
          T2(["The word isn't the mistake; reading only the word is. A fix has to tell \"error in my formula\" from \"error loading the page\"."], ["错的不是这个词，而是只看这个词。修复的办法得能分清“公式报错”和“页面加载报错”。"])],
          cites: right.slice(0, 2).map((m) => ({ lens: "ai", step: "errors", src: "ai-m-" + m.id, label: T2(m.id, m.id) })) }; } });
      }
      out.push({ id: "words", q: T2("What should I look for in the wording?", "用词上该注意什么？"), a() { return { variants: [
        T2(["Words like error, doesn't work or broken. They sound like tech problems, but some of these learners are stuck on the material. The switch above highlights them."], ["比如“报错”“不对”“坏了”。听起来像技术问题，但其中一些学员其实是卡在了课程内容上。上面的开关可以把这些词高亮出来。"]),
        T2(["Compare what the learner is asking about with the words they use. The topic and the vocabulary don't always point to the same team."], ["对比学员问的内容和他们用的词。话题和用词，指向的不一定是同一个团队。"])],
        cites: [{ lens: "ai", step: "errors", src: "ai-hl", label: T2("Highlight switch", "高亮开关") }] }; } });
      return out;
    }
  };
  stepChange.ask = {
    seen(ls) {
      const c = data(ls).chg, n = c.better.length + c.worse.length, ran = c.opt && c.ran.includes(c.opt);
      if (!c.opt) return T2(["you haven't picked a change yet. Each option pulls a different lever on the same router."], ["你还没选改动。每个选项动的是同一个分流器上不同的杠杆。"]);
      const o = OPTS[c.opt].title;
      if (ran) return T2(["you ", { b: OPTS[c.opt].did.en }, " and ran it on the same ", TOTAL, " messages, with ", n, n === 1 ? " prediction" : " predictions", " to check against it."], ["你", { b: OPTS[c.opt].did.zh }, "，并在同样的 ", TOTAL, " 条消息上运行了，有 ", n, " 个预测可以拿来核对。"]);
      return T2(["you picked ", { b: o.en }, n ? [" and made ", n, n === 1 ? " prediction" : " predictions", "; it hasn't run yet."] : " but haven't predicted anything yet. The run unlocks after one prediction."], ["你选了", { b: o.zh }, n ? ["，做了 ", n, " 个预测，还没运行。"] : "，还没做预测。至少做一个预测才能运行。"]);
    },
    chips(ls, ready) {
      const c = data(ls).chg, out = [];
      if (ready) {
        const A = RT.options[c.opt], preds = c.better.concat(c.worse);
        if (preds.length) out.push({ id: "held", q: T2("Did my predictions hold?", "我的预测成立了吗？"), a() {
          const res = preds.map((p) => { const [ok, ev] = predCheck(p, A), lab = BETTER.concat(WORSE).find((x) => x[0] === p)[1]; return { ok, ev, lab }; });
          const held = res.filter((r) => r.ok), miss = res.filter((r) => !r.ok);
          return { variants: [
            T2([held.length ? ["Showed up: ", held.map((r) => [lowF(r.lab.en), " (", { nw: esc(r.ev) }, ")"]).reduce((a, x, i) => a.concat(i ? ["; "] : [], x), []), ". "] : "", miss.length ? ["Didn't: ", miss.map((r) => lowF(r.lab.en)).join("; "), ". That's worth more than a lucky guess: it shows where your picture of the router was off."] : "Every prediction showed up. Worth asking whether a cost hides somewhere you didn't predict."],
              [held.length ? ["出现了的：", held.map((r) => [r.lab.zh, "（", { nw: esc(r.ev) }, "）"]).reduce((a, x, i) => a.concat(i ? ["；"] : [], x), []), "。"] : "", miss.length ? ["没出现的：", miss.map((r) => r.lab.zh).join("；"), "。这比猜中更有价值：它告诉你，你对分流器的理解哪里有偏差。"] : "每个预测都出现了。值得再想想：有没有代价藏在你没预测到的地方？"])],
            cites: [{ lens: "ai", step: "change", src: "ai-results", label: T2("Fig. 3 · before → after", "图 3 · 改动前后") }] }; } });
        const others = Object.keys(OPTS).filter((k) => !c.ran.includes(k));
        out.push({ id: "next", q: T2("What would I try next?", "下一步可以试什么？"), a() {
          if (!others.length) return { variants: [T2(["You've run all three on the same messages. The next real step is a fresh week of messages, to see which result holds up."], ["三个改法你都在同一批消息上跑过了。真正的下一步，是换新一周的消息，看哪个结果站得住。"])] };
          const k = others[0];
          return { variants: [T2(["One lever you haven't tried: ", { b: OPTS[k].title.en }, ". Same messages, one change; putting two runs side by side shows which trade-off you'd rather live with."], ["还有一个杠杆你没试过：", { b: OPTS[k].title.zh }, "。同样的消息、只改一处；把两次运行并排比较，就能看出你更愿意接受哪种取舍。"])],
            cites: [{ lens: "ai", step: "change" }] }; } });
      }
      out.push({ id: "levers", q: T2("What does each lever change?", "每个杠杆改的是什么？"), a() { return { variants: [
        T2(["Examples change what the router learns from. The threshold changes how sure it must be before acting alone. Definitions change how the teams are described to it. Each one moves different numbers."], ["示例改变分流器从什么里学；阈值改变它要多有把握才自己处理；定义改变各团队在它眼里是什么样子。每一个动的都是不同的数字。"]),
        T2(["Ask where each lever bites: new examples touch the content-versus-tech confusion directly; a higher threshold touches everything it's unsure about, which lands on people."], ["想想每个杠杆作用在哪里：新示例直接针对内容和技术的混淆；更高的阈值影响所有它没把握的消息，而这些会落到人工头上。"])] }; } });
      return out;
    }
  };
  stepTradeoff.ask = {
    seen(ls) {
      const tr = data(ls).tr, a = tr.ans ? ANS.find((x) => x[0] === tr.ans)[1] : null;
      const staff = T2([" Your team slider says it can read ", { b: tr.staff }, " of every ", PLANS.total, "."], ["团队滑块设定为每 ", PLANS.total, " 条能人工读 ", { b: tr.staff }, " 条。"]);
      if (!a) return { en: ["you haven't answered yet.", staff.en], zh: ["你还没回答。", staff.zh] };
      const why = tr.why.length ? T2([", resting on ", WHY.filter((w) => tr.why.includes(w[0])).map((w) => lowF(w[1].en)).join(" and ")], ["，依据是", WHY.filter((w) => tr.why.includes(w[0])).map((w) => w[1].zh).join("、")]) : T2([", with no reasons picked yet"], ["，还没选依据"]);
      return { en: ["you answered ", { b: "“" + a.en + "”" }, why.en, ".", staff.en], zh: ["你的回答是", { b: "“" + a.zh + "”" }, why.zh, "。", staff.zh] };
    },
    term() { return T2(`Here, Plan B gives up ${PLANS.total - PLANS.B.auto} of every ${PLANS.total} messages to people to get its higher accuracy.`, `在这一步里，方案 B 为了更高的准确率，每 ${PLANS.total} 条要交给人工 ${PLANS.total - PLANS.B.auto} 条。`); },
    chips(ls, ready) {
      const tr = data(ls).tr, out = [];
      if (ready) out.push({ id: "staff", q: T2("What if my team is smaller?", "如果团队人手更少呢？"), a() {
        const s = tr.staff, wait = Math.max(0, NEED - s);
        return { variants: [wait
          ? T2(["At your setting, ", { b: s }, " of every ", PLANS.total, ", Plan B leaves ", { b: wait }, " messages waiting for a person. Plan A sends ", { b: PLANS.A.auto - PLANS.A.correct }, " learners to the wrong team instead. Which wait is worse for someone stuck on an assignment?"], ["按你的设定，每 ", PLANS.total, " 条只能读 ", { b: s }, " 条，方案 B 会让 ", { b: wait }, " 条消息排队等人。方案 A 则会让 ", { b: PLANS.A.auto - PLANS.A.correct }, " 位学员先被分错团队。对一个卡在作业上的学员来说，哪种等待更糟？"])
          : T2(["At your setting, ", { b: s }, " of every ", PLANS.total, ", your team covers Plan B's ", { b: NEED }, " with room to spare. Drag the slider below ", { b: NEED }, " and the answer starts to flip."], ["按你的设定，每 ", PLANS.total, " 条能读 ", { b: s }, " 条，足够接住方案 B 的 ", { b: NEED }, " 条，还有余量。把滑块拖到 ", { b: NEED }, " 以下，答案就开始反转。"])],
          cites: [{ lens: "ai", step: "tradeoff", src: "ai-staff", label: T2("Your team's time", "团队人手") }] }; } });
      out.push({ id: "leave", q: T2("What does accuracy leave out here?", "这里的准确率漏掉了什么？"), a() { return { variants: [
        T2(["The messages each plan doesn't handle. Accuracy is counted only on what a plan takes on, so a plan that handles fewer can look better while handing more to people."], ["漏掉了每个方案没处理的消息。准确率只算方案自己接手的部分，所以处理得少的方案，可能看起来更好，却把更多交给了人工。"]),
        T2(["Look under each grid: handles, wrong team, to people. Accuracy is the first of those divided by itself; the last column is where the cost hides."], ["看每个网格下面的三项：自动处理、分错、留给人工。准确率只看前两项；代价藏在最后一项里。"])],
        cites: [{ lens: "ai", step: "tradeoff", src: "ai-plan-b", label: T2("Plan B", "方案 B") }] }; } });
      return out;
    }
  };
  stepNote.ask = {
    seen(ls) {
      const d = data(ls), a = d.note.changed.trim(), b = d.note.improved.trim(), o = ranOpt(d);
      if (!a && !b) return T2([o ? ["both boxes are empty. Your run of ", { b: lowF(OPTS[o].title.en) }, " has the numbers the starters will use."] : "both boxes are empty, and there's no run from step 3 yet, so starters will be general."], [o ? ["两个框都还空着。你运行的", { b: OPTS[o].title.zh }, "里，有开头句会用到的数字。"] : "两个框都还空着，第 3 步也还没有运行结果，所以开头句会比较笼统。"]);
      const zh = X && X.lang(a + b) === "zh", cnt = (s) => (zh ? X.chars(s) : X.words(s)), u = zh ? T2("characters", "字") : T2("words", "词");
      return T2(["What I changed has ", { b: cnt(a) }, " ", u.en, " and What improved has ", { b: cnt(b) }, ". ", d.read ? "You've had a second read; the notes sit beside each box." : "A second read is there when you want one."], ["“我改了什么”有 ", { b: cnt(a) }, " ", u.zh, "，“改善了什么”有 ", { b: cnt(b) }, " ", u.zh, "。", d.read ? "你已经请人读过一遍，批注就在每一栏旁边。" : "想要的话，可以请它帮你读一遍。"]);
    },
    chips(ls) { const o = ranOpt(data(ls)), A = o ? RT.options[o] : null; return [{ id: "cost", q: T2("Why write the cost down?", "为什么要写下代价？"), a() { return { variants: [
      T2(["Because someone else inherits it. ", A && A.human > B.human ? ["Your run hands ", { b: A.human - B.human }, " more messages to people; whoever staffs support needs to know before it ships."] : A && errUp(A).length ? ["Your run sends some real tech problems to TAs first; the TAs need to know before it ships."] : "A change with no visible cost usually means nobody has looked yet."], ["因为会有别人来承担它。", A && A.human > B.human ? ["你的运行让转人工多了 ", { b: A.human - B.human }, " 条；安排支持人手的人，需要在上线前知道。"] : A && errUp(A).length ? ["你的运行会把一些真正的技术问题先分给助教；助教需要在上线前知道。"] : "看不出代价的改动，往往只是还没人去看。"])],
      cites: A ? [{ lens: "ai", step: "change", label: T2("AI·3 · your run", "AI·第3步 · 你的运行") }] : [] }; } }]; }
  };

  /* =====================================================================
     Actions
     ===================================================================== */
  MP.on("ai-num", (el, arg) => { const [k, v] = arg.split(":"); cur().num[k] = v; MP.commit(); });
  MP.on("ai-cite", (el, id) => { toggle(cur().err.cited, id); MP.commit(); });
  MP.on("ai-hl", () => { const e = cur().err; e.hl = !e.hl; MP.commit(); });
  MP.on("ai-pattern", (el, v) => { cur().err.pattern = v; MP.commit(); });
  MP.on("ai-opt", (el, v) => { cur().chg.opt = v; MP.commit(); });
  MP.on("ai-better", (el, v) => { toggle(cur().chg.better, v); MP.commit(); });
  MP.on("ai-worse", (el, v) => {
    const c = cur().chg;
    if (v === "none") c.worse = c.worse.includes("none") ? [] : ["none"];
    else { c.worse = c.worse.filter((x) => x !== "none"); toggle(c.worse, v); }
    MP.commit();
  });
  MP.on("ai-run", () => { const c = cur().chg; if (!c.opt) return; if (!c.ran.includes(c.opt)) c.ran.push(c.opt); runClicked = true; MP.commit(); });
  MP.on("ai-ans", (el, v) => { cur().tr.ans = v; MP.commit(); });
  MP.on("ai-why", (el, v) => { toggle(cur().tr.why, v); MP.commit(); });
  MP.onInput("ai-staff", (el) => {
    const s = +el.value; cur().tr.staff = s; MP.save();
    const $ = (id) => document.getElementById(id), v = $("ai-staff-v"), o = $("ai-staff-out"), st = $("ai-staff-st"), sl = $("ai-slots");
    if (v) v.textContent = s; if (o) o.textContent = staffLine(s); if (st) st.innerHTML = statsHtml(s);
    if (sl) Array.prototype.forEach.call(sl.children, (c, i) => { c.className = slotCls(i, s); });
  });
  function autosize(el) { if (!el || (window.CSS && CSS.supports && CSS.supports("field-sizing", "content"))) return; el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; }
  MP.onInput("ai-note", (el) => {
    autosize(el);
    const d = cur(), k = el.dataset.arg, was = noteReady(d);
    d.note[k] = el.value; MP.save();
    if (noteReady(d) !== was) {
      const pos = el.selectionStart; MP.commit();
      const n = document.querySelector(`[data-fk="ai-note:${k}"]`); if (n) { try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    }
  });
  MP.on("ai-starters", () => {
    const d = cur(), s = starters(d); let filled = 0;
    Object.keys(s).forEach((k) => { if (!d.note[k].trim()) { d.note[k] = t(s[k]).replace(/ (→|↔) /g, "\u00a0$1 "); filled++; } });
    if (d.note.cost.trim() || d.note.watch.trim()) MP.state.ui.folds["ai-note-more"] = true;
    MP.commit();
    MP.toast(filled ? t(L("Drafted from your choices — edit freely.", "已根据你的选择起草，可随意修改。")) : t(L("Every box already has text, so nothing was changed.", "每个框都已经有内容，所以没有改动。")));
  });

  /* =====================================================================
     Lens
     ===================================================================== */
  MP.lenses.ai = {
    id: "ai",
    steps: [stepNumbers, stepErrors, stepChange, stepTradeoff, stepNote],
    download: {
      file: "lumenlearn-help-messages.csv",
      href() {
        const head = isZh() ? ["编号", "消息", "分流器分到", "应该分到", "是否分对"] : ["id", "message", "router_sent_to", "should_go_to", "same_team"];
        const rows = [head].concat(D.misrouted.map((m) => [m.id, t(m), route(m.pred), route(m.truth), m.pred === m.truth ? (isZh() ? "是" : "yes") : (isZh() ? "否" : "no")]));
        const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        return "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      }
    },
    mount(root, ls) {
      root.querySelectorAll(".ai-ta").forEach(autosize);
      if (RD && ls && ls.cur === "note") RD.mount(root, ls);
      const view = document.getElementById("view"), arriving = !!(view && view.classList.contains("enter"));
      // a block that appears after a click (not on arrival) plays its own short intro once
      const fresh = (sel, key) => {
        const el = root.querySelector(sel), k = el ? key(el) : "", had = shown[sel] === k;
        shown[sel] = k;
        if (el && !had && !arriving) { el.classList.add("ai-new"); return el; }
        return null;
      };
      const brk = fresh(".ai-break", () => "1");
      if (brk) MP.countUp(brk.querySelector("[data-ld-count]"), { dur: 800 });
      const res = fresh("#ai-results", () => cur().chg.opt);
      if (runClicked) {
        runClicked = false;
        const r = root.querySelector("#ai-results");
        if (r) requestAnimationFrame(() => r.scrollIntoView({ behavior: MP.live.motionOK() ? "smooth" : "auto", block: "start" }));
      }
      if (res) res.querySelectorAll("[data-ai-from]").forEach((el) => MP.countUp(el, { from: +el.dataset.aiFrom, delay: 350, dur: 900 }));
    },
    summary(ls) {
      const d = data(ls), o = ranOpt(d), A = o ? RT.options[o] : null, cited = d.err.cited.slice().sort();
      const pat = {
        content: L(`traced the biggest mistake group — content questions sent to Tech support (${B.errors.contentToTech} of ${WRONG})`, `找出了最大的一类错误——内容问题被分到技术支持（${WRONG} 个里占 ${B.errors.contentToTech} 个）`),
        billing: L("looked for patterns in the mistakes, starting with billing/account mix-ups", "从账单和账户混淆入手，寻找错误里的规律"),
        random: L("checked whether the mistakes had a pattern", "检查了这些错误有没有规律")
      }[d.err.pattern] || L("read the router's mistakes one by one", "逐条读了分流器的错误");
      const wrote = !!d.note.cost.trim();
      const tail = A ? L(`, tried one change (${OPTS[o].did.en}), ${wrote ? `re-ran it on the same ${TOTAL} messages, and wrote down what it cost.` : `and re-ran it on the same ${TOTAL} messages to see what it cost.`}`,
          `，尝试了一处改动（${OPTS[o].did.zh}）${wrote ? `并在同样的 ${TOTAL} 条消息上重跑，还写下了它的代价。` : `并在同样的 ${TOTAL} 条消息上重跑，看看代价如何。`}`)
        : L(", and thought through what a fix would cost.", "，并思考了改动的代价。");
      const did = { en: `You separated accuracy (${pc(B.correct, B.auto)}) from coverage (${pc(B.auto, TOTAL)}), ${pat.en}${tail.en}`, zh: `你区分了准确率（${pc(B.correct, B.auto)}）和覆盖率（${pc(B.auto, TOTAL)}），${pat.zh}${tail.zh}` };
      const move = A
        ? {
            examples: { en: `Added 10 content examples: content → tech mistakes ${B.errors.contentToTech} → ${A.errors.contentToTech}, but tech → content ${B.errors.techToContent} → ${A.errors.techToContent}`,
              zh: `补充了 10 条课程内容示例：内容→技术错误 ${B.errors.contentToTech} → ${A.errors.contentToTech}，但技术→内容 ${B.errors.techToContent} → ${A.errors.techToContent}` },
            threshold: { en: `Raised the confidence threshold: accuracy ${pcr(B)} → ${pcr(A)}, but ${A.human - B.human} more messages go to a person`,
              zh: `提高了置信度阈值：准确率 ${pcr(B)} → ${pcr(A)}，但多了 ${A.human - B.human} 条转人工` },
            definition: { en: `Rewrote the team definitions: content → tech ${B.errors.contentToTech} → ${A.errors.contentToTech}, no new costs`,
              zh: `改写了类别定义：内容→技术 ${B.errors.contentToTech} → ${A.errors.contentToTech}，没有新增代价` }
          }[o]
        : L("Read the router's mistakes and weighed accuracy against coverage", "读懂分流器的错误，并在准确率与覆盖率之间权衡");
      const facts = [];
      if (d.err.pattern) facts.push({ kind: "did", text: t(L(`Named the main error pattern${cited.length ? `, citing ${cited.join(", ")}` : ""}: content questions that mention “error” get sent to Tech support (${B.errors.contentToTech} of ${WRONG} mistakes).`, `指出了主要的错误规律${cited.length ? `（引用 ${cited.join("、")}）` : ""}：提到“报错”的内容问题被分到技术支持（${WRONG} 个错误里占 ${B.errors.contentToTech} 个）。`)) });
      if (A) facts.push({ kind: "did", text: t(L(`Changed one thing (${OPTS[o].title.en.toLowerCase()}): content → tech mistakes ${B.errors.contentToTech} → ${A.errors.contentToTech}, accuracy ${pcr(B)} → ${pcr(A)}, sent to a person ${B.human} → ${A.human}.`, `只改了一处（${OPTS[o].title.zh}）：内容→技术错误 ${B.errors.contentToTech} → ${A.errors.contentToTech}，准确率 ${pcr(B)} → ${pcr(A)}，转人工 ${B.human} → ${A.human}。`)) });
      if (d.note.cost.trim()) facts.push({ kind: "said", text: `“${esc(d.note.cost.trim())}”` });
      else if (d.tr.ans) facts.push({ kind: "did", text: t(L(`On a more accurate plan that handles fewer messages, answered: “${ANS.find((a) => a[0] === d.tr.ans)[1].en}.”`, `面对更准但处理更少的方案，你的回答是：“${ANS.find((a) => a[0] === d.tr.ans)[1].zh}”。`)) });
      const rf = RD && RD.fact(ls);
      if (rf && facts.length < 3) facts.push(rf);
      facts.push({ kind: "limit", text: t(L(`Tested on one fixed set of ${TOTAL} teaching messages; results could shift on new ones.`, `只在一组固定的 ${TOTAL} 条教学消息上测试，换一批新消息结果可能不同。`)) });
      const rtr = RD && RD.trace(ls);
      return { did, move, artifact: Object.assign({ title: L("Model-change note", "模型改动说明"), html: artifactHtml(d) }, rtr ? { trace: rtr } : {}), facts: facts.slice(0, 4) };
    },
    sample(ls) {
      const now = Date.now();
      ls.data = {
        num: { acc: "handled", cov: "cover" },
        err: { pattern: "content", cited: ["M-014", "M-042", "M-063"], hl: true },
        chg: { opt: "examples", better: ["fewerCT", "acc"], worse: ["newerr"], ran: ["examples"] },
        tr: { ans: "", why: [], staff: 30 },
        note: { changed: "", improved: "", cost: "", watch: "" }
      };
      ls.steps = {
        numbers: { done: true, skipped: false, energy: "neutral", hard: false, hints: 0 },
        errors: { done: true, skipped: false, energy: "enjoyed", hard: false, hints: 0 },
        change: { done: true, skipped: false, energy: "enjoyed", hard: true, hints: 1 }
      };
      ls.visited = ["numbers", "errors", "change", "tradeoff"];
      ls.cur = "tradeoff";
      ls.startedAt = now - 26 * 3600 * 1000;
      ls.completedAt = null;
    }
  };
})();
