# Local admin identity and session boundary

[L4 Step 3](work/ongoing/L4-local-authoring-admin-access-plan.md#step-3--add-authenticated-sessions-and-least-privilege-access)
implements the backend portions of [ADR0004](decisions/0004-single-editor-authentication.md).
The learner remains public. Canonical JSON remains authoritative; content HTTP
operations and editor session UX are Steps 4–5 work.

## Selected libraries and assurance scope

Authlib 1.8.0 owns authorization-code/S256 PKCE, client-secret-basic exchange and
OIDC CodeIDToken checks. joserfc 1.7.5 owns RS256 verification, cryptography 50.0.2
owns RSA/Fernet primitives, and httpx2 2.13.1 supplies bounded transport. Both
Python 3.14 host installation and the native ARM64 installed-wheel image resolve
these pins. Existing runtime pins are retained in both backend lockfiles.
Follow the [Authlib HTTP/OIDC guide](https://docs.authlib.org/en/stable/oauth2/client/http/index.html)
and [joserfc JWT guide](https://jose.authlib.org/en/guide/jwt/) for intentional upgrades.
Run the negative fixtures when upgrading; never switch algorithms or trust arbitrary
JWT key URLs to accommodate a provider.

Only the **synthetic loopback adapter** is enabled for local testing. It requires
signed `amr` containing `mfa` and a test-only `synthetic_factor_time` equal to
`auth_time`. That marker has meaning only in the disposable test issuer. No
production assurance mapping is accepted, and `MEDUCATION_ADMIN_ENABLED=true`
with production mode or another adapter refuses startup. No real password/MFA
server or header identity shortcut is shipped. ZITADEL tenant claims, effective
factor policy, forced fresh factor challenge, recovery and logout acceptance
remain ADR0004 hosted gates. A provider-specific adapter cannot be enabled merely
by changing the issuer setting. Editor session UX/dirty-text acceptance remains
[Step 5 HTTP editor](L4-http-editor.md); local protocol evidence alone is not UI
or hosted acceptance.

## Runtime and private routes

`backend/src/meducation_api/auth` owns fixed configuration, OIDC validation,
private session storage and prefix-wide HTTP authorization. `create_app` installs
this boundary; defaults leave admin disabled. Initialization creates bounded
engines only, with no DB migration or identity-provider call. Session/identity
failure affects admin requests, while public learner routes ignore admin cookies.

- `GET /api/admin/session` returns only authentication/freshness/expiry status and
  a CSRF token. It never extends idle expiry. Anonymous bootstrap binds a random
  host-only HttpOnly flow cookie to a server-keyed CSRF token.
- `POST /api/admin/auth/login` accepts exactly `{}`, exact Origin/JSON and the
  anonymous CSRF header. It returns a fixed authorization URL to open; the editor
  consumes this in the HTTP editor. State, nonce and PKCE verifier use 32 random bytes.
- `GET /api/admin/auth/callback` requires one state/code and browser binding,
  consumes the login transaction before exchange, verifies signed ID-token
  purpose/issuer/sub/audience/azp/nonce/dates/assurance, then redirects to the
  configured clean `/admin.html`. Cancellation/error never upgrades an old session.
- `POST /api/admin/auth/reauthenticate` requires a live session and its CSRF token.
  Successful same-editor authentication rotates session and CSRF identifiers,
  revokes the old session and preserves the original eight-hour absolute expiry.
  It never resends a write.
- `POST /api/admin/auth/logout` requires Origin/CSRF and revokes locally before
  clearing cookies. `GET /api/admin/access` is a private status probe that does not
  count as interactive activity. Provider logout is conditional on a future
  accepted provider adapter; none is claimed by local logout.

The entire `/api/admin` prefix is protected before private routing, including
unknown content-operation paths, which return 404 after authorization. Private
operations are supplied by [Step 4 services](L4-paired-editor-services.md). Every browser POST
uses exact configured Origin, JSON, identity encoding and session-bound CSRF;
private routes have no CORS surface. Auth envelopes are limited to 8 KiB and ten
seconds. Shared PG rate limits allow six flow requests per browser and thirty
aggregate per minute, with at most 1,024 live login transactions/sessions.

Fixed discovery/token/JWKS endpoints permit no redirects, proxy environment
routing or token-selected keys. Responses are limited to 128 KiB, socket timeout
five seconds and streamed duration ten seconds; tokens are at most 16 KiB. Strict
JSON rejects duplicate fields/claims and non-finite values. Discovery must match
all configured endpoints and required code/PKCE/auth/signing capabilities. RSA
keys require 2,048–8,192 bits, with modulus/exponent byte admission before crypto
import; key sets contain at most 32 records. Cache age is
at most fifteen minutes; refreshes coalesce with a five-second interval. Unknown
keys, ambiguous keys, stale-cache outages and invalid signatures fail closed.

Private responses use no-store, no-referrer, nosniff and frame/CSP restrictions.
Nginx logs method/path without query strings; a Uvicorn access filter redacts admin
queries. Cookies, bodies, tokens and library exception details are not logged.
All redirects use configuration, never Host/forwarded headers or return-to fields.
Local testing uses `meducation-dev-admin`; production cookie code uses the
`__Host-meducation-admin` Secure/HttpOnly/Lax/Path=/ contract but remains disabled.
Local mode requires explicit local application/database mode, loopback endpoints
and a loopback ASGI server binding. Inherited local identity settings cannot enable
a default production application. The container's default all-interface API bind
therefore cannot expose the synthetic identity flow.

## Roles, locking and recovery

Run the explicit local bootstrap job **before** upgrading head
`0005_reserved_parents`. Bootstrap creates owner-managed `content` and `admin_auth`
schemas without granting application database CREATE. New `meducation_session`
and `meducation_editor` roles start NOLOGIN when their optional credentials are
absent. To enable the local experiment, supply both distinct
`MEDUCATION_POSTGRES_SESSION_PASSWORD` and `MEDUCATION_POSTGRES_EDITOR_PASSWORD`.
Repeating bootstrap for already enabled auth roles requires their credentials;
it does not silently disable those roles. API workers never bootstrap or migrate.

The session role has only necessary `admin_auth` table operations and cannot
inspect/mutate content. The editor can read the paired draft/publication views;
it cannot use trusted imports, registration, arbitrary DML, owner membership or
auth tables. [Step 4 services](L4-paired-editor-services.md) supply session-bound
controlled mutations and creation-intent checks. Reader/operator roles cannot inspect auth
tables. Backup can read both schemas for full DB recovery; content exports never
include auth records.

Postgres stores hashes of opaque session IDs, session CSRF, verified issuer/sub,
provider sid, assurance policy/time, current policy epoch and bounded timestamps.
Temporary login material is encrypted with the independent Fernet key. No access,
refresh or ID-token hint is retained. Login transactions expire after ten minutes;
sessions expire after thirty idle minutes or eight absolute hours. Session/status
polling does not keep them alive. Explicit activity prunes expired records.

`SessionStore.guard` holds a session identity `FOR KEY SHARE` lock until protected
work finishes; explicit activity commits first. Content transactions independently
lock/check the session `FOR NO KEY UPDATE` through commit, serializing against
logout/revocation. Middleware supplies the principal in `request.state.principal`.
Already committed writes remain committed. Session checks use bounded lock/query
waits; store/pool failure returns safe 503 rather than falling back to RAM/cookies.
Step-up reuses its held store connection, avoiding nested pool checkout under the
session lock. Publish/activate/reset/export require fifteen-minute freshness;
Step 4 rechecks expiry/freshness after expensive validation and inside the SQL
mutation, and derives bulk destructive saves/Undo freshness from server-computed
impact rather than a browser action label.

The external random epoch is combined with issuer/sub/client/assurance policy.
Changing allowlist/policy or epoch invalidates old sessions on every request.
`SessionStore.revoke_all()` is an explicit trusted emergency action: revoke all
sessions and clear login transactions without contacting the provider. Admin can
also be disabled through configuration and a restart of all workers.

Full backup/recovery tooling now includes both schemas and reapplies their
supported grants. Before any restored database serves admin traffic, stop/drain
old workers, change the externally configured epoch, clear login transactions and
restart all workers with the new configuration. Restoring rows is not permission
to reuse old cookies. Auth keys/epochs/role passwords remain external to content
and backup artifacts. Retained authored-content/session recovery acceptance is
still a later L4 gate; current recovery checks include schema/grant compatibility.

## Verification

```sh
npm run build:content-policy
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python scripts/containers/test-postgres-content.py --output /private/tmp/l4-auth-pg.json
.venv/bin/ruff check backend/src backend/tests scripts/containers
.venv/bin/mypy backend/src
npm run build
```

`test_auth.py` issues disposable signed tokens and injected JWKS/clock/transport
faults. Real PG tests cover role isolation, prefix-wide denial, callback/cookie
flow, idle/absolute expiry, policy/restore epoch, CSRF/Origin/content types/body
limits, rate limits, rotation, failed step-up, revocation and session-store outage.
A disposable loopback HTTP issuer checks actual code, Basic client authentication,
PKCE verifier, nonce and fixed callback redirects; it simulates factor assurance.
No hosted account is provisioned. Rebuild the API image for installed-wheel
migration/toolchain and actual-nginx policy smokes. Machine evidence and outstanding
acceptance belong in the ongoing L4 tracker.
