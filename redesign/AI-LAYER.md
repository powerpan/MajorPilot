# MajorPilot redesign — AI layer spec

Status: FINAL design spec for the "AI in the product" pass. Read `CONTRACT.md` first; this file adds to it and never overrides its rules (one primary per screen, i18n, 390px, motion §8.6, file ownership).

**What this pass is.** The AI layer is built into the product itself; it is not the AI major. No model is connected. Every AI response is **composed by deterministic code from the student's real inputs and the fixed `MP.data`**, validated, and then *presented* the way a grounded model response is presented: a short reading trace that names what it looked at, text that streams at a natural pace, the student's own words quoted back and highlighted, evidence chips that link to the step they came from, regenerate giving a different wording, tone/length on request, and an honest "I can't tell" when the evidence is thin. Two students who did different things get visibly different, sensible responses.

Upstream alignment (`../docs` in this repo): this mirrors the real product's AI duties (doc 01 §10: layered hints on request, follow-up questions grounded in the record, a report that separates facts, self-report, explanation and unknowns) and its report rules (doc 40: rules guarantee checkable facts; every claim cites evidence; quotes must be exact; banned fit/score conclusions; **no streaming of an unvalidated half-analysis**; no generic praise as a fallback). Tasks stay fixed and reviewed; the AI never generates tasks, never changes the NEXT order (doc 08), and never reads free text to change a ranking.

---

## 0. How the three proposals were judged

Three internal design explorations (Margin, Conversation, Ambient) were written before this spec and are not included in the repo; "P1–P7" below refer to placements in those drafts. This document is the final spec.

| Criterion | Margin | Conversation | Ambient | Decision |
|---|---|---|---|---|
| 5-minute demo impact | Highest on writing; strong Brief | Highest "wow" (free-text chat), strong Quick Start | Strongest B2B (Program view) and Brief | Take each one's best moment |
| Believability | Very high: quotes your sentences, checks against your own picks | Free text breaks on unexpected questions in a live demo | High: everything cites marks | **No free-text box.** Suggested questions only |
| Honesty / no grading | Careful (KEEP first, cap 3, no red/green) | "LANDS / A READER WOULD ASK" framing is the least judgy | Questions instead of verdicts | Reader-framed note kinds, KEEP always first |
| Fit with Living data | Graphite margin, serif notes, lens-colour highlights | Loupe mark, dashed→solid trace rule | Reading-ring mark (split-mark node + 3 lens arcs), CSS-delayed token spans | Reading ring + graphite margin surface + dashed→solid rule + CSS-delayed streaming |
| Buildability (vanilla, parallel owners) | Mirror highlights + bezier leaders are fiddly | Side panel changes the shell layout | CSS streaming survives screenshots, print, re-renders | One shared kit in core; pins instead of leader lines; Ask card inline, not a side panel |

**Chosen:** Second read on the write-ups (margin P1 + revision echo P4, with the reader-framed kinds from conversation P2); Ask about this step (conversation P1 minus the input box, plus margin P5 and ambient P7); Reflect follow-up (ambient P5 + margin P6 quoting); Brief drafted from your work + Worth talking through (all three proposals agreed); Compare thread (margin P7); Dashboard "Noticed" and "Why this next" (ambient P3 / conversation P6); Quick Start "in your own words" (conversation P3, made faithful to upstream doc 08); Program view (ambient P2).

**Cut, and why:** free-text chat or ask box (fails live on unexpected input and invites admission/fit questions); bezier leader lines (alignment breaks on resize; numbered pins carry the same link); contenteditable Brief lines (persistence conflicts with redraft; "Leave out" gives agency instead); Plain/Warm/Formal tone on the Brief (the three views already are the voices); Compare "kinds of work" pattern strip (closest thing to a fit score); auto-reading after a typing pause (interrupts writing); a separate side-panel layout (changes the shell for every lens).

---

## 1. Principles

1. **Coach, never grader.** The AI comments, asks, and explains. It never scores, ranks, ticks, marks right/wrong, predicts admission or fit, or says what a student is "good at". No counts of problems ("3 issues found"), no confidence percentages, no red/green. KEEP comes before any suggestion.
2. **Grounded in the student's own actions, with citations.** Every sentence is composed from (a) the student's choices and marks in state, (b) their own text, quoted as an exact substring, and (c) numbers from `MP.data` / `MP.live` / the lens's own computed values. Every factual claim carries an evidence chip that links to its step. If a template's slots can't all be filled from real evidence, the sentence is **dropped, never padded** (upstream: 不得凑数).
3. **Says what it can't tell.** Thin or ambiguous evidence gets an honest "I'm not sure…" / "I can't tell yet…", or silence. Never generic praise as filler.
4. **Validated first, animated second.** The full response is composed and passes `MP.ai.check` (banned lexicon, every number known, every quote a real substring) **before** anything is shown. Streaming is presentation of finished, validated text. The DOM holds the final text from the first frame.
5. **On request or at natural seams, never mid-typing.** Writing feedback runs only when asked. The only unprompted AI text is a one-line dashboard observation, the Brief draft (when evidence changed), the Compare thread, and one reflect follow-up after the student has answered.
6. **Private stays private.** Hint use, reflection picks and notes, follow-up answers and Quick Start free text never appear in Advisor or Family views or in the Program view.
7. **One discreet, always-present disclosure.** A single line in both the full and compact footer colophon: "AI responses in this prototype are simulated." / "本原型中的 AI 回复为模拟生成。" No per-element "simulated / scripted / fake" labels. Each AI surface's "What it read" fold provides explainability instead.
8. **Same evidence, different wording.** Regenerate changes phrasing, clause order and which equal-weight evidence leads. It never changes the findings, so the AI stays consistent.
9. **Calm motion.** The reading trace is ≤ 1.2s, streams are capped (≤ 1.4s for a note, ≤ 3.2s for the Brief), with no artificial "thinking…" delay. Click or Esc completes instantly. A response already shown never re-streams on a re-render, reload or language switch.

---

## 2. Placements

Eight placements, at least one per owner. Each lists route/trigger, form, states, content rules, samples and owner. The **sample student** is `?preset=sample` (BA + DS complete, AI 3 of 6 steps). Numbers below are what the code computes from `MP.data`; owners compute them, never hardcode.

States vocabulary used everywhere (kit-provided, §3):
- **idle**: the trigger is visible; nothing is composed.
- **reading**: the reading trace ticks through its sources (≤ 1.2s). The mark's arcs turn.
- **streaming**: text arrives token by token; the left trace rule is dashed; there's a caret; `aria-busy="true"`.
- **done**: the rule is solid, the trace collapses to one line ("Read 4 things ▸", expandable), and cite chips pop in.
- **regenerate**: old text dims to 40% for 120ms, new wording streams at 1.4× speed; same chips.
- **unsure**: dashed ring mark, italic serif in `--muted`, one honest sentence, no chips or one `limit` chip.
- **error**: composition threw or validation failed for every variant. Show the deterministic fallback (the copy that exists today, e.g. the current In-short lines or the fixed overlap sentence) with no AI styling. Never show a broken or half response.

### AI-1 · Second read on the write-up — owner: **lenses** (ba.js, ds.js, ai.js + css)

**Route / trigger.** `#/lens/ba/memo`, `#/lens/ds/summary`, `#/lens/ai/note`. A secondary sm button in the doc header row next to "Use sentence starters": **"Get a second read"** / **"帮我读一遍"**, with the reading-ring mark. Enabled when the two visible boxes together hold ≥ 8 words (en) or ≥ 16 characters (zh); disabled state says "Write a sentence or two first" / "先写一两句". One offer, once: the first time both required boxes are ready and the second box loses focus, the button breathes 3× (`ld-breathe`). It never fires on its own and never while typing. After a read, if any box text changed (hash differs), the label becomes **"Read again"** / **"再读一遍"**.

**Form.** Editor's notes in the margin, not a chat.
- **≥ 1200px**: the `.work` panel splits into a text column and a 300px margin column inside the same instrument panel (the corner ticks frame both). Each note's top aligns with the top of the box it's about.
- **< 1200px**: notes stack directly under their box, each with a 2px graphite left rule.
- **390px**: same as < 1200, full width; the tone/length controls fold behind a quiet "Tone ⋯" / "语气 ⋯" disclosure button.
- Margin header: mark + kicker. While reading: `READING · Recommendation · Why · Risk · your step 2 pick · your test plan`. When done: `READ 6 THINGS ▸` / `读了 6 处 ▸` (expandable to the list). Two tiny segs: **Gentle | Direct** (`温和 | 直接`) and **Short | With reasons** (`简短 | 附理由`). Defaults: Gentle, Short; stored in `MP.state.ai.prefs` (shared by all three lenses).
- In-text highlights: the student's words get marks in the textarea via the kit's mirror backdrop (`MP.ai.highlight`), each ending in a numbered pin (13px mono in a 20px ring) that matches the note's number. KEEP = solid 2px underline in `--lens`; ASK and TRY = dotted underline + pin; UNSURE = dashed underline + pin. The focused/hovered note's span gets a `--lens-soft` wash. If the mirror can't match textarea metrics, highlights are dropped and the quotes stay in the notes (kit handles this).
- **Note card** (`MP.ai.block`, kind note): mono kind label → the student's words in curly quotes (sans, `--lens-soft` wash) → 1–2 serif sentences (Short) or + one "because" line (With reasons) → cite chip(s) (`BA·2 · FIND THE LEAK →`) → actions **"Got it"** (`知道了`) and **"↻ Another way to say it"** (`↻ 换个说法`).
- Kind labels (reader-framed, never verdicts): **KEEP** / **保留** · **A READER MIGHT ASK** / **读者可能会问** · **TRY** / **可以试试** · **NOT SURE** / **说不准**.
- "Got it" folds the card to its pin (`ld-settle` 300ms) and drops the highlight to a dotted underline. If the student edits text inside a marked span, that mark turns dashed ("stale").
- Never writes into the boxes. The sentence starters stay the only drafting tool.

**States.** idle (button) → reading (trace in margin header + a 2px graphite scan line sweeping once down the boxes, 900ms) → streaming (notes one after another, 150ms overlap; highlights wipe in with `ld-wipe` 260ms as each note starts) → done → regenerate (per note; "↻" rotates that note's wording only) → unsure (a NOT SURE note in place of a missing one) → re-read (after edits: leads with what changed, see Revision below).

**Inputs read.**
- Text of every box that has text (`d.memo.rec/why/risk/measure`, `d.sum.found/sure/unknown/dont`, `d.note.changed/improved/cost/watch`). Starter-untouched flag: `text === d.starter[k]`.
- BA choices: `d.tr` (transition index; `LEAK` = week 1 → assignment), `d.why` (drop/lost/fix/goal), `d.checks` (mix/help/course/season/release), `d.action` (email/deadline/redesign), `d.guard` (quality/unsub/tickets/later), `d.lift` + the lens's `plan()`.
- DS choices: `d.claim` (mix/noise/def/none), `d.trend` (chase/noise/unsure), `d.split` (all/half/none), `d.conclude` (a/b/c), `d.next` (funnel/help).
- AI choices: `d.num`, `d.err.pattern` (content/billing/random) + `cited`, `d.chg.opt` (examples/threshold/definition), `better`, `worse`, `ran`, `d.tr.ans`.
- Other lenses' completion (`MP.progress(id).complete`) for cross-lens notes.

**Text features** (kit `MP.ai.text`, plus the lens's own lexicons): sentence split on `[.!?。！？]`; word count (en) / character count (zh); first sentence and its first 12 words / 20 chars; numbers by regex (`/\d[\d,]*(\.\d+)?\s*(%|pts?|points|个百分点)?/`), each matched against the lens's KNOWN set within ±0.15 → `matched` / `unknown` (nearest known value) / `none`; hedges (maybe, might, I think, probably, kind of / 可能, 也许, 大概, 我觉得, 感觉); overclaim and causal words (proves, definitely, clearly, caused, because of, 100%, will fix / 证明, 肯定, 一定, 显然, 导致, 就是因为, 必然); jargon for a non-technical reader (significant, p-value, regression, confidence interval / 显著, 回归, 置信区间); action verb first (fix, test, run, start, add, raise, rewrite / 先修, 测试, 试行, 增加, 提高, 改写); pronoun-led first sentence (it, this / 这个, 它) with no step or action noun; text language ≠ UI language.
- Lens entity lexicons: BA funnel step names (from `MP.data.funnelSteps`, en+zh), action words (email, office hours, deadline, redesign / 邮件, 答疑, 截止, 重做), guardrail words (score, quality, unsubscribe, help requests / 平均分, 质量, 退订, 求助), channel words (partner, mix, who signed up / 合作, 渠道, 构成). DS: mix/channel words, noise words (wobble, noise, random, chance / 波动, 偶然, 随机), course-blame phrases (course got worse / 课程变差). AI: change words (examples, threshold, definitions / 示例, 阈值, 定义), metric words (accuracy, coverage, handled, sent to a person / 准确率, 覆盖, 自动处理, 转人工), cost words (but, worse, more work, cost / 但, 变差, 代价, 更多).
- KNOWN sets (computed in each lens from `MP.data` and the lens's own helpers): BA 75, 62.5, 70, 78, 80, 1,404, 1,228, 409, 246, 27, 20.5, 6.5, the test's target rate, learners per group, weeks. DS 27.0, 20.5, 6.5, 3.25, 23.75, 30, 27, 18, 14, 24, 56, 25, 50, 19.0, the wobble band, cohort numbers 1–12. AI 200, 150, 123, 82, 75, 50, 27, 15, 4, 5, 7, 152, 134, 88.2, 48, 118, 106, 89.8, 59, 32, 10, 85.3, 81, 57, 95, 60, 100, 0.60, 0.75.

**Composition.** Each lens defines a rule table; the kit runs it:
```js
{ id: "ba.guardMismatch", box: "risk", kind: "ask", pri: 2, cites: ["test"],
  test(f, d) { return /* anchor {box, s, e} or null */ },
  say:    { en: [g1, g2, g3], zh: [g1, g2, g3] },   // Gentle: opens with a reader question
  direct: { en: [d1, d2, d3], zh: [d1, d2, d3] },   // Direct: imperative
  why:    { en: "...", zh: "..." } }                 // the "With reasons" line
```
Selection: **exactly one KEEP** (the first true strength in this order: decision in the first 12 words / 20 chars; a matched number; a named guardrail or limit; one change named exactly; length suits a busy reader ≤ 30 words), then **up to 2 more** by priority: (1) a number that doesn't match anything known; (2) a contradiction with the student's own choice; (3) an ambiguous referent in the first box (NOT SURE); (4) a missing number or a number in the wrong unit for the reader; (5) a cross-lens connection (other lens complete); (6) overclaim / causal / jargon; (7) hedge-first opener; (8) an optional box that's empty while the run or choices give it content. **Cap: 3 cards.** If nothing beyond KEEP fires: one extra line under KEEP, "Nothing I'd change in these boxes. The optional parts are there if you want them." / "这几栏我没有要改的。可选部分想写再写。" A NOT SURE note fires when a box has < 6 words / < 10 chars, when the first sentence is pronoun-led with no step/action noun, or when the text language differs from the UI ("I'll read this as written; my notes stay in English." / "我按原文来读，批注仍用中文。").

Regenerate: `variant = (hash(boxText) + regen[noteKey]) % 3`. KEEP rotates across eligible strengths; With-reasons flips clause order. Findings never change.

**Rule catalogue (minimum; ~10 per lens).**
- BA: `decisionFirst` (KEEP: action verb or step name in the first 12 words); `decisionLate` (TRY/ASK: hedge or no action in the first sentence); `numberUnknown` (a number in Why matches nothing known: "I can't find 70% in your funnel view; step 2 shows 75.0% → 62.5% at the assignment step." Use the nearest known value); `startsNotCompletions` (Why cites 409 but not ≈246); `numberMissing` (Why has no number: offer the one behind their own pick, e.g. 1,404 for "most people lost", 75% → 62.5% for the leak); `pickMismatch` (Recommendation names a step other than `d.tr` and other than the leak); `guardMismatch` (Risk names email fatigue / annoy / 打扰 / 烦 while `d.guard !== "unsub"`); `measureNoGuard` (Measure has no guardrail word while `d.guard` is set); `mixRisk` (Risk mentions partner/mix and DS is complete → bring in 3.25 of 6.5 points); `overpromise` (will fix / back to 27% / 一定 → "Can one email carry all of that?" plus the mix half if DS is complete); `referentVague` (NOT SURE: "onboarding"/"新手引导" with no step named).
- DS: `namesMix` (KEEP); `numberFirst` (KEEP: Found starts with a matched number); `causalOverreach` (caused/导致/证明 in Found while `d.split === "half"` or `d.conclude === "b"`); `contradiction` ("course got worse"/"课程变差" in Found while `d.conclude === "b"`); `overSure` (100%/proves/definitely in How sure); `jargonSignificant`; `mixMissing` (Found has no mix/channel word while `d.split` is set); `noiseNamed` (KEEP: How sure mentions wobble/noise); `traitClaim` ("worse students"/"学生更差" → suggest moving it to "Don't use this to…" as the claim to avoid); `dontEmpty` (optional box empty; offer their own `d.conclude` "a" statement as the misuse to name).
- AI: `oneChange` (KEEP: exactly one change word in Changed); `changedTwo` (two change words); `noDenominator` (accuracy/准确率 without "of handled"/a matched pair; offer 82.0% → 88.2% or 89.8% with its own denominator); `coverageShift` (threshold run: accuracy cited but not that it now handles 118 of 200); `costMissing` (Cost empty or "nothing"/"没什么" while the run shows tech→content 4 → 7 or people 50 → 82); `predictionEcho` (quotes their step-3 prediction against the run: "You predicted more work for people; your run agrees: 50 → 82."); `numbersMatched` (KEEP); `watchVague` (Watch has no metric word).

**Revision (done-screen echo).** On each read, snapshot `{box: text}` and each note's rule id into `ls.data.read`. On "Read again", diff: word/char delta, numbers added/removed (KNOWN only), hedges removed, step/action names added, and whether each rule still fires. A note counts as **addressed** only if its rule no longer fires; otherwise it's just resolved, and nothing is claimed. The re-read leads with what changed: "Your Why now carries the number: 75.0% → 62.5%." / "“理由”里现在有数字了：75.0% → 62.5%。". If ≥ 1 note was addressed, `summary().artifact.trace` returns a one-line mono trace that core shows in the done screen's chapter 01 figCap row: `REVISED AFTER A SECOND READ · WHY NOW NAMES 62.5% · RECOMMENDATION 41 → 22 WORDS` / `按批注修改 · 理由补上了 62.5% · 建议 41 → 22 词`. Counts are words and numbers only, never quality. No read, or no addressed note → nothing appears (no empty state, no nag). Brief may add one `did` fact: "Tightened your recommendation after a second read (41 → 22 words)." / "按批注精简了建议（41 → 22 词）。"

**State.** `ls.data.read = { at, hash, regen: {noteId: n}, notes: [{id, rule, kind, box, quote, s, e, n, resolved, addressed}], snap: {box: text}, prev: {…} }`. Saved with `MP.save()`; streaming plays only when `MP.ai.fresh("read."+lens, hash)` says this output is new.

**Samples.**

*BA, sample student* (`d.tr = LEAK`, `action = email`, `guard = quality`; Risk ends "Too many emails could annoy people.")
- Trace: `READING · Recommendation · Why · Risk · What we'll measure · your step 2 pick · your test plan` / `正在读 · 建议 · 理由 · 风险 · 要看的指标 · 你第 2 步的选择 · 你的试验方案`
- ① KEEP on “Fix “Active in week 1 → Started an assignment” first.”
  - en v1: "Your decision is the first thing a busy lead reads, and it names the exact step. They could act on this line alone." `[BA·2 · FIND THE LEAK →]`
  - en v2 (↻): "Decision first, evidence second: that's the order a product lead reads in. Keep this opening."
  - en v3 (↻): "This opening already does the hardest job: one step, one action, before any numbers."
  - zh v1: "第一句就写清了决定，还点名了具体是哪一步——忙碌的负责人只看这一句也能行动。"
  - zh v2: "先写决定，再给证据，正是产品负责人读东西的顺序。这个开头保留。"
- ② TRY on “about 409 more learners would have started an assignment”
  - Gentle/Short en: "Would your lead know what 409 starts means for the 27% they track? About 246 of them would have finished. Half a sentence links the two." `[BA·2 →]`
  - Direct/Short en: "Turn 409 starts into completions (about 246). That's the number your lead tracks."
  - With reasons adds: "Leads track completions, so a number in their own unit saves them a calculation."
  - zh Gentle: "409 是“开始作业”的人数。负责人能一眼换算成完成率吗？其中约 246 人会最终完成课程，补半句就接上了。"
  - zh Direct: "把 409 人开始作业换算成完成人数（约 246），这是负责人真正盯的数字。"
- ③ A READER MIGHT ASK on “Too many emails could annoy people.”
  - en: "You name email fatigue as the risk, but your guardrail is average assignment score. Would unsubscribes catch the annoyance sooner, or is there a reason score matters more?" `[BA·4 · DESIGN A TEST →]`
  - zh: "你写的风险是“邮件太多惹人烦”，但护栏选的是作业平均分。如果担心打扰，退订率会更早发现问题——或者写明为什么平均分更重要？"
- After "Got it" on ② and ③ and "Read again" with text unchanged, the next-ranked note appears (`mixRisk`): "Your Risk says partner-offer learners “may stick with it less.” In the DS lens you found about half the drop (3.25 points) comes from that mix. One clause on how the test would tell the two apart?" / "你在风险里写了合作渠道的学员“可能更难坚持”。你在 DS 视角里发现，约一半降幅（3.25 个百分点）正来自人群构成的变化。要不要加半句，说明试验怎么把两者分开？" `[DS·3 →]`

*BA, a different student* (`d.tr` = lesson → week 1, `why = ["lost"]`; Rec "I think maybe we should improve onboarding because a lot of people leave at the start.")
- ① KEEP: "Short enough to read in one breath, which suits a busy lead." / "够短，忙碌的负责人一口气就能读完。"
- ② TRY on “a lot of people”: "Which number made you decide? In step 2 you picked the step that lost the most people: 1,404 recent learners (75% → 70%). Put that number here." / "是哪个数字让你下的决定？你在第 2 步选的那一步流失人数最多：近期 1,404 人（75% → 70%）。把这个数字写进来。" `[BA·2 →]`
- ③ NOT SURE on “onboarding”: "I'm not sure whether “onboarding” means the welcome emails or the week-1 lessons. Naming one makes it testable." / "我不确定“新手引导”指的是欢迎邮件还是第一周课程。点名其中一个，就能拿来做试验。"
- Read again later surfaces `decisionLate` on “I think maybe”: "Two hedges come before the decision. Try starting with the verb, “Improve week-1 onboarding…”, and keep the doubts for Risk." / "决定前面有两个“可能”。试试直接用动词开头：“改进第一周的新手引导……”，把顾虑放进“风险”。"

*DS, an overclaiming student* (`split = half`, `conclude = b`; Found "The partner program caused completion to drop. This proves partner learners are worse students." How sure "100% sure, it's significant.")
- ① KEEP: "You name the channel, which is exactly where your split in step 3 pointed." / "你点出了渠道，这正是你第 3 步拆分时指向的地方。" `[DS·3]`
- ② A READER MIGHT ASK on “caused”: "Your own split in step 3 found about half of the 6.5-point drop is mix, and half is a real drop inside both channels. Does “caused” give the partner program all of it?" / "你在第 3 步自己算出：6.5 个百分点里约一半来自构成变化，另一半是两个渠道内部的真实下降。“导致”是不是把全部原因都归给了合作渠道？" `[DS·3 · SPLIT BY CHANNEL →]`
- ③ TRY on “significant”: "A product lead may hear “significant” as “important”. Say what you checked: the drop after cohort 6 is well outside the normal cohort-to-cohort wobble." / "负责人可能把“显著”听成“很重要”。直接写你核对了什么：第 6 批之后的下降，远超批次之间的正常波动。" `[DS·2 →]`

*AI, a student who raised the threshold* (Changed "Raised the confidence threshold from 0.60 to 0.75." Improved "Accuracy went up." Cost empty.)
- ① KEEP: "One change, named exactly. That's what makes the before and after comparable." / "只改了一处，而且写得很准，前后才有可比性。" `[AI·3]`
- ② TRY on “Accuracy went up.”: "Up from what to what, and out of how many? Your run shows 82.0% → 89.8% on the messages it handled, but it now handles 118 of 200, not 150." / "从多少升到多少？分母是什么？你的运行结果是：自动处理部分的准确率 82.0% → 89.8%，但自动处理的消息从 150 条变成了 200 条里的 118 条。" `[AI·3 · YOUR RUN →]`
- ③ A READER MIGHT ASK (anchored to the "What it cost" fold, no highlight): "Your run sent 32 more messages to a person (50 → 82). Is that worth a line in “What it cost”? It's the first thing a support lead will ask." / "这次改动让转人工的消息多了 32 条（50 → 82）。值得在“代价”里写一句吗？支持团队负责人最先会问的就是这个。"

### AI-2 · Ask about this step — owner: **core** (shell card + generic chips) with **lenses** (per-step context line + 1–2 step chips)

**Route / trigger.** Every content step `#/lens/<id>/<stepId>`. The folio's right-hand "Need a hint?" becomes one quiet control: **"Ask about this step"** / **"就这一步问问"** with the reading-ring mark. It opens an inline card where the hint box is today (below the work, above the reveal). Evidence chips elsewhere (Brief, Compare) that point into a step open the step with the card closed; they don't open it.

**Form.** An inline `.rd-ask` card (graphite margin surface, kicker `ASK · STEP 2 · FIND THE LEAK` / `提问 · 第 2 步 · 找漏点`):
1. **Context line** (streamed once per open, from `step.ask.seen(ls)`): "Looking at what you've done: …" / "看了你目前的进度：……". It names the student's current state on this step and never the intended answer.
2. **Up to 3 suggested-question chips**: (a) always first: **"Give me a nudge"** / **"给我一点提示"**, which walks the existing fixed hint ladder (Nudge → Pointer → Example; label becomes "A bit more" / "Show an example" as now) and **still increments `st.hints`**, so the Brief and the Advisor filters keep working; (b) 1–2 step chips from `step.ask.chips(ls, ready)`; (c) one core chip: "What does ‘{term}’ mean here?" when `step.lead` contains a `[[glossary]]` id (answer = glossary def + one sentence tying it to this step's number, supplied by `step.ask.term?.(ls)` or omitted), else "Where does this show up in a master's?" (from `step.shows`).
3. **Thread**: each asked chip becomes a turn: the question in mono small caps → a streamed answer (serif 16) with cite chips → a quiet "↻ Say it another way" (`↻ 换个说法`) with a mono "2 of 3" counter. Asked chips leave the chip row and the next-ranked chip takes their place.
4. **No input box.** No persona, avatar or name.

Cite chips here point at elements on the same screen (`data-rd-src` on the funnel bar, cohort point, message card, slider). Hover/focus lights the target with a 3× `ld-breathe` ring in `--lens-glow`; click scrolls to it.

**Ready gate.** Before `step.ready(ls)`, step chips explain concepts and say where to look; they never reveal or rank the options. After ready, they can discuss the student's pick, what-ifs and trade-offs.

**States.** idle (link) → open: reading (a 2–3 item trace of what's on screen, e.g. `READING · your pick · FIG. 2 · recent cohorts`) → streaming context line → done; per chip answer: streaming → done → regenerate; unsure: a chip whose slots can't be filled is simply not offered.

**Lens contract addition** (each content step, optional but expected):
```js
ask: {
  seen(ls, lang) → { en, zh } | segments,          // one sentence about the student's current state on this step
  chips(ls, ready) → [{ id, q: {en, zh}, a(ls) → { segs: {en:[…], zh:[…]} | variants, cites: [{lens, step, label, src}] } }],
  term(ls) → { en, zh }                             // optional: ties the glossary term to this step's number
}
```
Answers use 3 variants per language (opener + 1–2 data sentences + closing question or pointer). Every number used emits a chip. **Minimum per lens: `seen` on all 5 steps, one step chip on steps 2–4.** State: `st.ask = [{chip, v}]` (core adds to the step-state shape); finished turns render static on revisit.

**Samples.**
- BA funnel, before a pick — seen: "Looking at what you've done: you haven't picked a step yet. Each pair of bars is one step, earlier cohorts on the left, recent on the right." / "看了你目前的进度：你还没选步骤。每一组柱子是一步，左边是前期批次，右边是近期批次。" Step chip: "Should I look at people or percentages?" → "Both tell you something different. Headcount says how many learners a fix could reach; the percentage says how much a step changed between earlier and recent cohorts. Which one would a lead with one quarter care about more?" / "两者说明的事不同。人数告诉你一个改动能影响多少学员；百分比告诉你这一步在前后批次之间变了多少。如果负责人只有一个季度，你觉得哪个更要紧？"
- BA funnel, after picking "Started first lesson → Active in week 1" with "Most people lost" — seen: "You picked “Started first lesson → Active in week 1” because the most people were lost there." / "你选了“开始首课 → 首周活跃”，理由是这一步流失的人最多。" Chip "Why do practitioners weigh the % change too?" → "Your pick did lose the most people: 1,404 recent learners. The next step lost fewer (1,228), but against earlier cohorts it fell much further: 75.0% → 62.5%, a 12.5-point drop, versus 75% → 70% at yours. Practitioners usually weigh both: how many people, how much it changed, and how fixable it is." `[FIG. 2 · 75.0% → 62.5%]` (lights the week 1 → assignment bar) / "你选的这一步确实流失人数最多：近期 1,404 人。下一步流失的人少一些（1,228 人），但和前期相比降得多得多：75.0% → 62.5%，掉了 12.5 个百分点；你选的那步是 75% → 70%。做这行的人通常会同时看三件事：涉及多少人、变化多大、好不好改。"
- AI errors, one card tapped — seen: "You've tapped 1 message so far (M-014). One more card with similar wording will show whether it's a pattern." / "你目前选了 1 条消息（M-014）。再选一条用词相似的，就能看出是不是规律。"
- DS trend, band off — seen: "You're looking at cohort 11 (19.0%) without the expected-wobble band. Turning it on shows how far a single cohort can drift by chance." / "你正在看第 11 批（19.0%），还没打开“正常波动”带。打开它，就能看到单个批次靠运气能偏多远。" `[FIG · COHORT 11]`

### AI-3 · Reflect follow-up — owner: **core** (reflect step)

**Route / trigger.** `#/lens/<id>/reflect`. Appears under "Anything you noticed?" after the student picks a part, or when the note field loses focus with ≥ 5 words (en) / ≥ 8 chars (zh). One follow-up per lens, ever. It never blocks "Finish lens".

**Form.** One small margin note, no leader line, no tone controls: the reading ring breathes twice → one serif question streams, quoting a fragment of their note (a wash in the current lens's soft colour) and naming one of their own marks → 3 answer chips + "Skip" (`跳过`). A quiet "Say more" (`再说两句`) opens an optional one-line field. After a chip: one calm acknowledgement line (not praise) that says where it goes: "Noted. It'll appear under What stood out in your Brief, only for you." / "记下了，会出现在小结的“你注意到了什么”里，只有你能看到。"

**Inputs.** `refl.pick` (step id | none), `refl.note`, the picked step's `energy` / `hard`, other marked steps in this lens.

**Composition.** Rules in priority order (2 phrasings each per language):
1. Pick is a step marked hard (enjoyed or not) → "Hard in a good way, or just hard?" chips [Hard in a good way · Just hard · Not sure] / [难得有意思 · 就是难 · 说不准].
2. Note has a surprise marker (expected, surprised, click, realised, didn't think / 没想到, 原来, 才明白, 一下子) → "Was it the topic you liked, or the surprise?" chips [The topic · The surprise · Not sure] / [话题本身 · 那一下的意外 · 说不准].
3. Pick = none → "Nothing here you'd want every week. Was it the problem, or this kind of work?" chips [The problem · The kind of work · Not sure] / [这个问题 · 这类工作 · 说不准]. Before the question, one line: "That's a real answer too." / "都不想做，也是一个真实的答案。"
4. Pick is an enjoyed step → "What pulled you in: the numbers, or deciding what to do with them?" chips [The numbers · The deciding · Both] / [数字本身 · 做决定 · 都有].
5. No pick, note with negative affect (boring, confusing, lost / 无聊, 困惑, 看不懂, 晕) → "Which part felt that way?" chips = up to 2 of their marked steps + Not sure.
- Quote extraction: the clause containing a surprise/affect word or a lens noun, else the first clause, trimmed at clause boundaries to ≤ 12 words / ≤ 20 chars.
- Silence (no follow-up) when there's no pick and the note is too short or has no signal ("ok", "没有").

**State.** `ls.refl.follow = { rule, a, more }`. **Private**: follow-up answers inherit the reflection's "Only you see the answers" promise. My Brief only (with the existing "only you see this" lock), never Advisor, Family or Program view.

**Samples.**
- BA, sample student (pick "Design a small test", marked hard + enjoyed; note "Dragging the slider made it click — proving a small lift takes far more learners than I expected."): "You picked “Design a small test” and also marked it hard. You wrote that dragging the slider “made it click”. Hard in a good way, or just hard?" / "你选了“设计一个小范围试验”，也把它标成了有难度。你写到拖动滑块时“才真正明白”。是难得有意思，还是就是难？"
- DS, sample student (pick "Is it the learners, or the course?", hard; note "…was the moment it clicked."): "You picked “Is it the learners, or the course?” and marked it hard, and you called it “the moment it clicked”. Hard in a good way, or just hard?" / "你选了“是学员变了，还是课程变了？”，也标了有难度，还说那是“一下子明白”的时刻。是难得有意思，还是就是难？"
- Pick none: "That's a real answer too. Nothing here you'd want every week. Was it the problem, or this kind of work?" / "都不想做，也是一个真实的答案。是这个问题本身不吸引你，还是这类工作？"

### AI-4 · Brief: drafted from your work + Worth talking through — owner: **brief** (brief.js, css/brief.css)

**Route / trigger.** `#/brief`, all three views. The ink **In short** strip is presented as a draft composed from the record. It streams when the input fingerprint for the current view changes since it was last shown (`MP.ai.fresh("brief.short."+view, fp)`; fp = done steps + feelings + reflections + follow-ups + write-up text + `left[]` + regen), or on "↻ Another wording". Otherwise it renders instantly. Print always shows final text.

**Form.**
- Above the three rows, a mono reading trace in `--on-ink-2`: `READING · 13 steps you marked · 2 handed-in documents · 2 reflections` / `正在读 · 你标记的 13 步 · 2 份交付物 · 2 条回顾` (only sources that exist; a follow-up adds `· 1 follow-up` / `· 1 个追问`). Hollow dots fill as each source is read; when done it collapses to `DRAFTED FROM YOUR WORK · EVERY LINE LINKS TO ITS SOURCE` / `据你的作答起草 · 每句都可追溯`.
- The 3 lines stream in serif in the lens on-ink colours already used for 01/02/03. The student's own words sit in curly quotes, sans, with a `--lens-on-ink` underline (no fill on ink).
- Every line ends in 1–2 superscript cite chips (`[BA·4]`, `[DS·summary]`, `[your reflection]` / `[BA·第4步]`, `[你的回顾]`), mono 13px. Hover/focus lights the matching row further down (its fold auto-opens; the row flashes the lens-soft wash for 900ms, via `data-rd-src`). Click goes to the step.
- A quiet toolbar under the strip: **"↻ Another wording"** (`↻ 换个说法`) · **"What it read"** (`它读了什么`, a fold listing every input used, by lens and step) · per-line on hover/focus: **"Leave out"** (`不写这句`), which promotes the next-ranked claim for that slot and is saved in `MP.state.brief.ai.left`.
- **"What this can't tell you"** gains one AI-written "I couldn't tell…" line on top of the fixed limits, styled as unsure (dashed ring, italic).
- New block after Next steps: **"Worth talking through"** (My Brief / Advisor) / **"值得一起聊聊"**; Family view: **"Things you could ask them about"** / **"可以和孩子聊聊的话题"**. 2–3 items, hairline list numbered 01–03 in mono; each item = a quoted trigger from the visible record + one question for the advising conversation + cite chip + "Not relevant" (`不相关`, hides it; the next qualifying item streams in) + "↻". Questions only, field-level, no program or university names.
- Switching My Brief / Advisor / Family re-streams only the In-short lines (≤ 0.8s) with a short trace: `REWRITING FOR AN ADVISOR · FIRST PERSON` / `改写给顾问 · 第一人称`, `REWRITING FOR FAMILY · PLAIN WORDS` / `改写给家人 · 通俗说法`.
- In the Advisor view's band, a quiet link "How an advising office sees a cohort →" / "看看顾问办公室怎么看一个年级 →" to `#/school`.

**Inputs.** Each lens's `summary()` (`did`, `move`, `artifact`, `facts`, `artifact.trace`), step `energy`/`hard`/`hints`, `refl.pick`/`note`/`follow` (My Brief only), `MP.progress`, `MP.nextStep()` (order never changed), write-up text (for quotes), the AI-1 revision log.

**Composition (claim slots).** Candidate claims, each `{slot, weight, evidence: [{lens, step, kind, quote?}], payload}`:
- **01 did**: complete lenses ordered by `completedAt` + handed-in artifacts; a looked-through lens says so plainly (existing logic).
- **02 stood out**, priority: enjoyed + hard on the same step (×3) > reflection pick (×2, My Brief only) > the most-enjoyed steps (×1 each) > a hard step. Two hard+enjoyed steps in different lenses → one combined line.
- **03 next**: `MP.nextStep()` as today, plus the strongest cross-lens hook into it (BA checks include `help` → AI; `mix` → DS; DS `next = funnel` → BA; AI pattern = content → BA's assignment step).
- **I couldn't tell**: from absences: an unfinished lens ("whether you'd enjoy AI-style work yet: you're 3 of 6 steps in"), no feelings marked, a skipped write-up, < 2 feelings in a lens.
- **Worth talking through** (ordered rules, top 3, at most 1 per lens when possible): enjoyed+hard step → "which courses teach that skill from scratch, and which assume it?" using the step's `shows`; drained on ≥ 2 steps in one lens → "what does a typical week of that work look like?"; a BA check / DS next that points to another lens → "where do the two kinds of work meet in the program?"; an AI-1 note addressed by revision → writing for non-technical readers in capstones; `refl.pick = none` (My Brief only).
- Voices: **My Brief** = second person; **Advisor** = first person via the existing `firstPerson()`, with hint counts, reflection pick/note and follow-ups removed; **Family** = third person, shorter frames, the existing plain-step table, at most one number pair, no jargon (guardrail → "a safety check", cohort → "group of learners", mix → "who signed up").
- 3 phrasings per slot per voice per language. `↻` rotates phrasings and, among equal-weight evidence, which one is quoted. Facts chosen don't change.
- Validation before render (`MP.ai.check`): every number exists in the fact set; every quote is a substring of the student's text; banned lexicon rejected (fit, suited, suits you, talent, good at, natural, admission, chance, score, rank / 适合, 天赋, 擅长, 录取, 概率, 分数, 排名); on failure try the next phrasing; if all fail, use the existing deterministic `inShort()` copy (error state).

**State.** `MP.state.brief.ai = { left: [], regen: 0, hidden: [] }` (core adds the defaults to `fresh()`; brief owns the contents).

**Samples (sample student).**
- My Brief, en:
  - 01 "You finished the Business Analytics and Data Science lenses and handed in a one-page recommendation and an evidence summary. `[BA·memo]` `[DS·summary]`"
  - 02 "You marked “Design a small test” both enjoyed and hard, and chose it as the part you'd do every week. `[BA·4]` `[your reflection]`"
  - 03 "Next: finish the AI lens. You're 3 of 6 steps in; the AI lens follows the help-request question you flagged in BA step 3. `[AI·4]` `[BA·3]`"
  - I couldn't tell: "Whether you'd enjoy AI-style work yet. You're 3 of 6 steps in; your two marks there are a start, not an answer."
  - ↻: 02 "Twice, the step you marked hard was also one you enjoyed: “Design a small test” in BA and “Change one thing, then re-run” in AI. `[BA·4]` `[AI·3]`"
- My Brief, zh:
  - 01 "你完成了商业分析和数据科学两个视角，交了一页行动建议和一份证据小结。`[BA·建议]` `[DS·小结]`"
  - 02 "你把“设计一个小范围试验”同时标成了“喜欢”和“有难度”，回顾时也选它作为愿意每周做的部分。`[BA·第4步]` `[你的回顾]`"
  - 03 "下一步：把 AI 视角做完。你已完成 3/6 步；AI 视角追的，正是你在 BA 第 3 步提出的求助问题。`[AI·第4步]` `[BA·第3步]`"
  - 说不准的地方："你是否喜欢 AI 方向的工作，现在还说不准：只做了 3/6 步，这两个标记只是开头，不是答案。"
- Advisor, en 02: "I marked “Design a small test” both enjoyed and hard." (reflection clause removed). zh: "我把“设计一个小范围试验”同时标成了“喜欢”和“有难度”。"
- Family, en 02: "They enjoyed planning a small experiment most, even though they found it tricky." zh: "孩子最喜欢的是设计一个小实验，虽然觉得有点难。"
- Worth talking through, Advisor, en:
  - 01 "I marked “Design a small test” as enjoyed and hard. Worth asking: in experimentation courses, is sample size taught from scratch, or assumed? `[BA·4]`"
  - 02 "Before acting, I'd check whether stuck learners got help in time. Worth asking: where do analytics and AI work meet in the program, and in which projects? `[BA·3]`"
  - 03 "I found “Is it the learners, or the course?” hard. Worth asking: how much of the statistics coursework is about telling a change in who's measured from a real change, and what support is there? `[DS·3]`"
- zh: 01 "我把“设计一个小范围试验”标成了既喜欢又有难度。可以问：实验设计类课程会从样本量讲起，还是默认已经会？" 02 "动手之前，我会先查卡住的学员有没有及时得到帮助。可以问：项目里分析和 AI 方向在哪些课程或项目里交汇？" 03 "我觉得“是学员变了，还是课程变了？”有难度。可以问：统计类课程里，有多少内容是在区分“测量对象变了”和“真的变了”？这方面有什么辅导？"
- Family "Things you could ask them about": "Ask them about planning the small experiment: what made it tricky, and what made it fun?" / "可以问问孩子设计小实验的那一步：哪里难，哪里好玩？"

### AI-5 · Compare: the thread across your lenses — owner: **brief** (compare.js, css/brief.css)

**Route / trigger.** `#/compare` (≥ 2 complete lenses). The ink "Where they overlap" band: the fixed synthesized sentence becomes a thread that quotes the student's own work from two artifacts. It streams once per fingerprint (`compare.thread`); otherwise static. Also used, at most one line, in the done screen chapter 02 when ≥ 2 lenses are complete (core asks compare for `MP.pages.compare.thread()` if present; omitted otherwise).

**Form.** Reading trace (`READING · your memo · your evidence summary · BA step 2 · DS step 3`), then 1–2 serif sentences with lens-coloured quote rules (`--lens-on-ink` underline per source lens) and cite chips. "↻ Another wording". The "Skills used in each" chips stay fixed.

**Composition (keyword bridges, priority order; show up to 2).**
1. **Mix**: a mix/partner/构成/合作 word in BA risk (or BA checks include `mix`) + DS `split = half` → quote the BA phrase + DS's 3.25 of 6.5 points.
2. **Funnel**: DS `next = funnel` + BA `d.tr = LEAK` → DS asked where; BA had found it (75.0% → 62.5%).
3. **Help**: BA checks include `help` (or a help word in risk) + AI pattern = content → BA asked the question; AI found content→tech is 15 of 27 mistakes.
4. **Help, unanswered**: DS `next = help` and AI not complete → "the AI lens is where that gets answered".
- Quotes are exact substrings, trimmed at clause boundaries. No bridge fires → the existing fixed sentence (no AI styling).

**Samples (sample student).**
- en: "In your memo you named a risk: partner-offer learners “may stick with it less” `[BA·memo]`. In your evidence summary you measured it: about half of the 6.5-point drop (3.25 points) comes from that change in mix `[DS·3]`. And when DS asked where in the course the drop happens, your BA funnel had already found it: 75.0% → 62.5% `[DS·4]` `[BA·2]`."
- zh: "你在建议里把一个风险写成：合作渠道的学员“可能本来就更难坚持”`[BA·建议]`；在证据小结里，你算出了它的大小：6.5 个百分点里约 3.25 个来自构成变化`[DS·第3步]`。DS 问下降发生在课程哪一步，你在 BA 的漏斗里已经找到了：75.0% → 62.5%`[DS·第4步]` `[BA·第2步]`。"

### AI-6 · Dashboard: Noticed + why this next — owner: **progress** (dashboard.js, css/dashboard.css)

**Route / trigger.** `#/dashboard`, inside the ink Next-step hero: one line between the step meta and the primary; plus one "Why this next" line under the hero title. Streams once per new observation id or new next step; static on later visits.

**Form.** Ring mark + mono kicker **NOTICED** / **留意到**, one serif sentence, one cite chip. On hover/focus: a tiny "Another" (`换一条`) and "Not useful" (`没帮助`, hides that observation id for good). In the progress map, the lens row the sentence refers to gets a small ring dot in its "Last felt" cell. "Why this next" is plain serif, no controls. The hero keeps exactly one primary.

**Composition.**
- Noticed, rules with scores; show the top one not shown in the last 2 visits (rotation in `MP.state.ai.dash = {shown: [], hidden: []}`):
  1. hard + enjoyed on the same step (two in different lenses → combined line);
  2. hints ≥ 2 on a step, then finished it (My view only; it's the student's own dashboard);
  3. a reflection follow-up answer ("Hard in a good way") tied back to that step;
  4. skipped steps waiting in a lens ("One step in DS is still open; it's short.");
  5. fallback: time since last visit + steps left ("You were last here 2 days ago; you're 3 steps from finishing AI.").
- Why this next: `MP.nextStep()` decides (never reordered). The reason is picked from cross-lens hooks: resume > a hook from earlier work (BA `help` → AI; BA `mix` → DS; DS `next` → its lens; AI pattern content → BA) > the recommended lens > neutral ("Same LumenLearn data, a different way in: about 15 minutes." / "同一份 LumenLearn 数据，换个角度进去，大约 15 分钟。"). 2 phrasings per hook.

**Samples (sample student).**
- Noticed, en: "Twice now, the step you marked hard was also one you enjoyed: “Design a small test” in BA and “Change one thing, then re-run” in AI. `[BA·4]` `[AI·3]`"
- zh: "已经两次了：你标为有难度的那一步，恰好也是你喜欢的：BA 的“设计一个小范围试验”和 AI 的“只改一处，再跑一遍”。`[BA·第4步]` `[AI·第3步]`"
- Another (rule 2), en: "You asked for the worked example on “Design a small test”, then finished it your own way." zh: "在“设计一个小范围试验”这一步，你看了示例，然后用自己的方式做完了。"
- Why this next, en: "Picks up where you left off in the AI lens, which follows the help-request question you raised in BA step 3." zh: "接着你在 AI 视角里停下的地方；这个视角追的，正是你在 BA 第 3 步提出的求助问题。"

### AI-7 · Quick Start: in your own words — owner: **front** (home.js, css/front.css)

**Route / trigger.** `#/home` Quick Start (and the welcome-back state). A third, optional input under Q2: **"Or say it in your own words"** / **"或者用你自己的话说"**, a 2-line textarea with a rotating placeholder ("e.g. I like economics but I'm not sure I can code" / "比如：我学经济，但不确定自己会不会写代码"). It's read on blur, on Enter, or via a small quiet "→" button; never on every keystroke.

**Form.** Above "START HERE" in the lens-colour result slab: a reading line where the student's matched phrases appear as small quoted chips that light one by one ("‘why numbers change’", "‘not sure I can code’"), each drawing the beam it points to in the split mark (`MP.draw.splitMark(lens, {just: true})`). Then one reason sentence that quotes their words, an optional reassurance line for a detected worry, and a fixed boundary line: "Where your words point, not a fit score. All three stay open." / "这只是你的话指向的方向，不是匹配分。三个视角都可以试。" One primary, as today.

**Upstream rule (doc 08): free text never changes the ranking.**
- Q1 has picks → the existing rule decides the lens and `MP.state.recommended` exactly as today. The text only rewrites the reason as CONTEXT (quotes their phrase) and may add "You also mentioned X; the DS lens covers that."
- Q1 empty or "Not sure" → the text does **not** pick a lens. The slab keeps its current empty/Explore state and adds "Your words lean toward Data Science. Tap it above to start there." The suggested Q1 chip gets a dashed outline; one tap confirms. Nothing is auto-checked.

**Composition.** Lexicons per lens (en tokens, zh substrings): AI (model, machine learning, ML, LLM, chatbot, neural, automate / 模型, 机器学习, 大模型, 算法, 人工智能); DS (statistics, data, experiment, causal, why numbers change, uncertainty, research / 统计, 数据, 实验, 因果, 波动); BA (business, product, strategy, consulting, marketing, finance, decision, management / 商业, 产品, 咨询, 营销, 决策, 管理). Concerns: code/coding/programming / 编程, 写代码 → "No lens here needs code; everything runs in the browser." / "这里的三个视角都不用写代码，全部在浏览器里完成。"; math / 数学 → same shape; difference / 区别 → points to Explore; job, salary, offer / 就业, 薪资 → boundary: "We can't speak to jobs or pay; we can show you the work." / "我们没法谈就业和薪资，但可以让你看到真实的工作。"; parents, family / 家人 → mentions the Brief's Family view. Score = hits per lens, phrases ×2; ties by the existing rule order. Reason = opener (3 variants) + the strongest matched phrase quoted as an exact substring (≤ 6 words of context) + the lens's `handIn` line + optional worry line. Nothing matched → unsure: "I couldn't tell which way your words lean, and that's fine. Explore shows all three side by side." / "从你的话里还看不出偏向哪边，这很正常。“探索专业”里可以把三个视角并排看。" No regenerate here.

**State.** `MP.state.qs.text` (local only; never shown to advisors, never in the Brief).

**Samples.**
- en (Q1 = DS): "I studied econ and like figuring out why numbers change, but I'm not sure I can code well enough." → chips ‘why numbers change’ → DS beam, ‘not sure I can code’ → worry. "You said you like figuring out “why numbers change”. That's the heart of the DS lens: checking whether a drop is real or just a change in who signed up. On coding: no lens here needs it; everything runs in the browser."
- zh (Q1 = BA): 「我是学市场营销的，想做跟产品决策有关的工作，不过最近 AI 很火也有点心动。」→ "你提到想做“产品决策”相关的工作，商业分析视角最后交的正是一页给产品负责人的行动建议。你也说对 AI 有点心动，做完可以接着试 AI 视角，三个视角用的是同一份数据。"
- unsure: "idk honestly" → the unsure line above.

### AI-8 · Program view: cohort digest — owner: **school** (NEW js/pages/school.js, css/school.css)

**Route / trigger.** New route `#/school`, page title "For advising offices" / "顾问办公室视图". Reached discreetly: a quiet link in the footer colophon (core) "For advising offices →" / "给顾问办公室 →", and the Brief Advisor-view link (brief). Not in the main nav; never competes with the student CTA on home.

**Form.** Same Living-data style; one ink band (the digest hero).
1. Masthead: kicker `PROGRAM VIEW · SPRING ADVISING COHORT` / `项目方视图 · 春季咨询年级`, title "What 42 students found when they tried the work" / "42 位学生试做之后的发现", a "42 FICTIONAL STUDENTS · TEACHING DATA" pill (`42 位虚构学生 · 教学数据`), and filters as chips from `MP.profileOptions` (stage, background; "All" default).
2. **Ink hero, Cohort digest**: reading trace `READING · 42 Briefs · 67 reflections · 31 shared write-ups` / `正在读 · 42 份小结 · 67 条回顾 · 31 份共享交付物` (every count computed from the generated cohort; values in this spec are illustrative), then 3 streamed themes. Each theme = a count ("19 of 42" / "42 人中 19 人"), one serif sentence, and a quote strip with 2 anonymised quotes (sans, curly quotes) plus "Show another" (`换两条`).
3. **Where students got stuck**: a code-drawn step map across BA · DS · AI (15 dots in lens order, dot area = share of students who reached the step and marked it hard, used hint level 2+ or skipped). Counts always carry their denominator ("14 of the 30 who reached it"). The top 3 get a one-line explanation with a cite chip to the step's content (`DS·3 · SPLIT BY CHANNEL`).
4. **Questions for advising sessions**: 4 generated prompts, each with a quiet "Copy" (`复制`).
5. **1:1 prep**: pick a shared Brief (Student 07, Student 19, Student 31, and "You (this device)" when ≥ 1 lens is complete). A margin note writes 3 conversation openers from that record's marks.
6. **What this view never shows** (a calm line, not a disclaimer): "No student rankings or scores. Groups smaller than 5 aren't summarised. Students choose what to share." / "不给学生排名，也不打分。少于 5 人的小组不做汇总。分享什么由学生自己决定。"
- One primary: **"Export advising notes"** / **"导出咨询笔记"** (print). At 390 the step map wraps into three rows (one per lens).

**Composition.**
- **Cohort** (deterministic): 42 fictional records from `mulberry32(4242)`, stable across loads. Each record: profile tags sampled from `MP.profileOptions`; lenses tried (BA .78, DS .71, AI .52; complete given tried .80); per-step priors — hard: BA ratio .10, funnel .22, missing .12, test .41, memo .25; DS claim .14, trend .20, split .46, conclude .30, summary .28; AI numbers .24, errors .12, change .35, tradeoff .38, note .27. Enjoyed: BA .30/.58/.35/.52/.40; DS .33/.55/.44/.41/.30; AI .28/.61/.57/.36/.38. Hints ≥ 2 = hard × .6. Choices: BA `tr` leak .58 / most-lost .27 / other .15; DS `split` half .55 / all .30 / none .15; DS `conclude` b .61 / a .29 / c .10; AI `pattern` content .72 / billing .17 / random .11; AI `tr.ans` depends .57 / yes .31 / no .12. 0–2 reflection snippets drawn without replacement from a hand-written bank of 36 en/zh pairs tagged with themes (`sampleSize`, `writingForDecider`, `mixSurprise`, `readingMessages`, `tradeoffs`, `numbersAnxiety`, `wantsCoding`, `unsureField`), weighted toward the steps that record enjoyed or marked hard.
- **Themes**: tag with the highest count among filtered students (k ≥ 5 required), a theme-specific frame (2 per language) with the count, and the two quotes whose tags match best; "Show another" rotates quotes by seed.
- **Stuck points**: top 3 by (hard + hints ≥ 2 + skipped) / reached. Each explanation comes from an authored misconception line chosen by that step's most frequent non-intended choice (DS split "all" dominant → "many read the reweighted 23.75% as the course recovering"; AI tradeoff "yes" dominant → "many picked Plan B on accuracy alone, before counting the extra human work").
- **Questions**: templates keyed to stuck point × theme.
- **1:1 prep openers**: from that record's marks only (enjoyed, hard, hints ≥ 2, skipped). For "You (this device)", read `MP.ls()` marks only: **no reflection text, no follow-ups, no Quick Start text, no write-ups.**
- Filters re-compose and re-stream the digest (fresh fingerprint). A filter group with < 5 students shows: "Fewer than 5 students in this group, so there's no summary." / "这一组不到 5 人，不做汇总。"
- Numbers are whole counts only ("19 of 42"), never decimals, never per-student values.

**State.** Module-level filter + selected record (like brief's `view`); `MP.state.ai.seen` for streaming.

**Samples (All).**
- Theme 1, en: "19 of 42 · Sample size surprised them. Students who designed the BA test kept coming back to how many learners a small lift needs." Quotes: “I didn't think 5 points would need thousands of people.” · “The slider made it obvious why you test before rolling out.”
- zh: "42 人中 19 人 · 样本量让他们意外。设计过 BA 试验的同学反复提到：一个小改进需要多少学员。" 引语：「没想到 5 个百分点要几千人。」·「拖一下滑块就明白了，为什么要先试再推广。」
- Theme 2, en: "14 of 42 · They liked writing for someone who has to decide. The memo and the model-change note drew the most ‘enjoyed’ marks among write-ups." zh: "42 人中 14 人 · 喜欢为要做决定的人写东西。在交付物里，行动建议和模型改动说明得到的“喜欢”最多。"
- Stuck, en: "DS · Split by channel: 14 of the 30 who reached it marked it hard. Many read the reweighted 23.75% as the course recovering, not as a what-if." zh: "DS · 按渠道拆分：做到这一步的 30 人里，14 人标记为有难度。不少人把调整后的 23.75% 理解成“课程回升了”，而不是一个假设情景。"
- Question, en: "Several of you found the channel split hard but enjoyed it. Would a term of that sound good, or exhausting?" zh: "不少同学觉得渠道拆分难，却也喜欢它：这样的一学期，你觉得是有意思还是太累？"
- 1:1 prep (Student 07), en: "You marked the funnel step hard, then finished it after the worked example. What changed when you saw it?" `[BA·2]` zh: "你把漏斗那一步标成有难度，看了示例之后做完了。看到示例时，哪里一下子清楚了？"

---

## 3. Shared AI kit — owner: **core**

New core-owned files: **`js/ai-kit.js`** (loaded after `core.js`, before pages) and **`css/ai-kit.css`** (after `tokens.css`). Namespace **`MP.ai`** (the AI *lens* stays `MP.lenses.ai`). CSS prefix **`.rd-`** ("reading"), never `.ai-` (that prefix belongs to the AI lens). Data attributes `data-rd-*`.

The kit is **string-first**: render functions return HTML strings, so the kit returns strings with the final text already in place, and `MP.ai.after(root)` (called by `MP.render` after mount) adds the live behaviour. A failure anywhere leaves finished, readable text.

```js
MP.ai = {
  /* ---- mode ---- */
  instant: false,          // true → every AI surface renders finished, no trace or stream animation.
                           // Set by ?ai=instant (read in MP.boot before the query is stripped), and implied when
                           // !MP.live.motionOK() (reduced motion), html lacks .ld-live, or in print.
  motion() → bool,         // !instant && MP.live.motionOK() && html.ld-live
  // ?ai=fresh clears MP.state.ai.seen so every surface streams again (live demos). MP.applySample() and
  // MP.resetState() also clear MP.state.ai.

  /* ---- determinism ---- */
  hash(str) → uint32,                 // FNV-1a
  rng(seed) → () => number,           // mulberry32, [0,1)
  pick(list, seed) → item,
  fp(obj) → string,                   // fingerprint = hash(JSON.stringify(obj)) in base36
  variant(key, n, base) → index,      // (base + MP.state.ai.regen[key]) % n
  bump(key) → n,                      // regenerate: increments MP.state.ai.regen[key]
  say(variants, key, base) → string,  // MP.t(variants[variant(key, len, base)]) — variants {en:[…], zh:[…]} or [{en,zh}…]

  /* ---- cache: has this exact output been shown? ---- */
  fresh(key, fp) → bool,   // true when fp differs from MP.state.ai.seen[key]; records fp as shown (MP.save()).
                           // Call once per render of the surface; pass the result as opts.animate.
                           // A re-render or reload with the same fp → false → static. Language is part of fp only
                           // when the text itself changes language (so a language toggle shows the other text instantly).

  /* ---- text toolkit ---- */
  text: {
    lang(s) → "en"|"zh"|"mixed",
    sentences(s) → [{s, e, text}],       // split on . ! ? 。！？ (keeps offsets into the original)
    words(s) → number,                   // en words; zh characters / 1.8 for thresholds that need "words"
    chars(s) → number,
    first(s) → {s, e, text},
    numbers(s) → [{v, raw, s, e, unit}], // \d[\d,]*(\.\d+)? with % / pts / points / 个百分点
    near(v, known, tol=.15) → {match: bool, nearest},
    find(s, lexicon) → [{s, e, w}],      // en: word-boundary, case-insensitive; zh: substring
    clause(s, at, {maxWords: 12, maxChars: 20}) → {s, e, text},  // trimmed at , ; — ， 、 ；
    quote(src, s, e) → string            // exact substring, trimmed at clause boundaries, with … if cut
  },
  lex: { hedge, overclaim, causal, jargon, surprise, positive, negative, actionVerb, banned },  // {en:[…], zh:[…]}

  /* ---- validation (runs before anything renders) ---- */
  check(text, { numbers: [...known], sources: [...studentTexts] }) → { ok, why },
      // fails on: banned lexicon; a number not in `numbers` (±0.15); a “quoted” span that isn't a substring of
      // any source. Callers try the next variant, then fall back. In dev (localhost) a failure console.warns.

  /* ---- rendering (strings) ---- */
  mark({ size: 14, busy: false, unsure: false }) → svg,   // the reading ring
  kicker(label, { busy }) → html,                          // mark + mono label
  trace(items, { key, animate, done }) → html,             // items: [{label, src?}]; done: collapsed label ("Read 4 things")
  stream(segments, { animate, delay, cap, as: "p" }) → html,
      // segments: string | { q: text, lens } (student quote) | { cite } | { b: text } (bold number) | { br: true }
      // Returns the FULL text as token spans (.rd-tok) with per-span --d delays from MP.ai.pace(); animate:false → plain.
  pace(segments, lang, { cap, start }) → [ms...],         // deterministic rhythm, seeded by hash(text)
  block({ key, fp, kind, kicker, trace, body, cites, actions, unsure, cls, live: true }) → html,
      // the standard AI surface: kicker+trace → stream(body) → cites → actions. kind: "note"|"answer"|"line"|"ink".
      // Calls fresh(key, fp) itself. Wraps in <section class="rd-block" aria-live="polite"> (live:false for
      // blocks that render with the page and shouldn't be announced).
  cite({ lens, step, label, src, go }) → html,   // mono chip "BA·2 · FIND THE LEAK →"; data-action="rd-cite"
  quote(text, lens) → html,                      // curly quotes, sans, lens-soft wash (underline on ink)
  unsure(text, opts) → html,                     // dashed ring + italic muted serif
  actions({ regen: [action, arg], resolve: [action, arg], useful: key, dismiss: [action, arg], labels }) → html,
  seg(name, options, value) → html,              // tone/length segs (wraps MP.h.seg with .rd-seg sizing)

  /* ---- DOM, after render ---- */
  after(root),            // for each .rd-block[data-rd-anim]: adds the caret, aria-busy timing, click/Esc to complete,
                          // cite hover → light(); builds mirrors for textarea[data-rd-marks]; nothing if !motion()
  complete(el),           // finish streaming now (adds .rd-done)
  light(src),             // lights [data-rd-src="<src>"] (opens a closed fold first; ld-breathe ×3)
  highlight(textarea, spans),  // mirror backdrop: <mark> spans behind a transparent-text-background textarea,
                               // synced on input/scroll/resize; spans [{s, e, kind, n, quote}]; a span whose text no
                               // longer equals its quote turns .stale; if measured line count differs from the textarea's,
                               // the mirror is removed (quotes in the notes remain)
  feedback(key, val)      // stores "up" | "down" | "hide" in MP.state.ai.fb[key] (local only, never shown to others)
};
```
Events (core registers): `rd-cite` (go to `#/lens/<lens>/<step>` or `light(src)` on the same page), `rd-skip` (complete), plus owners' own namespaced actions for regen/resolve (`ba-read`, `ba-read-regen`, `bf-ai-regen`, …).

**State** (core adds to `fresh()`; `load()` already merges defaults):
```js
ai: { seen: {}, regen: {}, fb: {}, prefs: { tone: "gentle", length: "short" }, dash: { shown: [], hidden: [] } },
brief: { removed: [], notes: [], ai: { left: [], regen: 0, hidden: [] } },
// per step (MP.st):  ask: []          // AI-2 turns
// per lens (MP.ls):  refl.follow: null // AI-3
```

**Core's own AI work, besides the kit:** the footer disclosure line (full + compact colophon, `--on-ink-2`, 15px; on the compact row it may wrap below at ≤ 1024px); the "For advising offices →" footer link; route `#/school` (title bit "For advising offices" / "顾问办公室视图") and `index.html` includes for `ai-kit.js`, `ai-kit.css`, `school.js`, `school.css`; AI-2 Ask card in the lens shell; AI-3 reflect follow-up (needs `data-change="refl-note-done"` on the note to commit on blur); done screen renders `summary().artifact.trace` in the chapter 01 figCap row when present; `MP.applySample()` clears `MP.state.ai`; `?ai=instant|fresh`.

### 3.1 Visual language (tokens in `css/ai-kit.css`, built on `tokens.css`)

- **No persona.** The AI is the product reading your work. No name, avatar, face, sparkle or bare "AI" token (the AI lens tag already uses "AI" in vermilion). Kickers say what it did: `READING` / `正在读`, `READ 4 THINGS` / `读了 4 处`, `ASK` / `提问`, `NOTICED` / `留意到`, `DRAFTED FROM YOUR WORK` / `据你的作答起草`.
- **Mark, the reading ring** (`MP.ai.mark`): a 14px hollow ring with a 1.5px `--ink` stroke (the white node where the split mark fans into beams), carrying three short 70° arcs at 120° spacing in `--ba`, `--ds`, `--ai` just inside the stroke. It reads as "looks across all three lenses" and belongs to no single lens. On ink: `--on-ink` ring with `-on-ink` arcs. Busy: the arcs make up to 2 linear turns (1.2s each) and stop at the rest angle. Unsure: the ring is dashed (the split mark's dashed-beam vocabulary = "not yet"). Never ✦ (the reviewed "What practitioners weigh" boxout owns it).
- **Surface, the margin note** (`.rd-block`): `--paper-2` background, 1px `--hair` border, `--r-panel` radius, a 2px left trace rule in `--ink` at .55 alpha: **dashed while reading/streaming, solid when done**. No corner ticks (ticks stay with the student's own `.work` panels, so "your work" and "its reading" read differently). On ink (Brief In short, Compare band, dashboard hero, Program digest): no box, just ring + kicker + text.
- **Colour = provenance, never approval.** Graphite for AI chrome and text (`--ink-2` text ≥ 7:1 on `--paper-2`; kickers `--muted` ≥ 5:1). The student's words take the soft colour of the lens they came from (`--ba-soft` / `--ds-soft` / `--ai-soft` wash behind `--ink` text; on ink a 2px underline in the `-on-ink` colour). No red/green anywhere in AI output.
- **Type is the honesty device.** AI prose is serif (Newsreader 16/25; zh Noto Serif SC 15.5/26, upright, keep-all with `​` hints, number pairs in `.nowrap`). The student's own words are always sans, in curly quotes (“…” / “…”). Kickers and chips use the mono instrument voice (`--label-font`, 13px).
- **Cite chip** (`.rd-cite`): mono 13px uppercase, hairline pill, lens dot + `BA·2 · FIND THE LEAK`, arrow on hover; min 32px hit area via padding; focus ring from tokens; on ink, `--on-ink-2` text and `--on-ink-line` border. zh: `BA·第2步 · 找漏点`. Print: plain `[BA·2]`.
- **Pins** (AI-1): 13px mono numerals in a 20px ring, `--ink` on `--paper`, tied to their note by number and `aria-describedby`.

### 3.2 Motion spec (all only when `MP.ai.motion()`; base DOM = final text)

1. **Reading trace**: 2–6 items, 180–240ms apart (seeded jitter), each item's dot fills with `ld-pop`; total ≤ 1.2s. At the same time, if the trace names on-page elements, those get one soft `--lens-glow` pass (`ld-breathe` × 1). AI-1 adds a 2px graphite scan line at 25% alpha sweeping once down the boxes (900ms, `--ease-draw`, a real element, gated under `html.ld-live`).
2. **Streaming**: CSS-only. The full text is in the DOM as `.rd-tok` spans with `animation: ld-fade .16s var(--ease-out) both; animation-delay: var(--d)`. First token at trace end + 120ms. en: one word per token, 28–55ms apart, +140ms after `,;`, +260ms after `.?!`; zh: 1–3 character chunks, 35–60ms apart, +200ms after `，、；`, +280ms after `。？！`; numbers arrive as one token at 1.4× the gap so figures "land". The per-token gap compresses so a block never exceeds its cap: note 1.4s, answer 1.8s, one-liner 1.2s, Brief In short 3.2s for all three lines, Program digest 3.2s. Blocks overlap by 150ms.
3. **Caret**: a 2px `--ink` bar created by `after()` only under `ld-live`, moved to the latest visible token on rAF, blinks twice at the end and is removed. Never a pseudo-element.
4. **After the stream**: quote washes wipe in left → right (`ld-wipe`, 240ms); cite chips `ld-pop` with 60ms stagger; the trace rule turns solid (`--t-fast`).
5. **Regenerate**: old text to 40% opacity for 120ms, new text streams at 1.4× speed; the ↻ glyph turns 180° once.
6. **Resolve** (AI-1 "Got it"): card collapses to its pin (`ld-settle`, 300ms); highlight drops to dotted.
7. **Skip**: a click on a streaming block or Esc anywhere completes all streaming blocks (`.rd-done` sets `animation: none`).
8. **No replay**: `fresh(key, fp)` decides; re-renders (every `MP.commit`) and reloads show finished text.
9. **Reduced motion / `?ai=instant` / screenshot tool / print / no JS**: finished text, collapsed trace line, no caret, chips visible. Because streaming is CSS-delayed spans, `tools/shot.mjs` (animations disabled) always captures finished text; use `tools/shot-motion.mjs --wait=<ms>` for mid-stream frames.

### 3.3 Accessibility

- Each AI result region: `<section class="rd-block" aria-live="polite">` with `aria-busy="true"` while streaming (set and cleared by `after()`), so a screen reader announces the finished text once, never per token. Blocks that render with the page on arrival (Brief, Compare, dashboard) use `live:false` to avoid an announcement storm on load; their text is simply part of the page.
- The trace is `aria-hidden="true"`, paired with a visually hidden equivalent ("Based on 13 steps you marked and 2 documents" / "依据：你标记的 13 步和 2 份交付物").
- AI-1 notes are `<aside role="note">` linked from their highlight via `aria-describedby`; one hidden polite region announces "Second read: 3 notes on your draft" / "批注：你的草稿有 3 条批注" and each note's full text after it finishes.
- All controls are real `<button>`s with the shared focus ring; chips carry full labels (`aria-label="Go to BA step 2, Find the leak"`). The Ask card traps nothing; Esc completes streaming, it doesn't close anything.
- Contrast: AI text ≥ 7:1 on `--paper-2`; mono chips and kickers ≥ 4.5:1; `--on-ink-2` is the floor on ink.

### 3.4 Owner checklist (every AI surface)

- Composition is a **pure function** of state + `MP.data` + lang + regen (no `Date.now()` in text except the dashboard fallback's "days ago").
- Every string exists in en **and** zh, written natively in each language (not translated), with `​` hints and `.nowrap` number pairs.
- `MP.ai.check` passes; failures fall back to existing copy without AI styling.
- No AI control is a primary; each screen keeps exactly one `MP.h.primary`.
- 390px: no horizontal overflow; notes and chips wrap; margin columns collapse.
- Shoot en 1440 / zh 1440 / en 390 with `&ai=instant` (final state) and one `shot-motion.mjs --wait=600` frame (mid-stream) per surface; zero page errors.

---

## 4. Not to do

1. No chat window, free-text prompt box, floating "Ask AI" bubble, assistant name, avatar or face. Suggested questions only.
2. No grades, scores, ratings, rubric ticks, strong/weak meters, red/green correctness, completeness signals or counts like "3 issues found". No confidence percentages ("87% sure"), token counts, model names or latency stats.
3. No fit, suitability, talent, aptitude, personality, admission or job-outcome language ("you're good at", "this suits you", "you'd thrive", 你适合, 你擅长, 天赋). The banned-lexicon check runs on every composed string.
4. Never write into the student's boxes, rewrite their memo, or offer "write it for me". The sentence starters stay the only drafting tool; the AI may only rephrase its own notes.
5. Never invent tasks, change step content or the reviewed "What practitioners weigh" copy, invent numbers, or reorder the NEXT recommendation. Free text never changes the Quick Start ranking.
6. Never reveal a step's intended pick before `ready` (Ask card before ready = concepts and where to look).
7. Never interrupt: no auto-reads while typing, no notes on quick-choice steps, no unprompted pop-ins mid-step.
8. Never pad. If evidence slots aren't filled, drop the sentence; say "I can't tell" instead. No generic praise.
9. Never show unvalidated or half-composed output; stream only finished, checked text. No "thinking…" spinners or delays beyond the ≤ 1.2s trace.
10. No per-element "simulated / scripted / fake / AI-generated" badges. One footer disclosure only.
11. Never quote private items (hint use, reflection picks/notes, follow-up answers, Quick Start text) in Advisor, Family or Program views.
12. Don't reuse ✦ or any single lens colour (especially AI vermilion) as the AI's colour; don't use the `.ai-` CSS prefix for kit classes.
13. Don't re-stream finished responses on re-render, reload, or language switch; don't stream the Brief on every visit; never stream in print or under reduced motion.
14. Program view: no individual rankings, leaderboards, per-student scores or tables of students; no summaries of groups under 5; the cohort is always labelled fictional teaching data; no real university names.
15. Don't animate a pseudo-element from hidden or leave any AI element with a base `opacity: 0`.

---

## 5. Five-minute demo path (where the AI beats land)

1. **Home (0:00–0:40)**: type "I studied econ and like figuring out why numbers change, but I'm not sure I can code" → phrases light up and draw the DS beam; the reason quotes the student back; boundary line (AI-7).
2. **BA funnel (0:40–1:30)**: pick the most-lost step → "Ask about this step" → "Why do practitioners weigh the % change too?" streams with the student's own 1,404 vs 1,228 and lights the bar (AI-2).
3. **BA memo (1:30–2:40)**: type a weak first line ("I think maybe we should fix onboarding") → "Get a second read": trace, highlights, three notes, Direct tone, ↻; fix the line, "Read again" leads with what changed (AI-1).
4. **Reflect (2:40–3:00)**: pick a step marked hard → one follow-up question quoting the note (AI-3).
5. **Brief (3:00–4:00)** with `?preset=sample`: In short drafts itself with cites; hover a chip, the source lights; switch to Advisor (re-voiced, private items gone) and show "Worth talking through" (AI-4). Optionally Compare's thread (AI-5).
6. **Program view (4:00–5:00)**: footer link → cohort digest streams; filter by background; stuck map; 1:1 prep for "You (this device)" (AI-8).
Use `?ai=fresh` before a rehearsal so every surface streams again.

---

## 6. Placements by owner

| Owner | Placements | Files |
|---|---|---|
| core | Shared kit (§3), footer disclosure + "For advising offices" link, `#/school` route + includes, AI-2 Ask card (shell + generic chips), AI-3 Reflect follow-up, done-screen revision trace slot | `js/ai-kit.js` (new), `css/ai-kit.css` (new), `js/core.js`, `css/tokens.css`, `index.html`, `CONTRACT.md` |
| lenses | AI-1 Second read (BA memo, DS summary, AI note) + revision trace via `summary().artifact.trace`; AI-2 per-step `ask` (`seen` on all steps, step chips on steps 2–4) | `js/lenses/ba.js`, `ds.js`, `ai.js`, `css/ba.css`, `ds.css`, `ai.css` |
| brief | AI-4 Brief In short draft + "I couldn't tell" + Worth talking through (+ Advisor link to `#/school`); AI-5 Compare thread | `js/pages/brief.js`, `js/pages/compare.js`, `css/brief.css` |
| progress | AI-6 Noticed + Why this next | `js/pages/dashboard.js`, `css/dashboard.css` |
| front | AI-7 Quick Start "in your own words" | `js/pages/home.js`, `css/front.css` |
| school | AI-8 Program view cohort digest, stuck map, advising questions, 1:1 prep | `js/pages/school.js` (new), `css/school.css` (new) |

Build order: core ships the kit and state defaults first (owners can write their composition functions against §3's signatures in parallel and wire rendering once the kit lands). Each owner lists any further core needs under `coreRequests`.
