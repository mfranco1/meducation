# Simplification and hosting preparation

Goal: remove accumulated complexity and prepare for hosted production using managed services. Scope rules are in [AGENTS.md](../../../AGENTS.md).

## Phases

1. **Docs and process** (in progress): rewrite AGENTS.md; delete completed/stale trackers and evidence; merge stage-named runbooks (L4/L5/L6, local-authoring, local-containers) into `docs/operations.md`; shorten architecture, testing, ADRs and READMEs; trim agent skills.
2. **Scripts and CI**: reduce `scripts/containers` and `scripts/testing` probes to one image smoke test; drop the dual-architecture container matrix, rollback drills and load rounds from CI; reduce Playwright configs.
3. **Frontend**: simplify progress backup/restore (drop Web Locks coordination, admission and restore journal; keep file validation); merge parallel quiz/flashcard admin code; collapse admin gateway layers; replace the custom boundary ESLint plugin with `no-restricted-imports`; merge tiny files; remove implementation-coupled tests.
4. **Backend** (needs a `pg_dump` and restore check first): random IDs instead of the allocation fence and journals; one validation layer (drop PL/pgSQL JSON validation); store releases as immutable JSON with role grants instead of triggers; remove obsolete parity/transfer code; admin auth via managed identity or auth proxy.

## Carried over

- Admin UX redesign stage 5: integrated manual acceptance of the redesigned admin.
- Hosting launch: choose host and managed Postgres (Neon provisional; confirm PITR retention, region near the Philippines, budget alerts); choose admin identity (ZITADEL was the provisional OIDC candidate, or use an auth proxy); stable HTTPS origin with same-origin `/api`; deployed smoke test; real-device browser checks.

## Open questions

- Hosting platform and Postgres provider.
- Number of editors (affects publish workflow and auth).
