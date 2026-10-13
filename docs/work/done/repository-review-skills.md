# Repository review and refactoring skills

## Scope

Create repository-local skills for completion audits, code review, architecture review, and behavior-preserving refactoring. Use current documentation and executable checks as authority; do not change application behavior or canonical content.

## Progress

- [x] Inspect repository instructions, architecture, content rules, test commands, and skill authoring guidance.
- [x] Create four focused skills under `.agents/skills` and add documentation links.
- [x] Validate skill structure and references; review scope and completion criteria.
- [x] Run TypeScript/build checks and diff hygiene; record evidence and move this tracker to done.

## Verification — 2026-10-13

- All four skills passed the bundled `quick_validate.py`, using the repository `.venv/bin/python` (system Python lacked PyYAML; no dependency changes were needed).
- All relative skill documentation links resolve. Reviewed triggers, diagnostic versus implementation scope, existing backend context, protected content/storage contracts, and evidence-based completion rules.
- `npm run build` passed, including `tsc -b`. Vite emitted a non-blocking chunk-size advisory above 500 kB.
- `git diff --check` and whitespace checks for the new skill files passed.
- Both canonical banks are unchanged. Only skills, contributor documentation, and this tracker changed; application unit/browser/backend/content suites were not required for this documentation-only task.
- No UI metadata or helper scripts were added because these four concise instruction-only skills do not require them. Automatic selection remains enabled by default.
