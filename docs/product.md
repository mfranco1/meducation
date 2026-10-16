# Product behavior

Meducation is a local-first study app for quizzes and flashcards. Content comes from PostgreSQL through the API; attempts, scores, checkpoints and progress backups stay in the browser. No account or cloud sync exists for learners.

## Navigation

- A collapsible left rail has **Quizzes** and **Flashcards**; both open a dashboard built from the shared subject catalog with a Continue Studying carousel. Desktop starts expanded; narrow screens show an icon rail and an overlay drawer. The brand returns to Quizzes.
- Leaving an active quiz or results review asks for confirmation and commits the exit only after the save or clear succeeds. Leaving a flashcard deck saves its checkpoint first.
- Dashboards show subject cards (12 per page, All or In progress filter) and stat cards. Quiz cards show latest score and trend; flashcard cards show deck counts without scores. Empty catalogs use a short empty state; empty flashcard decks are listed but cannot be launched.
- Continue Studying appears when any subject has an unfinished quiz or deck. It shows one card at a time, ordered by most recent activity, and does not auto-advance.

## Loading and freshness

- The shell and dashboard render before content loads. The subject catalog loads first, a subject's quizzes or decks when selected, and bodies when a session starts. Skeletons reserve layout; failures show a recoverable banner or screen-scoped toast with learner-safe copy and never change saved progress. Retries are automatic with a visible countdown and a manual Retry afterward.
- Every explicit launch (start, retake, resume, browse, open or resume a deck, restart confirmation) revalidates the bank's catalog even when bodies are cached, and the check must be under 30 seconds old when study is admitted. Changed revisions or moved membership block the launch with reload guidance; changed saved content requires an explicit restart. Unavailable checks block new launches and preserve saved data. Active study, answers, timers and checkpoints keep their loaded content. There is no polling or idle refresh.

## Quizzes

- One question at a time, with flags, a stopwatch and result summaries. Starting or retaking opens a setup dialog over the subject screen; dismissing starts nothing.
- **Fast Feedback** locks the selected answer and reveals correctness and the explanation immediately; the stopwatch freezes when every question is locked. **Exam Mode** reveals nothing until submission and never shows live correctness or streaks. Scoring prefers `verifiedAnswer`; keys under review are labeled and excluded from the wrong-answer filter.
- Correct Fast Feedback answers earn a brief burst and an attempt-local streak with celebrations at 3, 5, 10, 25 and 50; an incorrect answer resets the streak. A perfect score celebrates once.
- **Browse Answers** is read-only, shows correct answers and explanations, and writes nothing, so it is excluded from activity, scores and trends.
- After an Exam submission, **Review results** shows every submitted answer read-only with All, Wrong and Flagged filters and requires confirmation to leave; leaving ends the transient review and keeps the score. Results show an animated score ring that respects reduced motion.
- Left and Right Arrow move through questions in the active quiz, Browse and Review. They never finish or exit, pause while a drawer or dialog is open, and leave answer radios, editable controls and links alone.
- Saved attempts record a per-quiz content signature. If it is missing or the questions or answers changed, Resume explains and offers an explicit restart; keeping the saved attempt leaves it untouched. Storage failures never advance to a success screen. A stale tab must reload before editing; use one tab per test.

## Flashcards

- The front stays visible above an answer panel. Click or Space reveals a bold rich answer with its source; Space on a revealed card advances; clicking a revealed answer hides it. Left and Right navigate from anywhere on the screen (never wrapping), and the last card still requires **Finish**.
- A Cards navigator filters All, Hidden and Flagged in deck order. Opened and flagged cards persist across resume; resume shows the saved card's front. Finish clears the active position and increments the deck's completion count; save-and-exit and restart do not.
- The dashboard shows **Completed**, **Average** and **Highest** (decks finished, decks per local day including idle days, and the best single day). Daily figures begin with the first finish after daily tracking started and keep the local date recorded at finish.

## Progress backup and restore

- **Progress backup** in the navigation (available when no study session is active) downloads one versioned JSON file with paired quiz and flashcard progress. Files can contain question text and choices for unfinished quizzes; share them only intentionally. A download does not prove the file was saved elsewhere.
- Choosing a file validates it before anything changes and previews its date, saved quizzes and decks, retained attempts and durable totals next to current totals, offering a backup of current progress first. **Restore** replaces both stores after explicit confirmation (never merges), regenerates storage revisions, keeps timers paused, reloads, announces success and focuses the Quizzes dashboard. Empty backups clear progress with a warning. Unknown content IDs are kept; resume uses the normal changed-content rules.
- Limits: 4 MiB file, depth 16, 250,000 values; oversized or malformed files are rejected without touching stored progress. Nothing is uploaded.
- Restore writes both stores in turn. If either write fails (for example on quota), the previous values of both are put back and an error says nothing changed. Other open tabs pick up the change through `storage` events and ask to reload when their copy is stale.
- Clearing site data removes progress and cannot be recovered by the app.

## Content editor

The optional `/admin.html` editor (signed-in, HTTP-backed) is described in [content management](content-management.md#editor-workflow). Its visible contract: workspace status distinguishes saved-unpublished from published; save, undo, reset and publication show captured server context; expiry, conflicts and uncertain responses keep unsaved text and offer refresh or reconciliation; the header groups Review & publish, More utilities (export, published versions) and Account.
