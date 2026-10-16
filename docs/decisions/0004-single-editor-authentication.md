# 0004 - Single-editor authentication and private admin sessions

Status: contract implemented for a synthetic loopback issuer. A hosted identity provider has not been selected or accepted; production configuration with admin enabled refuses to start.

## Context

One trusted editor must be able to change authoritative content. Hidden navigation and build flags are not authorization.

## Decision

The backend is the OIDC client. Admin UI and `/api/admin/*` share one origin; the server authorizes every private read and write, while public learner routes ignore admin cookies.

- Identity is the exact configured `(issuer, subject)` pair, never an email, domain or generic role. No registration, auto-provisioning or first-login privilege.
- Login uses authorization code with S256 PKCE, `prompt=login`, `max_age=0`, scope `openid`, no refresh grants and a confidential client (`client_secret_basic`). Login transactions are single-use, expire after 10 minutes, and bind to the browser with a host-only cookie.
- ID tokens must pass: exact issuer, audience (and `azp` when present), `sub`, `exp`, `iat`, `nonce`, `auth_time` within clock skew and 5 minutes of age, RS256 with an RSA key of 2,048 to 8,192 bits, and an `amr` containing `mfa` with a fresh factor. Keys come only from the configured discovery and JWKS endpoints (no redirects, no `jku`), are cached up to 15 minutes, and unknown keys, outages and bad signatures fail closed. Libraries (Authlib, joserfc) do the protocol work.
- Sessions are opaque 32-byte identifiers, stored hashed in the `admin_auth` schema with issuer, subject, assurance, policy epoch and expiry, via a least-privilege session role. Expiry is 30 idle minutes and 8 absolute hours; polling does not extend it. The production cookie is `__Host-meducation-admin` (Secure, HttpOnly, Lax); local development uses a separate name. Session store failure returns 503, never a stateless fallback.
- Publish, activate, reset, export and large destructive saves need a factor within 15 minutes. Reauthentication must return the same subject, rotates session and CSRF identifiers, keeps the original absolute expiry, and never resends a pending write.
- Every POST requires the exact Origin, JSON, identity encoding and a session-bound CSRF header; there is no CORS on private routes. Private responses are `no-store`; tokens, cookies and codes are never logged; redirects come from configuration only. Request, rate and resource limits bound all auth endpoints.
- Changing the allowlist, policy or the externally held epoch invalidates sessions on the next request. `revoke_all()` and disabling admin are emergency controls. After a database restore, rotate the epoch and clear login transactions before serving admin traffic.
- The editor keeps unsaved text on expiry and blocks further requests until sign-in.

## Consequences

A real provider adapter needs its own acceptance: invited subject only, registration disabled, enforced MFA mapped to `amr`, a forced fresh-factor challenge for step-up, logout and recovery, over HTTPS with real cookie and redirect behavior. Provider choice remains open. Local runs use a signed synthetic issuer that simulates assurance and provides no real MFA. Operations: [operations](../operations.md#editor-login-and-sessions).
