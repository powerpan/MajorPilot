# Database baseline and P0 migrations

- `baseline/` contains the exact MIT-licensed upstream SQL from RuoYi commit `a51a838b71b446ea27256900efe7ed2faa2a02fd`. Do not manually run it against an existing database: it contains destructive DROP statements.
- Flyway `V1__RuoYiBaseline` checks that the dedicated schema is empty before importing both original scripts. Flyway clean is disabled. There is no automatic `baselineOnMigrate`.
- `V2__p0_technical_probes.sql` creates only synthetic P0 fixtures plus the minimal durable-job prototype. These are **not** the P1 identity model or finished P7 account deletion workflow.
- An existing, independently verified exact upstream database may be adopted only by an explicit Flyway baseline at version 1; do not infer this from the existence of `sys_user` alone.
- MySQL tests use `majorpilot_test`, assert migration/transaction rollback/lease fencing and clean only generated fixture IDs. They require `MP_RUN_MYSQL_TESTS=true`; skipped tests are not database acceptance.
- Runtime p0 startup rotates the admin password from `MP_P0_ADMIN_PASSWORD`, disables other default accounts, disables public registration/captcha, and uses loopback-only binding. This is a local test profile, not deployable production configuration.
