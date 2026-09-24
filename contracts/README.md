# API contracts

## Method-led edition (post-P7 amendment)

`openapi-method-flow.json` adds five authenticated routes for version-bound learning records, explicit checkpoint submission, local-result verification and explicit new-edition creation. Server time and saved Step Response snapshots are authoritative; clients cannot submit invented answers, timestamps, scores or owners as learning evidence. Mutations use existing Student locking, CSRF, Origin, revision and idempotency controls.

Content 2.0.0 uses the existing AI classifier manifest and the new `task-manifest-v5` for DS/BA's local Excel workflow. Earlier immutable content remains readable. `method-report-v1` is an additional strict report format, not a rewrite of `report-v1`. P6/P7 report responses accept either; method reports require independent review and cannot publish a generic fallback as deep analysis. `Run.experienceEdition` and `ReportSummary.sourceRunId` distinguish preserved historical attempts from new ones.

Run `node --test contracts/tests/method-flow.test.mjs` for static contracts; `node scripts/test-method-flow.mjs` separately exercises isolated MySQL. Neither calls a model. Explicit paid synthetic quality tests use `scripts/test-method-quality.mjs`; current delivery and remaining human gates are in [the implementation ledger](../docs/42-method-led-implementation-ledger.md).

## Post-P7 local product flow amendment

`openapi-product-flow.json` is the two-operation supplement for the owner's post-P7 acceptance feedback, **not P8 or public deployment**. It covers local-only exact-version release and exact CLOSED preview adoption. Both endpoints require the `local` profile, `MP_LOCAL_PRODUCT_ENABLED`, an authorized Operator, pinned revision/hash and explicit authorization reference/reason. Adoption requires **both** recovery and report-regeneration permissions, an owned READY Evidence Snapshot, matching immutable closure inputs and no other product Run for that Major.

Release leaves content status `REVIEW` and does not invent professional review or timing approval. Adoption preserves `REVIEW_PREVIEW`, source answers, timestamps and evidence; only the separately audited exact Run is eligible for private reports and recommendations. Retry uses the same pinned authorization, not an `Idempotency-Key` receipt. `check-product-flow.mjs` compares route/permission inventory with the real local controller and exports `loadProductFlowContracts()` for HTTP validation.

A **new** historical adoption returns HTTP 409 `PRODUCT_ADOPTION_ORDER_CONFLICT` if the Student already has another CLOSED product Run. This conservative boundary avoids retroactively distorting immutable NEXT chronology. The guard does not reject a retry of an existing matching adoption merely because that Student subsequently completed another Major; the original pinned authorization and evidence must still match.

Shared Run responses accept an optional nullable `productEligible` field; only explicit `true` admits historical previews. Legacy omissions remain valid. The unchanged `runMode` is provenance, not itself a report grant. `reportStatus` now also accepts actual `PENDING`, `GENERATING`, `READY` and `FAILED` states. `sync-p5.mjs` applies this additive shared-wire change to P2–P5, and `sync-p7.mjs` inherits it into `P5Run`; the original P7 endpoint inventory remains 37 operations. `sync-product-flow.mjs` composes the separate amendment and never calls a provider, database or server.

## P7 operations and privacy

`openapi-p7.json` describes 37 operations: the P7 account settings, private exports, deletion receipts, operations overview, administrative projections and page observations, plus the existing task/recovery/report management routes needed by the same operator interface. `sync-p7.mjs` composes the inherited schemas without modifying the earlier milestone contracts. `check-p7.mjs` verifies route and permission inventory against the current Spring controllers and exports `loadP7Contracts()` for runtime acceptance checks.

Select each response validator by its actual HTTP status. HTTP 204 has no body; export downloads are binary ZIP or CSV and must be checked as bytes using `responseMedia`, not parsed as a JSON success envelope. Private download authorization, headers, ownership, expiry and deletion fencing require separate runtime tests. `GET /api/app/v1/data-export-requests` returns `{data:{items:[...]},meta}` with at most the most recent 20 requests; it does not expose storage paths or download credentials.

The personal export GET requires Session-bound CSRF and either an exact Student Origin, or an absent Origin with `Sec-Fetch-Site: same-origin`. Explicit foreign or `null` Origin is always rejected; Fetch Metadata does not override it. This narrow browser GET exception does not apply to mutations, which still require an explicit Origin.

The `metrics-v2` shapes preserve anchors, observation windows, numerator/denominator counts, unknown values and coverage notes. A zero denominator has a `null` rate, not zero. Page visibility is an untrusted observation, not proof of attention or a server-generated task-start fact. Static contract checks do not demonstrate empirical KPI performance, database migration success or runtime privacy enforcement; ordinary tests make no paid model calls.

## P2 task engine

`openapi-p2.json` describes 25 content/run/step/execution/hint/reflection and operator operations. `check-p2.mjs` exports `loadP2Contracts()` with request validators and status-keyed response validators, including real 401/403 operator errors. Public task payloads exclude private assets and internal audit data. `schemas/task-manifest-v1.json` and `check-content.mjs` validate versioned content, references, public/private boundaries and reviewed publication metadata.

`DEMO_TABLE` and `DEMO_COMPARE` are authenticated local technical demonstrations, not extra majors or formal AI/DS/BA releases. Demo closure returns `reportStatus=NOT_APPLICABLE`. `inputRevision` preserves an execution's original input; `appliedToRevision` identifies its current answer binding when the same immutable result is reused. An old binding must not be mistaken for a new computation or a current result.

`scripts/test-p2-api.mjs` validates actual local HTTP responses against these schemas using precisely cleaned synthetic accounts. Content and Java tests separately cover publication/retirement, immutable versions, concurrency, ownership and permissions; schema validation alone does not prove any of them. Ordinary tests keep paid model calls disabled.

## P1 identity and recommendation

`openapi-p1.json` describes the local `local` profile: 27 formal identity, questionnaire, Intake, immutable profile, initial recommendation, choice, consent and observation endpoints. All API answer keys use camelCase; `examples/p1-intake.json` is the shared synthetic fixture, not user data. P1 returns full `STRUCTURED_ONLY` explanations and three `NOT_STARTED`/`UNAVAILABLE` majors. It does not create task Runs or call a paid model.

`check-p1.mjs` exports `loadP1Contracts()`: each operation has an optional request validator and a status-keyed `responses` validator map. HTTP 204 has no body validator; HTTP 503 health uses the dependency-status envelope. Other safe errors use `responses.default`. Runtime callers must select by actual HTTP status and must not log rejected payloads containing credentials or answers.

P1 invariants beyond basic shape (continuous tied ranks, page-specific fields, consent combinations, owner authorization, CAS, token freshness and idempotency) are enforced and tested in Java. Skipped optional Q12 acquisition source becomes `DECLINED`; failure requests never renew the seven-day anonymous deadline. Claimed Intake credentials cannot read or reclaim their old snapshots.

`recommendation.viewed` requires top-level `visibleDurationMs` as a JSON integer between 1,000 and 86,400,000. The client emits it after core content is continuously visible for at least one second, cancelling the timer when hidden. This is an untrusted observation, not proof of attention; storage retains only the server-derived `primaryMajor`, not the duration or client properties. `scripts/test-p1-events.mjs` verifies HTTP boundaries with two synthetic anonymous Intakes and exact fixture cleanup; actual browser visibility is a separate UI gate.

## P0 probe contracts

`openapi-p0.json` is an OpenAPI 3.1 contract for **synthetic, loopback-only** identity, persistence and Cookie probes. It does not implement P1 registration, real student passwords, or P7 deletion. Probe routes are enabled only by the `p0` Spring profile. The RuoYi operator-auth failure envelope remains upstream-specific and is declared separately.

`schemas/p0-ai-result.schema.json` is a small synthetic AI response contract. It is not the future experience-report schema. Even when provider JSON Schema mode is accepted, local structural and evidence/boundary checks remain mandatory.

From the repository root:

```sh
data/tools/node/bin/node data/tools/npm/bin/npm-cli.js ci --prefix contracts
data/tools/node/bin/node contracts/check.mjs
data/tools/node/bin/node contracts/check-p1.mjs
data/tools/node/bin/node contracts/check-p2.mjs
data/tools/node/bin/node contracts/sync-p7.mjs
data/tools/node/bin/node contracts/check-p7.mjs
data/tools/node/bin/node contracts/sync-product-flow.mjs
data/tools/node/bin/node contracts/check-product-flow.mjs
data/tools/node/bin/node contracts/check-content.mjs
data/tools/node/bin/node --test contracts/tests/*.test.mjs scripts/ai-spike.test.mjs
```

The checks validate OpenAPI syntax, schema compilation, path inventory against Spring annotations, request/response negative fixtures and security declarations. They do **not** prove that a running HTTP server enforces the contract. Runtime and real-browser evidence is recorded separately in the P0 implementation handoff.
