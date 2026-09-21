# MajorPilot student web

Vue 3 + TypeScript student application. The project root README owns installation, environment loading and managed startup; do not pass backend secrets to Vite.

## P1 surface

- `/`: editorial introduction and switchable AI / DS / BA task previews.
- `/how-it-works`, `/majors`, `/majors/:code`, `/privacy`, `/terms`: public explanatory content.
- `/intake/1` through `/intake/12`: versioned fields loaded from the backend, optimistic revision saving and temporary local recovery.
- `/recommendation`: the real recommendation is visible before registration; fixed-rule explanations remain usable without model output.
- `/register`, `/verify-email`, `/login`, `/forgot-password`, `/reset-password`: account claim and actual local mail flows.
- `/app`, `/app/settings`: verified-account recommendation, accept/override decisions, three honest initial major states and optional research-consent withdrawal.
- `/p0`: the original fixed-executor verification surface. Synthetic identity probes require the separate `p0` backend profile; they are not P1 registration.

P1 does not create an Experience Run or claim tasks/reports are available. Saving a choice remains separate from starting a future task.

## State and security

`lib/api.ts` selects public or student CSRF by API boundary. Session and Intake credentials are HttpOnly server cookies. A safe path allowlist constrains post-login navigation. Email tokens are read from the fragment and removed before Vue mounts, then retained only in memory for the one-time POST. No third-party assets, fonts or analytics are loaded on mail pages.

The anonymous draft pointer in localStorage contains only its public ID, expiry and last step. Current-tab sessionStorage holds the seven-day draft and its questionnaire definition for interrupted/offline recovery. Local answers are not accepted as server truth: stale revisions produce a visible conflict with a copyable local draft and an explicit reload choice. Registration claim and logout clear these buffers; logout also clears recommendation event retries. Passwords and mail tokens never enter either storage.

Identity changes invalidate pending requests with both an epoch and cancellation. Login, logout and claim send only a reason and random deduplication nonce across tabs; BroadcastChannel and storage events are complementary transports. A remote change immediately unmounts private/draft views and takes that tab to login, preventing component-local responses from remaining on screen. The state suite verifies delayed-response rejection and fallback delivery. Recommendation observations require the primary recommendation region to remain at least half visible in a foreground page for one continuous second; losing visibility restarts that interval.

Components use native controls and visible labels, keyboard-accessible preview tabs and parallel scenario ranks, responsive single-column matrices, explicit offline/error states and reduced-motion support. The mobile header retains navigation in a native keyboard-operable disclosure. The product visuals follow the [accepted home concept](../docs/design/p1-home-v2.png), [exploration reference](../docs/design/p1-explore-v3.png), [Intake reference](../docs/design/p1-intake-v2.png) and [recommendation reference](../docs/design/p1-recommendation-v2.png). Reference screenshots are not rendered as the application; the sculpture is an independent production asset and alternative-major images are real CSS image viewports of that asset.

The technical `/p0` route lazy-loads its own Element Plus components and styles. Product routes use native components and do not pay for the whole technical UI package on first load. No dependency versions or lockfiles changed for this separation.

## Verification

From the root, with the managed `local` backend, student server and Mailpit running:

```sh
data/tools/node/bin/node tests/e2e/p1.mjs
data/tools/node/bin/node tests/e2e/execution.mjs
```

`sh scripts/test-p1-e2e` is the complete root entry point: formal P1 HTTP contracts, event contracts, then both real browser channels. The final complete run passed all three stages without intermediate-diagnosis flags. An earlier attempt stopped at a real `429 RATE_LIMITED` caused by repeated local registrations; it was rerun only after the counter expired naturally. No production limit was weakened and no Redis flush was used.

The P1 suite uses installed Chrome and Edge in isolated test profiles, creates uniquely scoped synthetic accounts, exercises real HTTP and SMTP paths, and removes its own fixture rows and captured emails in `finally`. Screenshots remain outside Git in `/tmp/majorpilot-p1-evidence`. The executor suite is independent of P1 identity and exercises `/p0`.

The automated Chrome/Edge matrix uses regular Playwright. The root agent additionally used Codex's built-in browser to verify public-homepage and preview interactions. Native design-comparison captures use 1536×1024; mobile captures use 390×844, with full-page companions where needed. The independent browser review also covers intermediate desktop widths, not just the concept canvas.

For a focused intermediate diagnosis, `--chrome-only` and `--without-home` exist; neither is the final complete acceptance command. A production build runs `vue-tsc --noEmit` before Vite. Visual acceptance additionally requires reviewing the accepted concepts and latest screenshots together; functional tests alone are not a fidelity claim.

## Deliberate copy differences from the concept samples

- Home and task-preview headings, LumenLearn's fictional context, the three professional perspectives, the main CTA and the task-unavailable boundary are native copy, not text embedded in concept imagery.
- Intake questions and options come from the versioned backend definition. The actual fourth question includes study **or work** background and therefore uses balanced two-line typography; the sample's shorter question is not substituted. `保存并继续` explicitly describes the real save operation.
- Recommendation major, alternatives, reason count, ranking/context/boundary labels and support notes all come from actual API results. The test fixture intentionally considers only BA while preferring the AI scenario, so its result is AI, not the design sample's DS. No sample reason is presented as real evidence.
- The structured-only explanation notice states when optional AI wording is unavailable. The recommendation CTA saves an account-bound suggestion, not a completed or started task.

## Visual review ledger

The accepted references and latest browser captures were viewed together, not inferred from a successful build.

| Check | Observed result |
| --- | --- |
| Palette and type hierarchy | Paper `#F7F5EE`, ink `#171A1D`, ultramarine `#304FFE` and vermilion `#F45B35`; large sans headings with selective system Songti and italic numerals, not the rejected green card design. |
| Home composition | Native two-column headline/CTA and three labelled physical lenses; the independent sculpture has no tint/mask overlay. The 1536px first-fold separator and oversized `03` strip remain in the intended order. |
| Exploration section | Three functional keyboard tabs at left; native preview copy over the separate, text-free paper stage at right. The generated paper supplies its own shadows, blue band and orange fold; no duplicate CSS fold is drawn. |
| Intake | Desktop form starts around x403 and is 730px wide, with 74px open option rows, large orange step number and header progress. Selected rows have a thin blue edge/radio, no grey or coloured tile fill. The longer real question wraps in balanced lines. |
| Recommendation | Left-major/right-alternatives layout, full native major-letter watermark, vertical divider and two image/copy rows. Real AI output uses AI/DS/BA mappings and the actual two reasons; the DS sample's extra reason is not fabricated. |
| Responsive behaviour | Inspected 1200, 1265, 1440 and 1536px desktop widths plus 390px mobile. Mid-width lead text is constrained and naturally wraps clear of the lens; no horizontal overflow. Mobile navigation remains available, forms stack and long recommendations remain readable. |

Known non-blocking visual differences: local system font metrics differ from raster concept typography; dynamic recommendation reason count changes vertical spacing; mobile paper artwork is proportionally cropped to keep native text readable. The two original PNG production assets currently total roughly 3.6 MB; delivery-format compression is still a deployment optimization, not a completed claim. Image source files are preserved.

## P2 generic workspace

`/app/demos` and `/app/demos/:demoKey` expose authenticated technical demonstrations only when the backend explicitly enables them in its local profile. `/app/runs/:runId` is the version-bound workspace. DEMO_TABLE and DEMO_COMPARE are not a fourth major; their completion does not produce a professional report. AI/DS/BA availability remains unchanged.

The workspace uses the [P2 reference](../docs/design/p2-workspace-v1.png) and [reflection reference](../docs/design/p2-reflection-v1.png): three fine-line-separated desktop columns, an open sample table and result strip, three user-requested hint levels, and a separate concentrated reflection form. Existing brand components and system typography are reused. At 1024–1199px help moves into a native dialog; narrower viewports receive an honest device restriction rather than a partial task editor. The task header and step action remain visible while longer content scrolls.

`stores/workspace.ts` keeps server revisions separate from edits and from trusted execution bindings. Saves are serialized; dependent operations wait until all queued edits have drained. Completed steps remain editable only while the Run is IN_PROGRESS; changes retain historical answers while invalidating the affected completion chain. TASK_COMPLETED locks task inputs and opens independent reflection. Pause and switch never implicitly submit reflection. Other-tab pauses lock the old editor, and conflicts require explicit draft copying or adoption of server state.

Unsynced task/reflection content is stored in the exact IndexedDB namespace `majorpilot-task-drafts-v1`, keyed by verified student public ID, Run, step and Task Version, with a seven-day TTL. Successful sync removes its local copy. Cache reads require a successful current account verification. Ordinary session expiry locks this namespace; the same verified account can recover it. Explicit logout clears it, while logging into a different verified account removes the former account's drafts. Both logout and potentially switching accounts warn about unsynced content. Identity epochs, AbortSignals and step-selection generations reject stale async responses; no credentials enter storage or cross-tab notifications.

Verification commands from the root:

```sh
data/tools/node/bin/node --test student-web/test/identity-state.test.mjs student-web/test/workspace-state.test.mjs executor/test/worker.test.mjs
data/tools/node/bin/node tests/e2e/p2.mjs
```

The complete phase entry is `sh scripts/test-p2-e2e` (real HTTP contracts followed by Chrome and Edge). The browser test reuses two synthetic accounts for the whole matrix; credentials remain in memory, and cleanup is limited to those accounts and their exact mail records. It covers actual Worker/server computations, source-vs-current execution revision, iteration, two-tab conflict, offline recovery, owner/TTL boundaries, atomic switching, reflection pause and completion, and Worker cancellation/timeout/crash recovery. Screenshots are written to `/tmp/majorpilot-p2-evidence`. The authoritative acceptance state and any remaining gate are in [the delivery ledger](../docs/23-p2-to-p6-delivery-ledger.md), not implied by the presence of these commands.

## P6 report reading, comparison and next experience

The private reader routes are `/app/reports/:reportId`, `/app/comparison` and `/app/reports/:reportId/print?expectedVersion=:reportVersionId`. The ordinary report endpoint returns the immutable `report-v1` body directly; a pending response is a distinct status DTO. The comparison endpoint explicitly distinguishes WAITING from READY. The reader retains an already readable version while a new generation is pending or has failed, and never silently replaces it after publication. Status polling backs off from two to ten seconds and stops while the page is hidden. All visible claims, versions, sources and next-step projections come from authorized API responses, not concept samples.

Experience reports have nine sections; comparison reports have eight, including all seven common dimensions for two or three majors. The desktop layout is an open reader, not the task editing shell. Mobile reading is supported at 390 and 768px; comparison content stacks by dimension and then by major. A sticky header keeps private print/navigation available. The chapter highlight tracks the last heading to cross a 150px reading line, so the next chapter can be partly visible before its directory entry becomes active. Required basis summaries use native keyboard-operable disclosures and are all expanded in the print projection.

Comparison source links are enabled only after each source's current-version status is checked, and carry that expected version into the next reader. A version change between clicking and reading is rejected visibly. Print actions likewise carry the version actually read; they do not provide a public or historical-report URL. The print view includes the report version ID, number, date and interpretation boundary, but no feedback controls or navigation. `report.printed` means a verified user's print-button trigger, not proof of physical paper output.

`/app/experiences/:major?recommendationId=:id` is an authenticated, read-only introduction using the actual public major catalog plus owned progress. Reading does not create a Decision or Run. Saving an INITIAL or independent NEXT decision and explicitly starting are separate actions. A paused Run resumes its pinned version; completed majors cannot be started again through this view. The dashboard prefers NEXT over INITIAL and shows an exploration summary instead of falling back to INITIAL after all three formal majors are complete. REVIEW_PREVIEW and DEMO still do not produce these formal reports.

Only the optional feedback **comment** is persisted, in the exact `mp:feedback-comment:v1:` namespace keyed by verified owner and report version with a seven-day TTL. Ratings and next-action choices start empty, and report bodies never enter localStorage, IndexedDB or a service worker. Slow authenticated draft recovery fences input until it settles; storage failure still permits an ordinary online submission. Failure retains input, success removes the exact comment draft, and feedback remains bound to the version actually read even if it is superseded. Identity epochs/cancellation clear private report/NEXT memory and prevent late responses from restoring it; logout clears comment drafts, while natural expiry locks same-account recovery until authentication succeeds.

Focused checks from the project root:

```sh
data/tools/node/bin/node --test student-web/test/report-*.test.mjs student-web/test/feedback-drafts.test.mjs student-web/test/identity-state.test.mjs
data/tools/node/bin/node tests/e2e/p6-layout.mjs
data/tools/node/bin/node tests/e2e/p6.mjs --check
data/tools/node/bin/node tests/e2e/p6-print.mjs --mock
```

`p6-layout.mjs` is explicitly UI-only: every API request is intercepted with schema-validated Java-generated synthetic goldens. It does not prove auth or report generation. The actual `p6.mjs` suite must run only after the root-managed P6 harness is prepared: student `127.0.0.1:15176`, backend `18081`, scoped test database/Redis, real cookies/CSRF and normal STANDARD task lifecycle. Its test-source-only published prerequisites and network-free `TEST_REPLAY` provider do not approve or publish the real REVIEW content. The regular executor origin remains unchanged and is not used from this harness.

The final actual Chrome/Edge run passed both channels with two scoped students and exact cleanup: pending/ready, nine/eight sections, 14/21 comparison cells, 1536/1366/768/390 layouts, visible-one-second events accepted by the server, NEXT read/choice/start/resume, old-current regeneration, feedback transport-loss recovery and old-version attribution, source-link and print conflicts, deterministic fallback, all-completed state, cross-account denial, cross-tab logout and real session expiry. PDFs and screenshots are written to `/tmp/majorpilot-p6-evidence`; no report is publicly shared. Earlier runs exposed two test errors (scrolling the observation target away before one second, and treating a reused layout class as semantic NEXT content); both were corrected without lowering the product's assertions or resetting rate limits. The independent UI mock also verified delayed feedback hydration and private-print CSS. See the root delivery ledger for full backend/recovery/provider gates and retained visual evidence.

The initial business matrix's print-DOM cell count did **not** prove PDF completeness. Subsequent rendered-PDF inspection found that A4 activated an unqualified mobile media query: the first table column became 100% wide, hiding all three comparison columns. The focused `p6-print.mjs` check reproduced this without an account (19 pages, a 793px first column in a 794px table), then verified screen-only responsive queries and explicit print columns. It compares every claim and basis occurrence against extracted PDF text, checks all seven dimension labels, three major headings and 21 cells, rejects a footer-only last page, and renders every page for visual review. The UI-only corrected goldens produce four-page experience and six-page comparison PDFs identically in Chrome and Edge. `--actual` requires an exclusive prepared harness window and creates only one scoped real student, completes three STANDARD test tasks through normal authorized HTTP, then reuses that account for both browsers; it must not run concurrently with other harness tests or reset registration limits. Focused artifacts are separate under `/tmp/majorpilot-p6-print-mock` and `/tmp/majorpilot-p6-print-actual`.

The final focused **actual** run passed in both browsers: the current synthetic experience has 15 claims across three PDF pages, and its three-major comparison has 40 claims including all 21 common-dimension cells across six pages. Every claim and basis occurrence was found in PDF text; all nine rendered pages were visually reviewed with no clipped Chinese, lost cells, blank intermediate pages or orphaned version footer. Chrome and Edge's corresponding page PNGs are byte-identical. The one account was exactly cleaned, the gateway restored to PASS, and no paid provider call or limit reset occurred. This separate result supersedes the defective comparison PDFs from the earlier business matrix; it does not imply physical printer testing or production publication.
