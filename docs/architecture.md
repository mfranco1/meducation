# Architecture

The designated local PostgreSQL database is the sole writable authority for paired quiz/flashcard content. Authenticated HTTP authoring owns durable paired drafts and explicit immutable publication. Learners read a request-pinned published pair; progress remains browser-local. The learner has no bundled/offline source. Repository JSON databases, source selection and file-backed authoring are retired. See [ADR0006](decisions/0006-postgres-only-content.md). File-backed frontend authoring and local content repositories are retired. Preserve no runtime AI, module boundaries and locally retained allocation/recovery evidence; off-device retention is user-deferred for the current local target. See [the recovery runbook](L4-authoritative-recovery.md).

This page owns current module boundaries and data flow. [Product behavior](product.md), [design conventions](design-system.md), [content management](content-management.md), and [testing](testing.md) own their respective requirements. The [ownership decision](decisions/0001-repository-ownership-and-boundaries.md) explains the rationale; completed work trackers preserve migration history.

## Repository ownership

Keep one frontend package and the existing Python package. Root HTML entry points and tool-discovered configuration stay at the repository root. Use relative imports; introduce aliases only when compiler, Vite, tests, scripts, and boundary checks resolve them consistently.

- `src/app`: learner composition, navigation identity, lazy/preload wiring, and drawer policy.
- `src/features/quizzes`: quiz screens, controls, session coordination, selectors, feedback, results, and celebrations.
- `src/features/flashcards`: flashcard screens, study controls, session coordination, and selectors.
- `src/shared`: theme and reusable presentation under `ui/{shell,loading,transitions,notifications,content,study,catalog}`. Share components with demonstrated reuse or an application-wide responsibility.
- `src/domain`: pure rules, types, and repository interfaces. `src/analytics` owns pure aggregation; `src/persistence` owns storage repositories and codecs. These small boundaries stay flat.
- `src/content`: stored contracts in `schema`, transport/decoders/runtime repositories in `api`, checks in `validation`, and framework-independent rendering policies in `richText`.
- `src/admin`: separate authoring composition and presentation, with independent `core` and `data` boundaries. The former bundled content-QA viewer is retired.
- `backend/src/meducation_api`: published learner delivery, guarded paired HTTP authoring/session services and explicit database jobs. Package metadata is ignored output.
- `scripts/content`: validation/audit CLIs; `scripts/architecture`: shared dependency policy and tooling.
- Colocated tests belong to their module. `src/test` supplies test setup; `tests/fixtures` holds shared contracts; `e2e` holds browser workflows and their fixture banks. See [suite ownership](testing.md#suite-ownership-and-fixtures).

Ownership boundaries do not require one file per function or a wrapper around each dependency. Extend existing modules before adding files; consolidate code with the same responsibility when it reduces navigation and state synchronization. Follow the [simplicity policy](../AGENTS.md#engineering-philosophy). Avoid broad barrels, forwarding modules, speculative shared layers, and empty placeholder directories. Maintenance scripts are outside the application graph. Ignored private PDFs and extraction data have separate [backup requirements](content-management.md#local-source-material-and-generated-output).

## Checked dependency boundaries

`npm run lint` applies the local `architecture/boundaries` ESLint rule to source modules, using TypeScript resolution for static imports, re-exports, import types, `require`, and literal dynamic imports. Relative path variants and configured aliases resolve to the same owner. Non-literal module paths are rejected because their ownership cannot be checked. The policy and resolver live in `scripts/architecture/boundaries.mjs`; the ESLint plugin and graph command share them.

Domain modules depend only on domain; analytics and persistence depend on their own layer and domain. These layers and content cannot import React/MUI/Emotion. Content depends only on content and domain. Shared presentation uses shared, content, domain, and analytics modules. Features use their own feature and lower-level modules, never app, admin, QA, or sibling features. Within features, concrete storage imports are limited to feature sessions; selectors can use storage contract types. App composition may wire concrete persistence services for cross-feature operations. Admin core/data cannot import presentation. App remains the composition root, and admin can use shared rendering and content validation. Browser storage globals and properties are restricted to persistence; tests can exercise storage fixtures.

Tests retain the same ownership rules, with fixture/helper access permitted. One explicit existing exception lets `src/content/validation/bankContract.test.ts` import `src/admin/core/serializeBank.ts` for Python/authoring revision parity. It does not allow other content tests to import admin. Production modules cannot import tests, fixtures, or maintenance scripts.

`npm run check:architecture` checks the whole source/script graph for forbidden edges and runtime cycles, including dynamic edges. Explicit type-only edges are checked for ownership but excluded from runtime cycles. It follows every runtime edge, including dynamic imports, from learner bootstrap and App to reject local-bank adapters, bundled banks and the retired QA viewer. A separate static-edge check rejects eager validation-pipeline loading. Learner content is loaded through the API. This is an import-graph check, not proof of arbitrary runtime control flow. The adversarial Node tests run separately with `npm run test:architecture` in CI.

The implementation follows [ESLint's local-plugin guidance](https://eslint.org/docs/latest/use/configure/plugins) and uses the installed [TypeScript compiler's module resolver](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#customizing-module-resolution), avoiding a new dependency or a second alias mapping.

## Canonical content and domain rules

The PostgreSQL quiz document and its deterministic exports use schema v4. Records use compact type-prefixed IDs (`s*`, `q*`, `i*`) and contain display-ready GFM/KaTeX stems and rationales, canonical choices, answer provenance, and optional rationale metadata such as sources and answer-review notes. The stored shape uses the minimal relationship chain of `question.quizId -> quiz.subjectId`; question order within each quiz is canonical array order. `src/content/schema/schema.ts` defines the storage contract. The API adapter validates DTOs, hydrates sparse metadata and exposes the learner `QuizRepository` interface; the former frontend local JSON repository is removed. `MarkdownContent` is the sole learner-facing content renderer. Stems and rationales use rich mode: `remark-math` parses math, raw HTML is parsed with `rehype-raw`, the shared restrictive `rehype-sanitize` policy runs before `rehype-katex`, and KaTeX CSS/fonts are bundled locally. `remarkMathPolicy.ts` preserves common currency prose from greedy dollar delimiter pairing. Choices, choice explanations, and sources retain restricted Markdown rendering. `richContentPolicy.ts` owns allowed HTML and image URLs, while `markdownValidation.ts` validates the same math and rich-content rules for canonical and staged content. `src/domain` holds pure quiz rules and types. `src/persistence` implements local storage behind repository interfaces. Completed attempt history is capped at 200 entries, while completion counts plus each quiz's lowest and latest scores remain durable in the progress envelope so those analytics survive history pruning. A separate per-quiz activity summary records the latest saved or completed use for subject-screen ordering. Active attempts include an optional stable current-question ID plus persisted accumulated active time and a running-session timestamp, allowing the UI to resume both progress and the stopwatch. Fast Feedback pauses its persisted timer when all canonical questions have locked answers; resuming a fully answered attempt keeps it paused while the learner reviews. `src/analytics` aggregates structured completed attempts.

The PostgreSQL flashcard document and its deterministic exports use schema v2. It represents decks and cards; the paired quiz export represents their shared subject catalog. The live authority stores this same relationship in PostgreSQL. Its minimal relationship chain is `card.deckId -> deck.subjectId -> subject.id`; the PostgreSQL/API adapters retain parent membership, canonical order and card counts. Subject catalogs retain canonical deck-array order. The combined `flashcardValidation.ts` gate checks structural references, rich content and duplicate sibling names for stored content validation and paired HTTP authoring. Flashcard progress uses its own versioned localStorage repository and is never quiz attempt data. Each deck's SHA-256 signature is computed once during launch; schema-v2 checkpoints store only its current card ID plus opened and flagged card IDs, while durable per-deck completion counts and five scalar daily aggregate fields support flashcard dashboard statistics. Existing v2 progress without completion or daily statistics normalizes safely without a storage write. Opening and flagging use the same optimistic revision checks and repository abstraction as position changes. Finishing a deck increments its count, updates the compact daily aggregate, and clears its checkpoint in one commit. The daily aggregate stores first/current local dates, the current day's count, tracked completion total, and highest daily count; elapsed days are derived without a day-by-day history. Empty and removed decks are excluded from active selectors while their checkpoints and completion counts remain recoverable.

## Application composition

`src/shared/brand.ts` owns the app name, wordmark parts, accent color, and canonical logo geometry. Shared `AppBrand` and `BrandMark` provide the wordmark and icon; Vite's branding plugin uses the same data for HTML titles, theme color, and generated favicon. `src/shared/theme.ts` consumes the brand accent for the learner/admin theme. Reusable presentation lives under `src/shared/ui`: shell/brand, loading and recovery, transitions, generic notifications, rich-content rendering, shared catalog layouts, and shared study framing/navigation scrolling. These modules receive data and callbacks and do not import learner composition, feature modules, or admin. Content-error message mapping stays with loading/recovery presentation, outside the generic toast provider. Rich rendering uses the existing content sanitization/math policies and bundles KaTeX styles/fonts locally. Tests remain colocated with the shared modules.

Learner drawer policy and drawer helpers remain under `src/app/components`. Quiz screens, session hooks, selectors, feedback, results, and celebrations live under `src/features/quizzes`; flashcard screens, session hooks, selectors, and study controls live under `src/features/flashcards`. Each feature owns its session view contract in `session/navigation.ts`; app navigation composes those contracts and owns screen identity. Features do not import app or sibling features. The presentation-only `StatCard` lives under `src/shared/ui/catalog` because both quiz and flashcard dashboards and quiz results use it. Other feature-specific statistics and selectors stay with their owning feature. `src/app/lazyScreens.tsx` retains dynamic screen imports and preload wiring without feature barrels. Admin imports reusable UI directly from `src/shared`, without routing presentation through learner composition.

### Shell, navigation, and notifications

The learner shell keeps `AppNavigationDrawer` mounted outside screen transitions and owns only ephemeral expansion state. `View` includes a Flashcards destination, while drawer section selection is derived from the current view. Navigation requests from active quizzes and read-only result review pass through the existing exit confirmations; the session commits the requested dashboard only after the corresponding save or clear succeeds. The admin continues to use the header-only `AppShell` mode.

Reusable drawer presentation lives in `src/app/components/drawer`: `DrawerSurface` separates scrollable content from its edge control, and `DrawerEdgeToggle` owns the shared full-height hit target, arrow, hover/focus line, accessible state, and reduced-motion styling. It receives navigation-free toggle callbacks; application state and responsive drawer policy remain in `AppNavigationDrawer`.

The learner App owns a reusable toast provider outside screen transitions. Its portal host manages keyed notifications, positions, severity, actions, optional TTLs, and global or screen-scoped lifetime. App reports committed `screenIdentity` changes to the provider; screen-scoped toasts exit when their key is no longer current, while global toasts remain. Toasts fade on entry and exit, and reduced-motion preferences remove the transition. The guarded question-launch coordinator reports only current request failures to the composition layer; the layer converts them to safe persistent, subject-screen-scoped notifications without coupling UI to loading logic. Notification state stays in memory and does not write learner progress.

### Screens and session coordination

`src/shared/ui/study` owns the reusable study arrow-key event guards and bounded navigation hook used by quiz and flashcard screens. It receives navigation callbacks and does not own session or persistence state.

`ReadOnlyQuizChrome` and `ReadOnlyChoiceList` provide the shared header, footer, and answer presentation for Browse Answers and completed results review. They receive display data and callbacks, with no attempt mutation or persistence. `QuestionTile` supplies the existing navigator tile presentation to Browse, while `QuestionNavigator` keeps active and review filter sets. `FeedbackPanel` accepts optional read-only status for review and unavailable-answer cases; its default path preserves active Fast Feedback presentation. `ChoiceExplanations` renders optional per-choice rationales in both read-only screens.

`src/app/App.tsx` composes top-level navigation. Pure selectors in `src/features/quizzes/selectors/progress.ts` build dashboard subject summaries and per-subject quiz progress from repository interfaces and completed attempts, keeping storage reads and analytics out of screens. Its screen components receive data and callbacks, and reusable feedback and quiz components own presentation only. The subject screen owns transient setup-dialog state for a selected new or retaken quiz; setup is not a navigation view. The quiz and answer-browse screens share a responsive question-navigation frame and scroll-to-current primitive while retaining their mode-specific question controls. The answer-browse view is transient navigation state with a quiz and question index only; it reads canonical questions but never creates an attempt or calls the attempt repository, so browsing does not affect activity ordering or analytics. `src/features/quizzes/session/useQuizSession.ts` coordinates attempt transitions, page-hide pausing, and repository writes through the domain and repository interfaces. This keeps screens independent from `localStorage` and leaves room for a future repository implementation.

`useQuizLaunch` owns question-load deduplication, navigation generation, retry actions, and cancellation. It accepts a question-loader interface and calls the session only after current questions load. `lazyScreens.tsx` splits Quiz, Browse Answers, and Results presentation from the dashboard bundle; the relevant chunk starts preloading beside a question request, and Results preloads while a quiz is active. A screen boundary shows loading and a reload action if a chunk fails. The bootstrap entry similarly renders a reload action if its dynamic App import fails. These recovery messages contain no raw error details.

### Transient views and screen presentation

Exam-results review carries the just-completed attempt in transient navigation state. It reveals its responses without repository writes and is discarded after a confirmed exit.

`screenIdentity` in `src/app/navigation.ts` defines stable top-level destinations without including per-question progress or timer updates. `ScreenTransition` in `src/shared/ui/transitions/ScreenTransition.tsx` applies the shared entry animation at the composition boundary in `App.tsx`; the header and global exit dialog remain outside it. Screen content is replaced immediately, and reduced-motion preferences disable the animation.

`AppShell` keeps the learner header visible during the entry module import and lazy screen suspension. `ScreenLoading` supplies the centered accessible pending presentation; `ScreenLoadBoundary` owns suspense fallback and lazy screen failure recovery. Content receives a brief opacity entry only when the fallback was committed. The admin uses the same shell and loading presentation for its local bank snapshot wait. Resource-specific catalog skeletons and question-launch indicators remain in their screens.

`ResultsScoreHero` owns the decorative ring and score counter. A single request-animation-frame timeline drives both from the stored result percentage, while `ResultsScreen` remains responsible for the result summary and exact-score celebration.

Dashboard subject summaries live in `src/features/quizzes/selectors/progress.ts`. `App.tsx` composes the existing quiz and attempt repositories into those summaries; presentation components receive the resulting data and never read local storage. The active-subject carousel filters and orders only summaries that have saved active attempts, and `embla-carousel-react` owns its responsive scrolling, looping, and drag behavior.

## Progress and persistence

Learner progress uses a validated schema-v2 envelope under `meducation.progress.v2` through `LocalAttemptRepository`. Only the current v2 key is read; retired v1 keys are ignored. Missing current storage initializes an empty state. Malformed current records are preserved and reported without falling back to older data. A single storage write commits completed history, durable counts and scores, activity, completed IDs, and removal of the matching active attempt. History is capped at 200 records; completed IDs remain durable so repeated submissions cannot inflate counts after pruning. New active attempts record an exact signature of ordered question stems, choices, source answers, and verified answers, plus a bank revision for diagnostics. A changed-content active attempt requires an explicit restart before scoring. Current attempts include elapsed time, celebration state, and selected-response lock data; active records also require a content signature. Stale repository instances detect a changed storage revision before saving and direct the learner to reload. This optimistic check is not an atomic cross-tab lock; a truly simultaneous read/write race remains possible. The browser storage event provides reactive cross-tab updates.

The repository caches a deeply frozen progress snapshot. Getters and dashboard/subject selectors share it until a local write or relevant browser `storage` event invalidates it; getters never write storage. React subscribes through `useSyncExternalStore`, so local writes and cross-tab changes refresh progress without rerendering from repeated storage reads. `createProgressView` groups retained completed scores by quiz and subject, and uses the stored activity summary. Cross-tab updates change the displayed snapshot but preserve the original edit revision, so a stale editing tab still refuses its next save and asks for reload. The optimistic simultaneous-write limit remains.

## Content API and loading

Public learner content is served through FastAPI from the designated local PostgreSQL authority. Authenticated private editor routes save drafts and explicitly publish paired releases. The dashboard requests a lightweight subject catalog containing quiz membership IDs and counts, then requests a subject's quiz details only when selected. Ordered question IDs and question text are delivered only with a selected subject and quiz. `src/content/api/runtimeQuestionBank.ts` validates that membership is present before exposing the catalog, exposes catalog loading/retry/error states, deduplicates requests, and keeps a revision-scoped in-memory cache observable by React. A shared client applies a 15-second deadline to every request attempt, retries only transient network, timeout, and selected HTTP failures, and uses bounded exponential backoff with jitter. The subject catalog and each subject quiz catalog expose their pending retry deadline and can advance only their own backoff wait without creating another request chain, allowing their banners to present a truthful countdown and Retry now action. Subject recovery is tracked per subject and remains visible across retry waits and active attempts until that catalog succeeds. Retry-After minimums disable Retry now until the server's requested delay elapses. Retry counts and delays are configured at Vite build time through `VITE_CONTENT_MAX_RETRIES`, `VITE_CONTENT_RETRY_BASE_DELAY_MS`, and `VITE_CONTENT_RETRY_MAX_DELAY_MS`. Question-launch loading belongs to `useQuizLaunch`; the runtime bank keeps only its in-flight requests/controllers and cached content for questions. Abandoned question launches cancel their request or backoff wait. Learner messages map internal errors to safe copy; diagnostic categories and HTTP status codes are logged for developers only. The PostgreSQL adapter pins published content and its revisions per request. The learner has no local bank source or bundled QA viewer. Attempts, scoring, timers, progress, and history remain in `LocalAttemptRepository`, `src/domain/quizEngine.ts`, and browser localStorage. The HTTP editor writes the authoritative database; JSON exports do not update it.

Flashcards extend the public learner service using the same paired database publication and shared subjects. A separate flashcard revision covers the flashcard bank and subject records, without changing the quiz revision. The learner loads flashcard subject counts and empty-deck membership on entry, a selected subject's deck summaries on demand, and ordered card bodies only when a deck starts. `RuntimeFlashcardBank` checks revisions, ownership, counts, and ordered card IDs, deduplicates resource requests, and cancels abandoned loads. The session guards every asynchronous launch with a token, so later navigation or deck selection prevents stale loads from saving progress or reopening study. Current card-request failures are reported to App for a persistent screen-scoped toast; retrying uses the original deck action. The subject catalog uses the shared warm wave skeleton and selected deck loads use the shell progress bar. There is no learner-local catalog adapter; all catalog and body loads use the API. Flashcard checkpoints remain separate from quiz attempts.

`src/content/api/launchFreshness.ts` owns request-driven launch evidence. Runtime
banks fetch the applicable `/subjects` catalog before body cache fast paths,
validate revisions and selected membership, and return an admission closure aged
from monotonic request start. Evidence at least 30 seconds old fails; there are no
automatic recheck loops. Concurrent pending checks for the same item coalesce;
cancellation/reconfiguration invalidates both pending responses and admission
closures. Validation never replaces cached subjects, catalogs or bodies. Feature
launch coordinators check admission after body loading (and asynchronous deck
signature computation), before navigation or progress writes. App routes saved
quiz restart confirmation through the same coordinator; deck restart revalidates
in its session controller. Answer/render/checkpoint/results-review paths retain
their arrays without a freshness request. Both bank hashes remain distinct from
publication sequence: an unchanged bank stays usable when only its paired bank
changes. All learner launches use HTTP freshness checks, including cached launches. See [the product contract](product.md#content-freshness-at-launch).

`src/content/api/apiDecoders.ts` checks API catalog membership and order, question ownership, choice and answer references, and nested metadata before runtime content enters the cache. It hydrates only the domain's missing `metadata` field after validation. Python stored models validate typed nested metadata, and the API constructs response models explicitly while preserving omitted optional fields. Deterministic database artifacts retain the established revision serialization; shared fixtures in `tests/fixtures` check contract parity. The backend's `QuestionBankRepository` protocol covers route reads through the PostgreSQL source. HTTP unit tests may inject test-owned synthetic protocol doubles; no file-backed repository is shipped. Conditional responses check revision and ETag before building a response body.

`contentTransport.ts` owns timeout, cancellation, retry classification, backoff, and safe request diagnostics. `RuntimeQuestionBank` receives that transport through its constructor and keeps resource state and request deduplication; `runtimeContentCache.ts` stores indexed subjects, quizzes, and ordered questions. API decoders remain the unknown-data boundary. Reconfiguration advances a generation counter so responses from an older revision or source cannot populate the current cache.

## Local authoring

`/admin.html` loads only the authenticated HTTP editor in development and
production. `useAdminEditor` owns quiz text, record/bulk commands, snapshot
loading, stale-preview guards and busy/error handling. `AdminWorkspace` composes
the two panels and shared controls. Normal content writes use
`HttpQuestionBankGateway` and the paired PostgreSQL draft. Saving does not publish;
publication/activation and database-derived exports remain explicit shared actions.
`QuizRepository` remains learner-facing and read-only.

Search, pagination, deletion impact calculation and pure operation application
stay in `src/admin/core`; selection and responsive layout stay in presentation.
Both deletion dialogs capture a review key and reject changed content. Selected
leaf deletions save a complete validated batch; shared-subject deletion reviews
both banks and asks before discarding hidden unsaved text. PostgreSQL owns paired
history, undo and reset. Panels retain only unsaved text and the server's current
snapshot; file import/replay, replacement exports and per-section local histories
are removed. The in-memory operation double lives solely under `src/test` and is
forbidden by production dependency checks and the admin artifact audit.

## Entry points and deployment modes

`src/main.tsx` bootstraps the learner through `index.html`. API delivery is the only learner path; the Vite development/preview proxy routes `/api` to the configured content service. Production hosting must route the same prefix to FastAPI. `VITE_CONTENT_SOURCE` is retired and rejected at build/startup. The frontend retains local progress storage and the same domain contracts. Follow [frontend setup](../README.md) and [backend setup](../backend/README.md) for exact commands and environment variables.

`admin.html` is a separate optional HTTP editor entry; normal learner production builds omit it. Development and production both use HTTP authoring. The local JSON editor entry and its source flags are retired; explicit old source settings are rejected. Browser authoring tests seed synthetic fixtures into disposable PostgreSQL. Production builds exclude bundled banks. The optional `admin` Docker target serves the combined learner/admin bundle with `/admin.html` marked `no-store`; default `learner` remains the final target and rejects that path. Neither static assets nor build flags grant API access. The runtime currently refuses production identity adapters; keep public admin disabled pending real adapter/MFA acceptance. The former `/#content-qa` bundled-bank viewer is removed; API/browser content-candidate tests cover rich-content inspection.

The Python API reads one request-pinned published PostgreSQL pair and supplies authenticated paired drafts, controlled writes and immutable publication. Packaged schema head is `0006_allocation_fence`; worker startup validates schema/content but never migrates, imports or bootstraps. Settings and application startup accept only PostgreSQL. Missing reader configuration fails before serving requests; CLI operator settings do not need an API reader URL. Compose and container smoke callers use explicit PostgreSQL configuration; smoke inputs seed disposable databases. No runtime generative AI or learner backend progress is added.

[Container packaging](local-containers.md) uses pinned API wheels and non-root Nginx runtimes. The API image no longer includes archived banks or bank-path environment defaults. Both Docker build contexts exclude the historical corpus. Learner/admin module audits inspect hidden maps/manifests before removing them, with file hashes retained outside the public document root. Default Compose remains an independent PostgreSQL preview; it does not configure or replace the designated authority. Native acceptance checks both architectures and disposable recovery. The [deployment handoff](L6-deployment-handoff.md) owns ordered artifact, role, schema/transfer, routing, identity and recovery gates. Container recovery does not back up browser progress or certify hosted behavior.

## Accepted local-preparation contracts and L1 runtime status

[Completed L0](work/done/L0-local-contracts-plan.md) records development decisions for [ongoing local-first preparation](work/ongoing/local-first-production-preparation.md). L1 now implements a local paired progress backup utility; this does not add a database, authentication, backend persistence or cloud upload. The L1 tracker and application acceptance checklist carry current verification status and remaining release gates.

- [Progress backups](decisions/0002-progress-backup-and-restore.md): L1 runtime implements a paired v1 quiz/flashcard file, bounded validation, shared Web Locks admission, exclusive paired export/restore/recovery, and journaled replacement. Persistence owns browser storage/locks/codecs/recovery; app owns cross-feature boot/utility/reset composition; existing feature sessions retain ordinary writes under admission. Shared presentation receives data/actions only. The app-owned progressBackupFiles module shares file reading and bounded-lifetime Blob downloads between boot and dialog paths; persistence preflights escaped raw JSON size before standard serialization. Gated storage events retain cached snapshots until re-admission; coordinated read-only admission can refresh both snapshots without admitting writes. A sessionStorage-only notice carries verified restore success across reload and is excluded from backup data. Shared participation preserves synchronous writes but does not serialize ordinary simultaneous writes; exclusive operations cover cooperating tabs, with legacy-tab limitations and unsupported-browser safe-browsing/write gating. No backend or current-bank availability is required for restoration. Active quiz signatures embed content and are preserved with a sharing warning, not silently changed to hashes. Chromium/WebKit application acceptance and production interruption/quota checks are recorded in L1; Firefox acceptance is explicitly user-deferred after its host profile-launch failure; L1 is complete with that verification gap recorded. Real mobile and assistive-technology checks remain launch gates. The [recovery runbook](progress-backup.md) diagnoses copies without discarding original browser bytes.
- [Local database/toolchain](decisions/0003-local-postgres-toolchain.md): L2/L3 own containers, Postgres adapters/migrations, deterministic import/export parity and matching backup tooling. DB-mode initialization checks schema/content; recurring liveness/readiness does not query Postgres. The designated PostgreSQL authority cutover is complete; repository JSON databases and read fallbacks are retired; deterministic exports remain inspection/recovery artifacts. Learner progress stays browser-local. Do not add provider-specific dependencies to frontend/domain/content contracts.
- [Paired releases and schema](decisions/0005-paired-content-releases-and-postgres-schema.md): L3 schema and transaction primitives implemented; paired file importer/exporter implemented; paired learner adapters implemented; actual-bank/recovery/PG browser parity and native CI verified. Version-scoped relational rows preserve global array ordinals; immutable TEXT artifacts preserve existing revision serialization. One request pins one complete release for both adapters. Publication sequence is separate from content hashes; durable ID reservations survive draft deletion and content rollback. One validated paired-document draft remains private. Backend DB modules own storage/transactions, repository adapters own reads, and explicit operator jobs own migration/import/activation. L4 authenticated authoring and local authority cutover are implemented; hosted identity and off-device retention retain separate gates.
- [Single-editor authentication](decisions/0004-single-editor-authentication.md): L4 owns backend OIDC/provider assurance, opaque private sessions and authorization on every private operation; admin data owns the HTTP gateway. Public published learner content remains independent of admin identity. Final provider acceptance is pending and must be resolved before production adapter integration. Neither an admin build flag nor hidden navigation is authorization.

L3 Step 2 implements `backend/src/meducation_api/db` for secret URL validation,
bounded synchronous engines, one-time initialization checks and explicit local
bootstrap/migration commands. Alembic resources ship under
`backend/src/meducation_api/migrations` in the installed wheel. The API receives
the reader connection and, when enabled, separate session/editor connections; local bootstrap and direct unpooled migration jobs
use separate configured credentials. The designated authority uses PostgreSQL; generic JSON defaults are fixture/archive mode.
Step 3 packages migration `0001_content` and its SQL resources as the schema
source of truth. `db/operations.py` uses bound SQLAlchemy calls to narrowly granted
fixed-search-path write functions; it does not duplicate the schema in an ORM
model. SQL owns relational constraints, finalized-row/history protection and
operation replay; readers see only selected finalized views. Durable reservation
transactions commit independently of later draft/release writes. The singleton
paired draft is private. Owner/migrator maintenance remains a trusted boundary.
Step 4 adds `db/transfer.py` for captured paired-file validation/import and
independent normalized-row reconstruction/export, composed by the explicit CLI.
The TypeScript repository gate runs on captured private copies; the learner
runtime gains no Node dependency or write route. Export verifies exact artifacts
and hashes, uses a read-only repeatable snapshot for manifest context and refuses
existing output directories.
`repositories/source.py` defines the paired source/view protocol;
`repositories/postgres.py` implements its PostgreSQL reader adapters. `main.py` injects
one response-scoped view and obtains subjects/catalogs/bodies from that view,
replacing the process-lifetime subject snapshot. Production startup creates only PostgreSQL sources. Tests inject explicit
test-owned protocol doubles through dependency overrides; no file-source startup
factory or environment-selectable test backend remains.
Postgres selects the active pointer once per content request and filters every
query by its pinned finalized release. Immutable subject/quiz/deck/membership
catalogs are cached by release, retaining the two latest observed publications;
bodies are queried from normalized rows. Model copies protect cached catalogs
from callers. Publication sequence is captured anew even when a digest repeats.
Eviction leaves in-flight views usable. One shared bounded engine supplies both
adapters, and function-scoped dependency cleanup closes connections after full
synchronous response construction and before delivery. DB failures return a
sanitized `content_unavailable` 503 with no old-file/catalog fallback.
Postgres learner mode now works after explicit migration/import/activation; it
never performs these jobs from workers or falls back to JSON.
Recurring health endpoints remain free of database queries. Real PG17 fixture
checks prove schema/operation and fixture repository/API parity.
Step 6 supplies explicit disposable actual-bank/API parity, backup-role
restore and PG proxy/browser acceptance. `db/parity.py` is a development operator
check; `db/recovery.py` reapplies supported owner-managed grants after portable
restore. Neither runs from workers. Both native CI jobs passed for the verified source commit. Local operator actor descriptions are not browser authentication. See the [L4 handoff](L4-authoring-handoff.md) before enabling private editing or changing authority.

Preserve existing checked boundaries when adding these modules. The [L1 plan](work/done/L1-progress-backup-plan.md) and [browser acceptance](work/ongoing/L0-browser-acceptance.md) record completed implementation and outstanding acceptance gates. Do not expose unfinished Restore/admin-write actions, move content authority, provision services or deploy as a side effect of contract documentation.

## Authoring content-policy boundary

The [L4 paired validator](L4-content-policy.md) keeps shared Markdown/HTML/math
rules under `src/content/validation` and `richText`. Build tooling packages a
self-contained Node worker and shared limits into `backend/src/meducation_api/content_policy`.
Python owns byte admission, strict stored validation and bounded worker execution;
its draft-save wrapper validates before SQL. Internal `backend/src/meducation_api/admin`
owns captured paired preview/save/publish, calling the validator and bound DB
operations. Migration `0002_authored_publish` adds atomic authored releases and
reviewed saves, retaining importer deduplication and separate provenance. No frontend
presentation dependencies enter this boundary. Internal service actors are trusted operator context; the local Step 3 session
boundary supplies verified principals to Step 4 private HTTP services.
Step 5 connects the browser editor to those services. No content
authority has changed.

## Private admin session boundary

`backend/src/meducation_api/auth` owns fixed OIDC configuration, maintained-library
code/PKCE and signed-ID-token validation, encrypted login transactions, Postgres
sessions and prefix-wide HTTP authorization. Private admin modules consume a
verified principal supplied by this boundary. Migration `0003_admin_sessions` and
explicit bootstrap own separate session/editor roles and auth schema; workers
never migrate. Request guards hold session identity locks; editor SQL mutations
independently lock/check sessions through commit to serialize logout/revocation.
Public learner routes retain their separate reader and ignore admin cookies.
The [session runbook](L4-admin-session-boundary.md) records limits and recovery
epoch handling. Only synthetic loopback identity is available; production adapter
acceptance remains a later gate.

`backend/src/meducation_api/admin/contracts.py`, `service.py` and `http.py` own
private wire parsing, verified-principal orchestration and bounded HTTP/export
delivery. Migration `0004_editor_operations` owns guarded paired mutations,
creation-intent bindings and immutable history with a bounded Undo stack.
[Paired-service contracts](L4-paired-editor-services.md) document exact replay,
freshness, stale-base handling and request-driven publication visibility.

`src/admin/AdminApp.tsx` lazily selects the HTTP editor or its authentication
completion surface; editor builds exclude canonical banks. `PairedHttpClient` owns
session/CSRF, one-attempt writes, explicit uncertain-operation reconciliation, and
synchronous shared command admission for header and editor operations.
`HttpQuestionBankGateway` adapts pure edit helpers to paired server snapshots,
reservations and validation; it owns no local durable history. It exposes a captured
prepared-save review with explicit confirm/cancel methods instead of opening browser
dialogs. Review identity, context, reason and fingerprint remain enforced in data;
MUI save/publication/history dialogs and readable impact presentation live in admin
components. Authentication may proceed during a write without replaying it. `AdminWorkspace`
and the existing panels retain browsing/text while shared server Undo/reset and
publication controls operate on one paired context. Reserved parents in migration
`0005_reserved_parents` permit atomic grouped creates with owned same-context IDs.
The [HTTP editor runbook](L4-http-editor.md) records source selection, session
completion, import conversion and verification limits. Learner/domain/persistence
modules receive no authentication dependencies.

L4 recovery preparation adds owner-only allocation range jobs in
`db/allocation_fence.py` and migration `0006_allocation_fence`. The opt-in database
trigger bounds new allocated IDs; only explicit migrator jobs can advance the fence
with two durably recorded agreeing journal chains. Restored session quarantine
pauses protected allocation until explicit counter reconciliation. Existing JSON
authority and fixture allocation mode remain unchanged. This does not add runtime
AI or learner/auth dependencies to frontend domain modules. See the
[recovery runbook](L4-authoritative-recovery.md) for retention and cutover gates.

## Operational diagnostics and logging

`backend/src/meducation_api/admin/diagnostics.py` owns explicit protected dependency
inspection. Existing auth guards supply the session connection; reader/editor
checks reuse existing pools with read-only transactions. This adds no schema,
grant, worker or background query. `operations.py` owns allowlisted request
correlation, dependency categories/recovery observations and access/error log
filters. Database boundaries record safe categories before replacing exceptions;
no raw request/exception content enters events. Middleware keeps per-request
observations across threadpool calls without exposing them in domain/content DTOs.
[Local operations](L5-local-operations.md) defines the limits, proxy log policy,
configuration audit and remaining provider gates.


Admin workspace framing stays under `src/admin/components`: parent action menus, editor/empty/action slots and batch progress receive presentation data and callbacks. `SubjectEditorDialog` composes `useAdminEditor` against the same cached gateway as the two section editors; it does not fetch or persist a separate bank. All subject commands use the existing shared HTTP admission and prepared review lifecycle. Subject-dialog dirty state participates in both sections' publication eligibility. No learner presentation or persistence dependency was added.

`src/admin/core/recordDraft.ts` owns pure, field-level patches over a single JSON draft. It preserves untouched authored values and optional presence, with no persistence or UI dependency. `AdminRecordEditor` composes all five forms and advanced JSON; `AdminRecordPreview` uses shared `MarkdownContent` with the learner's rich/restricted modes. Unrepresentable form shapes stay editable as JSON. Controllers own committed baselines and retain newer text; reserved-ID adoption only replaces a captured provisional ID after a successful create receipt.
