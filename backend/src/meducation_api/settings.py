from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MEDUCATION_",
        env_file=REPOSITORY_ROOT / "backend/.env",
        extra="ignore",
        hide_input_in_errors=True,
    )

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    content_source: Literal["postgres"] = "postgres"
    database_environment: Literal["local", "production"] = "production"
    database_url: SecretStr | None = None
    migration_database_url: SecretStr | None = None
    operator_database_url: SecretStr | None = None
    bootstrap_database_url: SecretStr | None = None
    admin_editor_database_url: SecretStr | None = None
    release: str | None = None

    @model_validator(mode="after")
    def validate_database_settings(self) -> Settings:
        from meducation_api.db.engine import database_url

        for value, role in (
            (self.database_url, "meducation_reader"),
            (self.migration_database_url, "meducation_migrator"),
            (self.operator_database_url, "meducation_operator"),
            (self.bootstrap_database_url, "meducation_bootstrap"),
            (self.admin_editor_database_url, "meducation_editor"),
        ):
            if value is not None:
                database_url(value, role=role, local=self.database_environment == "local")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
