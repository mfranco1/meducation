# Product behavior

Meducation is a local-first study app for quizzes and flashcards. Content comes from PostgreSQL through the API; attempts, scores, checkpoints and progress backups stay in the browser. No account or cloud sync exists for learners. Visual conventions are in [design system](design-system.md).

## Navigation

- A first visit opens a landing page with sample questions and flashcards built from the real study components; answers there save nothing. **Start studying** records the visit and opens the Quizzes dashboard. Later visits, and any browser that already has progress, open the dashboard directly. Reset and restore keep the flag; clearing site data shows the landing page again.
- **About** in either dashboard footer opens the landing page at `/?about=1`, even for returning learners. It saves nothing and supports browser Back and Forward.
- A collapsible left rail has **Quizzes** and **Flashcards**; both open a dashboard built from the shared subject catalog. The brand returns to Quizzes. **Progress** and **Help** sit at the bottom of the rail.
- Leaving an active quiz asks for confirmation and commits the exit only after the save or clear succeeds. Leaving Review results asks for confirmation; nothing is saved. Leaving a flashcard deck saves its checkpoint first.
- Dashboards show subject cards (paged, with an All or In progress filter) and stat cards. Quiz cards show latest score and trend; flashcard cards show the share of decks completed at least once. Empty flashcard decks are listed but cannot be launched. Each dashboard keeps its page and filter for the session, and returning from a subject restores its scroll position; other screens open at the top.
- A dashboard footer shows the copyright line, **Privacy** and **Terms** (dialogs), **About** and **Contact** (the Telegram support account).
- First-time tips: with a mouse or trackpad, the first quiz and the first deck show a keyboard tip until you dismiss it or press one of its keys. The first completion shows a reminder that progress stays in this browser, with a **Back up** button that opens Progress. Tips show only while nothing has been completed, so restored progress hides them. Seen tips are kept by reset and restore and left out of backups.
- **Help** opens a dialog with Telegram contact and reporting instructions and FAQs. It is available during study and preserves the current session.
- Continue Studying appears when any subject has an unfinished quiz or deck. It is a carousel ordered by most recent activity and does not auto-advance. Choosing Continue opens the topic containing that subject's most recently used unfinished quiz or deck and brings the item into view; choose Resume to start studying.

### Subject screen

- **Quizzes** and **Flashcards** tabs sit below the header. Switching tabs swaps the topics and content without a page transition or scroll reset, and resets topic selection and search.
- Each tab groups its quizzes or decks by topic: a header with subject progress (quizzes or decks with at least one completion), a Topics list with per-topic progress, and the selected topic's summary and list. Only topics with content are listed.
- Topics and their quizzes or decks are ordered by most recent activity (start, resume, answer or finish; Browse excluded); untouched ones keep catalog order.
- Wide screens open on the first topic. Narrow screens open on the Topics list; a topic opens its content, and browser Back returns to the list. Selection is not saved.
- Search filters topics and quizzes or decks by name, ignoring case and accents, and lists the matches by topic. On wide screens choosing a topic clears the search; on narrow screens it is kept, so Back returns to the filtered list. The query is not saved.
- Each quiz or deck shows its completion count, latest score, relative last activity and, when in progress, the share of questions answered or cards revealed.

## Loading and freshness

- The shell and dashboard render before content loads. The subject catalog loads first, a subject's quizzes or decks when selected, and bodies when the learner shows intent (opening quiz setup, pointing at or focusing a deck's Study button) or at launch. Failures show a recoverable banner or toast with learner-safe copy and never change saved progress. Retries are automatic with a visible countdown and a manual Retry afterward.
- Every explicit launch (start, retake, resume, browse, open or resume a deck, restart confirmation) revalidates the bank's catalog even when bodies are cached, and the check must be under 30 seconds old when study is admitted. Changed revisions or moved membership block the launch with reload guidance; changed saved content requires an explicit restart. Unavailable checks block new launches and preserve saved data. Active study keeps its loaded content. There is no polling or idle refresh.

## Quizzes

- One question at a time, with flags, a stopwatch and result summaries. Starting or retaking opens a setup dialog over the subject screen; dismissing starts nothing.
- Each attempt shuffles question order and choice order. The order is kept when you resume, finish and review. Choices are lettered by position. In development builds, a setup switch turns shuffling off.
- **Fast Feedback** locks the selected answer and reveals correctness and the explanation immediately; the stopwatch freezes when every question is locked. **Exam Mode** reveals nothing until submission and never shows live correctness or streaks. Navigator tiles for graded answers are light green when correct and light red when wrong.
- The study headers show the position ("Question 50 of 120"); the progress bar fills by questions answered or cards revealed, with a lighter band marking the position.
- Correct Fast Feedback answers earn a brief burst and an attempt-local streak with escalating celebrations at 3, 5, 10, 25 and 50; an incorrect answer resets the streak. Scores show 100% only when every answer is correct. A perfect Fast Feedback quiz celebrates once after the last answer. Scores of 75% and above add a finish to the results ring that grows at 90% and 100%, and a perfect score turns the ring gold. A new celebration replaces one still playing; when one answer earns several, only the highest plays.
- **Browse Answers** is available only on the dev server, never in production builds. It is read-only and writes nothing, so it is excluded from activity, scores and trends.
- After a quiz is finished or submitted, **Review results** shows every submitted answer read-only with All, Wrong and Flagged filters; leaving returns to the subject page. **Review** on a finished quiz lists its saved attempts (history is capped across all quizzes), each with its mode, elapsed time and score, and opens any of them read-only; a notice appears if the quiz changed after the attempt.
- A button below the navigator tiles submits or finishes the quiz (with confirmation) or leaves Review, from any question. In the active quiz, a Leave button beside it does the same as the header's back button.
- Left and Right Arrow, and swiping on the question, move through questions in the active quiz, Browse and Review, following the active navigator filter. They never finish or exit, pause while a drawer or dialog is open, and leave answer radios, editable controls and links alone.
- Keys 1-9 or A-I choose the matching answer: Exam Mode selects (changeable) and Fast Feedback submits. They pause like arrows, but a focused answer radio does not block them.
- Saved attempts record a per-quiz content signature. If it is missing or the questions or answers changed, Resume explains and offers an explicit restart; keeping the saved attempt leaves it untouched. Storage failures never advance to a success screen. A stale tab must reload before editing; use one tab per test.

## Flashcards

- The front stays visible above an answer panel. Click, Space or Enter reveals the answer with its source; Space or Enter on a revealed card advances; clicking a revealed answer hides it. Left and Right navigate from anywhere on the screen (never wrapping), as does a swipe on the card, and the last card still requires **Finish**.
- A gold glow builds around the card as you reveal more distinct cards in one sitting. It resets when you leave the deck and ignores deck length.
- A Cards navigator filters All, Hidden and Flagged in deck order. Revealed and flagged cards persist across resume; resume shows the saved card's front. Finish clears the active position and increments the deck's completion count; save-and-exit and restart do not.
- The dashboard shows **Completed**, **Average** and **Highest** (decks finished, decks per local day including idle days, and the best single day). Daily figures begin with the first finish after daily tracking started and keep the local date recorded at finish.

## Progress backup, restore and reset

- **Progress** in the navigation (available when no study session is active) opens one dialog for backup, restore and reset. Backup downloads one gzip-compressed, versioned JSON file (`.json.gz`) with paired quiz and flashcard progress (no running timers; restored timers are paused). It can contain question text, so it is not safe to publish.
- Restore accepts only gzip-compressed backups up to 4 MiB decompressed. The file is a trust boundary, validated by `progressBackupCodec.ts` before anything changes; export runs the same validator. Nothing is uploaded.
- Choosing a file shows a comparison of its date, saved quizzes, flashcard decks and total completions with this browser's, and a warning that restoring cannot be undone. **Restore** replaces both stores after explicit confirmation (never merges), keeps timers paused and reloads. Empty backups clear progress. Unknown content IDs are kept; resume uses the normal changed-content rules.
- If either write fails, the previous values of both stores are put back and an error says nothing changed. Other open tabs ask to reload when their copy is stale. A crash between the two writes can leave one store replaced; the app cannot detect this, and restoring a known-good backup fixes it.
- **Reset progress** opens a confirmation view that lists what will be deleted, with an optional backup download. Confirming removes both stores (restoring both if either removal fails) and reloads. It also works when stored progress cannot be read.
- Clearing site data removes progress and cannot be recovered by the app.

## Content editor

The optional `/admin.html` editor is described in [content management](content-management.md#editor-workflow).
