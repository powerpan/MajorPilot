/* MajorPilot redesign — Business Analytics lens.
   "Which step should LumenLearn fix first — and how will we know it worked?"
   Five content steps: ratio · funnel · missing · test · memo (core appends reflect + done).
   This file also defines MP.lensRead (below): the AI-1 "second read" engine the three lenses share (ds.js and ai.js
   load after this file and use it). Lens-owned; it only composes and lays out — streaming, tracing, cites, validation
   and highlights all come from the core kit (MP.ai). */

/* ======================================================================================================
   MP.lensRead(cfg) — AI-1 second read on a write-up (AI-LAYER.md §2 AI-1)
   No model: a lens passes a rule table; each rule tests the student's real text (features from MP.ai.text) and choices,
   anchors to an exact span of their words and says something in 2–3 phrasings per language (gentle / direct, + one
   "because" line). Selection: exactly one KEEP (the first true strength) + up to 2 more by priority; every candidate
   is validated with MP.ai.check (banned words, unknown numbers, quotes that aren't the student's) before it can be
   picked. A read is snapshotted into store(ls).read, so notes are a pure function of state; "Read again" diffs the
   snapshot and leads with what changed, and a note counts as addressed only when its rule no longer fires.
   ====================================================================================================== */
(function () {
  "use strict";
  const MP = window.MP;
  if (!MP.ai) return;
  const A = MP.ai, X = A.text, esc = MP.h.esc;
  const T = (en, zh) => ({ en, zh });
  const W = {
    get: T("Get a second read", "帮我读一遍"),
    again: T("Read again", "再读一遍"),
    first: T("Write a sentence or two first", "先写一两句"),
    same: T("Edit a box to read again", "改动后可以再读"),
    kicker: T("Second read", "第二遍阅读"),
    kinds: { keep: T("Keep", "保留"), ask: T("A reader might ask", "读者可能会问"), try: T("Try", "可以试试"), unsure: T("Not sure", "说不准") },
    tone: T("Tone", "语气"), toneMore: T("Tone ⋯", "语气 ⋯"),
    gentle: T("Gentle", "温和"), direct: T("Direct", "直接"), short: T("Short", "简短"), reasons: T("With reasons", "附理由"),
    show: T("Show", "展开"), folded: T("Folded", "已收起"),
    nothing: T("Nothing I'd change in these boxes. The optional parts are there if you want them.", "这几栏我没有要改的。可选部分想写再写。"),
    nothingAll: T("Nothing I'd change in these boxes, the optional ones included.", "这几栏，包括可选的部分，我都没有要改的。"),
    announce: (n) => T(`Second read: ${n} ${n === 1 ? "note" : "notes"} on your draft`, `批注：你的草稿有 ${n} 条批注`),
    of: (a, b) => T(`${a} of ${b}`, `${a}/${b}`),
    revised: T("Revised after a second read", "按批注修改"),
    words: (zh) => (zh ? T("characters", "字") : T("words", "词"))
  };
  const SMALL = (n) => Number.isInteger(n.v) && n.v <= 12;
  const ZH = () => MP.lang() === "zh";
  let listening = false;
  const all = [];

  MP.lensRead = function (cfg) {
    const lens = cfg.lens, P = lens + "-read", keys = cfg.boxes.map((b) => b.k), byK = {};
    cfg.boxes.forEach((b) => { byK[b.k] = b; });
    const first = cfg.req[0];
    const label = (k) => byK[k].label;
    /* engine-level rules every lens gets: language mismatch, too-thin box, pronoun-led opener (all NOT SURE) */
    const generic = [
      { id: "gen.offtopic", kind: "unsure", pri: 1, blocksKeep: true,
        test(F, c, H) {
          if (cfg.req.some((k) => F[k].empty)) return null;
          if (cfg.req.some((k) => H.find(k, cfg.topic, cfg.nouns).length || H.known(k).length)) return null;
          return H.sent(first);
        },
        say() { const d = cfg.doc; return { g: [
          T([`I can't connect this to the LumenLearn problem yet: no step, number or change from your work that I can recognize. Is it a placeholder, or a draft for something else?`], [`我还没法把这段话和 LumenLearn 的问题联系起来：里面没有我能认出的步骤、数字或改动。这是先占个位，还是写给别的事情的？`]),
          T([`I'm not sure this is about the ${d.en} yet. I couldn't find anything from your earlier steps in it, so I have nothing to check it against.`], [`我不确定这是不是在写${d.zh}。里面找不到你前面几步的内容，我也就没有东西可以对照。`])] }; } },
      { id: "gen.lang", kind: "unsure", pri: 0, live: true,
        test(F, c, H) { const l = F.lang; if (l === "mixed" || l === MP.lang() || F.req.trim().length < 8) return null; return H.box(first); },
        say() { return { g: [T(["I'll read this as written; my notes stay in English."], ["我按原文来读，批注仍用中文。"])] }; } },
      { id: "gen.thin", kind: "unsure", pri: 3,
        test(F, c, H) {
          for (const k of cfg.req) {
            const f = F[k]; if (f.empty) continue;
            // a short box that overclaims gets the overclaim note instead (it says something concrete, so say that)
            if (H.has(k, A.lex.overclaim, A.lex.causal, A.lex.jargon)) continue;
            if (f.lang === "zh" ? f.chars < 10 : f.words < 6) return { box: k, s: f.text.search(/\S/), e: f.text.trimEnd().length };
          }
          return null;
        },
        say(F, c, a) { const m = byK[a.box].thin || T("what you'd have a reader do or believe", "你想让读者做什么、相信什么"); return { g: [
          T([`I can't tell yet ${m.en}. This could point several ways; which one do you mean?`], [`我还看不出${m.zh}。这句话可以有好几种理解，你指的是哪一种？`]),
          T([`This is too short for me to tell ${m.en}. One full sentence would settle it.`], [`这一栏太短，我看不出${m.zh}。写成完整的一句，就清楚了。`])],
          d: [T([`Say ${m.en}, in one full sentence.`], [`用完整的一句写清${m.zh}。`]), T([`One full sentence: ${m.en}.`], [`写成完整的一句：${m.zh}。`])] }; } },
      { id: "gen.pronoun", kind: "unsure", pri: 3,
        test(F, c, H) {
          const f = F[first], s0 = f.sents[0]; if (!s0) return null;
          const m = f.text.slice(s0.s).match(/^(it|this|that|these|they)\b|^(这个|这|它|那个)/i); if (!m) return null;
          if (H.find(first, cfg.nouns).some((h) => h.s < s0.e)) return null;
          return { box: first, s: s0.s, e: s0.s + m[0].length };
        },
        say(F, c, a) { const l = label(first); return { g: [
          T([`I'm not sure what the opening word points to. Naming the step or the change in the first words lets ${l.en} stand on its own.`], [`我不确定开头这个词指的是什么。第一句就点名是哪一步、改什么，“${l.zh}”才能单独成立。`]),
          T([`A reader who sees only this line won't know what the opening word refers to. Name it.`], [`只读到这一句的人，不知道开头指的是什么。把它点名写出来。`])] }; } }
    ];
    const rules = cfg.rules.concat(generic), byId = {};
    rules.forEach((r) => { byId[r.id] = r; });
    const st = { seq: null, toneOpen: false, newBox: null };
    all.push({ lens, st, P });

    /* ---------- features + helpers ---------- */
    const texts = (ls) => { const o = {}; keys.forEach((k) => { o[k] = String(cfg.text(ls, k) || ""); }); return o; };
    const hashOf = (tx) => String(A.hash(JSON.stringify(keys.map((k) => tx[k].trim()))));
    const enough = (tx) => { const s = cfg.req.map((k) => tx[k]).join(" "); return X.lang(s) === "zh" ? X.chars(s) >= 16 : X.words(s) >= 8; };
    function feats(tx, known) {
      const F = {};
      keys.forEach((k) => { const s = tx[k]; F[k] = { text: s, empty: !s.trim(), words: X.words(s), chars: X.chars(s), lang: X.lang(s), sents: X.sentences(s), nums: X.numbers(s).map((n) => Object.assign(n, X.near(n.v, known))) }; });
      F.req = cfg.req.map((k) => tx[k]).join(" "); F.lang = X.lang(F.req);
      return F;
    }
    function helpers(F) {
      const H = {
        F,
        find(k, ...lx) { const out = []; lx.forEach((l) => { if (l) X.find(F[k].text, l).forEach((x) => out.push(x)); }); return out.sort((a, b) => a.s - b.s); },
        has(k, ...lx) { return H.find(k, ...lx).length > 0; },
        /** end offset of the first 12 words (en) / 22 characters (zh) */
        win(k) { const s = F[k].text; if (F[k].lang === "zh") return Math.min(s.length, 22); let n = 0, m; const re = /\S+/g; while ((m = re.exec(s))) { if (++n === 12) return m.index + m[0].length; } return s.length; },
        /** trim a span to ≤ 14 words / 26 characters from its start */
        clip(k, s, e) { const t = F[k].text.slice(s, e); if (X.lang(t) === "zh") return { box: k, s, e: Math.min(e, s + 26) }; let n = 0, m; const re = /\S+/g; while ((m = re.exec(t))) { if (++n === 14) return { box: k, s, e: s + m.index + m[0].length }; } return { box: k, s, e }; },
        sent(k, i) { const x = F[k].sents[i || 0]; return x ? H.clip(k, x.s, x.e) : null; },
        /** the clause around a hit (always containing it) */
        at(k, hit) {
          // mask number punctuation (3.25, 1,404) so a clause never splits inside a figure; same length, so offsets hold
          const masked = F[k].text.replace(/(\d)[.,](?=\d)/g, "$1\u00b7");
          const c = X.clause(masked, hit.s, { maxWords: 12, maxChars: 22 }); return { box: k, s: Math.min(c.s, hit.s), e: Math.max(c.e, hit.e) };
        },
        word(k, hit) { return { box: k, s: hit.s, e: hit.e }; },
        box(k) { return { box: k }; },
        nums(k) { return F[k].nums.filter((n) => !SMALL(n)); },
        known(k) { return H.nums(k).filter((n) => n.match); },
        unknown(k) { return H.nums(k).filter((n) => !n.match); },
        near(k, v, tol) { return H.nums(k).find((n) => Math.abs(n.v - v) <= (tol == null ? 0.6 : tol)); }
      };
      return H;
    }
    const sources = (tx) => keys.map((k) => tx[k]).concat(cfg.boxes.map((b) => b.label.en), cfg.boxes.map((b) => b.label.zh), cfg.sources ? cfg.sources() : []);
    const quoteOf = (tx, a) => (a && a.s != null && a.e > a.s ? X.quote(tx[a.box], a.s, a.e).replace(/([.!?。！？])…$/, "$1") : "");
    /** one phrasing → paragraphs: [the student's words] · [the note] · [the "because" line] · [extra] */
    function paras(v, q, why, extra) { const p = []; if (q) p.push([{ q, lens }]); p.push([v]); if (why) p.push([why]); if (extra) p.push([extra]); return p; }
    function sayOf(r, F, c, a, H) { try { return r.say(F, c, a, H) || null; } catch (e) { console.error(e); return null; } }
    /** Compose a note in the current language: the first phrasing (from v, in rotation) that passes MP.ai.check. */
    function compose(r, a, F, c, H, tx, prefs, v, known, extra) {
      const out = sayOf(r, F, c, a, H); if (!out) return null;
      const list = ((prefs.tone === "direct" && out.d && out.d.filter(Boolean).length ? out.d : out.g) || []).filter(Boolean);
      if (!list || !list.length) return null;
      const q = quoteOf(tx, a), why = prefs.length === "reasons" ? out.why : null, src = sources(tx);
      for (let i = 0; i < list.length; i++) {
        const idx = (v + i) % list.length, p = paras(list[idx], q, why, extra);
        if (A.check(p, { numbers: known, sources: src }).ok) return { paras: p, idx, n: list.length, cites: out.cites || [] };
      }
      return null;
    }
    function fire(ls, tx) {
      const known = cfg.known(ls), F = feats(tx, known), c = cfg.ctx(ls), H = helpers(F), out = [];
      const prefs = A.state().prefs;
      rules.forEach((r, order) => {
        let a = null; try { a = r.test(F, c, H); } catch (e) { console.error(e); }
        if (!a || !(a.box in F)) return;
        // validated before it can be picked: at least one phrasing in either tone must pass the check
        const okG = compose(r, a, F, c, H, tx, { tone: "gentle", length: "short" }, 0, known), okD = prefs.tone === "direct" ? compose(r, a, F, c, H, tx, prefs, 0, known) : true;
        if (okG && okD) out.push({ r, a, order });
      });
      return { F, c, H, known, fired: out };
    }
    const snapA = (tx, x) => ({ rule: x.r.id, kind: x.r.kind, box: x.a.box, s: x.a.s == null ? null : x.a.s, e: x.a.e == null ? null : x.a.e, quote: x.a.s != null ? tx[x.a.box].slice(x.a.s, x.a.e) : "", x: x.a.x || null });
    function select(ls, tx, prev) {
      const R = fire(ls, tx);
      const keepsAll = R.fired.filter((x) => x.r.kind === "keep");
      const done = prev ? prev.notes.filter((n) => n.resolved && prev.snap[n.box] === tx[n.box]).map((n) => n.rule) : [];
      const over = (a, b) => a.box === b.box && a.s != null && b.s != null && a.s < b.e && b.s < a.e;
      let keep = R.fired.some((x) => x.r.blocksKeep) ? null : keepsAll[0];
      const off = R.fired.some((x) => x.r.blocksKeep);   // off-topic: only the honest "not sure" notes, no advice on text that isn't about the work
      const rest = R.fired.filter((x) => x.r.kind !== "keep" && !done.includes(x.r.id) && (!off || x.r.kind === "unsure")).sort((a, b) => a.r.pri - b.r.pri || a.order - b.order);
      const picked = [];
      rest.forEach((x) => { if (picked.length >= 2) return; if (picked.some((p) => over(p.a, x.a))) return; picked.push(x); });
      // prefer a strength that doesn't quote the same words as another note
      if (keep) keep = keepsAll.find((x) => !picked.some((p) => over(p.a, x.a))) || keep;
      const notes = [];
      if (keep && keepsAll.length) {
        const pk = prev && prev.notes.find((n) => n.kind === "keep");
        const k0 = snapA(tx, keep), clear = keepsAll.filter((x) => !picked.some((p) => over(p.a, x.a)));
        notes.push(Object.assign(k0, { alts: [keep].concat(clear.filter((x) => x !== keep), keepsAll.filter((x) => x !== keep && !clear.includes(x))).map((x) => snapA(tx, x)), resolved: !!(pk && pk.resolved && pk.rule === k0.rule && prev.snap[k0.box] === tx[k0.box]) }));
      }
      picked.forEach((x) => notes.push(Object.assign(snapA(tx, x), { resolved: false })));
      // the KEEP is always ① (it arrives first, before any suggestion); the rest count down the page after it
      const pos = (n) => (n.kind === "keep" ? -1e9 : 0) + keys.indexOf(n.box) * 1e6 + (n.s == null ? 9e5 : n.s);
      notes.sort((x, y) => pos(x) - pos(y)).forEach((n, i) => { n.n = i + 1; });
      return { notes, R };
    }
    const curAlt = (n) => n;   // "Another way to say it" rewords the same note in place; it never swaps the finding

    /* ---------- the button (doc header row, next to "Use sentence starters") ---------- */
    function btnState(ls) {
      const d = cfg.store(ls), rd = d.read, tx = texts(ls);
      if (!enough(tx)) return { dis: true, label: rd ? W.again : W.get, hint: W.first };
      if (!rd) return { dis: false, label: W.get, hint: null };
      const changed = hashOf(tx) !== rd.hash, more = rd.notes.some((n) => n.resolved);
      return { dis: !changed && !more, label: W.again, hint: !changed && !more ? W.same : null };
    }
    function button(ls) {
      const b = btnState(ls);
      return `<span class="lr-go-w"><button type="button" class="btn-secondary sm lr-go" data-action="${P}" data-fk="${P}"${b.dis ? " disabled" : ""} aria-describedby="${lens}-lr-hint">${A.mark()}<span class="lr-gl">${MP.t(b.label)}</span></button><span class="lr-hint" id="${lens}-lr-hint">${b.hint ? MP.t(b.hint) : ""}</span></span>`;
    }

    /* ---------- notes ---------- */
    function visible(rd) {
      const s = st.seq && st.seq.at === rd.at ? st.seq.shown : rd.notes.length;
      return rd.notes.slice(0, s);
    }
    const noteKey = (n) => `read.${lens}.${n.n}`;
    function built(ls) {
      const d = cfg.store(ls), rd = d.read; if (!rd) return null;
      const known = cfg.known(ls), F = feats(rd.snap, known), c = cfg.ctx(ls), H = helpers(F), prefs = A.state().prefs;
      const vis = visible(rd), out = [];
      const others = rd.notes.filter((n) => n.kind !== "keep").length;
      vis.forEach((n) => {
        const a = curAlt(n), r = byId[a.rule]; if (!r) return;
        if (r.live) { let still = null; try { still = r.test(F, c, H); } catch (e) { still = null; } if (!still) return; }
        const key = noteKey(n), v = (A.hash(a.rule + a.quote) + (A.state().regen[key] || 0)) >>> 0;
        const optFull = keys.filter((k) => !cfg.req.includes(k)).every((k) => String(rd.snap[k] || "").trim());
        const extra = n.kind === "keep" && !others && !(rd.diff && rd.diff.same) ? (optFull ? W.nothingAll : W.nothing) : null;
        const m = compose(r, a, F, c, H, rd.snap, prefs, v, known, extra);
        if (!m) return;
        out.push({ n, a, r, key, m, fp: A.fp([rd.at, a.rule, a.s, m.idx, prefs.tone, prefs.length]) });
      });
      return { rd, F, c, H, known, notes: out, prefs };
    }
    function noteHTML(b, x) {
      const n = x.n, kind = MP.t(W.kinds[x.a.kind]), ta = cfg.taId(x.a.box);
      if (n.resolved) {
        const q = x.a.quote ? quoteOf(b.rd.snap, x.a) : MP.t(label(x.a.box));
        return `<div class="lr-folded" data-rd-note="${esc(ta)}:${n.n}"><i class="lr-pin" aria-hidden="true">${n.n}</i><span class="lr-fk">${kind}</span><span class="lr-fq">${esc(q)}</span><button type="button" class="rd-act" data-action="${P}-show" data-arg="${n.n}" data-fk="${P}-show:${n.n}" aria-label="${esc(MP.t(W.show) + " · " + kind)}">${MP.t(W.show)}</button></div>`;
      }
      return `<aside class="lr-note k-${x.a.kind}" role="note" data-rd-note="${esc(ta)}:${n.n}" id="${lens}-lr-n${n.n}">${A.block({
        key: x.key, fp: x.fp, kind: "note", lens, unsure: x.a.kind === "unsure",
        kicker: `<span class="lr-n">${n.n}</span>${esc(kind)}`,
        body: x.m.paras, cites: x.m.cites,
        actions: A.actions({ resolve: [P + "-ok", n.n], regen: x.m.n > 1 ? [P + "-regen", n.n] : null, count: x.m.n > 1 ? W.of(((A.state().regen[x.key] || 0) % x.m.n) + 1, x.m.n) : null })
      })}</aside>`;
    }
    function toneHTML(prefs) {
      const segs = A.seg("tone", [["gentle", W.gentle], ["direct", W.direct]], prefs.tone, { label: W.tone }) + A.seg("length", [["short", W.short], ["reasons", W.reasons]], prefs.length, { label: W.reasons });
      return `<div class="lr-tone${st.toneOpen ? " open" : ""}"><button type="button" class="lr-tone-t" data-action="${P}-tone" data-fk="${P}-tone" aria-expanded="${st.toneOpen}">${MP.t(W.toneMore)}</button><div class="lr-tone-b">${segs}</div></div>`;
    }
    function lead(b) {
      const rd = b.rd, df = rd.diff;
      if (!df) return MP.t(cfg.intro[A.hash(String(rd.at)) % cfg.intro.length]);
      const newN = rd.notes.filter((n) => !n.resolved && n.kind !== "keep").length;
      if (df.same) return newN
        ? MP.t(T("Same text as before, so I read past the notes you'd marked Got it. Here's the next thing a reader might notice.", "文字没变，所以我跳过了你点过“知道了”的批注，接着往下读了一层。"))
        : MP.t(keys.filter((k) => !cfg.req.includes(k)).every((k) => String(rd.snap[k] || "").trim())
          ? T("Same text as before, and nothing else stands out to me.", "文字没变，我也没有别的要补充了。")
          : T("Same text as before, and nothing else stands out to me. The optional parts are there if you want them.", "文字没变，我也没有别的要补充了。可选部分想写再写。"));
      const parts = [];
      const ad = df.addressed;
      if (ad.length) {
        // credit the edit that actually resolved a note, in that note's own terms
        const x = ad[0], l = label(x.box), r = byId[x.rule], bx = df.boxes[x.box] || {};
        if (x.add && x.add.length) parts.push(T(`Your “${l.en}” box now carries the number ${x.add[0]}, so my note about it is done.`, `“${l.zh}”里补上了 ${x.add[0]}，我上次那条批注就不用了。`));
        else if (r && r.bit) parts.push(T(`${r.bit.en}, so my note about it is done.`, `${r.bit.zh}，我上次那条批注就不用了。`));
        else if (!bx.w0) parts.push(T(`“${l.en}” now has a line, so my note about it is done.`, `“${l.zh}”写上了，我上次那条批注就不用了。`));
        else parts.push(T(`You reworked “${l.en}”, and my note on it no longer applies.`, `你改了“${l.zh}”，上次那条批注已经不适用了。`));
        if (ad.length > 1) parts.push(ad.length === 2 ? T("One more of my earlier notes is taken care of too.", "另有一条批注也一并处理掉了。") : T(`${ad.length - 1} more of my earlier notes are taken care of too.`, `另有 ${ad.length - 1} 条批注也一并处理掉了。`));
      } else {
        const big = keys.filter((k) => df.boxes[k] && Math.abs(df.boxes[k].w1 - df.boxes[k].w0) >= 3).sort((a, z) => Math.abs(df.boxes[z].w1 - df.boxes[z].w0) - Math.abs(df.boxes[a].w1 - df.boxes[a].w0))[0];
        if (big) { const l = label(big), x = df.boxes[big], u = W.words(x.zh); parts.push(T(`Your “${l.en}” box went from ${x.w0} to ${x.w1} ${u.en}.`, `“${l.zh}”从 ${x.w0} ${u.zh}变成了 ${x.w1} ${u.zh}。`)); }
        else { const ch = keys.filter((k) => df.boxes[k] && df.boxes[k].changed).map((k) => label(k)); if (ch.length) parts.push(T(`You edited ${ch.map((l) => "“" + l.en + "”").join(" and ")}.`, `你改了${ch.map((l) => "“" + l.zh + "”").join("和")}。`)); }
      }
      parts.push(newN ? T("Here's what I'd still look at.", "下面是我还会再看看的地方。") : T("Nothing else I'd change.", "我没有别的要改了。"));
      return parts.map((p) => MP.t(p)).join(ZH() ? "" : " ");
    }
    function header(b, ls) {
      const rd = b.rd;
      const items = keys.filter((k) => rd.snap[k].trim()).map((k) => ({ label: label(k), src: `${lens}-box-${k}` })).concat(cfg.trace ? cfg.trace(ls, b.c) : []);
      const nums = cfg.known(ls).concat([].concat(...keys.map((k) => rd.diff && rd.diff.boxes[k] ? [rd.diff.boxes[k].w0, rd.diff.boxes[k].w1] : [])));
      const body = lead(b);
      return `<div class="lr-head" tabindex="-1" data-fk="${P}-head">${A.block({ key: `read.${lens}.head`, fp: String(rd.at), kind: "line", kicker: esc(MP.t(W.kicker)), trace: items.slice(0, 7), body, lens, scan: "#" + cfg.scan, check: { numbers: nums }, fallback: "", actions: toneHTML(b.prefs), cls: "lr-hb", label: MP.t(W.kicker) })}</div>`;
    }
    /** The margin cell for box k: the read's header (first box) + the notes anchored to k. */
    function side(ls, k, b) {
      b = b || built(ls); if (!b) return "";
      const mine = b.notes.filter((x) => x.a.box === k);
      return (k === first ? header(b, ls) : "") + mine.map((x) => noteHTML(b, x)).join("");
    }
    /** Wrap one box: [box | margin notes]. The notes column only exists once there's a read. */
    function row(ls, k, boxHTML, b) {
      return `<div class="lr-row" data-rd-src="${lens}-box-${k}"><div class="lr-box">${boxHTML}</div><div class="lr-side">${side(ls, k, b)}</div></div>`;
    }
    const on = (ls) => !!cfg.store(ls).read;

    /* ---------- read / re-read ---------- */
    function read(ls) {
      const d = cfg.store(ls), tx = texts(ls); if (!enough(tx)) return;
      const prev = d.read, hash = hashOf(tx);
      const sel = select(ls, tx, prev);
      let diff = null;
      if (prev) {
        const same = hash === prev.hash, boxes = {}, addressed = [];
        const known = cfg.known(ls);
        keys.forEach((k) => {
          const a = prev.snap[k] || "", b2 = tx[k], zh = X.lang(b2 || a) === "zh";
          const cnt = (s) => (zh ? X.chars(s) : X.words(s));
          const kn = (s) => X.numbers(s).filter((n) => !SMALL(n) && X.near(n.v, known).match).map((n) => n.raw);
          const was = kn(a);
          boxes[k] = { w0: cnt(a), w1: cnt(b2), zh, changed: a.trim() !== b2.trim(), add: kn(b2).filter((r) => !was.includes(r)) };
        });
        if (!same) prev.notes.forEach((n) => {
          if (n.kind === "keep" || !boxes[n.box].changed) return;
          const r = byId[n.rule]; let still = null;
          try { still = r && r.test(sel.R.F, sel.R.c, sel.R.H); } catch (e) { still = null; }
          if (!still) addressed.push({ rule: n.rule, box: n.box, add: boxes[n.box].add.slice(0, 1) });
        });
        diff = { same, boxes, addressed };
      }
      const log = prev && prev.log ? prev.log : { first: tx, addressed: [] };
      log.addressed = log.addressed.concat(diff ? diff.addressed.filter((x) => !log.addressed.some((y) => y.rule === x.rule)) : []);
      log.last = tx;
      d.read = { at: Date.now(), hash, round: (prev ? prev.round : 0) + 1, snap: tx, notes: sel.notes, diff, log };
      // open the fold a note points into, so every note sits beside its box
      sel.notes.forEach((n) => { const f = byK[n.box].fold; if (f) MP.state.ui.folds[f] = true; });
      st.seq = A.motion() ? { at: d.read.at, shown: 0 } : null;
      MP.commit();
      MP.ai.announce(MP.t(W.announce(sel.notes.length)));
    }
    function skipAll() {
      const s = st.seq; if (!s) return;
      const ls = MP.ls(lens), b = built(ls); clearTimeout(s.tm);
      st.seq = null;
      const b2 = built(ls);
      if (b2) b2.notes.forEach((x) => { if (!b || !b.notes.some((y) => y.key === x.key)) A.state().seen[x.key] = x.fp; });
      MP.save(); MP.render();
    }
    // keyboard focus follows the read: to the notes' header after a read, to the folded pin after "Got it" and back
    const focusFk = (fk) => { const f = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (f) f.focus({ preventScroll: true }); };
    MP.on(P, () => { read(MP.ls(lens)); focusFk(P + "-head"); });
    MP.on(P + "-ok", (el, n) => { const rd = cfg.store(MP.ls(lens)).read; const x = rd && rd.notes.find((y) => String(y.n) === String(n)); if (x) { x.resolved = true; MP.commit(); focusFk(`${P}-show:${n}`); } });
    MP.on(P + "-show", (el, n) => { const rd = cfg.store(MP.ls(lens)).read; const x = rd && rd.notes.find((y) => String(y.n) === String(n)); if (x) { x.resolved = false; MP.commit(); focusFk(`${P}-ok:${n}`); } });
    MP.on(P + "-regen", (el, n) => { A.bump(`read.${lens}.${n}`); MP.commit(); });
    MP.on(P + "-tone", () => { st.toneOpen = !st.toneOpen; MP.render(); });

    /* ---------- after render: highlights, the live button, the one-time offer, the note sequence ---------- */
    function mount(root, ls) {
      const d = cfg.store(ls), rd = d.read, btn = root.querySelector(".lr-go");
      const b = rd ? built(ls) : null;
      if (b) keys.forEach((k) => {
        const ta = root.querySelector("#" + CSS.escape(cfg.taId(k))); if (!ta) return;
        const spans = b.notes.filter((x) => x.a.box === k && x.a.s != null && x.a.e > x.a.s).map((x) => {
          const i = ta.value.indexOf(x.a.quote);
          return { s: i >= 0 ? i : x.a.s, e: i >= 0 ? i + x.a.quote.length : x.a.e, quote: x.a.quote, kind: x.a.kind, n: x.n.n, resolved: !!x.n.resolved };
        });
        // a KEEP mark that overlaps another note's words gives way (the note still quotes them)
        const ov = (x, y) => x.s < y.e && y.s < x.e;
        for (let i = spans.length - 1; i >= 0; i--) if (spans[i].kind === "keep" && spans.some((y) => y !== spans[i] && y.kind !== "keep" && ov(spans[i], y))) spans.splice(i, 1);
        if (!spans.length) return;
        A.highlight(ta, spans);
        if (st.newBox === k && ta.parentElement && ta.parentElement.classList.contains("rd-hl")) { const w = ta.parentElement; w.classList.add("rd-hl-new"); setTimeout(() => w.classList.remove("rd-hl-new"), 600); }
      });
      st.newBox = null;
      // the button follows the text without a re-render
      const sync = () => { if (!btn) return; const s = btnState(ls); btn.disabled = s.dis; const l = btn.querySelector(".lr-gl"); if (l) l.textContent = MP.t(s.label); const hn = root.querySelector(`#${lens}-lr-hint`); if (hn) hn.textContent = s.hint ? MP.t(s.hint) : ""; };
      keys.forEach((k) => { const ta = root.querySelector("#" + CSS.escape(cfg.taId(k))); if (ta) ta.addEventListener("input", () => setTimeout(sync, 0)); });   // after the lens's own input handler stores the text
      // one offer, once: the first time both required boxes are ready and the second loses focus, the button breathes
      const ta2 = root.querySelector("#" + CSS.escape(cfg.taId(cfg.req[1])));
      if (ta2 && !rd && !d.readOffered) ta2.addEventListener("blur", () => {
        if (d.read || d.readOffered || !enough(texts(ls))) return;
        d.readOffered = true; MP.save();
        const bb = document.querySelector(".lr-go"); if (bb) { bb.classList.remove("lr-offer"); void bb.offsetWidth; bb.classList.add("lr-offer"); }
      });
      // notes arrive one after another (150ms overlap): the header first, then each note when the one before ends
      const s = st.seq;
      if (s && rd && s.at === rd.at) {
        clearTimeout(s.tm);
        if (s.shown >= rd.notes.length) { st.seq = null; return; }
        const lastKey = s.shown === 0 ? `read.${lens}.head` : noteKey(rd.notes[s.shown - 1]);
        const el = root.querySelector(`.rd-block[data-rd-key="${CSS.escape(lastKey)}"]`);
        // animations off (capture tool, reduced motion): no sequence, everything arrives finished
        const tok = el && el.querySelector(".rd-tok"), cs = tok && getComputedStyle(tok);
        if (!document.documentElement.classList.contains("ld-live") || (el && el.hasAttribute("data-rd-anim") && (!cs || cs.animationName === "none" || cs.animationName === ""))) { st.seq = null; setTimeout(() => MP.render(), 0); return; }
        const wait = el && el.hasAttribute("data-rd-anim") ? Math.max(0, (+el.dataset.rdEnd || 0) - (+el.dataset.rdOff || 0) - 150) : 0;
        s.tm = setTimeout(() => {
          if (st.seq !== s) return;
          const r = MP.route();
          s.shown++;
          if (r.name !== "lens" || r.a !== lens) { st.seq = null; return; }
          st.newBox = curAlt(rd.notes[s.shown - 1]).box;
          MP.render();
        }, wait);
      } else if (s && (!rd || s.at !== rd.at)) st.seq = null;
    }

    /* ---------- revision trace (done screen) + one Brief fact ---------- */
    function rev(ls) {
      const rd = cfg.store(ls).read; if (!rd || !rd.log || !rd.log.addressed.length) return null;
      const lg = rd.log, bits = { en: [], zh: [] };
      lg.addressed.slice(0, 2).forEach((x) => {
        const l = label(x.box), r = byId[x.rule];
        if (x.add && x.add.length) { bits.en.push(`${l.en} now names ${x.add[0]}`); bits.zh.push(`${l.zh}补上了 ${x.add[0]}`); }
        else if (r && r.bit) { bits.en.push(r.bit.en); bits.zh.push(r.bit.zh); }
        else { bits.en.push(`${l.en} revised`); bits.zh.push(`改了${l.zh}`); }
      });
      const delta = keys.map((k) => { const a = lg.first[k] || "", z = lg.last[k] || "", zh = X.lang(z || a) === "zh", c0 = zh ? X.chars(a) : X.words(a), c1 = zh ? X.chars(z) : X.words(z); return { k, c0, c1, zh, d: Math.abs(c1 - c0) }; }).filter((x) => x.c0 && x.d >= 3).sort((a, z) => z.d - a.d)[0];
      if (delta) { const l = label(delta.k), u = W.words(delta.zh); bits.en.push(`${l.en} ${delta.c0} → ${delta.c1} ${u.en}`); bits.zh.push(`${l.zh} ${delta.c0} → ${delta.c1} ${u.zh}`); }
      return { trace: T([W.revised.en].concat(bits.en).join(" · "), [W.revised.zh].concat(bits.zh).join(" · ")), delta };
    }
    function trace(ls) { const r = rev(ls); return r ? r.trace : null; }
    function fact(ls) {
      const r = rev(ls); if (!r) return null; const dl = r.delta;
      const tail = dl ? T(` (${label(dl.k).en} ${dl.c0} → ${dl.c1} ${W.words(dl.zh).en})`, `（${label(dl.k).zh} ${dl.c0} → ${dl.c1} ${W.words(dl.zh).zh}）`) : T("", "");
      return { kind: "did", text: MP.t(T(`Revised the ${cfg.doc.en} after a second read${tail.en}.`, `按批注修改了${cfg.doc.zh}${tail.zh}。`)) };
    }

    if (!listening) {
      listening = true;
      // "Show it all" or Esc completes the stream on screen — and brings in the notes still waiting their turn
      document.addEventListener("click", (e) => { const sk = e.target.closest && e.target.closest(".lr-rows .rd-skip"); if (sk) all.forEach((x) => { if (x.st.seq) setTimeout(() => x.skip(), 0); }); }, true);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") all.forEach((x) => { if (x.st.seq) setTimeout(() => x.skip(), 0); }); });
    }
    all[all.length - 1].skip = skipAll;
    return { button, row, side, built, on, mount, trace, fact, texts, enough };
  };
})();

(function () {
  "use strict";
  const MP = window.MP;
  const h = MP.h, esc = MP.h.esc;
  const T = (en, zh) => ({ en, zh });
  const LANG = () => MP.lang();

  /* ================= numbers (all derived from MP.data) ================= */
  const F = MP.data.funnel, S = MP.data.funnelSteps;
  const E = F.earlier, R = F.recent;
  const NT = S.length - 1; // transitions
  const TR = [];
  for (let i = 0; i < NT; i++) {
    const rE = E[i + 1] / E[i], rR = R[i + 1] / R[i];
    const gap = R[i] * (rE - rR);                 // extra learners at step i+1 if the earlier rate had held
    const toEnd = R[S.length - 1] / R[i + 1];     // share of those who'd go on to complete (recent rates)
    TR.push({ i, rE, rR, d: (rR - rE) * 100, lostR: R[i] - R[i + 1], lostE: E[i] - E[i + 1], gap, comp: gap * toEnd });
  }
  const LEAK = TR.reduce((a, b) => (b.d < a.d ? b : a)).i;          // biggest fall in rate (week 1 → assignment)
  const MOSTLOST = TR.reduce((a, b) => (b.lostR > a.lostR ? b : a)).i;
  const base = TR[LEAK].rR, earlierRate = TR[LEAK].rE;               // 62.5% → 75%
  const COHORTS = 6;
  const perWeek = R[LEAK] / COHORTS;                                // learners reaching week 1 per weekly cohort
  const perMonth = perWeek * 52 / 12;
  const downstream = R[S.length - 1] / R[LEAK + 1];                 // started assignment → completed (recent)
  const overallE = E[S.length - 1] / E[0], overallR = R[S.length - 1] / R[0];
  /* Hoped-for lift: a teaching range from a +2.5-point nudge (≈ 5,900 learners per group, ≈ 22 weeks) up to the earlier
     level (+12.5 points). Below +2.5 the rule of thumb runs to tens of thousands of learners and years of cohorts —
     true, but not a test anyone would plan — so the slider stops there. */
  const BASE_PCT = Math.round(base * 1000) / 10;
  const LIFT_MIN = BASE_PCT + 2.5, LIFT_MAX = Math.round(earlierRate * 1000) / 10, LIFT_DEF = BASE_PCT + 5;
  const clampLift = (v) => Math.min(LIFT_MAX, Math.max(LIFT_MIN, Math.round((+v || LIFT_DEF) * 2) / 2));

  /** Rule of thumb (Lehr): per group ≈ 16·p̄(1−p̄)/δ² for ~80% power at 5% significance. */
  function plan(target) {
    const p2 = target / 100, dl = p2 - base, pb = (base + p2) / 2;
    const n = dl > 0 ? 16 * pb * (1 - pb) / (dl * dl) : Infinity;
    const nr = n > 20000 ? Math.round(n / 1000) * 1000 : n > 2000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
    return { target, lift: dl * 100, n: nr, weeks: Math.max(1, Math.ceil((2 * n) / perWeek)), extra: Math.round(dl * perMonth * downstream) };
  }

  /* ================= formatting ================= */
  const num = (x) => MP.n(Math.round(x));
  const rate = (r) => { const v = Math.round(r * 1000) / 10; return MP.n(v, v % 1 ? 1 : 0) + "%"; };
  const pts = (d) => { const v = Math.round(d * 10) / 10; if (v === 0) return "0"; const s = MP.n(Math.abs(v), v % 1 ? 1 : 0); return (v > 0 ? "+" : "−") + s; };
  /** Table precision: every rate and change with exactly one decimal, so a right-aligned column lines up on the point. */
  const rate1 = (r) => MP.pct(Math.round(r * 1000) / 1000, 1);
  const pts1 = (d) => { const v = Math.round(d * 10) / 10; if (v === 0) return MP.n(0, 1); return (v > 0 ? "+" : "−") + MP.n(Math.abs(v), 1); };
  const stepName = (i) => MP.t(S[i]);
  const trName = (i) => `${stepName(i)} → ${stepName(i + 1)}`;
  const quote = (s) => LANG() === "zh" ? `“${s}”` : `“${s}”`;
  let _cv;
  const textW = (str, px, weight, ls, fam) => {
    try { _cv = _cv || document.createElement("canvas").getContext("2d"); _cv.font = `${weight || 500} ${px}px ${fam || 'Inter, "PingFang SC", sans-serif'}`; return _cv.measureText(String(str)).width + (ls || 0) * px * String(str).length; }
    catch (e) { return String(str).length * px * 0.62; }
  };
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const ARR = '<svg class="ba-ar" viewBox="0 0 32 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1,10 H30 M23,3 L30,10 L23,17"/></svg>';
  /* a transition / action that was just picked (set by the click handler, consumed after the next mount) — lets the
     picked pill breathe and the detail settle in once, without replaying on unrelated re-renders */
  let justTr = false;
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

  /* ================= lens state ================= */
  function D(ls) {
    const d = ls.data;
    if (!Array.isArray(d.why)) d.why = [];
    if (!Array.isArray(d.checks)) d.checks = [];
    if (!d.memo || typeof d.memo !== "object") d.memo = {};
    if (typeof d.lift !== "number") d.lift = LIFT_DEF;
    if (d.lift < LIFT_MIN || d.lift > LIFT_MAX) d.lift = clampLift(d.lift);   // older saves allowed +0.5 (≈ 150,000 per group)
    if (typeof d.tr !== "number") d.tr = null;
    return d;
  }

  /* ================= copy ================= */
  const C = {
    ratioQ: {
      all: T("Of everyone who signed up, how many finished?", "所有报名的人里，有多少人完成了？"),
      started: T("Of those who started, how many finished?", "开始学习的人里，有多少人完成了？"),
      better: T("Whether this group did better than the last one", "这一批是不是比上一批做得更好")
    },
    reasons: {
      drop: T("Biggest drop in rate", "转化率降得最多"),
      lost: T("Most people lost", "流失人数最多"),
      fix: T("Easiest to change", "最容易改"),
      goal: T("Closest to the goal", "离最终目标最近")
    },
    checks: {
      mix: { t: T("Who signed up — did the mix of learners change?", "谁来报名——学员构成变了吗？"), s: T("If more learners arrived through a partner offer, the average could fall even if nobody's experience changed.", "如果更多学员来自合作渠道，即使每个人的体验都没变，平均值也可能下降。"), lens: "ds" },
      help: { t: T("Did stuck learners get help in time?", "卡住的学员及时得到帮助了吗？"), s: T("If help requests were slow or sent to the wrong team, learners stuck on an assignment may simply give up.", "如果求助回复慢、或被分到了错误的团队，卡在作业上的学员可能就放弃了。"), lens: "ai" },
      course: { t: T("Which courses recent learners took", "近期学员选了哪些课"), s: T("Some courses have a much harder first assignment than others.", "有些课程的第一份作业比别的难得多。") },
      season: { t: T("Time of year", "时间和季节"), s: T("Holidays and exam season change how much time learners have.", "假期和考试季会影响学员有多少时间。") },
      release: { t: T("Recent product or content changes", "近期的产品或内容改动"), s: T("A new assignment page or a changed deadline could explain a drop at one specific step.", "新的作业页面或调整过的截止时间，可能正好解释某一步的下降。") }
    },
    actions: {
      email: { t: T("Kick-off email + 15\u2011minute office hours", "作业启动提醒邮件 + <span class=\"ba-nw\">15 分钟答疑</span>"), s: T("On day 6, email a link straight to the first assignment and offer a short drop-in session.", "第 6 天发一封邮件，直接链接到第一份作业，并提供一次简短的线上答疑。"), effort: T("Low effort", "投入小"), time: T("Ready in a week", "约一周可上线"), short: T("a day-6 kick-off email plus office hours", "第 6 天的作业启动提醒邮件加答疑") },
      deadline: { t: T("Extend assignment deadlines", "延长作业截止时间"), s: T("Give everyone an extra week for the first assignment.", "第一份作业统一多给一周时间。"), effort: T("Low effort", "投入小"), time: T("Ready in days", "几天内可上线"), short: T("a one-week deadline extension", "延长一周作业截止时间") },
      redesign: { t: T("Redesign week-1 content", "重做第一周内容"), s: T("Rebuild the first week so the assignment feels like a natural next step.", "重新设计第一周，让作业成为顺理成章的下一步。"), effort: T("High effort", "投入大"), time: T("Ready in 2–3 months", "约 2–3 个月"), short: T("a redesigned first week", "重新设计的第一周") }
    },
    guards: {
      quality: T("Assignment quality (average score)", "作业质量（平均分）"),
      unsub: T("Email unsubscribes", "邮件退订率"),
      tickets: T("Help requests per learner", "人均求助次数"),
      later: T("Later steps (submitted → completed)", "后续步骤（提交 → 完成）")
    },
    memoKeys: ["rec", "why", "risk", "measure"],
    memoLabels: {
      rec: T("Recommendation", "建议"),
      why: T("Why", "理由"),
      risk: T("Risk", "风险"),
      measure: T("What we'll measure", "我们会看什么")
    },
    memoPh: {
      rec: T("Fix … first: test … with half of new learners.", "先修……：用一半新学员试行……"),
      why: T("That step fell from … to …", "这一步从……降到……"),
      risk: T("We don't yet know whether …", "我们还不确定……"),
      measure: T("Main number: … Guardrail: … About … learners per group.", "主要指标：…… 护栏：…… 每组约……人。")
    },
    memoHelp: {
      rec: T("The decision, in one or two sentences.", "一两句话写清决定。"),
      why: T("The one number that made you decide.", "让你做出决定的那个数字。"),
      risk: T("What could make you wrong?", "什么情况会说明你错了？"),
      measure: T("Main number, guardrail, and when you'll know.", "主要指标、护栏指标，以及什么时候能看到结果。")
    }
  };

  /* ================= SVG funnel ================= */
  /* Drawn at the host's real pixel width (1 SVG unit = 1 CSS px), so type sizes are true sizes.
     Intro (only under #view.enter): the recent bars grow out of the centre line row by row, the flows pour down between
     them, the earlier silhouette settles in and its outline traces, the people-lost pills pop. */
  const MAXD = Math.max(...TR.map((t) => Math.abs(t.d)));
  function funnelSVG(W, sel) {
    const narrow = W < 560, L = MP.lang(), zh = L === "zh";
    const fs = narrow ? 14.5 : 16.5;
    const chgW = narrow ? 52 : 132, colW = narrow ? 58 : 78;
    const xChg = W - 2, xRec = xChg - chgW, xEar = xRec - colW;
    const numsLeft = xEar - colW + 8;
    const labelW = narrow ? 0 : Math.max(158, Math.min(206, W * 0.24));
    const fx0 = narrow ? 28 : labelW + 6, fx1 = numsLeft - (narrow ? 8 : 20);
    const cx = (fx0 + fx1) / 2, half = (fx1 - fx0) / 2;
    const headH = narrow ? 34 : 42, lblH = narrow ? 24 : 0, barH = narrow ? 20 : 26, trH = narrow ? 46 : 50;
    const rows = []; let y = headH + (narrow ? 2 : 6);
    for (let i = 0; i < S.length; i++) {
      const top = y, bt = y + lblH, bb = bt + barH; rows.push({ top, bt, bb }); y = bb;
      if (i < NT) { rows[i].tz = y; y += trH; }
    }
    const H = y + 8;
    const hw = (arr, i) => Math.max(3, (arr[i] / arr[0]) * half);
    const f1 = (v) => v.toFixed(1);
    const out = [];
    out.push(`<svg class="ba-fun-svg ${narrow ? "is-narrow" : ""}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="ba-fun-title ba-fun-desc">`);
    out.push(`<title id="ba-fun-title">${esc(MP.t(T("LumenLearn funnel: earlier vs recent cohorts", "LumenLearn 漏斗：前期与近期批次对比")))}</title>`);
    out.push(`<desc id="ba-fun-desc">${esc(TR.map((t) => `${trName(t.i)}: ${rate1(t.rE)} → ${rate1(t.rR)}`).join("; "))}</desc>`);

    // selected band (behind everything) with a lens bar at its left edge
    if (sel != null) { const r = rows[sel]; out.push(`<g class="ba-band-g"><rect class="ba-band" x="0" y="${r.tz + 3}" width="${W}" height="${trH - 6}" rx="3"/><rect class="ba-band-bar" x="0" y="${r.tz + 3}" width="3" height="${trH - 6}"/></g>`); }

    // column heads: the mono instrument voice on desktop, plain sans on phones (narrow columns)
    const thFam = zh || narrow ? null : MONO, thPx = 13, thLs = zh ? 0.1 : narrow ? 0 : 0.1;
    const head = (x, label, sw) => {
      const txt = narrow || zh ? label : label.toUpperCase();
      const tw = textW(txt, thPx, 500, thLs, thFam);
      const swx = x - tw - 16;
      const swatch = narrow ? "" : sw === "e" ? `<rect class="ba-sw-e" x="${f1(swx)}" y="${headH - 25}" width="10" height="10" rx="1.5"/>` : sw === "r" ? `<rect class="ba-sw-r" x="${f1(swx)}" y="${headH - 25}" width="10" height="10" rx="1.5"/>` : "";
      return `${swatch}<text class="ba-th ${narrow ? "ba-th-n" : ""}" x="${x}" y="${headH - 15}" text-anchor="end">${esc(label)}</text>`;
    };
    if (!narrow) out.push(`<text class="ba-th" x="26" y="${headH - 15}">${esc(MP.t(T("Step", "步骤")))}</text><text class="ba-th" x="${f1(cx)}" y="${headH - 15}" text-anchor="middle">${esc(MP.t(T("Share of signups", "占报名人数")))}</text>`);
    out.push(head(xEar, MP.t(MP.data.periods.earlier.short), "e"), head(xRec, MP.t(MP.data.periods.recent.short), "r"), `<g data-rd-src="ba-chg">${head(xChg, MP.t(T("Change", "变化")))}</g>`);
    out.push(`<line class="ba-hair" x1="0" x2="${W}" y1="${headH - 4}" y2="${headH - 4}"/>`);

    // the centre line the recent bars grow out of
    out.push(`<line class="ba-axis" x1="${f1(cx)}" x2="${f1(cx)}" y1="${rows[0].top - 2}" y2="${rows[S.length - 1].bb + 6}"/>`);

    // earlier: ghost silhouette (fill) — its outline is traced on top of the bars below
    const silPts = (arr) => {
      const right = [], left = [];
      rows.forEach((r, i) => { const w = hw(arr, i); const yt = i === 0 ? r.bt : r.top; right.push([cx + w, yt], [cx + w, r.bb]); left.push([cx - w, yt], [cx - w, r.bb]); });
      return right.concat(left.reverse()).map((p) => p.map(f1).join(",")).join(" ");
    };
    out.push(`<polygon class="ba-ghost" points="${silPts(E)}"/>`);
    // recent: flows between the bars, then the bars
    rows.forEach((r, i) => {
      if (i < NT) {
        const a = hw(R, i), b = hw(R, i + 1), n = rows[i + 1];
        out.push(`<polygon class="ba-flow ${sel === i ? "on" : ""}" style="--i:${i}" points="${[[cx - a, r.bb], [cx + a, r.bb], [cx + b, n.top], [cx + b, n.bb], [cx - b, n.bb], [cx - b, n.top]].map((p) => p.map(f1).join(",")).join(" ")}"/>`);
      }
    });
    rows.forEach((r, i) => { const w = hw(R, i); out.push(`<rect class="ba-bar ${sel != null && (i === sel || i === sel + 1) ? "on" : ""}" style="--i:${i}" x="${f1(cx - w)}" y="${r.bt}" width="${f1(2 * w)}" height="${barH}" rx="1.5"/>`); });
    out.push(`<polygon class="ba-ghost-line" pathLength="1" points="${silPts(E)}"/>`);
    // phone: each step name gets its own clear lane above its bar — the funnel shapes are masked out of it
    if (narrow) rows.forEach((r, i) => { if (i) out.push(`<rect class="ba-lane" x="${f1(fx0 - 8)}" y="${r.top}" width="${f1(fx1 - fx0 + 16)}" height="${lblH}"/>`); });

    // stage labels + counts
    rows.forEach((r, i) => {
      const my = r.bt + barH / 2 + 5;
      if (narrow) out.push(`<text class="ba-stage ba-stage-n" x="${f1(fx0 - 4)}" y="${r.top + 16}">${esc(stepName(i))}</text>`);
      else out.push(`<text class="ba-stage" x="26" y="${my}">${esc(stepName(i))}</text>`);
      out.push(`<text class="ba-n ba-n-e" x="${xEar}" y="${my}" text-anchor="end" style="font-size:${fs}px">${num(E[i])}</text>`);
      out.push(`<text class="ba-n ba-n-r" x="${xRec}" y="${my}" text-anchor="end" style="font-size:${fs}px">${num(R[i])}</text>`);
    });

    // transitions: radio, people-lost pill, rates, change (+ a small change bar on desktop)
    const zx = xChg - 56, barLen = Math.max(24, zx - (xRec + 18));
    TR.forEach((t) => {
      const r = rows[t.i], my = r.tz + trH / 2, on = sel === t.i;
      out.push(`<circle class="ba-radio ${on ? "on" : ""}" cx="10" cy="${my}" r="7"/>${on ? `<circle class="ba-radio-in" cx="10" cy="${my}" r="2.8"/>` : ""}`);
      const lbl = zh ? `流失 ${num(t.lostR)}` : `${num(t.lostR)} lost`;
      const pw = textW(lbl, 13, 500) + 22, ph = 24;
      const px = cx - pw / 2, py = my - ph / 2;
      out.push(`<g class="ba-pill ${on ? "on" : ""}" style="--i:${t.i}">${on ? `<rect class="ba-pill-ring" x="${f1(px)}" y="${f1(py)}" width="${f1(pw)}" height="${ph}" rx="${ph / 2}"/>` : ""}<rect class="ba-pill-bg" x="${f1(px)}" y="${f1(py)}" width="${f1(pw)}" height="${ph}" rx="${ph / 2}"/><text x="${f1(cx)}" y="${f1(my + 4.6)}" text-anchor="middle">${esc(lbl)}</text></g>`);
      out.push(`<text class="ba-rt ba-rt-e" x="${xEar}" y="${my + 5}" text-anchor="end" style="font-size:${fs}px">${rate1(t.rE)}</text>`);
      out.push(`<text class="ba-rt ba-rt-r ${on ? "on" : ""}" x="${xRec}" y="${my + 5}" text-anchor="end" style="font-size:${fs}px">${rate1(t.rR)}</text>`);
      const big = Math.abs(t.d) >= 5;
      out.push(`<text class="ba-rt ba-chg ${big ? "big" : ""} ${on ? "on" : ""}" x="${xChg}" y="${my + 5}" text-anchor="end" style="font-size:${fs}px">${pts1(t.d)}</text>`);
      if (!narrow) {
        const bw = Math.abs(t.d) / MAXD * barLen;
        out.push(`<line class="ba-zero" x1="${zx}" x2="${zx}" y1="${my - 9}" y2="${my + 9}"/>`);
        if (bw >= 0.5) out.push(`<rect class="ba-cb ${big ? "big" : ""} ${on ? "on" : ""}" style="--i:${t.i}" x="${f1(t.d < 0 ? zx - bw : zx)}" y="${my - 4}" width="${f1(bw)}" height="8" rx="1"/>`);
      }
    });
    out.push(`</svg>`);

    // HTML hit targets over each transition zone (keyboard + screen reader friendly)
    const hits = TR.map((t) => {
      const r = rows[t.i];
      const label = MP.t(T(`${trName(t.i)}: ${rate1(t.rE)} earlier, ${rate1(t.rR)} recent (${pts1(t.d)} points); ${num(t.lostR)} recent learners didn't continue`, `${trName(t.i)}：前期 ${rate1(t.rE)}，近期 ${rate1(t.rR)}（${pts1(t.d)} 个百分点）；近期有 ${num(t.lostR)} 人没有继续`));
      return `<button type="button" class="ba-hit" data-rd-src="ba-tr-${t.i}" style="top:${(r.tz / H * 100).toFixed(3)}%;height:${(trH / H * 100).toFixed(3)}%" aria-pressed="${sel === t.i}" data-action="ba-tr" data-arg="${t.i}" data-fk="ba-tr:${t.i}"><span class="sr-only">${esc(label)}</span></button>`;
    }).join("");
    return out.join("") + hits;
  }

  function drawFunnel(root) {
    const host = root.querySelector(".ba-fun");
    if (!host) return;
    const W = Math.round(host.clientWidth);
    if (!W || +host.dataset.w === W) return;
    host.dataset.w = W;
    host.innerHTML = funnelSVG(W, D(MP.ls("ba")).tr);
  }

  /* ================= test planner ================= */
  /* Learners per group (rule of thumb) against the target rate, on a linear axis, so the hockey stick is honest:
     every point on the curve is plan(t). The slider sits under the plot with the same horizontal extent (the plot is
     inset by the thumb radius), so the dot always stands right above the thumb. */
  const nAt = (t) => { const p2 = t / 100, pb = (base + p2) / 2, dl = p2 - base; return 16 * pb * (1 - pb) / (dl * dl); };
  const N_HI = nAt(LIFT_MIN);
  const Y_STEP = N_HI > 4000 ? 2000 : 1000;
  const Y_MAX = Math.ceil(N_HI / Y_STEP) * Y_STEP;
  const WK_MAX = plan(LIFT_MIN).weeks;
  function curvePath() {
    const N = 96, pts = [];
    const at = (t) => ({ x: (t - LIFT_MIN) / (LIFT_MAX - LIFT_MIN) * 100, y: 100 - nAt(t) / Y_MAX * 100 });
    for (let k = 0; k <= N; k++) { const q = at(LIFT_MIN + (LIFT_MAX - LIFT_MIN) * k / N); pts.push(`${k ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`); }
    const line = pts.join(" ");
    return { line, area: line + " L100,100 L0,100 Z", at };
  }
  const CURVE = curvePath();

  const weeksV = (w) => "≈ " + MP.n(w) + (LANG() === "zh" ? " 周" : "");
  const weeksS = (w) => MP.t(w === 1 ? T("week of new learners", "按每周新学员人数估算") : T("weeks of new learners", "按每周新学员人数估算"));
  const liftS = (p) => MP.t(T(`${pts(p.lift)} pts on ${rate(base)} today`, `比现在的 ${rate(base)} 高 ${pts(p.lift).replace("+", "")} 个百分点`));
  function plannerHTML(d) {
    const p = plan(d.lift), cur = CURVE.at(d.lift);
    const grid = []; for (let v = Y_STEP; v <= Y_MAX; v += Y_STEP) grid.push(`<i class="ba-cv-gl" style="top:${(100 - v / Y_MAX * 100).toFixed(2)}%"><span>${num(v)}</span></i>`);
    const wk = Array.from({ length: WK_MAX }, (_, k) => `<i class="${k < p.weeks ? "on" : ""}" style="--i:${k}"></i>`).join("");
    return `<div class="ba-plan">
      <div class="ba-plan-top">
        <div class="ba-tgt"><span class="ld-label">${MP.t(T("Today → your target", "现在 → 你的目标"))}</span>
          <div class="ba-tgt-v num"><span class="b">${rate(base)}</span>${ARR}<em data-ba-out="target" data-ld-count data-ld-from="${BASE_PCT}" data-ld-delay="250">${rate(d.lift / 100)}</em></div>
          <div class="s" data-ba-out="lift">${liftS(p)}</div></div>
        <div class="ba-outs">
          <div class="ba-out"><div class="k">${MP.t(T("Learners per group", "每组学员数"))}</div><div class="v num" data-ba-out="n" data-ld-count data-ld-delay="250">≈ ${num(p.n)}</div><div class="s">${MP.t(T("one group gets the change, the other doesn't", "一组用新方案，另一组照旧"))}</div></div>
          <div class="ba-out"><div class="k">${MP.t(T("Time to fill both groups", "凑齐两组要多久"))}</div><div class="v num" data-ba-out="weeks" data-ld-count data-ld-delay="250">${weeksV(p.weeks)}</div>
            <div class="ba-wk" aria-hidden="true">${wk}</div><div class="s" data-ba-out="weeksSub">${weeksS(p.weeks)}</div></div>
          <div class="ba-out"><div class="k">${MP.t(T("Extra completions", "多完成的人数"))}</div><div class="v num" data-ba-out="extra" data-ld-count data-ld-delay="250">≈ ${num(p.extra)}</div><div class="s">${MP.t(T("a month, if it works for everyone", "每月，如果有效并推广给所有人"))}</div></div>
        </div>
      </div>
      <figure class="ba-cv">
        ${h.figCap(MP.t(T("Fig. 4 · Learners per group", "图 4 · 每组需要的学员数")), MP.t(T("Rule of thumb", "经验估算")))}
        <div class="ba-cv-plot" aria-hidden="true">${grid.join("")}
          <svg class="ba-cv-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="ba-cv-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ba);stop-opacity:.30"/><stop offset="1" style="stop-color:var(--ba);stop-opacity:.03"/></linearGradient></defs>
            <path class="ba-cv-area" d="${CURVE.area}" fill="url(#ba-cv-g)"/><path class="ba-cv-line" d="${CURVE.line}"/></svg>
          <span class="ba-cv-guide" style="left:${cur.x.toFixed(2)}%;top:${cur.y.toFixed(2)}%"></span>
          <span class="ba-cv-dot ${cur.y < 22 ? "side" : ""}" style="left:${cur.x.toFixed(2)}%;top:${cur.y.toFixed(2)}%"><b data-ba-out="dotn">${num(p.n)}</b></span>
        </div>
        <div class="ba-slider" data-rd-src="ba-lift">
          <label for="ba-lift" class="sr-only">${MP.t(T("Target start-assignment rate", "目标开始作业比例"))}</label>
          <input type="range" class="mp-range" id="ba-lift" min="${LIFT_MIN}" max="${LIFT_MAX}" step="0.5" value="${d.lift}" data-input="ba-lift" aria-valuetext="${rate(d.lift / 100)}">
          <div class="ba-ticks"><span><b class="num">${rate(LIFT_MIN / 100)}</b><em>${MP.t(T("a small nudge", "小幅提升"))}</em></span><span><b class="num">${rate(LIFT_MAX / 100)}</b><em>${MP.t(T("back to the earlier level", "回到前期水平"))}</em></span></div>
        </div>
      </figure>
      <div class="ba-rule">${h.fold("ba-rule", MP.t(T("How this is estimated", "这个数怎么估的")), `<p>${MP.t(T(`A common rule of thumb: learners per group ≈ 16 × p × (1 − p) ÷ lift², where p is the average of today's rate and your target. It's a rough guide, not a guarantee. It assumes one cohort signs up each week, so about ${num(perWeek)} learners a week reach week 1. The slider starts at +2.5 points: smaller hoped-for lifts need tens of thousands of learners per group.`, `常用的经验公式：每组人数 ≈ 16 × p × (1 − p) ÷ 提升幅度²，p 取现在和目标比例的平均值。这只是粗略估计，不是保证。这里假设每周一批新学员，每周约有 ${num(perWeek)} 人进入首周活跃。滑块从 +2.5 个百分点起步：希望的提升再小，每组就要上万人。`))}</p>`)}</div>
    </div>`;
  }
  function updatePlanner(root, v) {
    const p = plan(v), set = (k, html) => { const el = root.querySelector(`[data-ba-out="${k}"]`); if (el) el.innerHTML = html; };
    set("target", rate(v / 100));
    set("lift", liftS(p));
    set("n", "≈ " + num(p.n));
    set("weeks", weeksV(p.weeks));
    set("weeksSub", weeksS(p.weeks));
    set("extra", "≈ " + num(p.extra));
    set("dotn", num(p.n));
    const pos = CURVE.at(v), dot = root.querySelector(".ba-cv-dot"), guide = root.querySelector(".ba-cv-guide");
    [dot, guide].forEach((el) => { if (el) { el.style.left = pos.x.toFixed(2) + "%"; el.style.top = pos.y.toFixed(2) + "%"; } });
    if (dot) dot.classList.toggle("side", pos.y < 22);
    root.querySelectorAll(".ba-wk i").forEach((c, k) => c.classList.toggle("on", k < p.weeks));
    const sl = root.querySelector("#ba-lift");
    if (sl) { if (+sl.value !== +v) sl.value = v; MP.rangeFill(sl); sl.setAttribute("aria-valuetext", rate(v / 100)); }
  }

  /* ================= memo helpers ================= */
  const BLANK = "___";
  /** Sentence starters built only from the student's own choices. What they skipped stays a ___ blank to fill in.
      The test always acts on the assignment step, so Recommendation, Why and Measure all name that step once a
      change was picked; a different funnel pick is mentioned in Risk as a second option. */
  function starters(ls, lang) {
    const d = D(ls), L = lang || LANG(), tt = (o) => o[L] || o.en, zh = L === "zh";
    const act = d.action ? C.actions[d.action] : null;
    const pick = d.tr != null ? d.tr : null;
    const focus = act ? LEAK : pick;                       // the step the memo is about
    const r = (x) => { const v = Math.round(x * 1000) / 10; return Number(v).toLocaleString(zh ? "zh-CN" : "en-US", { maximumFractionDigits: 1 }) + "%"; };
    const n0 = (x) => Math.round(x).toLocaleString(zh ? "zh-CN" : "en-US");
    const nm = (i) => `${tt(S[i])} → ${tt(S[i + 1])}`;
    const low = (x) => zh ? x : x.charAt(0).toLowerCase() + x.slice(1);
    const guard = d.guard ? low(tt(C.guards[d.guard])) : BLANK;
    const checks = d.checks || [];
    const p = act ? plan(d.lift || LIFT_DEF) : null;
    const t = focus != null ? TR[focus] : null;
    const other = act && pick != null && pick !== LEAK ? TR[pick] : null;
    if (zh) {
      return {
        rec: focus != null
          ? `先修“${nm(focus)}”这一步：用一半新学员试行${act ? tt(act.short) : BLANK}，确认有效后再全面推广。`
          : `先修“${BLANK}”这一步：用一半新学员试行${BLANK}。`,
        why: t
          ? `这一步的转化率从 ${r(t.rE)} 降到 ${r(t.rR)}${focus === LEAK ? "，是整个漏斗里降得最多的一步" : ""}；近期批次有 ${n0(t.lostR)} 人停在这里。如果保持原来的转化率，会多约 ${n0(Math.max(0, t.gap))} 人走到下一步。`
          : `这一步的转化率从 ${BLANK} 降到 ${BLANK}，近期有 ${BLANK} 人停在这里。`,
        risk: (other ? `我也看过“${nm(pick)}”（${r(other.rE)} → ${r(other.rR)}），如果这次试验没有效果，它是下一个备选。` : "")
          + (focus != null || checks.length
            ? `我们还不确定下降有多少来自${checks.includes("mix") || !checks.length ? "报名人群的变化" : BLANK}${checks.includes("help") ? "，以及卡住的学员是否没能及时得到帮助" : ""}。改动本身也可能带来副作用，所以会盯住“${guard}”。`
            : `我们还不确定${BLANK}。改动本身也可能带来副作用，所以会盯住${BLANK}。`),
        measure: act
          ? `主要指标：首周活跃学员中开始作业的比例（现在 ${r(base)}，目标 ${r(p.target / 100)}）。护栏：${guard}。每组约 ${n0(p.n)} 人，大约 ${p.weeks} 周能看到结果。`
          : t
            ? `主要指标：到达“${tt(S[focus])}”的学员中走到“${tt(S[focus + 1])}”的比例（现在 ${r(t.rR)}，目标 ${BLANK}）。护栏：${guard}。每组约 ${BLANK} 人。`
            : `主要指标：${BLANK}（现在 ${BLANK}，目标 ${BLANK}）。护栏：${BLANK}。每组约 ${BLANK} 人。`
      };
    }
    return {
      rec: focus != null
        ? `Fix the “${nm(focus)}” step first: test ${act ? tt(act.short) : BLANK} on half of new learners, and roll it out only if it works.`
        : `Fix the ${BLANK} step first: test ${BLANK} with half of new learners.`,
      why: t
        ? `This step's rate fell from ${r(t.rE)} to ${r(t.rR)}${focus === LEAK ? " — the biggest drop anywhere in the funnel" : ""}, and ${n0(t.lostR)} recent learners stopped here. If the earlier rate had held, about ${n0(Math.max(0, t.gap))} more would have reached the next step.`
        : `That step fell from ${BLANK} to ${BLANK}, and ${BLANK} recent learners stopped there.`,
      risk: (other ? `I also looked at “${nm(pick)}” (${r(other.rE)} → ${r(other.rR)}); it's the next option if this test doesn't move the number. ` : "")
        + (focus != null || checks.length
          ? `We don't yet know how much of the drop comes from ${checks.includes("mix") || !checks.length ? "a change in who signed up" : BLANK}${checks.includes("help") ? ", or from stuck learners not getting help in time" : ""}. The change itself could backfire, so we'll watch ${guard}.`
          : `We don't yet know whether ${BLANK}. The change itself could backfire, so we'll watch ${BLANK}.`),
      measure: act
        ? `Main number: the share of week-1 learners who start an assignment (${r(base)} today; aiming for ${r(p.target / 100)}). Guardrail: ${guard}. About ${n0(p.n)} learners per group, so roughly ${p.weeks} weeks.`
        : t
          ? `Main number: the share of learners at “${tt(S[focus])}” who reach “${tt(S[focus + 1])}” (${r(t.rR)} today; aiming for ${BLANK}). Guardrail: ${guard}. About ${BLANK} learners per group.`
          : `Main number: ${BLANK} (${BLANK} today; aiming for ${BLANK}). Guardrail: ${BLANK}. About ${BLANK} learners per group.`
    };
  }
  const hasBlank = (v) => String(v || "").indexOf(BLANK) >= 0;
  /** Sample memo text follows the language toggle until the student edits it, or until it has had a second read
      (the read's notes quote exact words, so the text they quote must not change language under them). */
  function memoVal(ls, k) {
    const d = D(ls), v = d.memo[k] || "";
    if (d.sampleLang && v) {
      const other = d.sampleLang === "zh" ? "en" : "zh";
      const same = sampleMemo(d.sampleLang)[k], alt = sampleMemo(other)[k];
      const sn = d.read && d.read.snap ? d.read.snap[k] : null;
      if (sn != null && (v === same || v === alt) && (sn === same || sn === alt)) return sn;   // read: stay in the read's language
      if (v === same && MP.lang() !== d.sampleLang) return sampleMemo(MP.lang())[k];
      if (v === alt && MP.lang() === d.sampleLang) return same;
    }
    return v;
  }
  function sampleMemo(L) {
    const p = plan(LIFT_DEF), t = TR[LEAK];
    const r = (x) => { const v = Math.round(x * 1000) / 10; return v + "%"; };
    if (L === "zh") return {
      rec: `先修“首周活跃 → 开始作业”：拿一半新学员试行第 6 天的作业启动提醒邮件加 15 分钟答疑，有效再推广。`,
      why: `这一步从 ${r(t.rE)} 掉到 ${r(t.rR)}，是漏斗里降幅最大的一步。如果这一步没掉，这 6 批里大约会多 ${Math.round(t.gap)} 人开始作业。`,
      risk: `合作渠道来的学员变多了，可能本来就更难坚持；求助被分错团队也可能是原因。邮件太多可能惹人烦。`,
      measure: `看首周活跃学员中开始作业的比例，目标 ${r(p.target / 100)}；护栏是作业平均分。每组约 ${p.n.toLocaleString("zh-CN")} 人，约 ${p.weeks} 周。`
    };
    return {
      rec: `Fix “Active in week 1 → Started an assignment” first. Test a day-6 kick-off email plus 15-minute office hours with half of new learners before rolling it out.`,
      why: `That step fell from ${r(t.rE)} to ${r(t.rR)}, the biggest drop in the funnel. Had it held, about ${Math.round(t.gap)} more learners would have started an assignment over six cohorts.`,
      risk: `More learners now come through partner offers and may stick with it less; misrouted help requests could also be part of it. Too many emails could annoy people.`,
      measure: `Share of week-1 learners who start an assignment, aiming for ${r(p.target / 100)}. Guardrail: average assignment score. About ${p.n.toLocaleString("en-US")} learners per group, roughly ${p.weeks} weeks.`
    };
  }

  /** Practitioner teaching example (deliberately different from the sample student's memo). */
  function proMemo(L) {
    const p = plan(LIFT_DEF), t = TR[LEAK];
    const r = (x) => { const v = Math.round(x * 1000) / 10; return v + "%"; };
    const n0 = (x) => Math.round(x).toLocaleString(L === "zh" ? "zh-CN" : "en-US");
    if (L === "zh") return {
      rec: `用一半新学员做两周试验：第 6 天发一封直达第一份作业的提醒邮件，并开放 15 分钟线上答疑。重做第一周内容的事，等试验结果出来再定。`,
      why: `只有“首周活跃 → 开始作业”这一步明显变差：${r(t.rE)} → ${r(t.rR)}。仅这一步，近期批次就少了约 ${n0(t.gap)} 人开始作业，最终约少 ${n0(t.comp)} 人完成课程。`,
      risk: `合作渠道学员已占报名的一半，无论怎么改，他们的转化可能都偏低；“我卡住了”的求助回复慢也可能是原因。如果主要是这两点，邮件解决不了问题。`,
      measure: `主要指标：首周活跃学员中开始作业的比例（目标 ${r(p.target / 100)}，每组约 ${n0(p.n)} 人，约 ${p.weeks} 周）。护栏：作业平均分、退订率。判断规则：开始作业的比例上升且质量不降，就推广。`
    };
    return {
      rec: `Run a test of a day-6 nudge — a short email linking straight to the first assignment, plus 15-minute drop-in office hours — with half of new learners. Hold off on a week-1 redesign until we see the result.`,
      why: `Only one step got much worse: “Active in week 1 → Started an assignment,” ${r(t.rE)} → ${r(t.rR)}. That step alone cost about ${n0(t.gap)} assignment starts and roughly ${n0(t.comp)} completions across the recent cohorts.`,
      risk: `Partner-offer learners are now half of signups and may convert less whatever we do; slow answers to “I'm stuck” messages could also be part of it. If either explains most of the drop, an email won't fix it.`,
      measure: `Primary: share of week-1 learners who start an assignment (target ${r(p.target / 100)}; about ${n0(p.n)} per group, roughly ${p.weeks} weeks). Guardrails: average assignment score and unsubscribes. Roll out if starts rise and quality holds.`
    };
  }

  /** The number behind the memo: the focus step's rate, earlier vs recent, as two computed bars. */
  function leakFocus(ls) { const d = D(ls); return d.action ? LEAK : d.tr != null ? d.tr : null; }
  function leakFig(i) {
    if (i == null) return "";
    const t = TR[i];
    const row = (cls, k, r) => `<div class="ba-lk-r ${cls}"><span class="k">${k}</span><span class="tr"><i style="width:${(r * 100).toFixed(1)}%"></i></span><b class="num">${rate1(r)}</b></div>`;
    return `<figure class="ba-leak" data-rd-src="ba-leakfig" role="img" aria-label="${esc(MP.t(T(`${trName(i)}: ${rate1(t.rE)} earlier, ${rate1(t.rR)} recent`, `${trName(i)}：前期 ${rate1(t.rE)}，近期 ${rate1(t.rR)}`)))}">
      <figcaption class="ld-label">${MP.t(T(`The number · step ${i + 1} → ${i + 2}`, `关键数字 · 第 ${i + 1} → ${i + 2} 步`))}</figcaption>
      ${row("e", MP.t(MP.data.periods.earlier.short), t.rE)}${row("r", MP.t(MP.data.periods.recent.short), t.rR)}</figure>`;
  }

  function memoDoc(ls, o) {
    o = o || {};
    const rows = C.memoKeys.map((k) => {
      const v = memoVal(ls, k).trim();
      return `<div class="ba-doc-row"><div class="ba-doc-k">${MP.t(C.memoLabels[k])}</div><div class="ba-doc-v">${v ? nl2br(v) : `<span class="faint">${MP.t(T("Not written yet", "还没写"))}</span>`}</div></div>`;
    }).join("");
    return `<article class="ba-doc ${o.cls || ""}">
      <header class="ba-doc-head ba-doc-split"><div class="ba-doc-to"><div class="ba-doc-meta"><span>${MP.t(T("To", "致"))}</span>${MP.t(T("Product lead, LumenLearn", "LumenLearn 产品负责人"))}</div>
        <div class="ba-doc-meta"><span>${MP.t(T("About", "事由"))}</span>${MP.t(T("28-day completion fell from 27.0% to 20.5%", "28 天完成率从 27.0% 降到 20.5%"))}</div></div>${leakFig(leakFocus(ls))}</header>
      ${rows}</article>`;
  }

  /* ================= steps ================= */
  const steps = [];

  /* ---------- 1. ratio ---------- */
  steps.push({
    id: "ratio",
    title: T("Read the ratio", "先读懂一个比例"),
    short: T("Read the ratio", "读懂比例"),
    lead: T("Same 40 people, two different percentages. The [[denominator]] — the number under the line — decides which question each one answers.", "同样是 40 个人，却有两个不同的百分比。[[denominator]]——也就是除号下面的数——决定了它回答的是哪个问题。"),
    render(ls) {
      const d = D(ls);
      const dots = Array.from({ length: 100 }, (_, k) => { const col = k % 20, row = Math.floor(k / 20); const g = col < 8 ? "c" : col < 16 ? "s" : "n"; return `<i class="ba-dot ${g}" style="grid-column:${col + 1};grid-row:${row + 1};--c:${col};--r:${row}"></i>`; }).join("");
      const q = (key, num0, den, res, val) => `
        <div class="ba-q" data-q="${key}" data-rd-src="ba-q-${key}">
          <div class="ba-q-f">
            <div class="ba-frac num"><span>${num0}</span><span class="ba-div">÷</span><span class="ba-den">${den}</span><span class="ba-eq">=</span><b>${res}</b></div>
            <div class="ba-mini" aria-hidden="true"><span class="ba-mini-den" style="width:${den}%"><span class="ba-mini-num" style="width:${num0 / den * 100}%"></span></span></div>
            <div class="ba-q-ask ld-label">${MP.t(T("Answers which question?", "回答的是哪个问题？"))}</div>
          </div>
          <div class="options" role="radiogroup" aria-label="${esc(`${num0} ÷ ${den}`)}">${Object.keys(C.ratioQ).map((k) => h.option(MP.t(C.ratioQ[k]), "", "ba-ratio", key + ":" + k, val === k, { cls: "ba-opt" })).join("")}</div>
        </div>`;
      return `<div class="work ba-ratio"><div class="ba-ex-wrap">
        <div class="ba-ex" role="img" aria-label="${esc(MP.t(T("100 people signed up; 80 of them started; 40 finished.", "100 人报名，其中 80 人开始学习，40 人完成。")))}">
          ${h.figCap(MP.t(T("Fig. 1 · A tiny course", "图 1 · 一门小课")), MP.t(T("Example", "示例")))}
          <div class="ba-brk ba-brk-100"><span>${MP.t(T("100 signed up", "100 人报名"))}</span></div>
          <div class="ba-brk ba-brk-80" style="width:80%"><span>${MP.t(T("80 started", "80 人开始"))}</span></div>
          <div class="ba-dots">${dots}</div>
          <div class="ba-seg"><span style="width:40%"><i class="ba-dot c"></i>${MP.t(T("40 finished", "40 人完成"))}</span><span style="width:40%"><i class="ba-dot s"></i>${MP.t(T("40 started, didn't finish", "40 人开始了但没完成"))}</span><span style="width:20%"><i class="ba-dot n"></i>${MP.t(T("20 never started", "20 人没开始"))}</span></div>
        </div>
        <p class="ba-ex-note">${MP.t(T("Each bracket marks a possible denominator. Point at or tap a question below to see which group it divides by.", "每个括号标出一种可能的<span class=\"ba-nw\">分母</span>。指向或点一下下面的问题，看看它除以的是哪一组人。"))}</p></div>
        <div class="ba-qs">${q("1", 40, 100, "40%", d.r1)}${q("2", 40, 80, "50%", d.r2)}</div>
      </div>`;
    },
    ready: (ls) => !!(ls.data.r1 && ls.data.r2),
    reveal(ls) {
      const d = D(ls);
      const right = d.r1 === "all" && d.r2 === "started", swapped = d.r1 === "started" && d.r2 === "all";
      const trap = !right;
      const lab = (k) => { const v = MP.t(C.ratioQ[k]).replace(/[?？]$/, ""); return LANG() === "zh" ? v : v.charAt(0).toLowerCase() + v.slice(1); };
      const your = MP.t(right
        ? T("Both right. Each percentage answers the question its denominator sets.", "两个都对：每个百分比回答的，正是它的分母设定的问题。")
        : swapped
          ? T("You swapped these two, which is easy to do. 40 ÷ 100 is out of all 100 who signed up; 40 ÷ 80 is out of the 80 who started.", "这两个容易弄反：40 ÷ 100 的基数是全部 100 个报名者，40 ÷ 80 的基数是开始学习的 80 人。")
          : T(`You read 40 ÷ 100 as “${lab(d.r1)}” and 40 ÷ 80 as “${lab(d.r2)}.” Ask “out of whom?” for each: 100 is everyone who signed up, 80 is only those who started.`, `你把 40 ÷ 100 理解为“${lab(d.r1)}”，把 40 ÷ 80 理解为“${lab(d.r2)}”。对每个数都问一句“在谁当中？”：100 是所有报名的人，80 只是开始学习的人。`));
      const pts0 = [
        T("The [[denominator]] decides the question. 40 ÷ 100 is “out of everyone who signed up”; 40 ÷ 80 is “out of those who started.” Same 40 people, two stories.", "[[denominator]]决定问题。40 ÷ 100 是“在所有报名的人里”；40 ÷ 80 是“在开始学习的人里”。同样 40 个人，两种说法。"),
        T(`LumenLearn's 27.0% → 20.5% is out of everyone who signed up. Each step in the next screen uses a different denominator: the people who reached the step before.`, `LumenLearn 的 27.0% → 20.5% 是以所有报名者为分母。下一页漏斗里的每一步，分母都不同：是到达上一步的人。`),
        T("Earlier and recent are different [[cohort|cohorts]] — different people, not the same people getting worse. A single ratio can't tell you whether one group “did better”; you need two ratios with the same denominator.", "前期和近期是不同的[[cohort|批次]]——是不同的人，而不是同一批人变差了。单个比例说明不了哪一批“做得更好”，需要两个分母相同的比例来比较。")
      ];
      return trap ? { trap: true, your, points: pts0 } : { your, points: pts0 };
    },
    hints: [
      T("Look at the number under the line: 100 is everyone who signed up; 80 is only the people who started.", "看除号下面的数：100 是所有报名的人；80 只是开始学习的人。"),
      T("Ask “out of whom?” For 40 ÷ 80, the answer is “out of the 80 who started.”", "问一句“在谁当中？”40 ÷ 80 的答案是“在开始学习的 80 人当中”。"),
      T("Example: 40 ÷ 100 = 40% → of everyone who signed up, 40% finished. 40 ÷ 80 = 50% → of those who started, half finished. Neither one compares two groups.", "示例：40 ÷ 100 = 40%，即所有报名的人里 40% 完成了；40 ÷ 80 = 50%，即开始学习的人里一半完成了。两个都没有在比较两批人。")
    ],
    shows: T("Intro analytics and statistics courses: rates, denominators and cohort comparisons come up in the first weeks.", "商业分析和统计入门课：比例、分母和批次对比，通常在头几周就会出现。")
  });

  /* ---------- 2. funnel ---------- */
  steps.push({
    id: "funnel",
    title: T("Find where the funnel leaks", "找出漏斗漏得最多的地方"),
    short: T("Find the leak", "找漏点"),
    lead: T("Every step in LumenLearn's 28-day [[funnel]], earlier [[cohort|cohorts]] side by side with recent ones. Tap the step-to-step change you'd fix first.", "LumenLearn 28 天[[funnel|漏斗]]里的每一步，前期[[cohort|批次]]和近期批次并排对比。点选你会最先去修的那一段转化。"),
    render(ls) {
      const d = D(ls), sel = d.tr;
      let detail;
      if (sel == null) {
        detail = `<div class="ba-detail-empty"><span class="ba-tap" aria-hidden="true"><i></i></span><p>${MP.t(T("Tap any row between two steps to see what that change cost — then say why you'd start there.", "点选两步之间的任意一行，看看这段转化的变化带来了多少损失，再说说你为什么从这里开始。"))}</p></div>`;
      } else {
        const t = TR[sel];
        const held = t.gap > 5
          ? { v: `<span data-ld-count data-ld-delay="500">+${num(t.gap)}</span>`, s: MP.t(T(`more would have reached “${stepName(sel + 1)},” and about ${num(t.comp)} more would have finished`, `人会走到“${stepName(sel + 1)}”，最终约多 ${num(t.comp)} 人完成课程`)) }
          : { v: MP.t(T("No gap", "几乎没差")), s: MP.t(T("This step held its earlier rate", "这一步保持了前期的水平")) };
        detail = `<div class="ba-detail-on ${justTr ? "ba-new" : ""}">
          <div class="ba-detail-head"><span class="ld-label">${MP.t(T(`Step ${sel + 1} → ${sel + 2}`, `第 ${sel + 1} → ${sel + 2} 步`))}</span><h3 class="h3">${esc(trName(sel))}</h3></div>
          <div class="ba-figs">
            <div class="ba-fig"><div class="k ld-label">${MP.fmt(T("[[rate|Conversion rate]]", "[[rate|转化率]]"))}</div><div class="v ba-rd">${h.readout({ size: "md", from: t.rE, to: t.rR, count: true })}</div><div class="s"><b>${pts1(t.d)}</b> ${MP.t(T("points", "个百分点"))}</div></div>
            <div class="ba-fig"><div class="k ld-label">${MP.t(T("Didn't continue (recent)", "没有继续（近期）"))}</div><div class="v num"><span data-ld-count data-ld-delay="350">${num(t.lostR)}</span></div><div class="s">${MP.t(T(`Earlier: ${num(t.lostE)} of ${num(E[sel])}`, `前期：${num(E[sel])} 人中 ${num(t.lostE)} 人`))}</div></div>
            <div class="ba-fig ba-fig-held" data-rd-src="ba-held"><div class="k ld-label">${MP.t(T("If the earlier rate had held", "如果保持前期的转化率"))}</div><div class="v num">${held.v}</div><div class="s">${held.s}</div></div>
          </div>
          <div class="ba-why"><div class="ba-why-q">${MP.t(T("Why start here? Pick one or two.", "为什么从这里开始？选一到两个理由。"))}</div>
            <div class="chips">${Object.keys(C.reasons).map((k) => h.chip(MP.t(C.reasons[k]), "ba-why", k, d.why.includes(k), { sm: true })).join("")}</div></div>
        </div>`;
      }
      return `<div class="work ba-funnel">
        ${h.figCap(MP.t(T("Fig. 2 · The 28-day funnel", "图 2 · 28 天学习漏斗")))}
        <div class="ba-fun-top">
          <div class="ba-fun-ro"><span class="ld-label">${MP.t(T("28-day completion", "28 天完成率"))}</span>${h.readout({ size: "md", from: overallE, to: overallR })}</div>
          <div class="ba-key">
            <span class="ba-key-n">${MP.t(T(`Earlier = cohorts 1–6, recent = cohorts 7–12. Bar width = share of signups who reached the step. Change is in percentage points.`, `前期 = 第 1–6 批，近期 = 第 7–12 批。条形宽度 = 到达这一步的人占报名人数的比例；变化单位为百分点。`))}</span>
          </div>
        </div>
        <div class="ba-fun ${justTr ? "just" : ""}">${funnelSVG(816, sel)}</div>
        <div class="ba-detail" aria-live="polite">${detail}</div>
      </div>`;
    },
    ready: (ls) => ls.data.tr != null && (ls.data.why || []).length > 0,
    reveal(ls) {
      const d = D(ls), t = TR[d.tr];
      const reasons = d.why.map((k) => MP.t(C.reasons[k]).toLowerCase());
      const join = (a) => LANG() === "zh" ? a.join("、") : a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0];
      // check each stated reason against the numbers on screen; say kindly when one doesn't hold
      const off = reasonChecks(d);
      const your = off.length
        ? off.map((o) => MP.t(o)).join(LANG() === "zh" ? "" : " ")
        : MP.t(T(`You'd fix “${trName(d.tr)}” first — ${join(reasons)}.`, `你会先修“${trName(d.tr)}”，理由是：${join(d.why.map((k) => MP.t(C.reasons[k])))}。`));
      const L0 = TR[LEAK];
      const points = [
        T("Practitioners weigh three things together: how many people pass through the step, how much its rate changed compared with before, and how fixable it is — size × change × fixability.", "从业者会把三件事放在一起权衡：有多少人经过这一步、它的转化率比以前变了多少、以及它好不好改——规模 × 变化 × 可改性。"),
        T(`“${trName(LEAK)}” fell the most (${rate(L0.rE)} → ${rate(L0.rR)}). Had it held, about ${num(L0.gap)} more learners would have started an assignment — and roughly ${num(L0.comp)} more would have finished.`, `“${trName(LEAK)}”降得最多（${rate(L0.rE)} → ${rate(L0.rR)}）。如果没降，大约会多 ${num(L0.gap)} 人开始作业，最终约多 ${num(L0.comp)} 人完成课程。`)
      ];
      let trap = off.length > 0;
      if (d.tr !== LEAK) {
        const mv = Math.abs(Math.round(t.d * 10) / 10), mvs = MP.n(mv, mv % 1 ? 1 : 0), fell = t.d < -0.05;
        const back = Math.max(0, Math.round(t.comp));
        points.push(fell
          ? T(`Your pick is defensible if it's much easier to change — say so in your memo. “${trName(d.tr)}” fell ${mvs} points, so even a full fix wins back about ${num(back)} completions.`, `如果这一步明显更容易改，你的选择也说得通——在建议里写明这一点。“${trName(d.tr)}”下降了 ${mvs} 个百分点，即使完全修好，也只能多挽回约 ${num(back)} 人完成课程。`)
          : T(`“${trName(d.tr)}” held its earlier rate, so fixing it would win back almost nothing that was lost. It can still be worth improving — but it isn't where the drop came from.`, `“${trName(d.tr)}”基本保持了前期的转化率，修它几乎挽回不了这次流失的人。它仍然值得改进，但下降并不是从这里来的。`));
      }
      if (d.why.includes("lost")) {
        points.push(T(`“Most people lost” always points near the top, where drop-off is naturally large (“${trName(MOSTLOST)}” lost ${num(TR[MOSTLOST].lostR)}, but it lost ${num(TR[MOSTLOST].lostE)} before, too). Compare with the earlier rate, not with zero.`, `“流失人数最多”总会指向漏斗上方，那里本来流失就大（“${trName(MOSTLOST)}”近期流失 ${num(TR[MOSTLOST].lostR)} 人，但前期也流失了 ${num(TR[MOSTLOST].lostE)} 人）。要和前期的转化率比，而不是和零比。`));
        if (d.why.length === 1 && d.tr !== LEAK) trap = true;
      }
      if (d.why.includes("goal")) points.push(T("“Closest to the goal” is tempting, but late steps touch fewer people — even a big fix there moves the total only a little.", "“离目标最近”很诱人，但越靠后的步骤经过的人越少——即使大幅改善，对整体的影响也有限。"));
      return { trap, your, points };
    },
    hints: [
      T("Compare each rate with the same step in the earlier cohorts, not with 100%.", "把每一步的转化率和前期同一步比，而不是和 100% 比。"),
      T("Find the row where the Change column moves the most — then check how many people pass through that step.", "找出“变化”一栏变动最大的那一行，再看看有多少人经过这一步。"),
      T(`Example: “${MP.t(S[LEAK])} → ${MP.t(S[LEAK + 1])}” went from ${Math.round(TR[LEAK].rE * 1000) / 10}% to ${Math.round(TR[LEAK].rR * 1000) / 10}%. Had it held, about ${Math.round(TR[LEAK].gap)} more learners would have started an assignment.`, `示例：“${S[LEAK].zh} → ${S[LEAK + 1].zh}”从 ${Math.round(TR[LEAK].rE * 1000) / 10}% 降到 ${Math.round(TR[LEAK].rR * 1000) / 10}%。如果没降，大约会多 ${Math.round(TR[LEAK].gap)} 人开始作业。`)
    ],
    shows: T("Marketing and product analytics courses: funnel and conversion analysis, often on real event data.", "营销分析和产品分析课：漏斗与转化分析，常用真实的行为数据。")
  });
  // the example hint's en string must use English step names
  steps[1].hints[2].en = `Example: “${S[LEAK].en} → ${S[LEAK + 1].en}” went from ${Math.round(TR[LEAK].rE * 1000) / 10}% to ${Math.round(TR[LEAK].rR * 1000) / 10}%. Had it held, about ${Math.round(TR[LEAK].gap)} more learners would have started an assignment.`;

  /** Reasons that can be checked against the data: "biggest drop in rate", "most people lost", "closest to the goal". */
  function reasonChecks(d) {
    const t = TR[d.tr], out = [], nm = trName(d.tr);
    const mv = Math.abs(Math.round(t.d * 10) / 10);
    if (d.why.includes("drop") && d.tr !== LEAK) {
      out.push(mv < 0.5
        ? T(`You picked “${nm}” for its drop in rate, but this step's rate actually held (${rate1(t.rE)} → ${rate1(t.rR)}), so it isn't where the drop came from. The biggest fall is “${trName(LEAK)}” (${pts1(TR[LEAK].d)}).`, `你选“${nm}”的理由是转化率降得最多，但这一步的转化率其实没变（${rate1(t.rE)} → ${rate1(t.rR)}），下降不是从这里来的。降得最多的是“${trName(LEAK)}”（${pts1(TR[LEAK].d)}）。`)
        : T(`You picked “${nm}” for its drop in rate. By rate it fell ${MP.n(mv, 1)} points; the biggest fall is “${trName(LEAK)}” (${pts1(TR[LEAK].d)}).`, `你选“${nm}”的理由是转化率降得最多。按转化率看，它降了 ${MP.n(mv, 1)} 个百分点；降得最多的是“${trName(LEAK)}”（${pts1(TR[LEAK].d)}）。`));
    }
    if (d.why.includes("lost") && d.tr !== MOSTLOST) {
      out.push(out.length
        ? T(`And by head count, this step lost ${num(t.lostR)} recent learners; the most were lost at “${trName(MOSTLOST)}” (${num(TR[MOSTLOST].lostR)}).`, `按人数看，这一步近期流失了 ${num(t.lostR)} 人；流失最多的是“${trName(MOSTLOST)}”（${num(TR[MOSTLOST].lostR)} 人）。`)
        : T(`You picked “${nm}” for the people it lost. By head count it lost ${num(t.lostR)} recent learners; the most were lost at “${trName(MOSTLOST)}” (${num(TR[MOSTLOST].lostR)}).`, `你选“${nm}”的理由是流失人数最多。按人数看，它近期流失了 ${num(t.lostR)} 人；流失最多的是“${trName(MOSTLOST)}”（${num(TR[MOSTLOST].lostR)} 人）。`));
    }
    if (d.why.includes("goal") && d.tr < 2) {
      out.push(out.length
        ? T(`It also sits near the top of the funnel; the step closest to the goal is “${trName(NT - 1)}.”`, `它也在漏斗的上段；离最终目标最近的是“${trName(NT - 1)}”。`)
        : T(`You picked “${nm}” as closest to the goal, but it sits near the top of the funnel; the step closest to the goal is “${trName(NT - 1)}.”`, `你选“${nm}”的理由是离目标最近，但它在漏斗的上段；离最终目标最近的是“${trName(NT - 1)}”。`));
    }
    return out;
  }

  /* ---------- 3. missing ---------- */
  steps.push({
    id: "missing",
    title: T("Before acting, what would you check?", "动手之前，你会先查什么？"),
    short: T("Check first", "先查什么"),
    lead: T("The funnel shows where learners leave, not why. Pick the two or three checks you'd run before spending money on a fix.", "漏斗告诉你学员在哪里离开，但没说为什么。选出你在花钱修之前会先做的两三项检查。"),
    render(ls) {
      const d = D(ls);
      const opts = Object.keys(C.checks).map((k) => h.option(MP.t(C.checks[k].t), MP.t(C.checks[k].s), "ba-check", k, d.checks.includes(k), { multi: true })).join("");
      let lead = "";
      if (d.checks.length) {
        const has = (k) => d.checks.includes(k);
        const card = (id, q, sub, on, st) => `<div class="ba-link lens-${id} ${on ? "on" : ""}"><span class="ld-gbox ld-grid">${MP.draw.glyph(id)}</span><span class="ba-link-h">${h.lensTag(id, { short: true })}<span class="ba-link-st">${st || on ? st || MP.t(T("You'd check this", "你会查这个")) : MP.t(T("Not on your list", "不在你的清单上"))}</span></span><div class="ba-link-q lens-q">${q}</div><div class="ba-link-s">${sub}</div></div>`;
        lead = `<div class="ba-links" data-rd-src="ba-links">${h.figCap(MP.t(T("Where your checks lead", "你的检查会通向哪里")), MP.t(T("One problem · three lenses", "一个问题 · 三个视角")))}
          <div class="ba-links-row ld-reveal">
            ${card("ba", MP.t(T("Where does the funnel leak?", "漏斗在哪里漏？")), (d.tr != null ? MP.t(T(`You, right here: ${trName(d.tr)}`, `就是你现在做的：${trName(d.tr)}`)) : MP.t(T("You, right here: finding the leak", "就是你现在做的：找漏点"))), true, MP.t(T("You are here", "你在这里")))}
            ${card("ds", MP.t(MP.lensInfo.ds.question), has("mix") ? MP.t(T("You asked this — it's the Data Science lens's whole job.", "你问到了——这正是数据科学视角要回答的。")) : MP.t(T("Worth asking: partner signups doubled in recent cohorts.", "值得一问：近期合作渠道的报名翻了一倍。")), has("mix"))}
            ${card("ai", MP.t(MP.lensInfo.ai.question), has("help") ? MP.t(T("You asked this — the AI lens follows those help requests.", "你问到了——人工智能视角追的就是这些求助消息。")) : MP.t(T("Worth asking: “I'm stuck” messages may go to the wrong team.", "值得一问：“我卡住了”的消息可能被分错团队。")), has("help"))}
          </div></div>`;
      }
      return `<div class="work ba-missing"><div class="options">${opts}</div>${lead}</div>`;
    },
    ready: (ls) => (ls.data.checks || []).length > 0,
    reveal(ls) {
      const d = D(ls), n = d.checks.length;
      const your = MP.t(n > 3 ? T(`You picked ${n}. All useful — in practice you'd order them by how cheap and how decisive each one is.`, `你选了 ${n} 项，都有用。实际工作中会按“多便宜、多能下结论”来排序。`) : T(`You'd check ${n === 1 ? "one thing" : n + " things"} first.`, `你会先查 ${n} 项。`));
      const points = [
        T("Before acting, rule out explanations that would make your fix pointless. Ask: what else changed at the same time? That's a [[confounder]].", "动手之前，先排除那些会让你的改动白费的解释。问一句：同一时间还有什么变了？这就是[[confounder]]。"),
        T("“Who signed up” is the Data Science lens's question: partner-offer signups went from 25% to 50% of recent cohorts. That's part of the story — not all of it.", "“谁来报名”正是数据科学视角的问题：近期批次里合作渠道的报名从 25% 升到了 50%。这是原因的一部分，但不是全部。"),
        T("“Did stuck learners get help?” is the AI lens's question: the help router sends some “I'm stuck on the assignment” messages to Tech support. That would hit exactly the step you found.", "“卡住的学员得到帮助了吗？”是人工智能视角的问题：求助分流器会把一些“作业卡住了”的消息分给技术支持——恰好会影响你找到的那一步。"),
        T("Calendar and release-log checks are cheap — often an afternoon — so practitioners usually do them first.", "查日历、查上线记录都很便宜，往往一个下午就够，所以从业者通常先做这些。")
      ];
      return { your, points };
    },
    hints: [
      T("Ask: what else changed at the same time as the drop?", "问问自己：下降发生的同时，还有什么变了？"),
      T("Think about the people (who signed up), the help they got, and the calendar.", "从三方面想：人（谁来报名）、他们得到的帮助、时间。"),
      T("Example: “Partner signups doubled in recent cohorts, so I'd check the mix before blaming the course — and I'd ask support whether assignment questions got slower answers.”", "示例：“近期合作渠道的报名翻倍了，所以在怪课程之前我会先查人群构成；我还会问客服，作业相关的问题是不是回复变慢了。”")
    ],
    shows: T("Business problem-solving and consulting-style courses: listing hypotheses before diving into data.", "商业问题解决和咨询类课程：先列出假设，再去看数据。")
  });

  /* ---------- 4. test ---------- */
  steps.push({
    id: "test",
    title: T("Design a small test", "设计一个小范围试验"),
    short: T("Design a test", "设计试验"),
    lead: T("Pick one change for the leaking step, decide what must not get worse, and see how many learners you'd need to tell whether it worked. This is a [[test]], not a rollout.", "为漏得最多的那一步选一个改动，想好什么不能变差，再看看需要多少学员才能判断它是否有效。这是一次[[test]]，不是全面上线。"),
    render(ls) {
      const d = D(ls);
      const acts = Object.keys(C.actions).map((k) => { const a = C.actions[k]; return h.option(MP.t(a.t), `${MP.t(a.s)}<span class="ba-meta"><span>${MP.t(a.effort)}</span><span>${MP.t(a.time)}</span></span>`, "ba-action", k, d.action === k, { cls: "ba-act" }); }).join("");
      const guards = Object.keys(C.guards).map((k) => h.chip(MP.t(C.guards[k]), "ba-guard", k, d.guard === k, { sm: true })).join("");
      const pickNote = d.tr != null && d.tr !== LEAK
        ? `<p class="ba-pick-note">${MP.t(T(`You picked “${trName(d.tr)}” in step 2. These changes act on the assignment step, so this test targets “${trName(LEAK)},” where the rate fell most. Your pick stays in the memo as a second option.`, `你在第 2 步选的是“${trName(d.tr)}”。这几个改动作用在开始作业这一步，所以这次试验针对降幅最大的“${trName(LEAK)}”；你的选择会作为备选写进建议。`))}</p>` : "";
      return `<div class="work ba-test">${pickNote}
        <section class="ba-sec"><div class="ba-sec-h"><span class="ba-sn">01</span><h3>${MP.t(T("Pick one change to try", "选一个要试的改动"))}</h3><span class="ba-sec-ctx">${MP.t(T(`for ${quote(trName(LEAK))}`, `针对“${trName(LEAK)}”`))}</span></div>
          <div class="ba-acts" role="radiogroup">${acts}</div></section>
        <section class="ba-sec"><div class="ba-sec-h"><span class="ba-sn">02</span><h3>${MP.fmt(T("Choose a [[guardrail|guardrail]]", "选一个[[guardrail|护栏指标]]"))}</h3><span class="ba-sec-ctx">${MP.t(T("What must not get worse?", "什么不能变差？"))}</span></div>
          <div class="chips" role="radiogroup" data-rd-src="ba-guards">${guards}</div></section>
        <section class="ba-sec"><div class="ba-sec-h"><span class="ba-sn">03</span><h3>${MP.t(T("How big a lift are you hoping for?", "你希望提升多少？"))}</h3><span class="ba-sec-ctx">${MP.t(T("Start-assignment rate", "开始作业的比例"))}</span></div>
          ${plannerHTML(d)}
        </section>
      </div>`;
    },
    ready: (ls) => !!(ls.data.action && ls.data.guard),
    reveal(ls) {
      const d = D(ls), p = plan(d.lift);
      const your = MP.t(T(`You'd test ${MP.t(C.actions[d.action].short)}, watch ${MP.t(C.guards[d.guard]).toLowerCase()}, and hope for ${rate(d.lift / 100)} — about ${num(p.n)} learners per group, roughly ${p.weeks} weeks.`, `你会试行${MP.t(C.actions[d.action].short)}，盯住“${MP.t(C.guards[d.guard])}”，希望达到 ${rate(d.lift / 100)}——每组约 ${num(p.n)} 人，大约 ${p.weeks} 周。`));
      const points = [
        T("Test before rollout: give the change to half of new learners and compare with the other half at the same time, so a busy season or a new partner can't fool you.", "先试验再推广：让一半新学员用新方案，和同一时间的另一半比较，这样旺季或新合作方就骗不了你。"),
        T("A [[guardrail]] keeps the win honest: more assignment starts don't help if quality or later completions quietly slip.", "[[guardrail]]让成果更可信：如果作业质量或后续完成率悄悄下滑，开始作业的人再多也没用。"),
        T("Smaller hoped-for lifts need far more learners. Drag the slider: halving the lift roughly quadruples the people you need.", "希望的提升越小，需要的人就越多。拖动滑块看看：提升减半，需要的人数大约变成四倍。")
      ];
      if (d.action === "redesign") points.push(T("A full redesign is a bigger bet: months to build, and if it works you won't know which part helped. Many teams test a small piece first.", "整体重做是更大的赌注：要花几个月，而且即使有效，你也不知道是哪一部分起了作用。很多团队会先试一小部分。"));
      if (d.action === "deadline") points.push(T("Careful with deadlines: an extra week can push finishing past the 28-day window, so completion could look worse even if learners are helped.", "延长截止时间要小心：多出的一周可能把完成时间推到 28 天之外，即使学员受益了，完成率看起来也可能更差。"));
      if (d.action === "email") points.push(T("A small, cheap change like an email lets you learn in weeks — and if it works, you know exactly what worked.", "像一封邮件这样小而便宜的改动，几周就能有结论；如果有效，你也清楚是什么起了作用。"));
      return { your, points };
    },
    hints: [
      T("Choose a change small enough to build in a week and aimed squarely at the leaking step.", "选一个一周内能做出来、并且正对着漏点的改动。"),
      T("A guardrail is something your change could make worse — for example, more starts but lower-quality work.", "护栏指标是你的改动可能让它变差的东西——比如开始作业的人多了，但作业质量下降了。"),
      T(`Example: kick-off email + office hours, guardrail = assignment quality, aiming for ${Math.round(LIFT_DEF * 10) / 10}% (+5 points) → about ${plan(LIFT_DEF).n.toLocaleString("en-US")} learners per group, roughly ${plan(LIFT_DEF).weeks} weeks.`, `示例：作业启动提醒邮件 + 答疑，护栏 = 作业质量，目标 ${Math.round(LIFT_DEF * 10) / 10}%（+5 个百分点）→ 每组约 ${plan(LIFT_DEF).n.toLocaleString("zh-CN")} 人，大约 ${plan(LIFT_DEF).weeks} 周。`)
    ],
    shows: T("Experimentation and A/B testing courses: sample size, guardrail metrics and test design.", "实验设计与 A/B 测试课：样本量、护栏指标和试验设计。")
  });

  /* ---------- 5. memo ---------- */
  steps.push({
    id: "memo",
    title: T("Write the one-page recommendation", "写一页行动建议"),
    short: T("Write the memo", "写建议"),
    lead: T("Two short boxes are enough. Write for a busy product lead who will read only the first line — or let the starters draft it from your choices, then make it yours.", "填两个短框就够了。想象读者是一位很忙、只看第一句的产品负责人——也可以先用句子开头帮你起草，再改成自己的话。"),
    render(ls) {
      const rb = RD ? RD.built(ls) : null, lr = RD && RD.on(ls) ? " lr-on" : "";
      const box = (k) => { const inner = boxIn(k); return RD ? RD.row(ls, k, inner, rb) : inner; };
      const boxIn = (k) => `<div class="ba-mf"><label for="ba-memo-${k}"><span class="ba-mk">${MP.t(C.memoLabels[k])}</span><span class="ba-mh">${MP.t(C.memoHelp[k])}</span></label>
        <textarea class="textarea" id="ba-memo-${k}" rows="3" data-input="ba-memo" data-arg="${k}" data-fk="ba-memo:${k}" placeholder="${esc(MP.t(C.memoPh[k]))}">${esc(memoVal(ls, k))}</textarea></div>`;
      const filled = (k) => !!memoVal(ls, k).trim();
      const moreCount = ["risk", "measure"].filter(filled).length;
      const more = h.fold("ba-memo-more", `${MP.t(T("Add the risk and what you'll measure", "补充风险和要看的指标"))}<span class="ba-fold-note">${MP.t(T("optional", "可选"))}${moreCount ? ` · ${MP.t(T(`${moreCount} of 2 written`, `已写 ${moreCount}/2`))}` : ""}</span>`, `<div class="ba-mfs lr-rows${lr}">${box("risk")}${box("measure")}</div>`);
      const ex = proMemo(LANG());
      const example = h.fold("ba-memo-ex", `${MP.t(T("Compare with a practitioner's version", "对照一位从业者的写法"))}<span class="ba-fold-note">${MP.t(T("teaching example", "教学示例"))}</span>`,
        `<div class="ba-ex-doc"><p class="ba-pro-note">${MP.t(T("One way an analyst might write it. Not the answer — notice what comes first, and how short each part is.", "一位分析师可能的写法。这不是标准答案——留意什么放在最前面，以及每部分有多短。"))}</p>
          <dl>${C.memoKeys.map((k) => `<dt>${MP.t(C.memoLabels[k])}</dt><dd>${esc(ex[k])}</dd>`).join("")}</dl></div>`, { boxed: true });
      const empty = C.memoKeys.some((k) => !filled(k));
      const blanks = C.memoKeys.some((k) => hasBlank(memoVal(ls, k)));
      return `<div class="work ba-memo">
        <div class="ba-memo-top"><div class="ba-doc-head ba-doc-head-in"><div class="ba-doc-meta"><span>${MP.t(T("To", "致"))}</span>${MP.t(T("Product lead, LumenLearn", "LumenLearn 产品负责人"))}</div><div class="ba-doc-meta"><span>${MP.t(T("About", "事由"))}</span>${MP.t(T("28-day completion fell from 27.0% to 20.5%", "28 天完成率从 27.0% 降到 20.5%"))}</div></div>
          ${leakFig(leakFocus(ls))}
          <div class="ba-memo-acts">${empty ? h.secondary(`<span class="ba-spark" aria-hidden="true">✎</span>${MP.t(T("Use sentence starters", "使用句子开头"))}`, "ba-starters", "", { sm: true }) : blanks ? `<span class="ba-blanks">${MP.t(T("Replace each ___ with your own words", "把每个 ___ 换成你自己的话"))}</span>` : `<span class="ba-allset">${MP.t(T("All four parts drafted", "四部分都写好了"))}</span>`}${RD ? RD.button(ls) : ""}</div></div>
        <div class="ba-mfs lr-rows${lr}" id="ba-memo-boxes">${box("rec")}${box("why")}</div>
        <div class="ba-memo-more">${more}</div>
      </div>${example}`;
    },
    ready: (ls) => ["rec", "why"].every((k) => { const v = memoVal(ls, k); return !!v.trim() && !hasBlank(v); }),
    reveal(ls) {
      const d = D(ls), st = d.starter || {};
      const filledAll = C.memoKeys.every((k) => memoVal(ls, k).trim() && !hasBlank(memoVal(ls, k)));
      const drafted = ["rec", "why"].every((k) => st[k] && memoVal(ls, k) === st[k]);
      const your = MP.t(drafted
        ? T("Drafted from starters — edit a line to make it yours.", "这是用句子开头起草的——改一两句，让它变成你自己的话。")
        : filledAll ? T("All four parts written — that's a memo someone can act on.", "四部分都写了——这是一份别人可以直接执行的建议。")
          : T("Recommendation and why are written; risk and measurement are there if you want them.", "建议和理由已经写好；风险和指标可以按需补充。"));
      return {
        your,
        points: [
          T("Decision first, evidence second: a product lead should be able to act on your first sentence alone.", "先写决定，再写证据：产品负责人只读第一句，也应该知道该做什么。"),
          T("One number beats five. Pick the one that made you decide — here, the week-1 → assignment rate.", "一个数字胜过五个。选那个让你下定决心的——这里就是“首周 → 作业”的转化率。"),
          T("Naming the risk isn't weakness. It tells the reader what would change the plan: the mix of signups, and help for stuck learners.", "写明风险不是示弱，而是告诉读者什么情况会改变计划：报名人群的构成，以及卡住的学员能否得到帮助。"),
          T("“What we'll measure” turns the memo into a promise you can check in a few weeks.", "“我们会看什么”让这份建议变成一个几周后可以检验的承诺。")
        ]
      };
    },
    hints: [
      T("Lead with the decision. Someone busy should get it from your first sentence.", "先写决定。忙碌的人读完第一句就该明白。"),
      T("Use one number for “why,” and name one thing that could prove you wrong.", "“理由”只用一个数字，再写一件可能证明你错了的事。"),
      T("Example: “Test a day-6 kick-off email with half of new learners. The week-1 → assignment step fell from 75% to 62.5%, the biggest drop in the funnel.”", "示例：“拿一半新学员试行第 6 天的作业启动提醒邮件。‘首周活跃 → 开始作业’从 75% 降到 62.5%，是漏斗里降幅最大的一步。”")
    ],
    shows: T("Capstone and client projects: short recommendation memos for a decision-maker who isn't technical.", "毕业项目和企业合作项目：为非技术背景的决策者写简短的建议。")
  });

  /* ================= AI layer ================= */
  /* AI-2 "Ask about this step" content (step.ask) and AI-1 "second read" rules for the memo. Everything is composed
     from the student's own picks/text and the numbers above; before a step is ready, chips explain and point, never
     reveal or rank the options. */
  const AIK = MP.ai, X = AIK && AIK.text;
  const trE = (i) => `${S[i].en} → ${S[i + 1].en}`, trZ = (i) => `${S[i].zh} → ${S[i + 1].zh}`;
  const pairS = (t) => `${rate1(t.rE)} → ${rate1(t.rR)}`;
  const LT = TR[LEAK];
  const r10 = (x) => Math.round(x * 10) / 10, r100 = (x) => Math.round(x * 100) / 100;
  const DROPP = r10((overallE - overallR) * 100), MIXP = r100(MP.data.reweighted - overallR * 100);
  const RB = MP.data.router.baseline, CT = RB.errors.contentToTech, WR = RB.auto - RB.correct;
  const gl = (g) => ({ en: C.guards[g].en.replace(/\s*\(.*\)$/, "").toLowerCase(), zh: C.guards[g].zh.replace(/（.*）$/, "") });
  const joinL = (a, zh) => (zh ? a.join("、") : a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "");
  const lowF = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const done = (id) => !!(MP.progress && MP.progress(id).complete);
  /** Every number the memo may use (from MP.data and this lens's own computations). */
  const KN = (() => {
    const k = [100, 80, 40, 50, 28, 15, 6, 27, 20.5, r10(overallE * 100), r10(overallR * 100), DROPP, MIXP, MP.data.reweighted, 25, 30, 18, 14, BASE_PCT, LIFT_MAX, r10(LIFT_MAX - BASE_PCT), CT, WR, Math.round(perWeek), Math.round(perMonth)];
    TR.forEach((t) => k.push(r10(t.rE * 100), r10(t.rR * 100), Math.round(t.rE * 100), Math.round(t.rR * 100), t.lostR, t.lostE, Math.floor(t.gap), Math.round(t.gap), Math.round(t.comp), Math.abs(r10(t.d))));
    E.concat(R).forEach((v) => k.push(v));
    for (let l = LIFT_MIN; l <= LIFT_MAX + 1e-9; l += 0.5) { const p = plan(l); k.push(l, p.n, p.weeks, p.extra, r10(p.lift)); }
    return k;
  })();
  /* lexicons (en word-boundary, zh substring) */
  const STEPW = [
    [0, ["Signed up", "signup", "sign-up"], ["报名"]],
    [1, ["Started first lesson", "first lesson"], ["开始首课", "首课"]],
    [2, ["Active in week 1", "week 1", "week-1", "week one", "first week"], ["首周活跃", "首周", "第一周"]],
    [3, ["Started an assignment", "assignment", "assignments"], ["开始作业", "作业"]],
    [4, ["Submitted assignment", "submitted", "submission"], ["提交作业", "提交"]],
    [5, ["Completed course"], ["完成课程"]]
  ];
  const LX = {
    step: { en: [].concat(...STEPW.map((x) => x[1])), zh: [].concat(...STEPW.map((x) => x[2])) },
    action: { en: ["email", "emails", "office hours", "deadline", "deadlines", "redesign", "kick-off", "kickoff", "nudge", "reminder", "drop-in"], zh: ["邮件", "答疑", "截止", "重做", "重新设计", "提醒"] },
    guard: { en: ["score", "scores", "quality", "unsubscribe", "unsubscribes", "help requests", "tickets", "guardrail", "guardrails", "later steps"], zh: ["平均分", "质量", "退订", "求助次数", "护栏", "后续步骤"] },
    mix: { en: ["partner", "partners", "partner-offer", "mix", "who signed up", "channel", "channels"], zh: ["合作", "渠道", "构成", "人群"] },
    help: { en: ["help", "misrouted", "stuck", "support", "router"], zh: ["求助", "分错", "卡住", "帮助", "分流"] },
    annoy: { en: ["annoy", "annoying", "annoyed", "annoys", "fatigue", "too many emails", "spam", "bother", "irritate"], zh: ["打扰", "烦", "骚扰", "邮件太多", "反感"] },
    vague: { en: ["onboarding", "engagement", "the experience", "user experience", "the start", "the beginning"], zh: ["新手引导", "体验", "参与度", "一开始"] },
    promise: { en: ["will fix", "fix the drop", "solve", "solves", "guarantee", "back to 27", "definitely", "for sure"], zh: ["一定", "解决", "恢复到", "回到 27", "保证"] },
    qty: { en: ["a lot of", "lots of", "many", "most", "a bunch of", "huge", "tons of", "so many"], zh: ["很多", "大量", "不少", "许多", "好多"] }
  };
  const stepHits = (H, k) => { const out = []; STEPW.forEach(([i, en, zh]) => { X.find(H.F[k].text, en.concat(zh)).forEach((x) => out.push(Object.assign({ i }, x))); }); return out.sort((a, b) => a.s - b.s); };
  const optLabels = () => {
    const o = []; const add = (x) => { if (x && x.en) { o.push(String(x.en).replace(/<[^>]*>/g, ""), String(x.zh).replace(/<[^>]*>/g, "")); } };
    for (let i = 0; i < NT; i++) o.push(trE(i), trZ(i));
    [C.reasons, C.guards, C.ratioQ, C.memoLabels].forEach((g) => Object.values(g).forEach(add));
    Object.values(C.actions).forEach((a) => { add(a.t); add(a.short); });
    Object.values(C.checks).forEach((a) => add(a.t));
    return o;
  };

  /* ---------- AI-1 rules for the memo (KEEP strengths first, then the rest by priority) ---------- */
  const RULES = [
    { id: "ba.decisionFirst", kind: "keep",
      test(F, c, H) {
        if (F.rec.empty) return null; const w = H.win("rec"), hit = H.find("rec", AIK.lex.actionVerb, LX.action, LX.step).find((x) => x.s < w);
        if (!hit || H.find("rec", AIK.lex.hedge).some((x) => x.s < hit.s)) return null;   // a hedge before the decision isn't decision-first
        return H.sent("rec");
      },
      say(F, c, a, H) { const named = stepHits(H, "rec").some((x) => x.s < H.win("rec") + 40); return { g: [
        T(["Your decision is the first thing a busy lead reads, and ", named ? "it names the exact step." : "it says what to do.", " They could act on this line alone."], ["第一句就写清了决定", named ? "，还点名了具体是哪一步" : "，说明了要做什么", "——忙碌的负责人只看这一句也能行动。"]),
        T(["Decision first, evidence second: that's the order a product lead reads in. Keep this opening."], ["先写决定，再给证据，正是产品负责人读东西的顺序。这个开头保留。"]),
        T(["This opening already does the hardest job: ", named ? "one step, one action" : "one clear action", ", before any numbers."], ["这个开头已经做完了最难的事：", named ? "一个步骤、一个行动" : "一个明确的行动", "，而且放在所有数字之前。"])],
        why: T(["Leads often decide from the first line, so a memo that opens with the action survives a skim."], ["负责人常常读完第一句就拍板；开头就是行动，扫一眼也不会漏掉。"]),
        cites: c.d.tr != null ? [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] : [] }; } },
    { id: "ba.numberMatched", kind: "keep",
      test(F, c, H) { const n = H.known("why")[0]; return n ? H.at("why", n) : null; },
      say(F, c, a, H) { const one = H.known("why").length === 1; return { g: one ? [
        T(["One number, and it's one a reader can check against the funnel. That's all Why needs."], ["只用了一个数字，而且读者能在漏斗里核对到它。“理由”要的就是这个。"]),
        T(["The number does the persuading here, not the adjectives. Keep it."], ["这里是数字在说服人，不是形容词。保留。"]),
        T(["A lead can check this figure in half a minute, which makes the whole memo easier to trust."], ["负责人半分钟就能核对这个数字，整份建议也因此更可信。"])] : [
        T(["Every number here matches your funnel view, so a reader who checks will find them."], ["这里的数字都能在漏斗里对上，读者去核对也找得到。"]),
        T(["The numbers do the persuading here, and they all check out against step 2. Keep them."], ["这里是数字在说服人，而且都能和第 2 步对上。保留。"]),
        T(["A lead can check these figures in half a minute, which makes the whole memo easier to trust."], ["负责人半分钟就能核对这些数字，整份建议也因此更可信。"])],
        why: T(["A figure the reader can find on their own dashboard settles an argument faster than any adjective."], ["读者能在自己的看板上找到的数字，比任何形容词都更快让人信服。"]),
        cites: [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] }; } },
    { id: "ba.guardNamed", kind: "keep",
      test(F, c, H) { const k = !F.measure.empty && H.has("measure", LX.guard) ? "measure" : !F.risk.empty && H.has("risk", LX.guard) ? "risk" : null; return k ? H.at(k, H.find(k, LX.guard)[0]) : null; },
      say() { return { g: [
        T(["You name what must not get worse. That's what keeps a win honest."], ["你写明了什么不能变差，这能让结果站得住。"]),
        T(["A guardrail in writing means nobody can declare victory on starts alone. Keep it."], ["把护栏写下来，就没人能只凭开始作业的人变多就宣布成功。保留。"]),
        T(["This is the line that stops a quick win from hiding a quiet loss."], ["这一句能防止一个快速的成果掩盖悄悄发生的损失。"])],
        why: T(["Without a guardrail, a test that raises starts but lowers quality would still look like a success."], ["没有护栏，一个让开始作业的人变多、作业质量却下降的试验，看起来照样像成功。"]),
        cites: [{ lens: "ba", step: "test" }] }; } },
    { id: "ba.short", kind: "keep",
      test(F, c, H) { const f = F.rec; if (f.empty) return null; return (f.lang === "zh" ? f.chars >= 12 && f.chars <= 60 : f.words >= 6 && f.words <= 30) ? H.sent("rec") : null; },
      say() { return { g: [
        T(["Short enough to read in one breath, which is what a busy lead needs."], ["够短，忙碌的负责人一口气就能读完。"]),
        T(["It's short, which helps: a lead will read all of it."], ["写得短，这很有用：负责人会从头读到尾。"]),
        T(["A lead can take this in at a glance."], ["负责人扫一眼就能读完。"])],
        why: T(["The shorter the decision, the more likely it's the part that gets read."], ["决定写得越短，越可能被真正读到。"]) }; } },

    { id: "ba.numberUnknown", kind: "try", pri: 1,
      test(F, c, H) { for (const k of ["why", "rec"]) { const n = H.unknown(k)[0]; if (n) return Object.assign(H.at(k, n), { x: { raw: n.raw } }); } return null; },
      say(F, c, a) { const own = !!c.t, t = c.t || LT, raw = esc(a.x.raw), p = pairS(t); return { g: [
        T(["I can't find ", { b: raw }, " in the funnel view. ", own ? "Your step shows " : "The biggest change on screen is ", { nw: p }, own ? "." : ", at the assignment step.", " Is the figure from somewhere else?"], ["漏斗里我没找到 ", { b: raw }, " 这个数。", own ? "你选的那一步是 " : "页面上变化最大的是开始作业这一步：", { nw: p }, "。这个数字是从别处来的吗？"]),
        T(["The funnel doesn't show ", { b: raw }, " anywhere. ", own ? "For your step it reads " : "The step that fell most reads ", { nw: p }, ". Worth a quick check before a lead does it for you."], ["漏斗里没有 ", { b: raw }, "。", own ? "你那一步的数字是 " : "降得最多的那一步是 ", { nw: p }, "，趁负责人还没看，先自己核对一下。"]),
        T(["Where does ", { b: raw }, " come from? Step 2 shows ", { nw: p }, own ? " for the step you picked." : " at the assignment step."], [{ b: raw }, " 是哪里来的？第 2 步里", own ? "你选的那一步是 " : "开始作业这一步是 ", { nw: p }, "。"])],
        d: [T(["Check ", { b: raw }, ": the funnel doesn't show it. Use ", { nw: p }, "."], ["核对一下 ", { b: raw }, "：漏斗里没有这个数。改用 ", { nw: p }, "。"]), T(["Swap ", { b: raw }, " for the figure on screen: ", { nw: p }, "."], ["把 ", { b: raw }, " 换成页面上的数字：", { nw: p }, "。"])],
        why: T(["A lead who checks one number and can't find it will start doubting the rest."], ["负责人核对一个数字发现对不上，就会开始怀疑其余的部分。"]),
        cites: [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] }; } },
    { id: "ba.pickMismatch", kind: "ask", pri: 2,
      test(F, c, H) { if (c.focus == null || F.rec.empty) return null; const hits = stepHits(H, "rec").filter((h) => h.i > 0 && h.i < 5); if (!hits.length || hits.some((h) => h.i === c.focus || h.i === c.focus + 1)) return null; return Object.assign(H.at("rec", hits[0]), { x: { i: hits[0].i } }); },
      say(F, c, a) { const i = a.x.i, f = c.focus, act = !!c.d.action; return { g: [
        T(["Your Recommendation names ", { b: S[i].en }, ", but ", act ? "your test in step 4 works on " : "in step 2 you picked ", { b: trE(f) }, ". Which one is this memo about?"], ["你的建议里写的是“", S[i].zh, "”，但", act ? "你第 4 步的试验针对的是" : "你第 2 步选的是", "“", trZ(f), "”。这份建议说的到底是哪一步？"]),
        T(["A reader will look for ", { b: trE(f) }, " here, since that's what ", act ? "your test changes" : "you picked in step 2", ". This line points at ", { b: S[i].en }, " instead. Is that on purpose?"], ["读者会在这里找“", trZ(f), "”，因为那是", act ? "你的试验要改的地方" : "你第 2 步选的", "。这一句却指向了“", S[i].zh, "”，是有意的吗？"])],
        d: [T(["Name the step your test acts on: ", { b: trE(f) }, "."], ["写明试验针对的那一步：“", trZ(f), "”。"])],
        why: T(["If the memo and the test name different steps, a lead won't know which one they're approving."], ["建议和试验说的不是同一步，负责人就不知道自己批准的是哪一个。"]),
        cites: [{ lens: "ba", step: act ? "test" : "funnel" }] }; },
      bit: T("Recommendation and test now name the same step", "建议和试验说的是同一步了") },
    { id: "ba.guardMismatch", kind: "ask", pri: 2,
      test(F, c, H) { if (F.risk.empty || !c.d.guard || c.d.guard === "unsub" || H.has("risk", { en: ["unsubscribe", "unsubscribes", "unsubscribed"], zh: ["退订"] })) return null; const h = H.find("risk", LX.annoy)[0]; return h ? H.at("risk", h) : null; },
      say(F, c) { const g = gl(c.d.guard); return { g: [
        T(["You name email fatigue as the risk, but your guardrail is ", { b: g.en }, ". Would unsubscribes catch the annoyance sooner, or is there a reason ", g.en, " matters more?"], ["你写的风险是邮件惹人烦，但护栏选的是", { b: g.zh }, "。如果担心打扰，退订率会更早发现问题——或者写明为什么", g.zh, "更重要？"]),
        T(["Your risk is people getting annoyed; your guardrail watches ", { b: g.en }, ". Those two don't meet yet. Which one would warn you first?"], ["你担心的是学员被打扰，护栏看的却是", { b: g.zh }, "。两者还没对上：哪一个会先给你报警？"]),
        T(["If annoyance is the worry, what number would show it? Your test plan guards ", { b: g.en }, ", which might not move at all."], ["如果担心的是惹人烦，什么数字能看出来？你的试验方案护的是", { b: g.zh }, "，它可能根本不会动。"])],
        d: [T(["Match the guardrail to the risk: annoyance shows up in unsubscribes, not in ", g.en, "."], ["让护栏对上风险：惹人烦会体现在退订率上，而不是", g.zh, "。"]), T(["Either add unsubscribes as a guardrail or say why ", g.en, " is the better warning."], ["要么把退订率加为护栏，要么写明为什么", g.zh, "更能提前报警。"])],
        why: T(["A guardrail only protects you from the risk it actually measures."], ["护栏只能防住它真正测量的那种风险。"]),
        cites: [{ lens: "ba", step: "test" }] }; },
      bit: T("Risk and guardrail now line up", "风险和护栏对上了") },
    { id: "ba.vague", kind: "unsure", pri: 3,
      test(F, c, H) { if (F.rec.empty || stepHits(H, "rec").length) return null; const h = H.find("rec", LX.vague)[0]; return h ? H.word("rec", h) : null; },
      say() { return { g: [
        T(["I'm not sure whether this means the welcome emails or the week-1 lessons. Naming one makes it testable."], ["我不确定这里指的是欢迎邮件还是第一周课程。点名其中一个，就能拿来做试验。"]),
        T(["I can't tell which step this points to, and a lead will ask. Name the step from your funnel."], ["我看不出这指的是哪一步，负责人一定会问。直接写出漏斗里的那一步。"])],
        d: [T(["Replace this with the step's name from the funnel."], ["换成漏斗里那一步的名字。"])],
        why: T(["A test needs one step to change; a broad word like this covers several."], ["试验需要一个明确要改的步骤，这样笼统的词会同时盖住好几步。"]),
        cites: [{ lens: "ba", step: "funnel" }] }; },
      bit: T("Recommendation now names a step", "建议点名了具体步骤") },
    { id: "ba.starts", kind: "try", pri: 4,
      test(F, c, H) { if (c.focus !== LEAK) return null; const g = H.near("why", LT.gap, 1); if (!g || H.near("why", LT.comp, 1)) return null; return Object.assign(H.at("why", g), { x: { raw: g.raw } }); },
      say(F, c, a) { const raw = esc(a.x.raw), cp = num(LT.comp); return { g: [
        T(["Would your lead know what ", { b: raw }, " starts means for the 27% they track? About ", { b: cp }, " of them would have finished. Half a sentence links the two."], [{ b: raw }, " 是开始作业的人数。负责人能一眼换算成完成率吗？其中约 ", { b: cp }, " 人会最终完成课程，补半句就接上了。"]),
        T([{ b: raw }, " is assignment starts; the lead tracks completions. About ", { b: cp }, " of those starts would have finished the course."], [{ b: raw }, " 说的是开始作业，负责人盯的是完成课程。这些人里约 ", { b: cp }, " 人会最终完成。"])],
        d: [T(["Turn ", { b: raw }, " starts into completions (about ", { b: cp }, "). That's the number your lead tracks."], ["把 ", { b: raw }, " 人开始作业换算成完成人数（约 ", { b: cp }, "），这是负责人真正盯的数字。"])],
        why: T(["Leads track completions, so a number in their own unit saves them a calculation."], ["负责人看的是完成人数，用他们的单位说话，就省得他们自己换算。"]),
        cites: [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] }; } },
    { id: "ba.numberMissing", kind: "try", pri: 4,
      test(F, c, H) {
        if (F.why.empty || H.nums("why").length || H.nums("rec").length) return null;
        for (const k of ["rec", "why"]) { const q = H.find(k, LX.qty)[0]; if (q) { const t = F[k].text, m = t.slice(q.e).match(/^\s+[A-Za-z]+|^[\u4e00-\u9fff]/); return { box: k, s: q.s, e: q.e + (m ? m[0].length : 0) }; } }
        return H.sent("why");
      },
      say(F, c) {
        const d = c.d;
        if (d.tr == null && !d.action) return { g: [
          T(["Which number made you decide? You skipped step 2, so I don't have a pick to take one from. The funnel there shows each step's rate, earlier and recent."], ["是哪个数字让你下的决定？你跳过了第 2 步，我没法从你的选择里找数字。那一步的漏斗里有每一步前后两期的转化率。"]),
          T(["I can't suggest a number here: step 2 is still open, and that's where the figures are."], ["这里我没法替你挑数字：第 2 步还没做，数字都在那一步里。"])],
          cites: [{ lens: "ba", step: "funnel" }] };
        if (d.why.includes("lost") && d.tr != null) { const t = TR[d.tr], most = d.tr === MOSTLOST, pr = `${rate(t.rE)} → ${rate(t.rR)}`; return { g: [
          T(["Which number made you decide? In step 2 you picked ", most ? "the step that lost the most people: " : "a step for the people it lost: ", { b: num(t.lostR) }, " recent learners (", { nw: pr }, "). Put that number here."], ["是哪个数字让你下的决定？你在第 2 步选的那一步", most ? "流失人数最多" : "，理由是流失的人多", "：近期 ", { b: num(t.lostR) }, " 人（", { nw: pr }, "）。把这个数字写进来。"]),
          T(["Your step 2 reason was the people lost, and that has a number: ", { b: num(t.lostR) }, " recent learners. A reader can't see it unless it's here."], ["你第 2 步的理由是流失人数，这个理由本身就有数字：近期 ", { b: num(t.lostR) }, " 人。不写进来，读者就看不到。"])],
          d: [T(["Add the number behind your pick: ", { b: num(t.lostR) }, " recent learners (", { nw: pr }, ")."], ["写上你那一步背后的数字：近期 ", { b: num(t.lostR) }, " 人（", { nw: pr }, "）。"])],
          why: T(["“Why” is the one place a reader looks for evidence. Without a figure, it reads as opinion."], ["“理由”是读者找证据的地方。没有数字，读起来就像个人看法。"]),
          cites: [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] }; }
        const t = c.t || LT, p = pairS(t); return { g: [
          T(["Which number made you decide? Your step reads ", { nw: p }, " in the funnel. One figure here does more than a paragraph."], ["是哪个数字让你下的决定？漏斗里你那一步是 ", { nw: p }, "。这里放一个数字，比一段话更有用。"]),
          T(["There's no number in Why yet. The one behind your pick is ", { nw: p }, "."], ["“理由”里还没有数字。你那一步背后的数字是 ", { nw: p }, "。"]),
          T(["A lead will ask how much. Your funnel already answers: ", { nw: p }, "."], ["负责人会问：降了多少？你的漏斗已经给了答案：", { nw: p }, "。"])],
          d: [T(["Put ", { nw: p }, " in Why."], ["把 ", { nw: p }, " 写进“理由”。"])],
          why: T(["“Why” is the one place a reader looks for evidence. Without a figure, it reads as opinion."], ["“理由”是读者找证据的地方。没有数字，读起来就像个人看法。"]),
          cites: [{ lens: "ba", step: "funnel", src: "ba-leakfig" }] };
      } },
    { id: "ba.mixRisk", kind: "ask", pri: 5,
      test(F, c, H) { if (!c.dsDone || F.risk.empty) return null; const h = H.find("risk", LX.mix)[0]; return h ? H.at("risk", h) : null; },
      say() { const m = MP.n(MIXP, 2), dr = MP.n(DROPP, 1); return { g: [
        T(["In the DS lens you found about half the drop (", { b: m }, " of ", { b: dr }, " points) comes from that change in who signed up. One clause on how the test would tell the two apart?"], ["你在 DS 视角里发现，约一半降幅（", { b: dr }, " 个百分点里的 ", { b: m }, " 个）正来自人群构成的变化。要不要加半句，说明试验怎么把两者分开？"]),
        T(["You already measured this one: ", { b: m }, " of the ", { b: dr }, "-point drop is mix, in your DS work. Would the test compare learners from the same channel?"], ["这一点你已经量过了：DS 视角里，", { b: dr }, " 个百分点中有 ", { b: m }, " 个来自构成变化。试验会在同一渠道的学员之间比较吗？"])],
        d: [T(["Add your DS number: ", { b: m }, " of ", { b: dr }, " points is mix. Say how the test keeps channels apart."], ["补上你在 DS 算出的数：", { b: dr }, " 个百分点里 ", { b: m }, " 个来自构成。再写明试验怎么把渠道分开。"])],
        why: T(["If half the drop is who signed up, a test that mixes channels could credit or blame the change for the wrong half."], ["如果一半降幅来自报名人群，渠道混在一起的试验，可能把另一半的功劳或过错算到改动头上。"]),
        cites: [{ lens: "ds", step: "split" }] }; } },
    { id: "ba.helpRisk", kind: "ask", pri: 5,
      test(F, c, H) { if (!c.aiDone || F.risk.empty) return null; const h = H.find("risk", LX.help)[0]; return h ? H.at("risk", h) : null; },
      say(F, c) { const here = c.focus === LEAK; return { g: [
        T(["In the AI lens you found the router sends content questions to Tech support: ", { b: CT }, " of its ", { b: WR }, " mistakes. Those are learners stuck on ", here ? "exactly this step" : "assignments", ". Worth one clause here?"], ["你在 AI 视角里发现，分流器会把课程内容问题分到技术支持：", WR, " 个错误里有 ", { b: CT }, " 个。这些正是卡在", here ? "这一步" : "作业上", "的学员。值得在这里加半句吗？"]),
        T(["Your AI work puts a number on this: ", { b: CT }, " of ", { b: WR }, " router mistakes send a content question to Tech support. Could the test run alongside a router fix, or would that blur the result?"], ["你在 AI 视角里给这件事算过数：分流器的 ", WR, " 个错误里，", { b: CT }, " 个把内容问题分给了技术支持。试验能和分流器的修复同时进行吗？还是会让结果说不清？"])],
        cites: [{ lens: "ai", step: "errors" }] }; } },
    { id: "ba.mixOpen", kind: "try", pri: 7,
      test(F, c, H) { if (c.dsDone || F.risk.empty) return null; const h = H.find("risk", LX.mix)[0]; return h ? H.at("risk", h) : null; },
      say() { return { g: [
        T(["You name the change in who signed up as a risk. The DS lens measures how much of the drop that explains, if you want a number for this line."], ["你把报名人群的变化列为风险。DS 视角会算出它到底解释了多少降幅，想给这一句配个数字，可以去那里看看。"]),
        T(["You name the mix risk before DS has measured it. How big it is has an answer in that lens; for now the memo can say it's unmeasured."], ["你在 DS 量出来之前就点出了人群构成的风险。它有多大，DS 视角里有答案；现在的建议可以先写明“还没量过”。"])],
        cites: [{ lens: "ds", step: "split", go: true }] }; } },
    { id: "ba.promise", kind: "ask", pri: 6,
      test(F, c, H) { for (const k of ["rec", "why"]) { const h = H.find(k, LX.promise, AIK.lex.overclaim)[0]; if (h) return H.at(k, h); } return null; },
      say(F, c) { const act = c.d.action ? C.actions[c.d.action].short : null, ds = c.dsDone, em = c.d.action === "email"; return { g: [
        T(["Can ", act ? ["one test of ", act.en] : "one change", " carry all of that? The test is there to find out how much it moves.", ds ? [" Your DS work found about half the drop (", { b: MP.n(MIXP, 2) }, " points) is a change in who signed up, which no ", em ? "email" : "change to this step", " can win back."] : ""], [act ? ["一次", act.zh, "的试验"] : "一处改动", "能扛下这么多吗？做试验，本来就是为了看它到底能带来多少。", ds ? ["你在 DS 视角里发现，约一半降幅（", { b: MP.n(MIXP, 2) }, " 个百分点）来自报名人群的变化，这部分", em ? "邮件" : "改这一步", "是挽回不了的。"] : ""]),
        T(["This promises more than a test can show yet. Try saying what you expect it to move, and by how much."], ["这句承诺的，比一次试验现在能证明的要多。试着写成：你预计它会改变什么、改变多少。"])],
        d: [T(["Promise the test, not the outcome: say what you'll learn and by when."], ["承诺试验，而不是结果：写明你会弄清什么、什么时候弄清。"])],
        why: T(["If the memo promises the whole drop back and the test recovers part of it, the test looks like a failure even when it worked."], ["如果建议承诺把降幅全部找回，而试验只挽回了一部分，那么即使试验有效，看起来也像失败。"]),
        cites: ds ? [{ lens: "ds", step: "split" }] : [{ lens: "ba", step: "test" }] }; },
      bit: T("Promise matched to the test", "承诺和试验对上了") },
    { id: "ba.measureNoGuard", kind: "try", pri: 6,
      test(F, c, H) { if (F.measure.empty || !c.d.guard || H.has("measure", LX.guard)) return null; return H.sent("measure"); },
      say(F, c) { const g = gl(c.d.guard); return { g: [
        T(["Your test plan watches ", { b: g.en }, " as the guardrail, but this box doesn't say so yet. One clause makes the promise checkable."], ["你的试验方案把", { b: g.zh }, "设为护栏，但这一栏还没写。补半句，这个承诺就能被检验。"]),
        T(["What must not get worse? Your step 4 answer was ", { b: g.en }, "; it belongs here."], ["什么不能变差？你在第 4 步的答案是", { b: g.zh }, "，它应该写在这里。"])],
        d: [T(["Add the guardrail: ", { b: g.en }, "."], ["补上护栏：", { b: g.zh }, "。"])],
        why: T(["A measure without a guardrail can only say the change worked, never that it backfired."], ["只有主要指标、没有护栏，只能说明改动有效，却永远发现不了它的副作用。"]),
        cites: [{ lens: "ba", step: "test" }] }; } },
    { id: "ba.decisionLate", kind: "try", pri: 7,
      test(F, c, H) {
        const s0 = F.rec.sents[0]; if (!s0) return null;
        const act = H.find("rec", AIK.lex.actionVerb, LX.action).filter((h) => h.s < s0.e);
        const hed = H.find("rec", AIK.lex.hedge).filter((h) => h.s < s0.e && (!act.length || h.s < act[0].s));
        if (!hed.length) return null;
        return Object.assign({ box: "rec", s: s0.s, e: hed[hed.length - 1].e }, { x: { n: hed.length } });
      },
      say(F, c, a) { const two = a.x.n > 1; return { g: [
        T([two ? "Two hedges come before the decision." : "A hedge comes before the decision.", " Try starting with the verb, and keep the doubts for Risk."], [two ? "决定前面先有了两处含糊的说法。" : "决定前面先有了一句含糊的话。", "试试直接用动词开头，把顾虑放进“风险”。"]),
        T(["The doubt arrives before the decision. A lead skimming the first line should meet the action first."], ["顾虑比决定先出场了。只扫第一句的负责人，应该先看到行动。"])],
        d: [T(["Start with the verb. Move the doubt to Risk."], ["用动词开头，把顾虑挪到“风险”。"])],
        why: T(["Hedges up front make a decision sound optional. The doubt is real; it just belongs in Risk."], ["开头的含糊会让决定听起来可有可无。顾虑是真实的，只是应该放进“风险”。"]),
        cites: [] }; },
      bit: T("Recommendation now opens with the action", "建议改成了行动开头") },
    { id: "ba.riskEmpty", kind: "try", pri: 8,
      test(F, c) { if (!F.risk.empty || !c.d.checks.some((k) => k === "mix" || k === "help")) return null; return { box: "risk" }; },
      say(F, c) { const k = c.d.checks.find((x) => x === "mix" || x === "help"); return { g: [
        T(["Your step 3 list already holds a risk: you'd check ", { b: CHK_F[k].en }, ". That's a ready-made first line for Risk."], ["你第 3 步的清单里已经有一个风险：你会先查", { b: CHK_F[k].zh }, "。这可以直接作为“风险”的第一句。"]),
        T(["Risk is optional, but you already wrote one down in step 3: ", { b: CHK_F[k].en }, "."], ["“风险”可以不写，不过你在第 3 步其实已经写下了一个：", { b: CHK_F[k].zh }, "。"])],
        cites: [{ lens: "ba", step: "missing" }] }; } },
    { id: "ba.measureEmpty", kind: "try", pri: 8,
      test(F, c) { return F.measure.empty && c.p ? { box: "measure" } : null; },
      say(F, c) { const p = c.p, tg = `${rate(base)} → ${rate(p.target / 100)}`; return { g: [
        T(["Your test plan already has the numbers for this box: ", { nw: tg }, ", about ", { b: num(p.n) }, " learners per group, roughly ", { b: p.weeks }, " weeks."], ["你的试验方案里已经有这一栏要的数字：", { nw: tg }, "，每组约 ", { b: num(p.n) }, " 人，大约 ", { b: p.weeks }, " 周。"]),
        T(["When will you know? Your plan says roughly ", { b: p.weeks }, " weeks at about ", { b: num(p.n) }, " per group. That's the line a lead will hold you to."], ["什么时候能有结果？按你的方案，每组约 ", { b: num(p.n) }, " 人，大约 ", { b: p.weeks }, " 周。负责人会拿这一句来对照。"])],
        cites: [{ lens: "ba", step: "test", label: T("BA·4 · your plan", "BA·第4步 · 你的方案") }] }; } }
  ];
  const RD = MP.lensRead ? MP.lensRead({
    lens: "ba", doc: T("recommendation", "行动建议"),
    boxes: [{ k: "rec", label: C.memoLabels.rec, thin: T("what you'd have the lead change, and at which step", "你想让负责人在哪一步改什么") }, { k: "why", label: C.memoLabels.why, thin: T("which number or step convinced you", "是哪个数字或哪一步说服了你") }, { k: "risk", label: C.memoLabels.risk, fold: "ba-memo-more" }, { k: "measure", label: C.memoLabels.measure, fold: "ba-memo-more" }],
    req: ["rec", "why"], scan: "ba-memo-boxes",
    text: (L, k) => memoVal(L, k), taId: (k) => "ba-memo-" + k, store: (L) => D(L),
    nouns: { en: LX.step.en.concat(LX.action.en, AIK.lex.actionVerb.en), zh: LX.step.zh.concat(LX.action.zh, AIK.lex.actionVerb.zh) },
    known: () => KN, sources: optLabels,
    topic: { en: ["learner", "learners", "funnel", "completion", "course", "test", "drop", "signup", "signups", "rate", "lesson", "lead", "students", "dropout", "drop-off"], zh: ["学员", "漏斗", "完成", "课程", "试验", "下降", "报名", "转化", "负责人", "学生", "流失"] },
    ctx(L) { const d = D(L), focus = d.action ? LEAK : d.tr; return { d, focus, t: focus != null ? TR[focus] : null, p: d.action ? plan(d.lift) : null, dsDone: done("ds"), aiDone: done("ai") }; },
    trace(L, c) {
      const o = [];
      if (c.d.tr != null) o.push({ label: T("your step 2 pick", "你第 2 步的选择"), src: "ba-leakfig" });
      if (c.d.checks.length) o.push({ label: T("your step 3 checks", "你第 3 步的检查") });
      if (c.d.action) o.push({ label: T("your test plan", "你的试验方案") });
      if (c.dsDone) o.push({ label: T("your DS split", "你在 DS 的拆分") });
      if (c.aiDone) o.push({ label: T("your AI error count", "你在 AI 找到的错误") });
      return o;
    },
    intro: [
      T("I read it the way a busy product lead would: first line first, then whether each number checks out against your steps.", "我按忙碌的产品负责人的方式读：先看第一句，再把每个数字和你前面几步对一遍。"),
      T("Read as the product lead would: decision first, then the numbers against your funnel and your test plan.", "按产品负责人的读法：先看决定，再拿数字对照你的漏斗和试验方案。")
    ],
    rules: RULES
  }) : null;

  /* ---------- AI-2: Ask about this step ---------- */
  const WHYP = { drop: T("its rate fell the most", "转化率降得最多"), lost: T("it lost the most people", "流失人数最多"), fix: T("it looks easiest to change", "最容易改"), goal: T("it's closest to the goal", "离最终目标最近") };
  const reasonsT = (d) => T(joinL(d.why.map((k) => WHYP[k].en), false), joinL(d.why.map((k) => WHYP[k].zh), true));
  const ratioLab = (k) => T(lowF(C.ratioQ[k].en.replace(/\?$/, "")), C.ratioQ[k].zh.replace(/？$/, ""));
  steps[0].ask = {
    seen(L) {
      const d = D(L);
      if (!d.r1 && !d.r2) return T(["you haven't matched either percentage yet. Both use the same 40 finishers; only the number under the line changes."], ["两个百分比你都还没配对。它们用的是同样 40 位完成者，变的只是除号下面的数。"]);
      if (!d.r1 || !d.r2) { const a = d.r1 ? "40 ÷ 100" : "40 ÷ 80", b = d.r1 ? "40 ÷ 80" : "40 ÷ 100", k = d.r1 || d.r2; return T(["you've matched ", { nw: a }, " to ", { b: ratioLab(k).en }, " and left ", { nw: b }, " open."], ["你已经把 ", { nw: a }, " 配给了", { b: ratioLab(k).zh }, "，", { nw: b }, " 还没选。"]); }
      return T(["you matched ", { nw: "40 ÷ 100" }, " to ", { b: ratioLab(d.r1).en }, " and ", { nw: "40 ÷ 80" }, " to ", { b: ratioLab(d.r2).en }, "."], ["你把 ", { nw: "40 ÷ 100" }, " 配给了", { b: ratioLab(d.r1).zh }, "，把 ", { nw: "40 ÷ 80" }, " 配给了", { b: ratioLab(d.r2).zh }, "。"]);
    },
    term() { return T("Here, the same 40 finishers sit over two different denominators: the 100 who signed up, or the 80 who started.", "在这一步里，同样的 40 位完成者，可以除以两个不同的分母：报名的 100 人，或开始学习的 80 人。"); },
    chips() { return [{ id: "outof", q: T("How do I tell what a percentage is out of?", "怎么看出一个百分比的基数是谁？"), a() { return { variants: [
      T(["Look under the line. 100 counts everyone who signed up; 80 counts only the people who started. Whichever group sits under the line is the group the percentage speaks about."], ["看除号下面。100 算的是所有报名的人，80 只算开始学习的人。除号下面是哪一组，这个百分比说的就是哪一组。"]),
      T(["Read it aloud with the words ‘out of’: 40 out of the 100 who signed up, or 40 out of the 80 who started. The second half of that sentence is the denominator."], ["用“在……当中”读出来：报名的 100 人当中有 40 人，或开始学习的 80 人当中有 40 人。后半句里的那组人，就是分母。"]),
      T(["A quick test: if you changed who's counted under the line, would the question change? Here it does, from everyone who signed up to only those who started."], ["一个快速检验：如果换掉除号下面统计的那组人，问题会不会跟着变？这里会：从所有报名的人，变成只有开始学习的人。"])],
      cites: [{ lens: "ba", step: "ratio", src: "ba-q-1", label: T("40 ÷ 100", "40 ÷ 100") }, { lens: "ba", step: "ratio", src: "ba-q-2", label: T("40 ÷ 80", "40 ÷ 80") }] }; } }]; }
  };
  steps[1].ask = {
    seen(L) {
      const d = D(L);
      if (d.tr == null) return T(["you haven't picked a step yet. Each row between two bars is one step-to-step change, with the earlier rate next to the recent one."], ["你还没选步骤。每两根柱子之间的一行，就是一段转化：前期和近期的转化率并排放着。"]);
      if (!d.why.length) return T(["you've picked ", { b: trE(d.tr) }, " but haven't said why yet. The reason chips sit under the numbers."], ["你选了“", trZ(d.tr), "”，还没说理由。理由选项就在数字下面。"]);
      const r = reasonsT(d);
      return T(["you picked ", { b: trE(d.tr) }, " because ", r.en, "."], ["你选了“", trZ(d.tr), "”，理由是", r.zh, "。"]);
    },
    trace(L) { const d = D(L); return [MP.t(T("Step 2 · Find the leak", "第 2 步 · 找漏点")), MP.t(T("Fig. 2 · The 28-day funnel", "图 2 · 28 天学习漏斗"))].concat(d.tr != null ? [{ label: T("your pick", "你的选择"), src: "ba-tr-" + d.tr }] : [MP.t(T("recent cohorts", "近期批次"))]); },
    term() { return T(`Here, the funnel runs from ${num(R[0])} recent signups down to ${num(R[NT])} completions, in ${NT} step-to-step changes.`, `在这一步里，漏斗从近期的 ${num(R[0])} 人报名，一路走到 ${num(R[NT])} 人完成，中间经过 ${NT} 段转化。`); },
    chips(L, ready) {
      const d = D(L), out = [];
      if (ready && d.tr != null) {
        const t = TR[d.tr];
        if (d.tr !== LEAK) out.push({ id: "why-pct", q: T("Why do practitioners weigh the % change too?", "为什么从业者也看百分比的变化？"), a() {
          const most = d.tr === MOSTLOST, fewer = LT.lostR < t.lostR, dl = MP.n(Math.abs(r10(LT.d)), 1), lp = pairS(LT), yp = `${rate(t.rE)} → ${rate(t.rR)}`;
          return { variants: [
            T([most ? "Your pick did lose the most people: " : "Your pick lost ", { b: num(t.lostR) }, " recent learners. ", { b: trE(LEAK) }, fewer ? " lost fewer (" : " lost more (", { b: num(LT.lostR) }, "), but against earlier cohorts it fell much further: ", { nw: lp }, ", a ", dl, "-point drop, versus ", { nw: yp }, " at yours. Practitioners usually weigh both: how many people, how much it changed, and how fixable it is."],
              [most ? "你选的这一步确实流失人数最多：" : "你选的这一步流失了", "近期 ", { b: num(t.lostR) }, " 人。“", trZ(LEAK), "”流失得", fewer ? "少一些" : "更多", "（", { b: num(LT.lostR) }, " 人），但和前期相比降得多得多：", { nw: lp }, "，掉了 ", dl, " 个百分点；你选的那步是 ", { nw: yp }, "。做这行的人通常会同时看三件事：涉及多少人、变化多大、好不好改。"]),
            T(["Head count tells you how big a step is; the change in rate tells you what broke. ", { b: trE(LEAK) }, " went ", { nw: lp }, " while yours went ", { nw: yp }, ". A step can lose many people simply because it always did."],
              ["人数说明一步有多大，转化率的变化说明哪里坏了。“", trZ(LEAK), "”是 ", { nw: lp }, "，你选的是 ", { nw: yp }, "。有的步骤流失人多，只是因为一直都多。"]),
            T(["Compare each step with itself, earlier versus recent. Yours moved from ", { nw: yp }, "; ", { b: trE(LEAK) }, " moved from ", { nw: lp }, ". Size matters too, so practitioners weigh people × change × how fixable it is."],
              ["拿每一步和它自己比：前期对近期。你选的从 ", { nw: yp }, "；“", trZ(LEAK), "”从 ", { nw: lp }, "。规模也重要，所以从业者会综合看：人数 × 变化 × 可改性。"])],
            cites: [{ lens: "ba", step: "funnel", src: "ba-tr-" + LEAK, label: T(`Fig. 2 · ${lp}`, `图 2 · ${lp}`) }, { lens: "ba", step: "funnel", src: "ba-tr-" + d.tr, label: T("Your pick", "你的选择") }] }; } });
        else out.push({ id: "wrong", q: T("What would make my pick wrong?", "什么情况下我的选择会出错？"), a() { return { variants: [
          T(["One way: if many of the ", { b: num(LT.lostR) }, " recent learners who stopped here came through the partner offer, part of this fall is about who signed up, not about the step. That's what step 3 asks you to check."], ["一种可能：如果停在这里的近期 ", { b: num(LT.lostR) }, " 人里，很多是合作渠道来的，那么这次下降有一部分是报名人群的问题，而不是这一步本身。第 3 步要你检查的正是这个。"]),
          T(["Your pick fell the most by rate, ", { nw: pairS(LT) }, ". It would be the wrong first fix if something outside the step explains it: a change in who signed up, or stuck learners not getting help in time."], ["你选的这一步按转化率降得最多：", { nw: pairS(LT) }, "。如果原因在这一步之外，比如报名人群变了，或卡住的学员没及时得到帮助，那它就不是该先修的地方。"]),
          T(["If it's very hard to change. Size and change point here, but fixability is the third thing practitioners weigh, and the funnel can't tell you that."], ["如果它很难改。规模和变化都指向这里，但可改性是从业者权衡的第三件事，而漏斗告诉不了你这一点。"])],
          cites: [{ lens: "ba", step: "funnel", src: "ba-tr-" + LEAK, label: T("Your pick", "你的选择") }, { lens: "ba", step: "missing" }] }; } });
        out.push({ id: "held", q: T("What if the earlier rate had held?", "如果保持前期的转化率会怎样？"), a() {
          if (t.gap <= 5) return { variants: [T([{ b: trE(d.tr) }, " kept its earlier rate (", { nw: `${rate1(t.rE)} → ${rate1(t.rR)}` }, "), so there's almost nothing to win back there. It can still be worth improving; it just isn't where the drop came from."], ["“", trZ(d.tr), "”基本保持了前期的转化率（", { nw: `${rate1(t.rE)} → ${rate1(t.rR)}` }, "），在这里几乎挽回不了什么。它仍然值得改进，只是下降不是从这里来的。"])], cites: [{ lens: "ba", step: "funnel", src: "ba-held" }] };
          return { variants: [
            T(["If ", { b: trE(d.tr) }, " had kept its earlier ", { b: rate1(t.rE) }, ", about ", { b: num(t.gap) }, " more recent learners would have reached the next step, and roughly ", { b: num(t.comp) }, " more would have finished."], ["如果“", trZ(d.tr), "”保持前期的 ", { b: rate1(t.rE) }, "，近期大约会多 ", { b: num(t.gap) }, " 人走到下一步，最终约多 ", { b: num(t.comp) }, " 人完成课程。"]),
            T(["About ", { b: num(t.gap) }, " more would have moved on from this step, and about ", { b: num(t.comp) }, " of them would have completed. That second number is the one a product lead tracks."], ["这一步大约会多 ", { b: num(t.gap) }, " 人继续往下走，其中约 ", { b: num(t.comp) }, " 人会完成课程。后一个数字，才是产品负责人盯的。"])],
            cites: [{ lens: "ba", step: "funnel", src: "ba-held", label: T("If it had held", "如果没降") }] }; } });
      }
      out.push({ id: "people-pct", q: T("Should I look at people or percentages?", "该看人数还是看百分比？"), a() { return { variants: [
        T(["Both tell you something different. Head count says how many learners a fix could reach; the percentage says how much a step changed between earlier and recent cohorts. Which one would a lead with one quarter care about more?"], ["两者说明的事不同。人数告诉你一个改动能影响多少学员；百分比告诉你这一步在前后批次之间变了多少。如果负责人只有一个季度，你觉得哪个更要紧？"]),
        T(["People lost is big near the top of any funnel, even in a healthy one. The rate, compared with the same step earlier, shows what changed. Look at both columns before you choose."], ["任何漏斗的上段流失人数都大，健康的漏斗也一样。拿同一步的前后转化率比较，才看得出什么变了。选之前，两栏都看一眼。"]),
        T(["Think of it as size and change. The pill in each row is size; the Change column is change. A good first fix usually has enough of both."], ["可以理解成规模和变化：每行中间的小标签是规模，“变化”一栏是变化。值得先修的地方，通常两样都不小。"])],
        cites: [{ lens: "ba", step: "funnel", src: "ba-chg", label: T("Change column", "“变化”一栏") }] }; } });
      return out;
    }
  };
  steps[2].ask = {
    seen(L) {
      const d = D(L), n = d.checks.length;
      if (!n) return T(["you haven't ticked any checks yet. The funnel told you where learners leave; these are ways to find out why."], ["你还没勾选任何检查。漏斗告诉你学员在哪里离开，这些检查是用来弄清为什么的。"]);
      return T(["you've ticked ", n === 1 ? "one check: " : n + " checks: ", joinL(d.checks.map((k) => CHK_F[k].en), false), "."], ["你勾选了 ", n, " 项检查：", joinL(d.checks.map((k) => CHK_F[k].zh), true), "。"]);
    },
    chips(L, ready) {
      const d = D(L), out = [];
      if (ready) {
        const mix = d.checks.includes("mix"), help = d.checks.includes("help");
        out.push({ id: "lead", q: T("Where do my checks lead?", "我的检查会通向哪里？"), a() {
          const cites = [mix && { lens: "ds", step: "split" }, help && { lens: "ai", step: "errors" }].filter(Boolean);
          const v = mix && help
            ? [T(["Both of the big ones lead somewhere: who signed up is the Data Science lens's whole job, and whether stuck learners got help is what the AI lens follows. Same LumenLearn data, two more ways in."], ["两个关键的检查都有去处：谁来报名，正是数据科学视角要回答的；卡住的学员有没有得到帮助，是人工智能视角追的。同一份 LumenLearn 数据，又多了两个切入点。"]),
               T(["You've touched both other lenses. The DS lens measures how much of the drop is the change in who signed up; the AI lens reads the help messages stuck learners sent."], ["你碰到了另外两个视角：DS 视角会算出降幅里有多少来自报名人群的变化，AI 视角会去读卡住的学员发出的求助消息。"])]
            : mix ? [T(["Your check on who signed up leads straight into the Data Science lens: it measures how much of the drop is the change in mix. The help-request question would lead to the AI lens."], ["你对报名人群的检查，直接通向数据科学视角：它会算出降幅里有多少来自构成变化。至于求助的问题，会通向人工智能视角。"])]
            : help ? [T(["Your check on help for stuck learners leads into the AI lens, which reads the router's mistakes. Who signed up would lead to the Data Science lens."], ["你对卡住学员求助的检查，通向人工智能视角：它会去读分流器的错误。至于谁来报名，会通向数据科学视角。"])]
            : [T(["Your checks stay inside this lens for now. Who signed up is the Data Science lens's question, and whether stuck learners got help is the AI lens's."], ["你的检查目前都还在这个视角里。谁来报名是数据科学视角的问题，卡住的学员有没有得到帮助是人工智能视角的问题。"])];
          return { variants: v, cites: cites.length ? cites : [{ lens: "ba", step: "missing", src: "ba-links", label: T("Where your checks lead", "你的检查会通向哪里") }] }; } });
        const left = Object.keys(C.checks).filter((k) => !d.checks.includes(k));
        if (left.length) out.push({ id: "left", q: T("What did I leave out?", "我漏掉了什么？"), a() { const k = left[0]; return { variants: [
          T(["Not on your list: ", joinL(left.map((x) => CHK_F[x].en), false), ". The first one matters because ", lowF(C.checks[k].s.en)], ["你没有选的是：", joinL(left.map((x) => CHK_F[x].zh), true), "。第一项之所以要紧，是因为", C.checks[k].s.zh]),
          T(["You skipped ", joinL(left.map((x) => CHK_F[x].en), false), ". None is required; a practitioner would just order them by cost: ", lowF(C.checks[k].s.en)], ["你跳过了：", joinL(left.map((x) => CHK_F[x].zh), true), "。都不是必选；从业者只会按成本排个先后。", C.checks[k].s.zh])] }; } });
      }
      out.push({ id: "first", q: T("What makes a check worth running first?", "什么样的检查值得先做？"), a() { return { variants: [
        T(["Two things: how cheap it is, and whether the answer could make your fix pointless. A check that takes an afternoon and could change the plan goes first."], ["看两点：成本高不高，以及结果会不会让你的改动白费。花一个下午、又可能改变计划的检查，排在最前面。"]),
        T(["Ask what else changed at the same time as the drop. If one of those explains it, the fix you're planning won't help, so it's worth ruling out before spending money."], ["问问：下降发生时，还有什么也变了？如果其中一项能解释下降，你打算做的改动就帮不上忙，所以值得在花钱之前先排除。"]),
        T(["Cheap and decisive first, expensive and vague last. A calendar or release log is often an afternoon; a survey can take weeks."], ["便宜又能下结论的先做，又贵又说不清的放最后。查日历或上线记录常常一个下午就够，做调查可能要几周。"])] }; } });
      return out;
    }
  };
  steps[3].ask = {
    seen(L) {
      const d = D(L), p = plan(d.lift);
      const a = d.action ? C.actions[d.action].short : null, g = d.guard ? gl(d.guard) : null;
      const tgt = ["your target is ", { b: rate(d.lift / 100) }, " (about ", { b: num(p.n) }, " learners per group)"], tgz = ["目标是 ", { b: rate(d.lift / 100) }, "（每组约 ", { b: num(p.n) }, " 人）"];
      if (!a && !g) return T(["you haven't picked a change or a guardrail yet; ", tgt, "."], ["你还没选改动和护栏；", tgz, "。"]);
      if (a && !g) return T(["you'd test ", a.en, ", with no guardrail yet; ", tgt, "."], ["你会试行", a.zh, "，还没选护栏；", tgz, "。"]);
      if (!a && g) return T(["you've chosen ", { b: g.en }, " as the guardrail but no change yet; ", tgt, "."], ["你选了", { b: g.zh }, "作为护栏，还没选改动；", tgz, "。"]);
      return T(["you'd test ", a.en, ", watch ", { b: g.en }, ", and ", tgt, "."], ["你会试行", a.zh, "，盯住", { b: g.zh }, "，", tgz, "。"]);
    },
    chips(L, ready) {
      const d = D(L), out = [];
      if (ready) {
        out.push({ id: "lift", q: T("Why does a smaller lift need so many more learners?", "为什么希望的提升越小，需要的人越多？"), a() {
          const p = plan(d.lift), hl = Math.round((BASE_PCT + (d.lift - BASE_PCT) / 2) * 100) / 100, ph = plan(hl);
          return { variants: [
            T(["At your target, ", { b: rate(d.lift / 100) }, " (", pts(p.lift), " points), you need about ", { b: num(p.n) }, " learners per group. Halve the lift to ", { b: rate(hl / 100) }, " and it's about ", { b: num(ph.n) }, ": the rule of thumb divides by the lift squared, so small lifts get expensive fast."], ["按你的目标 ", { b: rate(d.lift / 100) }, "（提高 ", pts(p.lift).replace("+", ""), " 个百分点），每组约需 ", { b: num(p.n) }, " 人。把提升减半到 ", { b: rate(hl / 100) }, "，就要约 ", { b: num(ph.n) }, " 人：经验公式要除以提升幅度的平方，所以小提升很快就变得很贵。"]),
            T(["A small lift is easy to mistake for chance, so you need more learners before you can trust it. Your ", { b: pts(p.lift) }, " points needs about ", { b: num(p.n) }, " per group; half of it needs about ", { b: num(ph.n) }, "."], ["小提升很容易和偶然混在一起，所以要更多学员才能信得过。你设的 ", { b: pts(p.lift).replace("+", "") }, " 个百分点每组约需 ", { b: num(p.n) }, " 人；减半则约需 ", { b: num(ph.n) }, " 人。"])],
            cites: [{ lens: "ba", step: "test", src: "ba-lift", label: T("Fig. 4 · your target", "图 4 · 你的目标") }] }; } });
        if (d.guard && d.action) out.push({ id: "match", q: T("Does my guardrail match my change?", "我的护栏和改动对得上吗？"), a() {
          const g = gl(d.guard), k = d.action + ":" + d.guard;
          const M = {
            "email:quality": T(["Quality catches rushed work. An email mostly risks annoying people, and that shows up in unsubscribes first. Neither is wrong; it depends which failure worries you more."], ["作业质量能发现草草交差的情况。一封邮件最大的风险是惹人烦，这会先体现在退订率上。两个都不算错，看你更担心哪种失败。"]),
            "email:unsub": T(["Unsubscribes are the first place an email backfires, so this guardrail sits right next to your change."], ["邮件出问题，最先体现在退订率上，所以这个护栏和你的改动贴得很近。"]),
            "email:tickets": T(["Help requests per learner would show if the email sends more people to support. Reasonable; unsubscribes would catch annoyance sooner."], ["人均求助次数能看出邮件是不是让更多人去找客服。说得通；如果担心惹人烦，退订率会更早发现。"]),
            "email:later": T(["Watching later steps checks that more starts turn into more completions. That fits any change to this step."], ["盯住后续步骤，是在确认更多人开始作业后，也真的有更多人完成。改这一步，这个护栏都适用。"])
          };
          const v = M[k] || (d.action === "deadline"
            ? T(["An extra week can push finishing past day 28. ", d.guard === "later" ? "Watching later steps is exactly the right instinct." : ["Your guardrail, ", g.en, ", is a start; keep an eye on later steps too."]], ["多出的一周可能把完成时间推到第 28 天之后。", d.guard === "later" ? "盯住后续步骤，正是对的直觉。" : ["你选的护栏“", C.guards[d.guard].zh, "”是个开始，后续步骤也要留意。"]])
            : T(["A redesign touches everything in week 1, so one guardrail won't cover it all. ", { b: g.en }, " is a start; teams usually test a small piece first."], ["重做会影响第一周的所有内容，一个护栏盖不住全部。", { b: g.zh }, "是个开始；团队通常会先拿一小部分做试验。"]));
          return { variants: [v], cites: [{ lens: "ba", step: "test", src: "ba-guards", label: T("Your guardrail", "你的护栏") }] }; } });
      }
      out.push({ id: "guard", q: T("What makes a good guardrail?", "什么样的护栏指标才好？"), a() { return { variants: [
        T(["A guardrail is something your change could quietly make worse. Ask what the change touches: an email touches inboxes, a deadline touches when work gets finished, a redesign touches the whole first week."], ["护栏指标，是你的改动可能悄悄弄坏的东西。问问改动碰到了什么：邮件碰到收件箱，截止时间碰到完成的时间，重做则碰到整个第一周。"]),
        T(["Pick the number that would tell you the win was fake: more starts but rushed work, or more starts but more people tuning out."], ["选那个能告诉你“成功是假象”的数字：开始作业的人多了，但作业变草率了；或者开始的人多了，但更多人不再理会邮件。"]),
        T(["Good guardrails sit close to the change and move quickly. If it would take months to notice harm, it's a weak guardrail for a short test."], ["好的护栏离改动近、反应快。如果要几个月才能发现伤害，它就不适合短期试验。"])],
        cites: [{ lens: "ba", step: "test", src: "ba-guards", label: T("Guardrail choices", "护栏选项") }] }; } });
      return out;
    }
  };
  steps[4].ask = {
    seen(L) {
      const d = D(L), a = memoVal(L, "rec").trim(), b = memoVal(L, "why").trim(), zh = X && X.lang(a + b) === "zh";
      const cnt = (s) => (zh ? X.chars(s) : X.words(s)), u = zh ? T("characters", "字") : T("words", "词");
      if (!a && !b) return T(["both boxes are still empty. The starters can draft them from your earlier picks, and you make them yours."], ["两个框都还空着。可以先用句子开头根据你之前的选择起草，再改成自己的话。"]);
      const rd = d.read;
      return T(["your Recommendation has ", { b: cnt(a) }, " ", u.en, " and Why has ", { b: cnt(b) }, ". ", rd ? "You've had a second read; the notes sit beside each box." : "A second read is there when you want one."], ["“建议”有 ", { b: cnt(a) }, " ", u.zh, "，“理由”有 ", { b: cnt(b) }, " ", u.zh, "。", rd ? "你已经请人读过一遍，批注就在每一栏旁边。" : "想要的话，可以请它帮你读一遍。"]);
    },
    chips(L) {
      const d = D(L), f = d.action ? LEAK : d.tr;
      return [
        { id: "number", q: T("Which number should lead my Why?", "“理由”该用哪个数字？"), a() {
          if (f == null) return { variants: [T(["You skipped the funnel step, so there's no pick to take a number from yet. Step 2 shows every step's rate, earlier and recent."], ["你跳过了漏斗那一步，所以还没有可以取数字的选择。第 2 步里有每一步前后两期的转化率。"])], cites: [{ lens: "ba", step: "funnel" }] };
          return { variants: [
            T(["The one behind your pick: ", { nw: pairS(TR[f]) }, " for ", { b: trE(f) }, ". It's the number a lead can check on their own dashboard."], ["就用你那一步背后的数字：“", trZ(f), "”的 ", { nw: pairS(TR[f]) }, "。负责人在自己的看板上就能核对。"]),
            T(["One figure, the one that made you decide. For you that's ", { nw: pairS(TR[f]) }, ". Everything else can stay in the appendix."], ["只用一个数字：让你下定决心的那个。对你来说就是 ", { nw: pairS(TR[f]) }, "。其余的都可以放进附录。"])],
            cites: [{ lens: "ba", step: "memo", src: "ba-leakfig", label: T("The number", "关键数字") }] }; } },
        { id: "first", q: T("What does a busy lead read first?", "忙碌的负责人先读什么？"), a() { return { variants: [
          T(["The first line, and often only that. Put the decision there: which step, what you'd test, and on whom. The reasons can come second."], ["第一句，而且常常只读这一句。把决定放在那里：哪一步、试什么、对谁试。理由放第二句。"]),
          T(["They read for the ask. If your first sentence says what you want them to approve, the rest of the memo is support they can skip or check."], ["他们读的是“要我批准什么”。第一句就写清这一点，后面的内容就是他们可以跳过、也可以核对的依据。"]),
          T(["Decision, then one number, then the risk. That order lets a lead stop reading at any point and still know what you want."], ["决定、一个数字、风险，按这个顺序。负责人读到哪里停下，都知道你想要什么。"])] }; } }
      ];
    }
  };

  /* ================= actions ================= */
  const ls = () => MP.ls("ba");
  MP.on("ba-ratio", (el, arg) => { const [q, v] = arg.split(":"); D(ls())["r" + q] = v; MP.commit(); });
  MP.on("ba-tr", (el, arg) => {
    const d = D(ls()), i = +arg;
    if (d.tr !== i) { d.tr = i; justTr = true; }
    MP.commit();
  });
  MP.on("ba-why", (el, k) => {
    const d = D(ls()), at = d.why.indexOf(k);
    if (at >= 0) d.why.splice(at, 1); else { d.why.push(k); if (d.why.length > 2) d.why.shift(); }
    MP.commit();
  });
  MP.on("ba-check", (el, k) => { const d = D(ls()), at = d.checks.indexOf(k); if (at >= 0) d.checks.splice(at, 1); else d.checks.push(k); MP.commit(); });
  MP.on("ba-action", (el, k) => { D(ls()).action = k; MP.commit(); });
  MP.on("ba-guard", (el, k) => { D(ls()).guard = k; MP.commit(); });
  MP.onInput("ba-lift", (el) => {
    const v = clampLift(parseFloat(el.value));
    D(ls()).lift = v; MP.save();
    updatePlanner(document.getElementById("app"), v);
  });
  let caret = null;
  MP.onInput("ba-memo", (el) => {
    const L = ls(), d = D(L), step = steps[4];
    const before = step.ready(L);
    d.memo[el.dataset.arg] = el.value;
    if (d.sampleLang && MP.lang() !== d.sampleLang) d.sampleLang = null; // edited in the other language: it's theirs now
    MP.save();
    if (before !== step.ready(L)) { caret = { fk: el.dataset.fk, s: el.selectionStart, e: el.selectionEnd }; MP.commit(); }
  });
  MP.on("ba-starters", () => {
    const L = ls(), d = D(L), st = starters(L);
    if (!d.starter || typeof d.starter !== "object") d.starter = {};
    let n = 0, blank = false;
    C.memoKeys.forEach((k) => { if (!memoVal(L, k).trim()) { d.memo[k] = st[k]; d.starter[k] = st[k]; n++; if (hasBlank(st[k])) blank = true; } });
    if (n) MP.state.ui.folds["ba-memo-more"] = true;
    MP.commit();
    const none = d.tr == null && !d.action;
    MP.toast(MP.t(!n ? T("Every box already has text — nothing was replaced.", "每个框都已有内容，没有替换任何文字。")
      : none ? T("You skipped the earlier steps, so these are blanks to fill in.", "前面的步骤跳过了，这里先给你留好填空。")
        : blank ? T("Filled from your earlier choices. Each ___ marks something you skipped.", "已根据你之前的选择填好。___ 处是你跳过的部分，请补上。")
          : T("Filled the empty boxes from your earlier choices. Make them yours.", "已根据你之前的选择填好空白的框，再改成你自己的话吧。")));
  });

  /* ================= summary / sample / download ================= */
  function summary(L) {
    const d = D(L), ti = d.tr != null ? d.tr : null;
    const actS = d.action ? C.actions[d.action].short : null, g = d.guard ? C.guards[d.guard] : null;
    const tn = ti != null ? trName(ti) : null;
    const gs = g ? { en: g.en.replace(/\s*\(.*\)$/, "").toLowerCase(), zh: g.zh.replace(/（.*）$/, "") } : null;
    const did = ti != null && actS && ti !== LEAK
      ? T(`You traced LumenLearn's funnel, first picked “${tn}”, then designed a small test of ${actS.en} on “${S[LEAK].en} → ${S[LEAK + 1].en}”${gs ? `, watching ${gs.en} as the guardrail` : ""}.`, `你梳理了 LumenLearn 的漏斗，先选了“${tn}”，又针对“${S[LEAK].zh} → ${S[LEAK + 1].zh}”设计了一个小范围试验：${actS.zh}${gs ? `，护栏指标是“${gs.zh}”` : ""}。`)
      : ti != null && actS
      ? T(`You traced LumenLearn's funnel, chose “${tn}” as the step to fix first, and designed a small test of ${actS.en}${gs ? `, watching ${gs.en} as the guardrail` : ""}.`, `你梳理了 LumenLearn 的漏斗，选择先修“${tn}”，并设计了一个小范围试验：${actS.zh}${gs ? `，护栏指标是“${gs.zh}”` : ""}。`)
      : ti != null ? T(`You traced LumenLearn's funnel and chose “${tn}” as the step to fix first.`, `你梳理了 LumenLearn 的漏斗，选择先修“${tn}”。`)
        : T("You worked through LumenLearn's funnel and wrote a recommendation.", "你分析了 LumenLearn 的漏斗，并写了一份行动建议。");
    const move = ti != null
      ? T(`Found the leak (${S[ti].en} → ${S[ti + 1].en}) and designed a test to fix it`, `找到漏点（${S[ti].zh} → ${S[ti + 1].zh}），并设计了验证它的试验`)
      : T("Turned a falling number into one testable action", "把一个下降的指标变成一个可验证的行动");
    const facts = [];
    if (ti != null) {
      const t = TR[ti];
      facts.push({ kind: "did", text: MP.t(T(`Chose to fix “${tn}” first: ${rate(t.rE)} → ${rate(t.rR)}, ${num(t.lostR)} recent learners didn't continue.`, `选择先修“${tn}”：${rate(t.rE)} → ${rate(t.rR)}，近期有 ${num(t.lostR)} 人没有继续。`)) });
    }
    if (d.action && d.guard) {
      const p = plan(d.lift);
      facts.push({ kind: "did", text: MP.t(T(`Designed a test of ${actS.en}, guarded by ${gs.en}, aiming for ${rate(d.lift / 100)} (≈ ${num(p.n)} learners per group).`, `设计了试验：${actS.zh}，护栏为“${gs.zh}”，目标 ${rate(d.lift / 100)}（每组约 ${num(p.n)} 人）。`)) });
    }
    if (d.checks.length) facts.push({ kind: "did", text: MP.t(T(`Before acting, would check: ${d.checks.map((k) => CHK_F[k].en).join("; ")}.`, `动手前会先查：${d.checks.map((k) => CHK_F[k].zh).join("；")}。`)) });
    const rf = RD && RD.fact(L);
    if (rf && facts.length < 3) facts.push(rf);
    facts.push({ kind: "limit", text: MP.t(T("Worked on a fictional funnel; a real decision would also weigh cost, timing and who has to sign off.", "基于虚构的漏斗数据；真实决策还要考虑成本、时间和审批。")) });
    const rtr = RD && RD.trace(L);
    return {
      did, move,
      artifact: Object.assign({ title: T("One-page recommendation", "一页行动建议"), html: memoDoc(L) + testCard(L) }, rtr ? { trace: rtr } : {}),
      facts: facts.slice(0, 4)
    };
  }
  const CHK_F = {
    mix: T("whether the mix of signups changed", "报名人群的构成是否变了"),
    help: T("whether stuck learners got help in time", "卡住的学员是否及时得到帮助"),
    course: T("which courses recent learners took", "近期学员选了哪些课"),
    season: T("the time of year", "时间和季节"),
    release: T("recent product or content changes", "近期的产品或内容改动")
  };
  function testCard(L) {
    const d = D(L); if (!d.action) return "";
    const p = plan(d.lift);
    const cell = (k, v, cls) => `<div class="${cls || ""}"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="ba-testcard"><div class="ba-tc-h"><span class="ld-label">${MP.t(T("Test plan", "试验计划"))}</span><span class="ba-tc-sub">${MP.t(T("Half of new learners get the change; the other half are the comparison.", "一半新学员用新方案，另一半作为对照。"))}</span></div><div class="ba-tc-row">
      ${cell(MP.t(T("Change", "改动")), MP.t(C.actions[d.action].t))}
      ${d.guard ? cell(MP.t(T("Guardrail", "护栏指标")), MP.t(C.guards[d.guard])) : ""}
      ${cell(MP.t(T("Target", "目标")), `<span class="num nowrap">${rate(base)}<i class="ba-tc-ar">→</i><em>${rate(d.lift / 100)}</em></span>`, "ba-tc-n")}
      ${cell(MP.t(T("Per group", "每组")), `<span class="num nowrap">≈ ${num(p.n)}</span><small>${MP.t(T(`≈ ${p.weeks} weeks to fill`, `约 ${p.weeks} 周凑齐`))}</small>`, "ba-tc-n")}</div></div>`;
  }

  function sample(L) {
    const lang = MP.lang(), now = Date.now(), day = 864e5;
    const d = L.data;
    Object.assign(d, { r1: "all", r2: "started", tr: LEAK, why: ["drop", "fix"], checks: ["mix", "help", "release"], action: "email", guard: "quality", lift: LIFT_DEF, memo: sampleMemo(lang), sampleLang: lang });
    const st = (id, energy, hard, hints) => { L.steps[id] = { done: true, skipped: false, energy, hard: !!hard, hints: hints || 0 }; };
    st("ratio", "neutral"); st("funnel", "enjoyed"); st("missing", "neutral", false, 1); st("test", "enjoyed", true, 2); st("memo", "enjoyed"); st("reflect", "");
    L.visited = ["ratio", "funnel", "missing", "test", "memo", "reflect"];
    L.cur = "reflect";
    L.refl = { pick: "test", note: lang === "zh" ? "拖动滑块的时候才真正明白：想证明一个小改进，需要的人比我想的多得多。" : "Dragging the slider made it click — proving a small lift takes far more learners than I expected." };
    L.startedAt = now - 3 * day - 52 * 60e3;
    L.completedAt = now - 3 * day;
  }

  MP.lenses.ba = {
    id: "ba",
    steps,
    download: {
      file: "lumenlearn-funnel.csv",
      href() {
        const zh = MP.lang() === "zh";
        const head = zh ? ["步骤", "前期人数（第1–6批）", "近期人数（第7–12批）", "前期到下一步转化率", "近期到下一步转化率", "近期流失人数"] : ["step", "earlier_learners_cohorts_1_6", "recent_learners_cohorts_7_12", "earlier_rate_to_next", "recent_rate_to_next", "recent_lost_to_next"];
        const rows = S.map((s, i) => [zh ? s.zh : s.en, E[i], R[i], i < NT ? (TR[i].rE * 100).toFixed(1) + "%" : "", i < NT ? (TR[i].rR * 100).toFixed(1) + "%" : "", i < NT ? TR[i].lostR : ""]);
        const csv = "﻿" + [head].concat(rows).map((r) => r.map((c) => /[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n");
        return "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      }
    },
    mount(root, L) {
      D(L);
      if (L.cur === "funnel") drawFunnel(root);
      if (L.cur === "test") updatePlanner(root, D(L).lift);
      if (L.cur === "memo" && RD) RD.mount(root, L);
      justTr = false;
      if (caret) {
        const c = caret; caret = null;
        const el = root.querySelector(`[data-fk="${CSS.escape(c.fk)}"]`);
        if (el) setTimeout(() => { try { el.focus({ preventScroll: true }); el.setSelectionRange(c.s, c.e); } catch (e) { /* ignore */ } }, 0);
      }
    },
    summary,
    sample
  };

  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const L = MP.ls("ba"); if (MP.route().name === "lens" && MP.route().a === "ba" && L.cur === "funnel") drawFunnel(document.getElementById("app")); }, 80); });
})();
