/* MajorPilot redesign — Program view (#/school): the advising office's cohort digest (AI-LAYER.md AI-8). Owner: school.
   B2B surface. 42 FICTIONAL students (teaching data), generated once from mulberry32(4242), stable across loads.
   No model is connected: every "AI" line on this page is composed by deterministic code from that cohort (or, for
   "You (this device)", from this student's own marks only), validated with MP.ai.check, and then presented with the
   shared kit (MP.ai.block: reading trace → streamed tokens → evidence chips → regenerate).
   Rules kept here: whole counts with their denominator, no per-student scores or rankings, no tables of students,
   nothing summarised for groups under 5, and no private items (hint use, reflections, notes, follow-ups, Quick Start
   text) from THIS device ever read. */
(function () {
  "use strict";
  const MP = window.MP;
  const AI = () => MP.ai;
  const esc = MP.h.esc;
  const T = (en, zh) => ({ en, zh });
  const t = (en, zh) => MP.t({ en, zh });
  const zh = () => MP.lang() === "zh";
  const MIN = 5;                                   // groups smaller than this are never summarised

  /* ====================================================================================================
     1. The cohort (deterministic)
     ==================================================================================================== */
  const LENSES = ["ba", "ds", "ai"];
  const SID = { ba: ["ratio", "funnel", "missing", "test", "memo"], ds: ["claim", "trend", "split", "conclude", "summary"], ai: ["numbers", "errors", "change", "tradeoff", "note"] };
  const P_TRY = { ba: 0.78, ds: 0.71, ai: 0.52 };
  const P_HARD = { ba: [0.10, 0.22, 0.12, 0.41, 0.25], ds: [0.14, 0.20, 0.46, 0.30, 0.28], ai: [0.24, 0.12, 0.35, 0.38, 0.27] };
  const P_ENJ = { ba: [0.30, 0.58, 0.35, 0.52, 0.40], ds: [0.33, 0.55, 0.44, 0.41, 0.30], ai: [0.28, 0.61, 0.57, 0.36, 0.38] };
  const STAGE_W = [["undergrad", 0.5], ["recent", 0.2], ["working", 0.15], ["exploring", 0.15]];
  const BG_W = [["business", 0.36], ["technical", 0.26], ["social", 0.26], ["other", 0.12]];
  // per-step choices the cohort made (int = the reading practitioners land on; the rest are the common detours)
  const CH = {
    "ba.ratio": { int: "ok", p: [["ok", 0.8], ["swap", 0.2]] },
    "ba.funnel": { int: "leak", p: [["leak", 0.58], ["lost", 0.27], ["other", 0.15]] },
    "ba.test": { int: "small", p: [["small", 0.52], ["big", 0.48]] },
    "ba.memo": { p: [["starters", 0.55], ["own", 0.45]] },
    "ds.claim": { int: "mix", p: [["mix", 0.5], ["noise", 0.2], ["def", 0.12], ["none", 0.18]] },
    "ds.trend": { int: "noise", p: [["noise", 0.6], ["chase", 0.28], ["unsure", 0.12]] },
    "ds.split": { int: "half", p: [["half", 0.55], ["all", 0.30], ["none", 0.15]] },
    "ds.conclude": { int: "b", p: [["b", 0.61], ["a", 0.29], ["c", 0.10]] },
    "ds.summary": { p: [["starters", 0.5], ["own", 0.5]] },
    "ai.numbers": { int: "ok", p: [["ok", 0.7], ["swap", 0.3]] },
    "ai.errors": { int: "content", p: [["content", 0.72], ["billing", 0.17], ["random", 0.11]] },
    "ai.change": { p: [["examples", 0.45], ["threshold", 0.35], ["definition", 0.20]] },
    "ai.tradeoff": { int: "depends", p: [["depends", 0.57], ["yes", 0.31], ["no", 0.12]] },
    "ai.note": { p: [["starters", 0.5], ["own", 0.5]] }
  };
  // 36 reflection snippets, written as students write (anonymised). Tagged by theme and by the step they talk about.
  const BANK = [
    ["sampleSize", "ba", "test", "I didn't think 5 points would need thousands of people.", "没想到 5 个百分点要几千人。"],
    ["sampleSize", "ba", "test", "The slider made it obvious why you test before rolling out.", "拖一下滑块就明白了，为什么要先试再推广。"],
    ["sampleSize", "ba", "test", "Watching the group size jump when I lowered the lift was the moment it made sense.", "把预期提升调小，每组人数一下子翻上去，那一刻我才懂。"],
    ["sampleSize", "ba", "test", "A small test sounded easy until I saw how long it would take to learn anything.", "小范围试验听起来简单，直到我看到要多久才能得出结论。"],
    ["sampleSize", "ba", "test", "I'd never thought about how many learners you need before you can trust a result.", "以前从没想过，要多少学员结果才靠得住。"],
    ["writingForDecider", "ba", "memo", "Writing for a busy product lead made me cut half my sentences.", "写给忙碌的产品负责人看，我删掉了一半的句子。"],
    ["writingForDecider", "ai", "note", "I liked that the note had to say what it cost, not just what got better.", "我喜欢这份说明必须写代价，而不只是写改善了什么。"],
    ["writingForDecider", "ds", "summary", "Saying what the data can't show was harder than saying what it shows.", "写清数据说明不了什么，比写它说明了什么更难。"],
    ["writingForDecider", "ba", "memo", "Putting the decision in the first line felt strange, then obvious.", "把决定放在第一句，一开始觉得别扭，后来觉得理所当然。"],
    ["writingForDecider", "ai", "note", "Writing it for the support lead made me think about their week, not my model.", "写给支持团队负责人看，让我开始考虑他们的工作量，而不只是我的模型。"],
    ["mixSurprise", "ds", "split", "I was sure the course had got worse. Half of it was just who signed up.", "我本来以为是课程变差了，结果一半只是报名的人变了。"],
    ["mixSurprise", "ds", "split", "The what-if slider changed how I read every average.", "那个假设情景的滑块，改变了我看所有平均数的方式。"],
    ["mixSurprise", "ds", "claim", "I'd have reported 27 to 20.5 as a disaster without checking who was in it.", "如果不先看里面是哪些人，我大概会把 27 降到 20.5 当成灾难来汇报。"],
    ["mixSurprise", "ds", "split", "Splitting by channel felt like a magic trick, but an honest one.", "按渠道拆分像变魔术，但是很诚实的那种。"],
    ["mixSurprise", "ds", "conclude", "It's strange to write that we can't say why yet and feel good about it.", "写下现在还说不清原因，居然会觉得踏实，挺奇怪的。"],
    ["readingMessages", "ai", "errors", "Reading the actual messages told me more than the 82% ever did.", "读真实的消息，比看 82% 这个数字有用多了。"],
    ["readingMessages", "ai", "errors", "An error in the formula isn't a tech problem. Once I saw that I couldn't unsee it.", "公式报错根本不是技术问题，看出来之后就再也忘不掉。"],
    ["readingMessages", "ai", "errors", "I liked hunting for the pattern in the wrong ones.", "我喜欢在分错的消息里找规律。"],
    ["readingMessages", "ai", "errors", "The model wasn't dumb, the words were just ambiguous.", "模型并不笨，只是这些词本身有歧义。"],
    ["readingMessages", "ai", "errors", "Eight messages was enough to see a pattern, which surprised me.", "八条消息就足够看出规律，这让我挺意外。"],
    ["tradeoffs", "ai", "change", "Every fix made something else worse. That's the job, apparently.", "每次修好一处，别处就变差一点。原来这就是这份工作。"],
    ["tradeoffs", "ai", "tradeoff", "Plan B looked better until I counted who handles the other messages.", "B 方案看起来更好，直到我算了剩下的消息由谁处理。"],
    ["tradeoffs", "ai", "change", "Raising the threshold felt safe until I saw the queue for people.", "提高阈值感觉很稳妥，直到我看到人工队列排了多长。"],
    ["tradeoffs", "ai", "tradeoff", "I enjoyed that there wasn't one answer, just costs you choose.", "我喜欢这里没有唯一答案，只有你自己选的代价。"],
    ["numbersAnxiety", "ba", "ratio", "I mixed up the two percentages at first and felt a bit silly.", "一开始我把两个百分比搞混了，觉得自己有点笨。"],
    ["numbersAnxiety", "ds", "trend", "The wobble band confused me. I'm still not sure I'd know noise if I saw it.", "那条波动带把我绕晕了，我现在也不确定自己能认出随机波动。"],
    ["numbersAnxiety", "ai", "numbers", "Two denominators in one table is a lot when you're nervous about numbers.", "一张表里有两个分母，对怕数字的人来说有点多。"],
    ["numbersAnxiety", "ba", "funnel", "Percent of what? I kept asking myself that, which I guess is the point.", "这是谁的百分比？我一直在问自己，大概这正是重点。"],
    ["numbersAnxiety", "ds", "claim", "I'm slow with numbers, but the hints made each step feel doable.", "我算数字比较慢，但提示让每一步都变得做得下来。"],
    ["wantsCoding", "ai", "change", "I wanted to see the code behind the router, not just the results.", "我想看看分流器背后的代码，而不只是结果。"],
    ["wantsCoding", "ds", "trend", "I'd want to build the wobble band myself next time.", "下次我想自己把这条波动带算出来。"],
    ["wantsCoding", "ai", "errors", "I kept wondering how you'd retrain it on the new examples.", "我一直在想，要怎么用新示例重新训练它。"],
    ["unsureField", "ba", "memo", "I liked parts of all three, which doesn't make choosing easier.", "三个视角我都有喜欢的部分，这反而让选择更难了。"],
    ["unsureField", "ds", "summary", "I thought I was a BA person. Now I'm not so sure.", "我原以为自己是做 BA 的，现在没那么确定了。"],
    ["unsureField", "ai", "note", "Same problem, three different jobs. I need to think about which one I'd want on a Monday.", "同一个问题，三种不同的工作。我得想想周一早上我更愿意做哪一种。"],
    ["unsureField", "ba", "funnel", "Honestly I'm still deciding, but now I know what I'm deciding between.", "说实话我还在选，但至少现在知道自己在哪几个之间选。"]
  ].map(([tag, lens, step, en, zh], i) => ({ i, tag, lens, step, en, zh }));
  const BANK_SRC = BANK.reduce((a, b) => a.concat([b.en, b.zh]), []);

  function wpick(r, pairs) { let x = r() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; }
  let COHORT = null;
  function cohort() {
    if (COHORT) return COHORT;
    const r = AI().rng(4242), out = [];
    for (let i = 0; i < 42; i++) {
      const s = { n: i + 1, stage: wpick(r, STAGE_W), bg: wpick(r, BG_W), L: {}, snips: [] };
      const tried = {}; LENSES.forEach((l) => { tried[l] = r() < P_TRY[l]; });
      if (!LENSES.some((l) => tried[l])) tried.ba = true;
      LENSES.forEach((l) => {
        if (!tried[l]) { s.L[l] = null; return; }
        const complete = r() < 0.8, reach = complete ? 5 : 1 + Math.floor(r() * 4), steps = {}, ch = {};
        SID[l].forEach((id, k) => {
          if (k >= reach) return;
          const C = CH[l + "." + id]; let off = false;
          if (C) { ch[id] = wpick(r, C.p); off = !!C.int && ch[id] !== C.int; }
          const ph = Math.min(0.9, P_HARD[l][k] * (C && C.int ? (off ? 1.6 : 0.75) : 1));
          const hard = r() < ph, enj = r() < P_ENJ[l][k];
          const drained = !enj && r() < (hard ? 0.3 : 0.07);
          const hints2 = r() < (hard ? 0.6 : 0.06);
          const skipped = r() < (hard ? 0.14 : 0.04);
          // a skipped step can still be marked hard (that may be why), but nobody marks a skipped step enjoyed or draining
          steps[id] = { hard, enj: enj && !skipped, drained: drained && !skipped, hints2, skipped, done: !skipped };
        });
        if (complete) { let done = SID[l].filter((id) => steps[id].done).length; for (let k = 4; k >= 0 && done < 3; k--) { const x = steps[SID[l][k]]; if (!x.done) { x.done = true; x.skipped = false; done++; } } }
        else { const last = steps[SID[l][reach - 1]]; if (last && !last.skipped) last.done = false; }   // where they stopped
        s.L[l] = { complete, reach, steps, ch, refl: complete && r() < 0.8, shared: complete && r() < 0.75 };
      });
      const reflN = LENSES.filter((l) => s.L[l] && s.L[l].refl).length;
      const all3 = LENSES.every((l) => s.L[l]);
      let k = reflN ? (r() < 0.3 ? 2 : r() < 0.78 ? 1 : 0) : 0;
      const pool = BANK.filter((b) => s.L[b.lens] && s.L[b.lens].refl).map((b) => {
        const st = s.L[b.lens].steps[b.step];
        return { b, w: 1 + (st && (st.enj || st.hard) ? 2 : 0) + (b.tag === "wantsCoding" && s.bg === "technical" ? 2 : 0) + (b.tag === "unsureField" && all3 ? 2 : 0) };
      });
      while (k-- > 0 && pool.length) {
        let x = r() * pool.reduce((a, p) => a + p.w, 0), j = 0;
        for (; j < pool.length - 1; j++) { x -= pool[j].w; if (x <= 0) break; }
        s.snips.push(pool[j].b.i); pool.splice(j, 1);
      }
      out.push(s);
    }
    COHORT = out;
    return out;
  }

  /* ====================================================================================================
     2. Page state (module-level, like brief's view) and helpers
     ==================================================================================================== */
  const F = { bg: "", stage: "" };
  let REC = "7";                       // 1:1 prep: a shared record number, or "you"
  let liveDigest = false;              // the digest is announced (aria-live) only when a filter re-composed it
  let swapped = "";                    // theme whose quotes were just swapped (one soft wash)
  const revealed = {};                 // below-the-fold AI sections stream when scrolled into view
  let lastQs = [];                     // plain text of the current questions (for Copy)

  const filtered = () => cohort().filter((s) => (!F.bg || s.bg === F.bg) && (!F.stage || s.stage === F.stage));
  const lensShort = (l) => MP.lensInfo[l].short;
  const lensName = (l) => MP.t(MP.lensInfo[l].name);
  const stepObj = (l, id) => (MP.lenses[l] && MP.lenses[l].steps || []).find((s) => s.id === id);
  const stepShort = (l, id, lang) => { const s = stepObj(l, id); return s ? (lang ? (s.short || s.title)[lang] : MP.t(s.short || s.title)) : id; };
  const stepNo = (l, id) => SID[l].indexOf(id) + 1;
  const pad = (n) => (n < 10 ? "0" : "") + n;
  // zh short labels of 5+ characters get one phrase hint near the middle ("按渠道​拆分"), so keep-all breaks there
  const brk = (str) => (zh() && /^[\u3400-\u9fff]{5,}$/.test(str) ? str.slice(0, Math.ceil(str.length / 2)) + "\u200b" + str.slice(Math.ceil(str.length / 2)) : str);
  const recName = (n) => (zh() ? "学生 " : "Student ") + pad(n);
  const at = (s, l, id) => (s.L[l] && s.L[l].steps[id]) || null;
  const optLabel = (list, id) => { const o = (MP.profileOptions[list] || []).find((x) => x.id === id); return o ? MP.t(o) : ""; };
  // numbers every AI line may use: MP.data facts it quotes (everything else is a whole count added as composed)
  const BASE_KNOWN = [27, 27.0, 20.5, 6.5, 3.25, 23.75, 75, 62.5, 70, 1404, 1228, 409, 246, 19.0, 40, 80, 100, 123, 150, 200, 82, 15, 27, 32, 50, 4, 7, 10, 57, 60, 140, 81, 88.2, 89.8];
  const SEEN = (key, fp) => AI().state().seen[key] === String(fp);
  /** "1 of 2" counts the wordings the reader has seen (regenerate presses), not the seeded variant index. */
  const nth = (key, n) => { const k = ((AI().state().regen[key] || 0) % (n || 2)) + 1; return T(`${k} of ${n || 2}`, `${k}/${n || 2}`); };

  /* ====================================================================================================
     3. Themes (the digest)
     ==================================================================================================== */
  const reachedOf = (G, l, id) => G.filter((s) => at(s, l, id));
  const cnt = (G, f) => G.filter(f).length;
  const NUMERIC = [["ba", "ratio"], ["ba", "funnel"], ["ds", "claim"], ["ds", "trend"], ["ai", "numbers"]];
  const hasSnip = (s, tag) => s.snips.some((i) => BANK[i].tag === tag);
  const WRITE = { ba: T("one-page recommendation", "一页行动建议"), ds: T("evidence summary", "证据小结"), ai: T("model-change note", "模型改动说明") };
  const WRITE_ID = { ba: "memo", ds: "summary", ai: "note" };
  // Each theme: who belongs (behaviour in the record OR a reflection on it), the facts its sentence states, and two
  // frames per language. A clause whose evidence is missing is dropped (q = there are quotes to point at).
  const THEMES = {
    sampleSize: {
      lens: "ba", step: "test",
      has: (s) => hasSnip(s, "sampleSize") || !!(at(s, "ba", "test") && (at(s, "ba", "test").hard || at(s, "ba", "test").enj)),
      facts(G) { const R = reachedOf(G, "ba", "test"); return { r: R.length, h: cnt(R, (s) => at(s, "ba", "test").hard), e: cnt(R, (s) => at(s, "ba", "test").enj), both: cnt(R, (s) => at(s, "ba", "test").hard && at(s, "ba", "test").enj) }; },
      say: (f, q) => [
        T(`Sample size surprised them. Of the ${f.r} who designed the BA test, ${f.h} marked it hard and ${f.e} enjoyed it${f.both >= 2 ? `, ${f.both} of them both` : ""}.${q ? " What they wrote keeps coming back to how many learners a small lift needs." : ""}`,
          `样本量让他们意外。做过 BA 试验设计的 ${f.r} 人里，${f.h} 人标了有难度，${f.e} 人标了喜欢${f.both >= 2 ? `，其中 ${f.both} 人两样都标了` : ""}。${q ? "他们写下的话，反复回到同一个问题：一个小提升需要多少学员。" : ""}`),
        T(`The BA test is where it landed: ${f.h} of the ${f.r} who reached it marked it hard, ${f.e} enjoyed it.${q ? " Their notes are about scale, and how many learners it takes to see a small lift." : ""}`,
          `落点在 BA 的试验设计：做到这一步的 ${f.r} 人里，${f.h} 人觉得难，${f.e} 人喜欢。${q ? "他们写的大多关于规模：小小的提升，要多少人才看得出来。" : ""}`)
      ]
    },
    writingForDecider: {
      lens: "ba", step: "memo",
      has: (s) => hasSnip(s, "writingForDecider") || LENSES.some((l) => at(s, l, WRITE_ID[l]) && at(s, l, WRITE_ID[l]).enj),
      facts(G) {
        const per = LENSES.map((l) => { const R = reachedOf(G, l, WRITE_ID[l]); return { l, r: R.length, e: cnt(R, (s) => at(s, l, WRITE_ID[l]).enj) }; }).filter((x) => x.r);
        per.sort((a, b) => b.e - a.e || b.r - a.r);
        return per[0] ? { lead: per[0].l, r: per[0].r, e: per[0].e } : { lead: "ba", r: 0, e: 0 };
      },
      say: (f, q) => [
        T(`They liked writing for someone who has to decide. Among the write-ups, the ${WRITE[f.lead].en} drew the most enjoyed marks: ${f.e} of the ${f.r} who wrote one.${q ? " Several say the reader changed what they cut." : ""}`,
          `他们喜欢为要做决定的人写东西。几份交付物里，标记喜欢最多的是${WRITE[f.lead].zh}：写过的 ${f.r} 人中有 ${f.e} 人。${q ? "好几位提到，想着读者是谁，才知道该删什么。" : ""}`),
        T(`Writing for a decider pulled them in. The ${WRITE[f.lead].en} was the write-up most often marked enjoyed (${f.e} of ${f.r}).${q ? " Their notes talk about the reader more than the numbers." : ""}`,
          `为做决定的人写作，吸引了不少人。交付物中，${WRITE[f.lead].zh}最常被标为喜欢（${f.r} 人中 ${f.e} 人）。${q ? "他们写的更多是读者，而不是数字。" : ""}`)
      ]
    },
    mixSurprise: {
      lens: "ds", step: "split",
      has: (s) => hasSnip(s, "mixSurprise") || !!(at(s, "ds", "split") && (at(s, "ds", "split").hard || at(s, "ds", "split").enj)),
      facts(G) { const R = reachedOf(G, "ds", "split"); return { r: R.length, h: cnt(R, (s) => at(s, "ds", "split").hard), e: cnt(R, (s) => at(s, "ds", "split").enj) }; },
      say: (f, q) => [
        T(`Who signed up surprised them. ${f.h} of the ${f.r} who split the drop by channel marked it hard, and ${f.e} enjoyed it.${q ? " Their notes are about an average moving without anyone changing." : ""}`,
          `报名人群的变化让他们意外。按渠道拆分的 ${f.r} 人里，${f.h} 人觉得难，${f.e} 人喜欢。${q ? "他们写的是：没有谁的行为变了，平均数也会动。" : ""}`),
        T(`The channel split is where the mix clicked: ${f.e} of the ${f.r} who reached it enjoyed it, ${f.h} found it hard.${q ? " Several write about blaming the course first, then finding half the drop was mix." : ""}`,
          `构成变化在渠道拆分这一步被看懂：做到这里的 ${f.r} 人中，${f.e} 人喜欢，${f.h} 人觉得难。${q ? "不少人写到，先怪课程，后来才发现一半是人群变了。" : ""}`)
      ]
    },
    readingMessages: {
      lens: "ai", step: "errors",
      has: (s) => hasSnip(s, "readingMessages") || !!(at(s, "ai", "errors") && at(s, "ai", "errors").enj),
      facts(G) { const R = reachedOf(G, "ai", "errors"); return { r: R.length, e: cnt(R, (s) => at(s, "ai", "errors").enj), c: cnt(R, (s) => s.L.ai.ch.errors === "content") }; },
      say: (f) => [
        T(`Reading the messages beat reading the score. ${f.e} of the ${f.r} who read the misrouted messages enjoyed it, and ${f.c} named content questions sent to Tech support as the main pattern.`,
          `读消息本身，比看分数更有收获。读过分错消息的 ${f.r} 人里，${f.e} 人标了喜欢，${f.c} 人认出了主要规律：课程问题被分给了技术支持。`),
        T(`The messages themselves drew them in: ${f.e} of ${f.r} enjoyed reading the mistakes, and ${f.c} spotted content questions landing with Tech support.`,
          `真正吸引他们的是消息本身：${f.r} 人中 ${f.e} 人喜欢看错误，${f.c} 人发现课程问题被分到了技术支持。`)
      ]
    },
    tradeoffs: {
      lens: "ai", step: "tradeoff",
      has: (s) => hasSnip(s, "tradeoffs") || ["change", "tradeoff"].some((id) => at(s, "ai", id) && at(s, "ai", id).enj),
      facts(G) { const R = reachedOf(G, "ai", "tradeoff"); return { r: R.length, e: cnt(R, (s) => at(s, "ai", "tradeoff").enj || at(s, "ai", "change").enj), y: cnt(R, (s) => s.L.ai.ch.tradeoff === "yes") }; },
      say: (f) => [
        T(`Trade-offs stuck with them. ${f.e} of the ${f.r} who weighed Plan A against Plan B enjoyed the change-and-weigh steps, where there's no single answer.`,
          `取舍这件事让他们印象深。比较过 A、B 两个方案的 ${f.r} 人里，${f.e} 人喜欢改动与权衡这两步，这里没有唯一答案。`),
        T(`Costs, not answers: ${f.e} of the ${f.r} who reached Plan A vs Plan B enjoyed the change-and-weigh steps${f.y >= 3 ? `, though ${f.y} first picked Plan B on accuracy alone` : ""}.`,
          `没有标准答案，只有代价：做到方案比较的 ${f.r} 人中，${f.e} 人喜欢改动与权衡这两步${f.y >= 3 ? `，虽然其中 ${f.y} 人一开始只看准确率就选了 B` : ""}。`)
      ]
    },
    numbersAnxiety: {
      lens: "ds", step: "trend",
      has: (s) => hasSnip(s, "numbersAnxiety") || NUMERIC.filter(([l, id]) => at(s, l, id) && at(s, l, id).hard).length >= 2,
      facts(G) { return { h2: cnt(G, (s) => NUMERIC.filter(([l, id]) => at(s, l, id) && at(s, l, id).hard).length >= 2), hn: cnt(G, (s) => NUMERIC.some(([l, id]) => at(s, l, id) && at(s, l, id).hints2)) }; },
      say: (f) => [
        T(`For some, the numbers themselves were the hard part. ${f.h2} marked two or more number-reading steps hard; ${f.hn} used the second hint on at least one.`,
          `有些人觉得最难的是数字本身。${f.h2} 人把两步以上的读数步骤标成有难度，${f.hn} 人至少在一步用到了第二级提示。`),
        T(`Reading numbers was the wall for some: ${f.hn} reached for the second hint on a number-reading step, and ${f.h2} marked two or more of them hard.`,
          `对一部分人来说，读数字就是那道坎：${f.hn} 人在读数步骤里用到了第二级提示，${f.h2} 人把其中两步以上标成有难度。`)
      ]
    },
    wantsCoding: {
      lens: "ai", step: "change",
      has: (s) => hasSnip(s, "wantsCoding"),
      facts(G) { const M = G.filter((s) => hasSnip(s, "wantsCoding")); return { m: M.length, tech: cnt(M, (s) => s.bg === "technical") }; },
      say: (f) => [
        T(`Some wanted more code than these lenses ask for. ${f.tech} of the ${f.m} who said so come from engineering, CS or math.`, `有人想要比这几个视角更多的代码。这样说的 ${f.m} 人里，${f.tech} 人是工科、计算机或数学背景。`),
        T(`A few asked for the code behind the work: ${f.m} said so, ${f.tech} of them with a technical background.`, `有几位想看到工作背后的代码：${f.m} 人提到了这一点，其中 ${f.tech} 人有理工科背景。`)
      ]
    },
    unsureField: {
      lens: "ba", step: "funnel",
      has: (s) => hasSnip(s, "unsureField") || (LENSES.every((l) => s.L[l]) && LENSES.filter((l) => s.L[l].complete).length <= 1),
      facts(G) { const A3 = G.filter((s) => LENSES.every((l) => s.L[l])); return { a: A3.length, c: cnt(A3, (s) => LENSES.filter((l) => s.L[l].complete).length <= 1) }; },
      say: (f) => [
        T(`Trying more made the choice harder, not easier. ${f.a} opened all three lenses; ${f.c} of them finished one or none.`, `试得越多，越难选。${f.a} 人三个视角都打开过，其中 ${f.c} 人只做完一个，或一个也没做完。`),
        T(`Several are still deciding: ${f.a} opened all three lenses, and ${f.c} of those stopped before finishing a second.`, `不少人还在选：${f.a} 人打开过全部三个视角，其中 ${f.c} 人没做完第二个。`)
      ]
    }
  };
  const THEME_NAME = {
    sampleSize: T("Sample size", "样本量"), writingForDecider: T("Writing for a decider", "为决策者写作"), mixSurprise: T("Who signed up", "人群构成"),
    readingMessages: T("Reading the messages", "读消息"), tradeoffs: T("Trade-offs", "取舍"), numbersAnxiety: T("Reading numbers", "读数字"),
    wantsCoding: T("Wanting code", "想写代码"), unsureField: T("Still deciding", "还在选")
  };
  function themes(G) {
    return Object.keys(THEMES).map((id) => ({ id, m: G.filter(THEMES[id].has).length })).filter((x) => x.m >= MIN)
      .sort((a, b) => b.m - a.m || a.id.localeCompare(b.id)).slice(0, 3);
  }
  /** Two anonymised quotes for a theme from the filtered group; "Show another" rotates them (regen counter). */
  function quotesFor(G, tag) {
    const ids = []; G.forEach((s) => s.snips.forEach((i) => { if (BANK[i].tag === tag && !ids.includes(i)) ids.push(i); }));
    ids.sort((a, b) => a - b);
    if (!ids.length) return { list: [], more: false };
    const start = (AI().hash(tag + F.bg + F.stage) + 2 * (AI().state().regen["school.q." + tag] || 0)) % ids.length;
    const list = []; for (let k = 0; k < Math.min(2, ids.length); k++) list.push(BANK[ids[(start + k) % ids.length]]);
    return { list, more: ids.length > 2 };
  }

  /* ====================================================================================================
     4. Stuck points
     ==================================================================================================== */
  const isStuck = (x) => x.hard || x.hints2 || x.skipped;
  function stuckMap(G) {
    const rows = [];
    LENSES.forEach((l) => SID[l].forEach((id) => {
      const R = reachedOf(G, l, id); const s = cnt(R, (x) => isStuck(at(x, l, id)));
      rows.push({ l, id, r: R.length, s, share: R.length ? s / R.length : 0 });
    }));
    const top = rows.filter((x) => x.r >= MIN && x.s > 0).sort((a, b) => b.share - a.share || b.s - a.s).slice(0, 3);
    top.forEach((x, i) => { x.rank = i + 1; });
    return { rows, top };
  }
  // the authored reading of each step's most common detour; {n} = how many of those who reached it took it
  const DETOUR = {
    "ba.ratio": { swap: (n) => T(`${n} of them read 40÷80 as the overall completion rate: the same 40 people, a different denominator.`, `其中 ${n} 人把 40÷80 当成了整体完成率：同样 40 个人，换了分母。`) },
    "ba.funnel": {
      lost: (n) => T(`${n} of them picked the step that lost the most people (1,404 recent learners) over the one whose rate fell furthest (75% → 62.5%).`, `其中 ${n} 人选了流失人数最多的一步（近期 1,404 人），而不是转化率跌得最多的那一步（75% → 62.5%）。`),
      other: (n) => T(`${n} of them chose a step that neither lost the most people nor fell the furthest.`, `其中 ${n} 人选的那一步，既不是流失最多的，也不是跌幅最大的。`)
    },
    "ba.test": { big: (n) => T(`${n} of them first hoped for a big lift, then saw how many learners per group even a small one needs.`, `其中 ${n} 人一开始期待很大的提升，后来才看到哪怕小小的提升，每组也要多少学员。`) },
    "ds.claim": {
      none: (n) => T(`${n} of them first said nothing could make 27.0% → 20.5% misleading.`, `其中 ${n} 人起初认为，27.0% → 20.5% 不可能有什么误导。`),
      noise: (n) => T(`${n} of them blamed small groups bouncing around, though every cohort here is large.`, `其中 ${n} 人归因于小样本的起伏，可这里每一批人数都不少。`),
      def: (n) => T(`${n} of them suspected the definition of completed had changed: a fair check, but not what moved this number.`, `其中 ${n} 人怀疑完成的定义变了：值得一查，但这个数字不是因此而变。`)
    },
    "ds.trend": {
      chase: (n) => T(`${n} of them wanted to chase cohort 11's dip to 19.0%, which sits inside the normal cohort-to-cohort wobble.`, `其中 ${n} 人想追查第 11 批跌到 19.0% 的那一下，而它其实落在批次之间的正常波动里。`),
      unsure: (n) => T(`${n} of them weren't sure whether the dip was noise; the wobble band is where they slowed down.`, `其中 ${n} 人拿不准那次下跌是不是随机波动，波动带是他们放慢的地方。`)
    },
    "ds.split": {
      all: (n) => T(`${n} of them read the reweighted 23.75% as the course recovering, not as a what-if.`, `其中 ${n} 人把调整后的 23.75% 理解成课程回升了，而不是一个假设情景。`),
      none: (n) => T(`${n} of them decided mix explained none of the drop, before moving the slider to 23.75%.`, `其中 ${n} 人在把滑块拖到 23.75% 之前，认定构成变化跟下降无关。`)
    },
    "ds.conclude": {
      a: (n) => T(`${n} of them concluded the course got worse, though about half the 6.5-point drop is mix.`, `其中 ${n} 人的结论是课程变差了，而 6.5 个百分点的降幅里约一半来自人群构成。`),
      c: (n) => T(`${n} of them concluded nothing really changed, though the drop is real inside both channels.`, `其中 ${n} 人认为其实没什么变化，可两个渠道内部都确实在下降。`)
    },
    "ai.numbers": { swap: (n) => T(`${n} of them read 123 of 150 as if it were out of all 200 messages.`, `其中 ${n} 人把 150 条里对了 123 条，当成了 200 条里的比例。`) },
    "ai.errors": {
      billing: (n) => T(`${n} of them saw billing and account mix-ups as the main pattern; content questions sent to Tech support are the bigger group (15 of 27).`, `其中 ${n} 人把账单和账户混淆看成主要规律，其实课程问题被分给技术支持的更多（27 条里有 15 条）。`),
      random: (n) => T(`${n} of them called the mistakes random, though 15 of the 27 are content questions sent to Tech support.`, `其中 ${n} 人认为错误是随机的，而 27 条错误里有 15 条是课程问题被分给了技术支持。`)
    },
    "ai.tradeoff": {
      yes: (n) => T(`${n} of them picked Plan B on accuracy alone, before counting the extra human work.`, `其中 ${n} 人只看准确率就选了 B 方案，还没算多出来的人工。`),
      no: (n) => T(`${n} of them ruled Plan B out before weighing that it gets 57 of 60 right.`, `其中 ${n} 人直接排除了 B 方案，没先考虑它 60 条里对了 57 条。`)
    }
  };
  const CHANGE = {
    threshold: [T("raised the threshold", "提高了阈值"), T("that run sends 32 more messages to people (50 → 82)", "这一改动让转人工的消息多了 32 条（50 → 82）")],
    examples: [T("added content examples", "补充了课程示例"), T("that run brings new mistakes the other way (4 → 7)", "这一改动带来了反方向的新错误（4 → 7）")],
    definition: [T("rewritten the team definitions", "改写了类别定义"), T("the change with the smallest gain (content→tech mistakes 15 → 10)", "这是收益最小的改动（课程→技术的错误 15 → 10）")]
  };
  /** One stuck point's explanation, grounded in that step's choices. Returns {en, zh} (strings). */
  function explain(G, x, fb) {
    fb = fb || { n: 0 };
    const key = x.l + "." + x.id, C = CH[key], R = reachedOf(G, x.l, x.id);
    const pick = (s) => s.L[x.l].ch[x.id];
    if (x.l === "ai" && x.id === "change") {
      const S = R.filter((s) => isStuck(at(s, "ai", "change")));
      const by = {}; S.forEach((s) => { by[pick(s)] = (by[pick(s)] || 0) + 1; });
      const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
      if (top) return T(`Of the ${S.length} who got stuck, ${by[top]} had ${CHANGE[top][0].en}; ${CHANGE[top][1].en}.`, `卡住的 ${S.length} 人里，${by[top]} 人${CHANGE[top][0].zh}，${CHANGE[top][1].zh}。`);
    }
    if (C && !C.int) {
      const n = cnt(R, (s) => pick(s) === "starters");
      return T(`${n} of them began from the sentence starters rather than a blank box.`, `其中 ${n} 人是从句子开头提示写起的，而不是从空白开始。`);
    }
    if (C && C.int && DETOUR[key]) {
      // read the detour among the students who got stuck here ("them" = the stuck group named just before)
      const S = R.filter((s) => isStuck(at(s, x.l, x.id)));
      const by = {}; S.forEach((s) => { const c = pick(s); if (c !== C.int) by[c] = (by[c] || 0) + 1; });
      const top = Object.keys(by).filter((c) => DETOUR[key][c]).sort((a, b) => by[b] - by[a] || a.localeCompare(b))[0];
      if (top && by[top] >= 3 && by[top] / Math.max(1, S.length) >= 0.2) return DETOUR[key][top](by[top]);
    }
    const h = cnt(R, (s) => at(s, x.l, x.id).hard), k = cnt(R, (s) => at(s, x.l, x.id).skipped);
    const sk = { en: k ? `, ${k} skipped it` : ", and nobody skipped it", zh: k ? `，${k} 人跳过` : "，没有人跳过" };
    return [T(`I can't point to one misreading here: their picks are spread out. ${h} marked it hard${sk.en}.`, `这里我找不出同一种误读，他们的选择比较分散。${h} 人标了有难度${sk.zh}。`),
      T(`No single wrong turn stands out in their picks, so I won't guess at one. ${h} marked it hard${sk.en}.`, `从他们的选择里看不出某一种共同的误解，我就不猜了。${h} 人标了有难度${sk.zh}。`)][(fb.n++) % 2];
  }

  /* ====================================================================================================
     5. Questions for advising sessions
     ==================================================================================================== */
  const Q_STEP = {
    "ba.ratio": [T("Same 40 people, two percentages. Which question does each one answer, in your own words?", "同样 40 个人，两个百分比。用你自己的话说，它们各回答什么问题？"), T("When you see a percentage, what's your first move to check what it's out of?", "看到一个百分比时，你会先怎么确认它的分母是谁？")],
    "ba.funnel": [T("The step that lost the most people, or the one whose rate fell furthest: how would you choose?", "流失人数最多的一步，和转化率跌得最多的一步，你会怎么取舍？"), T("If you had to defend your pick for the leak to a product lead, which number would you lead with?", "如果要向产品负责人解释你选的漏点，你会先拿哪个数字说话？")],
    "ba.missing": [T("Before acting on a number, what's the one thing you'd always check?", "动手之前，有哪一件事你一定会先查？"), T("Which of the checks pointed you to another lens, and did that surprise you?", "哪一项检查把你引向了别的视角？这让你意外吗？")],
    "ba.test": [T("A small lift needs a lot of learners. Did that make testing feel more worth it, or more of a chore?", "小小的提升也需要很多学员。这让试验显得更值得，还是更麻烦？"), T("If a test would take two months to tell you anything, would you still run it?", "如果一次试验要两个月才看得出结果，你还会做吗？")],
    "ds.claim": [T("What could make a headline number misleading, before you even open the data?", "还没打开数据之前，有哪些原因会让一个标题数字误导人？"), T("Who would you ask first when a number drops this much?", "一个数字跌了这么多，你会先去问谁？")],
    "ds.trend": [T("How would you tell a real change from normal wobble, without a formula?", "不用公式，你会怎么分辨真实变化和正常波动？"), T("Cohort 11 dipped to 19.0%. Would you chase it? What would change your mind?", "第 11 批跌到了 19.0%。你会追查吗？什么会让你改变主意？")],
    "ds.split": [T("What does the 23.75% tell you, and what doesn't it tell you?", "23.75% 告诉了你什么，又没告诉你什么？"), T("Half the drop came from who signed up. Who would you tell first, and how?", "一半的降幅来自报名人群的变化。你会先告诉谁，怎么说？")],
    "ds.conclude": [T("How strong a claim would you put your name to here, and why not stronger?", "在这里，你愿意署名的结论能有多强？为什么不更强？"), T("What separates saying the course got worse from saying completion fell?", "说课程变差了，和说完成率下降了，区别在哪里？")],
    "ai.numbers": [T("Accuracy on what it handled, or share of all messages: which would you report first?", "自动处理部分的准确率，和占全部消息的比例，你会先报哪一个？"), T("Why might two denominators in one table trip people up?", "为什么一张表里有两个分母，容易让人绊倒？")],
    "ai.errors": [T("What did reading the messages show you that the accuracy number didn't?", "读消息让你看到了什么，是准确率数字看不出来的？"), T("Why might a word like error send a content question to Tech support?", "为什么报错这样的词，会把课程问题送到技术支持？")],
    "ai.change": [T("Every change made something else worse. How would you decide which cost to accept?", "每一个改动都让别处变差一点。你会怎么决定接受哪种代价？"), T("Who should decide whether 32 more messages for people is worth fewer mistakes?", "多 32 条消息转人工，换来更少的错误，这该由谁来拍板？")],
    "ai.tradeoff": [T("Is the more accurate plan always the better one? What would you ask before choosing?", "更准的方案就一定更好吗？选之前你会先问什么？"), T("Plan B gets 57 of 60 right. Who handles the other 140 messages, and does that matter?", "B 方案 60 条里对了 57 条。剩下的 140 条由谁处理？这重要吗？")],
    write: [T("What makes the first line of a recommendation hard to write?", "一份建议的第一句，为什么最难写？"), T("Who would you most like to write for: a product lead, a support lead, or a researcher?", "你最想为谁写：产品负责人、支持团队负责人，还是研究者？")]
  };
  const Q_THEME = {
    sampleSize: [T("When the test showed how many learners a small lift needs, did testing feel more worth it, or more of a chore?", "当试验告诉你小提升也需要那么多学员，你觉得试验更值得了，还是更麻烦了？"), T("What would you want to know before you'd trust a small test's result?", "要相信一次小范围试验的结果，你还想先知道什么？")],
    writingForDecider: [T("You liked writing for someone who has to decide. Which reader would you want most: a product lead, a support lead, or a researcher?", "你们喜欢为要做决定的人写东西。最想要哪种读者：产品负责人、支持团队负责人，还是研究者？"), T("What changes when you write for someone who has five minutes?", "当读者只有五分钟时，你的写法会有什么不同？")],
    mixSurprise: [T("Before the DS lens, would you have blamed the course? What would you check first now?", "做 DS 视角之前，你会先怪课程吗？现在你会先查什么？"), T("Where else have you seen an average move because the group changed?", "你在别的地方见过因为人群变了，平均数跟着变的情况吗？")],
    readingMessages: [T("What did reading the messages show you that the score didn't?", "读消息让你看到了什么，是分数看不出来的？"), T("Would you enjoy a job where reading examples is half the work?", "如果一份工作有一半时间在读样例，你会喜欢吗？")],
    tradeoffs: [T("When a fix costs more human work, who should decide whether it's worth it?", "一个改动会增加人工，该由谁来判断值不值得？"), T("Do you like problems with no single answer, or do they wear you out?", "没有唯一答案的问题，你是喜欢，还是觉得累？")],
    numbersAnxiety: [T("Which numbers felt shaky? Would more practice help, or seeing the same idea in a second dataset?", "哪些数字让你心里没底？多练习会有帮助，还是换一份数据再看一遍同样的道理？"), T("What would make you more confident reading a table like these?", "读这样的表格，什么能让你更有底气？")],
    wantsCoding: [T("Some of you want more code than these lenses ask for. Which part would you want to build yourself?", "有人想要比这些视角更多的代码。你最想亲手搭的是哪一部分？"), T("Would you rather build the tool, or use it to make the call?", "你更想做工具的人，还是用工具做判断的人？")],
    unsureField: [T("You tried more than one lens and still feel unsure. Which would you redo first, and why?", "试了不止一个视角，还是拿不定主意。你会先重做哪一个，为什么？"), T("If all three appeal to you, what would an ordinary Monday in each look like?", "如果三个都吸引你，在每一种工作里，一个普通的周一会是什么样？")]
  };
  const Q_HE = [
    (s) => T(`Several of you found “${s.en}” hard but enjoyed it. Would a whole term of that sound good, or exhausting?`, `不少同学觉得“${s.zh}”难，却也喜欢它：这样的一学期，你觉得是有意思还是太累？`),
    (s) => T(`“${s.en}” was hard for many of you, and enjoyable for some of the same people. What made the hard part worth it, or not?`, `“${s.zh}”让不少人觉得难，其中一些人也挺喜欢。难的那部分，值不值得？`)
  ];
  const Q_H = [
    (s) => T(`“${s.en}” is where this group slowed down most. What would have helped: a worked example earlier, or more time?`, `这一组在“${s.zh}”停得最久。什么会有帮助：更早看到示例，还是更多时间？`),
    (s) => T(`What made “${s.en}” the slowest step for so many of you?`, `为什么“${s.zh}”会是这么多人走得最慢的一步？`)
  ];
  const Q_CROSS = [T("BA found where learners leave; AI found why their help requests reach the wrong team. Which half of that story would you rather work on?", "BA 找到了学员在哪里离开，AI 找到了他们的求助为什么被分错。这个故事的哪一半，你更想去做？"), T("Same problem, three lenses. Which question would you want to keep asking for two years?", "同一个问题，三个视角。哪一个问题，你愿意连着问两年？")];
  function questions(G, M, TH, v) {
    const out = [], used = new Set();
    const add = (q, why, cite) => { if (q && out.length < 4 && !used.has(q.en)) { used.add(q.en); out.push({ q, why, cite }); } };
    const top = M.top[0];
    if (top) {
      const R = reachedOf(G, top.l, top.id), he = cnt(R, (s) => at(s, top.l, top.id).hard && at(s, top.l, top.id).enj);
      const nm = { en: stepShort(top.l, top.id, "en"), zh: stepShort(top.l, top.id, "zh") };
      add((he >= 3 ? Q_HE : Q_H)[v % 2](nm), "stuck", { lens: top.l, step: top.id });
    }
    M.top.forEach((x) => { const k = SID[x.l].indexOf(x.id) === 4 ? "write" : x.l + "." + x.id; if (Q_STEP[k]) add(Q_STEP[k][v % 2], "stuck", { lens: x.l, step: x.id }); });
    TH.forEach((th) => add(Q_THEME[th.id][v % 2], th.id, { lens: THEMES[th.id].lens, step: THEMES[th.id].step }));
    if (cnt(G, (s) => s.L.ba && s.L.ai) >= MIN) add(Q_CROSS[v % 2], "cross", null);
    add(Q_STEP.write[v % 2], "write", null);
    return out.slice(0, 4);
  }

  /* ====================================================================================================
     6. 1:1 prep: openers from one record's marks only
     ==================================================================================================== */
  /** Marks for a record: {l: {tried, complete, k (steps done), steps: {id: {hard, enj, drained, hints2, skipped, done, reached}}}}.
      "you": this device's own marks: enjoyed / drained / hard / skipped. Hint use stays private, so it is never read. */
  function marksOf(rec) {
    const out = {};
    if (rec === "you") {
      LENSES.forEach((l) => {
        const p = MP.progress(l), ls = MP.ls(l);
        const steps = {};
        SID[l].forEach((id) => { const x = ls.steps[id] || {}; const reached = !!(x.done || x.skipped || x.energy || x.hard); if (reached) steps[id] = { hard: !!x.hard, enj: x.energy === "enjoyed", drained: x.energy === "drained", hints2: false, skipped: !!(x.skipped && !x.done), done: !!x.done, reached }; });
        out[l] = (p.started || Object.keys(steps).length) ? { tried: true, complete: p.complete, k: SID[l].filter((id) => steps[id] && steps[id].done).length, steps } : { tried: false, steps: {} };
      });
      return out;
    }
    const s = cohort()[+rec - 1];
    LENSES.forEach((l) => {
      const L = s.L[l];
      if (!L) { out[l] = { tried: false, steps: {} }; return; }
      const steps = {}; Object.keys(L.steps).forEach((id) => { steps[id] = Object.assign({ reached: true }, L.steps[id]); });
      out[l] = { tried: true, complete: L.complete, k: SID[l].filter((id) => steps[id] && steps[id].done).length, steps };
    });
    return out;
  }
  const OPEN = {
    hardHint: [(s) => T(`You marked “${s.en}” hard, then finished it after the worked example. What changed when you saw it?`, `你把“${s.zh}”标成有难度，看了示例之后做完了。看到示例时，哪里一下子清楚了？`),
      (s) => T(`“${s.en}” took the worked example to get through. Was the idea new, or was it the way the task was asked?`, `“${s.zh}”这一步，你是看了示例才做完的。是这个概念本身陌生，还是题目的问法让人卡住？`)],
    hardEnj: [(s) => T(`You marked “${s.en}” both hard and enjoyed. What made the hard part worth it?`, `你给“${s.zh}”同时标了有难度和喜欢。难的那部分，是什么让它值得？`),
      (s) => T(`“${s.en}” was hard and you enjoyed it anyway. Would you want more work like that, or was once enough?`, `“${s.zh}”很难，你却还是喜欢。这样的事想多做一些，还是做一次就够了？`)],
    skipped: [(s) => T(`You skipped “${s.en}”. Was it the time, or did the task itself not pull you in?`, `你跳过了“${s.zh}”。是时间不够，还是这件事本身没吸引你？`),
      (s) => T(`“${s.en}” is the step you skipped. Worth a look together, or not your kind of question?`, `你跳过的是“${s.zh}”。要不要一起看看，还是这类问题本来就不是你想做的？`)],
    drained: [(s) => T(`“${s.en}” drained you. Was it the topic, or the kind of thinking it asked for?`, `“${s.zh}”让你有点累。是题目本身，还是它要求的那种思考方式？`),
      (s) => T(`You marked “${s.en}” as draining. Would more time change that, or is it a signal worth noticing?`, `你说“${s.zh}”有点累。时间更充裕会不一样吗，还是这本身就值得留意？`)],
    enjCluster: [(s, x) => T(`You enjoyed ${x.n} steps in ${x.name.en}, “${s.en}” among them. Which of those would you happily do on an ordinary Tuesday?`, `你在${x.name.zh}里喜欢了 ${x.n} 步，其中有“${s.zh}”。哪一件事，你愿意在一个普通的周二也做？`),
      (s, x) => T(`${x.name.en} drew ${x.n} enjoyed marks from you, including “${s.en}”. What do those steps have in common?`, `你在${x.name.zh}里标了 ${x.n} 次喜欢，包括“${s.zh}”。这几步有什么共同点？`)],
    hardOnly: [(s) => T(`You marked “${s.en}” hard. New-hard, or the kind of hard that would stay?`, `你把“${s.zh}”标成有难度。是第一次接触的难，还是会一直难下去的那种？`),
      (s) => T(`“${s.en}” felt hard. What would have made it click sooner?`, `“${s.zh}”让你觉得难。怎样能让它更早想通？`)],
    stopped: [(s, x) => T(`You stopped ${x.short} after ${x.k} of 5 steps. Worth coming back to, or had you seen enough?`, `你在 ${x.short} 做了 ${x.k}/5 步就停了。值得回去做完，还是已经看够了？`),
      (s, x) => T(`${x.short} is ${x.k} of 5 steps in. What would make the rest worth your time?`, `${x.short} 做到了第 ${x.k}/5 步。剩下的部分，怎样才值得你花时间？`)],
    untried: [(s, x) => T(`You haven't opened ${x.short}. Would seeing the same problem through it change anything?`, `你还没打开 ${x.short}。从这个角度再看一次同一个问题，会改变什么吗？`),
      (s, x) => T(`${x.short} is still unopened. Curious, or already sure you'd rather not?`, `${x.short} 还没打开。好奇吗，还是已经确定不想做？`)]
  };
  // the same mark on two steps reads as ONE observation, not two near-identical questions. a/b = {s: step names, at: lens}
  const where = (a, b, lang) => {
    if (a.l === b.l) return lang === "zh" ? `${lensShort(a.l)} 的“${a.s.zh}”和“${b.s.zh}”` : `“${a.s.en}” and “${b.s.en}” in ${lensShort(a.l)}`;
    return lang === "zh" ? `${lensShort(a.l)} 的“${a.s.zh}”和 ${lensShort(b.l)} 的“${b.s.zh}”` : `“${a.s.en}” in ${lensShort(a.l)} and “${b.s.en}” in ${lensShort(b.l)}`;
  };
  const OPEN2 = {
    hardEnj: [(a, b) => T(`Twice, a step you marked hard was also one you enjoyed: ${where(a, b, "en")}. What do those two have in common for you?`, `有两步你既标了有难度，又标了喜欢：${where(a, b, "zh")}。对你来说，这两步有什么共同点？`),
      (a, b) => T(`“${a.s.en}” and “${b.s.en}” were both hard, and you enjoyed both. Is it the same kind of challenge pulling you in?`, `“${a.s.zh}”和“${b.s.zh}”都难，你却两步都喜欢。吸引你的，是不是同一种挑战？`)],
    skipped: [(a, b) => T(`You skipped ${where(a, b, "en")}. Was it time, or did those questions not pull you in?`, `你跳过了 ${where(a, b, "zh")}。是时间不够，还是这两类问题没吸引你？`),
      (a, b) => T(`Two steps were skipped: “${a.s.en}” and “${b.s.en}”. Worth a look together, or a sign of what you'd rather not do?`, `有两步跳过了：“${a.s.zh}”和“${b.s.zh}”。要不要一起看看，还是说这正说明了你不太想做的事？`)],
    drained: [(a, b) => T(`${where(a, b, "en").replace(/^“/, "Both “")} drained you. The same kind of thinking in both, or just a long day?`, `${where(a, b, "zh")}都让你有点累。是这两步要的思考方式相同，还是那天刚好累了？`),
      (a, b) => T(`Two steps felt draining: “${a.s.en}” and “${b.s.en}”. What do they ask of you that the others don't?`, `有两步让你觉得累：“${a.s.zh}”和“${b.s.zh}”。它们要你做的，和别的步骤有什么不同？`)],
    hardOnly: [(a, b) => T(`You marked ${where(a, b, "en")} hard. New-hard, or the kind of hard that would stay?`, `你把 ${where(a, b, "zh")}标成了有难度。是第一次接触的难，还是会一直难下去的那种？`),
      (a, b) => T(`“${a.s.en}” and “${b.s.en}” both felt hard. If you did them again, which would you start with?`, `“${a.s.zh}”和“${b.s.zh}”都让你觉得难。如果重做一次，你会先从哪一步开始？`)]
  };
  // "You (this device)": an unfinished lens is still in progress, not "stopped"
  OPEN.going = [(s, x) => T(`You're ${x.k} of 5 steps into ${x.short}. What would you want to find out before you finish it?`, `你在 ${x.short} 做到了第 ${x.k}/5 步。做完之前，你最想弄清楚什么？`),
    (s, x) => T(`${x.short} is ${x.k} of 5 steps in. Is the rest pulling you, or is it more a box to tick?`, `${x.short} 做到了第 ${x.k}/5 步。剩下的部分是你想做的，还是只想把它做完？`)];
  const PRI = { hardHint: 1, hardEnj: 2, skipped: 3, drained: 4, enjCluster: 5, hardOnly: 6, stopped: 7, going: 7, untried: 8 };
  function openers(mk, you) {
    const c = [];
    LENSES.forEach((l, li) => {
      const L = mk[l];
      if (!L.tried) { if (LENSES.some((o) => mk[o].tried)) c.push({ rule: "untried", l, id: null, ord: 90 + li, x: { short: lensShort(l) } }); return; }
      SID[l].forEach((id, k) => {
        const x = L.steps[id]; if (!x) return;
        const ord = li * 10 + k;
        if (x.hard && x.hints2 && x.done) c.push({ rule: "hardHint", l, id, ord });
        else if (x.hard && x.enj) c.push({ rule: "hardEnj", l, id, ord });
        else if (x.skipped) c.push({ rule: "skipped", l, id, ord });
        else if (x.drained) c.push({ rule: "drained", l, id, ord });
        else if (x.hard) c.push({ rule: "hardOnly", l, id, ord });
      });
      const enj = SID[l].filter((id) => L.steps[id] && L.steps[id].enj && !L.steps[id].hard);
      if (enj.length >= 2) c.push({ rule: "enjCluster", l, id: enj[0], ord: li * 10, x: { n: enj.length, name: { en: MP.lensInfo[l].name.en, zh: MP.lensInfo[l].name.zh } } });
      if (!L.complete && L.k > 0) { const last = SID[l].filter((id) => L.steps[id]).pop(); c.push({ rule: you ? "going" : "stopped", l, id: last, ord: li * 10 + 9, x: { short: lensShort(l), k: L.k } }); }
    });
    c.sort((a, b) => PRI[a.rule] - PRI[b.rule] || a.ord - b.ord);
    // the same mark on two steps → one combined opener (the first two, in lens order)
    Object.keys(OPEN2).forEach((rule) => {
      const same = c.filter((o) => o.rule === rule);
      if (same.length < 2) return;
      const [a, b] = same;
      const pair = { rule, l: a.l, id: a.id, ord: a.ord, pair: [a, b] };
      c.splice(c.indexOf(a), 1, pair); c.splice(c.indexOf(b), 1);
    });
    // two passes: one opener per kind of mark first (variety), then fill up to 3 in priority order
    const out = [], per = {}, stepsUsed = new Set();
    [1, 2].forEach((cap) => c.forEach((o) => {
      const ids = (o.pair || [o]).filter((x) => x.id).map((x) => x.l + x.id);
      if (out.length >= 3 || out.includes(o) || (per[o.rule] || 0) >= cap || ids.some((k) => stepsUsed.has(k))) return;
      per[o.rule] = (per[o.rule] || 0) + 1; ids.forEach((k) => stepsUsed.add(k)); out.push(o);
    }));
    out.sort((a, b) => PRI[a.rule] - PRI[b.rule] || a.ord - b.ord);
    // a kind used twice takes the other phrasing the second time
    const seenRule = {}; out.forEach((o) => { o.k = seenRule[o.rule] = (seenRule[o.rule] == null ? 0 : seenRule[o.rule] + 1); });
    return out;
  }
  const marksCount = (mk) => LENSES.reduce((a, l) => a + Object.values(mk[l].steps).reduce((b, x) => b + (x.hard ? 1 : 0) + (x.enj ? 1 : 0) + (x.drained ? 1 : 0) + (x.skipped ? 1 : 0), 0), 0);

  /* ====================================================================================================
     7. Code-drawn figures
     ==================================================================================================== */
  /** FIG. 1: one mark per shared Brief: three short beams (BA · DS · AI), solid when finished, dashed when started. */
  function cohortFig(G) {
    const inG = new Set(G.map((s) => s.n));
    const cell = (s) => {
      const beams = LENSES.map((l, i) => {
        const L = s.L[l], y = 5 + i * 7;
        return L ? `<line class="b ${l}${L.complete ? "" : " part"}" x1="3" y1="${y}" x2="23" y2="${y}"/>` : `<line class="b none" x1="3" y1="${y}" x2="23" y2="${y}"/>`;
      }).join("");
      return `<svg class="sc-stu${inG.has(s.n) ? "" : " out"}" style="--i:${s.n}" viewBox="0 0 26 24" aria-hidden="true">${beams}</svg>`;
    };
    const fin = (l) => cnt(G, (s) => s.L[l] && s.L[l].complete);
    const alt = t(`${G.length} shared Briefs. Finished: BA ${fin("ba")}, DS ${fin("ds")}, AI ${fin("ai")}.`, `${G.length} 份共享小结。做完 BA 的 ${fin("ba")} 人，DS ${fin("ds")} 人，AI ${fin("ai")} 人。`);
    return `<figure class="sc-fig1 ld-panel" aria-label="${esc(alt)}">${MP.h.figCap(t("Fig. 1 · 42 shared Briefs", "图 1 · 42 份共享小结"), false)}
      <div class="sc-stus" role="img" aria-label="${esc(alt)}">${cohort().map(cell).join("")}</div>
      <figcaption class="sc-key"><span><svg viewBox="0 0 22 6" aria-hidden="true"><line class="b ink" x1="1" y1="3" x2="21" y2="3"/></svg>${t("finished", "做完")}</span><span><svg viewBox="0 0 22 6" aria-hidden="true"><line class="b ink part" x1="1" y1="3" x2="21" y2="3"/></svg>${t("started", "开始过")}</span><span class="sc-key-o">${t("BA · DS · AI, top to bottom", "从上到下：BA · DS · AI")}</span></figcaption></figure>`;
  }
  /** FIG. 2: the stuck map. Dot area = share of those who reached the step who got stuck. */
  function stuckFig(M) {
    const groups = LENSES.map((l) => {
      const cells = M.rows.filter((x) => x.l === l).map((x) => {
        const r = x.r >= MIN ? 4 + 21 * Math.sqrt(x.share) : 0;
        const lab = t(`${lensShort(l)} step ${stepNo(l, x.id)}, ${stepShort(l, x.id)}: ${x.s} of the ${x.r} who reached it got stuck.`, `${lensShort(l)} 第 ${stepNo(l, x.id)} 步，${stepShort(l, x.id)}：做到这一步的 ${x.r} 人里，${x.s} 人卡住。`);
        const few = x.r < MIN;
        return `<li class="sc-cell${x.rank ? " top" : ""}${few ? " few" : ""}" data-rd-src="sc-st-${l}-${x.id}" aria-label="${esc(few ? t(`${lensShort(l)} step ${stepNo(l, x.id)}, ${stepShort(l, x.id)}: fewer than 5 reached it.`, `${lensShort(l)} 第 ${stepNo(l, x.id)} 步，${stepShort(l, x.id)}：做到这一步的不到 5 人。`) : lab)}">
          <svg viewBox="0 0 56 56" aria-hidden="true"><circle class="ring" cx="28" cy="28" r="26"/>${few ? "" : `<circle class="dot" cx="28" cy="28" r="${r.toFixed(1)}"/>`}${x.rank ? `<text x="28" y="32.5">${x.rank}</text>` : ""}</svg>
          <span class="sc-cn num">${few ? "–" : `${x.s}<small>/${x.r}</small>`}</span><span class="sc-cs">${esc(brk(stepShort(l, x.id)))}</span></li>`;
      }).join("");
      return `<div class="sc-grp lens-${l}" data-rd-src="sc-st-${l}">${MP.h.lensTag(l)}<ol>${cells}</ol></div>`;
    }).join("");
    return `<figure class="sc-fig2 ld-panel">${MP.h.figCap(t("Fig. 2 · Where students got stuck", "图 2 · 学生卡在哪里"))}<div class="sc-map">${groups}</div>
      <figcaption class="sc-legend">${t("Dot area: share of those who reached the step and marked it hard, needed the second hint, or skipped it. Numbers: got stuck / reached. Ringed 1–3: the steps read below.", "圆点面积：做到这一步、并标了有难度、用了第二级提示或跳过的人所占比例。数字：卡住人数 / 做到人数。标 1–3 的是下面解读的三步。")}</figcaption></figure>`;
  }
  /** One record's marks as three rows of step nodes (static, never AI). */
  const GL = { hard: T("marked hard", "标了有难度"), enj: T("enjoyed", "喜欢"), drained: T("drained", "有点累"), hints2: T("second hint", "第二级提示"), skipped: T("skipped", "跳过"), done: T("done", "完成"), open: T("not reached", "未做到") };
  function marksFig(mk, you) {
    const rows = LENSES.map((l) => {
      const L = mk[l];
      const cells = SID[l].map((id) => {
        const x = L.steps[id];
        const st = !x ? "open" : x.skipped ? "skipped" : x.done ? "done" : "open";
        const tags = x ? ["hard", "enj", "drained", "hints2"].filter((k) => x[k]) : [];
        const label = `${stepShort(l, id)}: ${[MP.t(GL[st])].concat(tags.map((k) => MP.t(GL[k]))).join(", ")}`;
        return `<li class="sc-mk ${st}" data-rd-src="sc-rm-${l}-${id}" title="${esc(label)}"><span class="sr-only">${esc(label)}</span><i class="n" aria-hidden="true"></i><span class="g" aria-hidden="true">${tags.map((k) => `<i class="t-${k}"></i>`).join("")}</span></li>`;
      }).join("");
      const status = !L.tried ? t("Not opened", "未打开") : L.complete ? t("Finished", "已完成") : t(`${L.k} of 5 steps`, `${L.k}/5 步`);
      return `<div class="sc-mrow lens-${l}${L.tried ? "" : " untried"}" data-rd-src="sc-rm-${l}">${MP.h.lensTag(l, { short: true })}<ol aria-label="${esc(lensName(l))}">${cells}</ol><span class="sc-mst">${status}</span></div>`;
    }).join("");
    const key = ["done", "skipped", "hard", "enj", "drained"].concat(you ? [] : ["hints2"]).map((k) => `<span class="k-${k}"><i aria-hidden="true"></i>${MP.t(GL[k])}</span>`).join("");
    return `<div class="sc-marks">${rows}<div class="sc-mkey">${key}</div></div>`;
  }

  /* ====================================================================================================
     8. AI sections (each composed, validated, then handed to the kit)
     ==================================================================================================== */
  function known(extra) { return BASE_KNOWN.concat(extra || []); }
  /** The digest's fingerprint (what decides whether it streams): the filter, the themes found and the wording. */
  function digestFp(G) {
    if (G.length < MIN) return AI().fp(["few", F]);
    const TH = themes(G); if (!TH.length) return AI().fp(["none", F]);
    return AI().fp([F, TH.map((x) => [x.id, x.m]), AI().variant("school.digest", 2, AI().hash(F.bg + "|" + F.stage))]);
  }
  function digest(G, defer) {
    const N = G.length, anim = defer ? false : undefined;
    if (N < MIN) {
      return AI().block({ key: "school.digest", fp: digestFp(G), animate: anim, kind: "ink", unsure: true, live: liveDigest, kicker: t("Cohort digest", "年级摘要"),
        body: T(`Fewer than 5 students in this group, so there's no summary.`, "这一组不到 5 人，不做汇总。") });
    }
    const TH = themes(G);
    const nB = N, nR = G.reduce((a, s) => a + LENSES.filter((l) => s.L[l] && s.L[l].refl).length, 0), nW = G.reduce((a, s) => a + LENSES.filter((l) => s.L[l] && s.L[l].shared).length, 0);
    const v = AI().variant("school.digest", 2, AI().hash(F.bg + "|" + F.stage));
    const nums = [N, nB, nR, nW];
    const paras = TH.map((th) => {
      const D = THEMES[th.id], f = D.facts(G), Q = quotesFor(G, th.id);
      Object.values(f).forEach((x) => { if (typeof x === "number") nums.push(x); }); nums.push(th.m);
      const s = D.say(f, Q.list.length > 0)[v];
      const count = zh() ? `<span class="sc-n"><span class="sc-of">${N} 人中</span><b class="num">${th.m}</b><span class="sc-of">人</span></span>` : `<span class="sc-n"><b class="num">${th.m}</b><span class="sc-of">of ${N}</span></span>`;
      const segs = [{ html: count }, { html: `<span class="sc-tn">${esc(MP.t(THEME_NAME[th.id]))}</span>` }, { text: MP.t(s) }];
      Q.list.forEach((b) => { segs.push({ br: true }, { q: b[MP.lang()], lens: b.lens }); });
      if (Q.more) segs.push({ br: true }, { html: `<button type="button" class="sc-more" data-action="sc-quotes" data-arg="${th.id}" data-fk="sc-quotes:${th.id}"><i aria-hidden="true">↻</i>${t("Show another", "换两条")}</button>` });
      return { segs, cls: th.id };
    });
    if (!paras.length) {
      return AI().block({ key: "school.digest", fp: digestFp(G), animate: anim, kind: "ink", unsure: true, live: liveDigest, kicker: t("Cohort digest", "年级摘要"),
        body: T(`I can't find a theme that 5 or more of these ${N} students share yet.`, `在这 ${N} 位学生里，我还找不到 5 人以上共有的主题。`) });
    }
    const body = paras.map((p) => p.segs);
    const fp = digestFp(G);
    const opts = {
      key: "school.digest", fp, animate: anim, kind: "ink", cap: 3200, live: liveDigest, cls: "sc-digest",
      kicker: t("Cohort digest", "年级摘要"),
      trace: zh() ? [`${nB} 份小结`, `${nR} 条回顾`, `${nW} 份共享交付物`] : [`${nB} Briefs`, `${nR} reflections`, `${nW} shared write-ups`],
      traceDone: t(`Drafted from ${nB} shared Briefs`, `据 ${nB} 份共享小结整理`),
      body,
      actions: AI().actions({ regen: ["sc-digest-regen", ""], count: nth("school.digest"), labels: { regen: T("↻ Another wording", "↻ 换个说法") } }),
      check: { numbers: known(nums), sources: BANK_SRC },
      fallback: `<div class="sc-digest-plain">${paras.map((p) => `<p>${AI().plain(p.segs)}</p>`).join("")}</div>`
    };
    return AI().block(opts);
  }
  function stuckNote(G, M, defer) {
    if (G.length < MIN) return AI().unsure(t("Fewer than 5 students in this group, so there's no summary.", "这一组不到 5 人，不做汇总。"));
    if (!M.top.length) return AI().unsure(t("No step here was reached by 5 or more students who then got stuck, so there's nothing to read yet.", "还没有哪一步有 5 人以上做到又卡住，暂时没有可解读的。"));
    const v = AI().variant("school.stuck", 2, AI().hash("st" + F.bg + F.stage));
    const nums = [], fb = { n: 0 };
    const body = M.top.map((x) => {
      nums.push(x.s, x.r);
      const ex = explain(G, x, fb);
      AI().text.numbers(ex.en).forEach((n) => nums.push(n.v));
      const head = v === 0
        ? T(`${stepShort(x.l, x.id, "en")}: ${x.s} of the ${x.r} who reached it got stuck.`, `${stepShort(x.l, x.id, "zh")}：做到这一步的 ${x.r} 人里，${x.s} 人卡住了。`)
        : T(`${stepShort(x.l, x.id, "en")}: of the ${x.r} who got this far, ${x.s} got stuck.`, `${stepShort(x.l, x.id, "zh")}：走到这里的 ${x.r} 人中，有 ${x.s} 人卡住。`);
      return [{ html: `<span class="sc-rk num">${x.rank}</span>` }, { cite: { lens: x.l, step: x.id, src: "sc-st-" + x.l + "-" + x.id } }, " ", { text: MP.t(head) }, zh() ? "" : " ", { text: MP.t(ex) }];
    });
    return AI().block({
      key: "school.stuck", fp: AI().fp([F, M.top.map((x) => [x.l, x.id, x.s, x.r]), v]), kind: "note", live: false, cap: 2200, animate: defer ? false : undefined,
      kicker: t("Why they got stuck", "为什么卡住"), cls: "sc-stuck",
      trace: M.top.map((x) => ({ label: `${lensShort(x.l)}·${stepNo(x.l, x.id)} ${zh() ? "标记" : "marks"}`, src: "sc-st-" + x.l + "-" + x.id })).concat([zh() ? `${G.length} 份记录里的选择` : `choices in ${G.length} records`]),
      body,
      cites: M.top.map((x) => ({ lens: x.l, step: x.id, go: true })),
      actions: AI().actions({ regen: ["sc-stuck-regen", ""], count: nth("school.stuck") }),
      check: { numbers: known(nums), sources: [] },
      fallback: `<ol class="sc-stuck-plain">${body.map((b) => `<li>${AI().plain(b.filter((s) => !s.cite))}</li>`).join("")}</ol>`
    });
  }
  function questionsNote(G, M, defer) {
    if (G.length < MIN) return AI().unsure(t("Fewer than 5 students in this group, so there's no summary.", "这一组不到 5 人，不做汇总。"));
    const TH = themes(G);
    const v = AI().variant("school.qs", 2, 0);
    const qs = questions(G, M, TH, v);
    lastQs = qs.map((x) => MP.t(x.q));
    const body = qs.map((x, i) => {
      // the question's last few characters ride with the Copy button, so neither ends up alone on a line
      const q = MP.t(x.q), cut = zh() ? Math.max(0, q.length - 3) : Math.max(0, q.lastIndexOf(" ") + 1);
      const copy = `<button type="button" class="sc-copy" data-action="sc-copy" data-arg="${i}" data-fk="sc-copy:${i}" aria-label="${esc(t(`Copy question ${i + 1}`, `复制第 ${i + 1} 个问题`))}">${t("Copy", "复制")}</button>`;
      return [{ html: `<span class="sc-qn num">${pad(i + 1)}</span>` }, " ", { text: q.slice(0, cut) }, { html: `<span class="nowrap">${esc(q.slice(cut))} ${copy}</span>` }];
    });
    const trace = [];
    if (M.top[0]) trace.push({ label: zh() ? `卡点：${stepShort(M.top[0].l, M.top[0].id)}` : `stuck: ${stepShort(M.top[0].l, M.top[0].id)}`, src: "sc-st-" + M.top[0].l + "-" + M.top[0].id });
    TH.slice(0, 2).forEach((th) => trace.push(zh() ? `主题：${MP.t(THEME_NAME[th.id])}` : `theme: ${MP.t(THEME_NAME[th.id]).toLowerCase()}`));
    const cites = []; qs.forEach((x) => { if (x.cite && !cites.some((c) => c.lens === x.cite.lens && c.step === x.cite.step)) cites.push(Object.assign({ go: true }, x.cite)); });
    return AI().block({
      key: "school.qs", fp: AI().fp([F, qs.map((x) => x.q.en), v]), kind: "note", live: false, cap: 2200, animate: defer ? false : undefined,
      kicker: t("Questions to ask", "可以问的问题"), cls: "sc-qs", trace, body, cites: cites.slice(0, 3),
      actions: AI().actions({ regen: ["sc-qs-regen", ""], count: nth("school.qs") }),
      check: { numbers: known(), sources: [] },
      fallback: `<ol class="sc-qs-plain">${qs.map((x) => `<li>${esc(MP.t(x.q))}</li>`).join("")}</ol>`
    });
  }
  function prepNote(rec, mk, defer) {
    const key = "school.prep." + rec;
    const v = AI().variant(key, 2, rec === "you" ? 0 : +rec);
    const O = openers(mk, rec === "you"), mc = marksCount(mk);
    const tried = LENSES.filter((l) => mk[l].tried);
    const trace = tried.map((l) => ({ label: zh() ? `${lensShort(l)} · ${Object.keys(mk[l].steps).length} 步的标记` : `${lensShort(l)} · marks on ${Object.keys(mk[l].steps).length} steps`, src: "sc-rm-" + l }))
      .concat([rec === "you" ? t("marks only, hint use stays private", "只读标记，提示使用不读") : t("marks only", "只读标记")]);
    const nm = (o) => ({ en: stepShort(o.l, o.id, "en"), zh: stepShort(o.l, o.id, "zh") });
    const para = (o) => {
      if (o.pair) {
        const [a, b] = o.pair.map((x) => ({ l: x.l, id: x.id, s: nm(x) }));
        const segs = [{ text: MP.t(OPEN2[o.rule][(v + (o.k || 0)) % 2](a, b)) }];
        o.pair.forEach((x) => segs.push(" ", { cite: { lens: x.l, step: x.id, src: "sc-rm-" + x.l + "-" + x.id } }));
        return segs;
      }
      const q = OPEN[o.rule][(v + (o.k || 0)) % 2](o.id ? nm(o) : null, o.x || {});
      const segs = [{ text: MP.t(q) }];
      if (o.id) segs.push(" ", { cite: { lens: o.l, step: o.id, src: "sc-rm-" + o.l + "-" + o.id } });
      return segs;
    };
    let body, unsure = false;
    if (mc < 2) {
      unsure = true;
      const fin = tried.filter((l) => mk[l].complete).map(lensShort);
      const what = !tried.length ? T("Nothing is marked yet", "目前还没有任何标记")
        : mc === 0 ? T(`${fin.length ? fin.join(" and ") + (fin.length > 1 ? " are" : " is") + " finished" : "A lens is started"}, but no step is marked hard, enjoyed or skipped`, `${fin.length ? fin.join("、") + " 已做完" : "已经开始了一个视角"}，但没有哪一步标了有难度、喜欢或跳过`)
          : T("Only one step carries a mark", "只有一步带着标记");
      body = [[{ text: MP.t([T(`I can't tell much from these marks yet. ${what.en}. One open question instead: which step would you redo, and why?`, `从这些标记里，我还看不出太多。${what.zh}。不如先问一个开放的问题：哪一步你想重做，为什么？`),
        T(`These marks are too thin to read much into. ${what.en}. Better to start open: which step would you redo, and why?`, `这些标记太少，读不出什么。${what.zh}。不如从开放的问题开始：哪一步你想重做，为什么？`)][v]) }]];
      O.filter((o) => o.rule !== "untried").slice(0, 1).forEach((o) => body.push(para(o)));
    } else body = O.map(para);
    return AI().block({
      key, fp: AI().fp([rec, mk, v]), kind: "note", live: true, cap: 1800, unsure, animate: defer ? false : undefined,
      kicker: t("Conversation openers", "开场问题"), cls: "sc-prep", trace, body,
      actions: AI().actions({ regen: ["sc-prep-regen", rec], count: nth(key) }),
      check: { numbers: known(), sources: [] },
      fallback: `<ul class="sc-prep-plain">${body.map((b) => `<li>${esc(AI().plain(b.filter((s) => !s.cite)))}</li>`).join("")}</ul>`
    });
  }

  /* ====================================================================================================
     9. Page
     ==================================================================================================== */
  const PRINT_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 18H4.5A1.5 1.5 0 0 1 3 16.5v-6A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H17"/><path d="M7 14h10v7H7z"/></svg>`;
  const youOK = () => LENSES.some((l) => MP.progress(l).complete);
  /** The 3 shared records offered for 1:1 prep (+ this device). */
  const RECS = ["7", "19", "31"];

  function filters(G) {
    const row = (name, list, cur) => `<div class="sc-frow" role="group" aria-label="${esc(name)}"><span class="ld-label">${name}</span><div class="chips">${MP.h.chip(t("All", "全部"), "sc-filter", list + ":", !cur, { sm: true })}${MP.profileOptions[list].map((o) => MP.h.chip(MP.t(o), "sc-filter", list + ":" + o.id, cur === o.id, { sm: true })).join("")}</div></div>`;
    const on = [F.bg && optLabel("background", F.bg), F.stage && optLabel("stage", F.stage)].filter(Boolean);
    return `<div class="sc-filters no-print">${row(t("Background", "背景"), "background", F.bg)}${row(t("Stage", "阶段"), "stage", F.stage)}
      <p class="sc-showing" role="status">${on.length ? t(`Showing ${G.length} of 42 · ${on.join(" · ")}`, `显示 42 人中的 ${G.length} 人 · ${on.join(" · ")}`) : t("Showing all 42", "显示全部 42 人")}</p></div>`;
  }
  function sec(name, html, defer) { return `<div class="sc-ai" data-sc-sec="${name}"${defer ? ` data-sc-defer="${name}"` : ""}>${html}</div>`; }
  // a below-the-fold section streams when it comes into view (its text is in the DOM, finished, until then)
  function deferOf(name, key, fp) { return AI().motion() && !revealed[name] && !SEEN(key, fp); }

  function prepSection() {
    const you = youOK(); if (REC === "you" && !you) REC = "7";
    const mk = marksOf(REC);
    const chips = RECS.map((n) => MP.h.chip(recName(+n), "sc-rec", n, REC === n, { sm: true })).join("") + (you ? MP.h.chip(t("You (this device)", "你（本设备）"), "sc-rec", "you", REC === "you", { sm: true }) : "");
    const s = REC === "you" ? null : cohort()[+REC - 1];
    const who = REC === "you"
      ? t("Your own marks, as an advisor would see them if you shared your Brief. Hint use, reflections and notes stay private.", "这是你自己的标记，也就是你分享小结后顾问会看到的样子。提示使用、回顾和笔记都不会出现。")
      : t(`${recName(s.n)} · ${optLabel("stage", s.stage)} · ${optLabel("background", s.bg)}. Shared with the advising office.`, `${recName(s.n)} · ${optLabel("stage", s.stage)} · ${optLabel("background", s.bg)}。已分享给顾问办公室。`);
    const v = AI().variant("school.prep." + REC, 2, REC === "you" ? 0 : +REC);
    const defer = deferOf("prep", "school.prep." + REC, AI().fp([REC, mk, v]));
    return `<div class="sc-prep-wrap">
      <div class="sc-recs" role="group" aria-label="${esc(t("Shared Briefs", "共享小结"))}"><span class="ld-label">${t("Shared Brief", "共享小结")}</span><div class="chips">${chips}</div></div>
      ${you ? "" : `<p class="sc-you-note">${t("Finish a lens and your own record appears here too.", "做完一个视角，你自己的记录也会出现在这里。")}</p>`}
      <div class="sc-prep-grid"><div class="sc-rec ld-panel"><p class="sc-who">${who}</p>${marksFig(mk, REC === "you")}</div>
      ${sec("prep", prepNote(REC, mk, defer), defer)}</div></div>`;
  }

  MP.pages.school = {
    render() {
      if (!MP.ai) return `<div class="container page"><p class="lede">${t("Loading…", "加载中…")}</p></div>`;
      const G = filtered(), M = stuckMap(G), TH = themes(G);
      const vS = AI().variant("school.stuck", 2, AI().hash("st" + F.bg + F.stage)), vQ = AI().variant("school.qs", 2, 0);
      const dD = deferOf("digest", "school.digest", digestFp(G));
      const dS = G.length >= MIN && M.top.length && deferOf("stuck", "school.stuck", AI().fp([F, M.top.map((x) => [x.l, x.id, x.s, x.r]), vS]));
      const dQ = G.length >= MIN && deferOf("qs", "school.qs", AI().fp([F, questions(G, M, TH, vQ).map((x) => x.q.en), vQ]));
      const html = `<div class="pg-school">
        <div class="container sc-top">
          <div class="sc-bar no-print">${MP.h.quiet("← " + t("Student view", "学生视图"), "go", "#/home")}<span class="ld-spacer"></span>${MP.h.primary(PRINT_ICON + t("Export advising notes", "导出咨询笔记"), "sc-print", "", { sm: true, fk: "sc-print" })}</div>
          <header class="sc-head">
            <div class="sc-head-l">
              <span class="eyebrow">${t("Program view · Spring advising cohort", "项目方视图 · 春季咨询年级")}</span>
              <h1 class="display sc-title">${t(`What <span class="num">42</span> students found when they <span class="it">tried</span> the work`, `<span class="num">42</span> 位学生​试做之后的发现`)}</h1>
              <p class="stand sc-stand">${t("Students chose to share their Briefs with the advising office. This page reads them together: what came up, where people got stuck, and what to ask next.", "学生自愿把小结分享给顾问办公室。这一页把它们放在一起读：大家提到了什么、在哪里卡住了、接下来可以问什么。")}</p>
              <span class="ld-pill sc-pill">${t("42 fictional students · Teaching data", "42 位虚构学生 · 教学数据")}</span>
              ${filters(G)}
            </div>
            ${cohortFig(G)}
          </header>
        </div>
        <section class="ink-band sc-band" aria-labelledby="sc-h1"><div class="container">
          ${MP.h.chapter("01", t("What came up", "大家提到了什么"), t("Cohort digest", "年级摘要"), { id: "sc-h1", cls: "h2" })}
          <div class="sc-digest-wrap"${dD ? ' data-sc-defer="digest"' : ""}>${digest(G, dD)}</div>
          ${G.length >= MIN ? `<p class="sc-dnote">${t("Each large number counts the students whose marks or reflections touch that theme; one student can appear under more than one.", "每个大数字，是标记或回顾里涉及这一主题的人数；同一位学生可能同时算在几个主题里。")}</p>` : ""}
        </div></section>
        <div class="container sc-rest">
          <section class="sc-sec" aria-labelledby="sc-h2">
            ${MP.h.chapter("02", t("Stuck points", "卡点"), t("Where students got stuck", "学生卡在哪里"), { id: "sc-h2", cls: "h2", aside: t("Counts always carry their denominator: only students who reached a step count toward it.", "每个数字都带着分母：只有做到这一步的学生才计入。") })}
            ${G.length >= MIN ? stuckFig(M) : ""}
            ${sec("stuck", stuckNote(G, M, dS), dS)}
          </section>
          <section class="sc-sec" aria-labelledby="sc-h3">
            ${MP.h.chapter("03", t("For group sessions", "小组咨询"), t("Questions for advising sessions", "咨询时可以问的问题"), { id: "sc-h3", cls: "h2", aside: t("Drafted from where this group got stuck and what they wrote about. Copy any into your session notes.", "根据这一组的卡点和他们写下的内容起草。可以复制到你的咨询笔记里。") })}
            ${sec("qs", questionsNote(G, M, dQ), dQ)}
          </section>
          <section class="sc-sec" aria-labelledby="sc-h4">
            ${MP.h.chapter("04", t("One-to-one", "一对一"), t("1:1 prep", "一对一准备"), { id: "sc-h4", cls: "h2", aside: t("Pick a Brief a student shared. The openers come from their marks only: enjoyed, hard, second hint, skipped.", "选一份学生分享的小结。开场问题只根据标记生成：喜欢、有难度、第二级提示、跳过。") })}
            ${prepSection()}
          </section>
          <aside class="sc-never"><span class="ld-label">${t("What this view never shows", "这一页不会出现的")}</span><p>${t("No student rankings or scores. Groups smaller than 5 aren't summarised. Students choose what to share.", "不给学生排名，也不打分。少于 5 人的小组不做汇总。分享什么由学生自己决定。")}</p></aside>
        </div></div>`;
      liveDigest = false;
      return html;
    },
    mount(root) {
      const sw = swapped; swapped = "";
      if (sw) { requestAnimationFrame(() => { const p = root.querySelector(`.sc-digest .sc-more[data-arg="${sw}"]`); if (p) { const para = p.closest(".rd-p"); if (para) { para.classList.add("sc-swapped"); setTimeout(() => para.classList.remove("sc-swapped"), 700); } } }); }
      const els = root.querySelectorAll("[data-sc-defer]");
      if (!els.length || !("IntersectionObserver" in window)) return;
      const io = new IntersectionObserver((ents) => ents.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target, name = el.dataset.scDefer; io.unobserve(el);
        if (!el.isConnected || revealed[name]) return;
        revealed[name] = true;
        const G = filtered(), M = stuckMap(G);
        const html = name === "digest" ? digest(G, false) : name === "stuck" ? stuckNote(G, M, false) : name === "qs" ? questionsNote(G, M, false) : prepNote(REC, marksOf(REC), false);
        el.removeAttribute("data-sc-defer");
        el.innerHTML = html;
        AI().after(el);
      }), { threshold: 0, rootMargin: "0px 0px 140px 0px" });   // swap just BEFORE it scrolls in, so finished text never blanks and restarts in view
      els.forEach((el) => io.observe(el));
    }
  };

  /* ---------- actions ---------- */
  MP.on("sc-filter", (el, arg) => {
    const [k, v] = String(arg).split(":");
    if (k === "background") F.bg = F.bg === v ? "" : v; else F.stage = F.stage === v ? "" : v;
    liveDigest = true; revealed.digest = false; revealed.stuck = false; revealed.qs = false;
    MP.commit();
  });
  MP.on("sc-rec", (el, arg) => { REC = String(arg); revealed.prep = true; MP.commit(); });
  MP.on("sc-quotes", (el, tag) => { AI().bump("school.q." + tag); swapped = tag; revealed.digest = true; MP.commit(); });
  MP.on("sc-digest-regen", () => { AI().bump("school.digest"); liveDigest = true; revealed.digest = true; MP.commit(); });
  MP.on("sc-stuck-regen", () => { AI().bump("school.stuck"); revealed.stuck = true; MP.commit(); });
  MP.on("sc-qs-regen", () => { AI().bump("school.qs"); revealed.qs = true; MP.commit(); });
  MP.on("sc-prep-regen", (el, rec) => { AI().bump("school.prep." + rec); revealed.prep = true; MP.commit(); });
  MP.on("sc-print", () => { if (AI()) AI().completeAll(); window.print(); });
  MP.on("sc-copy", (el, i) => {
    const txt = lastQs[+i]; if (!txt) return;
    const ok = () => MP.toast(t("Copied to the clipboard", "已复制到剪贴板"), 1800);
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => MP.toast(esc(txt), 5000)); else MP.toast(esc(txt), 5000); } catch (e) { MP.toast(esc(txt), 5000); }
  });

  /* test hook (read-only): lets the screenshot tool print what the composer produced for a profile */
  MP.pages.school._debug = { cohort, filtered, themes, stuckMap, openers, marksOf, F };
})();
