# Container build inputs

L2 Step 1 selects these inputs. Steps 2–4 add the [API Dockerfile](../../backend/Dockerfile), [learner Dockerfile](../../Dockerfile), [Compose stack](../../compose.yaml) and [container runbook](../../docs/local-containers.md). Registry metadata was checked on 2026-10-13. [Step 1 evidence](../../docs/work/ongoing/L2-step1-build-inputs-evidence.json) includes index, native child-manifest and config hashes; later steps record actual native ARM64 image/runtime checks in the [implementation tracker](../../docs/work/ongoing/L2-containers-local-services-plan.md). Native AMD64 execution remains pending.

## Image pins

Use these exact readable tags plus multi-platform index digests in the corresponding Dockerfiles/Compose configuration:

- API builder/runtime: `python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83`.
- Optional database and matching client tools: `postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826`.
- Learner build: `node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`.
- Learner static runtime: `nginxinc/nginx-unprivileged:1.30.5-trixie@sha256:8f18dedfceea3d7feb98792810c8c9925c985890ade257f2ec1b2f492b4eaebb`.

All four indexes contain Linux AMD64 and ARM64 manifests. The Nginx configs specify runtime user `101` and port `8080` on both platforms. Python and Node base images do not select a non-root user; the API Dockerfile must do so explicitly, and the Node image is a build stage only. Postgres uses its official initialization/user-switching behavior; do not override it with the API user.

Python/Postgres pins remain those selected by [ADR0003](../../docs/decisions/0003-local-postgres-toolchain.md). [Python 3.14.8](https://www.python.org/downloads/release/python-3148/) and [Postgres 17.11](https://www.postgresql.org/docs/release/17.11/) remain current patches in their selected lines at this check. [Node 22.23.3](https://nodejs.org/en/blog/release/v22.23.3) satisfies the installed Vite, ESLint, React-plugin and Vitest engine requirements; Node 22 also matches the current host CI major.

The static runtime uses Debian Trixie because the available unprivileged Bookworm tags lag behind current Nginx security fixes. Nginx 1.30.5 meets the fixed-version thresholds on the [current advisory page](https://nginx.org/en/security_advisories.html). This does not substitute for an image vulnerability scan or runtime testing. The [image maintainers](https://github.com/nginx/docker-nginx-unprivileged) publish weekly rebuilds and recommend digest pinning; a version tag alone is mutable. No requirement forces the independent frontend runtime to use the API/DB Debian release.

## Python wheel build

[requirements-build.lock](../../backend/requirements-build.lock) pins the three universal wheels used only in the builder: setuptools 84.0.0, wheel 0.48.0 and wheel's packaging dependency 26.3. It records their PyPI SHA-256 hashes. The pinned Python base supplies pip; do not run an unpinned pip upgrade.

The API builder installs these tools with `--require-hashes --only-binary=:all:`, then runs `python -m pip wheel --no-index --no-deps --no-build-isolation` against `backend`. Disabling isolation prevents `pyproject.toml`'s build-system ranges from resolving a separate environment. It downloads binary runtime dependencies from the existing lock and installs them plus the app wheel offline into `/opt/venv`, using `--no-deps` and a final `pip check`. Only that runtime environment is copied into the final image; build tooling remains in the builder. There is no editable installation.

A clean temporary Python 3.14.7 environment built and installed this app wheel locally in Step 1. Step 2 subsequently built and ran the pinned Python 3.14.8 image on native Linux ARM64, checking imports and exact installed dependencies. The app wheel contains package source and metadata; the Dockerfile separately copies both canonical banks and sets absolute paths. Native AMD64 builds remain pending.

## Context and validation boundary

The root `.dockerignore` excludes private PDF/extraction material, real `.env` files at every depth, repository/agent state, dependencies, caches, generated output, documentation and backups. Example env files remain available. Required source, manifests, locks, public assets and branding/Vite/TypeScript inputs remain. Source-test fixtures also remain because the existing TypeScript project includes tests that import them; their inclusion in the build context does not authorize copying them into the shipped runtime.

Docker's Moby pattern matcher checked 31 excluded and 26 retained representative paths in Step 1. Both Dockerfiles exercise a filtered context with explicit source copies. The API ships its installed environment, runtime lock and canonical banks. The learner ships generated assets and an artifact audit outside its document root, with no Node environment. Container browser output now has a separate ignored directory.

The learner builder explicitly enables API mode and disables both admin flags, then uses hidden source maps/manifest to inspect emitted module ownership and file hashes. The build fails for admin, QA or canonical-bank modules; inspection files are removed before runtime. Nginx's shipped configuration separates static liveness from API health, keeps API responses out of the learner fallback and uses Docker DNS for upstream recreation. The proxy smoke checks every shipped artifact hash, timeout/error/cache behavior and actual address-change recovery. Browser tests use read-only fixture mounts through the same static runtime; they do not change the production build's retry policy.

Step 1 observed older clients and an unreachable daemon. After the user's Docker repair, Step 2 observed Docker client/engine 29.8.2, Compose 5.6.0 and Buildx 0.37.2, with the `desktop-linux` context and native Linux ARM64 engine. No tool upgrades or context switches were performed by this task. Native AMD64 execution requires a native Linux runner; future CI can use separate AMD64/ARM64 runners, but no runner availability or execution is claimed here. Basic Compose profiles/healthchecks remain the planned compatibility floor until the orchestration step verifies its exact configuration.

## Updating pins

Recheck upstream patch/security notes and registry indexes before changing readable tags and index digests together. Verify the raw index/child/config hashes and both platforms, regenerate build-tool hashes when their versions change, then rerun clean native image builds and affected API/proxy/DB tooling checks. Record new evidence alongside the active tracker. Frozen L0 evidence remains historical. Never change the Postgres major by simply editing its tag over an existing volume.

## Local PG17 operational tools

The [recovery runbook](../../docs/local-containers.md#pg17-local-tools-and-recovery-rehearsal) documents `scripts/containers/postgres.py` and the isolated `smoke-postgres-tools.py` rehearsal. Tools execute inside the pinned running Postgres service with protected temporary pgpass credentials. L2 proves synthetic recovery with development bootstrap access; L3 owns least-privilege roles, migration head and bank parity. Routine Compose operations preserve the volume; destructive discard is a separate explicit command with exact name/label/reference checks.
