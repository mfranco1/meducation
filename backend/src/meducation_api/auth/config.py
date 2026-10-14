"""Fixed endpoints and explicit local-only synthetic assurance configuration."""

import hashlib
import json
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from meducation_api.settings import REPOSITORY_ROOT


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MEDUCATION_ADMIN_",
        env_file=REPOSITORY_ROOT / "backend/.env",
        extra="ignore",
        hide_input_in_errors=True,
    )
    enabled: bool = False
    environment: str = "production"
    adapter: str = "synthetic"
    origin: str = ""
    issuer: str = ""
    authorization_endpoint: str = ""
    token_endpoint: str = ""
    jwks_uri: str = ""
    client_id: str = ""
    client_secret: SecretStr = SecretStr("")
    editor_subject: str = ""
    epoch: str = ""
    encryption_key: SecretStr = SecretStr("")
    session_database_url: SecretStr | None = None
    editor_database_url: SecretStr | None = None

    @model_validator(mode="after")
    def safety(self) -> AuthSettings:
        if not self.enabled:
            return self
        # No provider assurance adapter has passed the ADR0004 tenant/fresh-factor gate.
        if self.environment != "local" or self.adapter != "synthetic":
            raise ValueError(
                "Production admin adapter is disabled pending provider assurance acceptance."
            )
        for value in (
            self.origin,
            self.issuer,
            self.authorization_endpoint,
            self.token_endpoint,
            self.jwks_uri,
        ):
            u = urlsplit(value)
            if (
                u.scheme not in ("http", "https")
                or u.hostname not in ("127.0.0.1", "localhost", "::1")
                or u.username
                or u.password
                or u.query
                or u.fragment
            ):
                raise ValueError(
                    "Synthetic admin identity requires fixed loopback endpoints/origin."
                )
        if self.origin.rstrip("/") != self.origin or urlsplit(self.origin).path:
            raise ValueError("Admin origin must be an exact origin without a path.")
        if (
            len(self.epoch) < 16
            or not self.client_id
            or not self.editor_subject
            or not self.client_secret.get_secret_value()
        ):
            raise ValueError("Admin identity, secret and external epoch are required.")
        Fernet(self.encryption_key.get_secret_value().encode())
        from meducation_api.db.engine import database_url

        if self.session_database_url is None or self.editor_database_url is None:
            raise ValueError("Distinct session and content-editor connections are required.")
        for credential, role in (
            (self.session_database_url, "meducation_session"),
            (self.editor_database_url, "meducation_editor"),
        ):
            database_url(credential, role=role, local=True)
        return self

    @property
    def callback(self) -> str:
        return self.origin + "/api/admin/auth/callback"

    @property
    def policy_epoch(self) -> str:
        return hashlib.sha256(
            json.dumps(
                [self.epoch, self.issuer, self.editor_subject, self.client_id, self.adapter],
                separators=(",", ":"),
            ).encode()
        ).hexdigest()

    @property
    def cookie(self) -> str:
        return "meducation-dev-admin" if self.environment == "local" else "__Host-meducation-admin"

    @property
    def secure(self) -> bool:
        return urlsplit(self.origin).scheme == "https"
