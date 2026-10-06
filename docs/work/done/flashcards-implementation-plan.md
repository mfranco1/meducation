# Flashcards dashboard, normalized content, and admin implementation plan

Status: implementation and automated acceptance checks complete after a corrective audit; manual assistive-technology release QA remains unverified. See [audit findings](flashcards-implementation-audit.md).
Created: 2026-10-06.

## Outcome and scope

Add a complete first flashcards workflow: Flashcards dashboard → subject → topic filter → deck → study and resume. Reuse the quiz dashboard's visual structure, Continue Studying carousel, subjects grid, and subject-page layout. Do not show scores, trends, completion statistics, mastery, or other analytics.

Include normalized JSON content and local admin CRUD for topics, decks, and their cards. Minimal card study and saved position are included because a working Continue Studying carousel needs real resumable activity. These are proposed product defaults, not existing behavior.

Exclude spaced repetition, grading buttons, scheduling, shuffle, reverse/cloze cards, cross-deck card reuse, user-created learner decks, cloud sync, accounts, database installation, and production admin writes. No runtime AI. Do not generate or convert medical content as part of infrastructure implementation; use test fixtures and separately reviewed initial content.

## Findings from the existing implementation

- `src/app/screens/FlashcardsDashboardScreen.tsx` is a placeholder; the drawer and `View` already include the Flashcards dashboard.
- `DashboardScreen.tsx` combines a statistics row, an `ActiveSubjectCarousel`, and a grid of `SubjectCard` components. The statistics row is quiz-specific.
- `SubjectCard.tsx` and `ActiveSubjectCarousel.tsx` accept quiz `SubjectStat` data. Reuse their presentation after removing that dependency from their shared base, rather than inventing quiz attempts or scores for decks.
- `SubjectScreen.tsx` combines reusable heading/list geometry with quiz setup, quiz launch, scores, and retake behavior. Share the frame and row presentation; retain separate feature screens and actions.
- `App.tsx` currently gets top-level navigation from `useQuizSession`. Adding flashcard study requires a small, deliberate navigation boundary change, not embedding flashcard sessions in quiz attempts.
- The canonical quiz bank is schema v4 with flat `subjects`, `quizzes`, and `questions`. Subjects already have stable `s*` IDs; question topics are optional free-text metadata, not normalized topic entities.
- There is already a read-only FastAPI content service, progressive loading, revisions, retry infrastructure, and a local JSON fallback. Extend this existing delivery path; do not introduce another service.
- `/admin.html` stages validated changes in memory and exports JSON and a change set. It does not directly save repository files or publish content. Keep those semantics for flashcards.

## Recommended product decisions

1. **Dashboard:** show a Flashcards heading, Continue Studying when applicable, and All Subjects. Remove the statistics row completely; do not leave empty space for it.
2. **Shared subjects:** show the same subject catalog, names, order, accents, and IDs as Quizzes. Subjects with no decks still open to an honest empty state. A deck count is inventory information, not a study metric.
3. **Topics:** each topic belongs to exactly one subject; each deck belongs to exactly one topic. The subject screen opens on All Topics, with a single-select topic filter. This allows subject → deck directly or subject → topic → deck without a compulsory extra page.
4. **Unclassified decks:** require a topic. If needed, an author explicitly creates a General topic under that subject; do not silently create topics or use missing relationships as classification.
5. **Deck rows:** show title, topic, card count, and Study deck or Resume deck. Resume may show “Card 7 of 24.” No score, mastery, streak, timer, or completion-history badges.
6. **Continue Studying:** retain subject cards, matching Quizzes. Include subjects with at least one resumable deck, order by latest saved active-deck activity, and break ties using canonical subject order. Clicking opens the subject, where active decks appear first. It does not silently choose a deck.
7. **Study:** front/back reveal, Previous/Next, card position, explicit Finish on the last card, and Save and exit. Save a checkpoint after navigation; resume on the saved card with the front visible. Merely revealing the last card does not finish a session.
8. **Completion:** Finish clears the active checkpoint; it records no score or completion history. A later Study starts from the first card. One active checkpoint per deck, with multiple decks allowed.
9. **Empty decks:** valid for local authoring, visible with zero cards, and not launchable. If publication/draft visibility is needed later, add it explicitly rather than infer it from unrelated fields.

## Canonical data design

### Storage ownership

Keep `src/content/questionBank.generated.json` authoritative for existing quiz content and shared subjects. Add `src/content/flashcardBank.generated.json` as the sole authority for flashcard topics, decks, and cards. Do not copy subject records into it. This avoids a quiz-bank migration while establishing one authoritative subject registry.

A small shared `SubjectCatalog` interface exposes subjects independently of `QuizRepository`; its current adapter reads the existing subject collection. A future database can put those records directly into a shared `subjects` table. Extracting subjects into a third JSON file is unnecessary in this change and would require a separate coordinated migration.

The flashcard file has `schemaVersion: 1` and three flat arrays:

```ts
interface StoredTopic {
  id: string;        // t*; stable and opaque
  subjectId: string; // existing s* ID
  name: string;
}

interface StoredDeck {
  id: string;        // d*; stable and opaque
  topicId: string;
  name: string;
  description?: string;
}

interface StoredFlashcard {
  id: string;        // f*; stable and opaque
  deckId: string;
  front: string;     // canonical rich Markdown
  back: string;      // canonical rich Markdown
  sources?: string;  // restricted Markdown, consistent with existing sources
  reviewNote?: string;
}

interface StoredFlashcardBank {
  schemaVersion: 1;
  topics: StoredTopic[];
  decks: StoredDeck[];
  cards: StoredFlashcard[];
}
```

The relationship chain is `card.deckId → deck.topicId → topic.subjectId → subject.id`. Do not store `subjectId` on a deck or card, `topicId` on a card, repeated subject/topic names, card counts, child-ID lists, or learner progress in canonical records. Runtime/API summaries may derive those fields.

Canonical array order within each parent defines topic, deck, and card order, matching quiz conventions. Admin reorder/move operations modify that order intentionally. Display numbering is derived; IDs never encode position or change on a move. Renaming subjects/topics never rewrites child content.

Use a type-prefixed UUID suffix for new topic/deck/card IDs, allocated once by admin draft compilation and retained through preview/stage/export. This avoids ID reuse after deleting the highest numbered record and collisions across independently prepared exports. Existing `s*`, `q*`, and `i*` IDs remain untouched; prefixes do not imply numeric parsing.

Require nonblank names and card faces, unique IDs, known parents, valid optional fields, and no unknown keys. Warn about duplicate sibling names rather than using labels as identity. Optional fields are omitted, not null. Apply existing Markdown/HTML/URL/math validation and rendering policy to both faces. Sources remain restricted Markdown. Change reasons and exported change sets preserve the rationale for intentional edits; `reviewNote` is available for content uncertainty. No automatic quiz-to-card conversion or answer-key rewriting is included.

Question `metadata.topic` strings remain unchanged. They are not silently treated as foreign keys. The new topics can support future normalized quiz classification, but that requires a separate reviewed mapping.

### Future PostgreSQL mapping

- `subjects(id text primary key, name, accent, position)` contains the existing subject records once.
- `topics(id text primary key, subject_id references subjects, name, position)`.
- `decks(id text primary key, topic_id references topics, name, description nullable, position)`.
- `flashcards(id text primary key, deck_id references decks, front, back, sources nullable, review_note nullable, position)`.
- Add indexes on foreign keys and unique `(parent_id, position)` constraints, using the relevant parent column for each table. Use a unique subject position as well. Map each parent's array order to one-based position on import.
- Restrict parent deletion by default. Explicit authoring cascades run inside a transaction and enumerate affected children; they must not silently delete quiz content.
- Reordering multiple rows will need transactional position updates or deferrable uniqueness. Stable IDs remain text primary keys; no ID regeneration or content rewrite is needed.
- Future `user_deck_progress(user_id, deck_id, current_card_id, content_signature, updated_at)` is separate from content and keyed by `(user_id, deck_id)`. Validate that the current card belongs to that deck. User identity and this table are deferred.

For v1, one card belongs to one deck and one deck to one topic. If real reuse requirements emerge, migrate to a membership relation then; do not add junction tables speculatively.

## Runtime and persistence boundaries

- `FlashcardRepository` supplies indexed topics, deck summaries, and ordered cards. Storage types remain separate from hydrated runtime summaries.
- `RuntimeFlashcardBank` handles asynchronous resource state and subscribable caches, reusing the existing transport/retry mechanisms. Local JSON and API adapters expose equivalent results.
- `FlashcardProgressRepository` owns a separate validated, versioned localStorage envelope, proposed key `meducation.flashcards.progress.v1`. Never write flashcard data into `meducation.progress.v2`.
- A checkpoint stores `deckId`, `currentCardId`, `contentSignature`, and `updatedAt`. It does not duplicate card bodies, subject IDs, topic IDs, scores, or elapsed time. The envelope has its own storage revision for stale-write detection.
- Derive active subject summaries through the content catalog. Browsing/filtering does not create checkpoints or reorder activity. Starting a valid deck creates its first checkpoint.
- A per-deck signature covers ordered card IDs and canonical card content; unrelated deck edits do not invalidate a session. Changed or removed cards require an explicit restart choice. Do not guess a replacement index. Removed decks do not appear as resumable; retain orphan checkpoints until explicit cleanup so an accidental content removal is recoverable.
- Validate corrupt/future-version storage without overwriting it. Report quota/write failures, keep unsaved state available to retry, and do not navigate away or claim a successful Finish when the write failed.
- Reuse snapshot subscriptions and storage-event patterns with independent state. Retain the current documented optimistic cross-tab limitation; do not imply that localStorage provides transactional locking.

## Step-by-step implementation and acceptance gates

### 1. Establish the baseline and contracts

- [x] Record existing quiz checks and snapshot canonical quiz bytes/IDs/order; capture representative dashboard/subject screenshots. Quiz browser tests already capture the unchanged quiz dashboard/subject flow; `git diff` confirms no canonical quiz-bank edits.
- [x] Add `docs/flashcard-schema.md` documenting the schema and product defaults above. Update this tracker as work proceeds.
- [x] Create small test fixtures: multiple subjects/topics/decks, empty subject/topic/deck, active decks, orphan references, reordered cards, and mixed rich content. Keep fixtures separate from canonical medical content. Backend fixtures cover empty and populated normalized relationships; the Playwright fixture supplies an isolated two-card deck.

Gate: the scope and relationships are explicit, and there is a reliable quiz regression baseline.

### 2. Implement schema, validation, and the local repository

- [x] Add flashcard storage types, shared-subject references, and a focused local read-only adapter.
- [x] Add structural, foreign-key, rich-content, and schema-version validation. Validate flashcards against the authoritative subjects, not an independent list.
- [x] Add deterministic serialization and parent-scoped ordering; the read-only adapter indexes records and derives counts. Add an initially empty valid canonical flashcard bank until reviewed content is available. (The empty bank is in place.)
- [x] Extend `validate:content` to validate both banks and cross-file references.
- [x] Introduce a shared authoring validation boundary: quiz-bank previews reject removal of subjects that flashcard topics still reference. Subject renames preserve references because IDs persist. A combined cross-bank admin snapshot will replace the current canonical-reference check during the admin phase.

Progress: storage types, empty schema-v1 bank, deterministic serialization and cross-language revision parity, indexed local adapter, cross-reference/content validation, schema documentation, combined `validate:content` integration, and quiz-admin protection against removing a referenced shared subject are in place. Structural validation was verified by focused tests and `npm run validate:content`.

Gate: empty and populated fixture banks round-trip deterministically; orphan parents and unsafe content fail; the quiz bank is byte-for-byte unchanged.

### 3. Add content delivery through the existing service

- [x] Add a Python flashcard repository protocol/JSON adapter and typed DTOs in the existing backend. Load and validate both banks as one consistent read snapshot.
- [x] Add `GET /api/v1/flashcards/subjects` for shared subject records plus derived deck membership/counts, `GET /api/v1/flashcards/subjects/{subject_id}/catalog` for topics/deck summaries, and `GET /api/v1/flashcards/decks/{deck_id}/cards` for ordered cards.
- [x] Keep existing quiz routes and quiz revisions compatible. Compute a separate flashcard revision from the flashcard bank and the authoritative subject collection, not all quiz questions. Mirror serialization/hash fixtures in TypeScript and Python.
- [x] Pin flashcard requests to that revision; retain ETag, 409 mismatch, 404, safe error, retry, timeout, cancellation, deduplication, and stale-response guarantees.
- [x] Implement local-mode parity and `RuntimeFlashcardBank`. It loads subjects on demand, supports selected-subject catalogs and lazy card loading, and cancels abandoned requests; integrate the calls into learner screens in later steps.

Gate: repository and API contracts are verified with fixtures and focused tests. UI navigation cancellation and production screens remain for steps 5–7; no new service or write endpoint exists.

### 4. Extract shared presentation with quiz behavior unchanged

- [x] Extract a dashboard frame with optional summary content, a reusable subjects grid, and reusable loading placeholders.
- [x] Extract a subject-card presentation accepting subject data and feature-provided content. Quiz score/trend content remains in the quiz wrapper.
- [x] Generalize the carousel to receive generic items and a render callback. Embla, overflow controls, keyboard behavior, and reduced motion stay shared.
- [x] Extract a subject-page frame. Quiz setup dialogs, completion counts, retake rules, and launch handlers remain in the quiz screen.
- [x] Keep feature screens and actions separate while sharing loading, transitions, theme, and rich-content presentation as appropriate.

Gate: existing dashboard, carousel, subject, and quiz launch tests pass after extraction; production type-check/build succeeds. Visual browser comparison remains open for the end-to-end UI phase.

Progress: dashboard, carousel, and subject-screen regression tests pass; 45 focused tests passed. `npm run build` and `npm run lint` pass. The shared layout uses the same card geometry and carousel breakpoints as before.

### 5. Add flashcard checkpoints and pure study behavior

- [x] Implement checkpoint codec/repository and pure start, resume, advance, previous, restart, and finish operations. React coordinates these functions instead of containing domain rules.
- [x] Implement signatures and explicit changed-content recovery; cancel/restart must preserve or replace checkpoints predictably.
- [x] Add pure selectors for subject activity and deck state. Active decks sort by most recent checkpoint; inactive decks retain canonical order. Topic filtering preserves that order.
- [x] Cover corrupt storage, unavailable storage, missing cards/decks, stale tabs, and failed writes. Revealing a card remains transient and resets to front on navigation/resume.

Gate: repository and pure rules pass focused coverage and remain separate from quiz attempts. Start/resume navigation integration is due in steps 6–7.

### 6. Build dashboard, subject/topic selection, and navigation

- [x] Replace the Flashcards placeholder with the shared dashboard frame, active-subject carousel, and full subjects grid.
- [x] Add `FlashcardSubjectScreen` with the shared heading/back/list frame, All Topics control, topic filtering, and deck actions.
- [x] Add distinct `flashcards-subject` and `flashcards-study` views and screen identities. Keep card position out of screen identity so navigating cards does not remount the whole screen.
- [x] Keep quiz session transitions in `useQuizSession` and create a separate flashcard session hook. App composes top-level quiz destination with flashcard subject/study state.
- [x] Derive the selected drawer section from every flashcard view. Back returns to the proper Flashcards parent and preserves the selected topic while returning from study. Keep the existing brand-to-Quizzes behavior.
- [x] Preserve quiz and result-review exit confirmations when entering Flashcards. Leaving study checkpoints first, blocks on failure, and does not invoke quiz scoring or quiz dialogs.
- [x] Provide resource-specific loading, failure/retry, zero-content, and no-decks-for-topic states. Failed loads must never masquerade as empty catalogs.

Gate: users can select any shared subject, filter its topics, and select only that subject's decks; no flashcard screen renders a quiz score or setup dialog.

### 7. Complete minimal deck study

- [x] Add a lazy-loaded study screen with front/back reveal, Previous/Next, position, Save and exit, and explicit Finish on the last card.
- [x] Render both faces with the shared safe rich-content renderer; expose reveal state and controls accessibly. Focus remains on the invoked navigation control and live card content is announced; no global keyboard shortcuts are installed.
- [x] Wire guarded deck launch, content-change restart, and successful checkpoint persistence before navigation. Save state during normal interaction rather than relying only on unload events.
- [x] Remove finished decks from active selectors; keep any other active decks in their subject carousel card. Hide the carousel when none remain.

Gate: end-to-end start → reveal → advance → exit → reload → resume → finish works, and Continue Studying reflects each committed change.

### 8. Extend local admin authoring

- [x] Add Quizzes/Flashcards authoring sections in `AdminApp`, with a focused flashcard editor and shared shell.
- [x] Navigate shared subject → topic → deck → card. Subject names/IDs are selected from the existing registry. Author subject changes in one place only.
- [x] Support topic/deck/card create/read/update/delete/move/reorder. Moving a deck changes its topic and derives its new subject; IDs and card text remain intact.
- [x] Use an independent versioned flashcard change-set contract with flashcard and subject base revisions, required reason, immutable IDs, and parent-scoped `afterId` insertion.
- [x] Allocate IDs once, validate the entire candidate before staging, and retain bounded undo, reset, and unsaved-change protections. Admin edits are single-record rather than bulk drafts; no asynchronous preview is needed for this local synchronous authoring flow.
- [x] Require explicit cascades for deleting nonempty decks/topics and show affected counts. Block subject removal while topics reference it; deliberately deleting/moving topics first allows the coordinated quiz subject change.
- [x] Coordinate staged subject and flashcard snapshots for validation. Switching authoring sections retains staged edits.
- [x] Export `flashcardBank.generated.json` plus a reasoned operation change set. Flashcard-only changes do not export a rewritten quiz bank; a manifest identifies revisions when shared subjects are also staged.
- [x] Add a typed operation replay validator and an import-preview/stage flow that checks flashcard and subject base/result revisions, validates final foreign keys, and rejects stale imports. Shared-subject changes are exported in a coordinated bundle and imported/staged atomically as a validated pair, including subject removal with topic relocation.
- [x] Keep admin local and omitted from normal production builds.

Gate: author a topic/deck with cards, edit/move/reorder it, export/reload, and delete with explicit cascade. Invalid mixed batches roll back fully; stale imports/previews fail without mutation; quiz editing remains operational.

### 9. Integrate, verify, and document

- [x] Extend unit/component coverage for contracts, selectors, checkpoints, filters, carousel states, navigation ownership, admin operations, and absence of analytics.
- [x] Add shared TypeScript/Python flashcard contract fixtures, including optional fields, foreign keys, ordering, and revision parity; both implementations derive `sha256-a601a3…a8104bd10` for the same fixture snapshot.
- [x] Extend Playwright fixtures and flows for study/resume/finish, topic selection, and coexistence with saved quizzes. Existing retry/cancellation/changed-content guarantees have focused runtime and repository tests; a dedicated admin browser test covers CRUD staging and exported replay preview.
- [x] Check mobile/desktop layouts, keyboard access, accessible role/label queries, reduced motion, long card content, math/images, and zero/one/many active subjects through component and browser coverage. Playwright artifacts capture dashboard, subject, and mobile study layouts.
- [x] Run final `npm run lint`, `npm run format:check`, `npm test`, `npm run validate:content`, and default plus admin-enabled `npm run build`. `npm run test:e2e` passed all eleven learner tests including flashcard study/resume/finish, mobile study view, reduced motion, keyboard focus transfer, math rendering, and layout screenshots; `npm run test:e2e:admin` passed its CRUD/export replay workflow.
- [x] For backend changes, run `.venv/bin/python -m pytest backend/tests -q`, `.venv/bin/ruff check backend/src backend/tests`, and `.venv/bin/mypy backend/src`.
- [x] Verify default production build excludes admin, explicitly enabled admin builds, API/local adapters agree, and existing canonical quiz content/provenance/IDs/order remain unchanged. Run `git diff --check`.
- [x] Update architecture, product, design-system, content-management, testing, and flashcard-schema docs; point question-schema docs to shared subjects without implying existing quiz topics were migrated.
- [x] Complete the dedicated admin browser workflow, record final findings, and move this tracker to `docs/work/done`.

Current verification record (after corrective audit): 332 frontend tests across 58 files pass, `npm run test:e2e` passes all 11 learner tests (the flashcard filter/resume/layout flow was rerun after its final UI correction), `npm run test:e2e:admin` passes the expanded create/update/move/reorder/cascade-delete/undo/export replay workflow, backend pytest passes 40 tests, Ruff and mypy pass, lint and format checks pass, and content validation passes with 0 canonical flashcards (13 shared subjects). Default and admin-enabled builds succeed; `git diff --check` passes and `questionBank.generated.json` is unchanged. TypeScript and Python produce the same revision for the shared contract fixture. Builds retain the repository's >500 kB chunk warning; the admin-enabled bundle includes the existing question-authoring content.

Gate: all automated checks pass and the entire learner/admin workflow is reviewable without production infrastructure changes. Manual VoiceOver/NVDA verification is not established by role/label or keyboard tests. No instrumented coverage percentage or production-scale benchmark was measured. Real reviewed flashcard content remains intentionally deferred.

## Suggested delivery sequence

1. Schema, cross-bank validation, subject seam, local adapter, and fixtures (steps 1–2).
2. Existing API extension and runtime loading (step 3).
3. Shared UI extraction with quiz regression coverage (step 4).
4. Flashcard checkpoints, dashboard, topic/deck navigation, and study (steps 5–7).
5. Admin flashcard CRUD and coordinated export/import (step 8).
6. Integrated E2E, accessibility checks, documentation, and release validation (step 9).

Deliver each as a reviewable change; keep intermediate learner functionality behind the existing placeholder or a development flag until its actions work. A catalog-only intermediate milestone is useful, but it is not completion of the Continue Studying requirement.

## Main risks and resolution

- **Shared-subject deletion across two files:** enforce references in both admin and combined validation; reject destructive cross-bank cascades; export coordinated changes together.
- **Accidental quiz regressions during reuse:** extract presentation incrementally and preserve separate controllers, progress repositories, and feature wrappers.
- **Scope expansion into a scheduling product:** ship basic front/back study and position-only checkpoints; defer learning algorithms and analytics.
- **Navigation entangled with quiz sessions:** separate destination ownership before adding another study session type, with exit behavior covered by integration tests.
- **Stale content and authoring snapshots:** independent flashcard revisions plus subject dependencies, per-deck signatures, and atomic staged validation.
- **Unreviewed starter material:** empty canonical bank is acceptable for infrastructure; use test fixtures for proof and add reviewed real decks separately before a content-filled launch.

Planning verification: inspected current learner, content, persistence architecture documentation, schema, admin contracts, and existing API. No application code or canonical content changed. `npm run build` passed, including TypeScript checking, with a Vite chunk-size warning; `git diff --check` passed. Feature-specific checks above remain future acceptance gates, not claimed results.
