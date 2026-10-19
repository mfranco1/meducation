---
name: meducation-code-review
description: Review Meducation diffs, commits, or pull requests for correctness, regression, data-integrity, security and unnecessary-complexity defects.
---

# Meducation code review

Read [AGENTS.md](../../../AGENTS.md). Use the requested diff or base; otherwise review staged, unstaged and relevant untracked changes and say so. Review is diagnostic unless fixes are requested.

Focus on demonstrated problems:

- Content: exact canonical text, order, IDs and answer keys.
- Learner progress: storage compatibility, failed writes, no silent loss or reset of progress.
- Loading: stale responses, cancellation, error recovery.
- Security: auth on admin routes, input validation at trust boundaries, rich-content sanitization.
- Complexity: new layers, files, configuration, scripts, docs or tests that the change does not need. Name the smaller alternative.

Report findings most severe first, each with location, triggering scenario, actual versus expected behavior and impact. Separate optional improvements from bugs. If there are no findings, say so and note what was not tested.
