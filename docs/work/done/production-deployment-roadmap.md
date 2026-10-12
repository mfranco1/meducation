# Production deployment roadmap

Superseded for execution ordering and hosting preference by the [local-first production preparation tracker](../ongoing/local-first-production-preparation.md). This file retains the earlier planning snapshot.

Revised planning completed: 2026-10-12. This document proposes future implementation; it does not change current architecture or authorize provisioning. Supersedes the earlier account-first roadmap.

## Agreed launch scope

- Launch as soon as practical, primarily for Philippine users; initially at most a few hundred users, with concurrency still to be measured.
- All learner content is free and accessible immediately without signup.
- Learner attempts, flashcard progress, and analytics remain in localStorage. No learner profiles, progress, or analytics tables in Postgres for this release.
- Internet-required study is acceptable. Full offline support and cloud sync are deferred.
- Include download/upload of learner progress backups.
- One editor uses a private web admin based on the existing admin panel. Content saves to Postgres.
- Prefer low total cost and low maintenance over AWS-specific infrastructure.
- Accounts and paid access are later possibilities, dependent on adoption.

## Recommended starting stack

Use Render static hosting for learner/admin builds, one paid Render FastAPI service, and Supabase Pro for managed Postgres plus administrator authentication. Render and Supabase offer Singapore regions; select both there where available and measure latency from the Philippines. Keep the existing React/Vite/MUI and Python FastAPI stack.

This reduces the initial setup to two providers and avoids adding a separate frontend proxy platform. Learner hosting needs explicit /api routing to FastAPI (verify external rewrite behavior), or an explicit API origin with restricted CORS. The Vite development proxy is not production routing. Admin identity is separate from future learner signup: create/invite only the editor, disable public signup, enforce backend allowlisting by immutable identity ID, and require MFA with backend assurance enforcement for write actions. A hidden admin URL alone provides no authorization.

Previously verified advertised baseline: Render Starter API $7/month + Supabase Pro $25/month, approximately $32/month before extras. Plan for $40–60/month initially; this is an estimate for small traffic, not a capacity promise. Domain, taxes, email, staging, upgrades, and overages are extra. Free static hosting does not make API/backend compute free. Keep staging local/disposable initially to avoid paying for a permanent duplicate stack; final smoke tests still need a deployed environment.

Supabase is recommended here for managed recovery and admin identity convenience, not because it is the absolute lowest database price. Render managed Postgres plus a separate admin identity solution may have a lower invoice but needs a quote including recovery and storage. Neon remains an alternative if usage-based DB billing and separate identity are preferable. Cloudflare static hosting remains an interchangeable alternative if useful later. Defer AWS, self-hosted Postgres, Kubernetes, HA replicas, and learner authentication.

## Existing implementation to reuse

- FastAPI content routes and backend question/flashcard repository protocols.
- Stable IDs, schema-v4 question and schema-v2 flashcard contracts, ordered arrays, source/verified answers, rich text, and separate revision semantics.
- API decoding/loading/retry/cache behavior and liveness/readiness routes.
- Admin editor presentation and core change-set/preview/validation logic. AdminQuestionBankGateway is an asynchronous seam, but coordinated flashcard operations, reset, and undo semantics require deliberate adaptation for persistent drafts; it is not a production-ready HTTP adapter yet.
- Validated local progress codecs and repository snapshots, signatures, durable aggregates, completion deduplication, and separate quiz/flashcard storage.
- Existing frontend/backend/content/architecture/browser CI.

## Stage 1 — Lock deployment and content contracts

Document architecture decisions for the proposed stack, private admin identity, guest local persistence, and versioned content publishing. Define initial operating targets: for example, daily content recovery points and restoration within four hours; verify the actual backup plan. Select the production learner domain early: localStorage is origin-scoped, so changing domain later requires explicit transfer.

Design a small relational schema: immutable published releases, shared subjects, quizzes, questions, decks/cards, one editable paired-bank draft, and audit events. Preserve text IDs and explicit ordinal columns; retain nested choices/metadata as JSONB where that avoids unnecessary transformation. Source answers, verified answers, rationale notes, and provenance remain distinguishable. Release IDs version the content without regenerating entity IDs.

Exit: architecture/schema/authority transition and acceptance criteria are recorded. No infrastructure or runtime policy needs to change during planning.

## Stage 2 — Import JSON and serve Postgres content locally

Add Postgres locally, schema migrations, and both backend read adapters. Use SQLAlchemy/Alembic as conventional options; run migrations once as a controlled job rather than independently per API worker. Keep pool bounds suitable for the selected small database.

Build a transactional, idempotent importer from both canonical banks. Validate paired references and full content before activation. Compare reconstructed JSON/API contracts for IDs, exact text, rich formatting, all choices/answers/metadata, omitted optional fields, explicit ordering, counts, and revisions. Counts alone are insufficient. Preserve quiz/flashcard content-digest semantics across the first migration so unchanged content does not unnecessarily invalidate active local attempts.

Initially JSON remains authoritative and Postgres serves imported releases. Keep JSON-mode rollback only during this read-only migration window. Each API response must use one published release consistently; cached subjects/catalogs must be scoped to it. Preserve immutable releases for historical content retrieval, and retain the existing changed-content restart rule for active attempts.

Exit: full JSON/Postgres parity, importer retry safety, failed-import isolation, and content-mode rollback pass.

## Stage 3 — Convert the existing admin into private database authoring

Reuse the current panel with an authenticated HTTP gateway. Separate editor identity/authorization from learner behavior. Enforce authorization and MFA on every backend admin operation, including reads, previews, exports, draft saves, undo/reset, and publishing. Verify tokens server-side; credentials and privileged keys never enter a browser build. Prefer backend-only database access; restrict Supabase exposed schemas/tables and apply deny-by-default policies where exposed. Public learner routes read published content only.

Use one draft for both banks and one editor role initially. Save writes directly to the Postgres draft; Publish validates and atomically creates/activates an immutable paired-bank release. Learners never observe partial edits or unvalidated drafts. Explicit publishing is an initial safeguard, not a multi-person approval workflow. Multiple tabs can still race, so reject stale draft revisions. Preview is advisory; saving/publishing must revalidate the exact submitted revision on the server.

Record old/new values, editor ID, time, and reasons for meaningful changes. Preserve original answer keys and verified-answer provenance. Adapt undo/reset to draft operations: resetting a draft must not delete published releases or audit history. Invalidate release-scoped caches on publication; content publication must work without manually restarting every worker. Public rollback selects a previous DB release, not a stale repository JSON file.

At the DB-authoring cutover, explicitly update AGENTS.md, architecture, content-management and schema documentation: Postgres becomes the authoritative editable record, and generated JSON becomes a deterministic export/archive/local fallback. Never maintain two independently writable canonical sources. Maintain equivalent backend validation and parity tests with the existing TypeScript validators.

Exit: signed-out/non-editor requests are rejected; stale saves cannot overwrite newer work; invalid paired drafts cannot publish; exact exports and previous-release rollback work.

## Stage 4 — Add safe local progress download/upload

Add one versioned progress-backup format containing quiz and flashcard state, export timestamp, application identity, and needed content-reference metadata. Reuse and strengthen existing decoders; do not back up arbitrary localStorage keys, credentials, admin tokens, or content banks. Include retained history and durable summaries/completed IDs/flashcard aggregates; pruned history cannot reconstruct all totals.

For the first release use replace/restore, not merge. Upload reads a local JSON file in the browser only. Check byte size before parsing; enforce bounded arrays/strings/maps, supported versions, safe integers, timestamps, IDs, signatures, and allowlisted keys. Reject dangerous object property names recursively and copy only validated fields into fresh structures; do not blindly merge parsed objects or use input IDs as unsafe object keys. Treat all uploaded strings as data, never HTML or executable code. Do not accept scripts, remote URLs, archives, arbitrary storage keys, or a file-specified storage revision.

Validate the entire paired backup before writing. Show a preview of what will be restored and overwritten, offer an existing-progress download, then require explicit restore confirmation. Route writes through persistence abstractions and generate fresh local revisions so stale tabs cannot overwrite restored state. Because separate localStorage keys do not provide an atomic transaction, implement a recoverable restore journal/staging and rollback strategy, including quota failures and interrupted writes. Handle subscriptions and active study: restore from settings with no active editable session or force a clear reload/restart after success.

Unknown/removed content IDs must not erase historical records. Changed-content active attempts/checkpoints follow current signature/restart rules. Structural validity does not prove the history is authentic: users control their own local files/statistics. Checksums can detect corruption, not malicious edits. Future paid entitlements, trusted rankings, or rewards must never trust this backup. UI should say that study data is local, clearing browser data removes it, and backups provide manual transfer only.

Exit: round-trip preserves both progress systems; malformed/oversized/prototype-key/unsupported files fail without changes; quota/interruption recovery works; stale tabs are rejected; restore does not inflate totals.

## Stage 5 — Deploy, smoke-test, and launch

Containerize FastAPI with pinned Python 3.14 and locked dependencies. Deploy learner and admin separately, with learner builds excluding admin/QA imports. Admin may have its own origin, but backend authorization remains mandatory. Configure domains/TLS, secrets, restricted CORS, DB TLS/roles, request/payload limits, health/readiness checks, structured logs, error reporting, uptime checks, backups and budget alerts. Keep sensitive admin tokens and user-supplied backup contents out of logs. Backups remain local and are not uploaded for telemetry.

Add reproducible deployment after existing CI and compatible application/schema rollback. Use additive migrations where needed; run migrations as a controlled release step. Run frontend/backend/architecture/content/browser checks plus actual Postgres integration, authorization, publish/concurrency and hostile-backup tests. Exercise quizzes, flashcards, retries, progress reload and backup restore over the real hosted API. Measure a provisional 20 simultaneous learners launching content, then adjust to observed traffic; hundreds of total users do not imply hundreds of concurrent requests.

Test a real content backup restore in a separate database and previous-release publication rollback. Verify Singapore availability and Philippine network latency rather than assuming geography guarantees performance. Review content distribution rights and publish simple local-data/privacy information. Smoke-test privately, then open free guest access. Full offline support, cloud learner state, learner signup, payments, leaderboards, and a multi-editor workflow are outside this release.

Exit: deployed workflows, authorization, parity, restore, rollback and provisional load targets pass; there is a documented incident/recovery procedure.

## After adoption

Measure API demand and costs without collecting learner study records unnecessarily. If paid access becomes worthwhile, add learner identity, server-side entitlements/payment webhooks, and an explicit local-to-cloud progress migration. Existing backup files are untrusted historical study data, not proof of payment or authenticated performance. Preserve stable IDs and API contracts; introduce asynchronous learner persistence only in that later phase. The initial free release cannot retroactively keep downloaded content secret.

## First implementation slice

Begin with Stage 1 architecture/schema decisions and Stage 2 local Postgres importer/read parity. Then implement private DB admin and safe progress backup, followed by hosted smoke tests and public launch. These small slices keep launch requirements complete without adding deferred accounts/cloud analytics.

## Sources

- [Cloudflare static requests and Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Render service pricing](https://render.com/pricing) and [published Starter comparison](https://render.com/articles/render-vs-railway)
- [Supabase pricing, compute credits, backup retention, and add-ons](https://supabase.com/pricing)
- [Neon compute pricing examples](https://neon.com/blog/major-compute-price-reduction-on-neon) and [usage-based billing](https://neon.com/blog/new-usage-based-pricing)
- [AWS Lightsail pricing and database example](https://aws.amazon.com/lightsail/pricing/)
- [AWS RDS Postgres pricing](https://aws.amazon.com/rds/postgresql/pricing/) and [AWS Calculator](https://calculator.aws/)
- [Vercel Hobby commercial-use restriction](https://vercel.com/docs/plans/hobby)

- [Render regions](https://render.com/docs/regions)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Render external rewrites](https://render.com/docs/redirects-rewrites)

## Planning verification

Reviewed current architecture, backend repository/routing contracts, existing admin gateway, progress codecs and CI. This revision changes planning artifacts only. `npm run build` passed again, including typecheck, with a non-blocking chunk-size warning. The revised canvas passed TSX syntax validation; host rendering was not verified.
