# Backend import and P0 evidence (2026-09-20)

This is the backend section to be incorporated into the root `UPSTREAM.md`. No upstream update, Git commit, push, production service or deployment was performed by this import.

## Source and license

- Official repository: https://github.com/yangzongzhuan/RuoYi-Vue
- Branch recorded by the design: `springboot3`; imported immutable commit: `a51a838b71b446ea27256900efe7ed2faa2a02fd`.
- Source archive: `https://codeload.github.com/yangzongzhuan/RuoYi-Vue/tar.gz/a51a838b71b446ea27256900efe7ed2faa2a02fd`.
- Archive SHA-256: `e51805ab941083c558d5a3d510390c379beb8839cc89b267a99ea8f43c74f3c5`.
- Source version `3.9.2`, Spring Boot `3.5.16`, source/target Java `17`; built and run with OpenJDK `21.0.10`.
- Upstream MIT license is retained verbatim at `backend/LICENSE`. Upstream README, scripts, SQL, source and manual remain identifiable as upstream material; the root README is the project entry point.
- Original SQL copies in `database/baseline/`: `ry_20260417.sql` SHA-256 `09f26cb52f2768e87f3860200e54ca39a491c373b766ef7cf404c2683bd7ae0b`; `quartz.sql` SHA-256 `68ddc1c2dcd003e5a5470d88f23bfe8daee54d2b6ae77c720e5b82f8dd57ef0a`.

## Unmodified-source evidence

1. Ran Maven `3.9.16` `-DskipTests package` on the original seven-module reactor before editing upstream files. First attempt failed because the sandbox cannot write the default `~/.m2`; rerunning with the project-local `.local/m2` succeeded: seven modules, `BUILD SUCCESS`, 8m53s, 2026-09-20 19:59 HKT. This is compile/package evidence, not tests.
2. Saved that unmodified compiled jar at `/tmp/majorpilot-ruoyi-original.jar` for the bounded raw-login probe. `backend/raw-login-probe.mjs` initialized only the dedicated `majorpilot_raw` schema from the unchanged upstream scripts; it has an empty-schema guard and never drops existing schemas.
3. Raw startup initially failed because upstream `logback.xml` hardcodes `/home/ruoyi/logs`. Passing an external `-Dlogback.configurationFile` (without changing the jar) resolved it. The probe used external loopback/DB/Redis/token configuration and disabled only captcha in the dedicated raw database. Original `/login` and `/getInfo` both passed. No JWT/password was printed.
4. The raw process was stopped in `finally`; every raw-schema user was disabled afterwards. The raw schema is synthetic test evidence, not the application database. The raw probe is not part of normal startup and requires the original jar artifact; `--resume` is only for the explicitly created synthetic raw schema.

Local transient evidence: `/tmp/majorpilot-backend-raw-build.log`, `logs/p0-raw-backend.log`. They are not shipped or proof of a fresh-machine reproduction.

## Intentional patches to common/upstream layers

| File | Change and reason |
| --- | --- |
| `backend/pom.xml` | Adds the independent `ruoyi-majorpilot` module. |
| `backend/ruoyi-admin/pom.xml` | Composes the product module into the existing executable. |
| `SecurityConfig.java` | Explicit final admin-chain order; denies student/public paths outside their own chains; removes public registration/docs/Druid/file/generator/job-management exposure; disables global servlet registration of JWT/CORS filters so an administrator JWT cannot authenticate a student request. |
| `ResourcesConfig.java` | Replaces wildcard CORS with the exact local admin origin. A production origin configuration is not provided. |
| `AuthenticationEntryPointImpl.java` | Returns real HTTP 401 rather than only a JSON code on HTTP 200. |
| `application.yml` | Admin token secret comes from env; default profile is disabled and P0 requires explicit selection. |
| `application-druid.yml` | Replaces upstream root/default database credentials with required environment placeholders; disables Druid web/SQL statistics globally. A static pre-initialization guard checks the effective dedicated loopback DB URL/user to detect configuration precedence mistakes before any connection. |
| `logback.xml` | Replaces the Linux-only absolute path with `MP_LOG_DIR` or project-relative logs so early Logback initialization is portable. |
| New `application-p0.yml` / `logback-p0.xml` | Loopback-only port 18080, env DB/Redis secrets, Flyway, local SMTP catcher, safe metadata logging, no public Swagger/Druid or SQL parameter logging. |

P0 adds a fail-closed guard when `p0` is not selected. No production configuration or deployment readiness is implied.

## Added bounded P0 implementation

- `ruoyi-majorpilot/p0`: synthetic intake claim, opaque sessions, signed/bound public and student CSRF, exact Origin check, cookie-path/logout/deletion-receipt probes, owned sample CRUD, local-mail probe, and dependency-aware health.
- These endpoints are annotated `@Profile("p0")`; public/student chains also reject non-loopback peer addresses. They are **not** P1 registration, email verification, password reset or P7 account deletion. The synthetic deletion confirms synchronously only to prove session revocation/receipt scope and account fencing.
- P0 bootstrap preserves RuoYi's password contract: the generated local administrator password must be 16–20 characters (boundary-tested), rather than relaxing upstream's 20-character maximum. It hides only the observed upstream tool/job/Druid/Swagger/build/generator/external-site menu IDs and their relevant buttons, matching denied/deferred API surfaces; upstream baseline SQL is unchanged.
- Flyway V1 Java migration refuses any nonempty schema before reading the exact upstream SQL. V2 adds P0 fixtures and a minimal MySQL durable-job prototype. `clean` and implicit baseline are disabled.
- The durable job store uses transaction locks, `SKIP LOCKED`, a 60-second lease, generation/worker fencing, heartbeat support, three bounded attempts and a five-second scheduled synthetic worker. It processes only `P0_PROBE`; no production report/deletion job handlers exist yet.
- Maven Wrapper `3.3.4` selects Maven `3.9.16`; distribution SHA-256 `5af3b743dd8b876b5c45da33b676251e5f1687712644abb4ee519ca56e1d89ce`. The generated wrapper retains its Apache license header. Project-local cache avoids global toolchain changes.

## Checked evidence and remaining boundaries

- Wrapper compile/package passed on 2026-09-20 after the common-layer patches.
- First integrated startup exposed two real compatibility issues, both fixed without broadening database grants: imported Druid configuration overrode profile credentials (base config now requires env placeholders and a pre-connection effective-config guard); Druid closed a connection after Flyway's optional `performance_schema` capability probe was denied (Flyway now has its own dedicated JDBC connection). The custom MyBatis factory is explicitly ordered after Flyway.
- Integrated startup then passed on 2026-09-20 20:10 HKT: `/api/public/v1/p0/health` HTTP 200 with database, Redis and migration `UP`; mail/model intentionally `NOT_CHECKED` because health does not send mail or make paid model calls.
- Three environment-guard unit tests passed: dedicated DB/initialization order; upstream defaults or non-loopback binding rejected; shared admin/student signing key rejected.
- One additional bootstrap test passed for the 16/20-character allowed boundaries and invalid 15/21/null values. Final package on 2026-09-20 20:16 HKT also includes the missing/null synthetic mail-kind 422 fix.
- Two crypto tests passed: signature/domain/binding/expiry and opaque-token/hash invariants.
- Six opt-in real MySQL 8.4.11 tests passed, zero skips: empty-schema migration plus validation, transaction rollback, concurrent claim, expired-lease heartbeat/result rejection and takeover, new-worker recovery/idempotent business key, deletion fence, and three-attempt limit. They use `majorpilot_test` and remove only generated fixtures.
- A new store/worker object in a JUnit test is **not** OS process restart proof. Actual process restart/browser/mail/model evidence belongs in the consolidated P0 audit after those tests run.
- Existing-baseline adoption, real production auth/registration, global retry/repair semantics for future AI jobs, automatic account erasure and clean-machine reproduction are not certified by these bounded tests.
- Provider integration authored in `integration/ai` has its separate live/fake/replay validation record; no provider key belongs in source, test output or this document.

## P1 product additions (2026-09-20)

The P0 evidence above remains historical. P1 introduces a separate `local` profile; the startup script defaults to `local`, while `--profile=p0` explicitly selects the old synthetic probes. The two profiles cannot be enabled together. Both require the same dedicated loopback infrastructure and pre-connection configuration guard; this is not a production deployment profile.

- The upstream administrator identity and BCrypt implementation remain unchanged. Student identity lives in new `auth`, `security`, and `shared` packages with opaque hashed sessions, separate CSRF binding, exact student Origin validation, Redis-backed fail-closed throttling, one-time hashed mail tokens, and MySQL transaction/idempotency records. Product `intake`, `recommendation`, and `analytics` packages are separate from the upstream administrator modules.
- Student password hashing adds the pinned `org.bouncycastle:bcprov-jdk18on:1.86` dependency for Spring Security Argon2id (19 MiB, two iterations, parallelism one). The downloaded JAR SHA-256 was compared with official Maven Central metadata: `2af190b300cbb0b35e248ccf5f4a06b6072030aeb3da7a98ec73abe5b4cb371f`. Its packaged `META-INF/LICENSE.md` is retained inside the dependency JAR. No upstream framework upgrade was made for P1.
- Immutable Flyway V3 adds 13 physical tables for formal student accounts, sessions, email tokens, consents, Intake, profile answers, initial recommendation snapshots/decisions, idempotency, and safe events. P0 fixtures remain distinct. V3 was first verified in the dedicated `majorpilot_test` schema and then applied to the local application schema; later schema changes must append a migration.
- Registration atomically claims every profile/recommendation version before SMTP and does not log the student in. Registration SMTP failure preserves the committed account and allows resend. Verification is valid for 24 hours; reset for 30 minutes; replacement revokes earlier unused tokens. Resend and forgot-password expose the same response regardless of account existence and use a bounded in-memory asynchronous SMTP queue. Queue loss is recoverable by another resend, not a claimed durable mail-outbox guarantee.
- Successful normal login also expires the browser's old `MP_INTAKE` and `MP_PUBLIC_CSRF` cookies, ending anonymous recovery before entering an account. This is credential cleanup only: it does not claim, migrate or delete the anonymous database record, which remains subject to its existing seven-day retention rule. A controller regression verifies both cookie paths and that no claim/deletion operation is invoked.
- Student sessions have a seven-day absolute and 24-hour idle expiry. Password reset and temporary security lock revoke all sessions. Research permission can be withdrawn without blocking core account access. Formal deletion, email change, task runs and durable business AI jobs are not implemented by these P1 additions.
- `/api/public/v1/health` is shared readiness for either local profile. The actual database, Redis and migration states govern HTTP 200/503; model/mail remain `NOT_CHECKED`, since health does not consume model budget or send mail. P0 identity endpoints return 404 in the formal `local` profile.
- Safe request metadata logging is shared between profiles and records generated request IDs, route templates, a bounded method name, response status, elapsed time and principal type only. Unknown/rejected routes are `UNMATCHED`; raw paths, identifiers, email, body, headers, cookies and exception messages are excluded.
- `StrictJsonConfiguration` applies only in `local`: integer DTO fields reject floating-point, string and boolean aliases; enum ordinals and number-to-text coercion are disabled. Existing P0 behavior is unchanged. The P1 review also corrected an expired temporary-lock transition that could otherwise preserve `LOCKED` while clearing its expiry; real MySQL regressions cover both verified and pending accounts, including later email-reset and login recovery. Consecutive duplicate research withdrawal is a transactionally safe no-op rather than another consent/audit row.

Detailed P1 HTTP/browser acceptance and outstanding scope are recorded in `docs/21-p1-implementation-and-delivery.md`; this addendum does not by itself certify those gates.
