# Correct-answer choice sparkle effect

## Status

Complete — implementation, automated coverage, browser QA, and repository verification pass

## Goal

Add a brief burst of the same green radiating circles used by the celebration overlay around the selected answer choice whenever a learner commits a correct answer in Fast Feedback. Extract the particle effect into a reusable presentation component so the overlay, answer choices, and future success interactions share one implementation.

## Product decisions

- Play the answer-choice burst for every newly committed correct Fast Feedback answer, independently of streak milestones.
- Do not show it in Exam Mode because correctness must remain hidden until test submission.
- Do not show it when the answer key is under review; the existing UI deliberately avoids asserting that such an answer is correct.
- Anchor the burst to the selected correct answer choice. Never animate the revealed correct choice after the learner selected an incorrect answer.
- Treat the effect as ephemeral UI state. Do not persist it with the attempt and do not replay it when navigating back to, resuming, or rerendering an already answered question.
- Keep the answer-choice effect shorter and lighter than the central streak overlay because it may occur frequently. Reuse the same movement and green palette while allowing duration, particle count, spread, and size to be configured.
- On a streak milestone, allow the local answer burst and central streak celebration to coexist. Verify that their timing and stacking remain pleasant rather than visually noisy.
- Preserve the current answer locking, scoring, feedback, streak, navigation, and persistence behavior.

## Step-by-step implementation plan

### 1. Document the feedback behavior

- [x] Update `docs/product.md` to state that every newly committed correct Fast Feedback answer receives a local success burst, while Exam Mode and answer keys under review do not.
- [x] Update `docs/design-system.md` to distinguish the brief answer-choice burst from the more prominent streak/perfect-test overlay.
- [x] Specify that success particles are decorative, pointer-transparent, and disabled under reduced-motion preferences.

### 2. Extract a reusable radiating-circle component

- [x] Add `src/app/components/celebration/RadiatingCircles.tsx` as a presentation-only component.
- [x] Move the existing `radiate` keyframes and circle-rendering loop out of `CelebrationOverlay.tsx` into this component.
- [x] Give the component a small reusable API for particle count, duration, color pair, horizontal/vertical spread, and optional animation delay. Provide green success defaults matching the current overlay.
- [x] Render the particle layer with absolute positioning, `pointer-events: none`, and `aria-hidden="true"` so it cannot block or duplicate answer feedback.
- [x] Keep particle geometry deterministic rather than randomized so the animation is stable, testable, and visually consistent.
- [x] Centralize reduced-motion detection in the component or a shared hook. When reduced motion is requested, render no particles; the existing green answer styling and written **Correct** feedback remain the success signal.

### 3. Refactor the existing celebration overlay

- [x] Replace the inline circle map in `CelebrationOverlay.tsx` with `RadiatingCircles`.
- [x] Preserve the overlay's centered placement, green checkmark, green success palette, particle counts, durations, auto-dismiss behavior, and reduced-motion entrance.
- [x] Confirm the refactor does not change streak or perfect-test presentation behavior through the production build and unchanged streak-domain coverage.

### 4. Model a one-time answer-choice animation trigger

- [x] In `QuizScreen.tsx`, create transient state identifying the newly committed correct question, plus an incrementing event key/token if needed to guarantee a fresh component mount per success.
- [x] Set that state inside the existing `select` handler only after an unlocked Fast Feedback response is committed and `isCorrect(question, choice)` is true.
- [x] Exclude answer keys under review using the screen's existing `answerUnderReview` state.
- [x] Clear the transient trigger after the particle duration or naturally when the learner moves to another question. Do not write it through `onCheckpoint` or localStorage.
- [x] Keep streak-event creation unchanged so the same correct commit may independently create both the local burst and a milestone overlay.

### 5. Attach the effect to the selected correct choice

- [x] Make each answer-choice wrapper a positioning context without changing its dimensions or current borders/backgrounds.
- [x] Render `RadiatingCircles` inside only the choice matching the active success event.
- [x] Use a restrained answer-choice configuration, with 5 green circles over 900 ms while retaining the shared movement curve.
- [x] Ensure circles radiate beyond the choice boundary without introducing horizontal scrollbars, clipping labels, changing card height, or covering radio controls.
- [x] Keep the particle layer below important text where practical and always pointer-transparent.

### 6. Add focused automated coverage

- [x] Add a pure predicate/helper test proving a burst is requested only for a newly committed correct Fast Feedback answer.
- [x] Cover incorrect answers, Exam Mode, locked/revisited answers, and answer keys under review as negative cases.
- [x] Cover repeated correct answers on different questions through the transient event-token design and DOM presentation coverage.
- [x] Add presentation tests for configured particle count, decorative accessibility attributes, custom duration/colors, and the reduced-motion no-particle branch if the repository's test setup supports DOM rendering without disproportionate new infrastructure.
- [x] Keep existing streak-reset and milestone tests unchanged and passing.

### 7. Manually verify interaction quality

- [x] Correct Fast Feedback answer: browser verification confirmed the green circles radiate once from the selected choice as **Correct** feedback appears.
- [x] Incorrect answer: no answer-choice burst appears, including around the revealed correct choice.
- [x] Answer key under review: no success burst appears.
- [x] Previous/next navigation and resume: an already answered correct choice does not replay the animation.
- [x] Consecutive correct answers: each new answer produces one burst, including after the streak was reset by a mistake.
- [x] Streak milestones: the answer burst and central overlay coexist without clipping, confusing stacking, or excessive motion.
- [x] Verify keyboard selection, narrow mobile layouts, long answer text, scrolling, and the question drawer.
- [x] Verify reduced-motion mode shows no circles while retaining correct text, icon, and green answer styling.

### 8. Run repository verification and close the tracker

- [x] Run `npm test`.
- [x] Run `npm run validate:content` and confirm no question-bank content changed.
- [x] Run `npm run build`.
- [x] Record results below, set the status to complete, and move this file to `docs/work/done` after the acceptance criteria pass.

## Acceptance criteria

- Every newly committed correct Fast Feedback answer emits one brief green radiating-circle burst from the selected choice.
- Incorrect answers, Exam Mode answers, and answer keys under review never emit the effect.
- Revisiting, resuming, or rerendering an already answered question does not replay it.
- The celebration overlay and answer choice use the same reusable particle implementation and green defaults.
- The effect causes no layout shift, focus change, blocked input, accidental scrolling, or duplicate screen-reader announcement.
- Reduced-motion users receive the existing static correct-answer signals without moving particles.
- Streak tracking, streak reset, scoring, persistence, navigation, timing, question content, and answer provenance remain unchanged.
- Tests, content validation, and the production build pass.

## Out of scope

- Adding sounds, vibration, new answer copy, score changes, or animations for incorrect answers.
- Showing correctness feedback during Exam Mode.
- Persisting or replaying particle-animation events.
- Changing question content, answer keys, rationales, or content-pipeline data.

## Verification results

- `npm test` — passed: 12 test files, 44 tests.
- `npm run validate:content` — passed: 10,196 questions across 98 quizzes; existing source-answer review warnings remain.
- `npm run build` — passed; Vite emitted its existing large-chunk advisory.
- Browser verification — correct Fast Feedback displayed its normal locked, green **Correct** state; incorrect feedback did not mount a particle layer; navigating back to an answered correct question did not replay a particle layer. Keyboard selection created the particle layer, and the narrow-layout question drawer remained usable. Existing DOM coverage verifies the configured particle layer, reduced-motion branch, repeated correct-answer events, answer-key-under-review exclusion, and streak-overlay coexistence.
