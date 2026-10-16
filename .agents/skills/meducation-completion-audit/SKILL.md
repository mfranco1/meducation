---
name: meducation-completion-audit
description: Audit Meducation work against the requested outcome, repository invariants, and verification evidence before marking a task or work tracker done. Use for completion checks, final audits, and readiness assessments.
---

# Meducation completion audit

Follow the [central simplicity policy](../../../AGENTS.md#engineering-philosophy): extend existing code, justify new moving parts, and remove obsolete code. Ownership boundaries do not require separate files or abstractions.

## Establish the completion contract

Work from the repository root. Read [AGENTS.md](../../../AGENTS.md), applicable nested instructions, the user's accepted scope, and the active tracker under `docs/work/ongoing`. Follow [work tracking](../../../docs/work/README.md). Separate completion of the authorized task or stage from readiness for public release; an unfinished roadmap is not automatically a blocker for a smaller task.

Inspect `git status --short`, staged and unstaged diffs, relevant untracked files, and any commits belonging to the task. Do not treat a clean working tree as proof of completion. Preserve unrelated user work. Match each requested outcome to implementation and observable evidence; identify omitted requirements, unfinished scaffolding, and unsupported completion claims.

## Check the affected contracts

Use the current owner documents rather than historical completed trackers:

- [Architecture](../../../docs/architecture.md): module ownership, dependency direction, storage abstraction, and lazy loading.
- [Product](../../../docs/product.md) and [design system](../../../docs/design-system.md): changed learner/admin behavior, accessible states, and responsive presentation.
- [Content management](../../../docs/content-management.md), [question schema](../../../docs/question-schema.md), and [flashcard schema](../../../docs/flashcard-schema.md): read when content, serialization, validation, rendering, or shared subjects are affected.

Confirm canonical banks retain exact authored text, meaningful formatting, ordering, stable IDs, and original answer provenance unless the task explicitly includes documented content changes. The verified answer must take precedence when present. Keep progress storage contracts intact and runtime generative AI absent. Preserve the existing PostgreSQL delivery and authenticated paired-authoring contracts without expanding backend scope.

## Require evidence appropriate to the change

Read [testing](../../../docs/testing.md), affected sections of [regression requirements](../../../docs/testing-regressions.md), and current `package.json` scripts. Record required checks and their outcomes in the active tracker.

- After changes, `npm run build` supplies the minimum TypeScript and production build checks. Run applicable lint, unit, architecture, content, Python, and browser checks required by those documents.
- Content changes require `npm run validate:content`; fixture-based unit tests do not validate the actual banks. Apply the additional content-management gates for authored changes.
- Use `npm run verify:full` when full verification is in scope and prerequisites exist. It stops on the first failure; unexecuted later steps are not passes.
- Keep learner/admin builds and browser suites sequential because they share output. Never use `test:e2e:prepared` with stale or differently configured output.
- Reuse recorded passing results only when they apply to the current relevant files, configuration, and environment. Rerun affected checks after fixes; avoid repeating unaffected checks without cause.
- Run `git diff --check` and inspect new files too. For UI work, distinguish automated/browser evidence from manual assistive-technology or device acceptance. Model probes and design evidence do not certify implemented features.

If an in-scope defect is found during an implementation task, fix it and recheck. For an audit-only request, report findings without silently implementing changes. A missing prerequisite is a verification gap, not a pass. Distinguish pre-existing failures from introduced failures, but do not mark done while relevant required gates fail or remain unverified. Keep work at an agreed stage boundary.

## Close out

Return a concise readiness verdict, remaining actionable findings with file locations, checks actually run and their results, and material verification gaps. State explicitly when no blocking findings were found; do not imply exhaustive proof. Update the ongoing tracker with actual evidence, and move it and related task snapshots to `docs/work/done` only when the requested outcome and relevant checks are complete. Preserve frozen historical evidence. Do not commit, merge, deploy, or publish merely to close an audit.
