"""Explicit local role/schema bootstrap, never a worker startup hook."""

from psycopg import Connection, Error, sql
from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.db.engine import ContentDatabaseError
from meducation_api.settings import REPOSITORY_ROOT

ROLES = ("meducation_migrator", "meducation_reader", "meducation_backup", "meducation_operator")


class RolePasswords(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MEDUCATION_POSTGRES_",
        env_file=REPOSITORY_ROOT / "backend/.env",
        extra="ignore",
        hide_input_in_errors=True,
    )
    migrator_password: SecretStr = SecretStr("")
    reader_password: SecretStr = SecretStr("")
    backup_password: SecretStr = SecretStr("")
    operator_password: SecretStr = SecretStr("")
    session_password: SecretStr | None = None
    editor_password: SecretStr | None = None

    @model_validator(mode="after")
    def validate_passwords(self) -> RolePasswords:
        values = [
            getattr(self, role.removeprefix("meducation_") + "_password").get_secret_value()
            for role in ROLES
        ]
        optional = [self.session_password, self.editor_password]
        if any(optional) and not all(optional):
            raise ValueError("Supply both session/editor passwords or neither.")
        values += [v.get_secret_value() for v in optional if v is not None]
        if any(len(value) < 16 or any(char in value for char in "\r\n\x00") for value in values):
            raise ValueError(
                "Each role requires a distinct password of at least 16 characters without control delimiters."
            )
        if len(set(values)) != len(values):
            raise ValueError("Role passwords must be distinct.")
        return self


def bootstrap(engine: Engine, passwords: RolePasswords) -> None:
    """Reconcile owned local roles in one transaction, refusing unexpected memberships."""
    if engine.url.password in (
        passwords.reader_password.get_secret_value(),
        passwords.migrator_password.get_secret_value(),
        passwords.backup_password.get_secret_value(),
        passwords.operator_password.get_secret_value(),
    ):
        raise ContentDatabaseError("Bootstrap and application role passwords must be distinct.")
    auth_roles = ("meducation_session", "meducation_editor")
    if any(
        v is not None and v.get_secret_value() == engine.url.password
        for v in (passwords.session_password, passwords.editor_password)
    ):
        raise ContentDatabaseError("Bootstrap/auth passwords must be distinct.")
    try:
        with engine.begin() as connection:
            if (
                not 170000
                <= int(connection.exec_driver_sql("SHOW server_version_num").scalar_one())
                < 180000
            ):
                raise ContentDatabaseError("Local role bootstrap requires PostgreSQL 17.")
            # Cluster-wide role operations and DB ACL changes must not race another bootstrap.
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(1936024677, 2)")
            raw = connection.connection.driver_connection
            if not isinstance(raw, Connection):
                raise ContentDatabaseError("Local bootstrap requires the Psycopg driver.")
            with raw.cursor() as cursor:
                cursor.execute("SELECT current_database()")
                db = cursor.fetchone()
                assert db is not None
                database = sql.Identifier(db[0])
                cursor.execute(
                    "SELECT member.rolname, parent.rolname FROM pg_auth_members m "
                    "JOIN pg_roles member ON member.oid = m.member "
                    "JOIN pg_roles parent ON parent.oid = m.roleid "
                    "WHERE member.rolname = ANY(%s)",
                    (list(ROLES) + list(auth_roles) + ["meducation_owner"],),
                )
                if any(
                    row != ("meducation_migrator", "meducation_owner") for row in cursor.fetchall()
                ):
                    raise ContentDatabaseError(
                        "Managed roles have unexpected memberships; inspect them before bootstrap."
                    )
                cursor.execute(
                    "SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname = ANY(%s)",
                    (list(ROLES) + list(auth_roles) + ["meducation_owner"],),
                )
                existing = dict(cursor.fetchall())
                for auth_role in auth_roles:
                    if (
                        existing.get(auth_role)
                        and getattr(passwords, auth_role.removeprefix("meducation_") + "_password")
                        is None
                    ):
                        raise ContentDatabaseError(
                            "Existing enabled auth roles require explicit session/editor credentials for bootstrap."
                        )
                for role in ("meducation_owner", *ROLES, *auth_roles):
                    name = sql.Identifier(role)
                    if role not in existing:
                        cursor.execute(sql.SQL("CREATE ROLE {}").format(name))
                    secret = getattr(
                        passwords, role.removeprefix("meducation_") + "_password", None
                    )
                    login = role != "meducation_owner" and secret is not None
                    cursor.execute(
                        sql.SQL(
                            "ALTER ROLE {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT {}"
                        ).format(name, sql.SQL("LOGIN" if login else "NOLOGIN"))
                    )
                    if login:
                        secret = getattr(passwords, role.removeprefix("meducation_") + "_password")
                        assert secret is not None
                        cursor.execute(
                            sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                                name, sql.Literal(secret.get_secret_value())
                            )
                        )
                cursor.execute(
                    "GRANT meducation_owner TO meducation_migrator WITH ADMIN FALSE, INHERIT FALSE, SET TRUE"
                )
                cursor.execute(
                    "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'content'"
                )
                owner = cursor.fetchone()
                if owner is not None and owner[0] != "meducation_owner":
                    raise ContentDatabaseError("Existing content schema has an unexpected owner.")
                cursor.execute("CREATE SCHEMA IF NOT EXISTS content AUTHORIZATION meducation_owner")
                cursor.execute(
                    "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'admin_auth'"
                )
                auth_owner = cursor.fetchone()
                if auth_owner is not None and auth_owner[0] != "meducation_owner":
                    raise ContentDatabaseError("Existing auth schema has an unexpected owner.")
                cursor.execute(
                    "CREATE SCHEMA IF NOT EXISTS admin_auth AUTHORIZATION meducation_owner"
                )
                cursor.execute("REVOKE ALL ON SCHEMA admin_auth FROM PUBLIC")
                cursor.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(database))
                for role in (*ROLES, *auth_roles):
                    cursor.execute(
                        sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                            database, sql.Identifier(role)
                        )
                    )
                cursor.execute("REVOKE ALL ON SCHEMA public FROM PUBLIC")
                cursor.execute("REVOKE ALL ON SCHEMA content FROM PUBLIC")
                cursor.execute(
                    "GRANT USAGE ON SCHEMA content TO meducation_reader, meducation_backup, meducation_operator"
                )
                # Reader grants are selective views in Step 3, not all tables by default.
                cursor.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE meducation_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"
                )
                cursor.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE meducation_owner IN SCHEMA content REVOKE ALL ON TABLES FROM PUBLIC"
                )
                cursor.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE meducation_owner IN SCHEMA content REVOKE ALL ON SEQUENCES FROM PUBLIC"
                )
                cursor.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE meducation_owner IN SCHEMA content GRANT SELECT ON TABLES TO meducation_backup"
                )
                cursor.execute(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE meducation_owner IN SCHEMA content GRANT SELECT ON SEQUENCES TO meducation_backup"
                )
                cursor.execute("GRANT SELECT ON ALL TABLES IN SCHEMA content TO meducation_backup")
                cursor.execute(
                    "GRANT SELECT ON ALL SEQUENCES IN SCHEMA content TO meducation_backup"
                )
    except SQLAlchemyError, Error:
        raise ContentDatabaseError(
            "Local role bootstrap failed; no SQL or credentials were logged."
        ) from None
