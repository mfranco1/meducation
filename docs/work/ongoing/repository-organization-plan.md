# Repository organization plan

Created: 2026-10-06. Status: Stage 3 complete; waiting for the user's signal to begin Stage 4.

## Goal and recommendation

Make ownership, dependency direction, and contributor workflows predictable without changing product behavior. Keep one frontend package and the existing Python package. Organize learner UI by feature, retain the pure domain and persistence boundaries, and establish a small shared UI layer for components with demonstrated reuse.

There is no universal industry-standard React folder tree. The proposed layout is a project-specific application of current official guidance on component responsibilities, build entry points, Python packaging, import restrictions, and documentation. Folder changes alone will not ensure maintainability; dependency rules and verification are part of the work.

This document is the implementation tracker. Keep it in `docs/work/ongoing` until all stages are implemented and verified, then move it to `docs/work/done`. Each stage should be one reviewable change or several small PRs, with its results recorded here. Implementation was authorized on 2026-10-06 with the instruction to stop between stages and wait for the user's signal to continue.

## Findings from the current repository

- `src/app/` mixes composition, session hooks, selectors, screens, and feature components. Quiz and flashcard work spans several sibling directories, making ownership hard to follow.
- The existing separation into `domain`, `content`, `persistence`, `analytics`, and admin `core`/`data` is useful. Previous completed refactors established these boundaries; retain them rather than repeat that work.
- Admin imports `AppShell` and `ScreenLoading` from learner `app/components`. Flashcard study imports `QuestionNavigationLayout` from `components/quiz`. These are concrete candidates for shared ownership.
- `src/content/` contains authoritative JSON, storage schemas, local adapters, API decoders, remote caches, transport/retry behavior, rich-text policies, and a migration. These responsibilities deserve named subdirectories.
- Root `content/`, `tn-pdfs/`, and `public/content/` are ignored local material, while `src/content/` is tracked runtime/canonical content. Similar names obscure very different lifecycle and backup requirements.
- Five files under `backend/src/meducation_api.egg-info/` are tracked packaging output. The backend already uses the Python `src` layout; it does not need a new package architecture.
- Root README setup and layout descriptions lag behind the implementation: API content delivery is the default, a separate flashcard bank exists, and the admin is an optional entry. `backend/README.md` also repeats its Windows setup paragraph.
- Architecture/testing documentation contains long feature-by-feature additions. Completed work trackers already provide history; current operating guidance should be easier to find.
- Unit/component tests are colocated; `tests/fixtures/` supplies shared contracts; `e2e/` covers browser flows. This is purposeful separation, not duplication to eliminate.
- CI already runs lint, scoped formatting, frontend tests, content validation, both build modes, Python checks, and learner/admin browser suites. Extend this baseline rather than replace it.

## Constraints

Keep `src/content/questionBank.generated.json` and `src/content/flashcardBank.generated.json` at their current paths, byte-for-byte unchanged. The historical `.generated` suffix does not make these disposable build artifacts. Preserve IDs, record/choice ordering, source-versus-verified answers, rich content, and provenance.

Preserve browser storage keys, migrations, signatures, API routes/revisions, admin export filenames and replay behavior, local/API mode selection, lazy-loading boundaries, and production admin exclusion. This task introduces no backend infrastructure, persistence changes, runtime AI, dependency upgrades, or visual redesign.

## Proposed destination

Only create directories when files move into them. The tree illustrates ownership, not a requirement for every feature to have identical subfolders.

```text
meducation/
  index.html, admin.html          # Vite entry points remain at root
  package.json, package-lock.json # One frontend dependency graph
  vite.config.ts, tsconfig*.json  # Keep tool-discovered configs at root
  eslint.config.mjs, playwright*.config.ts
  src/
    main.tsx                     # Learner bootstrap
    app/                         # Composition, navigation, lazy screens, app tests
      App.tsx
      navigation.ts
      lazyScreens.tsx
      components/                # Learner-specific drawer/navigation
    features/
      quizzes/                   # Dashboard, subject, active/browse/review/results
        screens/
        components/
        session/
        selectors/
      flashcards/                # Dashboard, subject, study, session, selectors
        screens/
        components/
        session/
    shared/
      ui/                        # Shell, loading, notifications, rendering, study UI
      theme.ts
    domain/                      # Pure rules, types and repository interfaces
    content/
      questionBank.generated.json
      flashcardBank.generated.json
      schema/                    # Stored-bank contracts
      validation/                # Bank and rich-content validation
      local/                     # Read-only canonical JSON adapters
      api/                       # Decoders, transport, retry, runtime repositories
      richText/                  # Shared rendering/sanitization/math policies
    persistence/                 # Existing storage repositories and codecs
    analytics/                   # Existing pure aggregation
    admin/                       # Separate authoring entry; keep core/data boundaries
      components/
      core/
      data/
    qa/                          # Existing development-only content QA
    test/                        # Vitest setup; reusable test helpers only as needed
  backend/
    pyproject.toml, requirements*.lock, README.md
    src/meducation_api/
    tests/
  scripts/
    content/                     # Validation and audit commands
    migrations/                  # Candidate-producing, versioned migrations
  tests/fixtures/                # Contracts shared across runtimes
  e2e/                          # Browser workflows and their own fixture banks
  docs/
    README.md                    # Navigation by contributor task
    architecture.md, product.md, design-system.md
    content-management.md, question-schema.md, flashcard-schema.md, testing.md
    decisions/                   # Small records of consequential architecture choices
    work/ongoing/, work/done/     # Implementation trackers and history
```

Keep `src/admin/` as its existing independent authoring boundary; do not force it into the learner feature tree. Keep the small domain, persistence, and analytics directories flat until a demonstrated navigation problem warrants subdivision. Avoid root `utils/`, broad barrel exports, or an `apps/`/`packages/` workspace migration at this scale.

## Stage 0 — Establish the safety baseline

- [x] Inventory tracked files separately from ignored local data and generated output. Record current dependencies and every path-sensitive consumer before moving files.
- [x] Record SHA-256 hashes of both canonical banks and capture current test/build results, including existing warnings or failures.
- [x] Reuse existing contract, storage, and admin replay fixtures; identify any missing behavior coverage. Do not add tests that merely assert filenames or mirror imports.
- [x] Record baseline learner/admin bundle composition and representative desktop/mobile flows, especially lazy quiz/flashcard launch and rich content.
- [x] Add a short decision record for the target boundaries and a concrete move manifest for Stage 2.

Exit gate: baseline outcomes and protected contracts are recorded; unexplained failures are resolved in separate fixes before structural migration. Risk: low. Dependency: none.

Completed 2026-10-06. See [baseline results and move manifest](repository-organization-baseline.md), [machine-readable snapshot](repository-organization-baseline.json), and [ownership decision](../../decisions/0001-repository-ownership-and-boundaries.md). All existing check suites passed, including 363 frontend tests, 39 backend tests, 11 learner browser tests, 2 admin browser tests, content validation, and both build modes. Local/API entry behavior and desktop/mobile captures are recorded. All 301 initially tracked files retain their baseline hashes. Stage 1 has not started.

## Stage 1 — Fix repository hygiene and contributor guidance

- [x] Correct README setup for default API mode, explicit local mode, optional admin, and flashcards. Link to backend setup instead of copying it. Remove the duplicated Windows paragraph in the backend README.
- [x] Add `docs/README.md` with links for setup, architecture, content editing, UI work, testing, and active work. Keep existing AGENTS-linked document paths stable.
- [x] Make `DESIGN.md` a concise entry point to `docs/design-system.md` after checking for unique requirements and preserving them in the authoritative document.
- [x] Ignore Python `*.egg-info/` output and remove only the confirmed generated metadata files from Git tracking; retain package source, locks, and installed environment. Confirm clean installation regenerates the metadata.
- [x] Document the purpose and backup expectations of ignored `content/`, `tn-pdfs/`, and `public/content/`. First inventory their consumers and any irreplaceable material. Do not delete or relocate them as routine cleanup.
- [x] Check ignore rules with representative tracked content paths; retain exceptions for canonical content and content-rendering source until paths/rules are deliberately updated.

Exit gate: a contributor can follow documented setup; tracked packaging output is gone; canonical content remains tracked and unchanged. Risk: low. Dependency: Stage 0.

Completed 2026-10-06. README now documents default API delivery, explicit local-content mode, quiz/flashcard banks, and the two flags required to preview an enabled production admin build. The new docs index links contributor tasks to existing guidance. DESIGN now points to the authoritative design system; its general readability, semantic-list, focus, and source-preservation guidance was retained there, while existing product/architecture/content/testing pages already cover the remaining requirements. The stale backend-free architecture description was removed from this entry point.

Added `*.egg-info/` to `.gitignore` and untracked exactly five packaging metadata files with `git rm --cached`; their local copies and the existing environment remain intact. A copy of package source without any metadata successfully built a wheel, regenerated source egg-info, and installed into an isolated temporary virtual environment. Installed distribution metadata, version, and package import path were verified. This confirms packaging regeneration; the normal service setup remains the documented editable install from the repository so canonical paths resolve correctly.

The content-management guide now explains private PDFs, historical extraction/review data, reproducible audit output, and legacy public assets. Their inventoried files were retained. Runtime source, schemas, fixtures, both canonical banks, and dependency locks retain their Stage 0 hashes. The existing content ignore exceptions remain in place; canonical banks and the Markdown renderer are tracked and unignored, while package metadata is untracked and ignored.

Verification: 38 local documentation links resolved; frontend lint/formatting passed; 61 frontend test files / 363 tests passed; 39 backend tests, Ruff, and mypy passed; content validation passed with the same 32 answer-review warnings; learner and enabled optional-admin builds passed, including TypeScript checking. The default build omits `admin.html`; the explicit build includes it. Whitespace checks passed for staged and unstaged changes. Existing chunk-size, Starlette TestClient, and Vitest performance advisories remain. No new source/UI behavior changes required another browser-suite run; Stage 0's 13 passing browser flows remain the behavioral baseline. Raw verification/clean-install evidence is under `/private/tmp/meducation-organization-stage-1/`. Stage 2 has not started.

## Stage 2 — Establish shared UI ownership

- [x] Move `theme.ts` to `src/shared/theme.ts`; update learner/admin entry imports and the explicit formatter scope.
- [x] Move genuinely shared `AppShell`, `AppHeader`, loading/failure presentation, rich-content renderer, and reusable notification UI into focused `shared/ui` subdirectories, with colocated tests.
- [x] Move shared study framing such as `StudyHeader`, `StudyNavigatorTile`, and `QuestionNavigationLayout` together where their actual consumers justify it. Keep quiz-only choice, feedback, and question-control components owned by quizzes.
- [x] Keep learner drawer/navigation policy in `app`; place pure reusable drawer presentation in shared UI only when reuse warrants it. Keep domain-specific notification-message mapping outside generic toast presentation.
- [x] Update admin and QA imports so they no longer obtain generic UI through learner composition. Check static and dynamic imports, test mocks, stylesheet references, and documentation.

Exit gate: shared UI imports no app or feature modules; learner, admin, and QA retain their presentation and loading behavior. Risk: medium, because bootstrap imports affect initial bundles. Dependency: Stage 1.

Completed 2026-10-07. Moved the exact 24 files from the Stage 0 manifest (including colocated tests) into `src/shared/theme.ts` and `src/shared/ui/{shell,loading,transitions,notifications,content,study}`. Updated 39 consuming source/test modules and 67 import specifiers. The shared scroll hook moved with study framing; the loading boundary's transition-duration dependency moved to shared transitions. Safe content-error messages live with loading presentation, while generic notifications remain independent of content-error mapping. Learner drawer policy/helpers and feature-specific controls stay in their existing locations for Stage 3.

Updated the formatter's theme path, Markdown-renderer ignore exceptions, README layout, architecture, and testing guidance. Admin and QA now import shared presentation directly. No forwarders, barrels, component APIs, UI markup/styles, or behavior were introduced or changed. An import-aware comparison confirms that source changes are exactly the planned moves and import replacements; all 812 source import/export/dynamic-import edges preserve the original module graph after path mapping. Shared modules (including their tests) have no app, feature, or admin imports. Moved source is unignored, and both canonical banks plus the dependency lock retain their baseline hashes.

Verification: lint and scoped formatting passed; 61 frontend test files / 363 tests passed; content validation passed with the same 32 answer-review warnings; learner and optional-admin builds passed, including TypeScript checking; all 11 learner and 2 admin Chromium tests passed. Explicit canonical local mode still launches a quiz with zero API requests/page errors. The development QA entry renders the existing math fixture correctly. Desktop/mobile learner/admin captures were inspected; seven of eight additional PNG captures match Stage 0 byte-for-byte, while the mobile flashcard-admin capture differs in transient button shading with unchanged content/layout.

Both build modes retain identical asset filenames, chunk sets, and raw/gzip sizes to Stage 0: 15 learner JS/CSS assets totaling 1,270,975 raw bytes and 18 optional-admin assets totaling 15,535,827 raw bytes. Default production output still omits `admin.html`; the opt-in build includes it. Lazy quiz, browse, review, results, and flashcard-study boundaries, local KaTeX assets, and API startup content behavior remain intact. First-quiz samples were 405 ms locally and 2,069 ms under the existing throttled fixture; these are characterization samples, not performance guarantees. Existing large-chunk and test-tool advisories remain.

Raw move, graph, bundle, browser, and capture evidence is under `/private/tmp/meducation-organization-stage-2/`. Backend code and contracts were unchanged, so Stage 0/1's backend checks remain the baseline. Stage 3 has not started.

## Stage 3 — Group learner code by feature

- [x] Move quiz screens, quiz/feedback/results components, `useQuizSession`, `useQuizLaunch`, and quiz-specific selectors under `features/quizzes`, moving tests with each module. Keep composition and navigation in `app`.
- [x] Move flashcard screens, `FlashcardStudyCard`, `FlashcardNavigator`, `useFlashcardSession`, and flashcard selectors under `features/flashcards`.
- [x] Classify `dashboard.ts`, `progress.ts`, `quizProgress.ts`, `flashcards.ts`, `format.ts`, dashboard layouts/cards, and celebration modules by actual imports. Put feature-specific code with its feature; share only the code both features actually use.
- [x] Resolve feature-to-app type dependencies before enforcing direction. Keep navigation wiring in app; pass callbacks or define narrow feature-owned destination contracts rather than importing `app/navigation` into features.
- [x] Keep `lazyScreens.tsx` in composition and preserve its dynamic imports/preload behavior. Avoid a feature-wide barrel that eagerly imports screens or canonical banks.
- [x] Complete quiz and flashcard moves as separate reviewable changes, preserving DOM, state ownership, behavior, and exported semantics.

Exit gate: app composes features; features do not import app or one another; existing navigation, saved attempts/checkpoints, and feature tests pass. Risk: medium. Dependency: Stage 2.

Completed 2026-10-07. Moved 65 files with 149 import replacements: quiz screens, controls, feedback, results, celebrations, statistics, formatting, session hooks, and selectors now belong to `src/features/quizzes`; flashcard screens, study controls, session hooks, and selectors belong to `src/features/flashcards`. Tests moved with their modules. Five catalog layouts reused by both features live under `src/shared/ui/catalog`. App retains composition, screen identity, lazy/preload wiring, and learner drawer policy.

Each feature owns its unchanged session view contract in `session/navigation.ts`. The quiz-to-subject lookup and its two existing tests moved to quizzes; screen identity and its tests stay in app. This intentional test split increases test files from 61 to 62 while preserving all 363 tests. No component APIs, UI markup/styles, storage operations, IDs, content, dependency versions, or screen loading behavior changed. Quiz and flashcard move groups are listed separately below for review; no commits or PRs were created.

Verification: lint and scoped formatting passed; all 62 frontend test files / 363 tests passed; content validation passed with the existing 32 answer-review warnings; learner and enabled optional-admin builds passed, including TypeScript checking; all 11 learner and 2 admin Chromium flows passed. Saved quiz attempts, flashcard checkpoints, keyboard controls, mobile navigation, Browse Answers, Exam review, and recovery flows remain covered. Initial concurrent verification hit two unit-test timeouts and one admin overall timeout; isolated reruns passed without changing tests, timeouts, or application code.

Import-aware verification confirms all moved code is unchanged apart from import specifiers; navigation contracts, lookup, screen identity, and test bodies were extracted verbatim. The other 806 source import/export/dynamic-import edges retain the mapped module graph. Shared modules import no app, features, or admin; features import no app, admin, or sibling features. Both canonical banks and the dependency lock retain their baseline hashes; moved files are unignored and old paths are absent. README, current architecture, and testing guidance now describe the actual owners; historical trackers and the Stage 0 snapshot retain their historical paths.

Both production modes preserve their chunk sets and exact raw asset sizes: 15 learner assets totaling 1,270,975 bytes; 18 optional-admin assets totaling 15,535,827 bytes. Hash filenames changed after relocation, with total gzip differences of +24 / +21 bytes respectively. Default output still excludes admin; the opt-in output includes it. All five lazy screen imports/preload functions remain in app composition, and no eager canonical-bank or authoring imports were introduced.

Canonical local mode still shows 13 subjects and launches a quiz with zero API requests or page errors. The isolated QA fixture renders math and reports no structural errors. Desktop/mobile quiz, flashcard, and admin captures were inspected. After waiting for fonts and rendering to settle, six of eight additional canonical/QA PNG captures match Stage 2 byte-for-byte; the two flashcard-admin captures differ in button hover/transition shading with unchanged layout and content. Temporary verification servers were stopped. Existing large-chunk and test-tool advisories remain. Backend code/contracts were unchanged; Stage 0/1 backend checks remain the baseline.

Raw move manifests, original modules, navigation/graph verification, builds, tests, browser traces, and captures are under `/private/tmp/meducation-organization-stage-3/`. Stage 4 has not started.

### Stage 3 quizzes move manifest

- `src/app/components/ActiveSubjectCarousel.test.tsx` → `src/features/quizzes/components/ActiveSubjectCarousel.test.tsx`
- `src/app/components/ActiveSubjectCarousel.tsx` → `src/features/quizzes/components/ActiveSubjectCarousel.tsx`
- `src/app/components/QuizSubjectCard.tsx` → `src/features/quizzes/components/QuizSubjectCard.tsx`
- `src/app/components/ScoreTrendIndicator.tsx` → `src/features/quizzes/components/ScoreTrendIndicator.tsx`
- `src/app/components/StatCard.tsx` → `src/features/quizzes/components/StatCard.tsx`
- `src/app/components/celebration/CelebrationOverlay.tsx` → `src/features/quizzes/components/celebration/CelebrationOverlay.tsx`
- `src/app/components/celebration/RadiatingCircles.tsx` → `src/features/quizzes/components/celebration/RadiatingCircles.tsx`
- `src/app/components/celebration/celebrationCatalog.ts` → `src/features/quizzes/components/celebration/celebrationCatalog.ts`
- `src/app/components/celebration/celebrationPresentation.test.tsx` → `src/features/quizzes/components/celebration/celebrationPresentation.test.tsx`
- `src/app/components/celebration/correctAnswerBurst.test.ts` → `src/features/quizzes/components/celebration/correctAnswerBurst.test.ts`
- `src/app/components/celebration/correctAnswerBurst.ts` → `src/features/quizzes/components/celebration/correctAnswerBurst.ts`
- `src/app/components/feedback/ChoiceExplanations.tsx` → `src/features/quizzes/components/feedback/ChoiceExplanations.tsx`
- `src/app/components/feedback/ExplanationContent.tsx` → `src/features/quizzes/components/feedback/ExplanationContent.tsx`
- `src/app/components/feedback/FeedbackPanel.tsx` → `src/features/quizzes/components/feedback/FeedbackPanel.tsx`
- `src/app/components/quiz/ExitQuizDialog.tsx` → `src/features/quizzes/components/quiz/ExitQuizDialog.tsx`
- `src/app/components/quiz/LeaveReviewDialog.tsx` → `src/features/quizzes/components/quiz/LeaveReviewDialog.tsx`
- `src/app/components/quiz/QuestionNavigator.test.ts` → `src/features/quizzes/components/quiz/QuestionNavigator.test.ts`
- `src/app/components/quiz/QuestionNavigator.tsx` → `src/features/quizzes/components/quiz/QuestionNavigator.tsx`
- `src/app/components/quiz/QuizSetupDialog.tsx` → `src/features/quizzes/components/quiz/QuizSetupDialog.tsx`
- `src/app/components/quiz/ReadOnlyChoiceList.tsx` → `src/features/quizzes/components/quiz/ReadOnlyChoiceList.tsx`
- `src/app/components/quiz/ReadOnlyQuizChrome.tsx` → `src/features/quizzes/components/quiz/ReadOnlyQuizChrome.tsx`
- `src/app/components/quiz/ResumeContentDialog.tsx` → `src/features/quizzes/components/quiz/ResumeContentDialog.tsx`
- `src/app/components/quiz/Stopwatch.tsx` → `src/features/quizzes/components/quiz/Stopwatch.tsx`
- `src/app/components/quiz/SubmitQuizDialog.tsx` → `src/features/quizzes/components/quiz/SubmitQuizDialog.tsx`
- `src/app/components/results/ResultsScoreHero.test.tsx` → `src/features/quizzes/components/results/ResultsScoreHero.test.tsx`
- `src/app/components/results/ResultsScoreHero.tsx` → `src/features/quizzes/components/results/ResultsScoreHero.tsx`
- `src/app/dashboard.ts` → `src/features/quizzes/selectors/dashboard.ts`
- `src/app/format.ts` → `src/features/quizzes/format.ts`
- `src/app/progress.test.ts` → `src/features/quizzes/selectors/progress.test.ts`
- `src/app/progress.ts` → `src/features/quizzes/selectors/progress.ts`
- `src/app/quizProgress.test.ts` → `src/features/quizzes/selectors/quizProgress.test.ts`
- `src/app/quizProgress.ts` → `src/features/quizzes/selectors/quizProgress.ts`
- `src/app/screens/DashboardScreen.test.tsx` → `src/features/quizzes/screens/DashboardScreen.test.tsx`
- `src/app/screens/DashboardScreen.tsx` → `src/features/quizzes/screens/DashboardScreen.tsx`
- `src/app/screens/QuizBrowseScreen.test.tsx` → `src/features/quizzes/screens/QuizBrowseScreen.test.tsx`
- `src/app/screens/QuizBrowseScreen.tsx` → `src/features/quizzes/screens/QuizBrowseScreen.tsx`
- `src/app/screens/QuizReviewScreen.test.tsx` → `src/features/quizzes/screens/QuizReviewScreen.test.tsx`
- `src/app/screens/QuizReviewScreen.tsx` → `src/features/quizzes/screens/QuizReviewScreen.tsx`
- `src/app/screens/QuizScreen.test.tsx` → `src/features/quizzes/screens/QuizScreen.test.tsx`
- `src/app/screens/QuizScreen.tsx` → `src/features/quizzes/screens/QuizScreen.tsx`
- `src/app/screens/ResultsScreen.test.tsx` → `src/features/quizzes/screens/ResultsScreen.test.tsx`
- `src/app/screens/ResultsScreen.tsx` → `src/features/quizzes/screens/ResultsScreen.tsx`
- `src/app/screens/SubjectScreen.test.tsx` → `src/features/quizzes/screens/SubjectScreen.test.tsx`
- `src/app/screens/SubjectScreen.tsx` → `src/features/quizzes/screens/SubjectScreen.tsx`
- `src/app/session/useQuizLaunch.test.tsx` → `src/features/quizzes/session/useQuizLaunch.test.tsx`
- `src/app/session/useQuizLaunch.ts` → `src/features/quizzes/session/useQuizLaunch.ts`
- `src/app/session/useQuizSession.test.tsx` → `src/features/quizzes/session/useQuizSession.test.tsx`
- `src/app/session/useQuizSession.ts` → `src/features/quizzes/session/useQuizSession.ts`

### Stage 3 flashcards move manifest

- `src/app/components/study/FlashcardNavigator.tsx` → `src/features/flashcards/components/FlashcardNavigator.tsx`
- `src/app/components/study/FlashcardStudyCard.tsx` → `src/features/flashcards/components/FlashcardStudyCard.tsx`
- `src/app/flashcards.test.ts` → `src/features/flashcards/selectors/flashcards.test.ts`
- `src/app/flashcards.ts` → `src/features/flashcards/selectors/flashcards.ts`
- `src/app/screens/FlashcardStudyScreen.test.tsx` → `src/features/flashcards/screens/FlashcardStudyScreen.test.tsx`
- `src/app/screens/FlashcardStudyScreen.tsx` → `src/features/flashcards/screens/FlashcardStudyScreen.tsx`
- `src/app/screens/FlashcardSubjectScreen.test.tsx` → `src/features/flashcards/screens/FlashcardSubjectScreen.test.tsx`
- `src/app/screens/FlashcardSubjectScreen.tsx` → `src/features/flashcards/screens/FlashcardSubjectScreen.tsx`
- `src/app/screens/FlashcardsDashboardScreen.test.tsx` → `src/features/flashcards/screens/FlashcardsDashboardScreen.test.tsx`
- `src/app/screens/FlashcardsDashboardScreen.tsx` → `src/features/flashcards/screens/FlashcardsDashboardScreen.tsx`
- `src/app/session/useFlashcardSession.test.ts` → `src/features/flashcards/session/useFlashcardSession.test.ts`
- `src/app/session/useFlashcardSession.ts` → `src/features/flashcards/session/useFlashcardSession.ts`

### Stage 3 shared move manifest

- `src/app/components/StudyDashboardLayout.tsx` → `src/shared/ui/catalog/StudyDashboardLayout.tsx`
- `src/app/components/StudyItemCarousel.tsx` → `src/shared/ui/catalog/StudyItemCarousel.tsx`
- `src/app/components/SubjectBrowseLayout.tsx` → `src/shared/ui/catalog/SubjectBrowseLayout.tsx`
- `src/app/components/SubjectCard.tsx` → `src/shared/ui/catalog/SubjectCard.tsx`
- `src/app/components/SubjectGrid.tsx` → `src/shared/ui/catalog/SubjectGrid.tsx`

## Stage 4 — Organize content and maintenance tools

- [ ] Move `schema.ts` into `content/schema`; group bank validators under `content/validation` and policies under `content/richText`. Keep the renderer in shared UI and policies independent of React.
- [ ] Move `questionBank.ts` and `flashcardBank.ts` into `content/local`; group runtime repositories/cache, decoders, transport, retry, and logger under `content/api`. Keep shared content utilities at the lowest appropriate boundary after inspecting their consumers.
- [ ] Preserve lazy local-bank imports: API-mode startup must not gain an eager import of the full canonical JSON or authoring validation pipeline.
- [ ] Move validation/audit entry scripts to `scripts/content`. Move the flashcard migration entry and its pure migration implementation/tests to a clearly development-only home under `scripts/migrations`; adjust test discovery and TypeScript checking as needed.
- [ ] Preserve public npm command names. Update script paths, `import.meta.url`/filesystem-relative paths, tests, mocks, backend references if applicable, and docs in the same change.
- [ ] Keep authoritative JSON paths unchanged. Do not merge the two banks, regenerate records, or consolidate the independent Python and TypeScript validators; their contract fixtures provide parity.

Exit gate: both banks have identical baseline hashes; validation, cross-runtime contracts, migration candidate generation, local/API loading, QA, and admin replay pass. Risk: medium-high, due to path and bundle sensitivity. Dependency: Stage 3.

## Stage 5 — Enforce boundaries and coherent tooling

- [ ] Add file-scoped import restrictions using the existing ESLint stack. Cover relative path variants and any aliases consistently; do not rely on naming conventions alone.
- [ ] Enforce: domain and analytics cannot import React/MUI, app, features, content adapters, or persistence implementations; storage stays behind repositories; content cannot import UI; shared UI cannot import app/features/admin; features cannot import app/admin/other features; admin core/data cannot import presentation.
- [ ] Preserve app as the composition root allowed to wire concrete repositories and features. Permit QA/admin to consume shared rendering and content validation deliberately.
- [ ] Account for dynamic imports and transitive cycles: static import restrictions alone are not a complete dependency graph check. Add a small graph check or focused established tool only if current lint cannot cover the required cases.
- [ ] Retain relative imports initially. If aliases materially improve cross-boundary readability, configure TypeScript, Vite/Vitest, scripts, and lint together and verify all execution paths; TypeScript `paths` alone is insufficient.
- [ ] Expand formatting/lint scope incrementally in separate mechanical changes, including relevant scripts/configs. Exclude canonical banks, private source material, generated output, and fixture bytes whose exact representation is significant.
- [ ] Keep unit/component tests colocated, shared cross-runtime fixtures in `tests/fixtures`, browser fixtures in `e2e/fixtures`, and Python tests in `backend/tests`. Move no tests merely for visual symmetry.

Exit gate: CI rejects disallowed dependencies, every documented command resolves, and formatting changes are reviewable separately from moves. Risk: medium. Dependency: Stage 4.

## Stage 6 — Make documentation maintainable and close the migration

- [ ] Restructure architecture documentation around current boundaries, data flow, composition, and deployment modes. Link to detailed pages only when their size warrants a separate file.
- [ ] Restructure testing documentation around commands, suite ownership, fixtures, and behavior requirements. Keep historical execution detail in completed trackers while preserving current regression obligations.
- [ ] Record the final ownership/dependency rules in architecture guidance and link them from AGENTS.md rather than duplicating a full tree there.
- [ ] Search all tracked source/config/docs for moved paths; fix current references and annotate historical trackers where necessary without rewriting their historical claims.
- [ ] Remove temporary forwarding modules introduced during migration, confirm no empty placeholder directories or duplicate canonical copies, and record final verification below.
- [ ] Move this tracker to `docs/work/done` only after all implementation gates pass.

Exit gate: clear source of truth for each area, clean verification, unchanged canonical content and persistence contracts, and no outstanding migration shims. Risk: low. Dependency: Stage 5.

## Validation and rollback for every stage

For source/config moves, run focused affected tests, then `npm run lint`, `npm run format:check`, `npm test`, `npm run validate:content`, `npm run build`, and `git diff --check`. Build the optional admin with `VITE_BUILD_ADMIN=true npm run build`. The build includes TypeScript checking.

For shared UI, feature, content-loader, or entry-point moves, run `npm run test:e2e` and `npm run test:e2e:admin`; inspect affected desktop/mobile layouts, keyboard behavior, loading transitions, and bundle boundaries. Verify the default build omits admin and that API startup retains its lazy content behavior. Exercise explicit local mode and `/#content-qa` when their imports change.

For backend packaging, bank contracts, or shared fixture changes, run `.venv/bin/python -m pytest backend/tests -q`, `.venv/bin/ruff check backend/src backend/tests`, and `.venv/bin/mypy backend/src`. Check a clean backend install after removing generated packaging metadata.

Compare both canonical hashes after every stage. Preserve test counts/discovery unless intentionally changed and explained. A stage is incomplete while relevant checks fail. Record baseline problems separately; do not weaken gates to make moves pass.

Keep moves/import updates separate from formatting, behavior changes, dependency upgrades, and any future content migration. Use one reversible commit/PR per coherent slice and revert that slice if parity fails. No stage should require resetting browser data or replacing canonical JSON to roll back.

## Completion criteria

- A new contributor can identify where a quiz, flashcard, admin, content, or storage change belongs from the docs index.
- Each moved module has one clear owner; shared modules have actual reuse or a clear application-wide responsibility.
- Dependency direction is checked automatically, with no unreviewed cycles or eager content imports introduced.
- Both canonical banks and persisted-data contracts are unchanged.
- Existing frontend, backend, browser, and optional-admin gates pass.
- Generated packaging output is untracked; private source files remain recoverable.

## Sources and rationale

Guidance checked on 2026-10-06. Apply compatible principles to installed versions; this plan does not require upgrading to the documentation's newest tool versions.

- [React: Thinking in React](https://react.dev/learn/thinking-in-react) supports decomposition by responsibility and explicit data flow. It does not prescribe this repository's feature-folder names.
- [Vite: Building for Production](https://vite.dev/guide/build) documents multiple HTML entry points. Keeping the current learner/admin entries avoids unnecessary build-root changes.
- [pytest: Good Integration Practices](https://pytest.org/en/stable/explanation/goodpractices.html) supports the backend's existing `src` package layout and deliberate test/import configuration.
- [ESLint: no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) provides configurable static import restrictions; graph/cycle and dynamic-import coverage must be considered separately.
- [TypeScript: paths](https://www.typescriptlang.org/tsconfig/paths.html) explains that aliases do not rewrite emitted imports, which is why runtime/build resolution must agree.
- [Diátaxis](https://www.diataxis.fr/) distinguishes tutorials, how-to guidance, reference, and explanation. Use that distinction to improve navigation without creating empty documentation categories.

## Planning verification

Repository structure, tracked packaging output, entry points, scripts, CI, core guidance, prior refactor trackers, and relevant module imports were inspected. No source, canonical content, or configuration was changed while producing this plan. `npm run build` passed, including TypeScript checking; Vite reported its large-chunk warning (the shared StudyHeader chunk is about 620 kB minified). `git diff --check` passed for tracked changes. Full tests and migration gates have not been run for this documentation-only task; Stage 0 must establish those results before implementation.
