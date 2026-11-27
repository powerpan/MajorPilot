# MajorPilot: 5-minute founder demo (the AI moments, in order)

Setup, before the meeting: run `python3 tools/serve.py 8790`, open Chrome at 1440 wide, and load
`http://localhost:8790/?preset=fresh&ai=fresh#/home`. `ai=fresh` makes every AI surface stream again (the pace is
part of the effect). Keep a second tab ready at `/?preset=sample&ai=fresh#/lens/ba/funnel` (the "sample student"
who has done BA and DS). If you need a still frame on a slow projector, load the page with `?ai=instant` before the hash (for example
`http://localhost:8790/?ai=instant#/brief`) to show every surface finished; `?ai=live` turns streaming back on.

The one line to remember: **the AI coaches and quotes; it never grades, scores, or predicts fit.**

---

## 0:00 · Quick Start "in your own words" (AI-7, home)

1. Tick **Data Science** in question 1, and pick **"Could I keep up?"** in question 2.
2. Type in "Or say it in your own words", then press Enter:

   > I studied econ and like figuring out why numbers change, but I am not sure I can code well enough.

   zh (switch to 中文 first): `我学经济，喜欢弄清楚数字为什么会变，但不确定自己代码够不够用。`
3. Point at three things: the trace chips light up the DS beam (‘figuring out why numbers change’ → DS); the reply
   quotes the student back; the coding worry gets its own grounded answer.
4. Say: "Free text never changes the recommendation. Question 1 decides that. The words only change how we explain it."
   Optional: delete "econ…change" and type `idk my parents said tech pays`. The AI says honestly that it can't tell
   which way the words lean, and the "not a fit score" line disappears.

## 0:45 · Ask about this step (AI-2, BA step 2 "Find the leak")

Switch to the sample tab (`#/lens/ba/funnel`). Click **Ask about this step** (top right of the step).
- The context line names what it read ("you picked Active in week 1 → Started an assignment because…").
- Click **"What would make my pick wrong?"** The answer uses the real 1,228 figure and points to step 3. Click the
  **BA·3** chip to show that evidence links go to the step they came from.

## 1:30 · Second read on the memo (AI-1, the main beat)

Rail → **Write the memo**. Click **Get a second read**.
- Watch the order: the reading trace (Recommendation · Why · Risk · your step 2 pick · your test plan), a graphite
  scan down the boxes, then the notes one by one. Each note underlines the student's exact words with a numbered pin.
- **① KEEP** always arrives first. Then **② TRY** on "about 409 more learners…" asks whether the lead knows what 409
  starts means for completions (about 246).
- Click **Tone ⋯ → Direct**: the same findings, imperative wording. Click **↻ Another way to say it** on the KEEP.
  It rewords the same point; the finding never changes.
- Now **write**: put the cursor at the end of the **Why** box and add

  > , or about 246 more completions.

  zh: `，也就是大约多 246 人完成课程。`
- Click **Read again**. The header credits the edit: *"Your “Why” box now carries the number 246, so my note about it
  is done."* Then **Continue** and point at the done screen's line "Revised after a second read".

## 2:30 · Reflect follow-up (AI-3)

Open **Reflect** in BA. Pick **Design a small test** (the sample student marked that step hard), then replace the
note with:

> I didn't expect that a 2.5 point lift would need around 6,000 people per group.

zh: `没想到 2.5 个百分点的提升，每组要差不多 6,000 人。`

Click outside the box. The follow-up quotes the whole clause back (figures intact) and asks *"Hard in a good way, or
just hard?"* Answer **Hard in a good way**: one calm acknowledgement, and it's private to My Brief.

## 3:15 · My progress (AI-6)

Top nav → **My progress**. The **Noticed** line connects marks across lenses (hard *and* enjoyed, twice), with
evidence chips. Under the next step, the "why this next" line explains MP's fixed order from the student's own earlier
questions (e.g. the BA step 3 help-request check). Hover the Noticed block: **Another** shows a different observation.

## 3:45 · The Brief drafts itself (AI-4)

Top nav → **My Brief**. The In short strip shows "READING · 13 steps you marked · Your memo · …" and holds there.
**Scroll it into view**: the three lines stream only once they are on screen, each with chips back to its source.
- Toggle **Advisor**: it rewrites in the first person and leaves private notes out (the trace says so).
- Scroll to **Worth talking through**: questions for an advising conversation, each tied to something the student did.
  Field-level, never about a named program.

## 4:20 · Compare: the thread across lenses (AI-5)

Open `#/compare` (also linked from each lens done screen as "Compare your lenses"). The dark band quotes the student's own BA risk sentence next to the
number they measured in DS (3.25 of the 6.5 points). "It read both of my documents" is the reaction you want.

## 4:40 · Program view for the buyer (AI-8)

Footer → **For advising offices** (`#/school`). The cohort digest drafts itself from 42 shared Briefs as you scroll.
Every count has a denominator, groups under 5 aren't summarised, and nobody gets ranked. Close on this: the university
buys this view; students get the five minutes you just saw.

---

## If someone asks "Is that a real model?"

Say: **"In this prototype the AI responses are simulated: deterministic rules compose each one from what the student
actually did and wrote, and the footer says so on every page. With a live model the rules stay the same: every claim
must cite the student's own work, and anything that fails validation falls back to plain text."**

## Recovery tips

- Something streamed before you were looking at it: load `/?ai=fresh` followed by the current hash (for example `http://localhost:8790/?ai=fresh#/brief`), or click **Show it all** /
  press Esc to finish a stream instantly.
- Reset the demo: the footer's **Reset demo**, or load `/?preset=fresh&ai=fresh#/home`.
