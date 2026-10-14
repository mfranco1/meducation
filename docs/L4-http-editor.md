# L4 HTTP editor

The optional production admin entry selects the HTTP editor by default. It loads
session status, then one raw paired draft, asynchronously. Private content has no
bundled-bank fallback. A disabled identity service, uninitialized draft or network
failure produces a retry/sign-in state. Sign-in opens a completion window and
retains the original mounted editor. Production provider acceptance remains
pending: the current backend accepts only explicitly enabled synthetic loopback
identity. This is local preparation, not a hosted release or authority cutover.

`VITE_ADMIN_SOURCE=http npm run dev` selects HTTP mode during development. Its
same-origin `/api` proxy must reach the explicitly configured local API; configure
that API's exact admin Origin to match the frontend origin. Session/editor
credentials and identity keys stay in backend configuration. No credential, token,
private draft or browser editor text is put in learner progress storage.

The JSON editor remains an isolated development/fixture adapter. Vite development
selects HTTP by default. JSON fixtures require both `VITE_ADMIN_SOURCE=json` and
`VITE_JSON_FIXTURE_AUTHORING=true` on the development server. Production builds
always use HTTP authoring and omit this adapter and both bundled banks, even if
those fixture variables are set. Normal learner builds omit admin modules. A
source selection requires restarting; there is no writable-mode switch or
automatic fallback. See [local authoring](local-authoring.md).

## Editing and paired history

Existing quiz record/add/import and flashcard record/add/import panels retain
browsing, ordered operations, bounded diagnostics, shared-subject cascade review
and mounted text across section switches. In HTTP mode, **Save draft** writes one
paired server revision; saving does not publish. Server confirmations show captured
revision/publication, reason and affected IDs/counts. The shared header reports
**Saved draft · unpublished** or **Published** from the paired content identities.
Changing reason/text invalidates reviews. Backend validation and expected context
remain mandatory regardless of browser validation or cached capabilities.

New records receive owned server reservations before the private save preview.
Allocation groups slots by kind/destination, in parent-before-child order.
Migration `0005_reserved_parents` permits a child destination that is either an
existing parent or an owned parent reservation from the same revision/publication
context. Both parents and descendants materialize in one paired save. Established
records retain their IDs. Reservations remain burned after cancellation, rejected
validation, logout or an abandoned preview.

Valid legacy import creates are explicitly converted: new-record IDs and structural
parent/order references are replaced with server reservations before server
re-preview and save confirmation. Existing-record IDs, stems, choices, sparse
fields, source/verified answers and exact authored text remain unchanged. The
confirmation exposes the resulting reserved IDs; imported IDs are never accepted
as allocation proof. Invalid schema or unsupported identifier spellings are rejected
before allocation. Imports whose base content/context is stale fail and require
review again. A paired import adopts the actual returned server banks rather than
retaining its former temporary IDs.

**Undo saved batch** and **Reset paired draft** operate on server history/current
publication and show both-bank context in confirmation. Per-section local history
buttons are disabled in HTTP mode. Undo advances revision without publication;
reset retains displaced saved content and starts a new Undo epoch. Unsaved editor
text remains available after these actions for explicit review. Shared-subject
cascades still require the hidden section's discard decision before committing;
publication/activation review requires saving or explicitly discarding unsaved
text in both sections. There is no automatic merge.

## Sessions and uncertain outcomes

The client bounds each complete request/body read to three minutes and attempts
each protected write once with a fresh operation UUID. It
never generically retries or resends after authentication. Expiry, conflict,
network failure and logout retain text. CSRF/session refresh invalidates previews;
a renewed save/publication requires renewed review and confirmation. Same-origin
completion messages must come from the specific sign-in window; canceled step-up
cannot upgrade freshness or submit a pending mutation. Protocol optional fields
are omitted; explicit nulls are rejected instead of silently normalizing commands.
SQL mutations recheck session expiry/freshness after their writes and before
finalizing the receipt, so expiry at that boundary rolls back the complete pair.

An uncertain write exposes **Reconcile operation**. While the request is still in
flight, reconciliation and another protected write are blocked. An owned committed
receipt clears uncertainty and explicit refresh loads current context while
keeping unsaved text. Not-found permits a new review; a 401/network failure leaves
the uncertain receipt intact. Neither result sends a replacement mutation.
Another tab's changes are detected by server revision/publication preconditions.
**Refresh draft context** updates saved metadata/content and retains local text
for deliberate re-preview rather than overwriting it or replaying its edits.

## Publication and exports

Publication and retained-release activation use captured server previews and a
confirmation dialog with reason, context and bounded affected content. Both
require fresh authentication. Visibility follows the configured PostgreSQL reader;
a fixture publication does not replace the designated authority or an explicit JSON archive reader. Activation preserves the draft; a stale base requires
explicit reset before a future publication. Retained metadata pages have a bounded
page size and explicit next-page control.

**Export paired ZIP** selects the current saved draft when no retained release is
selected, or that retained finalized release. A draft ZIP is explicitly unpublished
and does not contain unstaged editor text. Export is not publication or full backup
and never clears unpublished state. Fresh-auth, deterministic manifest/artifacts
and archive limits are enforced by the [paired service](L4-paired-editor-services.md).

## Verification and limits

`scripts/containers/smoke-admin-http.py` runs the production HTTP admin assets
against the installed API, PG17 and actual Nginx. It creates disposable tmpfs
containers/network and mounts a test-only identity module; the module is never
packaged and its fixture routes never exist in normal application operation.
The API binds loopback; Nginx shares that network namespace and forwards the exact
Host including its port. Signed fixture tokens exercise maintained OIDC verification,
nonce and PKCE with synthetic assurance. This does not accept a hosted provider.

Build `meducation-api:l4-step5` and a fresh `npm run build:admin` before running
`.venv/bin/python scripts/containers/smoke-admin-http.py --output /private/tmp/l4-editor-browser.json`.
Do not rebuild shared `dist` while any learner/admin browser suite is running.
The suite covers paired edits/reload/publication/activation/export, expired sessions,
uncertain commit reconciliation, stale tabs/reset, pending preview edits, canceled
step-up, successful fresh step-up with dirty text and stale-save rejection after
another tab commits, logout during save, grouped/import creates and keyboard/overflow at
390/1048/1440px. Existing JSON editor, learner progress and review browser suites
remain separate regression gates. Hosted identity/TLS/routing, durable authored
recovery, authority cutover, native CI and manual assistive-technology/device
acceptance remain later tracked obligations.

The native container CI acceptance runner now invokes this complete editor suite
against its freshly built installed API image, after learner browser acceptance
and a fresh explicitly HTTP admin build. Both architecture runners retain scoped
reports and traces; source fingerprints include the fixture module and editor
inputs. A local ARM64 run does not certify AMD64 or a final-commit GitHub run.

The [local outcome audit](work/ongoing/L4-local-outcome-audit.md) records the later
12-case installed-image suite and full-runner verification. Native CI passed for
the earlier L4 implementation at `f99a18e`; the additional case needs changed-source
CI evidence. Hosted and retained-recovery gates remain distinct.
