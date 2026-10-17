# Simplification and hosting preparation

Goal: remove accumulated complexity and prepare for hosted production using managed services. Scope rules are in [AGENTS.md](../../../AGENTS.md).

## Phases

1. **Docs and process** (done).
2. **Scripts and CI** (done): one container smoke (`npm run test:containers`), single-arch CI, two Playwright configs. Left: `control-resilience-fixture.py` stays for two backend DB-outage tests.
3. **Frontend**: progress backup simplified (done). Admin: gateway interface, in-memory test gateway and tiny files removed (done). Boundary plugin replaced by `@typescript-eslint/no-restricted-imports` blocks in `eslint.config.mjs` (cycle and learner-graph checks dropped; the built-bundle check covers admin/QA/bank exclusion), tiny files merged and implementation-coupled tests removed (done).
   - Follow-up decision: quiz and flashcard admin save models differ (quiz change sets with server-reserved IDs vs whole-bank flashcard operations). Unifying them onto one model would let the two panels, bulk-add drafts and change-set modules merge; this is a behavior/design change, not a cleanup. Resolved in 4b: both panels use the record API.
4. **Backend: per-record editor** (design below). Backup taken 2026-10-17: `var/backups/postgres/20261016T160123Z-6a36e7c0.dump`. Draft equalled the active release at that time (no unpublished work).
   - 4a. Backend: draft record tables + record API + publish from rows; remove whole-pair save, reservations, undo/reset revisions and fence checks on the editor path. Done; `0007_draft_records` applied to the authority database 2026-10-17 after backup `20261017T003844Z-af3ee49d.dump`.
   - 4b. Admin frontend switched to the record API; change sets, ID reservation/remapping, prepared previews, save-review, undo/reset/history UI and client bank serialization deleted (done). Quiz and flashcard panels share one editing hook and one delete flow; added a Changes dialog with Revert and Discard unpublished changes; publish is one confirmation.
   - 4c. Done (migration `0008_retire_legacy`, not yet applied to the authority database): dropped the whole-pair draft, history, reservations, `entity_ids`/`id_counters`, allocation fence, authored-event tables and the PL/pgSQL validation and editor functions; removed file import (`import-pair`, `validate-pair`, `parity`), allocation CLI and journals. A new database is initialized by `pg_restore` of an authority dump; tests and fixtures seed with `store_release` + `activate_release` + `reset_draft` + `advance_ids(…, 0)`. `store_release` no longer takes reservations. `export-release`, `validate-export` and `activate` stay.
   - 4d. Admin auth via managed identity or auth proxy once the host is chosen. Single editor.

## Phase 4 design: per-record editor

Decisions: single editor; no multi-step undo (per-record revert and "discard unpublished changes" suffice). Learner delivery and release tables are unchanged.

- **Draft tables** `content.draft_{subjects,quizzes,questions,decks,flashcards}`: same content columns as the release tables, without `release_id`; `id` primary key; `version integer` for optimistic concurrency; `position numeric` as the global sort key (copied from the release's global position; inserts take the midpoint between neighbours, appends take max+1). Parent FKs with no cascade; the API cascades explicitly.
- **IDs**: `s`/`q`/`i` from per-kind sequences starting after the current maximum; decks and cards use `d-<uuid>`/`f-<uuid>` like existing records. Assigned on insert, never changed. After restoring an older backup, advance the sequences (one CLI command) so IDs that learners may have seen are not reused.
- **History** `content.draft_changes` (id, at, actor, kind, entity id, action, before jsonb, after jsonb). It is the audit trail and the source for "revert this record". `content.draft_state` holds the base release and the change id at the last publish.
- **API** under `/api/admin/draft` (existing session, CSRF and fresh-auth guards):
  - `GET /draft` returns all records (gzip) plus a `changed` flag.
  - `POST`/`PUT {expectedVersion}`/`DELETE {expectedVersion, cascade}` for each kind; `POST .../bulk` creates many children of one parent in one transaction; `PUT .../move` changes the parent or position.
  - `POST /draft/changes/{id}/revert`; `POST /draft/discard` resets the draft to the active release.
  - A stale version returns 409.
- **Validation**: on each write, the shared policy validator runs on a mini pair (the record plus its ancestors); the full pair is validated at publish. One validator, no PL/pgSQL JSON checks.
- **Publish**: build both documents from draft rows ordered by `position`, serialize deterministically, and reuse the existing release store + activate path. An unchanged draft yields byte-identical documents (this is also the migration check).
- **Migration 0007**: refuse unless the draft documents equal the base release artifacts; copy the base release rows into the draft tables; initialize the sequences; verify that a rebuild matches the release artifacts byte for byte.

## Carried over

- Admin UX redesign stage 5: integrated manual acceptance of the redesigned admin.
- Hosting launch: choose host and managed Postgres (Neon provisional; confirm PITR retention, region near the Philippines, budget alerts); choose admin identity (ZITADEL was the provisional OIDC candidate, or use an auth proxy); stable HTTPS origin with same-origin `/api`; deployed smoke test; real-device browser checks.

## Open questions

- Hosting platform and Postgres provider.
- Number of editors (affects publish workflow and auth).
