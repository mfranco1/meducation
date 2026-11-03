# Glossary

Use these terms in UI copy, docs and new code. Where the code or a stored format uses a different name, it is shown in backticks; don't rename stored or wire names to match.

## Content

- **Bank**: all published or draft content. Two paired documents: the quiz document (subjects, topics, quizzes, questions) and the flashcard document (decks, cards).
- **Subject**: top-level grouping, shared by quizzes and flashcards.
- **Topic**: grouping within a subject, shared by quizzes and flashcards. Unrelated to the free-text `question.metadata.topic`.
- **Quiz**: ordered set of questions in one topic.
- **Question** (editor UI and bulk-add JSON: "item", `items`; ID prefix `i`): a stem, ordered choices, one answer key and a rationale.
- **Stem**: the question text.
- **Choice**: one answer option. Learners see choices lettered by position.
- **Answer key** (`answer`): the ID of the correct choice. Each question has exactly one.
- **Rationale** (learner UI: "explanation"): why the answer is correct. Sources live in `rationaleMeta.sources`.
- **Pearls**: optional short takeaways on a question; feedback shows one at random.
- **Deck**: ordered set of cards in one topic.
- **Card** (`FlashcardCard`, stored as `StoredFlashcard`): a front, a back and optional sources.

## Publishing

- **Editor**: the person who edits content, and the `/admin.html` app they use. `admin` names the code, routes, build target and database role, not the person.
- **Record**: one subject, topic, quiz, question, deck or card in the draft.
- **Record version** (`expectedVersion`): detects a save that conflicts with a change made elsewhere.
- **Draft**: the editable copy of the bank. Saving changes the draft only.
- **Publish**: build both documents from the draft into a release and activate it.
- **Release**: an immutable, published pair of documents.
- **Content revision** (`revision`, `contentRevision`): the `sha256-` digest identifying a published quiz or flashcard document. The learner checks it at launch.

## Learner study

- **Learner**: anyone using the study app. No account. Progress stays in the browser.
- **Attempt**: one run through a quiz, active or completed. Quizzes only.
- **Feedback mode** (`feedbackMode`): **Fast Feedback** (`immediate`) reveals each answer once locked; **Exam Mode** (`exam`) reveals nothing until submission.
- **Response**: the learner's answer, flag and time for one question in an attempt.
- **Score**: correct, incorrect and unanswered counts of a completed attempt.
- **Review results**: read-only view of a completed attempt's answers.
- **Browse Answers**: dev-only read-only view of a quiz with answers shown.
- **Checkpoint**: saved position in a deck, the flashcard counterpart of an active attempt.
- **Reveal**: show a card's back. A revealed card is stored in `openedCardIds`; the navigator's **Hidden** filter lists cards not yet revealed.
- **Flag**: a learner's marker on a question or card.
- **Completion**: finishing a quiz attempt or a deck.
- **Content signature** (`contentSignature`): a short hash of the content a saved attempt or checkpoint was built from. If it no longer matches, resume requires an explicit restart. Distinct from content revision, which identifies a whole published document.
- **Progress backup**: the downloaded `.json.gz` file holding all quiz and flashcard progress. **Restore** replaces progress with a backup; **Reset progress** deletes it.
- **Storage revision** (`revision` in stored progress): a token that makes a stale tab reload before writing. Not related to content revision.
