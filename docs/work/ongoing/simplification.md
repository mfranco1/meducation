# Simplification and hosting preparation

Goal: remove accumulated complexity and prepare for hosted production using managed services. Scope rules are in [AGENTS.md](../../../AGENTS.md).

## Phases

1. **Docs and process** (done).
2. **Scripts and CI** (done): one container smoke (`npm run test:containers`), single-arch CI, two Playwright configs. Left: `control-resilience-fixture.py` stays for two backend DB-outage tests.
3. **Frontend**: simplify progress backup/restore (drop Web Locks coordination, admission and restore journal; keep file validation); merge parallel quiz/flashcard admin code; collapse admin gateway layers; replace the custom boundary ESLint plugin with `no-restricted-imports`; merge tiny files; remove implementation-coupled tests.
4. **Backend** (needs a `pg_dump` and restore check first): random IDs instead of the allocation fence and journals; one validation layer (drop PL/pgSQL JSON validation); store releases as immutable JSON with role grants instead of triggers; remove obsolete parity/transfer code; admin auth via managed identity or auth proxy.

## Carried over

- Admin UX redesign stage 5: integrated manual acceptance of the redesigned admin.
- Hosting launch: choose host and managed Postgres (Neon provisional; confirm PITR retention, region near the Philippines, budget alerts); choose admin identity (ZITADEL was the provisional OIDC candidate, or use an auth proxy); stable HTTPS origin with same-origin `/api`; deployed smoke test; real-device browser checks.

## Open questions

- Hosting platform and Postgres provider.
- Number of editors (affects publish workflow and auth).
