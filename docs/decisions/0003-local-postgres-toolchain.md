# 0003 - Local PostgreSQL and Python toolchain

Status: implemented. Hosted-provider differences stay configuration.

## Context

Content moved to PostgreSQL ([ADR 0005](0005-paired-content-releases-and-postgres-schema.md), [ADR 0006](0006-postgres-only-content.md)). The project needs reproducible local, CI and future managed environments with least-privilege credentials.

## Decision

- PostgreSQL 17 (17.11), Python 3.14 (`>=3.14,<3.15`), synchronous SQLAlchemy 2 with Psycopg 3, Alembic with packaged SQL migrations, and pip-tools lockfiles. Images are Debian Bookworm (Nginx on Trixie), pinned by tag and multi-platform index digest, with no Alpine. Host Postgres clients may be older than 17, so all `psql`, `pg_dump` and `pg_restore` use the pinned PG17 container tools.
- Roles: `meducation_bootstrap` (local only), NOLOGIN `meducation_owner`, `meducation_migrator` (SET ROLE to the owner), `meducation_reader`, `meducation_operator`, `meducation_backup` (read-only, for dumps), and `meducation_session` and `meducation_editor` for authoring. No credential falls back to a more privileged one. Passwords live in ignored env files and are never passed on command lines.
- Migrations, role bootstrap, imports and activation are explicit jobs run with direct unpooled connections, never at worker startup. Startup checks schema head and publication once; liveness and readiness do not query Postgres; an explicit authenticated diagnostic may.
- Runtime uses small per-process pools (two connections each for reader, session and editor, no overflow) with request-driven pre-ping and no keepalive SQL. Local non-TLS needs `MEDUCATION_DATABASE_ENVIRONMENT=local` and a loopback or Compose host; hosted configuration requires `sslmode=verify-full`.
- Backups are custom-format `pg_dump --no-owner --no-acl`; restore creates a fresh database, reapplies ownership and grants, and is verified by exact content, sequence and privilege parity.
- The database port is unpublished by default; an override binds `127.0.0.1:5433`. A Compose volume is persistence, not backup. The Postgres major is never changed over an existing volume.

## Consequences

Managed Postgres may use transaction pooling for runtime connections, but pooled endpoints must be tested for session settings and prepared statements; jobs stay direct. Local restart tests do not prove hosted suspend, wake, TLS trust, capacity or retention. No provider-specific extension or API is used. Operations: [operations](../operations.md).
