# Simplification and hosting preparation

Goal: remove accumulated complexity and prepare for hosted production using managed services. Scope rules are in [AGENTS.md](../../../AGENTS.md).

## Phases

1. **Docs and process** (done).
2. **Scripts and CI** (done): one container smoke (`npm run test:containers`), single-arch CI, two Playwright configs. Left: `control-resilience-fixture.py` stays for two backend DB-outage tests.
3. **Frontend**: progress backup simplified (done). Admin: gateway interface, in-memory test gateway and tiny files removed (done). Remaining: replace the custom boundary ESLint plugin with `no-restricted-imports`; merge tiny files outside admin; remove implementation-coupled tests.
   - Follow-up decision: quiz and flashcard admin save models differ (quiz change sets with server-reserved IDs vs whole-bank flashcard operations). Unifying them onto one model would let the two panels, bulk-add drafts and change-set modules merge; this is a behavior/design change, not a cleanup.
4. **Backend** (needs a `pg_dump` and restore check first): random IDs instead of the allocation fence and journals; one validation layer (drop PL/pgSQL JSON validation); store releases as immutable JSON with role grants instead of triggers; remove obsolete parity/transfer code; admin auth via managed identity or auth proxy.

## Carried over

- Admin UX redesign stage 5: integrated manual acceptance of the redesigned admin.
- Hosting launch: choose host and managed Postgres (Neon provisional; confirm PITR retention, region near the Philippines, budget alerts); choose admin identity (ZITADEL was the provisional OIDC candidate, or use an auth proxy); stable HTTPS origin with same-origin `/api`; deployed smoke test; real-device browser checks.

## Open questions

- Hosting platform and Postgres provider.
- Number of editors (affects publish workflow and auth).
