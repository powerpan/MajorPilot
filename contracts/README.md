# API contracts

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
data/tools/node/bin/node contracts/check-content.mjs
data/tools/node/bin/node --test contracts/tests/*.test.mjs scripts/ai-spike.test.mjs
```

The checks validate OpenAPI syntax, schema compilation, path inventory against Spring annotations, request/response negative fixtures and security declarations. They do **not** prove that a running HTTP server enforces the contract. Runtime and real-browser evidence is recorded separately in the P0 implementation handoff.
