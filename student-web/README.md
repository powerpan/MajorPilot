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
