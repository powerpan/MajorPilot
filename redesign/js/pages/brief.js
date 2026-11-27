/* MajorPilot redesign — "My Brief" (#/brief): a one-page document built from the student's own work.
   Owned by the brief builder. Also exposes MP.briefKit (shared helpers used by compare.js). */
(function () {
  "use strict";
  const MP = window.MP;
  const T = (en, zh) => MP.t({ en, zh });
  const esc = (s) => MP.h.esc(s);

  /* ---------------- shared helpers (also used by compare.js) ---------------- */
  const K = MP.briefKit = {};
  K.T = T;
  K.ids = () => (MP.lensOrder || []).filter((id) => MP.lenses[id] && Array.isArray(MP.lenses[id].steps) && MP.lensInfo[id]);
  /** A lens counts as finished only when it was completed AND real work was done (core's substantive flag). */
  K.isDone = (id) => { const p = MP.progress(id); return p.complete && p.substantive !== false; };
  K.complete = () => K.ids().filter(K.isDone);
  /** Reached the end by skipping most steps: "Looked through", nothing handed in (core's skimmed flag). */
  K.skim = (id) => !!(MP.lenses[id] && MP.progress(id).skimmed);
  K.started = () => K.ids().filter((id) => !K.isDone(id) && (MP.progress(id).done > 0 || MP.progress(id).skipped > 0));
  /** Did the student actually write the deliverable? The final content step must be done and still hold content. */
  K.handedIn = function (id) {
    const L = MP.lenses[id]; if (!L || !L.steps.length) return false;
    const last = L.steps[L.steps.length - 1], st = MP.ls(id).steps[last.id];
    if (!st || !st.done) return false;
    let ok = true; try { ok = last.ready ? !!last.ready(MP.ls(id)) : true; } catch (e) { ok = true; }
    const s = K.summary(id);
    return ok && !!(s && s.artifact && s.artifact.title);
  };
  /** Content steps that were skipped and never finished. */
  K.skippedSteps = (id) => K.steps(id).filter((x) => x.st.skipped && !x.st.done);
  K.name = (id) => MP.t(MP.lensInfo[id].name);
  K.short = (id) => MP.lensInfo[id].short;
  K.summary = function (id) {
    const L = MP.lenses[id];
    if (!L || typeof L.summary !== "function") return null;
    try { const s = L.summary(MP.ls(id)); return s && typeof s === "object" ? s : null; } catch (e) { console.warn("summary failed for " + id, e); return null; }
  };
  /** list join with natural conjunctions: "a, b, and c" / "a、b和c" */
  K.join = function (arr) {
    const a = arr.filter(Boolean);
    if (MP.lang() === "zh") { if (a.length < 2) return a[0] || ""; const l = a.slice(0, -1).join("、"), r = a[a.length - 1]; return l + (/[A-Za-z0-9]$/.test(l) && /^[A-Za-z0-9]/.test(r) ? " 和 " : "和") + r; }
    if (a.length < 2) return a[0] || "";
    if (a.length === 2) return a[0] + " and " + a[1];
    return a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
  };
  /** Quoted step names. zh wraps the marks so they render as full-width CJK quotes, not Inter's narrow Latin ones. */
  K.q = (s) => MP.lang() === "zh" ? `<span class="bf-qt"><span class="zq">“</span>${String(s).trim().replace(/([？！])$/, '<span class="zp">$1</span>')}<span class="zq">”</span></span>` : "“" + s + "”";
  /** American punctuation: commas and periods go inside closing quotes (en only). */
  K.amer = (h) => {
    h = String(h).replace(/([?!？！])((?:<\/span>)?(?:<span class="zq">)?)”((?:<\/span>){0,2})[.,。]/g, "$1$2”$3");
    return MP.lang() === "zh" ? h : h.replace(/”([,.])/g, "$1”");
  };
  K.stepTitle = (s) => MP.t(s.title || s.short || s.id);
  K.stepShort = (s) => MP.t(s.short || s.title || s.id);
  /** Every content step with its saved state. */
  K.steps = function (id) {
    const ls = MP.ls(id);
    return MP.lenses[id].steps.map((s, i) => ({ lens: id, step: s, i, st: ls.steps[s.id] || {} }));
  };
  K.feel = function (ids) {
    const all = [].concat(...ids.map(K.steps));
    return {
      enjoyed: all.filter((x) => x.st.energy === "enjoyed"),
      drained: all.filter((x) => x.st.energy === "drained"),
      hard: all.filter((x) => x.st.hard),
      hinted: all.filter((x) => x.st.hints > 0),
      skipped: all.filter((x) => x.st.skipped && !x.st.done),
      done: all.filter((x) => x.st.done)
    };
  };
  /** Reflection pick → step object (or null). */
  K.pick = function (id) {
    const p = MP.ls(id).refl && MP.ls(id).refl.pick, r = MP.ls(id).steps.reflect;
    if (!p || p === "none" || (r && r.skipped && !r.done)) return null;
    return MP.lenses[id].steps.find((s) => s.id === p) || null;
  };
  K.fmtDate = function (ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleDateString(MP.lang() === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  };
  K.dot = (id) => `<i class="bf-dot ${id}" aria-hidden="true"></i>`;
  /** Split mark with a beam lit (solid) for each lens in `ids`; the others stay dashed. Order is always BA · DS · AI. */
  K.mark = function (ids, o) {
    ids = ids || [];
    if (ids.length === 1) return MP.draw.splitMark(ids[0], o);
    let s = MP.draw.splitMark(ids.length ? "all" : "", o);
    if (ids.length) MP.lensOrder.forEach((id) => {
      if (!ids.includes(id)) s = s.replace(`class="bm ${id} on" pathLength="1"`, `class="bm ${id}"`).replace(`class="nd ${id}"`, `class="nd ${id} off"`);
    });
    return s;
  };
  /** A lens's own data glyph in its dot-grid box (decorative; its caption lives elsewhere). Plays its intro when scrolled in. */
  K.glyph = (id, cls) => `<span class="ld-reveal ${cls || ""}" aria-hidden="true"><span class="ld-gbox ld-grid">${MP.draw.glyph(id)}</span></span>`;
  /** Numbers in zh copy stay Newsreader. */
  K.num = (x) => `<span class="num">${x}</span>`;
  /** Short noun for what each lens hands in (fits inside a sentence). */
  K.handNoun = function (id) {
    const m = {
      ba: { en: "a one-page recommendation", zh: "一页行动建议" },
      ds: { en: "an evidence summary", zh: "一份证据小结" },
      ai: { en: "a model-change note", zh: "一份模型改动说明" }
    };
    return m[id] ? MP.t(m[id]) : MP.t(MP.lensInfo[id].handIn);
  };
  /** Plain-language phrases (family view and the comparison). */
  K.plainStep = function (id, s) {
    const m = {
      "ba.ratio": { en: "reading what a percentage really measures", zh: "弄清一个百分比到底在衡量什么" },
      "ba.funnel": { en: "finding where learners drop out", zh: "找出学员在哪一步流失" },
      "ba.missing": { en: "deciding what to check before acting", zh: "决定行动前先核实什么" },
      "ba.test": { en: "designing a small test of a fix", zh: "设计小试验来检验改进" },
      "ba.memo": { en: "writing a one-page recommendation", zh: "写一页行动建议" },
      "ds.claim": { en: "questioning a headline number", zh: "质疑一个醒目的数字" },
      "ds.trend": { en: "telling real change from random ups and downs", zh: "区分真实变化和随机起伏" },
      "ds.split": { en: "splitting the data by group", zh: "把数据按人群拆开看" },
      "ds.conclude": { en: "deciding how sure we can be", zh: "判断结论有多可靠" },
      "ds.summary": { en: "writing up the evidence", zh: "把证据写成小结" },
      "ai.numbers": { en: "reading how well a model works", zh: "读懂一个模型表现如何" },
      "ai.errors": { en: "finding patterns in a model's mistakes", zh: "找出模型出错的规律" },
      "ai.change": { en: "changing one thing in a model and testing it", zh: "只改模型的一处再重新测试" },
      "ai.tradeoff": { en: "weighing what a change costs", zh: "权衡一个改动的代价" },
      "ai.note": { en: "writing a short note on a model change", zh: "写一份模型改动说明" }
    };
    const k = m[id + "." + s.id];
    return k ? MP.t(k) : K.stepTitle(s);
  };
  K.plainLens = function (id) {
    const m = {
      ba: { en: "business analytics", zh: "商业分析" },
      ds: { en: "data science", zh: "数据科学" },
      ai: { en: "AI", zh: "人工智能" }
    };
    return m[id] ? MP.t(m[id]) : K.name(id);
  };
  K.openArtifact = function (id) {
    const s = K.summary(id);
    if (!s || !s.artifact || !K.handedIn(id)) return;
    MP.modal(`<div class="bf-art">
      <div class="bf-art-top">${MP.h.lensTag(id)}<button type="button" class="bf-x" data-action="modal-close" aria-label="${esc(T("Close", "关闭"))}">×</button></div>
      ${MP.h.figCap(T("What you handed in", "你的交付物"), false)}
      <h2 class="h2">${MP.t(s.artifact.title)}</h2>
      <div class="bf-art-body">${s.artifact.html || ""}</div>
    </div>`);
  };
  MP.on("bf-art", (el, id) => K.openArtifact(id));
  MP.on("bf-print", () => window.print());

  /* ---------------- page state (module-level, per the contract) ---------------- */
  let view = "me";          // me | advisor | family
  const expanded = {};      // section key -> true
  MP.on("bf-view", (el, v) => {
    if (v !== view && MP.ai) { MP.ai.forget("brief.short." + v); capFor["brief.short." + v] = 800; }
    view = v; MP.commit();
  });
  MP.on("bf-more", (el, key) => { expanded[key] = !expanded[key]; MP.commit(); });

  /* The advisor view is the student's own document, shared: it speaks in the first person ("I"). */
  const adv = () => view === "advisor";
  /** Turn a lens summary sentence from "You traced…" / "你梳理了…" into "I traced…" / "我梳理了…" (advisor view only). */
  const firstPerson = (h) => {
    if (!adv()) return h;
    return MP.lang() === "zh" ? String(h).replace(/^你/, "我").replace(/你的回答/g, "我的回答") : String(h).replace(/^You\b/, "I");
  };
  const LOCK = () => `<span class="bf-lock">${T("only you see this", "仅你可见")}</span>`;
  /** "a · b · c" where each name stays whole and a line never starts with a dot. */
  const dots = (names) => names.map((n, i) => `<span class="bf-gi">${n}${i < names.length - 1 ? `<span class="sr-only">,</span><span class="bf-sep" aria-hidden="true">·</span>` : ""}</span>`).join(" ");

  /* ---------------- building blocks ---------------- */
  const LIMIT = 3;
  function moreBtn(key, extra, open, cls) {
    return `<button type="button" class="bf-more no-print ${cls || ""}" data-action="bf-more" data-arg="${key}" data-fk="bf-more:${key}" aria-expanded="${open}">
        <span class="pm" aria-hidden="true">${open ? "–" : "+"}</span>${open ? T("Show less", "收起") : MP.t({ en: `Show ${extra} more`, zh: `再看 ${extra} 条` })}</button>`;
  }
  /** A list of lines, folded after LIMIT with "Show N more". Each line: {html, ev?, mark?, cls?} */
  function lines(key, items, opts) {
    opts = opts || {};
    const limit = opts.limit || LIMIT;
    const open = !!expanded[key];
    const extra = Math.max(0, items.length - limit);
    const li = items.map((it, i) => `<li class="bf-line ${it.cls || ""} ${i >= limit ? "bf-extra" : ""}" ${i >= limit && !open ? "data-hidden" : ""}${it.src ? ` data-rd-src="${it.src}"` : ""}>
        <span class="bf-mark">${it.ev ? MP.h.ev(it.ev) : it.mark || ""}</span><div class="bf-txt">${K.amer(it.html)}</div></li>`).join("");
    return `<ul class="bf-lines">${li}</ul>${extra ? moreBtn(key, extra, open) : ""}`;
  }
  /** Steps grouped by lens, in lens order: [{id, items:[x…]}] */
  function byLens(arr) {
    return K.ids().map((id) => ({ id, items: arr.filter((x) => x.lens === id) })).filter((g) => g.items.length);
  }
  /** One row per lens: short lens tag, then the step names in plain text, joined by " · ". At most 2 lenses before "Show N more". */
  function grouped(key, arr) {
    const rows = byLens(arr), limit = 2, open = !!expanded[key], extra = Math.max(0, rows.length - limit);
    return `<ul class="bf-grp">${rows.map((g, i) => `<li class="bf-g" ${i >= limit && !open ? "data-hidden" : ""}>${MP.h.lensTag(g.id, { short: true })}<span class="bf-g-t">${dots(g.items.map((x) => esc(K.stepShort(x.step))))}</span></li>`).join("")}</ul>${extra ? moreBtn(key, extra, open, "bf-more-sm") : ""}`;
  }
  const kHead = (label, lock) => `<span class="bf-khead"><span class="bf-k">${label}</span>${lock ? LOCK() : ""}</span>`;
  /** A document section opened like a chapter: ink rule, italic orange numeral, mono kicker, serif title. */
  function section(n, title, intro, body, cls, kicker) {
    return `<section class="bf-sec ${cls || ""}" aria-labelledby="bf-h-${n}" ${n > 1 ? "data-reveal" : ""}>
      <div class="bf-num" aria-hidden="true">${String(n).padStart(2, "0")}</div>
      <div class="bf-sec-main">${kicker ? `<span class="ld-label bf-kick">${kicker}</span>` : ""}<h2 class="bf-h2" id="bf-h-${n}">${title}</h2>${intro ? `<p class="bf-intro">${intro}</p>` : ""}${body}</div>
    </section>`;
  }
  const KICK = {
    did: { en: "The work", zh: "做过的事" },
    stood: { en: "Feelings & reflections", zh: "感受与回顾" },
    shows: { en: "In master's courses", zh: "硕士课程里" },
    cant: { en: "Limits", zh: "边界" },
    next: { en: "What's next", zh: "下一步" },
    help: { en: "For family", zh: "给家人" }
  };
  const cap = (s) => MP.lang() === "zh" ? s : s.replace(/^./, (c) => c.toUpperCase());
  /** Family phrases: "a, b, and c" in English; "a、b、c" in Chinese (never 和 between two activities). */
  const famJoin = (arr) => MP.lang() === "zh" ? arr.join("、") : K.join(arr);

  /* ---------------- "In short" ---------------- */
  function inShort(done, F) {
    const fam = view === "family", I = adv();
    const out = [];
    // 1 · what you did (only claim "handed in" when there's a real deliverable)
    if (fam) {
      out.push(MP.t({
        en: `They tried ${done.length === 1 ? "one way" : done.length === 2 ? "two ways" : "all three ways"} of working (${K.join(done.map(K.plainLens))}) on the same made-up problem: an online course where fewer learners were finishing.`,
        zh: `在同一个虚构的问题上，孩子试了${done.length === 1 ? "一种" : done.length === 2 ? "两种" : "全部三种"}工作方式（${K.join(done.map(K.plainLens))}）。问题是：一个在线课程里，学完的学员变少了。`
      }));
    } else {
      const handed = done.filter(K.handedIn), open = done.filter((id) => !K.handedIn(id));
      const n = done.length, subj = I ? { en: "I", zh: "我" } : { en: "You", zh: "你" };
      const lensesEn = `the ${K.join(done.map(K.name))} lens${n > 1 ? "es" : ""}`;
      const lensesZh = `${K.join(done.map(K.name))}${n === 2 ? "两个" : n === 3 ? "全部三个" : ""}视角`;
      if (!open.length) {
        out.push(MP.t({ en: `${subj.en} finished ${lensesEn} and handed in ${K.join(handed.map(K.handNoun))}.`, zh: `${subj.zh}完成了${lensesZh}，交出了${K.join(handed.map(K.handNoun))}。` }));
      } else if (handed.length) {
        out.push(MP.t({ en: `${subj.en} finished ${lensesEn} and handed in ${K.join(handed.map(K.handNoun))}. The ${K.join(open.map(K.name))} write-up is still open.`, zh: `${subj.zh}完成了${lensesZh}，交出了${K.join(handed.map(K.handNoun))}；${K.join(open.map(K.name))}的交付物还没写。` }));
      } else {
        out.push(MP.t({ en: `${subj.en} worked through ${lensesEn}. The write-up${n > 1 ? "s are" : " is"} still open.`, zh: `${subj.zh}做完了${lensesZh}的主要步骤，交付物还没写。` }));
      }
    }
    // 2 · what stood out
    const picks = done.map((id) => K.pick(id) && { lens: id, step: K.pick(id) }).filter(Boolean);
    const enjoyed = F.enjoyed.slice().sort((a, b) => (picks.some((p) => p.step.id === b.step.id) ? 1 : 0) - (picks.some((p) => p.step.id === a.step.id) ? 1 : 0));
    const hardish = F.hard.length ? F.hard : F.drained;
    const drainedWord = I ? T("drained me", "让我有点累") : T("drained you", "让你有点累");
    if (fam) {
      const fe = enjoyed.slice(0, 2).map((x) => K.plainStep(x.lens, x.step));
      out.push(fe.length
        ? MP.t({ en: `The parts they seemed to enjoy most: ${K.join(fe)}.`, zh: `孩子似乎最喜欢的部分：${fe.length === 2 ? fe[0] + "，以及" + fe[1] : fe[0]}。` })
        : T("They didn't mark which parts they enjoyed, so that's a good thing to ask them about.", "孩子没有标记喜欢哪些部分，这正好可以聊一聊。"));
    } else if (enjoyed.length) {
      const top = enjoyed.slice(0, 2).map((x) => K.q(K.stepTitle(x.step)));
      const s = I ? { en: "I", zh: "我" } : { en: "You", zh: "你" };
      const lead = enjoyed.length > 2
        ? MP.t({ en: `${s.en} enjoyed ${enjoyed.length} steps, especially ${K.join(top)}`, zh: `${s.zh}喜欢其中 ${enjoyed.length} 步，尤其是${K.join(top)}` })
        : MP.t({ en: `${s.en} enjoyed ${K.join(top)}`, zh: `${s.zh}喜欢${K.join(top)}` });
      const topIds = enjoyed.slice(0, 2).map((x) => x.lens + x.step.id);
      const other = hardish.find((x) => !topIds.includes(x.lens + x.step.id));
      const both = !other && hardish.length ? hardish[0] : null;
      const tail = other
        ? MP.t({ en: `; ${K.q(K.stepTitle(other.step))} ${F.hard.length ? "felt hard" : drainedWord}.`, zh: `；${K.q(K.stepTitle(other.step))}${F.hard.length ? "感觉有难度" : drainedWord}。` })
        : both && F.hard.length
          ? MP.t({ en: `. ${K.q(K.stepTitle(both.step))} was both enjoyable and hard.`, zh: `。${K.q(K.stepTitle(both.step))}既有意思，也有难度。` })
          : T(".", "。");
      out.push(lead + tail);
    } else if (!I && picks.length) {
      out.push(MP.t({ en: `You said you'd want to do ${K.q(K.stepTitle(picks[0].step))} every week.`, zh: `你说愿意每周都做${K.q(K.stepTitle(picks[0].step))}。` }));
    } else if (hardish.length) {
      out.push(I
        ? MP.t({ en: `${K.q(K.stepTitle(hardish[0].step))} ${F.hard.length ? "felt hard" : drainedWord}.`, zh: `${K.q(K.stepTitle(hardish[0].step))}${F.hard.length ? "感觉有难度" : drainedWord}。` })
        : MP.t({ en: `${K.q(K.stepTitle(hardish[0].step))} felt hard. Worth noticing, not worrying about.`, zh: `${K.q(K.stepTitle(hardish[0].step))}感觉有难度。值得留意，不必担心。` }));
    }
    // (no feelings and no reflection: two lines are better than a nudge)
    // 3 · one next step
    const ns = MP.nextStep();
    if (!fam && ns && ns.resume && K.skim(ns.lens)) {
      out.push(I ? MP.t({ en: `Next, I plan to go back to the steps I skipped in the ${K.name(ns.lens)} lens.`, zh: `接下来，我打算回到${K.name(ns.lens)}视角里跳过的步骤。` })
        : MP.t({ en: `Next: go back to the steps you skipped in the ${K.name(ns.lens)} lens.`, zh: `下一步：回到${K.name(ns.lens)}视角里跳过的步骤。` }));
    } else if (fam) {
      out.push(T("This isn't a test or a score. A good next step: ask them which part they'd want to do every week.", "这不是测试，也没有分数。接下来可以问问孩子：哪一部分愿意每周都做？"));
    } else if (ns && MP.lensInfo[ns.lens]) {
      const p = MP.progress(ns.lens);
      if (I) out.push(ns.resume
        ? MP.t({ en: `Next, I plan to finish the ${K.name(ns.lens)} lens. I'm ${p.done} of ${p.total} steps in.`, zh: `接下来，我打算把${K.name(ns.lens)}视角做完，目前完成了 ${p.done}/${p.total} 步。` })
        : MP.t({ en: `Next, I plan to try the ${K.name(ns.lens)} lens to see the same problem from another side.`, zh: `接下来，我打算试试${K.name(ns.lens)}视角，从另一面看同一个问题。` }));
      else out.push(ns.resume
        ? MP.t({ en: `Next: finish the ${K.name(ns.lens)} lens. You're ${p.done} of ${p.total} steps in.`, zh: `下一步：把${K.name(ns.lens)}视角做完，你已完成 ${p.done}/${p.total} 步。` })
        : MP.t({ en: `Next: try the ${K.name(ns.lens)} lens to see the same problem from another side.`, zh: `下一步：试试${K.name(ns.lens)}视角，从另一面看同一个问题。` }));
    } else {
      out.push(I ? T("Next, I'd like to bring the questions below to a program's info session.", "接下来，我想带着下面的问题去参加项目说明会。")
        : T("Next: bring one of the questions below to a program's info session.", "下一步：带着下面的一个问题，去参加项目说明会。"));
    }
    return `<div class="bf-short on-ink" role="region" aria-labelledby="bf-short-h">
      <div class="bf-short-h"><i class="bf-tri" aria-hidden="true"></i><span class="ld-label" id="bf-short-h">${T("In short", "简而言之")}</span></div>
      <ol>${out.map((s, i) => `<li style="--n:${i}"><span class="n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span class="t">${K.amer(s)}</span></li>`).join("")}</ol>
    </div>`;
  }

  /* ---------------- sections: student & advisor views ---------------- */
  /** "So far: Read the numbers · Read the mistakes" (+ how many were skipped, student view only). */
  function soFar(id) {
    const F = K.feel([id]), sk = K.skippedSteps(id).length;
    const names = F.done.map((x) => esc(K.stepShort(x.step)));
    const skipped = sk && view === "me" ? `<span class="bf-sofar-sk">${MP.t({ en: `${sk === 1 ? "1 step" : sk + " steps"} skipped — ${sk === 1 ? "it's" : "they're"} still open.`, zh: `跳过了 ${sk} 步，随时可以回去做。` })}</span>` : "";
    if (!names.length) return `<p class="bf-sofar">${skipped || T("Looked through the steps; nothing done yet.", "浏览了各个步骤，还没有动手做。")}</p>`;
    return `<p class="bf-sofar"><span class="bf-sofar-k">${T("So far", "目前做了")}</span>${dots(names)}${skipped}</p>`;
  }
  function secDid(done, partial) {
    const groups = done.map((id) => {
      const s = K.summary(id);
      const facts = (s && Array.isArray(s.facts) ? s.facts : []).filter((f) => f && f.text);
      return { id, s, facts, handed: K.handedIn(id) };
    });
    const open = !!expanded.did;
    const nFacts = groups.reduce((a, g) => a + g.facts.length, 0);
    const factList = (g) => g.facts.length ? `<ul class="bf-lines bf-facts" ${open ? "" : "data-hidden"}>${g.facts.map((f) => `<li class="bf-line"><span class="bf-mark">${MP.h.ev(["did", "said", "src", "limit"].includes(f.kind) ? f.kind : "did")}</span><div class="bf-txt">${firstPerson(MP.t(f.text))}</div></li>`).join("")}</ul>` : "";
    /** The lens's path: one node per content step (done · skipped · to do), drawn from the student's own state. */
    const path = (id, bare) => {
      const p = MP.progress(id);
      if (bare) return `<div class="bf-path">${MP.draw.stepBeam(id)}</div>`;   // the status line already counts the steps
      return `<div class="bf-path">${MP.draw.stepBeam(id)}<span class="bf-path-k">${MP.t({ en: `${p.done} of ${p.total} steps`, zh: `${K.num(p.done + "/" + p.total)} 步` })}</span></div>`;
    };
    const block = (id, partialCls, head, inner) => `<div class="bf-lens lens-${id} ${id}${partialCls ? " is-partial" : ""}" data-rd-src="bf-src-${id}">
        ${K.glyph(id, "bf-lens-fig")}
        <div class="bf-lens-main"><div class="bf-lens-h">${MP.h.lensTag(id)}<span class="bf-status">${head}</span></div>${inner}</div>
      </div>`;
    const body = groups.map((g) => {
      const L = MP.lenses[g.id], p = MP.progress(g.id);
      if (!g.handed) {
        return block(g.id, true, MP.t({ en: `${p.contentDone} of ${L.steps.length} steps done · no write-up yet`, zh: `完成 ${K.num(p.contentDone + "/" + L.steps.length)} 步 · 交付物未写` }),
          soFar(g.id) + path(g.id, true) + factList(g));
      }
      const art = MP.t(g.s.artifact.title);
      const did = g.s && g.s.did ? firstPerson(MP.t(g.s.did)) : MP.t(MP.lensInfo[g.id].oneLine);
      return block(g.id, false, T("Finished", "已完成"), `<p class="bf-did">${did}</p>${path(g.id)}
        <div class="bf-hand"><span class="k">${T("Handed in", "交付物")}</span><span class="v">${art}</span>${g.s.artifact.html ? `<button type="button" class="bf-read no-print" data-action="bf-art" data-arg="${g.id}" data-fk="bf-art:${g.id}">${T("Read it", "查看")}</button>` : ""}</div>
        ${factList(g)}`);
    }).join("");
    const part = partial.map((id) => {
      const p = MP.progress(id);
      return block(id, true, p.skimmed ? MP.t({ en: `Looked through · ${p.contentDone} of ${p.contentTotal} steps done`, zh: `已浏览 · 完成 ${K.num(p.contentDone + "/" + p.contentTotal)} 步` }) : p.done ? MP.t({ en: `In progress`, zh: `进行中` }) : T("Looked through", "已浏览"),
        soFar(id) + path(id, p.skimmed));
    }).join("");
    const btn = nFacts ? `<button type="button" class="bf-more no-print" data-action="bf-more" data-arg="did" data-fk="bf-more:did" aria-expanded="${open}"><span class="pm" aria-hidden="true">${open ? "–" : "+"}</span>${open ? T("Hide the details", "收起细节") : MP.t({ en: `Show ${nFacts} more ${nFacts === 1 ? "detail" : "details"}`, zh: `再看 ${nFacts} 条细节` })}</button>` : "";
    return section(1, adv() ? T("What I did", "我做了什么") : T("What you did", "你做了什么"), "", `<div class="bf-lenses">${body}${part}</div>${btn}`, "bf-did-sec", MP.t(KICK.did));
  }

  function secStood(ids, F) {
    const me = view === "me";
    const items = [];
    if (me) ids.forEach((id) => {
      const p = K.pick(id);
      if (p) items.push({ ev: "said", src: "bf-src-refl-" + id, html: MP.t({ en: `The part of ${K.short(id)} you'd want to do every week: ${K.q(K.stepTitle(p))}.`, zh: `${K.short(id)} 里你愿意每周都做的部分：${K.q(K.stepTitle(p))}。` }) });
      else if (MP.ls(id).refl && MP.ls(id).refl.pick === "none") items.push({ ev: "said", src: "bf-src-refl-" + id, html: MP.t({ en: `In ${K.short(id)}, no part felt like something you'd want every week. That's useful to know.`, zh: `在 ${K.short(id)} 里，没有哪部分让你想每周都做。这也是有用的信息。` }) });
    });
    if (F.enjoyed.length) items.push({ ev: "said", cls: "bf-gline", src: "bf-src-feel", html: kHead(T("Enjoyed", "喜欢")) + grouped("g-enj", F.enjoyed) });
    if (F.hard.length) items.push({ ev: "said", cls: "bf-gline", html: kHead(T("Felt hard", "有难度")) + grouped("g-hard", F.hard) });
    if (F.drained.length) items.push({ ev: "said", cls: "bf-gline", html: kHead(me ? T("Drained you", "有点累") : T("Drained me", "有点累")) + grouped("g-drn", F.drained) });
    if (me) ids.forEach((id) => {
      const note = MP.ls(id).refl && (MP.ls(id).refl.note || "").trim();
      if (note) items.push({ ev: "said", cls: "bf-quote", src: "bf-src-refl-" + id, html: `<q>${esc(note)}</q><span class="bf-ref">${K.short(id)}</span>` });
    });
    if (me) ids.forEach((id) => {
      const f = MP.ls(id).refl && MP.ls(id).refl.follow, a = f && f.a && f.a !== "skip" && f.a !== "unsure" ? f.chips && f.chips.find((c) => c.id === f.a) : null;
      if (a) items.push({ ev: "said", cls: "bf-private", src: "bf-src-refl-" + id, html: MP.t({ en: `Asked a follow-up in ${K.short(id)}, you answered: ${K.q(a.en)}.`, zh: `${K.short(id)} 的追问，你的回答是：${K.q(a.zh)}。` }) + (f.more ? ` <q>${esc(f.more)}</q>` : "") + LOCK() });
    });
    if (me && F.hinted.length) items.push({ ev: "did", cls: "bf-private bf-gline", html: kHead(MP.t({ en: `Opened hints on ${F.hinted.length === 1 ? "1 step" : F.hinted.length + " steps"}`, zh: `在 ${F.hinted.length} 个步骤上打开了提示` }), true) + grouped("g-hint", F.hinted) });
    if (me && F.skipped.length) {
      const n = F.skipped.length;
      items.push({ mark: `<span class="bf-skipmark" aria-hidden="true">–</span>`, cls: "bf-private", html: MP.t({ en: `${n === 1 ? "1 step" : n + " steps"} skipped — ${n === 1 ? "it's" : "they're"} still open.`, zh: `跳过了 ${n} 步，随时可以回去做。` }) + LOCK() });
    }
    if (!items.length) items.push({ mark: `<span class="bf-blank" aria-hidden="true">·</span>`, cls: "bf-empty", html: me ? T("Nothing marked yet. In your next lens, tap how each step felt; it takes a second and makes this section yours.", "还没有标记。下一个视角里，顺手点一下每步的感受，只需一秒，这一节就会写满你的内容。") : T("I didn't mark how the steps felt this time.", "这次我没有标记各步的感受。") });
    const intro = adv() ? T("Feelings I marked along the way. My private reflections aren't included here.", "我在过程中标记的感受。私人回顾不包含在这个版本里。") : T("In your own words and marks.", "来自你自己的标记和话语。");
    return section(2, adv() ? T("What stood out to me", "让我印象深的") : T("What stood out to you", "你注意到了什么"), intro, lines("stood", items), "", MP.t(KICK.stood));
  }

  function secShows(n, F) {
    const rank = (x) => (x.st.energy === "enjoyed" ? 0 : x.st.hard ? 2 : 1);
    const done = F.done.filter((x) => x.step.shows).sort((a, b) => rank(a) - rank(b)).slice(0, 6);
    const items = done.map((x) => ({ mark: K.dot(x.lens), html: `${MP.fmt(x.step.shows)}<span class="bf-from">${T("from", "来自")} ${K.q(K.stepTitle(x.step))}</span>` }));
    if (!items.length) return "";
    return section(n, T("What this suggests about the work", "这对专业学习意味着什么"), T("Where this kind of work shows up in master's courses. Field-level, not about any one program.", "这类工作在硕士课程中出现的地方。说的是领域整体，不针对某个项目。"), lines("shows", items), "", MP.t(KICK.shows));
  }

  function secCant(n) {
    const items = [
      adv() ? T("Whether I'd enjoy a whole degree. Each lens is about 15 minutes with teaching data, not a semester.", "我会不会喜欢一整个学位。每个视角只是约 15 分钟、用教学数据完成的练习，不是一个学期。")
        : T("Whether you'd enjoy a whole degree. Each lens is about 15 minutes with teaching data, not a semester.", "你会不会喜欢一整个学位。每个视角只是约 15 分钟、用教学数据完成的练习，不是一个学期。"),
      T("How any particular program teaches this. Courses and emphasis differ, so check each program's own course list.", "某个具体项目怎么教。各项目的课程和侧重不同，请以各项目自己的课程表为准。"),
      T("Anything about admission or fit. Nothing here was graded, scored, or compared with other students.", "任何关于录取或匹配的判断。这里没有打分、评级，也没有与其他学生比较。")
    ];
    return section(n, T("What this can't tell you", "这份小结说明不了什么"), "", aiCant() + `<ul class="bf-lines">${items.map((h) => `<li class="bf-line"><span class="bf-mark">${MP.h.ev("limit")}</span><div class="bf-txt">${h}</div></li>`).join("")}</ul>`, "bf-cant", MP.t(KICK.cant));
  }

  const PREP = {
    ba: { en: "Get comfortable with percentages, rates and simple spreadsheets. That covers most of the math in this kind of work.", zh: "熟悉百分比、比率和简单的表格操作，这类工作的数学大多就在这里。" },
    ds: { en: "Review basic statistics: averages, spread, and why small groups bounce around.", zh: "复习基础统计：平均数、离散程度，以及为什么小样本容易上下波动。" },
    ai: { en: "Read up on how classifiers are judged: accuracy, coverage, and what each kind of mistake costs.", zh: "了解分类模型如何评估：准确率、覆盖率，以及每种错误的代价。" }
  };
  const ASK = {
    ba: { en: "How often do courses use real company data or a client project?", zh: "课程多久会用到真实企业数据或企业合作项目？" },
    ds: { en: "How is the core split between statistics and programming?", zh: "核心课程里统计和编程的比重大概各占多少？" },
    ai: { en: "Do courses cover evaluating and improving models, or mostly building them?", zh: "课程会讲如何评估和改进模型，还是主要讲怎么搭建模型？" }
  };
  function secNext(n, done, F) {
    const hardFirst = done.slice().sort((a, b) => (F.hard.some((x) => x.lens === b) ? 1 : 0) - (F.hard.some((x) => x.lens === a) ? 1 : 0));
    const prep = [], ask = [];
    hardFirst.forEach((id) => { if (PREP[id]) prep.push({ mark: `<span class="bf-kind">${T("Prepare", "准备")}</span>`, html: MP.t(PREP[id]) + `<span class="bf-ref">${K.short(id)}</span>` }); });
    done.forEach((id) => { if (ASK[id]) ask.push({ mark: `<span class="bf-kind">${T("Ask", "提问")}</span>`, html: MP.t(ASK[id]) + `<span class="bf-ref">${K.short(id)}</span>` }); });
    // interleave so the first three lines mix prep and questions
    const mixed = []; while (prep.length || ask.length) { if (prep.length) mixed.push(prep.shift()); if (ask.length) mixed.push(ask.shift()); }
    // the student's own actions (continue a lens, compare) live only in the student's view
    const ns = view === "me" ? MP.nextStep() : null;
    const skim = !!(ns && ns.resume && K.skim(ns.lens));
    const cta = ns && MP.lensInfo[ns.lens] ? `<div class="bf-cta lens-${ns.lens} no-print">
        ${K.glyph(ns.lens, "bf-cta-fig")}
        <div class="bf-cta-txt"><span class="eyebrow">${skim ? MP.t({ en: `${K.short(ns.lens)} · Looked through — nothing handed in yet`, zh: `${K.short(ns.lens)} · 已浏览，还没有交付物` }) : ns.resume ? T("Pick up where you left off", "从上次停下的地方继续") : T("See the same problem from another side", "换个角度看同一个问题")}</span>
        <span class="bf-cta-q lens-q">${MP.t(MP.lensInfo[ns.lens].question)}</span></div>
        ${MP.h.primary(skim ? MP.ui("backToSkipped") : ns.resume ? MP.t({ en: `Continue the ${K.short(ns.lens)} lens`, zh: `继续 ${K.short(ns.lens)} 视角` }) : MP.t({ en: `Try the ${K.short(ns.lens)} lens`, zh: `试试 ${K.short(ns.lens)} 视角` }), "go", `#/lens/${ns.lens}/${ns.step}`, { lens: ns.lens, fk: "bf-next" })}
      </div>` : "";
    const cmp = view === "me" && done.length >= 2 ? `<p class="bf-cmp no-print">${MP.h.link(T("See your lenses side by side", "并排比较你做过的视角") + " →", "go", "#/compare")}</p>` : "";
    const intro = adv() ? T("What I plan to prepare, and what I'd like to ask programs.", "我打算准备的内容，以及想问项目的问题。") : "";
    return section(n, T("Next steps", "接下来"), intro, lines("next", mixed, { limit: 3 }) + cta + cmp, "bf-next", MP.t(KICK.next));
  }

  /* ---------------- family view ---------------- */
  const FAMILY_DID = {
    ba: { en: "Looked at where learners dropped out of an online course, and suggested one change to test.", zh: "找出在线课程里学员在哪一步流失，并提出一个可以试验的改进。" },
    ds: { en: "Checked whether a drop in a number was real, or caused by a change in who signed up.", zh: "判断一个数字的下降是真的，还是因为报名的人群变了。" },
    ai: { en: "Looked at why a help system sent questions to the wrong team, and tried one fix.", zh: "研究一个求助系统为什么把问题分错了团队，并尝试了一处改进。" }
  };
  function familyBody(done, partial, F) {
    const zh = MP.lang() === "zh", gap = zh ? "" : " ";
    const tried = done.map((id) => ({
      mark: K.dot(id),
      html: `<span class="bf-k">${K.name(id)}</span>${MP.t(FAMILY_DID[id] || MP.lensInfo[id].oneLine)}${gap}<span class="bf-soft">${K.handedIn(id)
        ? MP.t({ en: `Handed in ${K.handNoun(id)}.`, zh: `交出了${K.handNoun(id)}。` })
        : T("The final write-up isn't done yet.", "最后的总结还没写。")}</span>`
    })).concat(partial.map((id) => ({ mark: K.dot(id), html: `<span class="bf-k">${K.name(id)}</span>${T("Started, not finished yet.", "开始了，还没做完。")}` })));
    const famRows = (arr) => byLens(arr).map((g) => ({ mark: K.dot(g.id), html: `<span class="bf-k">${K.name(g.id)}</span>${cap(famJoin(g.items.map((x) => K.plainStep(x.lens, x.step))))}${T(".", "。")}` }));
    const enjoyed = famRows(F.enjoyed), harder = famRows(F.hard);
    const liked = (enjoyed.length ? lines("f-enj", enjoyed)
        : lines("f-enj", [{ mark: `<span class="bf-blank" aria-hidden="true">·</span>`, cls: "bf-empty", html: T("They didn't mark this. Asking them is the best way to find out.", "孩子没有标记这一项。直接问问孩子是最好的办法。") }]))
      + (harder.length ? `<div class="bf-subh">${T("And what felt harder", "觉得较难的部分")}</div>` + lines("f-hard", harder) : "");
    const cant = [
      T("It isn't a test result or a prediction. Nothing was graded.", "这不是考试成绩，也不是预测。没有任何打分。"),
      T("A short try (about 15 minutes each) can't show whether they'd enjoy a whole degree.", "每次约 15 分钟的尝试，看不出孩子会不会喜欢一整个学位。"),
      T("Programs teach these fields differently. Each program's own course list is the real guide.", "各项目教法不同，以各项目自己的课程表为准。")
    ];
    const help = [
      T("Ask which part they'd want to do every week, and why.", "问问孩子：哪一部分愿意每周都做？为什么？"),
      T("Treat this as the start of a conversation, not an answer.", "把它当作一次对话的开始，而不是答案。"),
      T("If they're curious about another field, the next lens takes about 15 minutes.", "如果孩子对另一个方向好奇，下一个视角大约 15 分钟。")
    ];
    const talk = aiTalk(4);
    return section(1, T("What they tried", "孩子试了什么"), "", lines("f-tried", tried, { limit: 3 }), "", MP.t(KICK.did))
      + section(2, T("What they seemed to enjoy", "孩子似乎喜欢什么"), "", liked, "", MP.t(KICK.stood))
      + section(3, T("What this is, and isn't", "这份小结是什么，不是什么"), "", aiCant() + `<ul class="bf-lines">${cant.map((h) => `<li class="bf-line"><span class="bf-mark">${MP.h.ev("limit")}</span><div class="bf-txt">${h}</div></li>`).join("")}</ul>`, "bf-cant", MP.t(KICK.cant))
      + talk
      + section(talk ? 5 : 4, T("How you can help", "你可以怎么帮忙"), "", `<ul class="bf-lines">${help.map((h, i) => `<li class="bf-line"><span class="bf-mark"><span class="bf-n">${String(i + 1).padStart(2, "0")}</span></span><div class="bf-txt">${h}</div></li>`).join("")}</ul>`, "bf-help", MP.t(KICK.help));
  }

  /* ---------------- toolbar & masthead ---------------- */
  function toolbar(done) {
    const desc = {
      me: T("Everything, including notes only you can see.", "全部内容，包括只有你能看到的记录。"),
      advisor: T("Ready to share, written as you. Hint use and private reflections are left out.", "适合分享，以你的口吻来写，不含提示使用情况和私人回顾。"),
      family: T("Shorter and plainer, written about you rather than to you.", "更简短直白，用第三人称来写。")
    };
    return `<div class="bf-bar no-print">
      <div class="bf-views">
        <span class="bf-views-l ld-label" id="bf-views-l">${T("View", "视图")}</span>
        <div class="seg" role="group" aria-labelledby="bf-views-l">${[["me", T("My Brief", "我的小结")], ["advisor", T("Advisor view", "给顾问看")], ["family", T("Family view", "给家人看")]].map(([v, l]) => `<button aria-pressed="${v === view}" data-action="bf-view" data-arg="${v}" data-fk="bf-view:${v}">${l}</button>`).join("")}</div>
        <span class="bf-views-d">${desc[view]}</span>
      </div>
      <div class="bf-tools">
        ${done.length >= 2 ? MP.h.quiet(T("Compare", "比较") + " →", "go", "#/compare") : ""}
        ${MP.h.secondary(`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 18H4.5A1.5 1.5 0 0 1 3 16.5v-6A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H17"/><path d="M7 14h10v7H7z"/></svg>${T("Print or save PDF", "打印 / 存为 PDF")}`, "bf-print", "", { sm: true })}
      </div>
    </div>`;
  }
  const sheetTitle = () => view === "family" ? MP.t({ en: `What they <span class="it">tried</span> on MajorPilot`, zh: "孩子在 MajorPilot 上试了什么" }) : adv() ? MP.t({ en: `A student's <span class="it">Brief</span>`, zh: "学生小结" }) : MP.t({ en: `My <span class="it">Brief</span>`, zh: "我的小结" });
  /** Masthead figure: the split mark with a solid beam for each finished lens. */
  function mastFig(done) {
    return `<figure class="bf-mast-fig" aria-label="${esc(T("Lenses covered", "涉及视角"))}">
      <span class="ld-label">${T("Fig. 1 · Lenses covered", "图 1 · 涉及视角")}</span>
      ${K.mark(done, { labels: true })}
      <p class="bf-legend-1">${done.length === K.ids().length ? T("All three beams are solid: every lens finished.", "三条线都是实线：每个视角都做完了。") : T("Solid beam: a finished lens. Dashed: not yet.", "实线为已完成，虚线为未完成。")}</p>
    </figure>`;
  }
  /** Four computed counts under the masthead (count up once, on the first arrival this session). */
  function facts(done, F) {
    const all = K.ids(), cnt = MP.firstVisit("brief") ? " data-ld-count" : "";
    const steps = all.reduce((a, id) => a + MP.progress(id).done, 0);
    const cells = [
      [`<span${cnt}>${MP.n(done.length)}</span><small>/${MP.n(all.length)}</small>`, T("Lenses finished", "完成的视角")],
      [`<span${cnt}>${MP.n(steps)}</span>`, T("Steps done", "做完的步骤")],
      [`<span${cnt}>${MP.n(done.filter(K.handedIn).length)}</span>`, view === "family" ? T("Write-ups", "交付物") : T("Handed in", "交付物")],
      [`<span${cnt}>${MP.n(F.enjoyed.length)}</span>`, T("Steps enjoyed", "喜欢的步骤")]
    ];
    return `<dl class="bf-facts-strip">${cells.map(([v, k]) => `<div><dt class="ld-label">${k}</dt><dd class="ld-num">${v}</dd></div>`).join("")}</dl>`;
  }
  function masthead(done, partial, F) {
    const latest = Math.max(...done.map((id) => MP.ls(id).completedAt || 0));
    const sub = view === "family"
      ? T("A short, plain summary for family. It's a record of what they tried, not a test result.", "写给家人的简短说明。这是孩子尝试过的记录，不是测试成绩。")
      : adv() ? T("A one-page record of what I tried and what I noticed. Not a test or a score.", "一页记录：我试了什么、注意到了什么。不是测试，也没有分数。")
        : T("A one-page record of what you tried and what you noticed. Not a test or a score.", "一页记录：你试了什么、注意到了什么。不是测试，也没有分数。");
    return `<header class="bf-mast">
      <div class="bf-mast-top"><span class="bf-brand">MajorPilot <span aria-hidden="true">·</span> ${view === "family" ? T("For family", "家人版") : adv() ? T("For an advisor", "顾问版") : T("Brief", "小结")}</span><span class="bf-date">${T("Updated", "更新于")} ${K.fmtDate(latest || Date.now())}</span></div>
      <div class="bf-mast-grid">
        <div class="bf-mast-l">
          <h1 class="bf-title">${sheetTitle()}</h1>
          <p class="bf-sub">${sub}</p>
          <div class="bf-meta">${done.map((id) => MP.h.lensTag(id)).join("")}
            ${partial.map((id) => `<span class="bf-meta-p">${K.skim(id) ? MP.t({ en: `${K.short(id)} looked through`, zh: `${K.short(id)} 已浏览` }) : MP.t({ en: `${K.short(id)} in progress`, zh: `${K.short(id)} 进行中` })}</span>`).join("")}</div>
        </div>
        ${mastFig(done)}
      </div>
      ${facts(done, F)}
    </header>`;
  }
  const sheetFoot = () => `<footer class="bf-foot">${K.mark(K.ids())}<p><span>${view === "family" ? T("Made from their own choices on MajorPilot.", "根据孩子在 MajorPilot 上的选择生成。") : adv() ? T("Made from my own choices on MajorPilot.", "根据我在 MajorPilot 上的选择生成。") : T("Made from your own choices on MajorPilot.", "根据你在 MajorPilot 上的选择生成。")}</span><span>${MP.t(MP.data.fictional)}</span></p></footer>`;

  /** The sheet's index mark: three segments, lit in the lens colour for each finished lens. */
  const index = (done) => `<i class="bf-index" aria-hidden="true">${MP.lensOrder.map((id) => `<b class="${id}${done.includes(id) ? " on" : ""}"></b>`).join("")}</i>`;

  /* ---------------- empty state ---------------- */
  function empty() {
    const ns = MP.nextStep();
    const rows = (MP.lensOrder || []).filter((id) => MP.lensInfo[id]).map((id) => {
      const p = MP.lenses[id] ? MP.progress(id) : { done: 0, total: 1 };
      const status = MP.lenses[id] && K.skim(id) ? T("Looked through", "已浏览") : p.done > 0 ? MP.t({ en: `${p.done} of ${p.total} steps`, zh: `已完成 ${K.num(p.done + "/" + p.total)} 步` }) : T("Not started", "未开始");
      return `<li class="bf-mat lens-${id} ${id}">
        ${K.glyph(id, "bf-mat-fig")}
        <div class="bf-mat-h">${MP.h.lensTag(id)}<span class="bf-mat-s ${p.done ? "on" : ""}">${status}</span></div>
        <div class="bf-mat-q lens-q">${MP.t(MP.lensInfo[id].question)}</div>
        <div class="bf-mat-hand"><span class="ld-label">${T("You'd hand in", "你会交出")}</span>${MP.t(MP.lensInfo[id].handIn)}</div>
        ${MP.lenses[id] ? MP.draw.stepBeam(id, true) : ""}
      </li>`;
    }).join("");
    const ghost = (w) => `<span class="bf-ghost" style="width:${w}%"></span>`;
    const p = ns && ns.resume ? MP.progress(ns.lens) : null;
    const skim = !!(p && p.skimmed);
    const label = ns ? (skim ? MP.ui("backToSkipped") : ns.resume ? MP.t({ en: `Continue the ${K.short(ns.lens)} lens`, zh: `继续 ${K.short(ns.lens)} 视角` }) : MP.t({ en: `Start with ${K.short(ns.lens)}`, zh: `从 ${K.short(ns.lens)} 开始` })) : T("Explore the lenses", "看看三个视角");
    const secs = [T("What you did", "你做了什么"), T("What stood out to you", "你注意到了什么"), T("What this suggests about the work", "这对专业学习意味着什么"), T("What this can't tell you", "这份小结说明不了什么"), T("Next steps", "接下来")];
    return `<div class="container pg-brief is-empty"><div class="bf-wrap">
      <div class="bf-paper"><article class="bf-sheet ld-ticks">${index([])}
        <header class="bf-mast">
          <div class="bf-mast-top"><span class="bf-brand">MajorPilot <span aria-hidden="true">·</span> ${T("Brief", "小结")}</span><span class="bf-date">${skim ? T("Looked through", "已浏览") : p ? T("In progress", "进行中") : T("Not started yet", "尚未开始")}</span></div>
          <div class="bf-mast-grid">
            <div class="bf-mast-l">
              <h1 class="bf-title">${MP.t({ en: `Your Brief starts with <span class="it">one</span> finished lens`, zh: "完成一个视角，\u200b你的小结就会成形" })}</h1>
              <p class="bf-sub">${skim
            ? MP.t({ en: `You've looked through ${K.name(ns.lens)}, but skipped ${p.contentSkipped === 1 ? "1 step" : p.contentSkipped + " steps"}, so there's nothing to hand in yet. Doing ${Math.min(MP.SUBSTANTIVE || 3, MP.lenses[ns.lens].steps.length)} of its ${MP.lenses[ns.lens].steps.length} steps is enough for this page to write itself from your own choices.`, zh: `你已经浏览过${K.name(ns.lens)}，但跳过了 ${p.contentSkipped} 步，所以暂时还没有交付物。完成其中任意 ${Math.min(MP.SUBSTANTIVE || 3, MP.lenses[ns.lens].steps.length)} 步，这一页就会根据你的选择写好。` })
            : p
            ? MP.t({ en: `You're ${p.done} of ${p.total} steps into ${K.name(ns.lens)}. Finish it and this page writes itself from your own choices.`, zh: `你已完成${K.name(ns.lens)}的 ${p.done}/${p.total} 步。做完它，这一页会根据你的选择自动写好。` })
            : T("Each lens takes about 15 minutes. When you finish one, this page fills in from your own choices: what you did, what stood out, and what to try next.", "每个视角约 15 分钟。做完一个，这一页就会根据你的选择写好：你做了什么、注意到了什么、接下来可以试什么。")}</p>
            </div>
            <figure class="bf-mast-fig" aria-hidden="true">
              <span class="ld-label">${T("Fig. 1 · Lenses covered", "图 1 · 涉及视角")}</span>
              ${K.mark([], { labels: true })}
              <p class="bf-legend-1">${T("Finish a lens and its beam turns solid.", "做完一个视角，它的线就会变成实线。")}</p>
            </figure>
          </div>
        </header>
        <div class="bf-preview" aria-hidden="true">
          <div class="bf-short on-ink ghosted"><div class="bf-short-h"><i class="bf-tri" aria-hidden="true"></i><span class="ld-label">${T("In short", "简而言之")}</span></div>
            <ol><li><span class="n">01</span><span class="g">${ghost(88)}${ghost(54)}</span></li><li><span class="n">02</span><span class="g">${ghost(76)}</span></li><li><span class="n">03</span><span class="g">${ghost(82)}${ghost(40)}</span></li></ol></div>
          <div class="bf-preview-secs">${secs.map((t, i) => `<div class="bf-psec"><span class="bf-num">${String(i + 1).padStart(2, "0")}</span><span class="t">${t}</span>${ghost([62, 46, 34, 52, 40][i])}</div>`).join("")}</div>
          <span class="bf-stamp">${T("Preview", "预览")}</span>
        </div>
        <div class="bf-mats">
          <div class="bf-mats-h"><span class="ld-label bf-kick">${T("Three lenses, one problem", "一个问题，三个视角")}</span><h2 class="bf-h2">${T("Your materials so far", "目前的材料")}</h2><span class="bf-intro">${T("Any lens counts. Stop anytime; your work saves itself.", "任何一个视角都可以。随时能停，进度会自动保存。")}</span></div>
          <ul>${rows}</ul>
        </div>
        <div class="bf-empty-cta">${MP.h.primary(label, "go", ns ? `#/lens/${ns.lens}/${ns.step}` : "#/explore", { lens: ns ? ns.lens : undefined, fk: "bf-empty" })}
          ${ns ? MP.h.link(T("See all three lenses first", "先看看三个视角") + " →", "go", "#/explore") : ""}</div>
      </article></div>
    </div></div>`;
  }

  /* =====================================================================================================
     AI-4 · "Drafted from your work" (AI-LAYER.md §2 AI-4). No model: every line is composed here from the student's
     own record (steps, marks, picks, notes, follow-ups, write-up text) and MP.data, validated with MP.ai.check, and
     only then handed to the shared kit (MP.ai.block) for the reading trace, streaming, quotes and cite chips.
     Composition is a pure function of state + data + lang + regen; the language is NOT in the fingerprint, so a
     language switch shows the other text instantly instead of re-streaming.
     ===================================================================================================== */
  const AI = MP.ai;
  const Z = () => MP.lang() === "zh";
  const tx = (en, zh) => (Z() ? zh : en);
  const pad2 = (i) => String(i).padStart(2, "0");
  const BOXES = { ba: ["rec", "why", "risk", "measure"], ds: ["found", "sure", "unknown", "dont"], ai: ["changed", "improved", "cost", "watch"] };
  const FIRSTBOX = { ba: "rec", ds: "found", ai: "changed" };
  const DOC = { ba: { en: "memo", zh: "建议" }, ds: { en: "summary", zh: "小结" }, ai: { en: "note", zh: "说明" } };
  const DOCN = { ba: { en: "recommendation", zh: "行动建议" }, ds: { en: "evidence summary", zh: "证据小结" }, ai: { en: "model-change note", zh: "模型改动说明" } };
  const WORK = { ba: { en: "business analytics work", zh: "商业分析工作" }, ds: { en: "data science work", zh: "数据科学工作" }, ai: { en: "AI-style work", zh: "人工智能类工作" } };
  /** Where each step's skill lives in master's coursework (field-level, no program names). */
  const TOPIC = {
    "ba.ratio": [["intro analytics courses", "reading rates and their denominators"], ["分析入门课", "读懂比例和分母"]],
    "ba.funnel": [["product analytics courses", "funnel analysis"], ["产品分析课", "漏斗分析"]],
    "ba.missing": [["consulting-style courses", "listing hypotheses before the data"], ["咨询类课程", "先列假设再看数据"]],
    "ba.test": [["experimentation courses", "sample size and test design"], ["实验设计课", "样本量和试验设计"]],
    "ba.memo": [["capstone projects", "writing for a decision-maker"], ["毕业项目", "为决策者写作"]],
    "ds.claim": [["research-methods courses", "questioning how a metric is defined"], ["研究方法课", "追问指标的定义"]],
    "ds.trend": [["statistical inference courses", "telling a signal from noise"], ["统计推断课", "区分信号和噪声"]],
    "ds.split": [["applied statistics courses", "stratifying and re-weighting"], ["应用统计课", "分层和重新加权"]],
    "ds.conclude": [["research design courses", "matching a claim to its evidence"], ["研究设计课", "让结论和证据相称"]],
    "ds.summary": [["data-communication courses", "stating uncertainty plainly"], ["数据沟通课", "把不确定性写清楚"]],
    "ai.numbers": [["model evaluation courses", "accuracy versus coverage"], ["模型评估课", "准确率和覆盖率"]],
    "ai.errors": [["applied machine learning courses", "error analysis"], ["应用机器学习课", "错误分析"]],
    "ai.change": [["machine learning courses", "change-one-thing experiments"], ["机器学习课", "一次只改一处、再重跑对比的做法"]],
    "ai.tradeoff": [["AI product courses", "weighing accuracy against human workload"], ["人工智能产品类课程", "权衡准确率和人工工作量"]],
    "ai.note": [["team and capstone projects", "writing model-change notes"], ["团队和毕业项目", "写模型改动说明"]]
  };
  const topic = (x) => { const t = TOPIC[x.lens + "." + x.step.id]; return t ? { area: t[Z() ? 1 : 0][0], skill: t[Z() ? 1 : 0][1] } : { area: tx("these courses", "这类课程"), skill: K.plainStep(x.lens, x.step) }; };
  /** What a reflect follow-up answer means, in a few words. */
  const FOLLOW = {
    good: ["hard in a good way", "难得有意思"], just: ["just hard", "就是难"], topic: ["the topic itself", "话题本身"], surprise: ["the surprise", "那一下的意外"],
    numbers: ["the numbers", "数字本身"], deciding: ["the deciding", "做决定"], both: ["both the numbers and the deciding", "数字和做决定都有"],
    problem: ["the problem itself", "问题本身"], work: ["the kind of work", "这类工作"], way: ["the way of working", "这种做事方式"]
  };
  /** Words that tie the lenses together (en word-boundary, zh substring). */
  const LX = {
    mix: { en: ["partner", "partners", "mix", "who signed up", "channel", "channels"], zh: ["合作", "渠道", "构成", "报名人群"] },
    help: { en: ["help", "misrouted", "stuck", "support"], zh: ["求助", "帮助", "分错", "卡住"] }
  };

  /* ---------- the student's own text ---------- */
  /** {box: text} for a lens's write-up, as shown in the current language (BA's sample memo follows the UI language). */
  K.texts = function (id) {
    const d = (MP.ls(id).data) || {}, keys = BOXES[id] || [];
    let out = {};
    if (id === "ba") {
      try {
        const s = K.summary("ba");
        if (s && s.artifact && s.artifact.html && window.DOMParser) {
          const doc = new DOMParser().parseFromString(s.artifact.html, "text/html");
          doc.querySelectorAll(".ba-doc-row").forEach((r, i) => {
            const v = r.querySelector(".ba-doc-v"); if (!v || v.querySelector(".faint") || !keys[i]) return;
            v.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
            const t = v.textContent.trim(); if (t) out[keys[i]] = t;
          });
        }
      } catch (e) { out = {}; }
      if (!Object.keys(out).length) keys.forEach((k) => { const t = String((d.memo || {})[k] || "").trim(); if (t) out[k] = t; });
    } else {
      const src = id === "ds" ? d.sum : d.note;
      keys.forEach((k) => { const t = String((src || {})[k] || "").trim(); if (t) out[k] = t; });
    }
    return out;
  };
  const isZhText = (s) => AI.text.lang(s) === "zh";
  const sizeOf = (s) => (isZhText(s) ? AI.text.chars(s) : AI.text.words(s));
  /** Curly quotes inside a quoted clause would nest: turn them into single quotes (sources get the same version). */
  const inner = (s) => isZhText(String(s)) ? String(s).replace(/“/g, "「").replace(/”/g, "」") : String(s).replace(/“/g, "‘").replace(/”/g, "’");
  /** The clause around offset `at`: inside its sentence (MP.ai.text.sentences keeps 62.5 / 3.25 whole), cut at , ; : —
      and brackets only, then windowed to ≤ maxWords (en) / maxChars (zh) around `at`. Offsets into `s`. */
  K.clause = function (s, at, o) {
    s = String(s || ""); o = o || {}; const maxW = o.maxWords || 12, maxC = o.maxChars || 20;
    const sen = AI.text.sentences(s).find((x) => at >= x.s && at < x.e) || AI.text.first(s);
    const B = /[,;:—–，、；：（）]/;
    let a = at, b = at;
    while (a > sen.s && !B.test(s[a - 1])) a--;
    while (b < sen.e && !B.test(s[b])) b++;
    while (a < b && /\s/.test(s[a])) a++;
    while (b > a && /[\s.!?。！？]/.test(s[b - 1])) b--;
    let text = s.slice(a, b);
    if (isZhText(text)) {
      if (text.length > maxC) { const off = Math.max(0, Math.min(at - a - Math.floor(maxC / 3), text.length - maxC)); a += off; b = a + maxC; }
    } else {
      const toks = []; const re = /\S+/g; let m; while ((m = re.exec(text))) toks.push({ s: a + m.index, e: a + m.index + m[0].length });
      if (toks.length > maxW) {
        let k = toks.findIndex((t) => at < t.e); if (k < 0) k = toks.length - 1;
        const st = Math.max(0, Math.min(k - Math.floor(maxW / 3), toks.length - maxW));
        a = toks[st].s; b = toks[st + maxW - 1].e;
      }
    }
    while (b > a && /[,;:—–，、；：]/.test(s[b - 1])) b--;
    return { s: a, e: b, text: s.slice(a, b) };
  };
  /** A clause of `s` around offset `at` (≤ 10 words / 18 chars), exact substring with … where cut. "" when too thin. */
  function clauseOf(s, at, o) {
    s = String(s || ""); if (!s.trim()) return "";
    const zh = isZhText(s);
    if (zh ? AI.text.chars(s) < 6 : AI.text.words(s) < 3) return "";
    const c = K.clause(s, at || 0, Object.assign({ maxWords: 10, maxChars: 18 }, o || {}));
    if (!c.text || (zh ? AI.text.chars(c.text) < 4 : AI.text.words(c.text) < 3)) return "";
    return inner(AI.text.quote(s, c.s, c.e));
  }
  /** The decision line of a write-up (the first box's first clause). */
  function decision(id, texts) {
    const s = texts[FIRSTBOX[id]]; if (!s) return "";
    return clauseOf(s, AI.text.first(s).s);
  }
  /** The most telling clause of a reflection note: around a surprise / positive / negative word, else the first clause. */
  function noteClause(note) {
    note = String(note || "").trim(); if (!note) return "";
    const hit = AI.text.find(note, AI.lex.surprise)[0] || AI.text.find(note, AI.lex.positive)[0] || AI.text.find(note, AI.lex.negative)[0];
    return clauseOf(note, hit ? hit.s : 0, { maxWords: 12, maxChars: 20 });
  }

  /* ---------- the record: everything the draft may read, gathered once per render ---------- */
  let REC = null;
  function record() {
    const ids = K.ids(), done = K.complete(), partial = K.started();
    const L = {};
    ids.forEach((id) => {
      const ls = MP.ls(id), d = ls.data || {};
      const texts = K.handedIn(id) || done.includes(id) ? K.texts(id) : {};
      const refl = ls.refl || {}, rs = ls.steps.reflect;
      const reflOk = !(rs && rs.skipped && !rs.done);
      L[id] = {
        id, ls, d, texts, steps: K.steps(id), p: MP.progress(id), done: done.includes(id), handed: K.handedIn(id), skim: K.skim(id),
        pick: K.pick(id), none: reflOk && refl.pick === "none", note: reflOk ? String(refl.note || "").trim() : "",
        follow: refl.follow && refl.follow.a && refl.follow.a !== "skip" ? refl.follow : null,
        words: sizeOf(Object.values(texts).join(" ")),
        revised: !!(d.read && Array.isArray(d.read.notes) && d.read.notes.some((n) => n && n.addressed))
      };
    });
    const all = [].concat(...ids.map((id) => L[id].steps));
    const sig = AI.fp(ids.map((id) => {
      const x = L[id];
      return [id, x.done, x.handed, x.steps.map((s) => [s.st.done ? 1 : 0, s.st.skipped ? 1 : 0, s.st.energy || "", s.st.hard ? 1 : 0, s.st.hints || 0]),
        x.ls.refl && [x.ls.refl.pick, x.ls.refl.note, x.follow && x.follow.a], x.d.memo || x.d.sum || x.d.note || null, x.revised];
    }));
    return { ids, done, partial, L, all, sig,
      enjoyed: all.filter((x) => x.st.energy === "enjoyed"), hard: all.filter((x) => x.st.hard), drained: all.filter((x) => x.st.energy === "drained"),
      hj: all.filter((x) => x.st.hard && x.st.energy === "enjoyed"), marked: all.filter((x) => x.st.energy || x.st.hard) };
  }

  /* ---------- composition helpers ---------- */
  /** Voice words: My Brief speaks to "you"; the Advisor view is the student speaking ("I"). */
  const P = () => adv()
    ? { S: "I", s: "I", o: "me", p: "my", P: "My", re: "I'm", Re: "I'm", d: "I'd", z: "我" }
    : { S: "You", s: "you", o: "you", p: "your", P: "Your", re: "you're", Re: "You're", d: "you'd", z: "你" };
  /** A step title in quotes, or, when the title itself trips the banned lexicon (e.g. "…not just the score" / "分数"),
      the plain description of that step, so a line about the step never fails validation for the product's own words. */
  const QT = (x) => { const t = K.stepTitle(x.step), lo = t.toLowerCase(); return AI.lex.banned[Z() ? "zh" : "en"].some((w) => lo.includes(w.toLowerCase())) ? K.plainStep(x.lens, x.step) : K.q(t); };
  const stepNo = (lens, step) => { const i = MP.lensSteps(lens).findIndex((s) => s.id === step); return i + 1; };
  const docLabel = (id) => ({ en: SHn(id) + "·" + DOC[id].en, zh: SHn(id) + "·" + DOC[id].zh });
  function SHn(id) { return MP.lensInfo[id].short; }
  /** An inline evidence chip that lights its row on this page (hover) and opens the step (click). */
  const C = (lens, step, label, src) => ({ cite: { lens, step, label, src: src || "bf-src-" + lens, go: true } });
  const CR = (lens) => C(lens, "reflect", { en: "your reflection", zh: "你的回顾" }, "bf-src-refl-" + lens);
  /** en: American punctuation on plain string segments (periods/commas inside closing quotes). */
  /** Drop a full stop right after a quoted title that already ends in ? / ！ (“…吗？”。 → “…吗？”). */
  const qEnd = (x) => typeof x === "string" ? x.replace(/([?？!！](?:<\/span>)?(?:<span class="zq">)?”(?:<\/span>){0,2})[.。]/g, "$1") : x;
  const seg = (arr) => { const a = arr.filter((x) => x !== "" && x != null && x !== false).map(qEnd);
    // a period that opens the next string segment after a quoted title ending in ?/！
    for (let i = 1; i < a.length; i++) if (typeof a[i] === "string" && typeof a[i - 1] === "string" && /[?？!！](?:<\/span>)?(?:<span class="zq">)?”(?:<\/span>){0,2}$/.test(a[i - 1])) a[i] = a[i].replace(/^[.。]/, "");
    return a.filter((x) => x !== ""); };
  /** en: American punctuation (periods/commas inside closing quotes), applied to the rendered html after validation. */
  const amerH = (h) => (Z() ? h : K.amer(h));
  let NUMS = [];
  const N = (x, d) => { NUMS.push(+x); return MP.n(x, d); };
  /** Every figure a line may cite: computed from MP.data, plus counts registered while composing. */
  function known() {
    const D = MP.data, F = D.funnel, out = [D.reweighted, 15];
    ["earlier", "recent"].forEach((k) => F[k].forEach((v, i) => { out.push(v); if (i) { out.push(Math.round(F[k][i] / F[k][i - 1] * 1000) / 10); out.push(F[k][i - 1] - F[k][i]); } }));
    const tot = (p) => { const c = D.channels[p]; return (c.organic.completed + c.partner.completed) / (c.organic.signups + c.partner.signups) * 100; };
    const pe = tot("earlier"), pr = tot("recent");
    out.push(pe, pr, pe - pr, (pe - pr) / 2, D.reweighted - pr, pe - D.reweighted);
    ["earlier", "recent"].forEach((p) => ["organic", "partner"].forEach((c) => out.push(D.channels[p][c].completed / D.channels[p][c].signups * 100)));
    D.cohorts.forEach((c) => { out.push(c.partnerShare * 100, Math.round(c.completed / c.signups * 1000) / 10); });
    const R = D.router; [R.baseline].concat(Object.values(R.options)).forEach((r) => { out.push(r.auto, r.correct, r.human, r.auto - r.correct, Math.round(r.correct / r.auto * 1000) / 10, r.auto / 2); Object.values(r.errors).forEach((v) => out.push(v)); });
    out.push(R.baseline.auto + R.baseline.human);
    return out.concat(NUMS);
  }
  /** Sources a quote may come from: the student's write-ups and notes (plus the nested-quote-safe versions). */
  function sources(R) {
    const s = [];
    R.ids.forEach((id) => { const x = R.L[id]; Object.values(x.texts).forEach((t) => { s.push(t, inner(t)); }); if (x.note) s.push(x.note, inner(x.note)); });
    return s;
  }
  /** First variant (starting at the regen offset) that passes the checks; null when none does. */
  function firstValid(variants, start, o) {
    for (let k = 0; k < variants.length; k++) {
      const i = (start + k) % variants.length, v = variants[i];
      if (!v) continue;
      const segs = typeof v === "function" ? v() : v;
      // options may be a function: numbers registered while composing (N()) must be known before checking
      if (segs && AI.check(segs, typeof o === "function" ? o() : o).ok) return { segs, i };
    }
    return null;
  }

  /* ---------- In short: candidate claims per slot ---------- */
  /** Slot 01 — what you did. */
  function claimsDid(R) {
    const p = P(), out = [], done = R.done, handed = done.filter((id) => R.L[id].handed), open = done.filter((id) => !R.L[id].handed);
    const fam = view === "family";
    const docCites = handed.map((id) => C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, docLabel(id)));
    const lensCites = open.map((id) => C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, docLabel(id)));
    const cites = docCites.concat(lensCites);
    const lensList = K.join(done.map((id) => SHn(id)));
    /** "a one-page recommendation" — or, honestly, "a short recommendation (6 words so far)" when it's thin. */
    const noun = (id) => {
      const w = R.L[id].words;
      if (w && w < 12) return tx(`a short ${DOCN[id].en} (${N(w)} words so far)`, `一份还很短的${DOCN[id].zh}（目前 ${N(w)} 个字）`);
      return K.handNoun(id);
    };
    const nouns = K.join(handed.map(noun));
    const openTail = open.length ? tx(` The ${K.join(open.map(K.name))} write-up is still open.`, `${K.join(open.map(K.name))}的交付物还没写。`) : "";
    if (fam) {
      const n = done.length, ways = tx(n === 1 ? "one way" : n === 2 ? "two ways" : "all three ways", n === 1 ? "一种" : n === 2 ? "两种" : "全部三种");
      const plain = K.join(done.map(K.plainLens));
      out.push({ id: "did.fam", w: 3, v: [
        () => seg([tx(`They tried ${ways} of working (${plain}) on one made-up problem: an online course where fewer learners were finishing.`, `孩子在同一个虚构的问题上试了${ways}工作方式（${plain}）：一个在线课程里，学完的学员变少了。`)].concat(cites.slice(0, 2).flatMap((c) => [" ", c]))),
        () => seg([tx(`Same made-up problem, ${ways} of looking at it: ${plain}.${handed.length ? ` They wrote something up for ${handed.length === 1 ? "one" : "each"}.` : ""}`, `同一个虚构问题，孩子用了${ways}角度去看：${plain}。${handed.length ? "每个都写了一份小结。" : ""}`)].concat(cites.slice(0, 2).flatMap((c) => [" ", c]))),
        () => seg([tx(`They worked through ${plain} on a pretend online course that was losing learners, and ${handed.length ? "wrote up what they found" : "got through the main steps"}.`, `孩子在一个虚构的、学员越来越少的在线课程上，做了${plain}的练习，${handed.length ? "还把发现写了下来" : "做完了主要步骤"}。`)].concat(cites.slice(0, 2).flatMap((c) => [" ", c])))
      ] });
      return out;
    }
    const lensesEn = `the ${K.join(done.map(K.name))} lens${done.length > 1 ? "es" : ""}`;
    const lensesZh = `${K.join(done.map(K.name))}${done.length === 2 ? "两个" : done.length === 3 ? "全部三个" : ""}视角`;
    // quote a write-up's first line only when it is in the reader's language (a zh Brief doesn't open on an en quote)
    const qs = handed.map((id) => ({ id, q: decision(id, R.L[id].texts) })).filter((x) => x.q && AI.text.lang(x.q) === MP.lang());
    const v = [
      () => seg([handed.length
        ? tx(`${p.S} finished ${lensesEn} and handed in ${nouns}.${openTail}`, `${p.z}完成了${lensesZh}，交出了${nouns}。${openTail}`)
        : tx(`${p.S} worked through ${lensesEn}. The write-up${done.length > 1 ? "s are" : " is"} still open.`, `${p.z}做完了${lensesZh}的主要步骤，交付物还没写。`)].concat(cites.flatMap((c) => [" ", c]))),
      () => seg([handed.length
        ? tx(`${done.length === 1 ? "One lens" : done.length === 2 ? "Two lenses" : "All three lenses"} done (${lensList}), with ${nouns} to show for ${done.length === 1 ? "it" : "them"}.${openTail}`, `做完了${done.length === 1 ? "一个" : done.length === 2 ? "两个" : "三个"}视角（${lensList}），手里有${nouns}。${openTail}`)
        : tx(`${lensList}: the steps are done; the write-up${done.length > 1 ? "s are" : " is"} still open.`, `${lensList}：步骤做完了，交付物还没写。`)].concat(cites.flatMap((c) => [" ", c])))
    ];
    // v3: lead with the student's own decision line — which document leads rotates with "Another wording"
    // the default wording quotes the student's own first line when there is one (believability: it read the document)
    if (qs.length) {
      const pickQ = qs[Math.floor((MP.state.brief.ai.regen || 0) / 3) % qs.length], id = pickQ.id;
      v.unshift(() => seg([tx(`${p.S} handed in ${nouns}. ${p.P} ${DOCN[id].en} opens with `, `${p.z}交出了${nouns}。${p.z === "我" ? "我的" : "你的"}${DOCN[id].zh}开头写的是`), { q: pickQ.q, lens: id }, tx(".", "。"), openTail].concat(cites.flatMap((c) => [" ", c]))));
    }
    out.push({ id: "did.work", w: 3, base: 0, v });
    // the AI-1 revision log, when a second read changed something
    const rev = done.filter((id) => R.L[id].revised);
    if (rev.length) {
      const id = rev[0];
      out.push({ id: "did.rev", w: 2, v: [
        () => seg([tx(`${p.S} revised ${p.p} ${DOCN[id].en} after a second read, and the note ${p.s} acted on no longer applies.`, `${p.z}按批注改了${DOCN[id].zh}，改完之后那条批注就不再适用了。`), " ", C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, docLabel(id))])
      ] });
    }
    const dn = R.all.filter((x) => x.st.done && done.includes(x.lens)), nSteps = dn.length;
    if (nSteps) {
      const first = dn[0], last = dn[dn.length - 1];
      out.push({ id: "did.steps", w: 1, v: [
        () => seg([tx(`${p.S} did ${N(nSteps)} steps across ${lensList}, from ${K.plainStep(first.lens, first.step)} to ${K.plainStep(last.lens, last.step)}.`, `${p.z}在 ${lensList} 里做了 ${N(nSteps)} 步，从${K.plainStep(first.lens, first.step)}，到${K.plainStep(last.lens, last.step)}。`), " ", C(first.lens, first.step.id), " ", C(last.lens, last.step.id)])
      ] });
    }
    return out;
  }

  /** Slot 02 — what stood out. Priority: enjoyed + hard on one step > reflection pick (My Brief only) > enjoyed > hard > drained. */
  function claimsStood(R) {
    const p = P(), me = view === "me", fam = view === "family", out = [];
    const cite = (x) => C(x.lens, x.step.id);
    const pickOf = (x) => me && R.L[x.lens].pick && R.L[x.lens].pick.id === x.step.id;
    if (fam) {
      const top = R.hj[0] || R.enjoyed[0];
      if (top) {
        const pl = K.plainStep(top.lens, top.step), hard = !!top.st.hard;
        out.push({ id: "stood.fam", w: 3, v: [
          () => seg([tx(`They seemed to enjoy ${pl} most${hard ? ", even though they found it tricky" : ""}.`, `孩子最喜欢的似乎是${pl}${hard ? "，虽然觉得有点难" : ""}。`), " ", cite(top)]),
          () => seg([tx(`The part they liked best: ${pl}${hard ? "; it was tricky too" : ""}.`, `孩子最喜欢的部分：${pl}${hard ? "，也觉得有点难" : ""}。`), " ", cite(top)]),
          () => seg([tx(`${cap(pl)} stood out for them${hard ? ": enjoyable, and a bit hard" : " as the part they enjoyed"}.`, `让孩子印象最深的是${pl}${hard ? "：有意思，也有点难" : ""}。`), " ", cite(top)])
        ] });
      } else out.push({ id: "stood.fam0", w: 1, unsure: true, v: [() => seg([tx("They didn't mark which parts they enjoyed, so that's a good thing to ask them about.", "孩子没有标记喜欢哪些部分，这正好可以聊一聊。")])] });
      return out;
    }
    // 1 · enjoyed + hard: two in different lenses make one combined line
    const hjL = []; R.hj.forEach((x) => { if (!hjL.some((y) => y.lens === x.lens)) hjL.push(x); });
    const pickTail = (x) => pickOf(x) ? [tx(", and chose it as the part you'd do every week", "，回顾时也选它作为愿意每周做的部分"), " ", CR(x.lens)] : [];
    if (hjL.length >= 2) {
      const a = hjL[0], b = hjL[1];
      out.push({ id: "stood.hj2", w: 3.5, v: [
        () => seg([tx(`Twice, the step ${p.s} marked hard was also one ${p.s} enjoyed: ${QT(a)} in ${SHn(a.lens)} and ${QT(b)} in ${SHn(b.lens)}.`, `已经两次了：${p.z}标为有难度的那一步，恰好也是${p.z}喜欢的：${SHn(a.lens)} 的${QT(a)}和 ${SHn(b.lens)} 的${QT(b)}。`), " ", cite(a), " ", cite(b)]),
        () => seg([tx(`${p.S} flagged both ${QT(a)} (${SHn(a.lens)}) and ${QT(b)} (${SHn(b.lens)}) as hard and as enjoyed.`, `${QT(a)}（${SHn(a.lens)}）和${QT(b)}（${SHn(b.lens)}），${p.z}都同时标了“有难度”和“喜欢”。`), " ", cite(a), " ", cite(b)]),
        () => seg([tx(`The steps that felt hard were the ones ${p.s} liked: ${QT(a)} in ${SHn(a.lens)}, ${QT(b)} in ${SHn(b.lens)}.`, `让${p.z}觉得难的步骤，正是${p.z}喜欢的：${SHn(a.lens)} 的${QT(a)}，${SHn(b.lens)} 的${QT(b)}。`), " ", cite(a), " ", cite(b)])
      ] });
    }
    R.hj.forEach((x) => {
      const t = pickTail(x), end = tx(".", "。");
      out.push({ id: "stood.hj." + x.lens + "." + x.step.id, w: 3, v: [
        () => seg([tx(`${p.S} marked ${QT(x)} both enjoyed and hard`, `${p.z}把${QT(x)}同时标成了“喜欢”和“有难度”`)].concat(t.length ? [t[0], end, " ", cite(x), " ", t[2]] : [end, " ", cite(x)])),
        () => seg([tx(`${QT(x)} was hard, and ${p.s} enjoyed it anyway`, `${QT(x)}有难度，但${p.z}还是喜欢`)].concat(t.length ? [t[0], end, " ", cite(x), " ", t[2]] : [end, " ", cite(x)])),
        () => seg([tx(`The step that took the most effort, ${QT(x)}, is also one ${p.s} enjoyed`, `最费劲的那一步，${QT(x)}，也是${p.z}喜欢的一步`)].concat(t.length ? [t[0], end, " ", cite(x), " ", t[2]] : [end, " ", cite(x)]))
      ] });
    });
    // 2 · reflection pick, in the student's own words (My Brief only: reflections are private)
    if (me) R.ids.forEach((id) => {
      const x = R.L[id];
      if (x.pick) {
        const sx = { lens: id, step: x.pick }, q = noteClause(x.note), f = x.follow && FOLLOW[x.follow.a];
        const quote = q ? [tx(" You called it ", "你说那是"), { q, lens: id }, tx(".", "。")] : [];
        const fol = f ? [tx(` Asked what pulled you in, you said: ${f[0]}.`, `追问时你的回答是：${f[1]}。`)] : [];
        out.push({ id: "stood.pick." + id, w: 2 + (q ? 0.3 : 0) + (f ? 0.2 : 0), v: [
          () => seg([tx(`In ${SHn(id)}, you chose ${QT(sx)} as the part you'd do every week.`, `在 ${SHn(id)} 里，你选了${QT(sx)}作为愿意每周做的部分。`)].concat(quote, fol, [" ", CR(id)])),
          () => seg([tx(`${QT(sx)} is the ${SHn(id)} step you'd want every week.`, `${QT(sx)}是 ${SHn(id)} 里你愿意每周都做的一步。`)].concat(quote, fol, [" ", CR(id)])),
          () => seg([tx(`Asked which part you'd keep doing, you picked ${QT(sx)} in ${SHn(id)}.`, `问你愿意一直做哪一部分，你在 ${SHn(id)} 里选了${QT(sx)}。`)].concat(quote, fol, [" ", CR(id)]))
        ] });
      } else if (x.none) {
        const q = noteClause(x.note), quote = q ? [tx(" You wrote ", "你写的是"), { q, lens: id }, tx(".", "。")] : [];
        out.push({ id: "stood.none." + id, w: 1.8, v: [
          () => seg([tx(`In ${SHn(id)}, no step felt like something you'd want every week. That's a real answer, not a gap.`, `在 ${SHn(id)} 里，没有哪一步让你想每周都做。这也是一个真实的答案。`)].concat(quote, [" ", CR(id)])),
          () => seg([tx(`None of the ${SHn(id)} steps is one you'd pick for every week.`, `${SHn(id)} 的步骤里，没有一个是你愿意每周做的。`)].concat(quote, [tx(" Worth knowing, not a verdict.", "知道这一点很有用，它不是结论。"), " ", CR(id)]))
        ] });
      }
    });
    // 3 · enjoyed steps
    if (R.enjoyed.length) {
      const top = R.enjoyed.slice().sort((a, b) => (pickOf(b) ? 1 : 0) - (pickOf(a) ? 1 : 0)).slice(0, 2);
      const other = R.hard.find((x) => !top.some((y) => y.lens === x.lens && y.step.id === x.step.id));
      const n = R.enjoyed.length, names = K.join(top.map(QT));
      const tail = other ? tx(`; ${QT(other)} felt hard.`, `；${QT(other)}感觉有难度。`) : tx(".", "。");
      const cs = top.map(cite).concat(other ? [cite(other)] : []).flatMap((c) => [" ", c]);
      out.push({ id: "stood.enj", w: 1, v: [
        () => seg([n > 2 ? tx(`${p.S} enjoyed ${N(n)} steps, especially ${names}`, `${p.z}喜欢其中 ${N(n)} 步，尤其是${names}`) : tx(`${p.S} enjoyed ${names}`, `${p.z}喜欢${names}`), tail].concat(cs)),
        () => seg([n > 2 ? tx(`${names} are among the ${N(n)} steps ${p.s} marked as enjoyed`, `${p.z}标了喜欢的 ${N(n)} 步里，有${names}`) : tx(`${p.S} marked ${names} as enjoyed`, `${p.z}给${names}标了喜欢`), tail].concat(cs)),
        () => seg([tx(`Enjoyed: ${names}${n > 2 ? `, and ${N(n - top.length)} more` : ""}`, `喜欢的步骤：${names}${n > 2 ? `，还有另外 ${N(n - top.length)} 步` : ""}`), tail].concat(cs))
      ] });
    }
    // 4 · a hard step on its own
    if (R.hard.length) {
      const x = R.hard[0];
      out.push({ id: "stood.hard", w: 0.8, v: [
        () => seg([adv() ? tx(`${QT(x)} felt hard to me.`, `${QT(x)}对我来说有难度。`) : tx(`${QT(x)} felt hard. Worth noticing, not worrying about.`, `${QT(x)}感觉有难度。值得留意，不必担心。`), " ", cite(x)]),
        () => seg([tx(`The step ${p.s} marked hard: ${QT(x)}.`, `${p.z}标了有难度的一步：${QT(x)}。`), " ", cite(x)])
      ] });
    }
    if (R.drained.length) {
      const x = R.drained[0];
      out.push({ id: "stood.drn", w: 0.6, v: [() => seg([tx(`${QT(x)} drained ${p.o} a little.`, `${QT(x)}让${p.z}有点累。`), " ", cite(x)])] });
    }
    // nothing marked: say what can't be said, never pad
    out.push({ id: "stood.0", w: 0.1, unsure: true, v: [() => seg([adv()
      ? tx("I didn't mark how the steps felt this time, so there's nothing here to draw on yet.", "这次我没有标记各步的感受，所以这里还没有可写的。")
      : tx("I can't tell what stood out yet: no step is marked. Tapping how a step felt takes a second.", "还看不出什么让你印象深：你还没有标记任何一步。点一下每步的感受，只需一秒。")])] });
    return out;
  }

  /** A connection from earlier work into a lens (never reorders MP.nextStep; it only explains it). */
  function hookInto(R, lens) {
    const p = P(), H = [];
    const ba = R.L.ba, ds = R.L.ds, ai = R.L.ai;
    const no = (l, s) => tx(`${MP.lensInfo[l].short} step ${stepNo(l, s)}`, `${MP.lensInfo[l].short} 第 ${stepNo(l, s)} 步`);
    if (ba && ba.done && (ba.d.checks || []).includes("help")) H.push({ to: "ai", from: C("ba", "missing"), en: `the help-request question ${p.s} flagged in ${no("ba", "missing")}`, zh: `${p.z}在 ${no("ba", "missing")}提出的求助问题` });
    if (ba && ba.done && (ba.d.checks || []).includes("mix")) H.push({ to: "ds", from: C("ba", "missing"), en: `the who-signed-up question ${p.s} flagged in ${no("ba", "missing")}`, zh: `${p.z}在 ${no("ba", "missing")}提出的报名人群问题` });
    if (ds && ds.done && ds.d.next === "funnel") H.push({ to: "ba", from: C("ds", "conclude"), en: `the funnel question ${p.s} chose to check after DS`, zh: `${p.z}在 DS 之后想看的漏斗问题` });
    if (ds && ds.done && ds.d.next === "help") H.push({ to: "ai", from: C("ds", "conclude"), en: `the help question ${p.s} chose to check after DS`, zh: `${p.z}在 DS 之后想查的求助问题` });
    if (ai && ai.done && ai.d.err && ai.d.err.pattern === "content") H.push({ to: "ba", from: C("ai", "errors"), en: `the stuck-on-an-assignment messages ${p.s} found in ${no("ai", "errors")}`, zh: `${p.z}在 ${no("ai", "errors")}找到的、卡在作业上的学员求助` });
    return H.find((h) => h.to === lens) || null;
  }
  /** Slot 03 — one next step (MP.nextStep decides; the AI only says why). */
  function claimsNext(R) {
    const p = P(), out = [], ns = MP.nextStep(), fam = view === "family";
    if (fam) {
      const top = R.enjoyed[0];
      out.push({ id: "next.fam", w: 2, v: [
        () => seg([tx("This isn't a test or a score. A good next step: ask them which part they'd want to do every week.", "这不是测试，也没有分数。接下来可以问问孩子：哪一部分愿意每周都做？")]),
        () => seg([tx("Nothing here was graded. The most useful thing now is a conversation: which part would they happily do again?", "这里没有任何打分。现在最有用的是聊一聊：哪一部分孩子愿意再做一次？")]),
        () => seg([top ? tx(`A good place to start talking: ${K.plainStep(top.lens, top.step)}, the part they seemed to like. It isn't a test result.`, `可以从孩子似乎喜欢的那部分聊起：${K.plainStep(top.lens, top.step)}。这不是测试结果。`) : tx("A good place to start talking: which of these they'd do again. It isn't a test result.", "可以先聊聊：这些里面孩子愿意再做哪一个。这不是测试结果。")])
      ] });
      return out;
    }
    if (ns && MP.lensInfo[ns.lens]) {
      const pr = MP.progress(ns.lens), nm = K.name(ns.lens), skim = ns.resume && K.skim(ns.lens);
      const at = C(ns.lens, ns.step);
      const hook = skim ? null : hookInto(R, ns.lens);
      if (hook) {
        const h = tx(hook.en, hook.zh), H = cap(h);
        out.push({ id: "next.hook", w: 3, v: ns.resume ? [
          () => seg([adv() ? tx(`Next, I plan to finish the ${nm} lens (${N(pr.done)} of ${N(pr.total)} steps in); it follows ${h}.`, `接下来，我打算把${nm}视角做完（已完成 ${N(pr.done)}/${N(pr.total)} 步）；它追的正是${h}。`)
            : tx(`Next: finish the ${nm} lens. You're ${N(pr.done)} of ${N(pr.total)} steps in, and it follows ${h}.`, `下一步：把${nm}视角做完。你已完成 ${N(pr.done)}/${N(pr.total)} 步；这个视角追的，正是${h}。`), " ", at, " ", hook.from]),
          () => seg([tx(`${H} gets its answer in the ${nm} lens, where ${p.re} ${N(pr.done)} of ${N(pr.total)} steps in.`, `${h}，要在${nm}视角里找答案；${p.z}在那里已完成 ${N(pr.done)}/${N(pr.total)} 步。`), " ", at, " ", hook.from]),
          () => seg([tx(`Pick the ${nm} lens back up (${N(pr.done)} of ${N(pr.total)} steps): it's where ${h} leads.`, `把${nm}视角接着做完（${N(pr.done)}/${N(pr.total)} 步）：${h}，正通向那里。`), " ", at, " ", hook.from])
        ] : [
          () => seg([adv() ? tx(`Next, I plan to try the ${nm} lens; it picks up ${h}.`, `接下来，我打算试试${nm}视角；它接着${h}往下走。`) : tx(`Next: try the ${nm} lens. It picks up ${h}.`, `下一步：试试${nm}视角，它接着${h}往下走。`), " ", at, " ", hook.from]),
          () => seg([tx(`${H} leads straight into the ${nm} lens.`, `${h}，正好通向${nm}视角。`), " ", at, " ", hook.from])
        ] });
      }
      out.push({ id: "next.plain", w: 2, v: [
        () => seg([skim ? (adv() ? tx(`Next, I plan to go back to the steps I skipped in the ${nm} lens.`, `接下来，我打算回到${nm}视角里跳过的步骤。`) : tx(`Next: go back to the steps you skipped in the ${nm} lens.`, `下一步：回到${nm}视角里跳过的步骤。`))
          : ns.resume ? (adv() ? tx(`Next, I plan to finish the ${nm} lens. I'm ${N(pr.done)} of ${N(pr.total)} steps in.`, `接下来，我打算把${nm}视角做完，目前完成了 ${N(pr.done)}/${N(pr.total)} 步。`) : tx(`Next: finish the ${nm} lens. You're ${N(pr.done)} of ${N(pr.total)} steps in.`, `下一步：把${nm}视角做完，你已完成 ${N(pr.done)}/${N(pr.total)} 步。`))
            : (adv() ? tx(`Next, I plan to try the ${nm} lens to see the same problem from another side.`, `接下来，我打算试试${nm}视角，从另一面看同一个问题。`) : tx(`Next: try the ${nm} lens to see the same problem from another side.`, `下一步：试试${nm}视角，从另一面看同一个问题。`)), " ", at])
      ] });
    }
    out.push({ id: "next.ask", w: 1, v: [
      () => seg([adv() ? tx("Next, I'd like to bring the questions under Worth talking through to a program's info session.", "接下来，我想带着“值得一起聊聊”里的问题，去参加项目说明会。") : tx("Next: bring one question from Worth talking through to a program's info session.", "下一步：从“值得一起聊聊”里挑一个问题，带去项目说明会。")])
    ] });
    return out;
  }

  /** Compose the three lines: per slot, the highest-weight claim not left out, first valid phrasing at the regen offset.
      Returns null when a slot can't be filled with checked text (the caller falls back to the deterministic copy). */
  function composeShort(R) {
    NUMS = [];
    const left = MP.state.brief.ai.left || [], regen = MP.state.brief.ai.regen || 0;
    const slots = [claimsDid(R), claimsStood(R), claimsNext(R)];
    const opts = () => ({ numbers: known(), sources: sources(R) });
    const lines = [];
    for (let si = 0; si < slots.length; si++) {
      const cands = slots[si].slice().sort((a, b) => b.w - a.w);
      const usable = cands.filter((c) => !left.includes(c.id));
      let got = null;
      for (const c of usable) {
        const r = firstValid(c.v, ((c.base != null ? c.base : AI.hash(c.id)) + regen) % c.v.length, opts);
        if (r) { got = { id: c.id, segs: r.segs, i: r.i, n: c.v.length, unsure: !!c.unsure, alts: usable.length - 1 - usable.indexOf(c) }; break; }
      }
      if (!got) { if (si === 1) continue; return null; }   // no feelings: two lines beat a padded third
      lines.push(got);
    }
    return lines;
  }

  /* ---------- I couldn't tell ---------- */
  /** Words that make a write-up's first line concrete for each lens: a funnel step or action (BA), the split / drop /
      noise (DS), the one change (AI). A first line with none of them (and no number) is one a reader can't act on. */
  const CONCRETE = {
    ba: { en: ["week 1", "week-1", "assignment", "assignments", "first lesson", "lesson", "signed up", "signup", "submitted", "completed", "completion", "email", "emails", "office hours", "deadline", "deadlines", "redesign", "funnel", "step"],
      zh: ["首周", "第一周", "作业", "首课", "报名", "提交", "完成", "邮件", "答疑", "截止", "重做", "漏斗", "哪一步"] },
    ds: { en: ["partner", "partners", "channel", "channels", "mix", "who signed up", "signups", "drop", "dropped", "noise", "wobble", "cohort", "cohorts", "half", "reweighted"],
      zh: ["合作", "渠道", "构成", "报名", "下降", "降了", "波动", "批次", "一半", "加权"] },
    ai: { en: ["threshold", "example", "examples", "definition", "definitions", "categories", "category", "confidence", "labeled"],
      zh: ["阈值", "示例", "例子", "定义", "类别", "置信", "标注"] }
  };
  const CHG = { examples: ["added 10 content examples", "补充了 10 条内容问题示例"], threshold: ["raised the confidence threshold", "提高了置信度阈值"], definition: ["rewrote the team definitions", "改写了各团队的定义"] };
  /** "I couldn't tell…" from a first line too vague to act on: quotes it, says what's missing, and offers the student's
      own earlier choice that would make it concrete. Never a judgement of the student; only what the line doesn't say. */
  function vagueLine(R, id, subj) {
    const x = R.L[id], box = FIRSTBOX[id], s = x.texts[box];
    if (!x.handed || !s) return null;
    if (AI.text.find(s, CONCRETE[id]).length || AI.text.numbers(s).some((n) => !(Number.isInteger(n.v) && n.v <= 12))) return null;
    const q = clauseOf(s, AI.text.first(s).s, { maxWords: 9, maxChars: 16 }) || (sizeOf(s) <= 9 ? inner(s.trim().replace(/[.。!！]+$/, "")) : "");
    if (!q) return null;
    const lastStep = MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, doc = C(id, lastStep, docLabel(id));
    const zhS = (subj.z === "我" ? "我" : subj.z === "孩子" ? "孩子" : "你");
    if (id === "ba") {
      const tr = x.d.tr, FS = MP.data.funnelSteps;
      if (typeof tr !== "number" || !FS[tr + 1]) return { id: "cant.vague.ba", segs: [tx("which step ", ""), { q, lens: "ba" }, tx(` is about: the ${DOCN.ba.en} doesn't name one yet.`, "指的是哪一步，建议里还没点名。")], cite: doc };
      const a = MP.t(FS[tr]), b = MP.t(FS[tr + 1]);
      return { id: "cant.vague.ba", segs: Z()
        ? [{ q, lens: "ba" }, `指的是漏斗里的哪一步，建议里没写。${zhS}在第 2 步选的是“${a}”→“${b}”，把它写进去，负责人读完就能动手。`]
        : ["which step ", { q, lens: "ba" }, ` is about: the recommendation doesn't name one. In step 2 ${subj.s} picked “${a}” → “${b}”; naming it would make the line something a lead can act on.`], cite: doc, cite2: C("ba", "funnel") };
    }
    if (id === "ds") {
      return { id: "cant.vague.ds", segs: Z()
        ? [{ q, lens: "ds" }, `的依据是什么，第一句里看不出来：没提渠道拆分，也没有数字。${zhS}在第 3 步算过，6.5 个百分点里约 3.25 个来自报名人群的变化。`]
        : ["what ", { q, lens: "ds" }, ` rests on: the summary's first line doesn't mention the channel split or a number. In step 3 ${subj.s} worked out that about 3.25 of the 6.5 points come from a change in who signed up.`], cite: doc, cite2: C("ds", "split") };
    }
    const opt = x.d.chg && x.d.chg.opt, c = CHG[opt];
    return { id: "cant.vague.ai", segs: Z()
      ? [{ q, lens: "ai" }, `指的是哪一处改动，说明里还没写。` + (c ? `${zhS}在第 3 步${c[1]}，可以直接写进第一栏。` : "")]
      : ["what changed from ", { q, lens: "ai" }, ": the note doesn't name the change yet." + (c ? ` In step 3 ${subj.s} ${c[0]}; that could go straight into the first box.` : "")], cite: doc, cite2: c ? C("ai", "change") : null };
  }
  function composeCant(R) {
    const p = P(), fam = view === "family", I = adv();
    const subj = fam ? { s: "they", S: "They", re: "they're", d: "they'd", z: "孩子" } : { s: p.s, S: p.S, re: p.re, d: p.d, z: p.z };
    const c = [];
    R.partial.forEach((id) => {
      const x = R.L[id], marks = x.steps.filter((s) => s.st.energy || s.st.hard).length;
      if (x.skim) c.push({ id: "cant.skim." + id, segs: [tx(`what ${WORK[id].en} feels like: ${subj.s} looked through ${SHn(id)} but skipped ${N(x.p.contentSkipped)} of its steps.`, `${WORK[id].zh}是什么感觉，还说不准：${subj.z}浏览了 ${SHn(id)}，但跳过了其中 ${N(x.p.contentSkipped)} 步。`)], cite: C(id, MP.firstOpenStep(id).id) });
      else c.push({ id: "cant.part." + id, segs: [tx(`whether ${subj.d} enjoy ${WORK[id].en} yet. ${cap(subj.re)} ${N(x.p.done)} of ${N(x.p.total)} steps in; ${marks ? `${fam ? "their" : p.p} ${marks === 1 ? "one mark" : N(marks) + " marks"} there ${marks === 1 ? "is" : "are"} a start, not an answer` : `none of it is marked yet`}.`,
        `${subj.z}会不会喜欢${WORK[id].zh}，现在还说不准：只做了 ${N(x.p.done)}/${N(x.p.total)} 步，${marks ? `那里的 ${N(marks)} 个标记只是开头，不是答案` : "还没有标记任何感受"}。`)], cite: C(id, MP.nextStep() && MP.nextStep().lens === id ? MP.nextStep().step : MP.firstOpenStep(id).id) });
    });
    if (!fam) R.done.forEach((id) => { const v = vagueLine(R, id, subj); if (v) c.push(v); });
    R.done.forEach((id) => {
      const x = R.L[id], marks = x.steps.filter((s) => s.st.energy || s.st.hard).length;
      if (!marks) c.push({ id: "cant.nomark." + id, segs: [tx(`how ${SHn(id)} felt to ${fam ? "them" : p.o}: none of its steps are marked, so the Brief can't say.`, `${SHn(id)} 给${subj.z}的感受如何，还说不上来：这个视角一步都没有标记。`)], cite: C(id, MP.lenses[id].steps[0].id) });
      else if (x.handed && x.words && x.words < 12 && !fam) c.push({ id: "cant.short." + id, segs: [tx(`how ${subj.s} explain ${SHn(id)} work to a reader: the ${DOCN[id].en} is ${N(x.words)} words so far.`, `还看不出${subj.z}会怎样向读者讲清 ${SHn(id)} 的工作：这份${DOCN[id].zh}目前只有 ${N(x.words)} 个字。`)], cite: C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, docLabel(id)) });
      else if (!x.handed && !fam) c.push({ id: "cant.nodoc." + id, segs: [tx(`how ${subj.s} write up ${SHn(id)} findings for a reader: that write-up is still open.`, `还看不出${subj.z}会怎么把 ${SHn(id)} 的发现写给别人看：这份交付物还没写。`)], cite: C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id) });
      else if (marks < 2) c.push({ id: "cant.thin." + id, segs: [tx(`much about ${SHn(id)}: ${fam ? "they" : subj.s} marked just one of its steps.`, `${SHn(id)} 给${subj.z}的感受，还说不上来：${subj.z}只标记了其中一步。`)], cite: C(id, MP.lenses[id].steps[0].id) });
    });
    R.ids.filter((id) => !R.done.includes(id) && !R.partial.includes(id)).forEach((id) => {
      c.push({ id: "cant.none." + id, segs: [tx(`anything about ${WORK[id].en}: ${fam ? "they haven't" : I ? "I haven't" : "you haven't"} opened that lens yet.`, `关于${WORK[id].zh}，现在什么都说不了：${subj.z}还没有打开这个视角。`)], cite: null });
    });
    c.push({ id: "cant.data", segs: [tx(`how ${fam ? "their" : p.p} marks would hold up on messier, real data. Everything here used one teaching dataset.`, `换成更杂乱的真实数据，${fam ? "孩子的" : p.z === "我" ? "我的" : "你的"}这些感受还会不会一样，现在说不准。这里用的都是同一份教学数据。`)], cite: null });
    const o = { numbers: known(), sources: sources(R) };
    const lead = fam ? tx("We can't tell ", "") : tx("I couldn't tell ", "");
    for (const x of c) { const s = seg([lead].concat(x.segs, x.cite ? [" ", x.cite] : [], x.cite2 ? [" ", x.cite2] : [])); if (AI.check(s, o).ok) return { id: x.id, segs: s }; }
    return null;
  }

  /* ---------- Worth talking through ---------- */
  function talkItems(R) {
    const p = P(), me = view === "me", fam = view === "family", out = [];
    const cite = (x) => C(x.lens, x.step.id);
    if (fam) {
      const seen = new Set();
      const add = (x, kind) => {
        if (!x || seen.has(x.lens)) return; seen.add(x.lens);
        const pl = K.plainStep(x.lens, x.step);
        const V = { hj: [[`Ask them about ${pl}: what made it tricky, and what made it fun?`, `可以和孩子聊聊${pl}这一步：哪里难，哪里好玩？`], [`They found ${pl} hard but liked it. Ask which part they'd want to try again.`, `孩子觉得${pl}难，却也喜欢。可以问问：哪一部分想再试一次？`]],
          enj: [[`Ask what they liked about ${pl}.`, `可以问问孩子：${pl}这部分，哪里吸引人？`], [`${cap(pl)} seemed to click for them. Ask them to walk you through it.`, `${pl}这部分孩子似乎很投入。可以请孩子讲讲是怎么做的。`]],
          hard: [[`Ask which part of ${pl} felt hardest, and whether it was interesting-hard or just hard.`, `可以问问孩子：${pl}哪里最难？是有意思的难，还是单纯的难？`], [`${cap(pl)} felt hard to them. Ask what would have made it easier.`, `${pl}让孩子觉得有点难。可以问问：怎样会更容易些？`]] }[kind];
        out.push({ id: "fam." + kind + "." + x.lens + "." + x.step.id, lens: x.lens, v: V.map(([en, zh]) => () => seg([tx(en, zh), " ", cite(x)])) });
      };
      R.hj.forEach((x) => add(x, "hj")); R.enjoyed.forEach((x) => add(x, "enj")); R.hard.forEach((x) => add(x, "hard"));
      if (!out.length) out.push({ id: "fam.open", lens: "", v: [() => seg([tx(`Ask which of the ${R.done.length === 1 ? "steps" : "lenses"} they'd want to do again, and why.`, `可以问问孩子：这些${R.done.length === 1 ? "步骤" : "视角"}里，哪个愿意再做一次？为什么？`)])] });
      return out;
    }
    const hjD = []; R.hj.forEach((x) => { if (!hjD.some((y) => y.lens === x.lens)) hjD.push(x); });
    if (hjD.length >= 2) {
      const a = hjD[0], b = hjD[1], ta = topic(a), tb = topic(b);
      out.push({ id: "hj2." + a.step.id + "." + b.step.id, lens: a.lens, lenses: [a.lens, b.lens], v: [
        () => seg([tx(`${QT(a)} and ${QT(b)} were both hard, and ${p.s} enjoyed both. Worth asking: if ${p.s} could have one of them taught from scratch, ${ta.skill} or ${tb.skill}, which would it be, and which courses start there?`, `${QT(a)}和${QT(b)}都有难度，${p.z}也都喜欢。可以问：${ta.skill}和${tb.skill}，如果只能从零学一样，选哪个？哪些课是从那里讲起的？`), " ", cite(a), " ", cite(b)]),
        () => seg([tx(`Two steps were hard and enjoyable at once: ${QT(a)} and ${QT(b)}. Worth asking: do ${ta.area} and ${tb.area} start from the basics, or assume them?`, `有两步${p.z}觉得又难又有意思：${QT(a)}和${QT(b)}。可以问：${ta.area}和${tb.area}，是从基础讲起，还是默认学生已经会？`), " ", cite(a), " ", cite(b)])
      ] });
    }
    R.hj.filter((x) => hjD.length < 2 || !hjD.slice(0, 2).includes(x)).forEach((x) => { const t = topic(x); out.push({ id: "hj." + x.lens + "." + x.step.id, lens: x.lens, v: [
      () => seg([tx(`${p.S} marked ${QT(x)} as enjoyed and hard. Worth asking: in ${t.area}, is ${t.skill} taught from scratch, or assumed?`, `${p.z}把${QT(x)}标成了既喜欢又有难度。可以问：${t.area}会从头讲${t.skill}，还是默认学生已经会？`), " ", cite(x)]),
      () => seg([tx(`${QT(x)} was hard, and ${p.s} enjoyed it anyway. Worth asking: do ${t.area} build up ${t.skill} from the basics?`, `${QT(x)}有难度，但${p.z}还是喜欢。可以问：${t.area}会不会从${t.skill}这些基础讲起？`), " ", cite(x)]),
      () => seg([tx(`${QT(x)} took effort and was still fun. Worth asking: how much do ${t.area} expect students to know about ${t.skill} on day one?`, `${QT(x)}费劲，但有意思。可以问：${t.area}会专门练${t.skill}，还是默认学生已经会了？`), " ", cite(x)])
    ] }); });
    R.ids.forEach((id) => {
      const dr = R.L[id].steps.filter((s) => s.st.energy === "drained");
      if (dr.length >= 2) out.push({ id: "drn." + id, lens: id, v: [
        () => seg([tx(`${N(dr.length)} ${SHn(id)} steps drained ${p.o}, including ${QT(dr[0])}. Worth asking: what does a typical week of ${WORK[id].en} look like?`, `${SHn(id)} 里有 ${N(dr.length)} 步让${p.z}有点累，比如${QT(dr[0])}。可以问：${WORK[id].zh}的一周，通常是什么样子？`), " ", cite(dr[0])]),
        () => seg([tx(`${QT(dr[0])} and ${QT(dr[1])} both left ${p.o} a bit drained. Worth asking: how much of ${WORK[id].en} is like those steps?`, `${QT(dr[0])}和${QT(dr[1])}都让${p.z}有点累。可以问：${WORK[id].zh}里，这样的环节占多少？`), " ", cite(dr[0])])
      ] });
    });
    const ba = R.L.ba, ds = R.L.ds, ai = R.L.ai;
    if (ba && ba.done && (ba.d.checks || []).includes("help")) out.push({ id: "x.help", lens: "ba", v: [
      () => seg([tx(`Before acting, ${p.d} check whether stuck learners got help in time. Worth asking: where do analytics and AI work meet in the program, and in which projects?`, `动手之前，${p.z}会先查卡住的学员有没有及时得到帮助。可以问：项目里，分析和 AI 方向在哪些课程或项目里交汇？`), " ", C("ba", "missing")]),
      () => seg([tx(`${p.S} flagged help requests as something to check before acting. Worth asking: do analytics students ever work with the people who build the models?`, `${p.z}把求助问题列为动手前要查的事。可以问：学分析的同学，会和做模型的同学一起做项目吗？`), " ", C("ba", "missing")])
    ] });
    else if (ba && ba.done && (ba.d.checks || []).includes("mix")) out.push({ id: "x.mix", lens: "ba", v: [
      () => seg([tx(`Before acting, ${p.d} check whether the mix of signups changed. Worth asking: how much statistics sits inside the analytics courses?`, `动手之前，${p.z}会先查报名人群的构成有没有变。可以问：分析类课程里，统计内容占多少？`), " ", C("ba", "missing")]),
      () => seg([tx(`${p.S} wanted to know who signed up before acting. Worth asking: where do business analytics and statistics meet in the program?`, `${p.z}想先弄清是谁来报名的，再动手。可以问：项目里商业分析和统计在哪里交汇？`), " ", C("ba", "missing")])
    ] });
    if (ds && ds.done && ds.d.next) out.push({ id: "x.ds", lens: "ds", v: [
      () => seg([ds.d.next === "funnel" ? tx(`After DS, ${p.d} look at which funnel step fell. Worth asking: do data science and analytics students share projects?`, `DS 之后，${p.z}会去看漏斗里哪一步变差了。可以问：数据科学和商业分析的同学会一起做项目吗？`)
        : tx(`After DS, ${p.d} check whether stuck learners got help. Worth asking: where do statistics and AI courses overlap?`, `DS 之后，${p.z}会去查卡住的学员有没有得到帮助。可以问：统计课和 AI 课在哪里有重叠？`), " ", C("ds", "conclude")])
    ] });
    if (ai && ai.done && ai.d.err && ai.d.err.pattern === "content") out.push({ id: "x.ai", lens: "ai", v: [
      () => seg([tx(`${p.S} traced most router mistakes to content questions sent to Tech support. Worth asking: how often do AI courses start from real user messages?`, `${p.z}发现分流器的错误大多是内容问题被分到了技术支持。可以问：AI 课程多久会用真实的用户消息来做练习？`), " ", C("ai", "errors")])
    ] });
    R.ids.forEach((id) => { if (R.L[id].revised) out.push({ id: "rev." + id, lens: id, v: [
      () => seg([tx(`${p.S} revised ${p.p} ${DOCN[id].en} after a second read. Worth asking: how much writing for non-technical readers is in the capstone?`, `${p.z}按批注改了${DOCN[id].zh}。可以问：毕业项目里，为非技术读者写作的部分有多少？`), " ", C(id, MP.lenses[id].steps[MP.lenses[id].steps.length - 1].id, docLabel(id))])
    ] }); });
    if (me) R.ids.forEach((id) => { if (R.L[id].none) out.push({ id: "none." + id, lens: id, v: [
      () => seg([tx(`In ${SHn(id)}, no step felt like every-week work. Worth talking through: was it the LumenLearn problem, or the kind of work?`, `在 ${SHn(id)} 里，没有哪一步让你想每周都做。值得聊聊：是 LumenLearn 这个问题，还是这类工作本身？`), " ", CR(id)])
    ] }); });
    R.hard.filter((x) => x.st.energy !== "enjoyed").forEach((x) => { const t = topic(x); out.push({ id: "hard." + x.lens + "." + x.step.id, lens: x.lens, v: [
      () => seg([tx(`${p.S} found ${QT(x)} hard. Worth asking: how much of ${t.area} is ${t.skill}, and what support is there?`, `${p.z}觉得${QT(x)}有难度。可以问：${t.area}里，${t.skill}占多少？有什么辅导？`), " ", cite(x)]),
      () => seg([tx(`${QT(x)} felt hard. Worth asking: is there a bridge course for ${t.skill} before ${t.area} begin?`, `${QT(x)}感觉有难度。可以问：开${t.area}之前，有没有${t.skill}的衔接课？`), " ", cite(x)])
    ] }); });
    R.enjoyed.filter((x) => !x.st.hard).forEach((x) => { const t = topic(x); out.push({ id: "enj." + x.lens + "." + x.step.id, lens: x.lens, v: [
      () => seg([tx(`${p.S} enjoyed ${QT(x)}. Worth asking: which courses go deeper into ${t.skill}?`, `${p.z}喜欢${QT(x)}。可以问：哪些课程会更深入地讲${t.skill}？`), " ", cite(x)]),
      () => seg([tx(`${QT(x)} was one ${p.s} liked. Worth asking: how much of the program looks like ${t.skill}?`, `${QT(x)}是${p.z}喜欢的一步。可以问：项目里像${t.skill}这样的内容有多少？`), " ", cite(x)])
    ] }); });
    return out;
  }
  /** Top 3 not hidden, at most one per lens while other lenses still have items. */
  function pickTalk(R) {
    const hidden = MP.state.brief.ai.hidden || [], all = talkItems(R).filter((x) => !hidden.includes(view + ":" + x.id));
    const o = () => ({ numbers: known(), sources: sources(R) });
    const chosen = [], used = new Set();
    const tryAdd = (x) => {
      if (chosen.length >= 3 || chosen.some((c) => c.id === x.id)) return;
      const key = "brief.talk." + view + "." + x.id, r = firstValid(x.v, AI.variant(key, x.v.length, AI.hash(x.id) + chosen.length), o);
      if (r) { chosen.push({ id: x.id, key, segs: r.segs, i: r.i, n: x.v.length }); (x.lenses || [x.lens]).forEach((l) => used.add(l)); }
    };
    all.forEach((x) => { if (!used.has(x.lens)) tryAdd(x); });
    all.forEach((x) => tryAdd(x));
    return chosen;
  }

  /* ---------- rendering ---------- */
  const capFor = {};   // a view switch / leave-out re-streams quickly (≤ 0.8s); a fresh draft gets the full 3.2s
  function traceItems(R) {
    const fam = view === "family", I = adv();
    if (I) return [tx("Your Brief", "你的小结"), tx("Advisor voice · first person", "顾问版 · 第一人称"), tx("Private notes left out", "略去私人记录")];
    if (fam) return [tx("Your Brief", "你的小结"), tx("Family voice · plain words", "家人版 · 通俗说法"), tx("Private notes left out", "略去私人记录")];
    const it = [];
    const marked = R.marked.length, docs = R.done.filter((id) => R.L[id].handed), refl = R.ids.filter((id) => R.L[id].pick || R.L[id].none || R.L[id].note), fol = R.ids.filter((id) => R.L[id].follow);
    if (marked) it.push({ label: tx(`${marked} ${marked === 1 ? "step" : "steps"} you marked`, `你标记的 ${marked} 步`), src: "bf-src-feel" });
    docs.forEach((id) => it.push({ label: tx(`Your ${DOC[id].en} · ${R.L[id].words} ${MP.ai.text.lang(Object.values(R.L[id].texts).join(" ")) === "zh" ? "chars" : "words"}`, `你的${DOC[id].zh} · ${R.L[id].words} ${MP.ai.text.lang(Object.values(R.L[id].texts).join(" ")) === "zh" ? "字" : "词"}`), src: "bf-src-" + id }));
    if (refl.length) it.push({ label: tx(`${refl.length} ${refl.length === 1 ? "reflection" : "reflections"}`, `${refl.length} 条回顾`), src: "bf-src-refl-" + refl[0] });
    if (fol.length) it.push({ label: tx(`${fol.length} follow-up${fol.length === 1 ? "" : "s"}`, `${fol.length} 个追问`) });
    const ns = MP.nextStep(); if (ns) it.push(tx("Your next step", "你的下一步"));
    return it.slice(0, 6);
  }
  /** "What it read": every input the draft used, by lens. Private inputs only in My Brief. */
  function readList(R) {
    const me = view === "me";
    const rows = R.ids.filter((id) => R.L[id].done || R.partial.includes(id)).map((id) => {
      const x = R.L[id], bits = [];
      const m = x.steps.filter((s) => s.st.energy || s.st.hard).length;
      bits.push(tx(`${x.steps.filter((s) => s.st.done).length} steps done`, `完成 ${x.steps.filter((s) => s.st.done).length} 步`));
      if (m) bits.push(tx(`${m} marked`, `标记 ${m} 处`));
      if (x.handed) bits.push(tx(`your ${DOCN[id].en}, ${Object.keys(x.texts).length} ${Object.keys(x.texts).length === 1 ? "box" : "boxes"}`, `你的${DOCN[id].zh}，${Object.keys(x.texts).length} 栏`));
      if (me && (x.pick || x.none)) bits.push(tx("your reflection pick", "回顾时的选择"));
      if (me && x.note) bits.push(tx("your reflection note", "回顾里写的话"));
      if (me && x.follow) bits.push(tx("your follow-up answer", "追问的回答"));
      return `<li>${MP.h.lensTag(id, { short: true })}<span>${bits.map(esc).join(" · ")}</span></li>`;
    });
    return `<details class="bf-ai-read"><summary>${T("What it read", "它读了什么")}</summary><ul>${rows.join("")}</ul>${me ? "" : `<p>${T("Hint use, reflections and follow-ups are left out of this view.", "这个版本不读提示使用、回顾和追问。")}</p>`}</details>`;
  }
  /** The ink In-short strip, drafted from the record. Falls back to the deterministic copy if anything fails. */
  function aiShort(done, F) {
    if (!AI || !AI.block) return inShort(done, F);
    let R, lines;
    try { R = REC = record(); lines = composeShort(R); } catch (e) { console.warn("brief draft failed", e); lines = null; }
    if (!lines || !lines.length) return inShort(done, F);
    const key = "brief.short." + view, regen = MP.state.brief.ai.regen || 0;
    const fp = AI.fp([R.sig, view, lines.map((l) => l.id + ":" + l.i), MP.state.brief.ai.left || []]);
    const fam = view === "family", I = adv();
    const traceDone = I ? T("Rewritten for an advisor · first person", "改写给顾问 · 第一人称") : fam ? T("Rewritten for family · plain words", "改写给家人 · 通俗说法") : T("Drafted from your work · every line links to its source", "据你的作答起草 · 每句都可追溯");
    const n = lines.reduce((a, l) => Math.max(a, l.n), 1);
    const left = (MP.state.brief.ai.left || []);
    const bar = `<div class="bf-ai-bar no-print">${AI.actions({ regen: ["bf-ai-regen", view], count: { en: `${(regen % n) + 1} of ${n}`, zh: `${(regen % n) + 1}/${n}` }, labels: { regen: { en: "Another wording", zh: "换个说法" } } }).replace('<div class="rd-acts">', '<div class="rd-acts bf-ai-acts">').replace(/<\/div>$/, "")}
        ${left.length ? `<button type="button" class="rd-act bf-ai-restore" data-action="bf-ai-restore" data-fk="bf-ai-restore">${MP.t({ en: `Bring back left-out lines (${left.length})`, zh: `恢复不写的句子（${left.length}）` })}</button>` : ""}</div>${readList(R)}</div>`;
    let html = AI.block({ key, fp, kind: "ink", live: false, trace: traceItems(R), traceDone, body: lines.map((l) => l.segs), cap: capFor[key] || 3200, wait: !capFor[key], actions: bar, cls: "bf-ai-short", label: T("In short, drafted from your work", "简而言之：据你的作答起草") });
    // the kit lays out paragraphs; the Brief numbers them 01–03 with a quiet per-line "Leave out"
    let i = 0, j = 0;
    html = html.replace('<div class="rd-body">', '<div class="rd-body"><ol class="bf-sl">')
      .replace(/<p class="rd-p">/g, () => { const l = lines[i++]; return `<li class="${l && l.unsure ? "bf-sl-unsure" : ""}" style="--n:${i - 1}"><span class="n" aria-hidden="true">${pad2(i)}</span><div class="t"><p class="rd-p">`; })
      .replace(/<\/p>/g, () => { const l = lines[j++]; const btn = l && l.alts > 0 ? `<button type="button" class="bf-left no-print" data-action="bf-ai-left" data-arg="${esc(l.id)}" data-fk="bf-left:${esc(l.id)}">${T("Leave out", "不写这句")}</button>` : ""; return `</p></div>${btn}</li>${j === lines.length ? "</ol>" : ""}`; });
    html = amerH(html);
    return `<div class="bf-short on-ink is-ai" role="region" aria-labelledby="bf-short-h">
      <div class="bf-short-h"><i class="bf-tri" aria-hidden="true"></i><span class="ld-label" id="bf-short-h">${T("In short", "简而言之")}</span></div>
      ${html}</div>`;
  }
  function aiCant() {
    if (!AI || !REC) return "";
    let r = null; try { r = composeCant(REC); } catch (e) { r = null; }
    if (!r) return "";
    return amerH(AI.block({ key: "brief.cant." + view, fp: AI.fp([REC.sig, view, r.id]), kind: "line", live: false, unsure: true, kicker: T("Not sure yet", "还说不准"), body: r.segs, cls: "bf-cant-ai" }));
  }
  function aiTalk(n) {
    if (!AI || !REC) return "";
    let items = []; try { items = pickTalk(REC); } catch (e) { items = []; }
    if (!items.length) return "";
    const fam = view === "family";
    const li = items.map((x, k) => `<li class="bf-talk-i"><span class="bf-n" aria-hidden="true">${pad2(k + 1)}</span>${amerH(AI.block({ key: x.key, fp: AI.fp([REC.sig, x.id, x.i]), kind: "line", live: false, body: x.segs,
      actions: AI.actions({ regen: x.n > 1 ? ["bf-talk-regen", x.key] : null, count: x.n > 1 ? { en: `${((AI.state().regen[x.key] || 0) % x.n) + 1} of ${x.n}`, zh: `${((AI.state().regen[x.key] || 0) % x.n) + 1}/${x.n}` } : null, dismiss: ["bf-talk-hide", x.id] }), cls: "bf-talk-b" }))}</li>`).join("");
    const title = fam ? T("Things you could ask them about", "可以和孩子聊聊的话题") : T("Worth talking through", "值得一起聊聊");
    const intro = fam ? T("Drawn from what they marked. Questions, not conclusions.", "根据孩子的标记整理。是问题，不是结论。")
      : adv() ? T("Questions I'd like to bring to an advising conversation, each tied to something I did.", "我想在咨询时聊的问题，每一条都来自我做过的事。")
        : T("Questions for an advising conversation, each tied to something you did. Field-level, not about any one program.", "可以带去咨询的问题，每一条都来自你做过的事。说的是领域整体，不针对某个项目。");
    return section(n, title, intro, `<ol class="bf-talk">${li}</ol>`, "bf-talk-sec", AI.mark() + MP.t({ en: "Questions", zh: "问题" }));
  }

  MP.on("bf-ai-regen", () => { const b = MP.state.brief.ai; b.regen = (b.regen || 0) + 1; AI.bump("brief.short." + view); MP.commit(); });
  const focusSel = (...sels) => { for (const q of sels) { const f = document.querySelector(q); if (f) { if (!f.matches("button, a, [tabindex]")) f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); return; } } };
  MP.on("bf-ai-left", (el, id) => { const b = MP.state.brief.ai; b.left = (b.left || []).concat(id); capFor["brief.short." + view] = 900; MP.commit(); focusSel(".bf-left", "[data-fk='bf-ai-restore']", ".bf-short"); });
  MP.on("bf-ai-restore", () => { MP.state.brief.ai.left = []; capFor["brief.short." + view] = 900; MP.commit(); });
  MP.on("bf-talk-regen", (el, key) => { AI.bump(key); MP.commit(); });
  MP.on("bf-talk-hide", (el, id) => { const b = MP.state.brief.ai; b.hidden = (b.hidden || []).concat(view + ":" + id); MP.commit(); focusSel(".bf-talk [data-action='bf-talk-hide']", ".bf-talk-sec"); });

  /* ---------------- page ---------------- */
  MP.pages.brief = {
    render() {
      const done = K.complete();
      if (!done.length) return empty();
      const partial = K.started();
      const fam = view === "family";
      const all = done.concat(partial);
      const F = K.feel(all);
      let body;
      const short = aiShort(done, F);   // composes first: it gathers the record the later AI blocks read
      if (fam) body = familyBody(done, partial, F);
      else {
        const shows = secShows(3, F), n = shows ? 4 : 3;
        body = secDid(done, partial) + secStood(all, F) + shows + secCant(n) + secNext(n + 1, done, F) + aiTalk(n + 2);
      }
      return `<div class="container pg-brief view-${view}"><div class="bf-wrap">
        ${toolbar(done)}
        <div class="bf-paper"><article class="bf-sheet ld-ticks" aria-label="${esc(fam ? T("Family view of the Brief", "小结（家人版）") : adv() ? T("A student's Brief, advisor view", "学生小结（顾问版）") : T("My Brief", "我的小结"))}">
          ${index(done)}
          ${adv() ? `<div class="bf-band"><span class="ld-label">${T("Advisor copy", "顾问版")}</span>${T("Shared with an advisor. Some private notes are left out.", "与顾问分享的版本，部分私人记录未包含在内。")}${MP.pages.school ? `<span class="bf-band-l no-print">${MP.h.quiet(T("How an advising office sees a cohort", "看看顾问办公室怎么看一个年级") + " →", "go", "#/school")}</span>` : ""}</div>` : ""}
          ${masthead(done, partial, F)}
          ${short}
          <div class="bf-secs">${body}</div>
          ${sheetFoot()}
        </article></div>
      </div></div>`;
    }
  };
})();
