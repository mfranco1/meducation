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

    bank_path: Path = REPOSITORY_ROOT / "src/content/questionBank.generated.json"
    flashcard_bank_path: Path = REPOSITORY_ROOT / "src/content/flashcardBank.generated.json"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    content_source: Literal["json", "postgres"] = "json"
    database_environment: Literal["local", "production"] = "production"
    database_url: SecretStr | None = None
    migration_database_url: SecretStr | None = None
    bootstrap_database_url: SecretStr | None = None

    @model_validator(mode="after")
    def validate_database_settings(self) -> Settings:
        from meducation_api.db.engine import database_url

        for value, role in (
            (self.database_url, "meducation_reader"),
            (self.migration_database_url, "meducation_migrator"),
            (self.bootstrap_database_url, "meducation_bootstrap"),
        ):
            if value is not None:
                database_url(value, role=role, local=self.database_environment == "local")
        if self.content_source == "postgres" and self.database_url is None:
            raise ValueError("Postgres content mode requires MEDUCATION_DATABASE_URL.")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
