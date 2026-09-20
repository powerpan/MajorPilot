# RuoYi management frontend import

- Source: <https://github.com/yangzongzhuan/RuoYi-Vue3>
- Branch selected in design: `typescript`
- Exact commit: `0ea09ef814213875b61cffb3485d76de680256f3`
- Commit tree: `87a52d2937140ec47dea77179f245e9cea75c4cc`
- Imported 2026-09-20 from the exact GitHub codeload archive; API commit lookup reconfirmed SHA.
- Archive SHA-256: `0189bf80c6c3802e29adafe2fc84af629626f247a24a1e1310367af55446bd3f`.
- License: MIT, copyright 2018 RuoYi. Original [LICENSE](./admin-web/LICENSE) retained.
- Package version: `3.9.2`; direct dependencies retained exactly as upstream initially.
- Toolchain: local Node `24.21.0` and npm `11.19.1`.

## Original-source evidence

Before any application-source edit, `npm install --ignore-scripts --no-fund --no-audit` generated the previously absent npm lockfile and `npm run build:prod` succeeded on 2026-09-20. Raw build log is local-only `/tmp/majorpilot-p0-frontend/upstream-build.log`. Upstream dependency deprecation notices and large-chunk warnings were retained, not hidden. An install initially failed because the default npm cache was outside the writable sandbox; retry used project-local `data/npm-cache`, without changing home-directory ownership.

The unchanged frontend login/menu/logout (apart from local Vite address/port settings) also passed in Chrome 153 and Edge 151 against the local P0 backend before application patches. This is deliberately not described as an unchanged-backend+frontend test: backend original-build/API-login evidence is recorded separately. A successful bundler build does not imply that the upstream strict TypeScript codebase is error-free or that all administrative features were tested.

## MajorPilot patches

1. Vite runs on loopback port 15174, targets the same backend on port 18080, does not open a browser automatically, and fails on occupied ports.
2. The final local public frontend configuration is explicit in Vite so ignored upstream `.env.*` files are not prerequisites for a fresh checkout.
3. Remove prefilled/default credentials and the reversible password-cookie feature, including its now-unused `src/utils/jsencrypt.ts` embedded demo-key helper and `jsencrypt` dependency. Remove public admin registration route; public student registration remains a future P1 feature. All removed imported source remains recoverable from the pinned upstream commit/archive.
4. Store RuoYi's administrative bearer token in origin-scoped sessionStorage under `MP_ADMIN_TOKEN`, not a JavaScript Cookie shared by same-host different-port applications. This is still a JS-accessible token and does not claim XSS immunity.
5. Replace the upstream promotional demo homepage with a minimal P0 status page inside the original RuoYi layout. Keep the management component/design system and permissions unchanged.
6. Pin npm toolchain metadata and lockfile; remove the imported `admin-web/.gitignore` rule that excluded `package-lock.json`. A clean-snapshot rehearsal caught that exclusion before delivery; all four npm lockfiles are now Git-eligible. Do not silently upgrade baseline dependencies during import.
7. Explicit same-major security updates: Axios `1.13.2 → 1.20.0`, js-cookie `3.0.5 → 3.0.8`, selected after npm production audit identified high advisories. Both versions are exact pins with a regenerated lockfile. ECharts `5.6.0` remains at the chosen baseline: npm audit identifies moderate XSS advisory [GHSA-fgmj-fm8m-jvvx](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx), whose listed fix `6.1.0` is a major upgrade; upgrading requires a dedicated compatibility review before exposing untrusted chart content. P0 exposes no editable chart configuration.
8. Correct the upstream ambient Vue module replacement into a real module augmentation using the actual helper types. The original `vue-tsc --noEmit` returned 7 errors; restoring real Vue types revealed 248 diagnostics across 59 files. Bounded repairs covered typed component/form refs, guarded component setup and nullable data, explicit menu/form models, API enum/optional-field handling, and callback contracts. Notable runtime corrections include the delayed settings callback and matching scroll-listener cleanup. The final direct `vue-tsc --noEmit` returned **exit 0** with no diagnostics. Both `build:prod` and `build:stage` now enforce this check before Vite bundling. No `strict: false`, blanket suppression, or global `proxy:any` workaround was introduced. Existing third-party ambient shims remain; this is not a claim that every upstream dependency has been fully migrated to real types. Historical failure logs and the final zero-diagnostic log are in local-only `/tmp/majorpilot-p0-frontend/`.

See [P0 browser execution evidence](./docs/19-p0-browser-execution-spike.md) and the aggregate P0 report for actual runtime gates. No Git commit was created during this import; upstream archive plus this patch list preserve the raw baseline provenance until the user chooses Git delivery.
