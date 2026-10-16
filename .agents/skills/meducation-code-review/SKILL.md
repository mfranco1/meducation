---
name: meducation-code-review
description: Review Meducation diffs, commits, or pull requests for actionable correctness, regression, data-integrity, and security defects. Use for code review; completion readiness and broad architecture assessments have separate skills.
---

# Meducation code review

Follow the [central simplicity policy](../../../AGENTS.md#engineering-philosophy): extend existing code, justify new moving parts, and remove obsolete code. Ownership boundaries do not require separate files or abstractions.

## Establish scope

Read [AGENTS.md](../../../AGENTS.md) and applicable nested instructions. Use the requested diff/base; if none is supplied, inspect staged, unstaged, and relevant untracked changes and state that scope. For branch reviews, resolve the comparison base rather than assuming a branch name. Read surrounding code, callers, contracts, and tests before judging a changed line.

Review is diagnostic unless the user also requests fixes. Do not alter canonical data, reformat code, or expand the task into a rewrite. Use [architecture](../../../docs/architecture.md), [product](../../../docs/product.md), and the owner documentation for the affected behavior as the specification.

## Follow changed data through its consumers

Prioritize demonstrated regressions over speculative risks or style preferences. Select the relevant checks:

- Quiz rules: verified-answer precedence without losing the supplied answer; missing/uncertain keys; scoring, locked responses, submit/resume, and active-time accounting. Read-only Browse Answers and results review must not write progress or activity.
- Flashcards: separate progress from quiz attempts; stable deck/card membership and signatures; opening, flagging, checkpointing, and one-time completion behavior. Preserve durable counts and daily statistics.
- Persistence/session changes: repository boundaries, codec compatibility, stale-write/revision handling, failed writes, page lifecycle, and success-only navigation. Do not replace unavailable progress with a successful empty/zero state.
- Loading: revision-pinned API reads, deduplication, cancellation, stale responses, bounded retry, error recovery, and preserved lazy loading. Test race scenarios suggested by the actual change.
- Content/authoring: exact canonical text and order, IDs, provenance, shared subjects, atomic paired PostgreSQL saves, reservations, revision checks, server Undo/reset, publication and database-derived export. Read [content management](../../../docs/content-management.md) and the relevant [question](../../../docs/question-schema.md) or [flashcard](../../../docs/flashcard-schema.md) schema.
- Rich content: shared Markdown/HTML/URL/math safety policies and sanitization order; no runtime LLM calls. Treat the local editor's build flag as a feature gate, not authentication.
- UI: [design-system](../../../docs/design-system.md) conventions, keyboard/focus behavior, reduced motion, loading/error/empty distinctions, and mobile overflow. Flag visual preferences only when they violate a documented requirement or cause a concrete usability defect.

## Validate and report

Use [testing](../../../docs/testing.md) and [regression requirements](../../../docs/testing-regressions.md) to select focused reproductions and tests. Use synthetic fixtures; never mutate canonical banks or personal browser progress to demonstrate a bug. Report commands actually run and gaps. If fixes are authorized, run all affected repository gates, including the minimum typecheck/build, before claiming completion.

Return findings first, ordered by severity. For each finding give a short title, a narrow file/line location, the triggering scenario, actual versus expected behavior, and the concrete impact. Use P0 for an unconditional release-blocking defect, P1 for urgent serious breakage/data loss, P2 for a normal actionable defect, and P3 for a minor defect. Explain conditional assumptions; distinguish existing problems from defects introduced by the reviewed changes. Keep optional improvements separate from bugs and do not inflate finding counts. For simplification findings, identify the current maintenance cost and smaller alternative. Short files, small duplication, test injection, and necessary safety checks are not defects by themselves.

If no actionable findings are supported, say so and state remaining test limitations. Passing tests alone do not establish correctness. Record sustained review work and findings in an ongoing tracker per repository guidance; close the review task only after its agreed review scope and checks are satisfied, without implying the reviewed implementation is ready if blockers remain.
