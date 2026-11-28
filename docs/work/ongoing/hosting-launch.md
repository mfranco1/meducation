# Hosting launch

Preparation runs alongside content work. Scope rules are in [AGENTS.md](../../../AGENTS.md): managed services, a few hundred anonymous learners, a single editor.

## Current state

- The editor runs on the local authority database ([operations](../../operations.md#local-authority-maintainer-machine)). Its dumps stay on that machine.
- Admin auth is the backend's own OIDC flow ([operations](../../operations.md#editor-login-and-sessions)). Only the synthetic loopback issuer exists; production configuration with admin enabled refuses to start.
- The security pass for a learner-only launch is done, with a platform checklist in [operations](../../operations.md#production-security).
- CI builds the learner image and checks it, but pushes no image and deploys nothing.
- The domain is `meducation-app.com`, served at `https://meducation-app.com` (`brand.url`, which sets `og:url`). Keep it: progress is in localStorage, which is bound to the origin, so a later change strands it unless learners export and restore. Learner contact is `support@meducation-app.com` and general, privacy and rights contact is `contact@meducation-app.com`, both alongside the Telegram account.
- A new hosted database is initialized by `pg_restore` of an authority dump, then `restore-permissions`, `invalidate-restored-sessions` and `advance-id-sequences` ([operations](../../operations.md#backup-and-restore)).

## Decisions needed

1. **Content path after launch.** Recommended: launch learner-only with admin disabled. The authority stays local, and each publish is promoted to the hosted database by dump and restore. Hosted admin (see the last section) then does not block launch. The alternative is hosted admin first, which makes the hosted database the authority.
2. **App host.** It must run the two containers (Nginx frontend, API) with the API private, give one HTTPS origin, a secret store, logs with 7 to 14 days of retention, edge rate limiting and a region near the Philippines. `ops/containers/nginx.conf` reaches the API through Docker DNS (`resolver 127.0.0.11`, `api:8000`); a host without Compose-style networking needs that changed.
3. **Managed Postgres.** Neon is provisional. Confirm point-in-time recovery retention, region, budget alerts and the Postgres major.
4. **Uptime check service and where alerts go** (email or Telegram).
5. **Offsite location for authority dumps** (encrypted copies off the maintainer machine).

## Prepare now

Needs no decision above.

- [ ] Shortlist hosts and Postgres providers against decisions 2 and 3, with monthly cost.
- [ ] Scan git history for secrets once (for example `gitleaks`), and turn on GitHub Dependabot alerts.
- [ ] Draw the `og:image` share image.
- [ ] Publish or discard staged draft work before the launch dump is taken (the source cleanup is staged, unpublished).

## After the decisions

- [ ] Postgres major: local is 17. If the provider is newer, bump the version guards in `repositories/postgres.py` and `db/bootstrap.py`, the image pins (the PG18 image changes its volume path) and PG17 mentions in docs, then move the authority by dump and restore.
- [ ] Adapt the Nginx upstream to the host's private networking if needed.
- [ ] Deploy path: build and push the API and learner images tagged with the commit SHA, set `MEDUCATION_RELEASE`, run `meducation-db upgrade` as a release step with migrator credentials (it never runs at API startup), then roll the services. Use the host's own config file and deploy integration; no Terraform.
- [ ] Rollback: redeploy the previous image for code; `activate` a retained release for content. Write both into operations.
- [ ] Content promotion procedure (if decision 1 is the recommended path): write it into operations and rehearse it once, including what learners see during the switch.
- [ ] Offsite copy of `backup.py` dumps.
- [ ] Set `og:image` in `index.html`, and `MEDUCATION_ALLOWED_ORIGINS=https://meducation-app.com` in the host's secret store.
- [ ] Point DNS at the host, with `www` redirecting to the apex.
- [ ] Cookieless visitor analytics (unique visitors per hour and day, no consent banner): Cloudflare Web Analytics if the host is behind Cloudflare, otherwise Umami Cloud's free tier. Add the script tag to `index.html`, its origins to `script-src` and `connect-src` in `ops/containers/security-headers.conf`, and a sentence to the Privacy notice. Not Google Analytics: it needs cookie consent and ad blockers block it.

## Launch

- [ ] Rerun `npm audit --omit=dev` and `pip-audit -r backend/requirements.lock`, and move pinned images to their latest patch tags.
- [ ] Restore the authority dump into the hosted database and deploy.
- [ ] Walk the platform checklist in [operations](../../operations.md#production-security).
- [ ] Configure log retention, the uptime check on `/health/ready` and the alert on `level=error` ([logs](../../operations.md#logs-and-alerts)).
- [ ] Deployed smoke test and real-device browser checks.
- [ ] Update operations: it still says no hosted setup exists.

## Hosted admin (only if decision 1 goes the other way, or later)

Needed to edit from another machine or add editors. Either way it needs its own security pass and manual acceptance of the editor over HTTPS.

- Option A: keep the backend OIDC flow and point it at a managed IdP (ZITADEL was the provisional candidate). Acceptance: invited subject only, registration disabled, enforced MFA mapped to `amr`, forced step-up, logout and recovery.
- Option B: put `/api/admin` and `/admin.html` behind the host's auth proxy, then remove whatever backend session, CSRF and fresh-factor code the proxy makes redundant.
- Prefer the option with less code we own, as long as it keeps MFA, CSRF/Origin protection and per-editor identity.
