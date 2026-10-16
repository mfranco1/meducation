# Paired authoring content-policy boundary

Current content-source policy: [ADR 0006](decisions/0006-postgres-only-content.md) retires JSON runtime/read fallback and file-authoring workflows. Older cutover design statements below are historical; retained exports and recovery imports never select a runtime source.

Current status: local PostgreSQL authority cutover is user-approved. See the
[local authority runbook](local-authoring.md). Authority statements in the original
design-stage snapshot below describe the pre-cutover stage.

Implemented for [L4 Step 2](work/ongoing/L4-local-authoring-admin-access-plan.md#step-2--implement-server-content-policy-validation).
Canonical JSON remains authoritative. Internal paired preview/save/authored-publish
services are implemented. The local [Step 3 session boundary](L4-admin-session-boundary.md)
is available; private content HTTP integration remains Step 4 work.

## Selected parser and packaging

Use the existing unified/remark-parse/GFM/remark-math currency policy and KaTeX
render validation in a self-contained Node 22 worker. The Python service performs
strict bounded JSON and Pydantic stored-contract validation first, then invokes
the packaged worker through stdin. It does not invoke tsx, a repository CLI or
require a checkout/node_modules at request time. No parser fetches URLs or calls
an LLM. Python 3.14 wheel resources contain the built worker and shared limits.

Raw HTML now uses parse5 8.0.1 token callbacks, including decoded attributes,
duplicate/malformed attribute errors and table/inline fragments. Tokenization
checks authored tokens before HTML tree repair can discard them. This uses the
narrow exported `Tokenizer` adapter (labelled internal upstream); keep its version
pinned and run the shared fixtures when upgrading. The implementation replaces
HTML-tag/attribute regex parsing, preserving accepted source text. Parser selection
follows [parse5 documentation](https://parse5.js.org/) and its
[tokenizer source](https://github.com/inikulin/parse5/blob/master/packages/parse5/lib/tokenizer/index.ts).
[esbuild's Node bundling API](https://esbuild.github.io/api/#platform) packages the
same code rather than maintaining a second Python Markdown/math implementation.

Choice text, choice explanations, pearls and sources use restricted Markdown:
raw HTML and images are rejected and math remains literal. Stems, rationales and
card faces use rich policy. Reference links/images receive the same URL checks as
inline links/images. HTML dimensions must be positive values of at most four
digits; raw input is allowed only for disabled checkbox markup. KaTeX expansion
is bounded to 1,000 and size to 10; trusted extensions (HTML/URLs/external resources)
are rejected. Unmatched dollar delimiters remain literal under the existing policy.
Malformed HTML tokens fail; HTML5 implicit closing/fragment semantics remain valid.

Image URLs use exact configured HTTPS origins or app-local paths. Backslashes
and control characters cannot turn local paths into external origins. Configure
`PairedContentValidator(image_origins=...)` from trusted backend settings when
wiring routes; requests cannot select their own origins. `save_draft` can receive
that configured validator; its safe default permits local images only. The worker
receives only that origin configuration, with no inherited backend credentials.

The clean build exposed vulnerable nested KaTeX versions and source-map-js.
Focused overrides select the app's patched KaTeX and source-map-js 1.2.2. See the
[KaTeX advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7) and
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Dependency and rendering checks below are required for these changes.

## Admission and failure behavior

`src/content/validation/authoringLimits.json` owns shared limits. The build copies
it to the Python wheel; do not hand-edit generated resources.

- Request/candidate pair: 64 MiB UTF-8, checked before JSON parsing. HTTP reading
  checks declared length and each chunk, rejects compressed bodies (415) and
  times out incomplete uploads after 30 seconds. JSON syntax parsing runs in a
  thread pool so an admin parse does not block the learner event loop.
- Depth: 32 from the root value; arrays: 32,768 entries; object fields: 64;
  individual strings/keys: 65,536 UTF-8 bytes; total visited values and keys:
  1,000,000. Reject explicit null, unknown fields, duplicate/dangerous keys,
  non-finite numbers, invalid UTF-8, lone surrogates and NUL text before SQL.
- Policy worker: 120-second deadline, 512 MiB V8 old-space ceiling, at most two
  admitted validations per API process; at most two body readers/parsers per
  process. This is a heap/concurrency limit, not a bound on total process RSS.
  L5 still owns aggregate memory/load tuning. Saturation, missing resources/Node,
  worker failure/timeout or invalid result fail closed with safe 503 codes.
- Diagnostics: at most 200 errors with exact known field/array paths, total count
  and truncation flag. Root-level stored relationship errors identify the bank.
  Dynamic authored values, unknown keys, source text and parser exception details
  are never echoed. Warning count remains separate from rejection; previews can
  inspect the already-held candidate to show review notes.

`read_json_body(request)` must run after authorization and before any FastAPI
body-model parsing. Use a credentialed route dependency and explicit content-policy
error mapping (including the route's request ID); never expose a test-only endpoint
as a production validation API. Offload synchronous `validate` to the thread pool
from async routes. The validator captures a private pair before worker execution
and serializes that captured input, preserving all strings, order, optional
presence and source/verified answers without Pydantic defaults.

The current `save_draft` primitive now validates rich content before executing its
SQL call. Its operator-facing wrapper maps policy errors to safe database errors;
HTTP services should retain `ContentPolicyError` diagnostics. Internal
`admin/authoring.py` uses the same validator for candidate and publication preview
and fresh save/publish validation. Immutable previews bind exact paired artifacts,
policy version, actor, reason, reservations and draft/publication context. Validation
runs before the write transaction; SQL locks and compares current context and exact
captured artifacts before committing. Replay of a completed operation returns its
original immutable outcome without moving the pointer again.

Migration `0002_authored_publish` adds reviewed save and authored publication
transactions, append-only authored receipts and distinct release identities even
when content digests repeat. Trusted file imports still reuse the earliest matching
release and retain their own provenance. Reviewed creates require owned reservations;
ordinary save cannot resurrect deleted materialized IDs. Publish atomically finalizes
both banks, writes authored/publication/audit outcomes, moves the active pointer and
advances the draft base/revision. No file-import provenance is invented.

Only the existing trusted operator role can call these primitives; no browser-facing
route or editor role is enabled. Actors here are explicit trusted operator/test
context, not verified sessions. The local Step 3 authentication/CSRF/synthetic-assurance boundary is implemented;
Step 4 HTTP integration remains required, including durable Undo/reset, creation-intent binding
and bounded exports. Trusted importer and reconstruction operations retain their
separate operator contract.

The actual nginx `/api/admin/` location enforces 64 MiB, streams requests and uses
155-second read/35-second send timeouts for bounded validation. Learner routes
retain ten-second proxy timeouts. The disposable smoke uses the real configuration
with a test-only mounted app, proving transport limits without shipping a private
unauthenticated route.

## Measured corpus and reproducible checks

Measured on 2026-10-14: quiz artifact 16,456,246 bytes and flashcard artifact
653,579 bytes; 11,687 questions and 1,712 cards. Maximum strings are 5,848/747
bytes; maximum depths are 5/3 and value-only node counts are 223,489/9,054.
A synthetic save envelope containing the actual pair, a 2,000-character reason
and 10,000 UUID-sized reservation entries measures 14,687,661 bytes compact UTF-8
and 18,902,378 bytes with ASCII escaping/pretty indentation, both below 64 MiB.
The actual HTTP pair is an object envelope, avoiding double-escaped document
strings. Existing artifacts plus a release manifest fit within the provisional
128 MiB export ceiling; Step 4 must enforce that ceiling when implementing exports.
Actual-bank validation accepts both with their 32 existing answer-review warnings
and returns exact original artifact hashes. Timing is recorded in the tracker,
not a production capacity promise.

Build local resources after `npm ci` and before backend tests or authoring jobs:

```sh
npm run build:content-policy
npm test -- src/content/validation/pairedAuthoringValidation.test.ts
.venv/bin/python -m pytest backend/tests/test_authoring_policy.py -q
.venv/bin/python scripts/containers/test-postgres-content.py
```

The shared fixture in `tests/fixtures/paired-authoring-cases.json` covers omitted/
null fields, Unicode, duplicate/invalid JSON, dangerous keys, unsafe HTML/URLs/math,
image policy, answer references, empty descendants and coordinated deletes/moves.
Backend tests cover paths, immutable artifacts, bounded diagnostics, slot release,
worker outage/timeout, trusted origins and HTTP streamed body admission. Real PG17
checks show rejected preview/save/publication inputs leave draft, publication,
releases, normalized rows, audit, operation ledger and reservations unchanged while
independently reserved IDs remain burned. They also exercise original-result replay,
stale context, ownership, exact artifact reconstruction, concurrent save/publish and
rollback at finalization, authored/publication receipts, draft, audit and commit.
An upgrade from populated `0001_content` preserves existing content and ledgers.

```sh
docker build -f backend/Dockerfile -t meducation-api:l4-step2 .
.venv/bin/python scripts/containers/smoke-authoring-policy.py --image meducation-api:l4-step2 --report /private/tmp/l4-policy.json
npm run verify:full
```

The smoke runs the installed wheel/Node 22 through actual nginx, accepts an exact
64 MiB chunked body, rejects one byte more and checks read-only actual-bank
acceptance. It uses unique disposable containers/network and a loopback host port;
no database volume, routine service, canonical files or hosted configuration is
modified. Native container CI invokes this smoke; new AMD64/ARM64 results remain
pending until the changed code is committed and CI runs.
