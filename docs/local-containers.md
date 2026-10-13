# Local production containers

L2 currently supplies the existing JSON API and a production learner/static-server
image. PostgreSQL, Compose and database tools follow in later stages of the
[implementation tracker](work/ongoing/L2-containers-local-services-plan.md).
Host-based Vite remains the routine UI development path.

## Build

A reachable Docker engine is required. From a fresh checkout at the repository root:

```sh
docker build --pull -f backend/Dockerfile -t meducation-api:l2-step2 .
docker build --pull -t meducation-learner:l2-step3 .
```

Both Dockerfiles pin multi-platform base indexes; native architecture selection
works without an AMD64 override on Apple Silicon. See [build-input pins and
maintenance](../ops/containers/README.md). The learner uses `npm ci`, typechecks,
and builds API mode with both admin flags disabled. Host `.env` files are excluded.
Its default automatic retry policy is retained. Hidden source maps and a Vite
manifest let the build audit emitted modules; these files are removed before
runtime. The audit record stays outside the public document root.

## Start a standalone preview

Create this preview network once, then start the two named containers:

```sh
docker network create meducation-preview
docker run --detach --name meducation-api-preview --network meducation-preview \
  --network-alias api --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true meducation-api:l2-step2
docker run --detach --name meducation-learner-preview --network meducation-preview \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --publish 127.0.0.1:4173:8080 meducation-learner:l2-step3
```

Open `http://127.0.0.1:4173/`. If this port is occupied, choose a different
loopback host port explicitly; the internal frontend/API ports remain 8080/8000.
The API needs no host port, database or source mount. It reads both packaged banks
and fails initialization when either bank is invalid or their subjects disagree.
Replacing content requires a reviewed rebuild/recreation of the API image.

Inspect readiness and logs:

```sh
docker inspect --format '{{.State.Health.Status}}' meducation-api-preview
docker inspect --format '{{.State.Health.Status}}' meducation-learner-preview
docker logs meducation-api-preview
docker logs meducation-learner-preview
```

Container start does not mean readiness. Both images have bounded healthchecks.
The smoke command below waits with deadlines; manual preview users can inspect
these health states and the HTTP routes. `/health/frontend` reports static-server
availability independently of the API. `/health/live` and `/health/ready` forward
to the corresponding API routes. A healthy frontend can therefore still report
an API failure. `/api` and `/api/` preserve the original prefix, query strings,
conditional headers, cache headers, error status and body.

Nginx runs as UID/GID 101. Its writable temporary paths live under `/tmp`;
the document root is read-only. HTML, branding and other stable files revalidate;
hashed `/assets/` files have immutable caching. Missing assets, admin entry and
hidden build files return 404, while extensionless learner routes can use the
learner entry. API errors never use the learner fallback. The proxy uses Docker
DNS and a shared upstream zone to recover after API address changes without
restarting the frontend; its connection/send/read timeouts are bounded. See
[Nginx upstream resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server).

Browser progress belongs to the exact origin. `localhost:5173`,
`127.0.0.1:4173` and another host port have different browser storage. Use the
[local progress backup utility](progress-backup.md) for deliberate transfer.
Stopping/rebuilding these stateless services does not itself move or erase
browser progress.

## Stop and recreate

Stop/start retains the named containers:

```sh
docker stop --time 15 meducation-learner-preview meducation-api-preview
docker start meducation-api-preview meducation-learner-preview
```

For replacement after rebuilding, stop the containers, then remove just these
preview resources and repeat the creation commands:

```sh
docker rm meducation-learner-preview meducation-api-preview
docker network rm meducation-preview
```

No volume deletion, global prune or database reset belongs to this routine.
Compose's later runbook will add explicit database backup/reset operations.

## Verify the images

After installing host npm dependencies and Chromium as described in
[testing](testing.md), run sequentially:

```sh
.venv/bin/python scripts/containers/smoke-api.py
.venv/bin/python scripts/containers/smoke-learner.py --browser
```

Both scripts use unique disposable containers. The learner smoke also creates a
unique Docker network and an allocated loopback port. It verifies shipped file
hashes, cache/error/health behavior, static availability without the API, changed-IP
DNS recovery and a synthetic upstream 503. Its optional Chromium suite runs the
existing learner workflows against read-only fixture bank mounts through the
actual shipped proxy; the successful canonical API checks use the packaged banks.
The fixtures are not baked into either runtime image. Test resources are removed
on success/failure; the built images remain available.

The dedicated Playwright config starts no Vite or host API. The smoke supplies
`MEDUCATION_CONTAINER_URL`; manual externally started fixture stacks can set it
and run `npm run test:e2e:containers`. Browser output is isolated under
`test-results-containers/`. Add `--report /absolute/path/report.json` to either
Python command to retain a successful machine report. Failures retain browser
traces and cannot produce a passing report.

Native ARM64 results do not certify native AMD64, real mobile/assistive-technology,
database or hosted behavior. L1's Firefox deferral and other release acceptance
remain in the [browser checklist](work/ongoing/L0-browser-acceptance.md).
