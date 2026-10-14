"""Postgres session locks span protected work; no RAM revocation fallback."""

import hashlib
import json
import secrets
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import AuthError, VerifiedEditorIdentity


def opaque() -> str:
    return secrets.token_urlsafe(32)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@dataclass(frozen=True)
class Principal:
    identity: VerifiedEditorIdentity
    token_hash: str
    csrf: str
    expires: float
    connection: Connection

    @property
    def actor(self) -> str:
        return json.dumps([self.identity.issuer, self.identity.subject], separators=(",", ":"))


class SessionStore:
    def __init__(
        self, engine: Engine, config: AuthSettings, *, clock: Callable[[], float] = time.time
    ):
        self.engine = engine
        self.config = config
        self.clock = clock
        self.cipher = Fernet(config.encryption_key.get_secret_value().encode())

    def rate(self, browser: str, *, connection: Connection | None = None) -> None:
        now = self.clock()
        try:
            with nullcontext(connection) if connection is not None else self.engine.begin() as c:
                c.execute(
                    text("DELETE FROM admin_auth.rate_limits WHERE window_start<:cutoff"),
                    {"cutoff": now - 120},
                )
                for bucket, limit in (("global", 30), (digest(browser), 6)):
                    count: int = c.execute(
                        text("""INSERT INTO admin_auth.rate_limits(bucket,window_start,count) VALUES(:b,:now,1)
                        ON CONFLICT(bucket) DO UPDATE SET window_start=CASE WHEN admin_auth.rate_limits.window_start<:cutoff THEN :now ELSE admin_auth.rate_limits.window_start END,
                        count=CASE WHEN admin_auth.rate_limits.window_start<:cutoff THEN 1 ELSE admin_auth.rate_limits.count+1 END RETURNING count"""),
                        {"b": bucket, "now": now, "cutoff": now - 60},
                    ).scalar_one()
                    if count > limit:
                        raise AuthError(429, "auth_rate_limit")
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None

    def begin_login(
        self, browser: str, *, session_hash: str | None = None, connection: Connection | None = None
    ) -> dict[str, str]:
        state, nonce, verifier = opaque(), opaque(), opaque()
        payload = {
            "nonce": nonce,
            "verifier": verifier,
            "session": session_hash,
            "purpose": "reauthenticate" if session_hash else "login",
        }
        try:
            with nullcontext(connection) if connection is not None else self.engine.begin() as c:
                # One advisory lock bounds global login growth across workers.
                c.execute(text("SELECT pg_advisory_xact_lock(1936024677,4)"))
                c.execute(
                    text("DELETE FROM admin_auth.logins WHERE consumed OR expires<:now"),
                    {"now": self.clock()},
                )
                if c.execute(text("SELECT count(*) FROM admin_auth.logins")).scalar_one() >= 1024:
                    raise AuthError(429, "auth_rate_limit")
                c.execute(
                    text("""INSERT INTO admin_auth.logins(state_hash,browser_hash,ciphertext,epoch,expires)
                    VALUES(:s,:b,:cipher,:epoch,:expires)"""),
                    {
                        "s": digest(state),
                        "b": digest(browser),
                        "cipher": self.cipher.encrypt(json.dumps(payload).encode()).decode(),
                        "epoch": self.config.policy_epoch,
                        "expires": self.clock() + 600,
                    },
                )
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None
        return {"state": state, "nonce": nonce, "verifier": verifier}

    def consume(self, state: str, browser: str) -> dict[str, Any]:
        try:
            with self.engine.begin() as c:
                row = c.execute(
                    text("""UPDATE admin_auth.logins SET consumed=true WHERE state_hash=:s AND browser_hash=:b
                    AND NOT consumed AND expires>:now AND epoch=:epoch RETURNING ciphertext"""),
                    {
                        "s": digest(state),
                        "b": digest(browser),
                        "now": self.clock(),
                        "epoch": self.config.policy_epoch,
                    },
                ).scalar_one_or_none()
            if row is None:
                raise AuthError(401, "login_invalid")
            # Consumption is durable before token exchange. Failure never makes a code retryable.
            value = json.loads(self.cipher.decrypt(row.encode(), ttl=600))
            if not isinstance(value, dict):
                raise TypeError
            return value
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None
        except AuthError:
            raise
        except ValueError, TypeError, InvalidToken:
            raise AuthError(401, "login_invalid") from None

    def _live(self, row: Any) -> bool:
        now = self.clock()
        return bool(
            row is not None
            and not row["revoked"]
            and row["epoch"] == self.config.policy_epoch
            and row["issuer"] == self.config.issuer
            and row["subject"] == self.config.editor_subject
            and row["assurance_policy"] == "synthetic-fresh-factor-v1"
            and row["expires"] > now
            and row["last_activity"] + 1800 > now
            and row["created"] <= now + 60
            and row["auth_time"] <= now + 60
        )

    @contextmanager
    def guard(
        self,
        token: str | None,
        *,
        csrf: str | None = None,
        write: bool = False,
        fresh: bool = False,
        interactive: bool = True,
    ) -> Iterator[Principal]:
        if not token or len(token) != 43:
            raise AuthError(401, "session_required")
        try:
            with self.engine.begin() as c:
                c.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
                c.exec_driver_sql("SET LOCAL statement_timeout = '10s'")
                row = (
                    c.execute(
                        text("SELECT * FROM admin_auth.sessions WHERE token_hash=:h FOR UPDATE"),
                        {"h": digest(token)},
                    )
                    .mappings()
                    .one_or_none()
                )
                if not self._live(row):
                    raise AuthError(401, "session_expired")
                assert row is not None
                if write and (not csrf or not secrets.compare_digest(row["csrf"].encode(), csrf.encode())):
                    raise AuthError(403, "csrf_invalid")
                if fresh and self.clock() - row["auth_time"] > 900:
                    raise AuthError(403, "fresh_auth_required")
                if interactive:
                    c.execute(
                        text(
                            "UPDATE admin_auth.sessions SET last_activity=:now WHERE token_hash=:h"
                        ),
                        {"now": self.clock(), "h": row["token_hash"]},
                    )
                identity = VerifiedEditorIdentity(
                    row["issuer"],
                    row["subject"],
                    row["provider_sid"],
                    row["auth_time"],
                    row["assurance_policy"],
                )
                yield Principal(identity, row["token_hash"], row["csrf"], row["expires"], c)
                # Content writes must commit before leaving this guard. Logout takes the
                # same lock; it cannot retroactively undo a write committed before revocation.
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None

    def issue(
        self, identity: VerifiedEditorIdentity, *, previous: str | None = None
    ) -> tuple[str, str]:
        if (
            identity.issuer != self.config.issuer
            or identity.subject != self.config.editor_subject
            or identity.assurance_policy != "synthetic-fresh-factor-v1"
            or abs(self.clock() - identity.auth_time) > 300
        ):
            raise AuthError(403, "editor_denied")
        token, csrf = opaque(), opaque()
        now = self.clock()
        try:
            with self.engine.begin() as c:
                # Serialize new-login bounds. Step-up must lock the old session after
                # exchange, so a concurrent logout prevents session replacement.
                c.execute(text("SELECT pg_advisory_xact_lock(1936024677,5)"))
                created = now
                expires = now + 28800
                if previous:
                    row = (
                        c.execute(
                            text(
                                "SELECT * FROM admin_auth.sessions WHERE token_hash=:h FOR UPDATE"
                            ),
                            {"h": previous},
                        )
                        .mappings()
                        .one_or_none()
                    )
                    if not self._live(row):
                        raise AuthError(401, "session_expired")
                    assert row is not None
                    created = row["created"]
                    expires = row["expires"]
                    c.execute(
                        text("UPDATE admin_auth.sessions SET revoked=true WHERE token_hash=:h"),
                        {"h": previous},
                    )
                c.execute(text("DELETE FROM admin_auth.sessions WHERE expires<:now"), {"now": now})
                if c.execute(text("SELECT count(*) FROM admin_auth.sessions")).scalar_one() >= 1024:
                    raise AuthError(429, "auth_rate_limit")
                c.execute(
                    text("""INSERT INTO admin_auth.sessions(token_hash,csrf,issuer,subject,provider_sid,epoch,assurance_policy,auth_time,created,last_activity,expires)
                    VALUES(:h,:csrf,:issuer,:subject,:sid,:epoch,:policy,:auth,:created,:now,:expires)"""),
                    {
                        "h": digest(token),
                        "csrf": csrf,
                        "issuer": identity.issuer,
                        "subject": identity.subject,
                        "sid": identity.provider_sid,
                        "epoch": self.config.policy_epoch,
                        "policy": identity.assurance_policy,
                        "auth": identity.auth_time,
                        "created": created,
                        "now": now,
                        "expires": expires,
                    },
                )
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None
        return token, csrf

    def revoke(self, principal: Principal) -> None:
        try:
            principal.connection.execute(
                text("UPDATE admin_auth.sessions SET revoked=true WHERE token_hash=:h"),
                {"h": principal.token_hash},
            )
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None

    def revoke_all(self) -> None:
        """Explicit emergency operator action, independent of the identity provider."""
        try:
            with self.engine.begin() as c:
                c.execute(text("UPDATE admin_auth.sessions SET revoked=true"))
                c.execute(text("DELETE FROM admin_auth.logins"))
        except SQLAlchemyError:
            raise AuthError(503, "session_unavailable") from None
