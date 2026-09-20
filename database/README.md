# Database baseline and migrations

- `baseline/` contains the exact MIT-licensed upstream SQL from RuoYi commit `a51a838b71b446ea27256900efe7ed2faa2a02fd`. Do not manually run it against an existing database: it contains destructive DROP statements.
- Flyway `V1__RuoYiBaseline` checks that the dedicated schema is empty before importing both original scripts. Flyway clean is disabled. There is no automatic `baselineOnMigrate`.
- `V2__p0_technical_probes.sql` creates only synthetic P0 fixtures plus the minimal durable-job prototype. These are **not** the P1 identity model or finished P7 account deletion workflow.
- `V3__p1_identity_intake_recommendation.sql` supplies the formal P1 identity, intake and recommendation model.
- `V4__content_and_experience_engine.sql` adds versioned content, demo/major separation, immutable task bindings, run/step revisions, server-verified execution, hints, reflection, durable closure requests and sensitive-operation audit. Demo completion does not create a professional report.
- `V5__step_completion_history.sql` records append-only step completion history. Revising an answer can invalidate current downstream completion without erasing past answers, executions or completion facts.
- Applied migrations are immutable. Use a new version for subsequent changes; never edit an executed file to make its checksum match a new design.
- An existing, independently verified exact upstream database may be adopted only by an explicit Flyway baseline at version 1; do not infer this from the existence of `sys_user` alone.
- MySQL tests use `majorpilot_test`, assert migration/transaction rollback/lease fencing and clean only generated fixture IDs. They require `MP_RUN_MYSQL_TESTS=true`; skipped tests are not database acceptance.
- `node scripts/test-fresh-migrations.mjs` creates an isolated temporary schema and least-privileged account on the verified project instance, applies every current migration, checks an idempotent second pass, then removes only those temporary resources. It never empties the main or test schema.
- Runtime p0 startup rotates the admin password from `MP_P0_ADMIN_PASSWORD`, disables other default accounts, disables public registration/captcha, and uses loopback-only binding. This is a local test profile, not deployable production configuration.
