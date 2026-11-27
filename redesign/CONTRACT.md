# MajorPilot redesign — build contract

> Working contract used while building the prototype. The "owners" in §3 are module areas, not people.

A clickable, high-fidelity redesign of the MajorPilot student product (https://github.com/powerpan/MajorPilot; this prototype lives in its `redesign/` folder). It keeps the MajorPilot brand and addresses usability problems found in a UX review of the current student flow (summarised in §1). Vanilla HTML/CSS/JS, no build step, served at **http://localhost:8790** (`python3 tools/serve.py 8790` from this folder — threaded, no-cache; plain `python3 -m http.server` drops requests under parallel screenshots).

## 1. What this redesign must fix (the brief for every builder)

The current product looks great on the marketing page but feels like a compliance form inside. Fix that while keeping the brand and the honesty.

1. **Value before cost.** No 12-question intake or sign-up before the student sees real work. Home has a 2-question Quick Start inline; an account is optional ("Save my progress"), never a gate.
2. **One problem, three lenses — for real.** Every lens works on the same fictional LumenLearn problem (28-day completion fell from 27% to ~20%), using the shared numbers in `js/data.js`. The lenses connect: BA finds where the funnel leaks, DS checks whether the drop is real or mix, AI finds why stuck learners' help requests get misrouted.
3. **Do the work in the browser.** Interactive tables, charts, sliders and choices — no Excel round-trip. Data download (CSV) is an optional "go deeper".
4. **Feedback inside the step.** After a choice, the "What practitioners weigh" reveal appears immediately. Never a grade, never "correct/incorrect" in red — but concept traps are named kindly as "A common trap".
5. **Leaving is never blocked.** "Save & leave" always works; unfinished steps can be skipped. (Core already does this — don't add validation that blocks navigation.)
6. **The report becomes a one-page Brief**: "In short" (3 lines) first, then folded sections, small evidence marks (`MP.h.ev`) instead of row labels, ONE "What this can't tell you" section, no internal ids/versions, no repeated boilerplate.
7. **Comparison shows only what there's evidence for**; rows with no evidence collapse into one line.
8. **Clear hierarchy**: one primary (black) button per screen; dashboard leads with a single "Next step"; profile is a small row of tags.
9. **English-first with a full 中文 toggle.** Every user-visible string must exist in both `en` (natural American English, plain words for newcomers) and `zh` (natural Simplified Chinese, not machine-literal). No mixing languages on one screen except proper names (LumenLearn, AI/DS/BA) and the glossary's alternate-language line.
10. **Honest and calm.** No fit scores, no admission talk, no "you're good at". Copy is warm, short, specific. Avoid pressure words ("must", "required", countdowns).

## 2. Brand & visual rules

- Sliders: `<input type="range" class="mp-range">` inside a `.lens-xx` container gets the shared look (4px track, 18px white thumb, lens-colored ring and fill, keyboard focus ring, disabled state). Add `no-fill` when a fill would mislead (e.g. a `dir="rtl"` slider). Core keeps `--fill` in sync on input/change/render; call `MP.rangeFill(el)` after setting `.value` from code. Don't restyle the track/thumb in lens CSS.
- Lens questions (`MP.lensInfo[id].question`) carry `class="lens-q"` wherever they are shown; in zh that gives keep-all + balance so lines break only at punctuation or `\u200b` phrase hints. Use `\u200b` hints in long zh headings too. Short utility: `.nowrap`.
- Use the tokens/components in `css/tokens.css` (paper `#f7f5ee`, ink `#171a1d`, blue `#304ffe`, orange `#f45b35`; lens colors `--ai` vermilion, `--ds` blue, `--ba` ochre; serif headings, Inter body, numerals in Newsreader).
- **Pitch design system ("Living data") — see §8 for every token, class and helper.** The shared problem is the hero: visuals are drawn in code from `MP.data`; generous whitespace, hairlines, big serif headings, mono instrument labels, numbered chapters. Not a dashboard of boxes.
- Primary CTA = `MP.h.primary(...)` (black, colored edge, round arrow). At most ONE per screen. Everything else: `MP.h.secondary`, `MP.h.link`, `MP.h.quiet`.
- Artwork: prefer code-drawn visuals (`MP.draw.*`).
- Charts: hand-built inline SVG (no libraries). Thin lines, ink + lens color, labeled directly (no legends when avoidable), tabular numerals. Give every chart a text alternative (`role="img"` + `aria-label`).
- Responsive down to 390px wide; no horizontal page scroll (tables may scroll inside `.tbl-wrap`).
- Motion: see §8.6. Base styles are always the final visible state; intros run only under `#view.enter`. Reduced motion is handled globally.

## 3. File ownership (edit ONLY your files)

| Owner | Files |
|---|---|
| core (lead) | `index.html`, `css/tokens.css`, `js/core.js`, `js/data.js`, `CONTRACT.md`, `AI-LAYER.md`, `js/ai-kit.js` (the `MP.ai` kit, loads after core.js), `css/ai-kit.css` (`.rd-*`, loads after tokens.css) — see §9 |
| front | `js/pages/home.js`, `js/pages/explore.js`, `css/front.css` |
| progress | `js/pages/dashboard.js`, `css/dashboard.css` |
| brief | `js/pages/brief.js`, `js/pages/compare.js`, `css/brief.css` |
| ba | `js/lenses/ba.js`, `css/ba.css` |
| ds | `js/lenses/ds.js`, `css/ds.css` |
| ai | `js/lenses/ai.js`, `css/ai.css` |
| school | `js/pages/school.js` (new), `css/school.css` (new): the `#/school` Program view (see AI-LAYER.md AI-8) |

If you need a core change, don't make it — list it under `coreRequests` in your final output. Scope your CSS selectors (`.pg-home …`, `.ba-…`) so files can't collide.

## 4. Core API (js/core.js)

(The pitch design system's helpers — `MP.live`, `MP.draw.*`, `MP.h.figCap/readout/chapter/glyphBox`, `MP.countUp`, `MP.firstVisit`, `MP.replay` — are documented in §8.)

- `MP.state` (persisted). `MP.save()` saves; `MP.commit()` saves + re-renders (keeps scroll and focus via `data-fk`). `MP.render({top:true})`.
- `MP.t({en,zh})` → string in current language; `MP.fmt(x)` = t + glossary markup `[[id]]`/`[[id|label]]` (ids in `MP.glossary`). `MP.ui(key, vars)` for shared UI words. `MP.lang()` → "en"|"zh".
- `MP.n(x, digits)`, `MP.pct(fraction, digits)` locale-aware.
- `MP.go("#/route")`. Routes: `#/home`, `#/explore`, `#/dashboard`, `#/brief`, `#/compare`, `#/lens/<id>`, `#/lens/<id>/<stepId>`, `#/lens/<id>/done`.
- Events: put `data-action="name" data-arg="..."` on clickable elements and register `MP.on("name", (el, arg, ev) => {...})`. For inputs: `data-input="name"` (fires on input) or `data-change="name"` (fires on change) with `MP.onInput("name", (el, ev) => {...})`. Namespace your action names (`ba-pick`, `home-field`…). For live sliders/typing, update the DOM directly + `MP.save()`; don't re-render on every keystroke.
- Components `MP.h.*`: `primary(label, action, arg, {lens, sm, disabled, fk})`, `secondary`, `link`, `quiet`, `chip(label, action, arg, pressed, {sm, dot})`, `option(label, sub, action, arg, pressed, {multi, disabled, cls})`, `seg([[value,label]...], action, value)`, `notice(html, kind)`, `ev(kind)` evidence mark (`did`|`said`|`src`|`limit`), `stat(k, v, s)`, `fold(key, summaryHtml, bodyHtml, {open, boxed})`, `lensTag(id)`, `field(id, label, value, {optional, input, arg, rows, placeholder})`, `esc`.
- `MP.toast(html, ms)`, `MP.modal(html)`, `MP.closeModal()`.
- Lens helpers: `MP.ls(id)` lens state, `MP.st(lensId, stepId)` step state, `MP.lensSteps(id)` (your steps + core "reflect"), `MP.nextStep()` → `{lens, step, resume}`, `MP.nextLens(exclude)`, `MP.firstOpenStep(id)` (first step not done: where "Back to a skipped step" goes).
- `MP.progress(id)` → `{done, total, contentDone, contentTotal, contentSkipped, needed, skipped, substantive, started, skimmed, complete}`. `done/total/skipped` count every step incl. Reflect; the `content*` fields count only the lens's own 5 steps. A lens is **complete** only when finished with at least `MP.SUBSTANTIVE` (3) content steps done; finishing after skipping instead sets **skimmed** ("Looked through", nothing handed in; `needed` = content steps still to do). All looked-through copy uses the content basis ("1 of 5 steps done · 4 skipped", "Doing 3 of its 5 steps…") and the one CTA label `MP.ui("backToSkipped")` ("Back to a skipped step" / 回到跳过的步骤).
- AI layer state (core seeds the defaults; older saved states are normalized on load): `MP.state.ai = {seen, regen, fb, prefs: {tone, length}, dash: {shown, hidden}}`, `MP.state.brief.ai = {left, regen, hidden}`, per step `st.ask` (+ `askOpen`, `askN`), per lens `ls.refl.follow`. The kit is `MP.ai` (§9).
- Shared copy: `MP.data` (scenario numbers), `MP.lensInfo[id]` (name, question, oneLine, handIn, done, minutes), `MP.glossary`, `MP.lensOrder`.
- `MP.profileOptions` (data.js): shared ids + labels for the optional profile (stage, background, regions). `MP.data.cohortCadence`: one cohort per week.
- Presets for testing: `/?preset=sample#/...` loads a sample student (BA + DS complete, AI 3 steps in); `/?preset=fresh#/...` clears; add `&lang=zh` for Chinese.

## 5. Lens contract (js/lenses/<id>.js)

```js
MP.lenses.ba = {
  id: "ba",
  steps: [ /* Step objects, in order; core appends a "reflect" step and a "done" screen */ ],
  download: { file: "lumenlearn-funnel.csv", href: () => "data:text/csv;charset=utf-8," + encodeURIComponent(csv) }, // optional
  mount(root, ls) {},          // optional, after each render of this lens (e.g. attach slider listeners)
  summary(ls) { return {
    did: {en, zh},             // one sentence, built from the student's actual choices
    move: {en, zh},            // short "your main move" for the comparison table
    artifact: { title: {en, zh}, html: "<...>" },   // the deliverable they produced, rendered in the current language
    facts: [ { kind: "did"|"said"|"limit", text: "<localized html>" } ]  // 2–4 for the Brief
  }; },
  sample(ls) { /* fill ls.data, ls.steps[...] (done/energy/hard/hints), ls.refl, ls.startedAt, ls.completedAt (omit for an unfinished lens) */ }
};
```

Step object:

```js
{ id: "funnel", title: {en, zh}, short: {en, zh},    // short label for the rail
  lead: {en, zh},                                     // 1–2 sentences, may use [[glossary]]
  render(ls, lang) { return "<div class='work'>…</div>"; },  // the interactive work area (one or more .work cards)
  ready(ls) { return Boolean },                       // main action done → Continue enabled, reveal + feeling check appear
  reveal(ls) { return { title?, your?: {en,zh}|string, points: [{en,zh}...], trap?: bool } },  // shown once ready
  hints: [ {en,zh}, {en,zh}, {en,zh} ],               // nudge → pointer → worked example
  feel: true,                                         // show "How did that feel?" (default true)
  shows: {en, zh},                                    // field-level: where this kind of work shows up in master's courses (no university names)
  ask: { seen, trace?, chips, term? }                 // optional: the "Ask about this step" card (§9.5)
}
```

Rules: each lens has **5 content steps** (+ core reflect), ~15 minutes total. Step 1 must be answerable in under a minute. Every step's `ready` is reachable through the UI. The final content step is a short write-up: 2 visible boxes + the rest in an optional fold, a "Use sentence starters" helper that fills empty boxes from the student's own earlier choices, and a fold comparing with a practitioner's version (labeled as a teaching example). Numbers come from `MP.data` — compute, don't hardcode where possible.

### BA lens — "Which step should LumenLearn fix first — and how will we know it worked?"
1. `ratio` — Read the ratio. Mini example: 100 signed up, 80 started, 40 completed. Ask what 40÷100 and 40÷80 each answer (two quick choice rows of 3 options each). Reveal: the denominator decides the question; earlier vs recent are *different people* (cohorts), not the same people getting worse.
2. `funnel` — Walk the funnel: an interactive funnel for Earlier vs Recent (from `MP.data.funnel`) with step-to-step conversion; student clicks the transition they'd fix first and picks 1–2 reason chips (biggest % drop, most people lost, easiest to change, closest to the goal). Show people lost per transition. The intended insight: "Active in week 1 → Started an assignment" fell 75% → 62.5% (1,228 recent learners didn't continue at that step; had the earlier 75% held, ≈409 more would have started an assignment, ≈246 more completions); other answers can be defensible — reveal says what practitioners weigh (size × change × fixability).
3. `missing` — Before acting, what would you check? Multi-select (who signed up/channel mix → DS lens; whether stuck learners got help → AI lens; course type; seasonality; recent product changes). Reveal connects to the other lenses (this is where "one problem, three lenses" clicks).
4. `test` — Design a small test: pick an action for the assignment step (kick-off email + 15-min office hours / extend deadlines / redesign week-1 content), choose a [[guardrail]] metric, set the hoped-for lift with a slider (start-assignment rate 62.5% → target), and see "learners needed per group" (simple, plainly labeled rule-of-thumb) and expected extra completions/month. Reveal: test before rollout; guardrail; keep the change small enough to learn from.
5. `memo` — One-page recommendation (Recommendation · Why · Risk · What we'll measure) → artifact.

### DS lens — "Is the drop real — or did the mix of learners change?"
1. `claim` — Overall 27.0% → 20.5%. "What could make this number misleading?" (choose 1–2: different kinds of learners signed up; small groups bounce around; definition of 'completed' changed; nothing, it's clear). Reveal.
2. `trend` — Cohort chart: completion rate for cohorts 1–12 with partner-share line (`MP.data.cohorts`); toggle "show expected wobble" (±~2.6 pts band for n≈1,000: 1.96·√(p(1−p)/n)); question: is cohort 11's dip (19.0%) something to chase? Reveal: within the noise; the step change after cohort 6 is not.
3. `split` — Split by channel (`MP.data.channels`): earlier vs recent for Found-us-directly 30%→27% and Partner 18%→14%; a "what if the recent mix matched the earlier mix?" slider/toggle shows 20.5% → 23.75% (`MP.data.reweighted`). Insight: about half the 6.5-pt drop is [[mix]], half is real within both groups. Mark as "A common trap" if they had claimed nothing/one-cause earlier? (Use `trap:true` only if their step-1 answer was "nothing, it's clear".)
4. `conclude` — How strong a conclusion can we make? Pick one statement (a: course got worse; b: part mix, part real drop in both groups — and we can't yet say why; c: no real change). Then pick the next check (look at the funnel step where it fell — links to BA; check help requests — links to AI). Reveal.
5. `summary` — Evidence summary (What we found · How sure · What's still unknown · Don't use it to…) → artifact.

### AI lens — "Why does the help router send stuck learners to the wrong team?"
1. `numbers` — Read the router's results (`MP.data.router.baseline`): 200 messages, 150 handled automatically, 123 of those correct, 50 sent to a person. Two quick picks: what is 123/150 (accuracy of what it handled: 82%) and what is 150/200 (coverage: 75%). Reveal: two different denominators; humans still handle 50.
2. `errors` — Read 8 messages (`MP.data.misrouted`) as cards showing predicted → should be. Student tags the pattern they see (choices: content questions with words like "error"/"doesn't work" sent to Tech support; billing vs account mix-ups; random). Must cite at least 2 messages (tap to select). Reveal: content→tech is the biggest error group (15 of 27) and it hits learners stuck on assignments — connects to BA's leak.
3. `change` — Change ONE thing: add 10 content examples / raise the [[threshold]] 0.60→0.75 / rewrite category definitions. First predict (what will improve, what might get worse), then "Run on the same 200 messages" → before/after table (auto-handled, accuracy, sent to humans, content→tech errors) from `MP.data.router.options`. Reveal: trade-offs (examples: fewer content→tech, new tech→content errors appear 4→7; threshold: higher accuracy but +32 messages for humans; definitions: small gain).
4. `tradeoff` — New situation check: Plan A handles 100 messages and gets 81 right; Plan B handles 60 and gets 57 right. "Is B better?" (yes / no / depends — explain with chips: accuracy vs coverage vs human workload). Reveal: depends on goals and staff; never claim significance from one fixed set.
5. `note` — Model-change note (What I changed · What improved · What it cost · What I'd watch next) → artifact.

## 6. Page specs

**home** (`#/home`) — as built for the pitch: hero headline + the Living-data figure + Quick Start (lens-colour slab result; a returning student sees Welcome back, and the hero lights the beam that panel's primary points at); facts strip (1 problem · 3 lenses · ~15 min · 0 fit scores); the ink "shared problem" band with the pull numbers and Fig. 2, the DS *bridge* (27.0 → −3.25 mix → −3.25 real → 20.5, from `MP.data.channels`/`reweighted`) so the band adds information the hero line doesn't show; three glyph-topped lens columns; Look · Try · Keep + the Brief preview; the ink trust close. Original spec: hero with their artwork + headline ("See the work before you choose the degree." / "别只看专业介绍，先试试你会做什么。") + an inline Quick Start card: Q1 fields (AI/DS/BA/Not sure, up to 3), Q2 "What do you most want to find out?" (What's the actual difference / What would I do day to day / Can I keep up / What should I prepare). As soon as Q1 has an answer, show "Start here: <lens>" with a one-line *reason* and the primary CTA (go to that lens), plus a link "See all three lenses first" (→ explore). Set `MP.state.recommended`. Rule: DS+BA → BA first unless background is technical; AI chosen → AI; Not sure → explore. Below the hero: "One problem, three lenses" strip (LumenLearn situation, three lens cards with their question and what you'd hand in), "How it works" in 3 calm steps (Look · Try · Keep, no minute counts in big type), trust line ("No fit scores. No admission predictions. You decide."). Optional "Tell us a bit more" fold (stage, background, regions incl. U.S.) — never required.

**explore** (`#/explore`): the shared situation (LumenLearn chart of completion 27%→20.5%), then three lens columns side by side: question, what you'd actually do (3 bullets), what you hand in (a mini document preview labeled "Teaching example"), what "done" means, time (about 15 min · stop anytime), and a secondary "Start" per lens. One primary CTA = recommended lens. Then "Where they overlap" band. Then a short honesty note (field-level explanation; programs differ; LumenLearn is fictional).

**dashboard** (`#/dashboard`, "My progress"): (1) Next step hero card (resume lens/step or start recommended), (2) three-lens progress map (step dots, status, last feeling, small "Start/Continue/Review" secondary actions), (3) "Your Brief" card — locked state before any lens is complete ("Finish one lens to unlock your Brief") or a preview with counts + link, (4) Compare card (needs 2 complete lenses), (5) profile as a row of small tags with "Edit" (opens a modal/fold with the optional questions), (6) optional "Save my progress" prompt if no account. Empty states must look intentional, not like missing content.

**brief** (`#/brief`, "My Brief"): a one-page document. Header (title, date, lenses covered). **In short**: 3 bullets built from the data (what you did; what stood out — reflection/feelings; one next step). Then sections (folded after 3 lines each with "Show N more"): What you did (per lens, from `summary().facts`, with `MP.h.ev` marks) · What stood out to you (feelings & reflections, in their words) · What this suggests about the work (field-level, from step `shows`) · What this can't tell you (ONE section, 3–4 lines, no repetition) · Next steps (prep, questions to ask programs, try the next lens). View switch: My Brief / Advisor view (hides private items like hint use) / Family view (simpler, third person). Print button. If no lens is complete: a friendly materials-only state with CTA.

**compare** (`#/compare`): needs ≥2 complete lenses (else an intentional locked state). Side-by-side columns per completed lens: the question, your main move (`summary().move`), what you handed in, what you enjoyed / found hard (from feelings), what "done" means. Only rows with evidence; any empty dimension collapses into one line "Not enough yet to compare: …". Bottom: "Where they overlap" and next step (try the remaining lens).

## 7. Quality bar & testing

- Before finishing, run the screenshot tool on every route/step you own in **en at 1440px**, **zh at 1440px**, and **en at 390px**; Read the PNGs and fix what looks off (alignment, wrapping, overflow, empty-looking areas, awkward Chinese line breaks, contrast). Example:
  `node tools/shot.mjs shots/<name>.png "/?preset=sample#/lens/ba/funnel" 1440`
  `node tools/shot.mjs shots/<name>.png "/?preset=fresh&lang=zh#/home" 1440 --click='[data-action="home-field"][data-arg="ds"]'`
  The tool prints page errors, failed loads and horizontal overflow — there must be none.
  More flags (see the header of `tools/shot.mjs`): `--max-height=<px>` (full-page cap, default 4000; taller captures are stitched), `--drag=<sel>:<from|thumb>:<to>` / `--touchdrag=…` (real mouse/touch slider drags; fractions of the value range), `--focus=<sel>` + `--key=<Tab|ArrowRight|…>` (real key presses, for `:focus-visible`), `--wait=<ms>`, `--eval=<js>`. Actions run in the order given, then wait, then evals.
  `tools/sweep.sh [outdir] [filter]` shoots every route (fresh + sample × en 1440 / zh 1440 / en 390); `tools/tile.sh` and `tools/sheet.sh` lay tall shots out for review.
- Also check the interactive path: with `?preset=fresh`, each step's `ready` becomes true by clicking through (`--click=` lets you simulate clicks).
- Accessibility: buttons are buttons, inputs have labels, charts have text alternatives, focus is visible, color isn't the only signal.
- No external libraries. No real university names or fabricated program claims. Keep everything in the fictional LumenLearn frame.

## 8. Pitch design system ("Living data")

This prototype is used to pitch investors: it must catch the eye in the first 10 seconds and stay beautiful through a 5-minute live demo, while reading as a calm, trustworthy product for students. Direction: **the shared problem is the hero.** Every visual is drawn in code (inline SVG) from `MP.data`, so the picture explains the product. All of §8 lives in `css/tokens.css` + `js/core.js`; page/lens CSS builds on it and must not redefine it.

### 8.1 Tokens (`:root` in css/tokens.css)

| Group | Tokens |
|---|---|
| Brand | `--paper #f7f5ee` `--paper-2` `--paper-3` `--card` `--ink #171a1d` `--ink-2` `--muted #66696f` (5.0:1) `--faint #6b6e73` (4.7:1, the lightest text colour allowed) `--line` `--line-2` `--blue #304ffe` `--blue-ink` `--blue-soft` `--orange #f45b35` (text only ≥ 24px; small orange text uses `--ai-ink`) `--orange-soft` |
| Hairlines & data surfaces | `--hair rgba(23,26,29,.14)` = THE border colour · `--tick` (corner ticks) · `--grid-dot` (18px dot grid) |
| Lenses (order always BA · DS · AI) | `--ba #b7791f` `--ds #304ffe` `--ai #f45b35`, each with `-soft`, `-ink` (small text on paper) and `-on-ink` (`#d9a24c` / `#93a3ff` / `#ff7d57`, text on ink) · glows `--glow-ba/-ds/-ai` |
| Current lens | `.lens-ba/.lens-ds/.lens-ai` set `--lens` `--lens-ink` `--lens-on-ink` `--lens-glow` `--lens-soft` `--lens-fg` (text/check colour ON a lens fill: ink on BA/AI, white on DS). Use these in shared-looking pieces instead of hard-coding a lens. |
| Ink | `--on-ink #f3f1ea` · `--on-ink-2 #b4b3ac` (8.3:1, body text on ink never lighter) · `--on-ink-line` |
| Families | `--serif` (Newsreader; zh: Noto Serif SC first) · `--sans` (Inter/PingFang) · `--mono` (IBM Plex Mono) · `--num` (Newsreader ONLY: numerals never fall back to Noto in zh) · `--label-font` (mono in en, sans in zh) |
| Type scale | `--fs-hero clamp(52,6vw,88)` (home headline only) · `--fs-display clamp(42,4.6vw,68)` · `--fs-h1 clamp(32,3.4vw,46)` · `--fs-h2 clamp(25,2.3vw,31)` · `--fs-h3 21` · `--fs-stand clamp(19,1.6vw,22)` (serif standfirst) · `--fs-lede 19` · `--fs-body 16` · `--fs-small 14` · `--fs-label 13` (mono labels — never smaller on screen) · `--fs-readout clamp(48,5vw,72)` · `--fs-pull clamp(76,13vw,200)` · `--fs-step-no clamp(76,8.6vw,132)`. zh overrides `--fs-hero/-display/-h1/-h2/-stand` to ~75–80%. |
| Spacing | `--s1…--s9` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 · 112 |
| Radii | `--r-btn 2` · `--r-panel 3` (instrument panels, so ticks register on true corners) · `--r-sm 4` · `--r 8` · `--r-lg 12` · `--r-xl 16` |
| Shadows | `--shadow-1` (resting card) · `--shadow-2` (lifted) · `--shadow-float` (dock, modal, floating Quick Start/Brief card) · `--hi` (inset top highlight) |
| Motion | `--ease-out` (arrivals) · `--ease-draw` (lines) · `--ease` · `--t-fast .18s` `--t-mid .45s` `--t-slow .9s` · `--clock` (set on `<html>` by core every render = −seconds since page load; use as `animation-delay: var(--clock)` for idle loops so re-renders never make them jump) |

### 8.2 Type & label classes

- `.display` (uses `--fs-display`), `.h1` `.h2` `.h3` `.h4`, `.lede`, `.stand` (serif standfirst), `.it` (italic Newsreader 300 accent, en only — upright in zh), `.num` / `.ld-num` (Newsreader, lining + tabular), `.big-num`, `.small`, `.tiny` (13px), `.muted`, `.faint`, `.nowrap`, `.lens-q`.
- **`.eyebrow` and `.ld-label` are now the mono "instrument" voice** (13px, uppercase, .1em; zh: sans 13.5px). Every chart carries one as its caption. Keep them short; they are labels, not sentences.
- zh display type: weight 700, letter-spacing 0, `palt`, keep-all + `​` phrase hints. Numbers inside zh headings: wrap them in `.num` so they stay Newsreader.

### 8.3 Components (shared classes)

- **Header**: hairline bottom border always; active nav item has a 2px underline in three lens segments (grows from left; hover previews 34%).
- **Footer**: the ink colophon on every page — large serif MajorPilot wordmark, the split-mark sparkline (`MP.draw.colophonMark()`) and the computed dataset line ("12 cohorts · 10,800 signups · 200 help messages", `--on-ink-2` 15px), then the fictional-data line and sample/reset (no internal "prototype" wording, with ONE exception: the AI disclosure line "AI responses in this prototype are simulated." / "本原型中的 AI 回复为模拟生成。", always present in both the full and compact colophon; see §9). On work screens (`#/lens/*`) core renders a **compact** one-row colophon (28px wordmark, sparkline, dataset line) so it never competes with the task. Pages don't add their own footer. Because the page ends on ink, a page's own last section should end on paper or be the ink trust close (then it runs straight into the colophon).
- **Buttons**: `MP.h.primary` — black, coloured left edge (6px → 9px on hover), round arrow with a 4px tinted halo (5px lens glow on hover), inset top highlight, 1px lift on hover, 2px blue outline + 7px halo on focus. Exactly ONE per screen. `lens:` option colours edge + arrow. On ink (`.ink-band`/`.on-ink`) it automatically lifts to a graphite body `#2a2e34` with a paper ring at .5 alpha (≥3:1 against the ink), keeping the lens edge and arrow. On a lens-colour slab (home Quick Start) the arrow disc turns paper with an ink arrow. `MP.h.secondary` (2px radius, ink border), `MP.h.link` (blue underline; `--ds-on-ink` on ink), `MP.h.quiet`.
- **Chips / options / seg**: unchanged API. A pressed `.option`'s mark fills with the current `--lens` (ink outside a lens).
- **Surfaces**: `.card` (hairline, `--r-lg`, `--shadow-1`; `.card.float` = `--shadow-float`), `.panel`, `.notice(.warn/.ok/.quiet)`, `.ld-grid` (18px dot grid background).
- **Instrument panel**: `.work` (automatic in lens steps) and `.ld-panel` (use elsewhere): hairline box, `--r-panel`, 8 corner ticks at inset −6px (−4px on phones), a 44×3 `--lens` index mark at top-left. `.ld-ticks` = ticks only on any positioned box. Never set `overflow:hidden` on a `.work` (it clips the ticks) and don't re-add a coloured top border.
- **Ink band**: `.ink-band` (or `.on-ink`) = ink background + on-ink text, label, focus and link colours. At most ONE ink band per page besides the footer (home: the problem band OR the trust close may be ink — pick deliberately; both is allowed on home only, since it is the pitch page).
- **Figure caption**: `MP.h.figCap(label, pill)` → `.ld-cap` row: mono label left, "TEACHING DATA" pill (`.ld-pill`) right (`pill=false` drops it). Every chart carries one; every number in a chart is computed from `MP.data`. The label goes through `MP.h.capLabel()`, which keeps the `FIG. n ·` prefix and hyphenated tokens (`28-day`) unbroken; use it on hand-built captions too. At ≤420px the pill drops below the label.
- **Brief preview**: `MP.h.briefSheet({lines, lit, tag, size: ""|"sm", title, cls})` → the ONE picture of the Brief used wherever it is previewed (home "What you keep", dashboard "Your Brief" card): masthead ("MajorPilot · Brief", title, split mark lit for `lit`), a miniature ink In-short strip numbered 01/02/03 in the lens on-ink colours (`lines` = the real lines; empty → ghost bars), then the real section heads.
- **Readout**: `MP.h.readout({size: ""|"md"|"pull", from, to, count})` → `27.0% → 20.5%` (`.ld-readout`; light Newsreader, drawn arrow, recent value in orange italic; on ink the recent value turns `--ai-on-ink`). `count:true` makes the first number count up and the second fall from 27.0 on arrival.
- **Chapter opener**: `MP.h.chapter(no, kicker, titleHtml, {tag, cls, id, aside})` → `.ch-open` (ink rule on top, italic orange numeral, mono kicker, title). Use for home sections, explore, brief. Works on ink.
- **Lens tag** `MP.h.lensTag(id)`, **evidence mark** `MP.h.ev(kind)`, **fold** `MP.h.fold` (open fold's `−` disc inverts to ink), glossary popover: unchanged API, hairline styling.
- **Modal / drawer / toast**: `MP.modal(html)` — `--r-xl`, `--shadow-float`, a 3-segment lens bar at the top edge, blurred scrim, `.modal-actions` above a hairline. `MP.toast(html)` — ink pill with a small 3-segment lens mark. Put at most one primary in a modal.

### 8.4 Code-drawn marks (`MP.draw.*`, `MP.live.*`)

- `MP.live` (derived once from `MP.data`): `rates[12]`, `earlier` (.270), `recent` (.205), `drop` (6.5 pts), `signups` (10,800), `maxSignups`, `router` (= baseline), `routerTotal` (200), `partner` ([.24, .56]), `trans[]` (funnel step-to-step rates), `leak` (biggest fall), `sparkPath(w, h, pad)` → `{d, x(i), y(r), end}`, `motionOK()`.
- `MP.draw.splitMark(on, {labels, just, cls})` → the split mark: a short ink line fanning into three bezier lens beams (BA top, DS middle, AI bottom). `on` = lens id (that beam solid + 2.6px, others dashed), an array of lens ids, `"all"`, or `""` (all dashed). `labels:true` prints BA/DS/AI at the beam ends (Quick Start empty state, ~120px wide). `just:true` redraws the lit beam once (use when the pick changed). Size it with CSS width (`.ld-mark`, default 132px; height follows the viewBox). It recolours itself on ink.
- `MP.draw.colophonMark()` → the 12-cohort line splitting into the three beams (used by the footer; reusable as a bookend).
- `MP.draw.glyph("ba"|"ds"|"ai")` → each lens's own data as a 300×140 SVG: BA funnel (recent bars inside the earlier outline), DS cohort signups (partner share in blue), AI 200-message waffle in the AI lens's own encoding (123 right team = ink, 15 content→tech mistakes = solid vermilion, 12 other mistakes = vermilion outline, 50 to a person = grey — never vermilion for "right"). `MP.draw.glyphCap(id)` → its caption with the real numbers (AI with swatches). `MP.h.glyphBox(id, {cap, reveal})` → glyph in a dot-grid `.ld-gbox` + `.ld-gcap` caption, wrapped in `.ld-reveal` so its intro plays when scrolled in. Use glyphs as column headers on Explore/Compare/home lens columns and anywhere a lens needs a face.
- `MP.draw.beam(p, p0, n)` → progress beam (`.ld-beam`): 2px track, ticks at step boundaries, lens fill to `p`, glowing head; grows from `p0` on arrival. `MP.draw.stepBeam(id, contentOnly)` → node variant (done filled · skipped dashed · to do hollow · next glows) — the done screens use it; the dashboard can too.

### 8.5 Lens shell & done screen (core renders these; lens modules only fill `.work`)

- Step header: mono folio `STEP 2 OF 6` (+ "Need a hint?") → `MP.draw.beam` progress beam → **giant italic lens-colour numeral** `.step-no` (`02`, Newsreader always) beside the `h1` → the lead as a **serif standfirst**.
- Rail: lens tag + serif question; the current step's dot carries a real `<i class="st-ring">` (static 2px glow; breathes 3 times on arrival, then rests). On ≤1024px the rail is a horizontal chip strip with edge-fade masks.
- **Practitioner feedback** is an ink boxout: 7px lens bar, mono kicker "WHAT PRACTITIONERS WEIGH" in the lens on-ink colour, the optional `title` as a serif line, `your` as a serif standfirst, then points numbered 01/02 in mono. `trap:true` → warm paper slab with the warn bar ("A COMMON TRAP"). It animates in (rise + bar wipe + staggered points) **only when it newly appears on that step** (core adds `.rv-new`), never on later re-renders.
- Hints: hairline card with mono level labels in the lens ink colour. Feeling row unchanged.
- **Action dock** (`.actionbar`): floats sticky 14px from the bottom, radius 16, light blur, `--shadow-float`; Back · Save & leave · the one primary stay on ONE row at 390.
- Done screen (`#/lens/<id>/done`): a two-column hero — lens tag + mono status + meta, display headline with the lens name in `--lens-ink` (and the italic `real` accent in en), `ld-did` as serif standfirst, node beam — beside a ~190px labelled split mark lit for this lens in a dot-grid panel; then chapter **01 What you handed in** (the artifact as an instrument panel with a `figCap`); the one primary ("See my Brief" / "Back to a skipped step" / "Pick up where you left off"); chapter **02 Same problem, other lenses** with glyph-topped cards. Not-finished and looked-through states use the same beam + checklist.

### 8.6 Motion rules & helpers

1. **Base style = final visible state.** Never leave a base `opacity:0`/hidden transform. Animate FROM hidden with keyframe `from` states and `animation-fill-mode: both`. The screenshot tool injects `*{animation:none!important;transition:none!important}`, so a static capture must look finished on its own.
2. **Intros only under `#view.enter`** (a fresh arrival). Core also sets `#view.first` (first arrival on this route this session → full intro) or `#view.again` (later arrivals → keep it to a ≤0.4–0.6s settle; the default top-level `ld-settle` already does this). `MP.firstVisit("home")` tells you the same thing; `MP.replay()` re-renders the current route with the full intro (e.g. click on a hero figure). Re-renders after a click have no `.enter`, so nothing replays.
3. **Below the fold**: put intros under `#view.enter .ld-reveal …` (or put `data-reveal` on an element for a plain rise; `style="--d:.1s"` staggers). Core pauses them until `MP.live.observe`'s IntersectionObserver adds `.is-in` — and the pause only applies while `html.ld-live` is set (core sets it after its motion layer initialised and motion is allowed). No JS, a script error, reduced motion or a static capture → everything is simply visible.
4. **Count-ups**: add `data-ld-count` (optional `data-ld-from="27"` or `"0,27"` per number, `data-ld-delay`, `data-ld-dur` in ms) to any element; on arrival core counts every number in it to its real value, keeping the locale formatting. Inside an `.ld-reveal` it counts when revealed. Only on arrival, never on click re-renders (don't re-count on every option click — busy). Imperative: `MP.countUp(el, {from, delay, dur})`. It snaps to the final text under reduced motion or when animations are disabled.
5. **Keyframe library** (in tokens.css): `ld-draw` (SVG paths with `pathLength="1"`), `ld-wipe` / `ld-wipe-down` (clip-path), `ld-pop`, `ld-grow-x` / `ld-grow-y` (use `transform-box: fill-box` + an origin), `ld-fade`, `ld-rise`, `ld-settle`, `ld-breathe` (box-shadow ring in `--lens-glow`, ends at its resting state), `ld-beam-grow`, `ld-travel` (stroke-dashoffset pulse along a `pathLength=1` path that is visible at rest), `ld-modal`, `ld-toast`, plus legacy `rise` / `fade` / `slide`.
6. **Idle loops are finite**: 2–3 iterations, then rest (`ld-breathe … 3`). A decorative ambient loop (e.g. the home beam pulse) caps at a few cycles, uses `animation-delay: calc(var(--clock) + Xs)` so it keeps its phase across re-renders, and its element must be visible-but-quiet at rest (draw it with `stroke-dashoffset` on a visible path) — if you truly need a base `opacity:0` decorative element, say so in a comment and gate it under `html.ld-live`.
7. **Never animate a pseudo-element from hidden**: `::before/::after` escape the screenshot reset. Use a real element (as the rail's `.st-ring` does) or gate the rule under `html.ld-live`.
8. Motion never blocks a click; hover effects (lift, spotlight) only under `@media (hover: hover) and (pointer: fine)` and not under reduced motion (the global reduced-motion rule already kills animations and transitions).

### 8.7 Rules for page and lens owners

- Use the tokens; don't hard-code colours, radii or shadows that exist as tokens. Borders are `--hair`. Body text ≥ 4.5:1 (paper: `--muted`/`--faint` are the floor; ink: `--on-ink-2` is the floor). Mono labels ≥ 13px; chart annotations ≥ 13px; sub-lines ≥ 14px.
- Label every chart with a mono caption (`MP.h.figCap` or `.ld-label`) and compute every number from `MP.data` / `MP.live`.
- One primary per screen, still. Quick Start result slabs, dashboard hero cards etc. must each hold exactly one `MP.h.primary`.
- zh: every new string in en + zh; zh sub-lines short, number pairs in `.nowrap`, `​` phrase hints in headings and lens questions (`.lens-q`).
- Phone (390): 18px side gutter, no horizontal overflow, nothing clipped at the gutter (ticks are inset −4px there).
- Verify motion with `tools/shot-motion.mjs` (same flags as `shot.mjs`, but animations are NOT disabled; use `--wait=<ms>` to grab a mid-intro frame). Verify the static/final state with `tools/shot.mjs`.

## 9. AI layer

The product has an AI layer: a second read on the write-ups, an "Ask about this step" card, a reflect follow-up, the Brief drafted from the student's work, the Compare thread, the dashboard "Noticed" line, Quick Start "in your own words", and the `#/school` Program view. No model is connected. Every response is composed by deterministic code from the student's real inputs and `MP.data`, validated, and then presented as a grounded AI response (reading trace, natural-pace streaming, quotes of the student's own words, evidence chips, regenerate, tone/length, honest "I can't tell").

**The full spec is `AI-LAYER.md`** (principles, the 8 placements with states, content rules and en/zh samples, visual language, motion, accessibility and the not-to-do list). It adds to this contract and never overrides it. In short:

- Coach, never grader: no scores, ticks, red/green, fit/admission language (banned-lexicon check on every string); KEEP before any suggestion.
- Every claim cites the student's own actions (`MP.ai.cite`), every quote is an exact substring, every number comes from `MP.data`/state. If a slot can't be filled, the sentence is dropped, never padded.
- Compose and validate first, then animate the finished text. The kit streams with CSS-delayed token spans, so the base DOM is always the final text.
- One discreet, always-present disclosure in the footer (core renders it in both colophons). No per-element "simulated" labels anywhere.
- AI controls are always secondary/quiet: one primary per screen still holds. Private items (hint use, reflection, follow-ups, Quick Start text) never reach Advisor, Family or Program views.

### 9.1 Files and load order

`css/ai-kit.css` loads right after `tokens.css`; `js/ai-kit.js` loads right after `core.js` (before pages and lenses). Namespace `MP.ai` (the AI *lens* stays `MP.lenses.ai`), CSS prefix `.rd-` ("reading", never `.ai-`), data attributes `data-rd-*`. `MP.render` calls `MP.ai.after(app)` after every render; `MP.boot` calls `MP.ai.boot(query)`.

### 9.2 Modes

| How | Effect |
|---|---|
| default | Each new response streams once (reading trace → tokens → chips). Finished responses never re-stream on re-render, reload or language switch. |
| `?ai=instant` (sticks for the tab session; `MP.ai.instant = true`) | Every surface renders finished: collapsed trace, no caret, chips visible. Use for screenshots of final states. |
| `?ai=fresh` | Clears `MP.state.ai.seen` + regen counters, so every surface streams again (before a live demo). Also turns instant off. |
| `?ai=live` | Turns instant off. |
| reduced motion / print / `tools/shot.mjs` | Finished text (`MP.ai.motion()` is false, or animations are disabled and the live layer completes at once). |

`MP.ai.motion()` → `!instant && motionOK && !printing`. `MP.applySample()` and reset start from a clean `MP.state.ai`.

### 9.3 The one call most owners need: `MP.ai.block`

```js
MP.ai.block({
  key: "read.ba.2",               // stable id of this response slot
  fp: MP.ai.fp([ruleId, variant, prefs]),  // fingerprint of THIS output (not the language): new fp → it streams once
  kind: "note",                   // "note" (cap 1.4s) | "answer" (1.8s) | "line" (1.2s) | "ink" (no box, for ink bands)
  kicker: MP.t({ en: "A reader might ask", zh: "读者可能会问" }),   // mono label beside the reading ring (optional)
  trace: [MP.t({en: "Recommendation", zh: "建议"}), { label: MP.t({en: "your step 2 pick", zh: "你第 2 步的选择"}), src: "ba-tr-3" }],
                                  // what it read: shown live ("READING · a · b"), then collapses to "READ 2 THINGS ▸"
                                  // items with src light that element on the page as they are read
  traceDone: "",                  // optional custom collapsed label ("DRAFTED FROM YOUR WORK · …")
  body: { en: ["You name email fatigue as the risk ", { q: risk, lens: "ba" }, ", but your guardrail is ",
               { b: "average assignment score" }, ". Would unsubscribes catch it sooner?"],
          zh: ["你写的风险是", { q: risk, lens: "ba" }, "，但护栏选的是", { b: "作业平均分" }, "。退订率会不会更早发现问题？"] },
  cites: [{ lens: "ba", step: "test" }],          // evidence chips under the text
  actions: MP.ai.actions({ resolve: ["ba-read-ok", "2"], regen: ["ba-read-regen", "2"], count: { en: "1 of 3", zh: "1/3" } }),
  lens: "ba",                     // sets the lens colours for quote washes
  check: { numbers: KNOWN, sources: [risk] },     // optional: validate here; on failure render `fallback` instead
  fallback: "",                   // plain, non-AI copy (or "" to render nothing)
  live: true,                     // false for blocks that arrive with the page (Brief, Compare, dashboard): no aria-live, no height growth
  wait: false,                    // true: a fresh stream holds in its reading phase until its body is half in view (Brief In short)
  grow: undefined,                // default: grows smoothly line by line when live (on-demand answers); false keeps its final height from frame 1
  unsure: false,                  // dashed ring, italic muted text, dashed rule ("I can't tell yet …")
  cls: "", id: "", label: "",     // extra class, id, aria-label
  scan: "#ba-memo-boxes"          // optional: a 2px graphite scan line sweeps once down this element while it reads
})
```

**Segments** (`body`, also `MP.ai.stream`): a string is trusted copy (may hold markup, like `MP.t` text; element runs become single tokens) · `{text}` escaped plain text · `{q, lens}` the student's own words (exact substring; sans, curly quotes, lens wash on paper / lens underline on ink) · `{b}` a bold figure (one token) · `{nw}` a no-wrap pair like `"75.0% → 62.5%"` (one token) · `{em}` · `{cite: {lens, step, label, src}}` an inline superscript chip · `{br: true}` · `{html}` one atomic token · `{en, zh}` → localized first. `body` may also be an array of paragraphs (`[[…], […]]`).

**How streaming works.** `block()` calls `MP.ai.fresh(key, fp)`; when the output is new it returns every token as `<span class="rd-tok" style="--d:…ms">` (word chunks in en with occasional sub-word splits, 1–3 character chunks in zh, numbers land as one slower token, pauses after `, ;` and `. ? !`, seeded per text so the rhythm is stable, compressed to the kind's cap). CSS fades each token in at its delay; `after()` adds the live layer: phases (`.is-reading` / `.is-streaming`), a dashed trace rule that turns solid, a caret that follows the newest token and blinks twice at the end, smooth height growth (no layout jumps: the text is laid out from frame 1), the "Show it all" skip button, cite chips popping in, `aria-busy` cleared at the end. **Re-renders resume**: `MP.commit()` mid-stream re-renders the same key/fp with negative delays, so the stream continues where it was instead of restarting or snapping. A click on a streaming block, "Show it all" or Esc completes it (`.rd-done`). Without JS, under reduced motion, in print or in a static capture, it is simply the finished text.

### 9.4 API reference (`MP.ai`)

| Group | Function | Notes |
|---|---|---|
| mode | `instant`, `motion()`, `boot(q)`, `state()` | `state()` = `MP.state.ai` with defaults (`seen, regen, fb, prefs {tone, length}, dash {shown, hidden}`) |
| determinism | `hash(str)` FNV-1a · `rng(seed)` mulberry32 · `pick(list, seed)` · `fp(obj)` base36 fingerprint · `variant(key, n, base)` = `(base + regen[key]) % n` · `bump(key)` (regenerate: +1, and the next stream of that key re-reads quickly and streams at 1.4×) · `say(variants, key, base)` (variants `{en:[…], zh:[…]}` or `[{en, zh}…]`) | composition must be a pure function of state + data + lang + regen |
| cache | `fresh(key, fp)` → bool (records fp as shown; true again while that same output is mid-stream) · `forget(key)` | call once per render of a surface you build by hand; `block()` calls it for you |
| text | `text.lang(s)` en/zh/mixed · `text.sentences(s)` `[{s, e, text}]` (keeps "62.5" whole) · `text.words(s)` (zh: chars/1.8) · `text.chars(s)` · `text.first(s)` · `text.numbers(s)` `[{v, raw, s, e, unit}]` · `text.near(v, known, tol=.15)` `{match, nearest}` · `text.find(s, lexicon)` `[{s, e, w}]` (en word-boundary, zh substring) · `text.clause(s, at, {maxWords: 12, maxChars: 20})` · `text.quote(src, s, e)` exact substring, `…` only where cut mid-clause | |
| lexicons | `lex.hedge, overclaim, causal, jargon, surprise, positive, negative, actionVerb, banned` (`{en:[…], zh:[…]}`) | lens owners add their own entity lexicons |
| validation | `check(textOrSegments, {numbers, sources, tol})` → `{ok, why}` · `firstOk(candidates, opts)` | fails on banned words, a number not in `numbers` (integers 0–12 always pass), a quote (`{q}` or “…”) not found in `sources` (step titles, funnel steps and lens questions are added automatically). Warns in the console on localhost. On failure try the next variant, then show your deterministic copy without AI styling |
| render (strings) | `block(o)` · `stream(segs, {animate, delay, cap, as, speed, offset})` · `pace(segs, lang, {cap, start})` → ms[] · `mark({size, busy, unsure})` the reading ring · `kicker(label, {busy, unsure})` · `trace(items, {done, open})` · `cite({lens, step, label, src, go, title, sup, aria})` · `quote(text, lens)` · `unsure(text, {cite})` · `actions({regen, count, resolve, useful, dismiss, labels})` · `seg(name, [[v, label]…], value, {action, label})` · `chips([{label, action, arg}], {label})` suggested questions · `flat(x)` / `plain(segs)` | every label accepts `{en, zh}` |
| DOM | `after(root)` · `complete(el)` · `completeAll()` · `busy()` · `light(src, {scroll, once})` · `scan(el)` · `highlight(textarea, spans)` · `markOn(textareaId, n, on)` · `announce(text)` · `feedback(key, "up"|"down"|"hide")` | |
| events (registered by the kit) | `rd-cite` (arg `lens|step|src|go`) · `rd-skip` · `rd-pref` (arg `name:value` → `MP.state.ai.prefs`, commits) · `rd-fb` (arg `key|up`) | owners register their own namespaced regen/resolve actions (`ba-read-regen`, `bf-ai-regen`…) |

**Cite chips.** `MP.ai.cite({lens: "ba", step: "funnel"})` → `● BA·2 · FIND THE LEAK →` (zh `BA·第2步 · 找漏点`); `sup: true` → the compact inline `BA·2`; `label` overrides the code (`{en: "BA·memo", zh: "BA·建议"}`); `title: false` drops the step name. Click: when `src` names an element on this page (`data-rd-src="…"`, space-separated lists allowed) it lights and scrolls to it; otherwise it opens `#/lens/<lens>/<step>` and lights `src` there. `go: true` always navigates (Brief: hover lights the row, click opens the step). Hover/focus on a chip with `src` lights its target (`ld-breathe`-style ring in `--lens-glow`; SVG targets get a drop-shadow).

**Highlights in a textarea (AI-1).** `MP.ai.highlight(ta, [{s, e, kind: "keep"|"ask"|"try"|"unsure", n, quote, resolved}])` builds a mirror backdrop behind the textarea (copies its metrics; the textarea's background turns transparent) with underlines (KEEP solid lens colour, ASK/TRY dotted, UNSURE dashed, resolved dotted faint) and numbered pins. It re-anchors each span to its `quote` while the student types and marks a span `.stale` when its words are gone; if the mirror wraps differently from the textarea it removes itself (the notes still quote). Or declare it: `<textarea data-rd-marks='[…]'>` and `after()` builds it on every render. Give a note `data-rd-note="<textareaId>:<n>"` and hovering/focusing it washes its mark.

Example, a lens note list with tone/length segs:

```js
const prefs = MP.ai.state().prefs;
const head = MP.ai.seg("tone", [["gentle", {en: "Gentle", zh: "温和"}], ["direct", {en: "Direct", zh: "直接"}]], prefs.tone)
           + MP.ai.seg("length", [["short", {en: "Short", zh: "简短"}], ["reasons", {en: "With reasons", zh: "附理由"}]], prefs.length);
const notes = picked.map((r, i) => `<aside role="note" data-rd-note="ba-memo-${r.box}:${i + 1}">${MP.ai.block({
  key: "read.ba." + r.id, fp: MP.ai.fp([d.read.hash, r.id, prefs, MP.ai.state().regen["read.ba." + r.id] || 0]),
  kind: "note", kicker: MP.t(KIND[r.kind]), lens: "ba", body: compose(r, prefs), cites: r.cites,
  actions: MP.ai.actions({ resolve: ["ba-read-ok", r.id], regen: ["ba-read-regen", r.id] }) })}</aside>`).join("");
MP.on("ba-read-regen", (el, id) => { MP.ai.bump("read.ba." + id); MP.commit(); });
```

### 9.5 Core-owned placements (built)

- **Footer disclosure** — both colophons carry, with the reading ring, "AI responses in this prototype are simulated." / "本原型中的 AI 回复为模拟生成。" The full colophon also shows "For advising offices →" (`#/school`) once `MP.pages.school` is registered. Route title bit: "For advising offices" / "顾问办公室视图".
- **AI-2 Ask about this step** — every content step's folio has a quiet "Ask about this step" / "就这一步问问" (ring + label) in place of "Need a hint?". It opens an inline card where the hints were (below the work, above the reveal): kicker `ASK · STEP 2 · FIND THE LEAK`, a context line ("Looking at what you've done: …", streamed once per open, with a trace naming the step, the figure captions on screen and your pick), then a thread of turns and up to 3 suggested questions: "Give me a nudge" → "A bit more" → "Show an example" (the fixed hint ladder, still counting `st.hints`), up to two lens step chips, then one core chip ("What does ‘funnel’ mean here?" from the lead's first `[[glossary]]` term, else "Where does this show up in a master's?" from `step.shows`). Answers with several variants get "↻ Say it another way · 2 of 3". State: `st.ask = [{chip, v, lv}]`, `st.askOpen`, `st.askN`. Steps that had hints before this card existed open with those hint turns. **Lens contract addition** (optional per step; without it the card uses honest generic lines):

  ```js
  ask: {
    seen(ls, lang) { return { en: [...segments], zh: [...] }; },     // the student's current state on this step, never the intended answer
    trace(ls) { return ["Your pick", "FIG. 2 · The funnel"]; },        // optional: what the context line "read"
    chips(ls, ready) { return [{ id: "people-or-pct", q: {en, zh},
      a(ls) { return { variants: [{en: [...], zh: [...]}, …], cites: [{lens: "ba", step: "funnel", src: "ba-tr-3"}] }; } }]; },
    term(ls) { return { en: "Here, step 3 → 4 fell from 75.0% to 62.5%.", zh: "…" }; }  // optional: ties the glossary term to this step
  }
  ```
  Before `ready`, chips explain and point (never reveal or rank options). Put `data-rd-src="<id>"` on the funnel bar / cohort point / message card a cite should light.
- **AI-3 Reflect follow-up** — after a pick, or when the note loses focus with ≥ 5 words / ≥ 8 characters, one follow-up per lens, ever, composed from the pick, its marks and the note (rules: hard step → "Hard in a good way, or just hard?"; surprise words → "the topic or the surprise?"; "none" → "the problem, or this kind of work?"; enjoyed step → "the numbers, or the deciding?"; negative note → "Which part felt that way?"; any other pick → "the problem itself, or the way of working?"; otherwise silence). It quotes the student's clause, is validated, snapshotted in both languages in `ls.refl.follow = {rule, q: {en, zh}, chips, a, more, at}`, streamed once, answered with chips (or Skip), acknowledged in one calm line, with an optional "Say more" line (`follow.more`). Private: My Brief only.
- **Done screen** — when `summary().artifact.trace` (string or `{en, zh}`) is present, it shows under the chapter 01 caption row with the ring (`REVISED AFTER A SECOND READ · …`). Chapter 02 shows one line from `MP.pages.compare.thread({from: "done", lens})` (html string) when ≥ 2 lenses are complete and compare provides it.

### 9.6 Testing AI surfaces

- Final state: `tools/shot.mjs` (animations off → finished text) or add `&ai=instant`.
- Mid-stream frames: `tools/shot-motion.mjs … --wait=<ms>` (it adds ~0.6s after the wait before capturing; keep `--wait` small and pass a fixed height). Example: `node tools/shot-motion.mjs shots/ask.png "/?preset=sample#/lens/ba/funnel" 1440 900 --click='[data-action="ask-open"]' --wait=0`.
- Streams must never replay: after one finishes, `MP.render()` and a reload must show it static (`document.querySelectorAll(".rd-anim").length === 0`).
