# L6 — Local release candidate

Created: 2026-10-15 (Asia/Manila). Completed: 2026-10-15. Status: Steps 1–6 complete; local candidate accepted at `d54b8596a2199e8bc204d5f16927dae5c5af16d1`, with independently verified five-job CI. Public launch remains blocked by the ongoing browser, deployment and L4 retained-recovery obligations. The user authorized continuation after candidate CI passed.

Parent: [local-first production preparation](../ongoing/local-first-production-preparation.md#l6--local-release-candidate).
Predecessor: [L5 plan](../done/L5-resilience-and-local-operations-plan.md) and
[L5 handoff](../../L5-local-operations.md#l6-handoff).
Follow [work tracking](../README.md): implement one coherent step, record evidence
and limitations, then stop at its gate until continuation is authorized.

## Outcome and scope

Produce a reproducible, locally verified candidate and a provider-neutral
handoff that identifies exactly what remains before public deployment. L6 is
primarily integration verification, gap repair and operational documentation;
it does not introduce a new architecture or authorize cloud provisioning.

- The designated PostgreSQL database remains the only writable content authority.
  Repository JSON is an archive/fixture/read-only fallback, potentially stale.
  No publishing, content correction, ID allocation, routine migration, trusted
  import or authority replacement is implied by release verification.
- Preserve paired releases, stable IDs, exact text/order/formatting and answer
  provenance. Learner data stays in browser storage; use synthetic progress for
  tests. No runtime AI, accounts for learners, backend progress, extra workers,
  Redis, offline sync or historical-review feature.
- Run destructive, load, authoring, outage and recovery scenarios only against
  owned disposable fixtures. Do not stop the routine authority, revoke its grants,
  restore over it, or run the offline writable `verify-backup.py` rehearsal as a
  routine acceptance command. Its writer-retirement prerequisite is deliberate.
- Preserve the user-deferred off-device retention and Firefox acceptance decisions.
  They are pending obligations, not passes or permission to narrow browser support.
- A local candidate is not public-launch approval. Hosted identity integration,
  TLS/routing/pooling/suspend behavior, retained recovery and manual device gates
  require their own evidence. No provider suitability or price is reconfirmed by
  this plan; consult current official documentation when making that later decision.

## Step 1 — Accept L5 and establish the candidate baseline

- [x] Capture the L5 run URL, exact tested commit and all five job conclusions,
  including both native architectures and the changed recovery/helper/workflow
  inputs. Distinguish user-reported success from independently inspected evidence.
  `0761b6b` is an earlier baseline, not Step 5 acceptance. A failure belongs to L5
  and must be resolved before declaring this dependency closed.
- [x] Freeze a new sanitized L5 CI receipt, then complete/archive its tracker and
  supporting receipts together when its gates pass. Repair incoming links without
  rewriting historical results. Reconcile the parent's stale opening status with
  the detailed evidence; retain L4 archival/provider limitations explicitly.
- [x] Record candidate commit, worktree diff/input fingerprints, lockfiles,
  migration head, tool/browser versions, native platform and available Docker
  capabilities. Inventory existing advisories/skips and assign each a disposition.
  Do not treat a historical test count as an expected current count.
- [x] Establish an evidence ledger mapping each of the four parent L6 requirements
  to commands, reports and unresolved obligations. Reserve new evidence filenames;
  never overwrite L4/L5 frozen receipts. Exclude credentials, cookies, raw private
  drafts and personal progress from repository evidence.

Gate: L5 acceptance is traceable to its actual inputs, the baseline is identified,
and the remaining L6 work is explicit. Planning alone does not close this gate.

## Step 2 — Capture and validate the actual content candidate

- [x] Read the current published release identity through the authenticated editor
  or supported read-only operator path. Record publication sequence, release UUID,
  schema head and paired digests. Export that immutable release into a new protected
  local directory using the documented `export-release` command; validate and audit
  it with `validate-export` and `audit-export`. Use [local authoring](../../local-authoring.md)
  and [recovery policy](../../L4-authoritative-recovery.md), not repository JSON as
  a substitute. Identify any unpublished draft separately; never publish it just
  to produce a candidate.
- [x] Check the export manifest, full schema/relationships, rich-text/math safety,
  exact optional fields, ordered IDs/choices and source/verified answer provenance.
  Audit findings need a documented disposition; medical/content corrections remain
  a separate explicit canonical editing task. Keep the original export immutable.
- [x] Reconstruct the selected export in a disposable PG17 database through the
  reviewed fixture/import tooling, re-export and compare exact authored values,
  order, metadata, hashes and all learner API route contracts. If the existing
  archive-corpus harness cannot accept explicit paired export inputs, extend it
  narrowly with provenance/reporting and negative input checks; retain its archive
  CI mode. Never stage the fresh export by overwriting `src/content/*.generated.json`.
- [x] Separate full-authority recovery from paired content parity: an export is
  not a full backup of history, sessions, grants or allocation journals. L5's
  isolated recovery drills cover those mechanisms; they do not prove the live
  archive equals today's database or establish off-device RPO/RTO.
- [x] Recheck active release identity at handoff. If publication advanced during
  verification, retain evidence for the pinned candidate and explicitly decide
  whether to recapture/retest the newer release. A pinned export remains valid;
  do not silently describe it as the latest content.

Deliverable: `L6-step2-content-evidence.json`, with sanitized identities, commands,
comparisons and protected artifact references. Gate: the selected authoritative
release validates and round-trips exactly; failures remain open with no silent
normalization. Current content need not be copied into CI or committed to Git.

## Step 3 — Close local learner/editor acceptance gaps

- [x] Build fresh learner and HTTP admin assets sequentially. Review representative
  rich-content cases in both: Markdown lists/tables, allowed HTML, inline/display
  math, units/symbols, long choices, explanations and empty/optional fields. Select
  cases from the validated export plus synthetic hostile/edge fixtures. Verify
  sanitizer behavior, KaTeX assets, wrapping and no clipped actions without editing
  content to make it fit.
- [x] Exercise learner launch/resume/browse, scoring, retained results, flashcard
  checkpoints and progress replacement/recovery. Include publication while a tab
  is open, in-flight view preservation, revision conflict/reload, delayed restart,
  failed request/retry and cancellation. Reuse existing scenarios rather than
  duplicating all prior tests.
- [x] Exercise HTTP editor paired save versus publish, reserved IDs/import mapping,
  stale tabs, Undo/reset, retained activation/export, expired/stepped-up sessions,
  pending text and uncertain-write reconciliation. Use the isolated synthetic
  identity fixture; never infer real hosted MFA from its success.
- [x] Run the dedicated Chromium/WebKit progress-backup application suites against
  fresh assets. Preserve Firefox's explicit deferral unless the user reopens it;
  record its working-host command and missing evidence. Add repeatable CI coverage
  for accepted engines if absent, using isolated outputs/job sequencing. CI must
  use fixtures without access to the authoritative DB or private progress.
- [x] Verify narrow learner/admin layouts, enlarged text, reduced motion, keyboard
  navigation, focus and accessible status/error semantics. Use existing
  390/1048/1440px editor coverage and learner regressions as the baseline.
- [x] Track actual iOS Safari/Android Chrome file workflows, screen-reader usage
  and persisted BFCache/freeze-return observations in the existing
  [browser acceptance tracker](../ongoing/L0-browser-acceptance.md). Record devices/versions,
  actual observed navigation and evidence. Emulation and synthetic events do not
  close these cases. If equipment/user participation is unavailable, retain them
  explicitly as public-launch blockers; do not invent passes or repeatedly retry
  an already-deferred browser installation.

Gate: automated local workflows and available visual checks pass; uncovered manual
cases are individually identified as launch blockers. Any local correctness or
accessibility defect found is repaired in its owning module with focused regression
coverage and rerun checks. Scope expansion requires a separate decision.

## Step 4 — Prepare provider-neutral deployment inputs

- [x] Create `docs/L6-deployment-handoff.md` as the operational entry point, linking
  existing runbooks rather than copying whole procedures. Update contradictory
  current prose in architecture/product/testing/content docs (for example remaining
  claims that archive JSON is authoritative); preserve historical trackers.
- [x] Record reproducible learner/API image builds and immutable artifact identities,
  plus the separate optional HTTP admin build. Verify learner artifacts exclude
  admin code and production admin excludes fixture authoring/bundled banks. Document
  the actual supported serving path for admin assets; if a deployable admin artifact
  or serving recipe is missing, supply the smallest provider-neutral packaging gap.
- [x] Inventory every required environment setting and secret by name, purpose,
  consumer, build/runtime phase and rotation/recovery responsibility. Reuse
  `.env.example`, `backend/.env.example` and `ops/containers/.env.example`; examples
  contain placeholders only. Browser build variables must never contain secrets.
  Distinguish reader/session/editor/backup/migrator roles, identity keys and the
  external auth epoch; runtime must not receive owner credentials.
- [x] Document ordered bootstrap/explicit migrations, selected paired transfer,
  validation, export/full-backup and activation steps. Schema jobs run once as
  operator actions, not in each worker. State allocation-fence/journal admission
  and single-writer lineage prerequisites before hosted authoring; the local-only
  retention override must not become an implicit hosted recovery policy.
- [x] Specify stable public origin, same-origin private `/api` and callback routing,
  TLS/cookie/origin/CSRF requirements, cache separation, body/time limits, proxy
  trust and startup/health semantics. Keep one API process and the existing six-slot
  aggregate role-pool budget, plus separate jobs. Readiness during a later outage
  is not proof of current database connectivity.
- [x] Provide ordered smoke, failure diagnosis and rollback/roll-forward commands
  using existing scripts: learner read and revision, private denial/session,
  protected diagnostic, fixture authoring, progress restore and retained activation.
  Distinguish compatible app rollback, release activation and fresh-DB recovery;
  never suggest a schema downgrade or stale archive overwrite as a generic rollback.
- [x] Record the identity implementation gap accurately: the current runtime accepts
  only the explicitly enabled synthetic loopback adapter, which production refuses.
  Real provider adapter/configuration work and actual assurance/fresh-MFA acceptance
  remain pre-public-admin gates; this is more than a credential swap. Keep private
  admin disabled until those gates pass. Do not enable a bypass to make an example run.

Gate: another operator can identify/build the local artifacts and rehearse the
commands using disposable resources without cloud credentials. Unsupported hosted
capabilities remain explicit. No account, domain, database or deployment is created.

## Step 5 — Execute the complete candidate verification

- [x] Run `npm run verify:full` on the candidate and retain step-level results.
  This covers frontend checks/units, archive validation, policy packaging, ordinary
  backend checks, typecheck and learner/JSON-fixture admin browser/build checks.
  Backend PG skips and archive validation do not satisfy Step 2 or real-PG gates.
- [x] Run fresh native `scripts/containers/acceptance.py` on the available matching
  architecture. Its current stages include repeated clean builds, installed API,
  Compose/tools/schema, full PG, restart, twenty-launch smoke, concrete historical
  image rollback/recovery, PG/proxy learner and HTTP editor acceptance. Inspect its
  current command inventory before running; do not assume stage coverage from the
  runner name. Full native acceptance subsumes those same focused runs when it
  executes them successfully on the same inputs.
- [x] Run the dedicated accepted-engine backup suites and any new Step 2/3 checks
  absent from that runner. Follow [testing guidance](../../testing.md) and
  [container runbook](../../local-containers.md); builds/suites sharing `dist` must
  run sequentially. Focused `--keyword`, `--grep` and small-fixture trials never
  replace final complete gates.
- [x] Obtain passing candidate-input CI in `.github/workflows/checks.yml`: backend,
  frontend, browser and native AMD64/ARM64. Record commit, run/jobs and retained
  artifact identities. A local ARM64 pass or older L5 run cannot certify changed
  L6 inputs. Freeze final source/content fingerprints and compare installed modules.
- [x] Record every command, exit status, duration, platform, skip/advisory and
  fixture cleanup outcome. Preserve failures and later successful reruns. Rerun
  affected gates after fixes; after final acceptance, additional documentation-only
  evidence entries may reuse unchanged runtime checks with explicit input equality.

Gate: all required local automated checks and both native CI jobs pass for the
candidate inputs, with no unexplained skips or mismatched artifacts. An unavailable
runner is missing evidence, not success. No relaxed assertion hides a failure.

## Step 6 — Release-candidate decision and subsequent deployment gates

- [x] Audit each parent L6 requirement against the ledger and actual artifacts.
  State code commit, content release/digests, schema, image identities, tested modes
  and precisely which browser/device coverage exists. Apply the repository
  completion-audit workflow at implementation closeout.
- [x] Keep a deployment checklist with evidence owner and closure condition for:
  chosen host/PG17 region, quotas/budgets/alerts and measured Philippine latency;
  verified TLS and role/endpoint compatibility; actual pooling/suspend/wake;
  real identity adapter, MFA freshness, key rotation/logout/recovery; stable domain
  and origin-transfer backup UX; off-device retention/journals and retained restore;
  Firefox/manual mobile/assistive technology/persisted-return follow-ups; and final
  deployed routing/cache/secret/smoke acceptance. Recheck provider documentation at
  selection time; provisional Neon/API-host/OIDC choices are not commitments.
- [x] Distinguish “local candidate accepted, public launch blocked by listed gates”
  from an incomplete local candidate. Manual launch obligations may remain in their
  ongoing tracker; required local correctness/content/native checks may not be
  silently deferred. Parent L6 closure must explicitly preserve these limitations.
- [x] Update the parent, link the handoff and archive this plan with its frozen
  evidence only after local gates pass. Keep unfinished browser/deployment trackers
  ongoing and fix links. Do not mark public deployment complete or provision it.

Gate: an auditable local release decision and an actionable deployment handoff,
with no conflation of plan preparation, local acceptance and public launch.

## Planning validation — 2026-10-15

Inspected the parent/L5/browser trackers, L5 handoff, authority/recovery commands,
HTTP editor contract, testing guidance, package scripts and native CI runner.
This change adds the plan and links it from the parent only. Planning validation passed: `npm run build` (including TypeScript checking),
all nine local Markdown link targets, and `git diff --check`. Vite retains the
existing >500 kB chunk-size advisory. No L6 runtime acceptance is implied.

## Step 1 implementation — 2026-10-15

L5 acceptance is recorded in the [new frozen CI receipt](../done/L5-step5-native-ci-evidence.json): exact commit `7128a9737216867a9e64844d74b2891bbdf55d42`, all five jobs successful, including both native architectures. GitHub REST run/job/step metadata was independently inspected; artifact payloads were not downloaded. Artifacts expire 2026-10-29. Tested recovery/helper/workflow files match this checkout byte for byte. L5's tracker and nine supporting receipts were archived together; frozen JSON bytes and historical statements were preserved, and incoming Markdown links repaired. L4 remains ongoing; no archival, provider or off-device acceptance was inferred.

The [baseline receipt](L6-step1-baseline-evidence.json) identifies code, runtime/config file fingerprints, lockfiles, packaged migration head, local tools/browser registry, native Docker engine, advisories/skips and reserved evidence filenames. The checkout initially contained the user's parent-tracker link and untracked L6 plan; both were retained and updated for execution. Subsequent Step 1 changes are documentation/evidence only. Local Node 26 differs from CI Node 22; final candidate verification must retain that distinction. Browser registry availability does not constitute an application pass. The live authority and content candidate have not been inspected yet.

### Parent requirement evidence ledger

- **Complete verification and repeatable CI** — Step 5 owns `npm run verify:full`, fresh native `scripts/containers/acceptance.py`, dedicated accepted-engine backup suites, and new candidate-input five-job CI. Reserve `L6-step5-local-evidence.json` and `L6-step5-native-ci-evidence.json`; retain command exit/duration, scoped native reports, skips and fixture cleanup. L5's receipt establishes the dependency only. Final status: accepted by the local receipt and independently verified candidate CI receipt below.
- **Actual content parity and learner/editor acceptance** — Step 2 owns the supported read-only publication lookup, protected immutable `export-release`, `validate-export`, `audit-export` and explicit paired-input PG17 round-trip/route comparison. Reserve `L6-step2-content-evidence.json`. Step 3 owns fresh learner/HTTP admin builds, dedicated progress-backup Chromium/WebKit runs, existing learner/editor rich-content and workflow suites, and available visual checks; reserve `L6-step3-acceptance-evidence.json`. Step 2 is now accepted in [the content receipt](L6-step2-content-evidence.json), including authority release/digests, draft distinction and final publication recheck. Step 3 rendering/workflow acceptance is now locally accepted in [its receipt](L6-step3-acceptance-evidence.json); manual launch obligations remain in the browser tracker. Repository archive validation cannot close these gates.
- **Provider-neutral deployment inputs** — Step 4 owns `docs/L6-deployment-handoff.md`, fresh image identities/build commands, optional admin serving recipe, environment/secret inventory, explicit schema/transfer/recovery sequence and smoke/rollback commands. Reserve `L6-step4-deployment-evidence.json`; exact recipes must follow current runbooks and use disposable resources. Final status: Step 4 accepted; handoff and final checklist linked below.
- **Outstanding deployment acceptance** — Steps 4/6 own named evidence owners and closure conditions for provider/region/latency/budgets, TLS/routing/pooling/suspend, real identity adapter/MFA/rotation, domain/origin transfer and off-device retention/journals/restore. [Browser acceptance](../ongoing/L0-browser-acceptance.md) retains Firefox and actual mobile/assistive-technology/persisted-return gaps. Reserve `L6-final-decision-evidence.json`. All remain public-launch obligations; no cloud provisioning or identity bypass is authorized.

Validation: `npm run build` passed TypeScript and production bundling, retaining the existing >500 kB chunk advisory. All 81 local Markdown paths in affected documents resolve; the repository-wide scan also found four pre-existing unrelated missing targets (one illustrative content image and three historical tracker links), recorded in the baseline receipt. Runtime/config fingerprints and archived receipt hashes match; `git diff --check` passed. Completion audit: no blocking Step 1 findings. Stop after the Step 1 gate per the agreed work-tracking sequence; Step 2 requires continuation. This does not accept the overall L6 candidate.

## Step 2 implementation and acceptance — 2026-10-15

The supported operator path read the designated authority in a repeatable-read, read-only transaction. It selected published release `3e3604bf-dedf-470e-adf6-4dccc1bab5f9`, publication sequence **3**, schema `0006_allocation_fence`. Draft revision **5** matches the published pair; no unpublished content was promoted. A new protected export is retained under ignored `var/backups/postgres/l6-candidate-20261015T055606Z/export/`. The documented `export-release`, `validate-export` and `audit-export` commands passed. The export contains 11,687 questions with rationales, 177 with sources, 121 marked AI-draft-reviewed, and 32 carrying answer-review notes. Independent warning categorization found exactly 32 answer-review warnings and zero other warnings/errors. These are retained editorial obligations, not newly verified medical answers. Two verified answers differ from original source keys; both fields remain exact.

`verify-postgres-release.py --export-directory` now pins/validates an explicit operator export, imports it only into an owned disposable PG17 tmpfs fixture, checks exact reconstructed fields/order/optional presence/paired bytes and every learner route, and re-exports matching paired digests. It distinguishes source release/publication identity from fixture identity and bypasses the unrelated full-authority recovery workflow. It rejects mixed modes, malformed/unpublished/missing inputs, export mutation, changed verification source and reports that would overwrite evidence or the immutable export. No archive fallback supplies missing selected inputs. Synthetic admission tests are wired into native acceptance; private content and authority credentials are never CI inputs.

Development evidence: the initial whole selected pair passed parity and cleanup in 131.63s. A subsequent run overlapped harness edits and was rejected (exit 1, 153.95s); it is not final acceptance. Negative tests first exposed an unnecessary Docker cleanup lookup before fixture creation; that was fixed. A follow-up assertion was corrected to match the harness's sanitized outer error. The latest combined export/admission suite passed **26 tests** in 24.96s; the final dedicated admission run passed **13 tests** in 17.02s. Ruff for all container helpers and learner build/typecheck pass (existing chunk advisory). The settled-input results and final publication recheck below close this stage.

Final local gate: **pass**. The complete selected authoritative pair round-tripped through disposable PG17 on Linux ARM64: **13 subjects, 111 quizzes, 11,687 questions, 98 decks, 1,712 cards; all 348 learner routes** matched, including ETag/304/409 behavior. Exact optional presence, text/choice order, answer provenance, serialized paired artifacts and re-export revisions/hashes match. The settled command passed in **84.44s**, including cleanup (internal verification 82.32s). The preserved small archive/recovery mode passed in **14.18s**, including cleanup; this regression is not full archive-corpus/native acceptance. Both fixture cleanups passed and an independent Docker label check found no remaining release-verification containers.

At 2026-10-15 14:35:24 Asia/Manila the authority still selected the same release/sequence/digests/schema, with draft revision 5 unchanged and matching the published pair. The pinned export remains current at this observation. The [frozen content receipt](L6-step2-content-evidence.json) records source/fixture identities separately, command outcomes (including development failures), private report/export references and SHA-256 fingerprints. The original export and repository JSON remain unchanged. No routine writes, publication, ID allocation, grant changes or authority recovery occurred.

Completion audit: **no blocking Step 2 findings**. Ruff over all container helpers, combined 26-test export/admission suite, final 13-test dedicated admission suite, build/typecheck, affected local links and diff/integrity checks pass. Existing chunk advisory and 32 editorial answer-review obligations remain. The new synthetic admission stage is wired into native acceptance; fresh full archive/native AMD64/ARM64 candidate execution belongs to Step 5 and is still pending. This stage establishes paired content parity only; full-authority retained/off-device recovery, browser rendering, manual devices and hosted acceptance remain separate. Parent L6 checkboxes stay open. Step 3 learner/editor acceptance is next, following the agreed continuation gate.

## Step 3 implementation and local acceptance — 2026-10-15

Reusing the complete learner suite, dedicated Chromium/WebKit progress-backup suite and complete installed-API/PG17/Nginx HTTP editor suite. New content acceptance exercises synthetic lists/tables, allowed HTML, inline/display math and local fonts, units, long choices, explanations, optional fields and hostile markup at 390/1048/1440px with enlarged text/reduced motion. The same tests can read explicitly selected immutable question records from the protected Step 2 export; private rows/screenshots stay outside Git and ordinary CI uses synthetic cases only. The HTTP editor intentionally displays JSON, so acceptance checks exact authored values and safe text display without adding a rendered preview. No content is saved by these read-only display checks.

CI gap repair: the existing browser-smoke job now installs WebKit alongside Chromium and runs the dedicated backup suite sequentially after learner tests, using isolated outputs and a retained report/traces. Firefox remains user-deferred; no installation or acceptance retry is implied. Actual mobile, screen-reader and persisted-return observations remain public-launch obligations.

Development trial: a test initially used an incorrect exit-button name (the product exposes “Leave answer browser”); corrected to the existing accessible name. The temporary command wrapper also placed logs beneath Playwright's cleaned output directory; moved command evidence outside that directory and preserved failure traces. These are test/harness findings, not product passes or product regressions. Fresh learner build passed; complete application checks and visual inspection remain in progress.

Final Step 3 local gate: **pass**, with explicit public-launch obligations. The complete learner suite passed **43 tests** (77.88s command wall time); the dedicated progress-backup suite passed **50 Chromium/WebKit tests** (104.56s), with zero skips/retries/flaky cases. The complete installed-API/PG17/Nginx HTTP editor suite passed **18 tests** (126.28s). Private display checks passed **6 cases in each learner/editor context** (two synthetic plus four unchanged records from the pinned Step 2 export), in 19.83s and 26.97s respectively. Selected records retain original IDs, text, numbers, order, optional presence and answer provenance; interception supplies read-only browser fixtures and performs no authoring writes. Step 2 remains the separate full-content/database parity evidence.

The first full learner run preserved **42 passes and one failure**: a pre-existing progress-backup scenario opened the utility before a newly asynchronous browse launch finished. The fixture now waits for the admitted browse view before testing cancel; pending-launch cancellation remains separately asserted. After this test-only correction, full learner and both backup engine suites passed. No application runtime changes were needed. Rich renderer/policy units passed **9 tests**. Typecheck, learner and fresh HTTP admin builds, lint/architecture, format, workflow parsing, affected links and diff checks pass. The native ARM64 API image is `sha256:02b79878958ffa95ffd3ec9a9fca8663a0e9918f9cd3136f3ccf1cd3eb0c855d`.

Visual inspection covered synthetic rich content at 390/1440px, real export content at 390px, and synthetic/real HTTP editor JSON at 390px plus desktop editor layout. Automated assertions cover 390/1048/1440px, 20px root text, reduced motion, focus and reachable Done/Save actions. Tables scroll within their bounded region, long choices wrap, explanations/pearls and inline/display math render, local KaTeX fonts load, and hostile markup does not execute. Authenticated functional editor scenarios cover paired save versus publish, reservations/imports, stale tabs/reset/Undo, expiry/step-up, pending text, uncertain writes, retained activation/export and publication while study/review is open. Protected diagnostic/log canaries also pass. Synthetic identity does not establish real hosted MFA. Both HTTP fixture runs cleaned up; independent Docker listing found no editor fixture containers/networks.

[The frozen receipt](L6-step3-acceptance-evidence.json) records command outcomes, input/image/report fingerprints, selected-record hashes and visual/automation scope without raw private content or progress. Original export and previous receipts are unchanged. Public-launch blockers remain individually tracked in [browser acceptance](../ongoing/L0-browser-acceptance.md#l6-accepted-engine-refresh--2026-10-15): Firefox remains user-deferred; actual iOS/Android file workflows, actual screen-reader sessions, and persisted BFCache/freeze-return are unobserved. Chromium/WebKit back navigation observed `[false,false]` fresh-load paths only. New accepted-engine CI coverage is wired but **not yet certified by candidate-input CI**; Step 5 owns that full native/five-job gate.

Completion audit: **no blocking local Step 3 findings**. No full candidate/public-launch acceptance is implied. Parent L6 requirements remain open for Steps 4–6. Step 4 provider-neutral deployment inputs is next, after continuation at this agreed stage gate.

## Step 4 implementation and local acceptance — 2026-10-15

Prepared [the provider-neutral handoff](../../L6-deployment-handoff.md): build/serve recipes, complete environment/secret consumers and ownership, explicit bootstrap/schema/selected-pair transfer/recovery order, stable-origin/private routing/cache/body/pool/health policy, ordered smoke/diagnosis and three distinct rollback mechanisms. Production identity adapter/MFA and hosted role bootstrap remain implementation/acceptance gaps; disabled production admin and `bootstrap-local` production refusal are preserved. No provider account, domain or hosted resources are provisioned. Current JSON-authority/schema/cutover prose is reconciled in architecture/product/testing/content/API docs; historical trackers/receipts stay unchanged.

Packaging gap repair: the root Dockerfile retains `learner` as its default final target and adds an explicit optional `admin` target. Build-time audits require HTTP/popup entries and reject fixture authoring, QA and bundled banks; audits live outside the public root and hidden maps/manifests are removed. Generated admin routing changes only the explicit entry to no-store, preserving the shared private/public proxy limits. New real static smoke checks asset hashes/cache/private-denial behavior; the full HTTP fixture can consume packaged admin assets. Native acceptance now builds/checks this image and runs the complete HTTP suite against it. No private API bypass or provider integration is added.

Development checks: all three initial image builds and API smoke passed. The container browser config's broad `test-results-containers` cleanup erased the temporary Step 4 logs (and prior ephemeral synthetic test outputs), causing the wrapper's evidence write to fail. Frozen repository receipts and protected private exports/screenshots are unchanged. Container learner traces now use a `learner/` subdirectory; retained Step 4 evidence is outside all Playwright outputs. A sentinel and rerun verify the repair. Final packaging/browser/quality checks remain in progress; no pass is inferred from missing initial logs.

Final Step 4 local gate: **pass**. [The handoff](../../L6-deployment-handoff.md) links procedures and records exact artifact IDs, 30 model-backed environment settings plus public build/local runner inputs, secret rotation/recovery ownership, target role-bootstrap and real identity gaps, and ordered smoke/rollback/restore/admission. Default learner production behavior remains unchanged; the optional admin target has audited HTTP/popup entries, no fixture editor or bundled banks, real no-store entry serving and unchanged protected API denial. Source maps/manifests/audit metadata are not publicly served.

The retained rerun passed API smoke, all **six learner proxy groups**, **43 container learner browser cases** and **18 full packaged HTTP editor cases**, plus **eight artifact/routing contract tests** and the new optional static smoke (103 asset hashes, cache/private-denial/runtime checks). The JSON learner mode explicitly skips its PG-only source-switch test; final PG/native acceptance still owns that case. Default learner audit: 735 modules and no admin/QA/bank modules. Optional admin audit: 862 modules and no fixture-authoring/QA/bank modules. Builds use pinned inputs on native Linux ARM64; current API/learner/admin immutable local IDs are in the [frozen receipt](L6-step4-deployment-evidence.json). Cached rebuilds and local ARM64 do not replace Step 5's repeated no-cache builds and both native CI jobs.

Development failures are retained, not counted as passes. After output isolation repair, the new static test's wrong `detail.code` expectation was corrected to the existing private `error.code` contract. The first packaged HTTP run passed 17 cases and failed the deliberately held import-save case while a post-commit read probe remained pending; trace showed a 200 save receipt with the expected new pair. The test now waits for that response before its read, then retains exact stored-pair and newer-editor-text assertions. The complete rerun passed 18 cases. No application/backend/domain/content changes or relaxed timeouts/assertions were needed.

Ruff, lint/architecture, format, host build/typecheck, artifact contracts, environment-name inventory, affected link/section anchors and diff/integrity checks pass. An independent Docker listing found no smoke containers/networks. All previous repository receipts and protected selected export remain unchanged. Prior raw synthetic test directories were ephemeral and the initial broad container-output cleanup removed them; protected private export/screenshots and frozen receipt JSON were preserved. New learner traces are scoped under `test-results-containers/learner/`, and Step 4 retained logs/reports are outside all Playwright cleanup paths.

Completion audit: **no blocking local Step 4 findings**. Public launch remains blocked by the listed hosted bootstrap/TLS/routing/pooling/suspend/region/latency/budget, production identity/MFA, off-device retained recovery and Firefox/manual-device/reader/persisted-return gates. No cloud account/domain/database/deployment was created and the routine authority was not read or written during Step 4. Step 5 complete candidate verification is next, after continuation at this agreed gate.

## Step 5 execution — 2026-10-15

Verification started from clean commit `7046c4b9e2df1a2e52c131d66770239fbddb59c3`. Protected command logs, per-step timings, initial/final input fingerprints and disposable fixture reports are retained under `var/backups/postgres/l6-step5-20261015T073009Z/`, outside Playwright cleanup paths. The selected Step 2 export remains immutable. No routine authority recovery or writes are part of these checks.

Two full-run failures are retained. Attempt 1 passed all 605 application units but Vitest discovered the new Node-runner artifact contract file and failed with no Vitest suite; its `.test.mjs` pattern is now excluded from Vitest while native acceptance retains the explicit eight-test Node stage. Attempt 2 passed 604 units but the backup-availability flashcard unit exhausted its default one-second query while lazily importing the study screen. That test now explicitly awaits the presentation module before admission; its assertions/timeouts are unchanged, and fresh browser suites retain lazy-loading acceptance. Attempt 3 passed all 605 application units, archive validation, policy packaging, backend Ruff/mypy and ordinary backend tests (238 passed, 186 PG skips; two deliberate weak-key negative-test warnings). Remaining full/native/browser checks are in progress.

Public GitHub REST reports no Actions run for `7046c4b`; its latest success remains L5 commit `7128a97`, run `38686411130`. The test/config fixes also require candidate-input CI. No L6 CI pass is inferred, and Step 5 remains open until all local and five-job CI requirements pass.

Full verification attempt 3 passed all 14 stages, including 605 units, 43 learner browser cases and 12 JSON-fixture admin cases. Native ARM64 acceptance has passed two pull/no-cache image builds and both installed API/learner proxy rounds, installed authoring policy, Compose, PostgreSQL tools/toolchain, 184 real-PG cases (two restart-only skips), the separate 18-case restart-enabled suite, five load-harness contracts, 13 export-input contracts and the twenty-launch load smoke. Historical rollback-image build passed; archive recovery and remaining browser/editor stages are still in progress. These interim results do not close Step 5.

Final local Step 5 outcome: **all automated local gates pass; Step 5 remains incomplete pending candidate-input CI**. The [local receipt](L6-step5-local-evidence.json) preserves both failed full-run attempts, the successful third attempt, per-stage commands/exit codes/durations, native image identities, exact input equality and protected report fingerprints. The fresh native run passed all **23 stages** (2,262.43s summed command time), including full archive recovery (867.89s internal / 884.89s wrapper), installed current/prior module equality to their Git revisions (47/45 Python/SQL files), **44 PG/proxy learner browser cases** without skips and **18 packaged HTTP editor cases**. Both native clean builds used `--pull --no-cache`; their differing image IDs are recorded without a byte-identical output claim.

Additional fresh learner build and dedicated accepted-engine checks passed **50 Chromium/WebKit backup cases**, with zero skips/retries/flaky results, plus **six selected/synthetic learner display cases**, complete pinned-export PG17 parity/re-export/learner route contracts, and **six selected/synthetic packaged HTTP editor display cases**. The paired export, archives, 469 tracked non-document inputs and all previous frozen receipts remain unchanged from their applicable snapshots. New source/test fixes are explicitly fingerprinted on top of `7046c4b`. An independent read-only Docker names audit found no fixture containers, networks or volumes; fixture reports also record successful scoped cleanup. The routine authority was neither read nor written during Step 5; its latest observation remains the Step 2 handoff.

Advisories retain their disposition: existing Vite chunk size; deliberate weak-key auth negative tests; SQLAlchemy `Result.tuples()` deprecations; build-stage pip root warning (runtime remains non-root); Playwright color-environment warning; Vitest environment performance suggestion; and 32 unchanged editorial review notes. Ordinary backend PG skips and the two full-PG restart-only skips are covered by their separate native gates. Firefox/manual mobile/screen-reader/persisted-return and hosted/public-launch obligations remain open.

The final public GitHub REST recheck still found **zero runs for `7046c4b`**; the latest observed success is the earlier L5 run. The two tested verification fixes must be included in the commit pushed for Checks. Passing backend, frontend, browser-smoke, native AMD64 and native ARM64 jobs on those exact inputs and retained artifact metadata are still required. No CI receipt is fabricated, no commit/push was performed, and Step 6 has not started. Documentation-only closeout reuses the passing runtime gates under explicit unchanged input equality.

Completion audit: **no blocking local Step 5 findings**. Final JSON parsing, 93 relative Markdown targets, `git diff --check`, equality of 469 tracked non-document inputs to the passing run and all 50 prior frozen receipt hashes pass. The remaining in-scope blocker is candidate-input five-job CI; Step 5 is not marked complete and Step 6 is not started.

## Steps 5–6 final acceptance — 2026-10-15

The user supplied passing [Checks run 38706549031](https://github.com/mfranco1/meducation/actions/runs/38706549031) and authorized continuation. Independent public GitHub REST inspection confirms commit `d54b8596a2199e8bc204d5f16927dae5c5af16d1`, attempt 1, completed successfully at 16:53:25 Asia/Manila. All five jobs passed: backend, frontend, browser-smoke, Containers (amd64) and Containers (arm64). Both native acceptance and artifact-upload steps passed; browser accepted-engine backup execution/upload passed. The only skipped job step is the intentionally failure-only browser trace upload. The [new CI receipt](L6-step5-native-ci-evidence.json) freezes job/step conclusions and three artifact IDs, SHA-256 digests and expiration dates (2026-10-29). Artifact payloads were not downloaded; no CI per-platform image digest is invented.

All 469 tracked non-document inputs match both the passing local Step 5 manifest and the CI commit, including its two verification fixes. All 68 retained local Step 5 artifacts and the three protected export files were rehashed successfully. The installed API's 47 Python/SQL source files match both the locally tested `7046c4b` tree and `d54b859`; the local receipt retains installed current/prior image identities and module fingerprints. Both native CI jobs independently executed the source-comparison recovery assertions. This documentation-only closeout reuses those exact runtime gates; it does not rerun expensive unaffected fixtures. A fresh build/typecheck and documentation/evidence checks verify the closeout itself.

Final decision: **local candidate accepted; public launch blocked by listed gates**. The [final decision receipt](L6-final-decision-evidence.json) maps all four parent requirements to actual receipts, source/content/schema/images, build modes and observed browser coverage. The selected content remains release `3e3604bf-dedf-470e-adf6-4dccc1bab5f9`, sequence 3, schema `0006_allocation_fence`; both serialized file hashes and semantic revision digests are recorded separately. Latest authority observation remains Step 2; this closeout accepts that immutable pinned release and does not assert a fresh live publication lookup. No authority reads/writes, content changes, allocation, publication or cloud provisioning occurred here.

The [ongoing deployment checklist](../ongoing/L6-public-deployment-acceptance.md) assigns owners and concrete closure conditions for region/PG17/TLS/roles, latency/quotas/budgets, pooling/suspend, production identity/MFA/rotation/logout/recovery, stable domain/origin transfer, retained off-device recovery/journals, browser/device/reader/persisted-return and final deployed routing/cache/secrets/smoke. Firefox and off-device retention remain user-deferred obligations. Actual mobile file workflows, screen-reader use and persisted return remain unobserved. Local desktop automation, synthetic identity and disposable recovery do not close those gates. The parent remains ongoing for its explicit L4 archival/recovery obligations; L6 and its receipts move together to done. Historical pending statements above describe their original observation times.

Final closeout checks: fresh `npm run build` passed TypeScript and production bundling (existing >500 kB chunk advisory); all 125 affected relative Markdown paths/anchors and all tracker JSON parse; `git diff --check` passes. All 469 source/config fingerprints and 51 prior frozen JSON receipt hashes are unchanged, including moved L6 snapshots. Completion audit: **no blocking local findings**. The deployment checklist and public-launch limitations above remain open.
