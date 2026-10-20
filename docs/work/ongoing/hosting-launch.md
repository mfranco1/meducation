# Hosting launch (deferred)

Deferred on 2026-10-17 while learner content, data model and UI work come first. Scope rules are in [AGENTS.md](../../../AGENTS.md): managed services, a few hundred anonymous learners, a single editor initially.

## Current state

- The per-record editor and migrations through `0012_unique_names` are live on the local authority database (`docs/operations.md`).
- Admin auth is the backend's own OIDC flow ([operations](../../operations.md#editor-login-and-sessions)). Only the synthetic loopback issuer exists; production configuration with admin enabled refuses to start. A real provider needs acceptance: invited subject only, registration disabled, enforced MFA mapped to `amr`, forced step-up, logout and recovery, over HTTPS.
- Security pass for a learner-only launch is done: static security headers, API docs local-only, current dependencies and images, and a platform checklist in [operations](../../operations.md#production-security). Admin (4d) needs its own pass once a provider is chosen.
- A new hosted database is initialized by `pg_restore` of an authority dump, then `restore-permissions`, `invalidate-restored-sessions` and `advance-id-sequences`.

## Remaining steps

1. Choose the host and managed Postgres. Neon is provisional; confirm PITR retention, a region near the Philippines and budget alerts.
2. Choose admin identity (4d):
   - Option A: keep the backend OIDC flow and point it at a managed IdP. ZITADEL was the provisional candidate; it needs real MFA.
   - Option B: put `/api/admin` and `/admin.html` behind the host's auth proxy, then simplify or remove the backend session, CSRF and fresh-factor code to whatever the proxy doesn't cover.
   - Prefer the option with less code we own, as long as it keeps MFA, CSRF/Origin protection and per-editor identity.
3. Set up a stable HTTPS origin with same-origin `/api`. Restore the authority dump into the hosted database and deploy the containers.
4. Run a deployed smoke test, real-device browser checks, and manual acceptance of the redesigned admin.

## Open questions

- Hosting platform and Postgres provider.
- Number of editors (affects publish workflow and auth).
