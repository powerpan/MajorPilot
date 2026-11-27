/* MajorPilot redesign — core: state, i18n, router, events, components, lens shell.
   Pages register in MP.pages; lenses register in MP.lenses (see CONTRACT.md). */
(function () {
  "use strict";
  const MP = window.MP = window.MP || {};
  const KEY = "mp-redesign-v1";

  /* ================= state ================= */
  function fresh() {
    return {
      v: 1, lang: "en",
      qs: { fields: [], ask: "" },          // quick start
      profile: { stage: "", background: "", regions: [] }, // optional "tell us more"
      recommended: "",                        // lens id suggested by quick start
      account: null,                          // {email} once the student chooses to save
      lenses: {},                             // id -> lens state (see MP.ls)
      brief: { removed: [], notes: [], ai: { left: [], regen: 0, hidden: [] } },
      // AI layer (AI-LAYER.md §3): what has been shown (fp per key), regenerate counters, feedback, tone/length,
      // dashboard rotation. Local to this device; never shown to advisors, family or programs.
      ai: { seen: {}, regen: {}, fb: {}, prefs: { tone: "gentle", length: "short" }, dash: { shown: [], hidden: [] } },
      ui: { folds: {} }
    };
  }
  /** Fill nested defaults that a shallow merge of an older saved state would miss. */
  function normalize(s) {
    const f = fresh();
    s.brief = Object.assign({}, f.brief, s.brief || {}); s.brief.ai = Object.assign({}, f.brief.ai, s.brief.ai || {});
    s.ai = Object.assign({}, f.ai, s.ai || {}); s.ai.prefs = Object.assign({}, f.ai.prefs, s.ai.prefs || {}); s.ai.dash = Object.assign({}, f.ai.dash, s.ai.dash || {});
    s.ui = Object.assign({}, f.ui, s.ui || {});
    return s;
  }
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 1 ? normalize(Object.assign(fresh(), s)) : null; } catch (e) { return null; } }
  MP.state = load() || fresh();
  MP.saveOk = true;
  MP.save = function () { try { localStorage.setItem(KEY, JSON.stringify(MP.state)); MP.saveOk = true; } catch (e) { MP.saveOk = false; } MP.savedAt = Date.now(); };
  MP.commit = function (opts) { MP.save(); MP.render(opts); };
  MP.resetState = function (keepLang) { const l = MP.state && MP.state.lang; MP.state = fresh(); if (keepLang && l) MP.state.lang = l; MP.save(); };

  /** Lens state, created on demand. Lens modules keep their own inputs in ls.data. */
  MP.ls = function (id) {
    const L = MP.state.lenses;
    if (!L[id]) L[id] = { cur: null, visited: [], steps: {}, data: {}, refl: { pick: "", note: "", follow: null }, startedAt: null, completedAt: null };
    return L[id];
  };
  // ask: the AI-2 "Ask about this step" turns [{chip, v, lv}] (askOpen / askN: the card's open state and open count)
  MP.st = function (lensId, stepId) { const ls = MP.ls(lensId); return ls.steps[stepId] || (ls.steps[stepId] = { done: false, skipped: false, energy: "", hard: false, hints: 0, ask: [] }); };

  /* ================= i18n ================= */
  MP.lang = () => MP.state.lang === "zh" ? "zh" : "en";
  MP.t = function (x) {
    if (x == null) return "";
    if (typeof x === "string" || typeof x === "number") return String(x);
    const l = MP.lang();
    return x[l] != null ? x[l] : (x.en != null ? x.en : "");
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** Translate + turn [[term]] / [[term|label]] into glossary buttons. Copy may contain trusted HTML. */
  MP.fmt = function (x) {
    return MP.t(x).replace(/\[\[(\w+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const g = MP.glossary && MP.glossary[id];
      if (!g) return label || id;
      return `<button type="button" class="term" data-action="term" data-arg="${id}">${label || MP.t(g.w).replace(/\s*\(.*\)|（.*）/, "").toLowerCase()}</button>`;
    });
  };
  MP.UI = {
    explore: { en: "Explore", zh: "探索专业" },
    progress: { en: "My progress", zh: "我的进度" },
    brief: { en: "My Brief", zh: "我的小结" },
    saved: { en: "Saved on this device", zh: "已保存在本设备" },
    savedAcct: { en: "Saved to your account", zh: "已保存到账户" },
    backToSkipped: { en: "Back to a skipped step", zh: "回到跳过的步骤" },
    notSaved: { en: "Not saved", zh: "未保存" },
    saveProgress: { en: "Use on another device", zh: "在其他设备继续" },
    saveShort: { en: "Sync", zh: "同步" },
    back: { en: "Back", zh: "上一步" },
    cont: { en: "Continue", zh: "继续" },
    skip: { en: "Skip for now", zh: "先跳过" },
    leave: { en: "Save & leave", zh: "保存并离开" },
    needHint: { en: "Need a hint?", zh: "需要提示？" },
    moreHelp: { en: "More help", zh: "更多帮助" },
    showExample: { en: "Show me an example", zh: "看一个示例" },
    hintLv: [{ en: "Nudge", zh: "提醒" }, { en: "Pointer", zh: "指向" }, { en: "Example", zh: "示例" }],
    feel: { en: "How did that feel?", zh: "这一步感觉如何？" },
    optional: { en: "optional", zh: "可选" },
    feelings: { enjoyed: { en: "Enjoyed it", zh: "喜欢" }, neutral: { en: "Neutral", zh: "一般" }, drained: { en: "Drained me", zh: "有点累" } },
    hard: { en: "This felt hard", zh: "这一步有点难" },
    stepOf: { en: "Step {a} of {b}", zh: "第 {a} 步，共 {b} 步" },
    railFoot: { en: "Stop whenever you like. Your work saves itself, and nothing here is graded.", zh: "随时可以停下，进度会自动保存。这里的一切都不打分。" },
    practitioners: { en: "What practitioners weigh", zh: "从业者会怎么权衡" },
    commonTrap: { en: "A common trap", zh: "常见误区" },
    minutes: { en: "about {n} min", zh: "约 {n} 分钟" },
    stopAnytime: { en: "stop anytime", zh: "随时可停" },
    lensComplete: { en: "Lens complete", zh: "这个视角完成了" },
    seeBrief: { en: "See my Brief", zh: "查看我的小结" },
    tryNext: { en: "Try the {x} lens next", zh: "接着试试 {x} 视角" },
    continueLens: { en: "Continue the {x} lens", zh: "继续 {x} 视角" },
    downloadData: { en: "Download the data (CSV)", zh: "下载数据（CSV）" },
    reflectTitle: { en: "Quick reflection", zh: "快速回顾" },
    reflectLead: { en: "Two quick, optional questions. Only you see the answers.", zh: "两个简单的可选问题，只有你能看到答案。" },
    reflectQ: { en: "Which part would you want to do every week?", zh: "哪一部分你愿意每周都做？" },
    reflectNone: { en: "None of these, really", zh: "都不太想" },
    reflectNote: { en: "Anything you noticed? One sentence is plenty.", zh: "有什么感受？一句话就够了。" },
    gotIt: { en: "Got it", zh: "知道了" },
    reset: { en: "Reset demo", zh: "重置演示" },
    sample: { en: "Load sample student", zh: "载入示例学生" },
    mainNav: { en: "Main", zh: "主导航" },
    language: { en: "Language", zh: "语言" },
    lensNotFound: { en: "We couldn't find that lens.", zh: "没有找到这个视角。" },
    renderError: { en: "Something went wrong showing this page. Your work is still saved.", zh: "这个页面显示出错了，你的进度仍然保存着。" },
    keepWork: { en: "Keep my work", zh: "保留我的进度" }
  };
  MP.ui = (k, vars) => { let s = MP.t(MP.UI[k]); if (vars) Object.keys(vars).forEach((v) => { s = s.replace("{" + v + "}", vars[v]); }); return s; };

  /* ================= formatting ================= */
  MP.n = (x, d) => Number(x).toLocaleString(MP.lang() === "zh" ? "zh-CN" : "en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  MP.pct = (x, d) => MP.n(x * 100, d == null ? 1 : d) + "%";

  /* ================= components ================= */
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const DL = '<svg class="ico-dl" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>';
  /** Shared slider: paints the lens-colored fill up to the thumb (input[type=range].mp-range). */
  MP.rangeFill = function (el) {
    const min = +el.min || 0, max = el.max === "" ? 100 : +el.max, v = +el.value;
    el.style.setProperty("--fill", (max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) * 100 : 0) + "%");
  };
  const attrs = (o) => Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(" ");
  MP.h = {
    esc,
    /** Black CTA with blue (or lens-colored) edge and round arrow. One per screen. */
    primary(label, action, arg, o) { o = o || {}; return `<button class="btn-primary ${o.sm ? "sm" : ""} ${o.lens ? "lens-" + o.lens : ""}" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": o.fk || action + ":" + (arg || ""), disabled: o.disabled })}><span>${label}</span><span class="arrow">${ARROW}</span></button>`; },
    secondary(label, action, arg, o) { o = o || {}; return `<button class="btn-secondary ${o.sm ? "sm" : ""}" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": o.fk || action + ":" + (arg || "") })}>${label}</button>`; },
    link(label, action, arg) { return `<button class="btn-link" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": action + ":" + (arg || "") })}>${label}</button>`; },
    quiet(label, action, arg) { return `<button class="btn-quiet" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": action + ":" + (arg || "") })}>${label}</button>`; },
    chip(label, action, arg, pressed, o) { o = o || {}; return `<button class="chip ${o.sm ? "sm" : ""}" aria-pressed="${!!pressed}" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": action + ":" + arg })}>${o.dot ? `<span class="dot" style="background:${o.dot}"></span>` : ""}${label}</button>`; },
    /** Radio-like (or multi) option card. */
    option(label, sub, action, arg, pressed, o) { o = o || {}; return `<button class="option ${o.multi ? "multi" : ""} ${o.cls || ""}" role="${o.multi ? "checkbox" : "radio"}" aria-checked="${!!pressed}" aria-pressed="${!!pressed}" ${attrs({ "data-action": action, "data-arg": arg, "data-fk": action + ":" + arg, disabled: o.disabled })}><span class="mark"></span><span>${label}${sub ? `<span class="sub">${sub}</span>` : ""}</span></button>`; },
    seg(items, action, value) { return `<div class="seg" role="group">${items.map(([v, l]) => `<button aria-pressed="${v === value}" data-action="${action}" data-arg="${esc(v)}" data-fk="${action}:${esc(v)}">${l}</button>`).join("")}</div>`; },
    notice(html, kind) { return `<div class="notice ${kind || ""}">${html}</div>`; },
    /** Evidence mark: did (you did it) · said (your words) · src (source) · limit (limitation). */
    ev(kind) {
      const tips = { did: { en: "What you did", zh: "你的操作" }, said: { en: "Your own words", zh: "你的自述" }, src: { en: "Linked source", zh: "有出处" }, limit: { en: "Limitation", zh: "边界" } };
      const sym = { did: "✓", said: "“", src: "↗", limit: "!" };
      return `<span class="ev ${kind}" tabindex="0" data-tip="${esc(MP.t(tips[kind]))}" aria-label="${esc(MP.t(tips[kind]))}">${sym[kind]}</span>`;
    },
    stat(k, v, s) { return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`; },
    /** Remembered fold. key must be unique per page. */
    fold(key, summary, body, o) { o = o || {}; const open = MP.state.ui.folds[key] != null ? MP.state.ui.folds[key] : !!o.open; return `<details class="fold ${o.boxed ? "boxed" : ""}" data-fold="${esc(key)}" ${open ? "open" : ""}><summary>${summary}</summary><div class="fold-body">${body}</div></details>`; },
    lensTag(id, o) { const i = MP.lensInfo[id]; return `<span class="lens-tag ${id}"><i></i>${i.short}${o && o.short ? "" : `<span class="full">· ${MP.t(i.name)}</span>`}</span>`; },
    field(id, label, value, o) { o = o || {}; return `<div class="field"><label for="${id}">${label}${o.optional ? `<span class="opt">${MP.ui("optional")}</span>` : ""}</label><textarea class="textarea" id="${id}" rows="${o.rows || 3}" ${attrs({ "data-input": o.input, "data-arg": o.arg, placeholder: o.placeholder })}>${esc(value || "")}</textarea></div>`; },
    arrow: ARROW,
    /** Figure caption row: mono label left, "TEACHING DATA" pill right (pass pill=false to drop it). */
    /** Keep a caption's "FIG. 2 ·" prefix and hyphenated tokens ("28-day") on one line, so phone captions never break mid-token. */
    capLabel(label) {
      label = String(label);
      if (label.includes("<")) return label;          // already marked up: leave it alone
      return label.replace(/(^|\s)([A-Za-z0-9]+-[A-Za-z0-9-]+)/g, '$1<span class="nowrap">$2</span>').replace(/^((?:Fig\.|图)\s*\d+\s*·)\s*/, '<span class="nowrap">$1</span> ');
    },
    figCap(label, pill) {
      const p = pill === false ? "" : pill == null ? MP.t({ en: "Teaching data", zh: "教学数据" }) : pill;
      return `<div class="ld-cap"><span class="ld-label">${MP.h.capLabel(label)}</span>${p ? `<span class="ld-pill">${p}</span>` : ""}</div>`;
    },
    /** 27.0% → 20.5% readout (computed from MP.data). o: {size: ""|"md"|"pull", from, to (fractions), count: bool, cls} */
    readout(o) {
      o = o || {};
      const a = MP.pct(o.from != null ? o.from : MP.live.earlier, 1), b = MP.pct(o.to != null ? o.to : MP.live.recent, 1);
      const c = o.count ? ' data-ld-count' : "";
      return `<span class="ld-readout ${o.size || ""} ${o.cls || ""}"><span${c}>${a}</span><svg class="ar" viewBox="0 0 32 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1,10 H30 M23,3 L30,10 L23,17"/></svg><span class="sr-only">${MP.t({ en: " to ", zh: " 降至 " })}</span><em${o.count ? ` data-ld-count data-ld-from="${(o.from != null ? o.from : MP.live.earlier) * 100}" data-ld-delay="500"` : ""}>${b}</em></span>`;
    },
    /** Chapter opener: ruled top, italic orange numeral, mono kicker, title. o: {tag:"h2", cls:"h1", id, aside} */
    chapter(no, kicker, title, o) {
      o = o || {}; const tag = o.tag || "h2";
      return `<header class="ch-open ${o.wrap || ""}"><span class="ch-no" aria-hidden="true">${esc(no)}</span><span class="ld-label">${kicker}</span><${tag} class="${o.cls || "h1"} ch-t"${o.id ? ` id="${esc(o.id)}"` : ""}>${title}</${tag}>${o.aside ? `<p class="ch-aside">${o.aside}</p>` : ""}</header>`;
    },
    /** The Brief as a small paper sheet — the same picture everywhere it is previewed (home, dashboard).
        Real masthead ("MajorPilot · Brief", title, lenses lit in the split mark), then a miniature ink "In short" strip
        numbered 01/02/03 in the lens on-ink colours, then the real section heads.
        o: {lines: [html, html, html] (the real In-short lines; omit/[] → ghost bars), lit: [lens ids], tag: html (pill),
            size: ""|"sm", title, cls} */
    briefSheet(o) {
      o = o || {};
      const lit = o.lit || [], lines = (o.lines || []).slice(0, 3), ghost = !lines.length;
      const bar = (w) => `<span class="bs-ghost" style="width:${w}%"></span>`;
      const rows = ghost ? [[86, 50], [72], [80, 38]].map((ws) => `<span class="bs-g">${ws.map(bar).join("")}</span>`) : lines;
      const heads = [{ en: "What you did", zh: "你做了什么" }, { en: "What stood out to you", zh: "让你印象深的地方" }, { en: "What this can't tell you", zh: "这说明不了什么" }];
      return `<div class="ld-bsheet ${o.size || ""} ${ghost ? "is-ghost" : ""} ${o.cls || ""}">
        <div class="bs-top"><span class="bs-brand">MajorPilot <span aria-hidden="true">·</span> ${MP.t({ en: "Brief", zh: "小结" })}</span>${o.tag ? `<span class="ld-pill">${o.tag}</span>` : ""}</div>
        <div class="bs-mast"><span class="bs-title">${o.title || MP.t({ en: "My Brief", zh: "我的小结" })}</span>${MP.draw.splitMark(lit, { cls: "bs-mark" })}</div>
        <div class="bs-short on-ink"><div class="bs-short-h"><i aria-hidden="true"></i><span class="ld-label">${MP.t({ en: "In short", zh: "简而言之" })}</span></div>
          <ol>${rows.map((r, i) => `<li><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${r}</span></li>`).join("")}</ol></div>
        <div class="bs-heads">${heads.map((x) => `<span>${MP.t(x)}</span>`).join("")}</div>
      </div>`;
    },
    /** A lens glyph in its dot-grid box, with its computed caption. o: {cap: false | html, reveal: true} */
    glyphBox(id, o) {
      o = o || {};
      const cap = o.cap === false ? "" : o.cap || MP.draw.glyphCap(id);
      return `<figure class="ld-glyph ${o.reveal === false ? "" : "ld-reveal"}" style="margin:0"><span class="ld-gbox ld-grid">${MP.draw.glyph(id)}</span>${cap ? `<figcaption class="ld-gcap">${cap}</figcaption>` : ""}</figure>`;
    }
  };

  /* ================= living data: derived numbers, motion helpers, code-drawn marks ================= */
  (function live() {
    const D = MP.data, L = MP.live = {};
    const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
    L.rates = D.cohorts.map((c) => c.completed / c.signups);
    L.earlier = sum(D.cohorts.slice(0, 6), "completed") / sum(D.cohorts.slice(0, 6), "signups");   // .270
    L.recent = sum(D.cohorts.slice(6), "completed") / sum(D.cohorts.slice(6), "signups");          // .205
    L.drop = (L.earlier - L.recent) * 100;                                                          // 6.5 points
    L.signups = sum(D.cohorts, "signups");                                                          // 10,800
    L.maxSignups = Math.max(...D.cohorts.map((c) => c.signups));
    L.router = D.router.baseline;
    L.routerTotal = L.router.auto + L.router.human;                                                 // 200
    L.partner = [D.cohorts[0].partnerShare, D.cohorts[D.cohorts.length - 1].partnerShare];          // .24 → .56
    const F = D.funnel;
    L.trans = F.recent.slice(0, -1).map((_, i) => ({ i, rE: F.earlier[i + 1] / F.earlier[i], rR: F.recent[i + 1] / F.recent[i] }));
    L.leak = L.trans.reduce((b, t) => (t.rR - t.rE < b.rR - b.rE ? t : b), L.trans[0]);           // biggest fall in rate

    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    L.motionOK = () => !mq.matches;

    /** Count every number inside el to its real value, keeping the element's own formatting (1,234 · 20.5% · zh text).
        The final text is the element's current text, so a stopped tween still reads correctly. Snaps to the end under
        reduced motion or whenever animations are disabled (checks a dummy "ld-tick" animation every frame).
        o: {from: number | number[] (start values, default 0), delay: ms, dur: ms} */
    L.tick = function (el, o) {
      if (!el || el.__ldTick) return;
      o = o || {};
      const nodes = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n; while ((n = walk.nextNode())) if (/\d/.test(n.nodeValue)) nodes.push({ n, text: n.nodeValue });
      if (!nodes.length) return;
      const RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
      let k = 0;
      const froms = [].concat(o.from == null ? 0 : o.from);
      nodes.forEach((x) => {
        x.parts = [];
        x.text.replace(RE, (m) => { const dec = (m.split(".")[1] || "").length; x.parts.push({ m, v: +m.replace(/,/g, ""), dec, comma: m.includes(","), f: +froms[Math.min(k++, froms.length - 1)] || 0 }); return m; });
      });
      const dur = o.dur || 900, delay = o.delay || 0;
      el.__ldTick = true;
      el.classList.add("ld-ticking");
      el.style.setProperty("--ld-tick-dur", (delay + dur) + "ms");
      const fmt = (p, v) => { let s = v.toFixed(p.dec); if (p.comma) s = Number(s).toLocaleString("en-US", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }); return s; };
      const paint = (q) => nodes.forEach((x) => { let j = 0; x.n.nodeValue = x.text.replace(RE, () => { const p = x.parts[j++]; return q >= 1 ? p.m : fmt(p, p.f + (p.v - p.f) * q); }); });
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const t0 = performance.now();
      const done = () => { paint(1); el.classList.remove("ld-ticking"); el.__ldTick = false; };
      const frame = (now) => {
        if (!el.isConnected) return;
        if (!L.motionOK() || getComputedStyle(el).animationName === "none") { done(); return; }
        const t = (now - t0 - delay) / dur;
        if (t >= 1) { done(); return; }
        paint(t <= 0 ? 0 : ease(t));
        requestAnimationFrame(frame);
      };
      if (!L.motionOK()) return done();
      paint(0);
      requestAnimationFrame(frame);
    };
    const tickOpts = (el) => ({ from: el.dataset.ldFrom ? el.dataset.ldFrom.split(",").map(Number) : 0, delay: +el.dataset.ldDelay || 0, dur: +el.dataset.ldDur || 900 });

    /** .ld-reveal / [data-reveal] intros start the first time they scroll into view; their [data-ld-count] numbers tick then. */
    let io = null;
    const SEL = ".ld-reveal:not(.is-in), [data-reveal]:not(.is-in)";
    const show = (el) => { el.classList.add("is-in"); el.querySelectorAll("[data-ld-count]").forEach((t) => L.tick(t, tickOpts(t))); };
    L.observe = function (root) {
      if (io) { io.disconnect(); io = null; }
      const els = root.querySelectorAll(SEL);
      if (!els.length) return;
      if (!("IntersectionObserver" in window) || !L.motionOK()) { els.forEach(show); return; }
      io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
      els.forEach((el) => io.observe(el));
    };
    /** Called by core after every render. nav = a fresh arrival on the route (intros + count-ups allowed). */
    L.after = function (root, nav) {
      if (!nav) { if (io) { io.disconnect(); io = null; } return; }
      L.observe(root);
      root.querySelectorAll("[data-ld-count]").forEach((el) => { if (!el.closest(".ld-reveal:not(.is-in), [data-reveal]:not(.is-in)")) L.tick(el, tickOpts(el)); });
    };

    /** The 12-cohort completion line as a path in a w×h box. */
    L.sparkPath = function (w, h, pad) {
      pad = pad == null ? 2 : pad;
      const lo = Math.min(...L.rates), hi = Math.max(...L.rates);
      const x = (i) => pad + i * (w - 2 * pad) / (L.rates.length - 1);
      const y = (r) => pad + (1 - (r - lo) / (hi - lo)) * (h - 2 * pad);
      return { d: L.rates.map((r, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(r).toFixed(1)).join(" "), x, y, end: [x(L.rates.length - 1), y(L.rates[L.rates.length - 1])] };
    };
  })();
  /** Public motion helper: count the numbers in el up to their real values (see MP.live.tick). */
  MP.countUp = (el, o) => MP.live.tick(el, o);

  const fx = (v) => (+v).toFixed(1);
  MP.draw = {
    /** Split mark: a short ink line fanning into three lens beams (BA top · DS middle · AI bottom).
        on: lens id | [lens ids] | "all" | "" (all dashed). o: {labels: true → BA/DS/AI codes at the beam ends, just: redraw the lit beam once, cls} */
    splitMark(on, o) {
      o = o || {};
      const ys = { ba: 6, ds: 26, ai: 46 }, W = o.labels ? 154 : 132;
      return `<svg class="ld-mark ${o.cls || ""}" viewBox="0 0 ${W} 52" aria-hidden="true"><path class="src" d="M2,14 L12,12 L22,16 L32,14 L42,26 L52,28 L62,26"/>${MP.lensOrder.map((id) => {
        const lit = on === "all" || on === id || (Array.isArray(on) && on.includes(id));
        return `<path class="bm ${id}${lit ? " on" : ""}${lit && o.just ? " just" : ""}" ${lit ? 'pathLength="1"' : ""} d="M62,26 C86,26 98,${ys[id]} 124,${ys[id]}"/><circle class="nd ${id}${lit ? "" : " off"}" cx="126" cy="${ys[id]}" r="3.4"/>${o.labels ? `<text class="cd ${id}" x="134" y="${ys[id] + 3.2}">${MP.lensInfo[id].short}</text>` : ""}`;
      }).join("")}<circle class="sp" cx="62" cy="26" r="4"/></svg>`;
    },
    /** Footer / bookend mark: the real 12-cohort line splitting into the three beams. */
    colophonMark() {
      const sp = MP.live.sparkPath(56, 24, 2), ex = sp.end[0], ey = sp.end[1] + 4;
      return `<svg viewBox="0 0 96 32" aria-hidden="true"><path class="sp" transform="translate(0,4)" d="${sp.d}"/>${[["b1", 4], ["b2", 16], ["b3", 28]].map(([c, y]) => `<path class="${c}" d="M${fx(ex)},${fx(ey)} C${fx(ex + 16)},${fx(ey)} ${fx(ex + 16)},${y} 94,${y}"/>`).join("")}<circle class="dot" cx="${fx(ex)}" cy="${fx(ey)}" r="2.6"/></svg>`;
    },
    /** Each lens's own data as a small figure (viewBox 300×140). Wrap in .ld-gbox (MP.h.glyphBox does). */
    glyph(id) {
      const L = MP.live;
      if (id === "ba") {
        const E = MP.data.funnel.earlier, R = MP.data.funnel.recent, cx = 150, half = 132, bh = 13, pitch = 23;
        let s = "";
        R.forEach((v, i) => {
          const y = 6 + i * pitch, we = E[i] / E[0] * half, wr = v / R[0] * half;
          if (i < R.length - 1) { const wn = R[i + 1] / R[0] * half, yn = y + pitch; s += `<polygon class="flow" style="--i:${i}" points="${fx(cx - wr)},${y + bh} ${fx(cx + wr)},${y + bh} ${fx(cx + wn)},${yn} ${fx(cx - wn)},${yn}"/>`; }
          s += `<rect class="bar" style="--i:${i}" x="${fx(cx - wr)}" y="${y}" width="${fx(2 * wr)}" height="${bh}" rx="1.5"/>`;
          s += `<rect class="ghost" style="--i:${i}" x="${fx(cx - we)}" y="${y - 0.5}" width="${fx(2 * we)}" height="${bh + 1}" rx="1.5"/>`;
        });
        return `<svg class="ld-g ld-g-ba" viewBox="0 0 300 140" aria-hidden="true">${s}</svg>`;
      }
      if (id === "ds") {
        const cs = MP.data.cohorts, base = 132, mh = 120, pitch = 300 / cs.length, w = 15;
        let s = "";
        cs.forEach((c, i) => {
          const x = i * pitch + (pitch - w) / 2, hh = c.signups / L.maxSignups * mh, hp = hh * c.partnerShare;
          s += `<g class="col" style="--i:${i}"><rect class="o" x="${fx(x)}" y="${fx(base - hh)}" width="${w}" height="${fx(hh - hp - 1.5)}" rx="1.5"/><rect class="p" x="${fx(x)}" y="${fx(base - hp)}" width="${w}" height="${fx(hp)}" rx="1.5"/></g>`;
        });
        s += `<line class="div" x1="${6 * pitch}" x2="${6 * pitch}" y1="4" y2="${base + 4}"/>`;
        return `<svg class="ld-g ld-g-ds" viewBox="0 0 300 140" aria-hidden="true">${s}</svg>`;
      }
      const b = L.router, rowsN = 10, cell = 11, gap = 3.6;
      // Same encoding as the AI lens's own waffles: ink = right team · solid vermilion = content→tech mistake ·
      // vermilion outline = other mistake · grey = sent to a person.
      const ct = b.errors.contentToTech;
      const kind = (k) => (k < b.correct ? "c" : k < b.correct + ct ? "w" : k < b.auto ? "w2" : "hm");
      let s = "";
      for (let k = 0; k < L.routerTotal; k++) {
        const col = Math.floor(k / rowsN), r = k % rowsN, kk = kind(k);          // column-major: reads left → right
        const x = 4 + col * (cell + gap), y = 2 + r * (cell + gap), ins = kk === "w2" ? 0.7 : 0;
        s += `<rect class="${kk}" style="--i:${col * 2 + r}" x="${fx(x + ins)}" y="${fx(y + ins)}" width="${fx(cell - 2 * ins)}" height="${fx(cell - 2 * ins)}" rx="2"/>`;
      }
      return `<svg class="ld-g ld-g-ai" viewBox="0 0 300 140" aria-hidden="true">${s}</svg>`;
    },
    /** The glyph's caption, with the real numbers. */
    glyphCap(id) {
      const L = MP.live, n = MP.n;
      if (id === "ba") return MP.t({ en: `The funnel: ${MP.data.funnelSteps.length} steps, earlier cohorts (outline) and recent ones (solid).`, zh: `漏斗：${MP.data.funnelSteps.length} 个步骤，<span class="nowrap">前期（描边）</span>与<span class="nowrap">近期（实心）</span>对比。` });
      if (id === "ds") return MP.t({ en: `Who signed up: each cohort's signups, partner-offer share in blue, <span class="nowrap">${MP.pct(L.partner[0], 0)} → ${MP.pct(L.partner[1], 0)}</span>.`, zh: `谁在报名：每批学员人数，蓝色为<span class="nowrap">合作渠道占比</span>\u200b<span class="nowrap">${MP.pct(L.partner[0], 0)}→${MP.pct(L.partner[1], 0)}</span>。` });
      const b = L.router, wrong = b.auto - b.correct, ct = b.errors.contentToTech;
      const keys = `<span class="ld-keys" aria-hidden="true"><span class="ld-key"><i class="c"></i>${n(b.correct)}</span><span class="ld-key"><i class="w"></i>${n(ct)}</span><span class="ld-key"><i class="w2"></i>${n(wrong - ct)}</span><span class="ld-key"><i class="hm"></i>${n(b.human)}</span></span>`;
      return keys + MP.t({ en: `${n(L.routerTotal)} help messages: ${n(b.correct)} routed right (ink), ${n(wrong)} misrouted (${n(ct)} of them content → tech), ${n(b.human)} sent to a person.`, zh: `${n(L.routerTotal)} 条求助消息：${n(b.correct)} 条分对（黑色），<span class="nowrap">${n(wrong)} 条分错</span>（其中 <span class="nowrap">${n(ct)} 条</span>是内容→技术），${n(b.human)} 条转人工。` });
    },
    /** Progress beam: fill to p (0..1), grows from p0 on arrival, a tick at each of n-1 step boundaries. */
    beam(p, p0, n) {
      const ticks = n ? Array.from({ length: n - 1 }, (_, j) => `<b style="left:${((j + 1) / n * 100).toFixed(2)}%"></b>`).join("") : "";
      return `<div class="ld-beam" style="--p:${(+p).toFixed(4)};--p0:${(+(p0 || 0)).toFixed(4)}" aria-hidden="true"><i></i>${ticks}</div>`;
    },
    /** Node beam for a lens's steps: done filled, skipped dashed, to do hollow; `next` glows. */
    stepBeam(id, contentOnly) {
      const ls = MP.ls(id), steps = contentOnly ? MP.lenses[id].steps : MP.lensSteps(id), n = steps.length, first = MP.firstOpenStep(id);
      let last = -1; steps.forEach((s, i) => { if (ls.steps[s.id] && ls.steps[s.id].done) last = i; });
      const nodes = steps.map((s, i) => { const ss = ls.steps[s.id] || {}, k = ss.done ? "done" : ss.skipped ? "skipped" : "todo";
        return `<s class="${k}${s.id === first.id && k !== "done" ? " next" : ""}" style="left:${(i / (n - 1) * 100).toFixed(2)}%;--i:${i}"></s>`; }).join("");
      return `<div class="ld-beam nodes" style="--p:${last > 0 ? (last / (n - 1)).toFixed(4) : 0};--p0:0" aria-hidden="true"><i></i>${nodes}</div>`;
    }
  };

  /* ================= toast, modal, popover ================= */
  let toastTimer;
  MP.toast = function (html, ms) {
    const host = document.getElementById("overlay");
    const old = host.querySelector(".toast"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.innerHTML = html; host.appendChild(el);
    clearTimeout(toastTimer); if (ms !== 0) toastTimer = setTimeout(() => el.remove(), ms || 3200);
  };
  MP.modal = function (html) {
    const host = document.getElementById("overlay"); MP.closeModal();
    host.insertAdjacentHTML("beforeend", `<div class="scrim" data-action="modal-close"></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`);
    const f = host.querySelector(".modal input, .modal button"); if (f) f.focus();
  };
  MP.closeModal = function () { document.querySelectorAll("#overlay .scrim, #overlay .modal, #overlay .drawer").forEach((n) => n.remove()); };
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openTerm(btn, id) {
    closePop(); const g = MP.glossary[id]; if (!g) return;
    const other = MP.lang() === "zh" ? g.w.en : g.w.zh;
    pop = document.createElement("div"); pop.className = "pop"; pop.setAttribute("role", "tooltip");
    pop.innerHTML = `<b>${esc(MP.t(g.w))}</b>${esc(MP.t(g.def))}<div class="alt">${esc(other)}</div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    let left = Math.max(16, Math.min(r.left + window.scrollX + r.width / 2 - w / 2, window.scrollX + document.documentElement.clientWidth - w - 16));
    let top = r.bottom + window.scrollY + 8; if (r.bottom + pop.offsetHeight + 20 > window.innerHeight) top = r.top + window.scrollY - pop.offsetHeight - 8;
    pop.style.left = left + "px"; pop.style.top = top + "px";
  }

  /* ================= registries ================= */
  MP.pages = MP.pages || {};
  MP.lenses = MP.lenses || {};
  MP.actions = MP.actions || {};
  MP.inputs = MP.inputs || {};
  MP.on = (name, fn) => { MP.actions[name] = fn; };
  MP.onInput = (name, fn) => { MP.inputs[name] = fn; };

  /* ================= router ================= */
  MP.route = function () {
    const parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
    return { name: parts[0] || "home", a: parts[1], b: parts[2] };
  };
  MP.go = function (hash) { if (location.hash === hash) MP.render({ top: true }); else location.hash = hash; };

  /* ================= lens helpers (used by shell, dashboard, brief) ================= */
  MP.lensSteps = function (id) {
    const L = MP.lenses[id]; if (!L) return [];
    return L.steps.concat([MP.reflectStep(id)]);
  };
  /** Minimum finished content steps for a lens to count as complete (otherwise it was only looked through). */
  MP.SUBSTANTIVE = 3;
  MP.progress = function (id) {
    const ls = MP.ls(id), steps = MP.lensSteps(id), L = MP.lenses[id];
    const isDone = (s) => !!(ls.steps[s.id] && ls.steps[s.id].done);
    const done = steps.filter(isDone).length;
    const content = L ? L.steps : [];
    const contentDone = content.filter(isDone).length;
    const isSkip = (s) => !!(ls.steps[s.id] && ls.steps[s.id].skipped && !ls.steps[s.id].done);
    const skipped = steps.filter(isSkip).length;
    const contentSkipped = content.filter(isSkip).length;
    const goal = Math.min(MP.SUBSTANTIVE, content.length || MP.SUBSTANTIVE);
    const substantive = contentDone >= goal;
    // complete = finished AND real work was done; a lens clicked through by skipping counts as started, not complete
    // Looked-through copy counts CONTENT steps only (contentDone of contentTotal, contentSkipped); Reflect isn't one of "the 5 steps".
    return { done, total: steps.length, contentDone, contentTotal: content.length, contentSkipped, needed: Math.max(0, goal - contentDone), skipped, substantive,
      started: !!ls.startedAt, skimmed: !ls.completedAt && !!ls.skimmedAt, complete: !!ls.completedAt };
  };
  /** First content step that was skipped or never finished (where to send a student back to). */
  MP.firstOpenStep = function (id) {
    const ls = MP.ls(id), steps = MP.lensSteps(id);
    return steps.find((s) => !(ls.steps[s.id] && ls.steps[s.id].done)) || steps[0];
  };
  MP.nextLens = function (exclude) {
    const order = [MP.state.recommended].concat(MP.lensOrder).filter((x, i, a) => x && a.indexOf(x) === i);
    return order.find((id) => id !== exclude && MP.lenses[id] && !MP.progress(id).complete) || null;
  };
  /** Where the student should go next: an in-progress lens first, then the recommended/next lens. */
  MP.nextStep = function () {
    const inProg = MP.lensOrder.find((id) => MP.lenses[id] && MP.progress(id).started && !MP.progress(id).complete);
    if (inProg) { const ls = MP.ls(inProg); const step = ls.skimmedAt || !ls.cur ? MP.firstOpenStep(inProg).id : ls.cur; return { lens: inProg, step, resume: true }; }
    const nx = MP.nextLens(); return nx ? { lens: nx, step: MP.lensSteps(nx)[0].id, resume: false } : null;
  };

  /** Generic last step of every lens. */
  MP.reflectStep = function (lensId) {
    return {
      id: "reflect", core: true, feel: false,
      title: MP.UI.reflectTitle, short: { en: "Reflect", zh: "回顾" }, lead: MP.UI.reflectLead,
      render(ls) {
        const picks = MP.lenses[lensId].steps.filter((s) => s.feel !== false);
        return `<div class="work"><div class="work-title">${MP.ui("reflectQ")}</div>
          <div class="options">${picks.map((s) => MP.h.option(MP.t(s.title), "", "refl-pick", lensId + ":" + s.id, ls.refl.pick === s.id)).join("")}
          ${MP.h.option(MP.ui("reflectNone"), "", "refl-pick", lensId + ":none", ls.refl.pick === "none")}</div>
          <div class="field" style="margin-top:20px"><label for="refl-note">${MP.ui("reflectNote")}<span class="opt">${MP.ui("optional")}</span></label><textarea class="textarea" id="refl-note" rows="2" data-input="refl-note" data-change="refl-note-done" data-arg="${lensId}">${esc(ls.refl.note || "")}</textarea></div>
          ${reflFollowHTML(lensId, ls)}</div>`;
      },
      ready: () => true
    };
  };

  /* ================= AI-3: one reflect follow-up per lens ================= */
  // Composed once, from the student's own pick, marks and note (a snapshot in both languages, so it never shifts
  // under them), validated, then streamed once. Private: My Brief only. It never blocks "Finish lens".
  const FW = {
    kick: { en: "Follow-up", zh: "追问" },
    unsure: { en: "Not sure", zh: "说不准" },
    skip: { en: "Skip", zh: "跳过" },
    more: { en: "Say more", zh: "再说两句" },
    moreLabel: { en: "In a line (optional)", zh: "一句话就好（可选）" },
    ack: [{ en: "Noted. It'll appear under What stood out in your Brief, only for you.", zh: "记下了，会出现在小结的“你注意到了什么”里，只有你能看到。" },
      { en: "Noted. It goes into What stood out in your Brief, and only you see it there.", zh: "记下了。它会写进小结的“你注意到了什么”，只有你能看到。" }]
  };
  function reflCompose(lensId, ls) {
    const L = MP.lenses[lensId], R = ls.refl || {}, note = String(R.note || "").trim(), pick = R.pick || "";
    const X = MP.ai.text, LX = MP.ai.lex;
    const step = pick && pick !== "none" ? L.steps.find((s) => s.id === pick) : null;
    const st = step ? (ls.steps[step.id] || {}) : null;
    const long = note && (X.lang(note) === "zh" ? X.chars(note) >= 8 : X.words(note) >= 5);
    const sur = X.find(note, LX.surprise)[0], neg = X.find(note, LX.negative)[0];
    const qAt = (h) => { if (!note || X.words(note) < 3) return ""; const c = X.clause(note, h ? h.s : 0, { maxWords: 16, maxChars: 24 }); return c.text ? X.quote(note, c.s, c.e) : ""; };
    const v = MP.ai.hash(note + "|" + pick) % 2;
    const ttl = (l) => step ? (step.title[l] || step.title.en).replace(/​/g, "") : "";
    const C = (id, en, zh) => ({ id, en, zh });
    const NS = C("unsure", FW.unsure.en, FW.unsure.zh);
    let rule = "", q = null, chips = [];
    if (step && st.hard) {
      const qt = qAt(sur || neg || null);
      rule = "hard";
      q = v === 0
        ? { en: [`You picked “${ttl("en")}” and also marked it hard.`, qt ? [" You wrote ", { q: qt, lens: lensId }, "."] : "", " Hard in a good way, or just hard?"], zh: [`你选了“${ttl("zh")}”，也把它标成了有难度。`, qt ? ["你写到", { q: qt, lens: lensId }, "。"] : "", "是难得有意思，还是就是难？"] }
        : { en: [`The part you'd do every week, “${ttl("en")}”, is also the one you marked hard.`, qt ? [" You called it ", { q: qt, lens: lensId }, "."] : "", " Was it hard in a good way, or just hard?"], zh: [`你愿意每周做的“${ttl("zh")}”，恰好也是你标了有难度的一步。`, qt ? ["你说", { q: qt, lens: lensId }, "。"] : "", "这种难，是有意思的难，还是单纯的难？"] };
      q.en = q.en.filter(Boolean); q.zh = q.zh.filter(Boolean);
      chips = [C("good", "Hard in a good way", "难得有意思"), C("just", "Just hard", "就是难"), NS];
    } else if (sur) {
      const qt = qAt(sur);
      rule = "surprise";
      q = v === 0 ? { en: ["You wrote ", { q: qt, lens: lensId }, ". Was it the topic you liked, or the surprise?"], zh: ["你写到", { q: qt, lens: lensId }, "。你喜欢的是话题本身，还是那一下的意外？"] }
        : { en: ["Something caught you off guard: ", { q: qt, lens: lensId }, ". What stayed with you more, the topic or the surprise itself?"], zh: ["你提到", { q: qt, lens: lensId }, "。留下印象的，是这个话题，还是那份意外？"] };
      chips = [C("topic", "The topic", "话题本身"), C("surprise", "The surprise", "那一下的意外"), NS];
    } else if (pick === "none") {
      rule = "none";
      q = v === 0 ? { en: ["That's a real answer too. Nothing here you'd want every week. Was it the problem, or this kind of work?"], zh: ["都不想做，也是一个真实的答案。是这个问题本身不吸引你，还是这类工作？"] }
        : { en: ["That's a real answer too. If none of these steps pulled you in, was it the LumenLearn problem, or this kind of work?"], zh: ["都不想做，也是一个真实的答案。是 LumenLearn 这个问题没意思，还是这类工作本身？"] };
      chips = [C("problem", "The problem", "这个问题"), C("work", "The kind of work", "这类工作"), NS];
    } else if (step && st.energy === "enjoyed") {
      const qt = qAt(null);
      rule = "enjoyed";
      q = { en: [`You picked “${ttl("en")}”, a step you also marked as enjoyed.`, qt ? [" You wrote ", { q: qt, lens: lensId }, "."] : "", " What pulled you in: the numbers, or deciding what to do with them?"].filter(Boolean),
        zh: [`你选了“${ttl("zh")}”，这一步你也标了喜欢。`, qt ? ["你写到", { q: qt, lens: lensId }, "。"] : "", "吸引你的是数字本身，还是拿数字来做决定？"].filter(Boolean) };
      chips = [C("numbers", "The numbers", "数字本身"), C("deciding", "The deciding", "做决定"), C("both", "Both", "都有")];
    } else if (!step && neg && long) {
      const qt = qAt(neg);
      rule = "negative";
      q = { en: ["You wrote ", { q: qt, lens: lensId }, ". Which part felt that way?"], zh: ["你写到", { q: qt, lens: lensId }, "。是哪一部分让你有这种感觉？"] };
      const marked = L.steps.filter((s) => { const x = ls.steps[s.id] || {}; return x.hard || x.energy === "drained"; });
      const pool = (marked.length ? marked : L.steps.filter((s) => (ls.steps[s.id] || {}).done)).slice(0, 2);
      chips = pool.map((s) => C("step:" + s.id, (s.short || s.title).en, (s.short || s.title).zh)).concat([NS]);
    } else if (step) {
      const qt = long ? qAt(null) : "";
      rule = "picked";
      q = { en: [`You picked “${ttl("en")}”.`, qt ? [" You wrote ", { q: qt, lens: lensId }, "."] : "", " What made it the one: the problem itself, or the way of working?"].filter(Boolean),
        zh: [`你选了“${ttl("zh")}”。`, qt ? ["你写到", { q: qt, lens: lensId }, "。"] : "", "让你选它的，是这个问题本身，还是这种做事方式？"].filter(Boolean) };
      chips = [C("problem", "The problem itself", "问题本身"), C("way", "The way of working", "这种做事方式"), NS];
    }
    if (!rule) return null;   // silence: no pick and nothing in the note to ask about
    const src = { sources: [note] };
    if (!MP.ai.check(q.en, src).ok || !MP.ai.check(q.zh, src).ok) return null;
    // the trace is frozen with the question (it names the step exactly as the question does)
    const marks = L.steps.filter((s) => { const x = ls.steps[s.id] || {}; return x.hard || x.energy; }).length;
    const trace = [step ? { en: "Your pick · " + ttl("en"), zh: "你的选择 · " + ttl("zh") } : pick === "none" ? { en: "Your pick · none of these", zh: "你的选择 · 都不太想" } : null,
      note ? (X.lang(note) === "zh" ? { en: `Your note · ${X.chars(note)} characters`, zh: `你的感受 · ${X.chars(note)} 字` } : { en: `Your note · ${X.words(note)} words`, zh: `你的感受 · ${X.words(note)} 个词` }) : null,
      marks ? { en: `Your marks in this lens · ${marks}`, zh: `你在这个视角的标记 · ${marks} 处` } : null].filter(Boolean);
    return { rule, q, chips, trace, pick, a: "", more: "", moreOpen: false, at: Date.now() };
  }
  function reflMaybe(lensId) {
    const ls = MP.ls(lensId), cur = ls.refl.follow;
    if (!MP.ai) return false;
    // still one follow-up per lens: an unanswered one is re-composed once if the pick changes under it
    if (cur && (cur.a || cur.redone || cur.pick === undefined || cur.pick === (ls.refl.pick || ""))) return false;
    const f = reflCompose(lensId, ls); if (!f) return false;
    if (cur) f.redone = true;
    ls.refl.follow = f; return true;
  }
  function reflFollowHTML(lensId, ls) {
    const f = ls.refl && ls.refl.follow;
    if (!MP.ai || !f || f.a === "skip") return "";
    const L = MP.lenses[lensId], note = String(ls.refl.note || "").trim(), step = L.steps.find((s) => s.id === ls.refl.pick);
    const marks = L.steps.filter((s) => { const x = ls.steps[s.id] || {}; return x.hard || x.energy; }).length;
    const ttl = (s, l) => String(s.title[l] || s.title.en).replace(/​/g, "");
    const trace = f.trace || [step ? { en: "Your pick · " + ttl(step, "en"), zh: "你的选择 · " + ttl(step, "zh") } : ls.refl.pick === "none" ? { en: "Your pick · none of these", zh: "你的选择 · 都不太想" } : null,
      note ? { en: `Your note · ${MP.ai.text.words(note)} words`, zh: `你的感受 · ${MP.ai.text.chars(note)} 字` } : null,
      marks ? { en: `Your marks in this lens · ${marks}`, zh: `你在这个视角的标记 · ${marks} 处` } : null].filter(Boolean);
    const lang = MP.lang();
    const ch = f.chips.map((c) => MP.h.chip(c[lang] || c.en, "refl-follow", lensId + "|" + c.id, f.a === c.id, { sm: true })).join("");
    const ack = f.a ? MP.ai.block({ key: `refl.${lensId}.ack`, fp: f.a, kind: "line", body: MP.ai.say(FW.ack, "refl.ack." + lensId, MP.ai.hash(f.rule)), cls: "rd-ack" }) : "";
    const more = f.a ? (f.moreOpen || f.more
      ? `<div class="rd-more"><label for="refl-more">${MP.t(FW.moreLabel)}</label><input class="input" id="refl-more" type="text" maxlength="160" value="${esc(f.more || "")}" data-input="refl-more" data-arg="${lensId}"></div>`
      : `<div style="margin-top:6px">${MP.h.quiet(MP.t(FW.more), "refl-more-open", lensId)}</div>`) : "";
    // the answer chips ride in the block's actions, so they arrive when the question has finished streaming
    return `<div class="rd-follow">${MP.ai.block({ key: `refl.${lensId}`, fp: f.at, kind: "note", kicker: MP.t(FW.kick), trace, body: f.q, lens: lensId,
      actions: `<div class="rd-acts rd-ans" role="group" aria-label="${esc(MP.t(FW.kick))}">${ch}${f.a ? "" : MP.h.quiet(MP.t(FW.skip), "refl-follow", lensId + "|skip")}</div>` })}${ack}${more}</div>`;
  }

  /* ================= AI-2: Ask about this step ================= */
  // An inline card (no input box, no persona): a context line about the student's current state on this step, then
  // suggested questions. "Give me a nudge" walks the fixed, reviewed hint ladder (and still counts st.hints); step
  // chips come from step.ask.chips(ls, ready) (before ready they explain and point, never reveal or rank the options);
  // one core chip explains the step's glossary term or where this shows up in a master's.
  const ASK = {
    open: { en: "Ask about this step", zh: "就这一步问问" },
    kick: (n, t) => ({ en: `Ask · Step ${n} · ${t}`, zh: `提问 · 第 ${n} 步 · ${t}` }),
    close: { en: "Close", zh: "收起" },
    region: { en: "Ask about this step", zh: "就这一步问问" },
    looking: { en: "Looking at what you've done: ", zh: "看了你目前的进度：" },
    nudge: [{ en: "Give me a nudge", zh: "给我一点提示" }, { en: "A bit more", zh: "再多一点" }, { en: "Show an example", zh: "看一个示例" }],
    term: (w) => ({ en: `What does ‘${/^[A-Z][a-z]/.test(w) && !/^[A-Z]{2,}/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w}’ mean here?`, zh: `“${w}”在这里是什么意思？` }),
    shows: { en: "Where does this show up in a master's?", zh: "硕士课程里哪里会用到这个？" },
    another: { en: "↻ Say it another way", zh: "↻ 换个说法" },
    of: (a, b) => ({ en: `${a} of ${b}`, zh: `${a}/${b}` }),
    pick: { en: "your pick", zh: "你的选择" },
    onScreen: { en: "what's on screen", zh: "屏幕上的内容" },
    hintsSeen: (n) => ({ en: `${n === 1 ? "1 hint" : n + " hints"} you opened`, zh: `你看过的 ${n} 条提示` }),
    stepN: (n, t) => ({ en: `Step ${n} · ${t}`, zh: `第 ${n} 步 · ${t}` }),
    // generic context lines, used only when a lens step has no ask.seen()
    seenNot: { en: "you haven't made the main move on this step yet. Ask for a nudge if you'd like a way in; nothing here is graded.", zh: "这一步的主要操作你还没做。想找个切入点，可以先要一点提示；这里不打分。" },
    seenReady: { en: "you've made your move on this step. Ask about the trade-offs, or read what practitioners weigh below.", zh: "这一步你已经做出了选择。可以问问其中的取舍，或者看看下面从业者会怎么权衡。" }
  };
  const lensAsk = (step) => (step.ask && typeof step.ask === "object") ? step.ask : {};
  const call = (fn, ...a) => { try { return typeof fn === "function" ? fn(...a) : null; } catch (e) { console.error(e); return null; } };
  /** Figure captions on this step's work area (named in the reading trace: "FIG. 2 · The funnel"). */
  function figLabels(html) {
    const out = [], re = /<div class="ld-cap"><span class="ld-label">([\s\S]*?)<\/span>(?:<span class="ld-pill"|<\/div>)/g; let m;
    while ((m = re.exec(html)) && out.length < 2) { const t = m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); if (t && t.length <= 56 && !out.includes(t)) out.push(t); }
    return out;
  }
  /** The step's first glossary term ([[id]] in its lead), for the core chip. */
  function leadTerm(step) {
    const m = String(MP.t(step.lead) || "").match(/\[\[(\w+)(?:\|([^\]]+))?\]\]/);
    if (!m || !MP.glossary || !MP.glossary[m[1]]) return null;
    const g = MP.glossary[m[1]];
    return { id: m[1], word: m[2] || MP.t(g.w).replace(/\s*\(.*\)|（.*）/, ""), g };
  }
  /** All chips this step can offer right now: [{id, q, a(ls)}] (hint and core chips included). */
  function askChips(id, step, ls, st, ready) {
    const A = lensAsk(step), out = [];
    const lensChips = call(A.chips, ls, ready) || [];
    lensChips.forEach((c) => { if (c && c.id && c.q && typeof c.a === "function") out.push(c); });
    const tm = leadTerm(step);
    if (tm) {
      const def = MP.t(tm.g.def), tie = call(A.term, ls);
      out.push({ id: "term:" + tm.id, core: true, q: ASK.term(tm.word), a: () => ({ variants: [
        { en: [def, tie ? [" ", tie.en || tie] : ""], zh: [def, tie ? [tie.zh || tie] : ""] },
        { en: [`Here, “${MP.t({ en: tm.word, zh: tm.word })}” means this: `, def.charAt(0).toLowerCase() + def.slice(1), tie ? [" ", tie.en || tie] : ""], zh: ["在这一步里，", def, tie ? [tie.zh || tie] : ""] },
        { en: ["In one line: ", def, tie ? [" ", tie.en || tie] : ""], zh: ["一句话：", def, tie ? [tie.zh || tie] : ""] }] }) });
    } else if (step.shows) {
      out.push({ id: "shows", core: true, q: ASK.shows, a: () => ({ variants: [
        { en: [MP.t({ en: step.shows.en, zh: step.shows.en }), " Programs differ in how much of it they teach from scratch, so it's a good question to bring to an advisor."], zh: [step.shows.zh, "各个项目从零讲起的程度不同，这个问题值得带去问顾问。"] },
        { en: ["At the level of the field, not any one program: ", step.shows.en], zh: ["从整个领域来看（不针对某一个项目）：", step.shows.zh] },
        { en: [step.shows.en, " That's field-level; how deep any one program goes is worth asking."], zh: [step.shows.zh, "这是领域层面的说法，具体某个项目讲多深，值得去问。"] }] }) });
    }
    return out;
  }
  function askCard(id, step, idx, ls, st, ready, workHTML) {
    const A = lensAsk(step), hints = step.hints || [], lang = MP.lang();
    const all = askChips(id, step, ls, st, ready), byId = {}; all.forEach((c) => { byId[c.id] = c; });
    // turns, with hint turns for hints opened before the card existed (older saved states)
    const turns = st.ask.slice();
    const hintTurns = turns.filter((x) => x.chip === "hint").length;
    for (let lv = st.hints; lv > hintTurns; lv--) turns.unshift({ chip: "hint", lv: lv - hintTurns, legacy: true });
    turns.forEach((x, i) => { if (x.chip === "hint" && x.legacy) x.lv = i + 1; });
    const short = MP.t(step.short || step.title);
    // context line
    const seenRaw = call(A.seen, ls, lang);
    const seenSegs = seenRaw ? MP.ai.flat(seenRaw) : [MP.t(ready ? ASK.seenReady : ASK.seenNot)];
    const ctxTrace = call(A.trace, ls) || [MP.t(ASK.stepN(idx + 1, short))].concat(figLabels(workHTML), [MP.t(ready ? ASK.pick : ASK.onScreen)], st.hints ? [MP.t(ASK.hintsSeen(st.hints))] : []);
    const ctx = MP.ai.block({ key: `ask.${id}.${step.id}.ctx`, fp: st.askN || 0, kind: "line", trace: ctxTrace.slice(0, 5), body: [MP.t(ASK.looking)].concat(seenSegs), cls: "rd-ask-ctx", lens: id });
    // thread
    const thread = turns.map((x, i) => {
      const k = `ask.${id}.${step.id}.${i}`;
      if (x.chip === "hint") {
        const h = hints[x.lv - 1]; if (!h) return "";
        return `<div class="rd-turn"><div class="rd-tq" tabindex="-1" data-fk="ask-turn:${i}"><span class="lv">${MP.t(MP.UI.hintLv[x.lv - 1])}</span><span aria-hidden="true">·</span><span>${MP.t(ASK.nudge[x.lv - 1])}</span></div>
          ${MP.ai.block({ key: k, fp: "hint." + x.lv, kind: "answer", body: MP.fmt(h), lens: id, animate: x.legacy ? false : undefined })}</div>`;
      }
      const c = byId[x.chip]; if (!c) return "";
      const r = call(c.a, ls); if (!r) return "";
      const vars = r.variants || (r.segs ? [r.segs] : []); if (!vars.length) return "";
      const v = (x.v || 0) % vars.length;
      return `<div class="rd-turn"><div class="rd-tq" tabindex="-1" data-fk="ask-turn:${i}"><span class="rd-tq-i" aria-hidden="true">↳</span><span>${MP.t(c.q)}</span></div>
        ${MP.ai.block({ key: k, fp: x.chip + "." + v, kind: "answer", body: vars[v], lens: id, cites: r.cites,
          actions: vars.length > 1 ? MP.ai.actions({ regen: ["ask-regen", `${id}|${step.id}|${i}`], count: ASK.of(v + 1, vars.length), labels: { regen: ASK.another } }) : "" })}</div>`;
    }).join("");
    // suggested questions still on offer: the hint ladder, then up to two step chips, then the core chip
    const asked = new Set(turns.map((x) => x.chip));
    const sugg = [];
    if (st.hints < hints.length) sugg.push({ label: ASK.nudge[Math.min(st.hints, 2)], action: "ask-chip", arg: `${id}|${step.id}|hint` });
    all.filter((c) => !c.core && !asked.has(c.id)).slice(0, 2).forEach((c) => sugg.push({ label: c.q, action: "ask-chip", arg: `${id}|${step.id}|${c.id}` }));
    all.filter((c) => c.core && !asked.has(c.id)).slice(0, 1).forEach((c) => sugg.push({ label: c.q, action: "ask-chip", arg: `${id}|${step.id}|${c.id}` }));
    return `<section class="rd-ask" aria-label="${esc(MP.t(ASK.region))}">
      <div class="rd-ask-h">${MP.ai.kicker(esc(MP.t(ASK.kick(idx + 1, short))))}<button type="button" class="rd-ask-x" data-action="ask-close" data-arg="${id}|${step.id}" data-fk="ask-open:${id}|${step.id}">${MP.t(ASK.close)}</button></div>
      ${ctx}${thread}${MP.ai.chips(sugg.slice(0, 3), { label: ASK.region })}</section>`;
  }
  MP.on("ask-open", (el, arg) => { const [id, step] = arg.split("|"); const st = MP.st(id, step); st.askOpen = true; st.askN = (st.askN || 0) + 1; MP.commit(); });
  MP.on("ask-close", (el, arg) => { const [id, step] = arg.split("|"); MP.st(id, step).askOpen = false; MP.commit(); const b = document.querySelector('[data-action="ask-open"]'); if (b) b.focus({ preventScroll: true }); });
  MP.on("ask-chip", (el, arg) => {
    const [id, step, chip] = arg.split("|"), st = MP.st(id, step);
    if (!Array.isArray(st.ask)) st.ask = [];
    st.askOpen = true;
    if (chip === "hint") { const hl = (MP.lensSteps(id).find((s) => s.id === step) || {}).hints || []; if (st.hints >= hl.length) return; const legacy = Math.max(0, st.hints - st.ask.filter((x) => x.chip === "hint").length); for (let k = legacy; k >= 1; k--) st.ask.unshift({ chip: "hint", lv: k }); st.hints = Math.min(3, st.hints + 1); st.ask.push({ chip: "hint", lv: st.hints }); }
    else if (!st.ask.some((x) => x.chip === chip)) st.ask.push({ chip, v: 0 });
    MP.commit();
    const turns = document.querySelectorAll(".rd-ask .rd-tq"); const t = turns[turns.length - 1]; if (t) t.focus({ preventScroll: true });
  });
  MP.on("ask-regen", (el, arg) => { const [id, step, i] = arg.split("|"), st = MP.st(id, step), x = st.ask[+i - (Math.max(0, st.hints - st.ask.filter((y) => y.chip === "hint").length))]; if (!x) return; x.v = (x.v || 0) + 1; MP.ai.bump(`ask.${id}.${step}.${i}`); MP.commit(); });

  /* ================= lens shell ================= */
  let lastReveal = "";
  function renderLens(id, stepId) {
    const L = MP.lenses[id];
    if (!L) return `<div class="container page"><p class="lede">${MP.ui("lensNotFound")}</p><p style="margin-top:18px">${MP.h.link(MP.ui("explore") + " →", "go", "#/explore")}</p></div>`;
    const ls = MP.ls(id), steps = MP.lensSteps(id), info = MP.lensInfo[id];
    if (!ls.startedAt) { ls.startedAt = Date.now(); }
    if (stepId === "done") return renderLensDone(id);
    let idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) idx = Math.max(0, steps.findIndex((s) => s.id === ls.cur));
    const step = steps[idx]; ls.cur = step.id; if (!ls.visited.includes(step.id)) ls.visited.push(step.id);
    const st = MP.st(id, step.id), ready = step.ready ? !!step.ready(ls) : true;
    const rv = ready && step.reveal ? step.reveal(ls) : null;
    const hints = step.hints || [];
    const askable = !step.core && !!MP.ai;
    if (!Array.isArray(st.ask)) st.ask = [];
    const askOpen = st.askOpen != null ? !!st.askOpen : (st.hints > 0 || st.ask.length > 0);
    const reachable = (i) => i <= Math.max(...steps.map((s, j) => (ls.visited.includes(s.id) ? j : 0))) + 0;

    const rail = `<aside class="rail" aria-label="${esc(MP.t(info.name))}">
      <div class="rail-head">${MP.h.lensTag(id)}<div class="q lens-q">${MP.t(info.question)}</div></div>
      <ol>${steps.map((s, i) => { const ss = ls.steps[s.id] || {}; const cur = s.id === step.id; const cls = [cur ? "current" : "", ss.done ? "done" : ss.skipped ? "skipped" : ""].join(" ");
        return `<li class="${cls}"><button data-action="lens-goto" data-arg="${id}:${s.id}" data-fk="rail:${s.id}" ${reachable(i) ? "" : "disabled"} ${cur ? 'aria-current="step"' : ""}><span class="st">${ss.done ? "✓" : ss.skipped ? "–" : i + 1}${cur ? '<i class="st-ring" aria-hidden="true"></i>' : ""}</span><span>${MP.t(s.short || s.title)}</span></button></li>`; }).join("")}</ol>
      <div class="rail-foot">${MP.ui("railFoot")}${L.download ? `<div class="rail-dl"><a class="btn-quiet" href="${L.download.href()}" download="${L.download.file}">${DL}<span>${MP.ui("downloadData")}</span></a></div>` : ""}</div>
    </aside>`;

    const head = `<header class="step-head">
      <div class="top">${MP.h.lensTag(id)}<span class="num-lg">${MP.ui("stepOf", { a: idx + 1, b: steps.length })}</span>
        ${askable && !askOpen ? `<span class="ask-link">${MP.h.quiet(MP.ai.mark() + `<span>${MP.t(ASK.open)}</span>`, "ask-open", id + "|" + step.id)}</span>` : ""}</div>
      ${MP.draw.beam((idx + 1) / steps.length, idx / steps.length, steps.length)}
      <div class="step-title"><span class="step-no" aria-hidden="true">${String(idx + 1).padStart(2, "0")}</span><h1 class="h1">${MP.t(step.title)}</h1></div>${step.lead ? `<p class="lead">${MP.fmt(step.lead)}</p>` : ""}
    </header>`;

    // AI-2: the Ask card sits where the hint box was (below the work, above the reveal); the hint ladder lives inside it
    const workHTML = step.render(ls, MP.lang());
    const hintBox = askable && askOpen ? askCard(id, step, idx, ls, st, ready, workHTML) : "";

    // the practitioner boxout animates in only when it newly appears on this step (not on every later re-render)
    const rvKey = id + ":" + step.id, rvNew = !!rv && lastReveal !== rvKey;
    lastReveal = rv ? rvKey : "";
    const reveal = rv ? `<section class="reveal ${rv.trap ? "trap" : ""} ${rvNew ? "rv-new" : ""}" aria-live="polite" aria-label="${esc(rv.trap ? MP.ui("commonTrap") : MP.ui("practitioners"))}"><div class="rv-head"><span class="ico" aria-hidden="true">${rv.trap ? "!" : "✦"}</span>${rv.trap ? MP.ui("commonTrap") : MP.ui("practitioners")}</div>
      ${MP.t(rv.title) ? `<h2 class="rv-t">${MP.t(rv.title)}</h2>` : ""}${rv.your ? `<p class="your">${MP.t(rv.your)}</p>` : ""}<ul>${(rv.points || []).map((p, i) => `<li style="--n:${i}">${MP.fmt(p)}</li>`).join("")}</ul></section>` : "";

    const feel = ready && step.feel !== false ? `<div class="feel" role="group" aria-label="${esc(MP.ui("feel"))}"><span>${MP.ui("feel")} <span class="faint">${MP.lang() === "zh" ? "（" + MP.ui("optional") + "）" : "(" + MP.ui("optional") + ")"}</span></span>
      ${["enjoyed", "neutral", "drained"].map((v) => MP.h.chip(MP.t(MP.UI.feelings[v]), "energy", `${id}:${step.id}:${v}`, st.energy === v, { sm: true })).join("")}
      <label><input type="checkbox" data-change="hard" data-arg="${id}:${step.id}" ${st.hard ? "checked" : ""}> ${MP.ui("hard")}</label></div>` : "";

    const last = idx === steps.length - 1;
    const bar = `<div class="actionbar no-print">
      <div>${idx > 0 ? MP.h.quiet("← " + MP.ui("back"), "lens-goto", id + ":" + steps[idx - 1].id) : ""}</div>
      <div class="right">${MP.h.quiet(MP.ui("leave"), "lens-leave", id)}
        ${ready ? MP.h.primary(last ? MP.t({ en: "Finish lens", zh: "完成这个视角" }) : MP.ui("cont"), "lens-next", id, { lens: id, sm: true, fk: "next" })
                : MP.h.secondary(MP.ui("skip") + " →", "lens-skip", id, { fk: "next" })}</div></div>`;

    return `<div class="container lens-${id}"><div class="lens-layout">${rail}
      <main class="step" id="step-main">${head}<div class="step-body">${workHTML}${hintBox}${reveal}${feel}</div>${bar}</main></div></div>`;
  }

  /** Compact checklist of a lens's steps (✓ done · – skipped · ○ to do); the first open row links back in. */
  function stepChecklist(id, contentOnly) {
    const ls = MP.ls(id), steps = contentOnly ? MP.lenses[id].steps : MP.lensSteps(id), first = MP.firstOpenStep(id);
    const word = { done: { en: "Done", zh: "已完成" }, skipped: { en: "Skipped", zh: "已跳过" }, todo: { en: "To do", zh: "未做" } };
    return `<ol class="ld-check">${steps.map((s, i) => {
      const ss = ls.steps[s.id] || {}, k = ss.done ? "done" : ss.skipped ? "skipped" : "todo";
      const label = `<span class="n num">${i + 1}</span><span class="t">${MP.t(s.short || s.title)}</span><span class="w">${MP.t(word[k])}</span>`;
      const go = s.id === first.id && k !== "done";
      return `<li class="${k}${go ? " next" : ""}"><span class="mk" aria-hidden="true">${k === "done" ? "✓" : k === "skipped" ? "–" : ""}</span>${go
        ? `<button class="ld-check-go" data-action="go" data-arg="#/lens/${id}/${s.id}" data-fk="ldc:${s.id}">${label}<span class="ar" aria-hidden="true">→</span></button>`
        : `<span class="ld-check-row">${label}</span>`}</li>`; }).join("")}</ol>`;
  }
  /** The lens's steps as a node beam (done · skipped · to do), shared with the dashboard's language. */
  const ldTrack = (id, contentOnly) => MP.draw.stepBeam(id, contentOnly);
  /** AI-5 on the done screen: one line of the Compare thread when ≥ 2 lenses are complete (owned by compare.js). */
  function doneThread(id) {
    const C = MP.pages.compare;
    if (!C || typeof C.thread !== "function" || MP.lensOrder.filter((x) => MP.lenses[x] && MP.progress(x).complete).length < 2) return "";
    const html = call(C.thread, { from: "done", lens: id });
    return html ? `<div class="ld-thread">${html}</div>` : "";
  }
  function renderLensDone(id) {
    const L = MP.lenses[id], ls = MP.ls(id), info = MP.lensInfo[id], steps = MP.lensSteps(id), pr = MP.progress(id);
    const nx = MP.nextLens(id), name = MP.t(info.name);
    const first = MP.firstOpenStep(id);
    // clicked through by skipping: say so honestly, hand nothing in, point to the first skipped step
    if (!ls.completedAt && ls.skimmedAt) {
      // counts are over the content steps only (the checklist below lists exactly those), same basis as dashboard/Brief/Compare
      const n = pr.contentSkipped, need = Math.min(MP.SUBSTANTIVE, pr.contentTotal);
      return `<div class="container page lens-${id} lens-done ld-short">
        <div class="ld-head">${MP.draw.splitMark(id)}${MP.h.lensTag(id)}<span class="eyebrow">${MP.t({ en: "Looked through", zh: "已浏览" })}</span></div>
        <h1 class="h1 ld-title">${MP.t({ en: `You've seen the whole ${name} lens.`, zh: `你已经看完了\u200b${name}视角\u200b的全部步骤。` })}</h1>
        <p class="lede">${MP.t({ en: `You skipped ${n === 1 ? "1 step" : n + " steps"}, so there's nothing to hand in yet. Doing ${need} of the ${pr.contentTotal} steps is enough for your Brief to include this lens.`, zh: `你跳过了 ${n} 步，所以暂时还没有交付物。完成 ${pr.contentTotal} 步中的任意 ${need} 步，小结里就会写进这个视角。` })}</p>
        ${ldTrack(id, true)}${stepChecklist(id, true)}
        <div class="ld-actions">${MP.h.primary(MP.ui("backToSkipped"), "go", `#/lens/${id}/${first.id}`, { lens: id })}
          ${MP.h.quiet(MP.ui("progress") + " →", "go", "#/dashboard")}</div>
      </div>`;
    }
    // reached by URL before finishing: say so honestly and point back into the lens
    if (!ls.completedAt) {
      return `<div class="container page lens-${id} lens-done ld-short">
        <div class="ld-head">${MP.draw.splitMark(id)}${MP.h.lensTag(id)}<span class="eyebrow">${MP.t({ en: "Not finished yet", zh: "还没完成" })}</span></div>
        <h1 class="h1 ld-title">${MP.t({ en: "This lens isn't finished yet.", zh: "这个视角还没有完成。" })}</h1>
        <p class="lede">${MP.t({ en: `You've done ${pr.done} of ${pr.total} steps. When you finish, what you hand in shows up here, and in your Brief.`, zh: `你完成了 ${pr.total} 步中的 ${pr.done} 步。完成后，你的交付物会出现在这里，也会写进你的小结。` })}</p>
        ${ldTrack(id)}${stepChecklist(id)}
        <div class="ld-actions">${MP.h.primary(pr.done ? MP.t({ en: "Pick up where you left off", zh: "从上次停下的地方继续" }) : MP.t({ en: "Start this lens", zh: "开始这个视角" }), "go", `#/lens/${id}/${first.id}`, { lens: id })}
          ${MP.h.quiet(MP.ui("progress") + " →", "go", "#/dashboard")}</div>
      </div>`;
    }
    const sum = L.summary ? (() => { try { return L.summary(ls); } catch (e) { console.error(e); return null; } })() : null;
    const mins = ls.startedAt && ls.completedAt ? Math.max(1, Math.round((ls.completedAt - ls.startedAt) / 60000)) : null;
    const enjoyed = L.steps.filter((s) => ls.steps[s.id] && ls.steps[s.id].energy === "enjoyed");
    const meta = [MP.t({ en: `${pr.done} of ${pr.total} steps`, zh: `完成 ${pr.done}/${pr.total} 步` })];
    if (mins && mins <= 45) meta.push(MP.t({ en: `about ${mins} min`, zh: `约 ${mins} 分钟` }));
    if (enjoyed.length) meta.push(MP.t({ en: `enjoyed ${enjoyed.length === 1 ? "1 step" : enjoyed.length + " steps"}`, zh: `喜欢其中 ${enjoyed.length} 步` }));
    const others = MP.lensOrder.filter((x) => x !== id && MP.lenses[x]);
    const strip = others.map((x) => { const p = MP.progress(x); const label = p.complete ? MP.t({ en: "Finished", zh: "已完成" }) : p.started ? MP.t({ en: `${p.done} of ${p.total} steps`, zh: `${p.done}/${p.total} 步` }) : MP.t({ en: "Not started", zh: "未开始" });
      return `<button class="ld-lens lens-${x} ld-reveal" data-action="go" data-arg="#/lens/${x}${p.complete ? "/done" : ""}" data-fk="ld:${x}"><span class="ld-gbox ld-grid">${MP.draw.glyph(x)}</span><span class="ld-lens-h">${MP.h.lensTag(x)}<span class="ld-lens-st">${label}</span></span><span class="ld-lens-q lens-q">${MP.t(MP.lensInfo[x].question)}</span></button>`; }).join("");
    // zh: break only between phrases (一段 / 真实的…工作。), never inside 真实
    const nm = `<span class="ld-lname">${name}</span>`;
    const title = MP.t({ en: `You just did a slice of <span class="it">real</span> ${nm} work.`, zh: "你刚刚完成了\u200b一段\u200b真实的\u200b" + nm + "工作。" });
    const nxLabel = nx ? (MP.progress(nx).started ? MP.ui("continueLens", { x: MP.lensInfo[nx].short }) : MP.ui("tryNext", { x: MP.lensInfo[nx].short })) : "";
    return `<div class="container page lens-${id} lens-done">
      <div class="ld-hero">
        <div class="ld-hero-l">
          <div class="ld-head">${MP.h.lensTag(id)}<span class="eyebrow">${MP.ui("lensComplete")}</span><span class="ld-meta">${meta.join(" · ")}</span></div>
          <h1 class="display ld-title">${title}</h1>
          ${sum ? `<p class="lede ld-did">${MP.t(sum.did)}</p>` : ""}
          ${ldTrack(id)}
        </div>
        <figure class="ld-hero-mark" aria-hidden="true">${MP.draw.splitMark(id, { labels: true })}<span class="ld-label">${MP.t({ en: `${MP.lensInfo[id].short} lit · ${MP.n(MP.lensOrder.filter((x) => MP.lenses[x] && MP.progress(x).complete).length)} of ${MP.n(MP.lensOrder.length)} done`, zh: `${MP.lensInfo[id].short} 已点亮 · 完成 ${MP.n(MP.lensOrder.filter((x) => MP.lenses[x] && MP.progress(x).complete).length)}/${MP.n(MP.lensOrder.length)}` })}</span></figure>
      </div>
      ${sum && sum.artifact ? `<section class="ld-handin">${MP.h.chapter("01", MP.t({ en: "What you handed in", zh: "你的交付物" }), MP.t(sum.artifact.title), { cls: "h2" })}<div class="ld-art ld-ticks"><div class="ld-art-h">${MP.h.figCap(MP.t({ en: "Your " + MP.lensInfo[id].short + " deliverable", zh: "你的 " + MP.lensInfo[id].short + " 交付物" }), MP.t({ en: "Your words", zh: "你写的" }))}${sum.artifact.trace && MP.ai ? `<div class="rd-rev">${MP.ai.mark()}<span>${MP.t(sum.artifact.trace)}</span></div>` : ""}</div><div class="ld-art-b">${sum.artifact.html}</div></div></section>` : ""}
      <div class="ld-actions">${MP.h.primary(MP.ui("seeBrief"), "go", "#/brief", { lens: id })}
        ${nx ? MP.h.link(nxLabel + " →", "go", "#/lens/" + nx) : MP.h.link(MP.t({ en: "Compare your lenses", zh: "并排比较你的视角" }) + " →", "go", "#/compare")}
        <span class="ld-spacer"></span>${MP.h.quiet("← " + MP.t({ en: "Look back over your steps", zh: "回看各个步骤" }), "go", `#/lens/${id}/${steps[0].id}`)}</div>
      ${others.length ? `<section class="ld-next">${MP.h.chapter(sum && sum.artifact ? "02" : "01", MP.t({ en: "Same problem, other lenses", zh: "同一个问题，另外两个视角" }), MP.t({ en: "Same LumenLearn data, a different way in.", zh: "同一份 LumenLearn 数据，\u200b换一个角度切入。" }), { cls: "h2" })}${doneThread(id)}<div class="ld-lenses">${strip}</div></section>` : ""}
    </div>`;
  }

  /* lens actions */
  MP.on("lens-goto", (el, arg) => { const [id, step] = arg.split(":"); MP.go(`#/lens/${id}/${step}`); });
  MP.on("lens-leave", (el, id) => { MP.save(); MP.go("#/dashboard"); MP.toast(MP.t({ en: "Saved. Pick up right where you left off anytime.", zh: "已保存，随时可以从这里继续。" })); });
  function advance(id, skipped) {
    const steps = MP.lensSteps(id), ls = MP.ls(id), i = steps.findIndex((s) => s.id === ls.cur), st = MP.st(id, ls.cur);
    if (skipped) st.skipped = true; else { st.done = true; st.skipped = false; }
    if (i === steps.length - 1) {
      // only call it complete when real work was done; skimming through still lands on an honest done screen
      if (ls.completedAt || MP.progress(id).substantive) { ls.completedAt = ls.completedAt || Date.now(); ls.skimmedAt = null; }
      else {
        ls.skimmedAt = Date.now();
        // "Finish lens" on an empty Reflect after skipping: nothing was reflected, so don't mark it done
        if (!skipped && !ls.refl.pick && !String(ls.refl.note || "").trim()) { st.done = false; st.skipped = true; }
      }
      MP.save(); MP.go(`#/lens/${id}/done`); return;
    }
    const nx = steps[i + 1]; ls.cur = nx.id; MP.save(); MP.go(`#/lens/${id}/${nx.id}`);
  }
  MP.on("lens-next", (el, id) => advance(id, false));
  MP.on("lens-skip", (el, id) => advance(id, true));
  MP.on("hint", (el, arg) => { const [id, step] = arg.split(":"); const st = MP.st(id, step); st.hints = Math.min(3, st.hints + 1); MP.commit(); });
  MP.on("energy", (el, arg) => { const [id, step, v] = arg.split(":"); const st = MP.st(id, step); st.energy = st.energy === v ? "" : v; MP.commit(); });
  MP.onInput("hard", (el) => { const [id, step] = el.dataset.arg.split(":"); MP.st(id, step).hard = el.checked; MP.save(); });
  MP.on("refl-pick", (el, arg) => { const [id, pick] = arg.split(":"); MP.ls(id).refl.pick = pick; reflMaybe(id); MP.commit(); });
  MP.onInput("refl-note", (el) => { MP.ls(el.dataset.arg).refl.note = el.value; MP.save(); });
  // the note commits its follow-up only when it loses focus (never mid-typing)
  MP.onInput("refl-note-done", (el) => { const id = el.dataset.arg; MP.ls(id).refl.note = el.value; MP.save(); if (reflMaybe(id)) { MP.save(); setTimeout(() => MP.commit(), 180); } });   // deferred: a click that caused the blur lands first
  MP.on("refl-follow", (el, arg) => { const [id, a] = arg.split("|"); const f = MP.ls(id).refl.follow; if (!f) return; f.a = a; MP.commit(); });
  MP.on("refl-more-open", (el, id) => { const f = MP.ls(id).refl.follow; if (!f) return; f.moreOpen = true; MP.commit(); const i = document.getElementById("refl-more"); if (i) i.focus(); });
  MP.onInput("refl-more", (el) => { const f = MP.ls(el.dataset.arg).refl.follow; if (f) { f.more = el.value; MP.save(); } });

  /* global actions */
  MP.on("go", (el, hash) => MP.go(hash));
  MP.on("lang", (el, l) => { MP.state.lang = l; const t = document.querySelector("#overlay .toast"); if (t) t.remove(); MP.commit(); });
  MP.on("term", (el, id) => { if (pop && pop.dataset.for === id) { closePop(); return; } openTerm(el, id); if (pop) pop.dataset.for = id; });
  MP.on("modal-close", () => MP.closeModal());
  MP.on("toast-x", () => { const t = document.querySelector("#overlay .toast"); if (t) t.remove(); });
  const hasWork = () => Object.values(MP.state.lenses || {}).some((l) => l && (l.startedAt || Object.keys(l.steps || {}).length));
  const doReset = () => { MP.closeModal(); MP.resetState(true); MP.go("#/home"); MP.render({ top: true }); };
  const doSample = () => { MP.closeModal(); MP.applySample(); MP.go("#/dashboard"); MP.render({ top: true }); };
  const confirmModal = (title, body, okLabel, okAction) => MP.modal(`<div class="stack"><div class="h2">${title}</div><p class="muted">${body}</p>
      <div class="modal-actions">${MP.h.quiet(MP.ui("keepWork"), "modal-close")}${MP.h.secondary(okLabel, okAction)}</div></div>`);
  MP.on("reset", () => {
    if (!hasWork()) return doReset();
    confirmModal(MP.t({ en: "Start over?", zh: "重新开始？" }),
      MP.t({ en: "This clears your answers on this device. It can't be undone.", zh: "这会清除本设备上的所有回答，清除后无法恢复。" }),
      MP.t({ en: "Clear and start over", zh: "清除并重新开始" }), "reset-confirm");
  });
  MP.on("reset-confirm", doReset);
  MP.on("sample", () => {
    if (!hasWork()) return doSample();
    confirmModal(MP.t({ en: "Replace your progress with a sample student?", zh: "用示例学生替换你的进度？" }),
      MP.t({ en: "Your answers on this device will be replaced by a sample student's, so you can see finished lenses and a full Brief. It can't be undone.", zh: "本设备上的回答会被示例学生的内容替换，方便你查看已完成的视角和完整的小结。替换后无法恢复。" }),
      MP.t({ en: "Load the sample", zh: "载入示例" }), "sample-confirm");
  });
  MP.on("sample-confirm", doSample);
  MP.on("account", () => {
    MP.modal(`<div class="stack"><div class="h2">${MP.t({ en: "Keep your progress on any device", zh: "在任何设备上保留进度" })}</div>
      <p class="muted">${MP.t({ en: "Optional. Everything already saves on this device. An account just lets you come back from another one. We only ask for an email.", zh: "可选。所有内容已保存在本设备上。账户只是让你能从其他设备回来，我们只需要邮箱。" })}</p>
      <div class="field"><label for="acc-email">${MP.t({ en: "Email", zh: "邮箱" })}</label><input class="input" id="acc-email" type="email" placeholder="you@example.com"></div>
      <div class="modal-actions">${MP.h.quiet(MP.t({ en: "Not now", zh: "暂不" }), "modal-close")}${MP.h.primary(MP.t({ en: "Send me a sign-in link", zh: "发送登录链接" }), "account-save", "", { sm: true })}</div>
      <p class="tiny faint">${MP.t({ en: "Prototype: no email is sent.", zh: "原型：不会真正发送邮件。" })}</p></div>`);
  });
  MP.on("account-save", () => { const v = (document.getElementById("acc-email") || {}).value || ""; if (!/.+@.+\..+/.test(v)) { MP.toast(MP.t({ en: "Please enter a valid email.", zh: "请输入有效邮箱。" })); return; } MP.state.account = { email: v }; MP.closeModal(); MP.commit(); MP.toast(MP.t({ en: "Saved to your account.", zh: "已保存到账户。" })); });

  /* ================= sample preset ================= */
  MP.applySample = function () {
    const s = fresh(); s.lang = MP.state.lang;
    s.qs = { fields: ["ds", "ba"], ask: "diff" }; s.recommended = "ba";
    s.profile = { stage: "exploring", background: "business", regions: ["us", "uk"] };
    MP.state = s;
    MP.lensOrder.forEach((id) => { const L = MP.lenses[id]; if (L && L.sample) { const ls = MP.ls(id); L.sample(ls); } });
    MP.save();
  };

  /* ================= shell render ================= */
  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 22 L29 5 L18 27 L15 18 Z" fill="#304ffe"/><path d="M15 18 L29 5 L18 27 Z" fill="#f45b35"/></svg>';
  function header(route) {
    const cur = route.name;
    const navItem = (hash, key, names) => `<a href="${hash}" ${names.includes(cur) ? 'aria-current="page"' : ""}>${MP.ui(key)}</a>`;
    return `<header class="site-header" id="site-header"><div class="container">
      <a class="brand" href="#/home" aria-label="MajorPilot">${LOGO}<span>MajorPilot</span></a>
      <nav class="nav" aria-label="${esc(MP.ui("mainNav"))}">${navItem("#/explore", "explore", ["explore"])}${navItem("#/dashboard", "progress", ["dashboard", "lens"])}${navItem("#/brief", "brief", ["brief", "compare"])}</nav>
      <div class="header-tools">
        ${hasWork() || !MP.saveOk ? `<span class="save-state" role="status" title="${esc(MP.state.account ? MP.t({ en: "Your work saves automatically to your account", zh: "进度自动保存到你的账户" }) : MP.t({ en: "Your work saves automatically on this device", zh: "进度自动保存在本设备" }))}"><i style="${MP.saveOk ? "" : "background:var(--warn)"}" aria-hidden="true"></i><span class="txt">${MP.saveOk ? MP.ui(MP.state.account ? "savedAcct" : "saved") : MP.ui("notSaved")}</span></span>` : ""}
        <div class="lang-toggle" role="group" aria-label="${esc(MP.ui("language"))}">${[["en", "EN"], ["zh", "中文"]].map(([v, l]) => `<button aria-pressed="${MP.lang() === v}" data-action="lang" data-arg="${v}" data-fk="lang:${v}">${l}</button>`).join("")}</div>
        ${MP.state.account ? `<span class="icon-link" title="${esc(MP.state.account.email)}"><i class="acct-dot" aria-hidden="true"></i><span class="long">${esc(MP.state.account.email.split("@")[0])}</span><span class="short">${MP.t({ en: "Saved", zh: "已登录" })}</span></span>` : `<button class="icon-link" data-action="account" aria-label="${esc(MP.ui("saveProgress"))}"><span class="long">${MP.ui("saveProgress")}</span><span class="short">${MP.ui("saveShort")}</span></button>`}
      </div></div></header>`;
  }
  /** Ink colophon: the big wordmark, the data's own mark (the 12-cohort line splitting into three beams) and the
      dataset line — every count computed from MP.data. */
  function footer(route) {
    const compact = route && route.name === "lens";   // work screens: one quiet row, so the wordmark never competes with the task
    const L = MP.live, n = MP.n;
    const facts = MP.t({ en: `Every chart is drawn live from one teaching dataset: <b>${n(MP.data.cohorts.length)} cohorts</b> · <b>${n(L.signups)} signups</b> · <b>${n(L.routerTotal)} help messages</b>.`,
      zh: `所有图表都由<span class="nowrap">同一份教学数据</span><span class="nowrap">实时绘制</span>：<b>${n(MP.data.cohorts.length)} 批学员</b> · <b>${n(L.signups)} 人报名</b> · <b>${n(L.routerTotal)} 条求助消息</b>。` });
    // the ONE disclosure for the whole AI layer (no per-element labels anywhere else)
    const aiLine = `<p class="ft-ai">${MP.ai ? MP.ai.mark({ size: 13 }) : ""}<span>${MP.t({ en: "AI responses in this prototype are simulated.", zh: "本原型中的 AI 回复为模拟生成。" })}</span></p>`;
    const school = MP.pages.school ? MP.h.quiet(MP.t({ en: "For advising offices →", zh: "给顾问办公室 →" }), "go", "#/school") : "";
    if (compact) return `<footer class="site-footer on-ink no-print compact"><div class="container">
      <div class="ft-row"><div class="ft-mark" aria-hidden="true">${LOGO}<span>MajorPilot</span></div>
      <div class="ld-colophon">${MP.draw.colophonMark()}<div class="ft-sub"><p>${facts}</p>${aiLine}</div></div>
      <span class="row ft-tools" style="gap:18px">${MP.h.quiet(MP.ui("sample"), "sample")}${MP.h.quiet(MP.ui("reset"), "reset")}</span></div></div></footer>`;
    return `<footer class="site-footer on-ink no-print"><div class="container">
      <div class="ft-mark" aria-hidden="true">${LOGO}<span>MajorPilot</span></div>
      <div class="ld-colophon">${MP.draw.colophonMark()}<p>${facts}</p></div>
      <div class="ft-bottom spread"><div class="ft-sub"><span>MajorPilot · ${MP.t(MP.data.fictional)}</span>${aiLine}</div>
      <span class="ft-links">${school}${MP.h.quiet(MP.ui("sample"), "sample")}${MP.h.quiet(MP.ui("reset"), "reset")}</span></div></div></footer>`;
  }

  const app = () => document.getElementById("app");
  /** Rail scroll hint: fade the left edge only when scrolled, the right edge only when more steps sit off-screen. */
  function railFade(ol) {
    const max = ol.scrollWidth - ol.clientWidth;
    ol.classList.toggle("fade-l", max > 1 && ol.scrollLeft > 1);
    ol.classList.toggle("fade-r", max > 1 && ol.scrollLeft < max - 1);
  }
  /** Center the current step when the rail scrolls (so the previous step shows to its left); step 1 stays flush left. */
  function placeRail(ol) {
    const cur = ol.querySelector("li.current");
    if (cur && ol.scrollWidth > ol.clientWidth + 1) {
      if (!cur.previousElementSibling) ol.scrollLeft = 0;
      else {
        const o = ol.getBoundingClientRect(), c = cur.getBoundingClientRect();
        ol.scrollLeft = Math.max(0, ol.scrollLeft + (c.left - o.left) - (o.width - c.width) / 2);   // the browser clamps the far end
      }
    }
    railFade(ol);
  }
  window.addEventListener("resize", () => { const ol = document.querySelector(".rail ol"); if (ol) railFade(ol); }, { passive: true });
  let lastRouteKey = "";
  // routes seen this session (sessionStorage, guarded: it can throw in private windows)
  const seen = (() => { try { return JSON.parse(sessionStorage.getItem("mp-seen") || "{}") || {}; } catch (e) { return {}; } })();
  const markSeen = (k) => { seen[k] = 1; try { sessionStorage.setItem("mp-seen", JSON.stringify(seen)); } catch (e) { /* fine */ } };
  let forceFirst = false;
  /** True until a route ("home", "lens/ba/funnel") has been arrived at once this session. */
  MP.firstVisit = (k) => !seen[k];
  /** Replay the current route's full intro (e.g. a click on the hero figure). */
  MP.replay = function () { forceFirst = true; MP.render({ top: false, replay: true }); };
  MP.render = function (opts) {
    opts = opts || {};
    closePop();
    const route = MP.route(), key = location.hash;
    const nav = key !== lastRouteKey; lastRouteKey = key;
    document.documentElement.lang = MP.lang() === "zh" ? "zh-CN" : "en";
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    const y = window.scrollY;
    let html;
    try {
      if (route.name === "lens") html = renderLens(route.a, route.b);
      else { const P = MP.pages[route.name] || MP.pages.home; html = P ? P.render(route) : `<div class="container page"><p class="lede">${MP.ui("renderError")}</p></div>`; }
    } catch (e) { console.error(e); html = `<div class="container page"><div class="notice warn">${MP.ui("renderError")}</div></div>`; }
    const titleBits = { home: "", explore: MP.ui("explore"), dashboard: MP.ui("progress"), brief: MP.ui("brief"), compare: MP.t({ en: "Compare", zh: "比较" }), school: MP.t({ en: "For advising offices", zh: "顾问办公室视图" }), lens: route.a && MP.lensInfo[route.a] ? MP.lensInfo[route.a].short : "" };
    document.title = "MajorPilot" + (titleBits[route.name] ? " · " + titleBits[route.name] : "");
    // arrival classes: .enter on a fresh arrival; .first the first time this route is seen this session (full intros),
    // .again on later arrivals (short settle). MP.replay() forces .first.
    const enter = nav || opts.top || opts.replay, rk = [route.name, route.a, route.b].filter(Boolean).join("/");
    const first = enter && (forceFirst || !seen[rk]);
    if (enter) markSeen(rk);
    forceFirst = false;
    document.documentElement.style.setProperty("--clock", (-(performance.now() / 1000)).toFixed(2) + "s");
    app().innerHTML = header(route) + `<div id="view" class="${enter ? "enter " + (first ? "first" : "again") : ""}">${html}</div>` + footer(route);
    const P = route.name === "lens" ? null : MP.pages[route.name];
    if (P && P.mount) { try { P.mount(app(), route); } catch (e) { console.error(e); } }
    if (route.name === "lens" && MP.lenses[route.a] && MP.lenses[route.a].mount) { try { MP.lenses[route.a].mount(app(), MP.ls(route.a)); } catch (e) { console.error(e); } }
    if (nav || opts.top) window.scrollTo(0, 0); else window.scrollTo(0, y);
    // phone/tablet: the rail is a horizontal strip — bring the current step into view with the step before it peeking in
    const railOl = app().querySelector(".rail ol");
    if (railOl) {
      placeRail(railOl);
      railOl.addEventListener("scroll", () => railFade(railOl), { passive: true });
      // web fonts can change the item widths after the first paint: re-place once, unless the student already scrolled it
      if (document.fonts && document.fonts.status !== "loaded") { const at = railOl.scrollLeft; document.fonts.ready.then(() => { if (railOl.isConnected && Math.abs(railOl.scrollLeft - at) < 2) placeRail(railOl); }); }
    }
    app().querySelectorAll("input.mp-range").forEach(MP.rangeFill);
    // a lens mount() may set slider values after this point; paint once more on the next frame
    requestAnimationFrame(() => app().querySelectorAll("input.mp-range").forEach(MP.rangeFill));
    // living data: scroll reveals + count-ups on arrival. html.ld-live (which is what lets below-the-fold intros wait,
    // paused) is set only once this succeeded, so a failure leaves every element in its visible base state.
    try { MP.live.after(app(), enter); document.documentElement.classList.toggle("ld-live", MP.live.motionOK()); }
    catch (e) { document.documentElement.classList.remove("ld-live"); app().querySelectorAll(".ld-reveal, [data-reveal]").forEach((x) => x.classList.add("is-in")); console.error(e); }
    // AI layer: streaming phases, caret, height growth, skip, lights, textarea highlights (finished text without it)
    if (MP.ai) { try { MP.ai.after(app()); } catch (e) { console.error(e); } }
    if (fk && !nav) { const el = app().querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) el.focus({ preventScroll: true }); }
    else if (nav) { const h = app().querySelector("#view h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); h.style.outline = "none"; } }
  };

  /* ================= events ================= */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (pop && !e.target.closest(".pop") && !(el && el.dataset.action === "term")) closePop();
    if (!el || el.disabled) return;
    const fn = MP.actions[el.dataset.action]; if (!fn) return;
    e.preventDefault(); fn(el, el.dataset.arg, e);
  });
  document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("input.mp-range")) MP.rangeFill(e.target); const el = e.target.closest("[data-input]"); if (el && MP.inputs[el.dataset.input]) MP.inputs[el.dataset.input](el, e); });
  document.addEventListener("change", (e) => { if (e.target.matches && e.target.matches("input.mp-range")) MP.rangeFill(e.target); const el = e.target.closest("[data-change]"); if (el && MP.inputs[el.dataset.change]) MP.inputs[el.dataset.change](el, e); });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.fold) { MP.state.ui.folds[d.dataset.fold] = d.open; MP.save(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); MP.closeModal(); } });
  window.addEventListener("scroll", () => { const h = document.getElementById("site-header"); if (h) h.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
  window.addEventListener("hashchange", () => MP.render());

  /* ================= boot ================= */
  MP.boot = function () {
    const q = new URLSearchParams(location.search);
    // language first, then the preset: the lenses' sample() writes the student's notes in the current language
    const lq = q.get("lang");
    if (lq === "zh" || lq === "en") MP.state.lang = lq;
    if (q.get("preset") === "sample") MP.applySample();          // keeps MP.state.lang
    if (q.get("preset") === "fresh") MP.resetState(true);        // keeps MP.state.lang
    if (MP.ai) MP.ai.boot(q);                                    // ?ai=instant | fresh | live (after the preset, which resets MP.state.ai)
    if (q.has("preset") || q.has("lang") || q.has("ai")) { MP.save(); history.replaceState(null, "", location.pathname + location.hash); }
    MP.render({ top: true });
  };
})();
