/* MajorPilot redesign — the shared AI kit (MP.ai). Core-owned. Spec: AI-LAYER.md §3; API + examples: CONTRACT.md §9.
   No model is connected. Every response is composed by deterministic code from the student's real inputs and MP.data,
   validated (MP.ai.check), and only then PRESENTED like a grounded model response: a short reading trace that names what
   it looked at, natural-pace token streaming with a soft caret, the student's own words quoted back, evidence chips that
   link to their step, regenerate, tone/length, and an honest "I can't tell".
   String-first: render helpers return HTML with the FINAL text already in place (tokens are CSS-delayed spans), so a
   static capture, print, reduced motion, ?ai=instant or a script failure always shows finished, readable text.
   MP.ai.after(root) (called by MP.render after mount) adds the live layer: phases, caret, height growth, skip, lights. */
(function () {
  "use strict";
  const MP = window.MP;
  const esc = MP.h.esc;
  const A = MP.ai = MP.ai || {};
  const now = () => (window.performance ? performance.now() : Date.now());
  const isZh = () => MP.lang() === "zh";
  const T = (en, zh) => ({ en, zh });

  /* ============================== mode ============================== */
  const MODE_KEY = "mp-ai-mode";
  let printing = false;
  A.instant = (() => { try { return sessionStorage.getItem(MODE_KEY) === "instant"; } catch (e) { return false; } })();
  /** Read ?ai=instant|fresh|live (MP.boot calls this before it strips the query). */
  A.boot = function (q) {
    const m = q && q.get("ai");
    if (m === "instant") A.instant = true;
    if (m === "live" || m === "fresh") A.instant = false;
    if (m === "fresh") { A.state().seen = {}; A.state().regen = {}; }
    if (m) { try { if (A.instant) sessionStorage.setItem(MODE_KEY, "instant"); else sessionStorage.removeItem(MODE_KEY); } catch (e) { /* fine */ } }
  };
  /** True when AI surfaces may animate: not instant, motion allowed, not printing. */
  A.motion = () => !A.instant && !printing && MP.live.motionOK();

  /** MP.state.ai with defaults filled in (core's fresh() also seeds it). */
  A.state = function () {
    const s = MP.state.ai || (MP.state.ai = {});
    s.seen = s.seen || {}; s.regen = s.regen || {}; s.fb = s.fb || {};
    s.prefs = Object.assign({ tone: "gentle", length: "short" }, s.prefs || {});
    s.dash = s.dash || { shown: [], hidden: [] };
    return s;
  };

  /* ============================== determinism ============================== */
  /** FNV-1a, 32-bit. */
  A.hash = function (str) {
    str = String(str == null ? "" : str);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  /** mulberry32 → () => [0,1) */
  A.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  A.pick = (list, seed) => (list && list.length ? list[(seed >>> 0) % list.length] : undefined);
  A.fp = (obj) => A.hash(JSON.stringify(obj == null ? null : obj)).toString(36);
  /** (base + regen[key]) % n */
  A.variant = (key, n, base) => n ? (((base >>> 0) || 0) + (A.state().regen[key] || 0)) % n : 0;
  const regenFlag = {};
  /** Regenerate: bump the key's counter (the next render of that key streams faster, as a rewording). Returns the new n. */
  A.bump = function (key) { const r = A.state().regen; r[key] = (r[key] || 0) + 1; regenFlag[key] = true; return r[key]; };
  /** Pick a phrasing. variants: {en:[…], zh:[…]} or [{en,zh}, …] or [string, …]. */
  A.say = function (variants, key, base) {
    if (!variants) return "";
    const list = Array.isArray(variants) ? variants : (variants[MP.lang()] || variants.en || []);
    if (!list.length) return "";
    return MP.t(list[A.variant(key, list.length, base)]);
  };

  /* ============================== cache ============================== */
  // In-memory record of what is streaming right now, so a re-render (MP.commit happens on every click) RESUMES the
  // stream at the right point instead of restarting or snapping to the end.
  const live = {};
  /** Has this exact output (key + fp) been shown? true → stream it (and it is recorded as shown); false → render static.
      Also true while that same output is still mid-stream from an earlier render (it then resumes). */
  A.fresh = function (key, fp) {
    const S = A.state(), L = live[key];
    fp = String(fp);
    if (L && L.fp === fp && !L.done && (L.t0 == null || now() - L.t0 < (L.total || 0) + 120)) return A.motion();
    if (S.seen[key] === fp) return false;
    S.seen[key] = fp; MP.save();
    if (!A.motion()) return false;
    live[key] = { fp, t0: null, total: 0, done: false };
    return true;
  };
  /** Forget a key (the next render with any fp streams again). */
  A.forget = function (key) { delete A.state().seen[key]; delete live[key]; };

  /* ============================== text toolkit ============================== */
  const CJK = /[㐀-䶿一-鿿豈-﫿]/;
  const CJK_G = /[㐀-䶿一-鿿豈-﫿]/g;
  A.text = {
    lang(s) {
      s = String(s || ""); const c = (s.match(CJK_G) || []).length, l = (s.match(/[A-Za-z]+/g) || []).length;
      if (!c && !l) return MP.lang();
      if (c && l && Math.min(c / 1.8, l) / Math.max(c / 1.8, l) > 0.35) return "mixed";
      return c / 1.8 >= l ? "zh" : "en";
    },
    chars(s) { return String(s || "").replace(/\s+/g, "").length; },
    /** en words; zh characters / 1.8 (for thresholds that need "words"). */
    words(s) { s = String(s || ""); const c = (s.match(CJK_G) || []).length; const w = (s.replace(CJK_G, " ").match(/[A-Za-z0-9][A-Za-z0-9'’.,%-]*/g) || []).length; return w + Math.round(c / 1.8); },
    /** [{s, e, text}] split on . ! ? 。！？ (offsets into the original). */
    sentences(s) {
      s = String(s || ""); const out = []; let a = 0;
      const push = (b) => { const t = s.slice(a, b), lead = t.match(/^\s*/)[0].length, tt = t.trim(); if (tt) out.push({ s: a + lead, e: a + lead + tt.length, text: tt }); a = b; };
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (!/[.!?。！？]/.test(c)) continue;
        if (c === "." && /\d/.test(s[i - 1] || "") && /\d/.test(s[i + 1] || "")) continue;   // 62.5
        let j = i + 1; while (j < s.length && /[.!?。！？"”’)」]/.test(s[j])) j++;
        push(j); i = j - 1;
      }
      push(s.length);
      return out;
    },
    first(s) { return A.text.sentences(s)[0] || { s: 0, e: 0, text: "" }; },
    /** [{v, raw, s, e, unit}] — 1,404 · 62.5% · 3.25 pts · 6.5 个百分点 */
    numbers(s) {
      s = String(s || ""); const out = []; const re = /\d[\d,]*(?:\.\d+)?\s*(%|pts?\b|points?\b|个百分点|个点)?/g; let m;
      while ((m = re.exec(s))) { const raw = m[0].trim(); out.push({ v: +raw.replace(/[^\d.]/g, "") || 0, raw, s: m.index, e: m.index + raw.length, unit: m[1] ? (m[1] === "%" ? "%" : "pts") : "" }); }
      return out;
    },
    near(v, known, tol) {
      tol = tol == null ? 0.15 : tol; let best = null, bd = Infinity;
      (known || []).forEach((k) => { const d = Math.abs(+k - v); if (d < bd) { bd = d; best = +k; } });
      return { match: bd <= tol, nearest: best };
    },
    /** [{s, e, w}] — en: word boundary, case-insensitive; zh: plain substring. lexicon: [..] or {en:[..], zh:[..]} */
    find(s, lexicon) {
      s = String(s || ""); const out = [];
      const list = Array.isArray(lexicon) ? lexicon : [].concat(lexicon && lexicon.en || [], lexicon && lexicon.zh || []);
      list.forEach((w) => {
        if (!w) return;
        if (CJK.test(w)) { let i = s.indexOf(w); while (i >= 0) { out.push({ s: i, e: i + w.length, w }); i = s.indexOf(w, i + w.length); } }
        else { const re = new RegExp("(^|[^A-Za-z0-9])(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?=$|[^A-Za-z0-9])", "gi"); let m; while ((m = re.exec(s))) { const st = m.index + m[1].length; out.push({ s: st, e: st + m[2].length, w }); } }
      });
      return out.sort((a, b) => a.s - b.s);
    },
    /** The clause around offset `at`, trimmed at , ; — ， 、 ； and sentence ends, to ≤ maxWords (en) / maxChars (zh). */
    clause(s, at, o) {
      s = String(s || ""); o = o || {}; const maxW = o.maxWords || 12, maxC = o.maxChars || 20;
      at = Math.max(0, Math.min(s.length, at || 0));
      const B = /[,;:—–，、；：.!?。！？\n]/;
      // number punctuation (2.5, 6,000) is never a clause boundary: test boundaries on a masked copy (same length)
      const mk = s.replace(/(\d)[.,](?=\d)/g, "$1·");
      let a = at; while (a > 0 && !B.test(mk[a - 1])) a--;
      let b = at; while (b < s.length && !B.test(mk[b])) b++;
      while (a < b && /\s/.test(s[a])) a++; while (b > a && /\s/.test(s[b - 1])) b--;
      let text = s.slice(a, b);
      if (A.text.lang(text) === "zh") {
        if (text.length > maxC) { const off = Math.max(0, Math.min(at - a - Math.floor(maxC / 2), text.length - maxC)); a += off; text = s.slice(a, a + maxC); b = a + maxC; }
      } else {
        const ws = text.split(/(\s+)/); const n = ws.filter((x) => x.trim()).length;
        if (n > maxW) {
          // keep the window of maxWords words that contains `at`
          const toks = []; let p = a; ws.forEach((x) => { if (x.trim()) toks.push({ s: p, e: p + x.length }); p += x.length; });
          let k = toks.findIndex((t) => at < t.e); if (k < 0) k = toks.length - 1;
          const st = Math.max(0, Math.min(k - Math.floor(maxW / 3), toks.length - maxW));
          a = toks[st].s; b = toks[st + maxW - 1].e; text = s.slice(a, b);
        }
      }
      return { s: a, e: b, text };
    },
    /** Exact substring s..e of src, trimmed at clause boundaries, with … where it was cut. */
    quote(src, s, e) {
      src = String(src || ""); s = Math.max(0, s || 0); e = Math.min(src.length, e == null ? src.length : e);
      // never cut inside a figure ("2.5", "6,000"): widen the span to the whole number
      while (e < src.length && /\d/.test(src[e - 1] || "") && /[.,]/.test(src[e]) && /\d/.test(src[e + 1] || "")) { e += 2; while (e < src.length && /\d/.test(src[e])) e++; }
      while (s > 1 && /\d/.test(src[s] || "") && /[.,]/.test(src[s - 1]) && /\d/.test(src[s - 2])) { s -= 2; while (s > 0 && /\d/.test(src[s - 1])) s--; }
      let t = src.slice(s, e).trim().replace(/^[,;:—–，、；：\s]+|[,;:—–，、；：\s]+$/g, "");
      // "…" only where the cut falls mid-clause (a cut at , ; — or a sentence end needs none)
      const cutL = s > 0 && !/[.!?。！？\n,;:—–，、；：]\s*$/.test(src.slice(0, s)), cutR = e < src.length && !/^\s*[.!?。！？,;:—–，、；：\n]/.test(src.slice(e));
      return (cutL ? "…" : "") + t + (cutR ? "…" : "");
    }
  };

  /* ============================== lexicons ============================== */
  A.lex = {
    hedge: { en: ["maybe", "might", "I think", "probably", "kind of", "sort of", "perhaps", "I guess", "possibly"], zh: ["可能", "也许", "大概", "我觉得", "感觉", "或许", "好像"] },
    overclaim: { en: ["proves", "proved", "definitely", "clearly", "certainly", "100%", "will fix", "always", "guaranteed", "no doubt"], zh: ["证明", "肯定", "一定", "显然", "必然", "毫无疑问", "百分之百"] },
    causal: { en: ["caused", "causes", "because of", "led to", "due to", "results in"], zh: ["导致", "就是因为", "造成", "引起"] },
    jargon: { en: ["significant", "significance", "p-value", "regression", "confidence interval", "statistically"], zh: ["显著", "回归", "置信区间", "p 值", "p值"] },
    surprise: { en: ["expected", "surprised", "surprising", "click", "clicked", "realised", "realized", "didn't think", "did not think", "turns out", "never thought"], zh: ["没想到", "原来", "才明白", "一下子", "意外", "惊讶", "想不到"] },
    positive: { en: ["fun", "enjoyed", "liked", "loved", "interesting", "satisfying", "cool"], zh: ["有意思", "喜欢", "好玩", "有趣", "过瘾"] },
    negative: { en: ["boring", "confusing", "confused", "lost", "tedious", "frustrating", "hard to follow", "overwhelming"], zh: ["无聊", "困惑", "看不懂", "晕", "枯燥", "烦"] },
    actionVerb: { en: ["fix", "test", "run", "start", "add", "raise", "rewrite", "send", "try", "pilot", "change", "launch", "improve", "focus"], zh: ["先修", "修", "测试", "试行", "增加", "提高", "改写", "发送", "试试", "改进", "优先"] },
    // never in AI output (checked on every composed string). Coach, never grader.
    banned: {
      en: ["fit score", "good fit", "a fit for", "fits you", "suits you", "suited", "suitable for you", "talent", "talented", "natural at", "good at", "great at", "admission", "admissions", "admitted", "your chances", "chance of getting", "your score", "you scored", "ranking", "ranked", "percentile", "your grade", "great job", "well done", "excellent", "perfect", "correct answer", "wrong answer", "you got it right", "you got it wrong"],
      zh: ["适合", "天赋", "擅长", "录取", "概率", "分数", "排名", "百分位", "做得很好", "太棒了", "答对", "答错", "正确答案", "错误答案"]
    }
  };

  /* ============================== validation ============================== */
  const strip = (h) => String(h == null ? "" : h).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  let autoSrc = null;
  /** Step titles and funnel step names (both languages): quoting those is quoting the product, not inventing. */
  function autoSources() {
    if (autoSrc) return autoSrc;
    const out = [];
    const add = (x) => { if (!x) return; if (typeof x === "string") out.push(strip(x)); else { if (x.en) out.push(strip(x.en)); if (x.zh) out.push(strip(x.zh)); } };
    Object.values(MP.lenses || {}).forEach((L) => (L.steps || []).forEach((s) => { add(s.title); add(s.short); }));
    add(MP.UI.reflectTitle);
    (MP.data.funnelSteps || []).forEach((f) => { add(f); if (f && f.short) add(f.short); });
    Object.values(MP.lensInfo || {}).forEach((i) => { add(i.name); add(i.question); });
    if (Object.keys(MP.lenses || {}).length) autoSrc = out;
    return out;
  }
  /** Validate a composed response BEFORE anything renders.
      text: html string or segments. o: {numbers: [known values], sources: [student texts], tol}
      Fails on: banned lexicon; a number not in `numbers` (when given; 0–12 integers always pass: steps, counts);
      a quoted span ({q} segment, or “…” / 「…」 in text when `sources` is given) that isn't a substring of a source. */
  A.check = function (text, o) {
    o = o || {};
    const segs = Array.isArray(text) ? A.flat(text) : null;
    const plain = segs ? A.plain(segs) : strip(text);
    const fail = (why) => { if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) console.warn("[MP.ai.check]", why, "·", plain.slice(0, 120)); return { ok: false, why }; };
    const low = plain.toLowerCase();
    for (const w of A.lex.banned.en) { if (new RegExp("(^|[^a-z])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z])", "i").test(low)) return fail("banned: " + w); }
    for (const w of A.lex.banned.zh) { if (plain.includes(w)) return fail("banned: " + w); }
    if (o.numbers) {
      const known = o.numbers.map(Number).filter((x) => !isNaN(x));
      const quoted = segs ? segs.filter((s) => s && s.q != null).map((s) => String(s.q)).join(" ") : "";
      for (const n of A.text.numbers(plain)) {
        if (quoted.includes(n.raw)) continue;                  // numbers inside the student's own words are theirs
        if (Number.isInteger(n.v) && n.v <= 12) continue;
        if (!A.text.near(n.v, known, o.tol).match) return fail("unknown number: " + n.raw);
      }
    }
    if (o.sources) {
      const srcs = o.sources.map((x) => strip(x)).concat(autoSources());
      // a quote part must be a substring of a source, and must not stop (or start) inside a figure: "…a 2" of "a 2.5 point"
      const whole = (s, p) => { let i = s.indexOf(p); while (i >= 0) { const after = s.slice(i + p.length, i + p.length + 2), before = s.slice(Math.max(0, i - 2), i); if (!(/\d$/.test(p) && /^[.,]\d/.test(after)) && !(/^\d/.test(p) && /\d[.,]$/.test(before))) return true; i = s.indexOf(p, i + 1); } return false; };
      const unq = (p) => [p, p.replace(/[‘「]/g, "“").replace(/[’」]/g, "”"), p.replace(/[‘’]/g, "'")];
      const okQ = (q) => String(q).split("…").map((p) => p.trim()).filter(Boolean).every((p) => unq(p).some((pp) => srcs.some((s) => whole(s, pp))));
      if (segs) for (const s of segs) { if (s && s.q != null && !okQ(s.q)) return fail("quote not found: " + s.q); }
      const textOnly = segs ? A.plain(segs.filter((s) => !(s && s.q != null))) : plain;
      const re = /“([^“”]{2,})”|「([^「」]{2,})」/g; let m;
      while ((m = re.exec(textOnly))) { if (!okQ(m[1] || m[2])) return fail("quote not found: " + (m[1] || m[2])); }
    }
    return { ok: true, why: "" };
  };
  /** Return the first variant that passes check(), else null (callers then show their deterministic fallback). */
  A.firstOk = function (cands, o) { for (const c of cands || []) { if (c != null && A.check(c, o).ok) return c; } return null; };

  /** Quotes inside a quote would nest (“Fix “Active in week 1…” first.”): inner double quotes become ‘ ’ (en) or 「 」 (zh). */
  function innerQ(q) { q = String(q); return CJK.test(q) ? q.replace(/“/g, "「").replace(/”/g, "」") : q.replace(/“/g, "‘").replace(/”/g, "’"); }
  A.text.inner = innerQ;

  /* ============================== segments ============================== */
  // A segment is: html string (trusted copy, like MP.t text) | {text} escaped plain text | {q, lens} the student's own
  // words (exact substring, shown sans in curly quotes with a lens wash) | {b} a bold figure (one token) | {nw} a
  // no-wrap pair ("75.0% → 62.5%", one token) | {em} italic | {cite: {lens, step, label, src}} an inline chip |
  // {br: true} a line break | {html} one atomic token | {en, zh} → localized first.
  const isLoc = (x) => x && typeof x === "object" && !Array.isArray(x) && ("en" in x || "zh" in x) && !("q" in x) && !("cite" in x) && !("b" in x) && !("text" in x);
  /** Localize and flatten to one segment list. */
  A.flat = function (x) {
    if (x == null || x === false) return [];
    if (isLoc(x)) return A.flat(x[MP.lang()] != null ? x[MP.lang()] : x.en);
    if (Array.isArray(x)) return x.reduce((a, s) => a.concat(A.flat(s)), []);
    return [x];
  };
  /** Paragraphs: body → [[segments], …] */
  function paras(body) {
    if (isLoc(body)) body = body[MP.lang()] != null ? body[MP.lang()] : body.en;
    if (body == null) return [];
    if (!Array.isArray(body)) return [A.flat(body)];
    if (body.length && Array.isArray(body[0])) return body.map((p) => A.flat(p));
    return [A.flat(body)];
  }
  /** Plain text of segments (for checks, screen readers, aria). */
  A.plain = function (segs) {
    return A.flat(segs).map((s) => {
      if (typeof s === "string" || typeof s === "number") return strip(s);
      if (s.q != null) return (isZh() ? "“" : "“") + s.q + "”";
      if (s.text != null) return s.text; if (s.b != null) return strip(s.b); if (s.nw != null) return strip(s.nw); if (s.em != null) return strip(s.em);
      if (s.html != null) return strip(s.html); if (s.br) return " "; return "";
    }).join("").replace(/\s+/g, " ").trim();
  };

  /* ============================== pacing ============================== */
  const NUM_RE = /^[([“"'$€£+\-−~≈]*\d[\d,.]*(?:%|pts?)?/;
  /** Split one run of plain text into tokens [{t, n (number), end ("p" | "c" | "")}]. */
  function tokenize(text, rnd) {
    const out = [];
    if (CJK.test(text)) {
      const re = /[㐀-䶿一-鿿豈-﫿]+|[A-Za-z0-9][A-Za-z0-9.,%'’\-·:/]*\s*|\s+|[^\sA-Za-z0-9㐀-䶿一-鿿豈-﫿]+\s*/g;
      let m;
      while ((m = re.exec(text))) {
        const p = m[0];
        if (CJK.test(p[0])) { let i = 0; while (i < p.length) { const k = Math.min(p.length - i, 1 + Math.floor(rnd() * 3)); out.push({ t: p.slice(i, i + k) }); i += k; } }
        else if (/^\s+$/.test(p) || !/[A-Za-z0-9]/.test(p)) { if (out.length) out[out.length - 1].t += p; else out.push({ t: p }); }   // punctuation / spaces ride on the previous token
        else out.push({ t: p, n: /^\d/.test(p) });
      }
    } else {
      const parts = text.match(/\s+|[^\s]+/g) || [];
      parts.forEach((p) => {
        if (/^\s+$/.test(p)) { if (out.length) out[out.length - 1].t += p; else out.push({ t: p }); return; }
        if (NUM_RE.test(p) && /\d/.test(p)) { out.push({ t: p, n: true }); return; }
        const core = p.replace(/[^A-Za-z]+$/, "");
        if (core.length >= 9 && /^[A-Za-z]+$/.test(core) && rnd() < 0.65) {   // a sub-word split, the way a tokenizer would
          const cut = 3 + Math.floor(rnd() * (core.length - 5));
          out.push({ t: p.slice(0, cut), sub: true }); out.push({ t: p.slice(cut) });
        } else out.push({ t: p });
      });
    }
    out.forEach((x) => { const t = x.t.replace(/\s+$/, ""); x.end = /[.?!。？！…][”’"')」]*$/.test(t) ? "p" : /[,;:—–，、；：][”’"')」]*$/.test(t) ? "c" : ""; });
    return out;
  }
  /** Build tokens for a paragraph list → [{html, gap}] plus quote wrappers. Internal. */
  function build(pl, rnd) {
    // returns array of paragraphs, each an array of items: {tok: {t|html, n, end}, open?: html, close?: html}
    return pl.map((segs) => {
      const items = [];
      const push = (text, o) => tokenize(text, rnd).forEach((x) => items.push(Object.assign({ t: esc(x.t), n: x.n, end: x.end, sub: x.sub }, o || {})));
      const pushHTML = (html) => {
        // trusted html: element runs become atomic tokens, text runs are tokenized
        const re = /<([a-zA-Z][\w-]*)\b[^>]*>|<\/[a-zA-Z][\w-]*>|[^<]+/g; let m, depth = 0, buf = "", tag = "";
        const VOID = /^(br|img|wbr|hr|input)$/i;
        while ((m = re.exec(html))) {
          const p = m[0];
          if (depth === 0 && p[0] !== "<") { tokenize(p.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), rnd).forEach((x) => items.push({ t: esc(x.t), n: x.n, end: x.end, sub: x.sub })); continue; }
          if (p[0] === "<" && p[1] !== "/") { if (depth === 0 && VOID.test(m[1])) { items.push({ t: p, atom: true }); continue; } if (depth === 0) { buf = ""; tag = m[1]; } depth++; buf += p; continue; }
          if (p[0] === "<" && p[1] === "/") { buf += p; depth--; if (depth === 0) { const txt = strip(buf); items.push({ t: buf, atom: true, n: NUM_RE.test(txt), end: /[.?!。？！]$/.test(txt.trim()) ? "p" : "" }); buf = ""; } continue; }
          buf += p;
        }
        if (buf) items.push({ t: buf, atom: true });
      };
      segs.forEach((s) => {
        if (s == null || s === false) return;
        if (typeof s === "string" || typeof s === "number") { pushHTML(String(s)); return; }
        if (s.text != null) { push(String(s.text)); return; }
        if (s.br) { items.push({ t: "<br>", atom: true, gap0: true }); return; }
        if (s.html != null) { items.push({ t: String(s.html), atom: true }); return; }
        if (s.b != null) { items.push({ t: `<b class="rd-b">${s.b}</b>`, atom: true, n: true }); return; }
        if (s.nw != null) { items.push({ t: `<span class="nowrap">${s.nw}</span>`, atom: true, n: true }); return; }
        if (s.em != null) { items.push({ t: `<em>${s.em}</em>`, atom: true }); return; }
        if (s.cite) { items.push({ t: A.cite(Object.assign({ sup: true }, s.cite)), atom: true, cite: true }); return; }
        if (s.q != null) {
          const qi = items.length;
          push("“" + innerQ(s.q) + "”");
          if (items.length > qi) { items[qi].open = `<span class="rd-q${s.lens ? " lens-" + esc(s.lens) : ""}">`; items[items.length - 1].close = "</span>"; items[items.length - 1].qEnd = true; }
        }
      });
      return items;
    });
  }
  /** Deterministic rhythm for segments: [ms…] per token (first token at `start`). o: {cap, start, speed, lang} */
  function schedule(built, o, rnd) {
    const zh = (o.lang || MP.lang()) === "zh";
    let t = 0; const raw = [];
    built.forEach((items, pi) => items.forEach((it, i) => {
      raw.push(t);
      let g = zh ? 35 + rnd() * 25 : 28 + rnd() * 27;
      if (it.sub) g *= 0.55;                          // the second half of a split word follows quickly
      if (it.n) g *= 1.4;                             // figures "land"
      if (it.cite) g *= 0.6;
      if (it.end === "p") g += zh ? 280 : 260; else if (it.end === "c") g += zh ? 200 : 140;
      if (i === items.length - 1 && pi < built.length - 1) g += 220;     // between paragraphs
      if (it.gap0) g = 0;
      t += g;
    }));
    const span = t || 1, cap = o.cap || 1400;
    const k = (span > cap ? cap / span : 1) / (o.speed || 1);
    return { at: raw.map((x) => Math.round((o.start || 0) + x * k)), dur: Math.round(span * k) };
  }
  /** Public: the per-token schedule for segments (ms from the first token). */
  A.pace = function (segments, lang, o) { o = o || {}; const b = build(paras(segments), A.rng(A.hash(A.plain(A.flat(segments))))); return schedule(b, Object.assign({}, o, { lang }), A.rng(A.hash(A.plain(A.flat(segments))) ^ 0x9e37)).at; };

  /** Render paragraphs of tokens. Internal: returns {html, end}. */
  function renderStream(body, o) {
    o = o || {};
    const pl = paras(body), seed = A.hash(A.plain(pl.flat()) + (o.seed || ""));
    const built = build(pl, A.rng(seed));
    const sch = schedule(built, { cap: o.cap, start: o.start || 0, speed: o.speed, lang: o.lang }, A.rng(seed ^ 0x9e37));
    const off = o.offset || 0, anim = !!o.animate, tag = o.as || "p";
    // each token's delay (relative to now: a resumed stream starts partway through), and each quote's end time
    let k = 0; const ds = built.map((items) => items.map(() => sch.at[k++] - off));
    const html = built.map((items, pi) => {
      let qEnd = 0;
      return `<${tag} class="rd-p">${items.map((it, i) => {
        const d = ds[pi][i];
        let open = "";
        if (it.open) { let j = i; while (j < items.length && !items[j].qEnd) j++; qEnd = (ds[pi][Math.min(j, items.length - 1)] || d) + 140; open = anim ? it.open.replace('class="rd-q', `style="--qd:${qEnd}ms" class="rd-q`) : it.open; }
        const tok = anim ? `<span class="rd-tok${it.cite ? " rd-tok-c" : ""}" style="--d:${d}ms">${it.t}</span>` : it.t;
        return open + tok + (it.close || "");
      }).join("")}</${tag}>`;
    }).join("");
    return { html, end: (o.start || 0) + sch.dur - off };
  }
  /** Segments → HTML. Animated: token spans with CSS delays (base DOM is the final text). o: {animate, delay, cap, as, speed, offset} */
  A.stream = function (segments, o) { o = o || {}; return renderStream(segments, Object.assign({}, o, { start: o.delay || 0 })).html; };

  /* ============================== small renderers ============================== */
  const ARC = (a0, a1, r) => { const p = (a) => [8 + r * Math.cos((a - 90) * Math.PI / 180), 8 + r * Math.sin((a - 90) * Math.PI / 180)].map((v) => v.toFixed(2)).join(","); return `M${p(a0)} A${r},${r} 0 0 1 ${p(a1)}`; };
  /** The reading ring: a hollow ink ring (the node where the split mark fans out) carrying three short lens arcs.
      o: {size: 14, busy, unsure, cls} */
  A.mark = function (o) {
    o = o || {}; const sz = o.size || 14;
    return `<svg class="rd-mark${o.busy ? " busy" : ""}${o.unsure ? " unsure" : ""} ${o.cls || ""}" width="${sz}" height="${sz}" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle class="rg" cx="8" cy="8" r="6.6"/><g class="arcs"><path class="a ba" d="${ARC(-35, 35, 4.1)}"/><path class="a ds" d="${ARC(85, 155, 4.1)}"/><path class="a ai" d="${ARC(205, 275, 4.1)}"/></g></svg>`;
  };
  /** Mark + mono label. */
  A.kicker = function (label, o) { o = o || {}; return `<span class="rd-kick">${A.mark({ busy: o.busy, unsure: o.unsure })}<span class="rd-kl">${label}</span></span>`; };
  const W = {
    reading: T("Reading", "正在读"),
    read: (n) => T(`Read ${n} ${n === 1 ? "thing" : "things"}`, `读了 ${n} 处`),
    basedOn: T("Based on: ", "依据："),
    skip: T("Show it all", "直接看全文"),
    rewording: T("Rewording", "换个说法"),
    regen: T("↻ Another way to say it", "↻ 换个说法"),
    resolve: T("Got it", "知道了"),
    useful: T("Useful", "有帮助"),
    notUseful: T("Not useful", "没帮助"),
    dismiss: T("Not relevant", "不相关"),
    goStep: (l, n, t) => T(`Go to ${l} step ${n}${t ? ", " + t : ""}`, `前往 ${l} 第 ${n} 步${t ? "：" + t : ""}`),
    lookAt: (t) => T(`Show ${t} on this page`, `在本页查看：${t}`)
  };
  A.words = W;
  const normItems = (items) => (items || []).filter(Boolean).map((x) => typeof x === "string" ? { label: x } : (isLoc(x) ? { label: MP.t(x) } : Object.assign({}, x, { label: MP.t(x.label) })));
  /** Reading trace. items: [{label, src?} | string]. o: {animate, offset, done (collapsed label), at: [ms], open}
      Base DOM = the collapsed, expandable "READ 4 THINGS ▸" (the final state); the live "READING · a · b" row is shown
      by after() only while the block is reading/streaming. */
  A.trace = function (items, o) {
    o = o || {}; const its = normItems(items); if (!its.length) return "";
    const at = o.at || its.map((_, i) => i * 200), off = o.offset || 0;
    const doneL = o.done || MP.t(W.read(its.length));
    const liveRow = `<span class="rd-trace-live" aria-hidden="true"><span class="rd-tl">${MP.t(W.reading)}</span>${its.map((x, i) => `<span class="rd-ti" style="--d:${at[i] - off}ms"${x.src ? ` data-src="${esc(x.src)}"` : ""}><i></i>${esc(x.label)}</span>`).join("")}</span>`;
    const doneRow = `<details class="rd-trace-done"${o.open ? " open" : ""}><summary><span class="rd-tl">${doneL}</span><span class="rd-car" aria-hidden="true">▸</span></summary><ul>${its.map((x) => `<li><i></i>${esc(x.label)}</li>`).join("")}</ul></details>`;
    return `<div class="rd-trace">${liveRow}${doneRow}</div><span class="sr-only">${MP.t(W.basedOn)}${esc(its.map((x) => x.label).join(isZh() ? "、" : ", "))}${isZh() ? "。" : "."}</span>`;
  };
  /** Evidence chip. o: {lens, step, label, src, go, title: false, sup} → "BA·2 · FIND THE LEAK →".
      Click: lights `src` if it is on this page, else opens the step (and lights `src` there). */
  A.cite = function (o) {
    o = o || {}; const lens = o.lens, info = lens && MP.lensInfo[lens];
    let n = "", stepT = "";
    if (lens && o.step && MP.lenses[lens]) { const steps = MP.lensSteps(lens), i = steps.findIndex((s) => s.id === o.step); if (i >= 0) { n = i + 1; stepT = MP.t(steps[i].short || steps[i].title); } }
    const code = info ? info.short : "";
    const head = o.label != null ? MP.t(o.label) : (code + (n ? (isZh() ? "·第" + n + "步" : "·" + n) : ""));
    const tail = !o.sup && o.title !== false && o.label == null && stepT ? `<span class="rd-ct"> · ${esc(stepT)}</span>` : (o.title && typeof o.title !== "boolean" ? `<span class="rd-ct"> · ${esc(MP.t(o.title))}</span>` : "");
    const aria = o.aria ? MP.t(o.aria) : (n && !o.go && o.src ? MP.t(W.lookAt(head)) : n ? MP.t(W.goStep(code, n, stepT)) : strip(head));
    const arg = [lens || "", o.step || "", o.src || "", o.go ? 1 : ""].join("|");
    return `<button type="button" class="rd-cite${o.sup ? " sup" : ""}${lens ? " lens-" + lens : ""}" data-action="rd-cite" data-arg="${esc(arg)}"${o.src ? ` data-src="${esc(o.src)}"` : ""} aria-label="${esc(aria)}" data-fk="rd-cite:${esc(arg)}">${lens ? '<i class="rd-cd" aria-hidden="true"></i>' : ""}<span class="rd-ch">${head}</span>${tail}<span class="rd-ca" aria-hidden="true">→</span></button>`;
  };
  /** The student's own words: curly quotes, sans, lens wash (underline on ink). */
  A.quote = (text, lens) => `<span class="rd-q${lens ? " lens-" + esc(lens) : ""}">“${esc(innerQ(text))}”</span>`;
  /** An honest "I'm not sure" line: dashed ring + italic muted serif. o: {cls, cite} */
  A.unsure = (text, o) => { o = o || {}; return `<p class="rd-unsure ${o.cls || ""}">${A.mark({ unsure: true })}<span>${text}</span>${o.cite ? " " + A.cite(Object.assign({ sup: true }, o.cite)) : ""}</p>`; };
  /** Quiet controls under a response. o: {regen: [action, arg], count: "2 of 3", resolve: [action, arg], useful: key,
      dismiss: [action, arg], labels: {regen, resolve, dismiss}} */
  A.actions = function (o) {
    o = o || {}; const L = o.labels || {}; const b = [];
    const btn = (cls, label, action, arg, extra) => `<button type="button" class="rd-act ${cls}" data-action="${esc(action)}" data-arg="${esc(arg == null ? "" : arg)}" data-fk="${esc(action + ":" + (arg == null ? "" : arg))}"${extra || ""}>${label}</button>`;
    if (o.resolve) b.push(btn("rd-act-ok", MP.t(L.resolve || W.resolve), o.resolve[0], o.resolve[1]));
    if (o.regen) { const rb = btn("rd-act-regen", `<i aria-hidden="true">↻</i><span>${MP.t(L.regen || W.regen).replace(/^↻\s*/, "")}</span>`, o.regen[0], o.regen[1]); b.push(o.count ? `<span class="rd-regen-g">${rb}<span class="rd-count">${esc(MP.t(o.count))}</span></span>` : rb); }
    if (o.useful) { const v = A.state().fb[o.useful]; b.push(btn("rd-act-fb", MP.t(W.useful), "rd-fb", o.useful + "|up", ` aria-pressed="${v === "up"}"`) + btn("rd-act-fb", MP.t(W.notUseful), "rd-fb", o.useful + "|down", ` aria-pressed="${v === "down"}"`)); }
    if (o.dismiss) b.push(btn("rd-act-x", MP.t(L.dismiss || W.dismiss), o.dismiss[0], o.dismiss[1]));
    return b.length ? `<div class="rd-acts">${b.join("")}</div>` : "";
  };
  /** Tone / length segs. options: [[value, label], …]. Default action "rd-pref" sets MP.state.ai.prefs[name] and commits.
      o: {action, label (aria)} */
  A.seg = function (name, options, value, o) {
    o = o || {}; const act = o.action || "rd-pref";
    return `<div class="rd-seg" role="group"${o.label ? ` aria-label="${esc(MP.t(o.label))}"` : ""}>${options.map(([v, l]) => `<button type="button" aria-pressed="${v === value}" data-action="${esc(act)}" data-arg="${esc(name + ":" + v)}" data-fk="${esc(act + ":" + name + ":" + v)}">${MP.t(l)}</button>`).join("")}</div>`;
  };
  /** Suggested follow-up questions (no free-text box anywhere). list: [{label, action, arg}] */
  A.chips = function (list, o) {
    o = o || {}; list = (list || []).filter(Boolean); if (!list.length) return "";
    return `<div class="rd-sugg${o.cls ? " " + o.cls : ""}" role="group"${o.label ? ` aria-label="${esc(MP.t(o.label))}"` : ""}>${list.map((c) => `<button type="button" class="rd-chip" data-action="${esc(c.action)}" data-arg="${esc(c.arg || "")}" data-fk="${esc(c.action + ":" + (c.arg || ""))}"><span class="rd-chip-i" aria-hidden="true">↳</span><span>${MP.t(c.label)}</span></button>`).join("")}</div>`;
  };

  /* ============================== the standard AI surface ============================== */
  /** o: {key, fp, kind: "note"|"answer"|"line"|"ink", kicker, trace: [items], traceDone, body (segments | [[…],[…]] | html),
          cites: [cite opts], actions: html, unsure, cls, lens, live: true, animate (override fresh), cap, grow, id,
          check: {numbers, sources}, fallback: html, label (aria-label), speed, scan: selector}
      Calls fresh(key, fp) itself unless `animate` is given. Returns the HTML string. */
  const CAP = { note: 1400, answer: 1800, line: 1200, ink: 1800 };
  A.block = function (o) {
    o = o || {};
    const kind = o.kind || "note";
    if (o.check) {
      const r = A.check(paras(o.body).flat(), o.check);
      if (!r.ok) return o.fallback != null ? o.fallback : "";
    }
    const key = o.key || "rd." + A.fp([o.kicker, A.plain(paras(o.body).flat())]);
    const fp = o.fp != null ? String(o.fp) : A.fp(A.plain(paras(o.body).flat()));
    const isNew = A.state().seen[key] !== fp;
    let animate = o.animate != null ? (!!o.animate && A.motion()) : A.fresh(key, fp);
    const L = live[key];
    const t = now();
    if (animate && L && o.wait && L.t0 == null && L.wait == null) L.wait = true;
    if (animate && L && L.t0 == null && !L.wait) { L.t0 = t; L.regen = null; }
    const offset = animate && L && L.t0 != null ? Math.max(0, t - L.t0) : 0;
    if (animate && L && L.regen == null) L.regen = !!regenFlag[key];   // decided once per stream, so a resumed render keeps its schedule
    delete regenFlag[key];
    const regen = !!(animate && L && L.regen);
    const items = normItems(o.trace);
    // trace timing: 180–240ms apart (seeded), ≤ 1.2s; a regen re-reads quickly
    const rnd = A.rng(A.hash(key + fp));
    const gaps = items.map(() => (regen ? 70 : 180 + rnd() * 60));
    let acc = 0; const at = gaps.map((g) => { const a = acc; acc += g; return a; });
    const traceDur = items.length ? Math.min(regen ? 320 : 1200, acc + (regen ? 40 : 120)) : 0;
    const start = (items.length ? traceDur + 120 : 90);
    const st = renderStream(o.body, { animate, start, cap: o.cap || CAP[kind] || 1400, speed: (regen ? 1.4 : 1) * (o.speed || 1), offset, seed: key });
    const cites = (o.cites || []).filter(Boolean);
    const total = st.end + offset + cites.length * 60 + 300;
    if (animate && L) L.total = total;
    if (animate && L && offset > total) { L.done = true; animate = false; }
    const grow = o.grow != null ? o.grow : (o.live !== false && kind !== "ink");
    const liveAttr = o.live === false || !(animate || isNew) ? "" : ` aria-live="polite"${animate ? ' aria-busy="true"' : ""}`;
    const cls = ["rd-block", "rd-k-" + kind, o.kicker ? "rd-has-kick" : "", o.unsure ? "rd-unsure-b" : "", animate ? "rd-anim" : "", regen ? "rd-regen" : "", o.lens ? "lens-" + o.lens : "", o.cls || ""].filter(Boolean).join(" ");
    const head = (o.kicker || items.length) ? `<div class="rd-head">${o.kicker ? A.kicker(o.kicker, { unsure: o.unsure }) : `<span class="rd-kick rd-kick-m">${A.mark({ unsure: o.unsure })}</span>`}${items.length ? A.trace(items, { at, offset, done: o.traceDone }) : ""}${animate ? `<button type="button" class="rd-skip" data-action="rd-skip" data-arg="${esc(key)}">${MP.t(W.skip)}</button>` : ""}</div>` : "";
    const body = `<div class="rd-body${o.unsure ? " rd-unsure-t" : ""}">${st.html}</div>`;
    const ch = cites.length ? `<div class="rd-cites">${cites.map((c, i) => A.cite(c).replace('class="rd-cite', `style="--i:${i}" class="rd-cite`)).join("")}</div>` : "";
    return `<section class="${cls}" data-rd-key="${esc(key)}"${o.id ? ` id="${esc(o.id)}"` : ""}${animate ? ` data-rd-anim data-rd-off="${Math.round(offset)}" data-rd-trace="${Math.round(traceDur)}" data-rd-end="${Math.round(st.end + offset)}" data-rd-total="${Math.round(total)}"${grow ? " data-rd-grow" : ""}${o.scan ? ` data-rd-scan="${esc(o.scan)}"` : ""}${L && L.wait && L.t0 == null ? " data-rd-wait" : ""}` : ""} style="--rd-end:${Math.round(st.end)}ms"${liveAttr}${o.label ? ` aria-label="${esc(MP.t(o.label))}"` : ""}>${head}<div class="rd-flow">${body}${ch}${o.actions || ""}</div></section>`;
  };

  /* ============================== the live layer ============================== */
  const active = new Set();
  let raf = 0;
  const animOff = (el) => { const tok = el.querySelector(".rd-tok"); if (!tok) return false; const cs = getComputedStyle(tok); return cs.animationName === "none" || cs.animationName === ""; };
  function register(el) {
    if (el.__rd || el.__rdWait) return;
    const key = el.dataset.rdKey, L = live[key];
    // o.wait: hold in the reading phase (every animation paused at its start) until the body is half in view
    if (el.hasAttribute("data-rd-wait") && L && L.wait && L.t0 == null && "IntersectionObserver" in window && !animOff(el) && document.documentElement.classList.contains("ld-live")) {
      el.__rdWait = true; el.classList.add("rd-waiting", "is-reading", "is-streaming");
      const io = new IntersectionObserver((ents) => {
        if (!el.isConnected) { io.disconnect(); return; }
        if (!ents.some((x) => x.isIntersecting && (x.intersectionRatio >= 0.5 || x.intersectionRect.height >= innerHeight * 0.4))) return;
        io.disconnect();
        if (L.t0 == null) { L.t0 = now(); L.wait = false; L.regen = null; }
        el.__rdWait = false; el.classList.remove("rd-waiting", "is-reading", "is-streaming");
        el.setAttribute("data-rd-off", "0"); register(el);
      }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
      io.observe(el.querySelector(".rd-body") || el);
      return;
    }
    const off = +el.dataset.rdOff || 0;
    const t0 = L && L.t0 != null ? L.t0 : now() - off;
    const toks = Array.from(el.querySelectorAll(".rd-body .rd-tok"));
    const times = toks.map((x) => (parseFloat(x.style.getPropertyValue("--d")) || 0) + off);
    const lights = Array.from(el.querySelectorAll(".rd-ti[data-src]")).map((x) => ({ t: (parseFloat(x.style.getPropertyValue("--d")) || 0) + off, src: x.dataset.src, done: false }));
    const r = el.__rd = { key, t0, toks, times, i: 0, trace: +el.dataset.rdTrace || 0, end: +el.dataset.rdEnd || 0, total: +el.dataset.rdTotal || 0, lights, grow: el.hasAttribute("data-rd-grow"), flow: el.querySelector(".rd-flow"), caret: null, phase: "" };
    if (animOff(el) || !document.documentElement.classList.contains("ld-live")) { finish(el, true); return; }
    if (r.grow && r.flow) { el.classList.add("rd-growing"); r.flow.style.height = "0px"; }
    if (el.dataset.rdScan) A.scan(document.querySelector(el.dataset.rdScan));
    active.add(el);
    phase(el, now() - t0);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function phase(el, e) {
    const r = el.__rd, p = e < r.trace ? "reading" : e < r.end + 40 ? "streaming" : "settling";
    if (p === r.phase) return;
    r.phase = p;
    el.classList.toggle("is-reading", p === "reading");
    el.classList.toggle("is-streaming", p === "streaming" || p === "reading");
    if (p === "streaming" && !r.caret && r.toks.length) { r.caret = document.createElement("i"); r.caret.className = "rd-caret"; r.caret.setAttribute("aria-hidden", "true"); el.appendChild(r.caret); }
    if (p === "settling") { release(el); el.classList.remove("is-streaming"); if (r.caret) { const c = r.caret; c.style.opacity = ""; c.classList.add("blink"); setTimeout(() => c.remove(), 1100); r.caret = null; } }
  }
  function place(el, e) {
    const r = el.__rd;
    while (r.i < r.times.length && r.times[r.i] + 90 <= e) r.i++;   // a token counts once it is about half faded in (200ms fade)
    const tok = r.toks[r.i - 1];
    const box = el.getBoundingClientRect();
    if (r.caret) {
      if (tok) {
        const rs = tok.getClientRects(), q = rs[rs.length - 1];
        if (q) { r.caret.style.transform = `translate(${(q.right - box.left + 1.5).toFixed(1)}px, ${(q.top - box.top + 2).toFixed(1)}px)`; r.caret.style.height = Math.max(12, q.height - 4) + "px"; r.caret.style.opacity = "1"; }
      } else { const p = el.querySelector(".rd-body .rd-p"); if (p) { const q = p.getBoundingClientRect(); r.caret.style.transform = `translate(${(q.left - box.left).toFixed(1)}px, ${(q.top - box.top + 3).toFixed(1)}px)`; r.caret.style.height = "16px"; } }
    }
    if (r.grow && r.flow) {
      const ft = r.flow.getBoundingClientRect().top;
      let h = 0;
      if (tok) { const rs = tok.getClientRects(), q = rs[rs.length - 1]; if (q) h = q.bottom - ft + 6; }
      else if (e > r.trace) h = 26;
      h = Math.min(h, r.flow.scrollHeight);
      if (h > (r.h || 0)) { r.h = h; r.flow.style.height = Math.ceil(h) + "px"; }
    }
  }
  function release(el) {
    const r = el.__rd; if (!r || !r.grow || !r.flow || !el.classList.contains("rd-growing")) return;
    const f = r.flow; f.style.height = f.scrollHeight + "px";
    setTimeout(() => { f.style.height = ""; el.classList.remove("rd-growing"); }, 260);
  }
  function finish(el, quiet) {
    const r = el.__rd; active.delete(el);
    if (live[el.dataset.rdKey]) live[el.dataset.rdKey].done = true;
    el.classList.remove("is-reading", "is-streaming");
    if (quiet || el.classList.contains("rd-done")) { if (r && r.flow) { r.flow.style.height = ""; } el.classList.remove("rd-growing"); if (r && r.caret) { r.caret.remove(); r.caret = null; } }
    else release(el);
    if (r && r.caret) { const c = r.caret; c.style.opacity = ""; c.classList.add("blink"); setTimeout(() => c.remove(), 1100); r.caret = null; }
    el.removeAttribute("aria-busy");
    const sk = el.querySelector(".rd-skip");
    if (sk) {
      if (document.activeElement === sk) { const f = el.querySelector(".rd-flow button, .rd-flow a"); if (f) f.focus({ preventScroll: true }); else { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } }
      sk.remove();
    }
  }
  function loop() {
    raf = 0;
    const t = now();
    active.forEach((el) => {
      if (!el.isConnected) { active.delete(el); return; }       // re-rendered: the new element resumes from live[key].t0
      const r = el.__rd, e = t - r.t0;
      if (animOff(el)) { finish(el, true); return; }           // a capture tool or reduced motion switched animations off
      phase(el, e);
      r.lights.forEach((l) => { if (!l.done && e >= l.t) { l.done = true; A.light(l.src, { once: true, quiet: true }); } });
      place(el, e);
      if (e >= r.total) finish(el);
    });
    if (active.size) raf = requestAnimationFrame(loop);
  }
  /** Finish streaming now (adds .rd-done: every token, chip and wash shows at once). */
  A.complete = function (el) {
    if (!el) return;
    el.classList.add("rd-done");
    if (el.__rd) finish(el, true); else { el.classList.remove("is-reading", "is-streaming", "rd-growing"); el.removeAttribute("aria-busy"); }
    if (live[el.dataset.rdKey]) live[el.dataset.rdKey].done = true;
  };
  /** Complete every streaming block on the page (Esc, print). */
  A.completeAll = function () { document.querySelectorAll(".rd-block[data-rd-anim]").forEach((el) => { if (!el.classList.contains("rd-done") && (active.has(el) || el.classList.contains("is-streaming"))) A.complete(el); }); Object.values(live).forEach((L) => { L.done = true; }); };
  A.busy = () => active.size > 0;

  let pendingLight = null;
  /** Light [data-rd-src~="src"] on this page: opens a closed fold first, then a soft lens-glow ring breathes (×3, or ×1
      with once). o: {scroll, once, quiet}. Returns true when something was found. */
  A.light = function (src, o) {
    o = o || {}; if (!src) return false;
    let els; try { els = document.querySelectorAll(`[data-rd-src~="${CSS.escape(src)}"]`); } catch (e) { return false; }
    if (!els.length) return false;
    els.forEach((el) => {
      let d = el.closest("details:not([open])"); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest("details:not([open])"); }
      el.classList.remove("rd-lit", "rd-lit1"); void el.getBoundingClientRect();
      el.classList.add(o.once ? "rd-lit1" : "rd-lit");
      clearTimeout(el.__rdLit); el.__rdLit = setTimeout(() => el.classList.remove("rd-lit", "rd-lit1"), o.once ? 1100 : 2900);
    });
    if (o.scroll) { const r = els[0].getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) els[0].scrollIntoView({ block: "center", behavior: A.motion() ? "smooth" : "auto" }); }
    return true;
  };
  /** A 2px graphite scan line sweeping once down `target` (900ms). A real element, removed when done. */
  A.scan = function (target) {
    if (!target || !A.motion()) return;
    const cs = getComputedStyle(target); if (cs.position === "static") target.style.position = "relative";
    const s = document.createElement("i"); s.className = "rd-scan"; s.setAttribute("aria-hidden", "true");
    target.appendChild(s); setTimeout(() => s.remove(), 1000);
  };
  /** One polite announcement (a persistent hidden region outside #app, so re-renders never cut it off). */
  A.announce = function (text) {
    let r = document.getElementById("rd-live");
    if (!r) { r = document.createElement("div"); r.id = "rd-live"; r.className = "sr-only"; r.setAttribute("aria-live", "polite"); r.setAttribute("role", "status"); document.body.appendChild(r); }
    r.textContent = ""; setTimeout(() => { r.textContent = strip(text); }, 60);
  };
  /** Store "up" | "down" | "hide" for a response key (local only, never shown to anyone else). */
  A.feedback = function (key, val) { const fb = A.state().fb; fb[key] = fb[key] === val ? "" : val; MP.save(); return fb[key]; };

  /* ---------- mirror highlights for textareas ---------- */
  const MIRROR_PROPS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textTransform", "textIndent", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "fontFeatureSettings", "fontVariantNumeric", "direction"];
  function anchor(text, sp) {
    if (sp.quote == null) return { s: sp.s, e: sp.e, stale: false };
    if (text.slice(sp.s, sp.e) === sp.quote) return { s: sp.s, e: sp.e, stale: false };
    const i = text.indexOf(sp.quote);
    if (i >= 0) return { s: i, e: i + sp.quote.length, stale: false };
    const s = Math.min(sp.s, text.length), e = Math.min(Math.max(s, sp.e), text.length);
    return { s, e, stale: true };
  }
  function paint(ta) {
    const m = ta.__rdM; if (!m) return;
    const text = ta.value; let pos = 0, html = "";
    const spans = m.spans.map((sp) => Object.assign({}, sp, anchor(text, sp))).filter((x) => x.e > x.s).sort((a, b) => a.s - b.s);
    spans.forEach((sp) => {
      if (sp.s < pos) return;
      html += esc(text.slice(pos, sp.s));
      // a zero-width anchor at the mark's start: its line decides where the pin sits in the right gutter
      html += `${sp.n != null ? `<span class="rd-pin-at" data-n="${esc(sp.n)}" data-c="${sp.stale ? "stale" : sp.resolved ? "resolved" : ""}"></span>` : ""}<mark class="rd-m k-${esc(sp.kind || "ask")}${sp.stale ? " stale" : ""}${sp.resolved ? " resolved" : ""}" data-n="${esc(sp.n == null ? "" : sp.n)}">${esc(text.slice(sp.s, sp.e))}</mark>`;
      pos = sp.e;
    });
    html += esc(text.slice(pos)) + "​";
    m.el.innerHTML = html;
    size(ta);
  }
  /** Numbered pins live in a reserved right gutter (never on top of the student's letters), one per marked line,
      stacked when two marks share a line. */
  const GUT = 24, PIN = 18;
  function pins(ta) {
    const m = ta.__rdM; if (!m) return;
    m.el.querySelectorAll(".rd-pin").forEach((x) => x.remove());
    const mr = m.el.getBoundingClientRect(), sh = m.el.scrollHeight;
    const cs = getComputedStyle(ta), br = parseFloat(cs.borderRightWidth) || 0, sb = Math.max(0, ta.offsetWidth - ta.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - br);
    let last = -1e9;
    m.el.querySelectorAll(".rd-pin-at").forEach((at) => {
      const r = at.getBoundingClientRect(), lh = r.height || PIN;
      let top = r.top - mr.top + m.el.scrollTop + (lh - PIN) / 2;
      if (top < last + PIN + 1) top = last + PIN + 1;
      top = Math.max(0, Math.min(top, sh - PIN)); last = top;
      const pin = document.createElement("i");
      pin.className = "rd-pin" + (at.dataset.c ? " " + at.dataset.c : ""); pin.textContent = at.dataset.n;
      pin.style.top = top.toFixed(1) + "px"; pin.style.right = (sb + (GUT - PIN) / 2 - 1) + "px";
      m.el.appendChild(pin);
    });
  }
  function size(ta) {
    const m = ta.__rdM; if (!m) return;
    const cs = getComputedStyle(ta);
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const sb = Math.max(0, ta.offsetWidth - ta.clientWidth - bl - br);
    m.el.style.width = ta.offsetWidth + "px"; m.el.style.height = ta.offsetHeight + "px";
    m.el.style.paddingRight = (parseFloat(cs.paddingRight) + sb) + "px";
    m.el.style.top = ta.offsetTop + "px"; m.el.style.left = ta.offsetLeft + "px";
    m.el.scrollTop = ta.scrollTop;
    // metrics guard: if the mirror wraps differently from the textarea, drop the highlights (the notes still quote)
    m.el.querySelectorAll(".rd-pin").forEach((x) => x.remove());
    if (Math.abs(m.el.scrollHeight - ta.scrollHeight) > 3) { unmirror(ta); return; }
    pins(ta);
  }
  function unmirror(ta) {
    const m = ta.__rdM; if (!m) return;
    m.el.remove(); ta.classList.remove("rd-hl-ta"); if (m.ro) m.ro.disconnect();
    ta.style.paddingRight = m.pr || "";
    ta.removeEventListener("input", m.onIn); ta.removeEventListener("scroll", m.onSc);
    if (m.wrap) m.wrap.classList.add("rd-hl-off");
    ta.__rdM = null;
  }
  /** Mirror backdrop: <mark> spans behind a textarea whose own background turns transparent. spans: [{s, e, kind:
      "keep"|"ask"|"try"|"unsure", n, quote, resolved}]. Synced on input/scroll/resize. A span whose text no longer
      equals its quote re-anchors to the quote, or turns .stale. Mismatched metrics → the mirror is removed. */
  A.highlight = function (ta, spans) {
    if (!ta || !ta.isConnected || ta.tagName !== "TEXTAREA") return;
    if (ta.__rdM) { ta.__rdM.spans = spans || []; paint(ta); return; }
    if (!spans || !spans.length) return;
    let wrap = ta.parentElement;
    if (!wrap.classList.contains("rd-hl")) {
      const w = document.createElement("div"); w.className = "rd-hl";
      const had = document.activeElement === ta, ss = ta.selectionStart, se = ta.selectionEnd;
      ta.parentNode.insertBefore(w, ta); w.appendChild(ta); wrap = w;
      if (had) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(ss, se); } catch (e) { /* fine */ } }
    }
    const cs = getComputedStyle(ta);
    // reserve the pin gutter on the right (the mirror copies the widened padding, so both wrap the same)
    const pr = ta.style.paddingRight;
    if (spans.some((x) => x.n != null)) ta.style.paddingRight = (parseFloat(cs.paddingRight) + GUT) + "px";
    const el = document.createElement("div"); el.className = "rd-hl-m"; el.setAttribute("aria-hidden", "true");
    MIRROR_PROPS.forEach((p) => { el.style[p] = cs[p]; });
    el.style.borderStyle = "solid"; el.style.borderColor = "transparent"; el.style.borderRadius = cs.borderRadius;
    wrap.style.setProperty("--rd-hl-bg", cs.backgroundColor); wrap.style.borderRadius = cs.borderRadius;
    wrap.insertBefore(el, ta);
    ta.classList.add("rd-hl-ta");
    const m = ta.__rdM = { el, wrap, pr, spans: spans.slice(), onIn: () => paint(ta), onSc: () => { el.scrollTop = ta.scrollTop; } };
    ta.addEventListener("input", m.onIn); ta.addEventListener("scroll", m.onSc, { passive: true });
    if ("ResizeObserver" in window) { m.ro = new ResizeObserver(() => size(ta)); m.ro.observe(ta); }
    paint(ta);
  };
  /** Turn one mark's wash on/off (hover/focus on its note). */
  A.markOn = function (taId, n, on) {
    const ta = document.getElementById(taId); if (!ta || !ta.__rdM) return;
    ta.__rdM.el.querySelectorAll(`.rd-m[data-n="${CSS.escape(String(n))}"]`).forEach((x) => x.classList.toggle("is-on", !!on));
  };

  /** Called by MP.render after every render (and safe to call again on a sub-tree). */
  A.after = function (root) {
    root = root || document;
    try {
      root.querySelectorAll(".rd-block[data-rd-anim]").forEach(register);
      root.querySelectorAll("textarea[data-rd-marks]").forEach((ta) => { try { A.highlight(ta, JSON.parse(ta.dataset.rdMarks)); } catch (e) { /* bad json: no marks */ } });
      if (pendingLight) { const s = pendingLight; pendingLight = null; setTimeout(() => A.light(s, { scroll: true }), 380); }
    } catch (e) { console.error(e); root.querySelectorAll(".rd-block").forEach((b) => b.classList.add("rd-done")); }
  };

  /* ============================== events ============================== */
  MP.on("rd-skip", (el) => { const b = el.closest(".rd-block"); A.complete(b); const f = b && b.querySelector(".rd-flow button, .rd-flow a"); if (f) f.focus({ preventScroll: true }); });
  MP.on("rd-cite", (el, arg) => {
    const [lens, step, src, go] = String(arg || "").split("|");
    if (src && !go && A.light(src, { scroll: true })) return;
    if (lens && step) { pendingLight = src || null; MP.go(`#/lens/${lens}/${step}`); }
  });
  MP.on("rd-pref", (el, arg) => { const [k, v] = String(arg).split(":"); A.state().prefs[k] = v; MP.commit(); });
  MP.on("rd-fb", (el, arg) => { const [k, v] = String(arg).split("|"); A.feedback(k, v); MP.commit(); });
  // a click on a streaming response (not on a control) completes it
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".rd-block.is-streaming");
    if (b && !e.target.closest("button, a, input, textarea, select, summary")) A.complete(b);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active.size) A.completeAll(); });
  // cite hover/focus lights its on-page source; a note's hover/focus washes its mark in the textarea
  const enter = (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const c = t.closest(".rd-cite[data-src]");
    if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) A.light(c.dataset.src, { once: false, quiet: true });
    const n = t.closest("[data-rd-note]");
    if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) { const [id, k] = n.dataset.rdNote.split(":"); A.markOn(id, k, true); }
  };
  const leave = (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const n = t.closest("[data-rd-note]");
    if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) { const [id, k] = n.dataset.rdNote.split(":"); A.markOn(id, k, false); }
  };
  document.addEventListener("mouseover", enter); document.addEventListener("focusin", enter);
  document.addEventListener("mouseout", leave); document.addEventListener("focusout", leave);
  window.addEventListener("beforeprint", () => { printing = true; A.completeAll(); });
  window.addEventListener("afterprint", () => { printing = false; });
})();
