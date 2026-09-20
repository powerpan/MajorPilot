# MajorPilot working agreements

- Read `CONTEXT.md` and the relevant current design documents before changing product behavior.
- Follow the approved Vue 3 / Spring Boot 3 / MySQL / Redis architecture and P0–P8 milestone scope. Do not silently move to a later milestone.
- The user confirmed on 2026-09-20 that every completed milestone or significant change must be committed and pushed after proportionate validation. Report the commit, remote verification, and any remaining gates. Never force-push or bypass failed checks; ask if remote history conflicts.
- Keep secrets only in ignored local environment files. Never commit API keys, local credentials, databases, logs, runtime tools, build artifacts, or browser profiles. Do not use Apple Keychain for project API keys.
- Keep local implementation, automated/browser validation, Git delivery, and public deployment separate. A request to push is not authorization to deploy publicly.
- Real model capacity testing requires an agreed load and cost ceiling and is a pre-launch gate. Normal builds/tests must not trigger paid model calls.
- Preserve executed Flyway migrations; use a new migration for schema changes. Run the backend from the content-addressed runtime artifact, not the mutable build JAR.
- Use project-managed process identity checks when stopping/restarting services. Do not touch other projects' databases or ports.
